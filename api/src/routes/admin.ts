import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { requireAdmin } from "../middleware/context";
import { readJson } from "./auth";
import { uuid, nowIso } from "../lib/ids";
import { audit } from "../lib/audit";
import { notFound } from "../lib/errors";

/**
 * Admin portal API.
 *
 * Least-privilege by design: admins manage resources, review aggregate
 * statistics, scam reports and audit logs. There is NO endpoint that returns
 * user vault contents (assets, evidence, recovery packages) — private user
 * data is structurally unreachable from admin handlers.
 */
export const adminRoutes = new Hono<AppEnv>();
adminRoutes.use("*", requireAdmin);

adminRoutes.get("/overview", async (c) => {
  const users = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM users").first<{ n: number }>();
  const activeUsers = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM users WHERE status = 'active'",
  ).first<{ n: number }>();
  const assets = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM digital_assets").first<{ n: number }>();
  const imports = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n, SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed FROM imports",
  ).first<{ n: number; failed: number | null }>();
  const openCases = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM recovery_cases WHERE status NOT IN ('resolved','closed')",
  ).first<{ n: number }>();
  const scamReports = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM scam_reports").first<{ n: number }>();
  const security24h = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM security_events WHERE at > datetime('now', '-1 day')",
  ).first<{ n: number }>();
  return c.json({
    users: { total: users?.n ?? 0, active: activeUsers?.n ?? 0 },
    assets: assets?.n ?? 0,
    imports: { total: imports?.n ?? 0, failed: imports?.failed ?? 0 },
    openCases: openCases?.n ?? 0,
    scamReports: scamReports?.n ?? 0,
    securityEvents24h: security24h?.n ?? 0,
  });
});

adminRoutes.get("/users", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.role, u.status, u.email_verified_at, u.created_at,
            (SELECT COUNT(*) FROM digital_assets a WHERE a.user_id = u.id) AS assets,
            (SELECT COUNT(*) FROM recovery_cases r WHERE r.user_id = u.id) AS cases
     FROM users u ORDER BY u.created_at DESC LIMIT 200`,
  ).all<any>();
  return c.json({
    users: rows.results.map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role,
      status: r.status,
      emailVerified: !!r.email_verified_at,
      createdAt: r.created_at,
      assetCount: r.assets,
      caseCount: r.cases,
    })),
  });
});

// ------------------------------------------------------------- resources

adminRoutes.get("/resources", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT id, platform, title, url, purpose, region, status, last_verified_at, notes, updated_at
     FROM platform_resources ORDER BY platform, title LIMIT 500`,
  ).all<any>();
  return c.json({
    resources: rows.results.map((r) => ({
      id: r.id,
      platform: r.platform,
      title: r.title,
      url: r.url,
      purpose: r.purpose,
      region: r.region,
      status: r.status,
      lastVerifiedAt: r.last_verified_at,
      notes: r.notes,
      updatedAt: r.updated_at,
    })),
  });
});

const resourceSchema = z.object({
  platform: z.string().min(2).max(40),
  title: z.string().min(2).max(200),
  url: z.string().url().max(600),
  purpose: z.string().min(2).max(500),
  region: z.string().max(80).default("global"),
  notes: z.string().max(1000).optional(),
});

adminRoutes.post("/resources", async (c) => {
  const body = await readJson(c, resourceSchema);
  const id = uuid();
  const now = nowIso();
  await c.env.DB.prepare(
    `INSERT INTO platform_resources (id, platform, title, url, purpose, region, status, last_verified_at, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'verified', ?, ?, ?, ?)`,
  )
    .bind(id, body.platform, body.title, body.url, body.purpose, body.region, now, body.notes ?? null, now, now)
    .run();
  await audit(c.env.DB, "ADMIN_RESOURCE_UPDATED", {
    actorUserId: c.get("userId"),
    targetType: "platform_resource",
    targetId: id,
    details: { action: "created" },
  });
  return c.json({ ok: true, id }, 201);
});

adminRoutes.patch("/resources/:id", async (c) => {
  const id = c.req.param("id");
  const body = await readJson(
    c,
    z.object({
      title: z.string().min(2).max(200).optional(),
      url: z.string().url().max(600).optional(),
      purpose: z.string().min(2).max(500).optional(),
      status: z.enum(["verified", "unverified", "retired"]).optional(),
      notes: z.string().max(1000).optional(),
      reverify: z.boolean().optional(),
    }),
  );
  const existing = await c.env.DB.prepare("SELECT id FROM platform_resources WHERE id = ?")
    .bind(id)
    .first();
  if (!existing) throw notFound("Resource not found.");
  await c.env.DB.prepare(
    `UPDATE platform_resources SET
       title = COALESCE(?, title), url = COALESCE(?, url), purpose = COALESCE(?, purpose),
       status = COALESCE(?, status), notes = COALESCE(?, notes),
       last_verified_at = CASE WHEN ? = 1 THEN ? ELSE last_verified_at END,
       updated_at = ?
     WHERE id = ?`,
  )
    .bind(
      body.title ?? null,
      body.url ?? null,
      body.purpose ?? null,
      body.status ?? null,
      body.notes ?? null,
      body.reverify ? 1 : 0,
      nowIso(),
      nowIso(),
      id,
    )
    .run();
  await audit(c.env.DB, "ADMIN_RESOURCE_UPDATED", {
    actorUserId: c.get("userId"),
    targetType: "platform_resource",
    targetId: id,
    details: { action: "updated", status: body.status ?? "unchanged" },
  });
  return c.json({ ok: true });
});

// -------------------------------------------------------------- reports

adminRoutes.get("/scam-reports", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT id, channel, message_excerpt, indicators, reporter_notes, created_at
     FROM scam_reports ORDER BY created_at DESC LIMIT 200`,
  ).all<any>();
  return c.json({
    reports: rows.results.map((r) => ({
      id: r.id,
      channel: r.channel,
      messageExcerpt: r.message_excerpt,
      indicators: JSON.parse(r.indicators ?? "[]"),
      notes: r.reporter_notes,
      createdAt: r.created_at,
    })),
  });
});

adminRoutes.get("/audit-logs", async (c) => {
  const action = c.req.query("action");
  const rows = action
    ? await c.env.DB.prepare(
        `SELECT id, actor_user_id, action, target_type, target_id, at FROM audit_logs
         WHERE action = ? ORDER BY at DESC LIMIT 200`,
      )
        .bind(action)
        .all<any>()
    : await c.env.DB.prepare(
        `SELECT id, actor_user_id, action, target_type, target_id, at FROM audit_logs
         ORDER BY at DESC LIMIT 200`,
      ).all<any>();
  await audit(c.env.DB, "ADMIN_VIEWED_AUDIT_LOG", {
    actorUserId: c.get("userId"),
    details: { filter: action ?? "none" },
  });
  return c.json({
    logs: rows.results.map((r) => ({
      id: r.id,
      actorUserId: r.actor_user_id,
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id,
      at: r.at,
    })),
  });
});

// ----------------------------------------------------- privacy requests

adminRoutes.get("/privacy-requests", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT p.id, p.user_id, p.kind, p.status, p.created_at, p.completed_at, u.email
     FROM privacy_requests p JOIN users u ON u.id = p.user_id
     ORDER BY p.created_at DESC LIMIT 200`,
  ).all<any>();
  return c.json({
    requests: rows.results.map((r) => ({
      id: r.id,
      userId: r.user_id,
      email: r.email,
      kind: r.kind,
      status: r.status,
      createdAt: r.created_at,
      completedAt: r.completed_at,
    })),
  });
});

adminRoutes.post("/privacy-requests/:id/complete", async (c) => {
  const id = c.req.param("id");
  const req = await c.env.DB.prepare("SELECT id, user_id, kind, status FROM privacy_requests WHERE id = ?")
    .bind(id)
    .first<{ id: string; user_id: string; kind: string; status: string }>();
  if (!req) throw notFound("Request not found.");
  if (req.kind === "deletion") {
    // Full account deletion: user-owned rows cascade via FK; storage cleanup
    // follows. Audit rows are append-only and retained.
    const keys = await c.env.DB.prepare("SELECT storage_key FROM evidence_items WHERE user_id = ?")
      .bind(req.user_id)
      .all<{ storage_key: string }>();
    await c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(req.user_id).run();
    for (const k of keys.results) await c.env.FILES.delete(k.storage_key);
  } else {
    await c.env.DB.prepare(
      "UPDATE privacy_requests SET status = 'completed', completed_at = ? WHERE id = ?",
    )
      .bind(nowIso(), id)
      .run();
  }
  await audit(c.env.DB, req.kind === "deletion" ? "ACCOUNT_DELETED" : "PRIVACY_DELETION_REQUESTED", {
    actorUserId: c.get("userId"),
    targetType: "privacy_request",
    targetId: id,
    details: { completed: true },
  });
  return c.json({ ok: true });
});
