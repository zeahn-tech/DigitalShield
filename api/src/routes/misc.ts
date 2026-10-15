import { Hono } from "hono";
import type { AppEnv } from "../env";
import { requireAuth } from "../middleware/context";
import { computeReadiness } from "../lib/readiness";
import { PLATFORMS } from "../lib/platforms";
import { nowIso } from "../lib/ids";
import type { Notification } from "../../../shared/types";

export const miscRoutes = new Hono<AppEnv>();

// ------------------------------------------------------------------ health

miscRoutes.get("/health", (c) =>
  c.json({ ok: true, service: "digitalshield-api", time: nowIso() }),
);

// ---------------------------------------------------------------- platforms

miscRoutes.get("/platforms", (c) => c.json({ platforms: PLATFORMS }));

// ---------------------------------------------------------------- dashboard

miscRoutes.get("/dashboard", requireAuth, async (c) => {
  const userId = c.get("userId");
  const db = c.env.DB;

  const accounts = await db
    .prepare(
      `SELECT platform, username, profile_url, recovery_email, recovery_phone_enc
       FROM platform_accounts WHERE user_id = ?`,
    )
    .bind(userId)
    .all<{ platform: string; username: string | null; profile_url: string | null; recovery_email: string | null; recovery_phone_enc: string | null }>();

  const kindCounts = await db
    .prepare("SELECT kind, COUNT(*) AS n FROM digital_assets WHERE user_id = ? GROUP BY kind")
    .bind(userId)
    .all<{ kind: string; n: number }>();
  const counts = Object.fromEntries(kindCounts.results.map((r) => [r.kind, r.n]));
  const photoCount = counts["photo"] ?? 0;
  const videoCount = counts["video"] ?? 0;
  const documentCount = counts["document"] ?? 0;
  const importantCount =
    (
      await db
        .prepare("SELECT COUNT(*) AS n FROM digital_assets WHERE user_id = ? AND is_important = 1")
        .bind(userId)
        .first<{ n: number }>()
    )?.n ?? 0;

  const evidenceCount =
    (
      await db
        .prepare("SELECT COUNT(*) AS n FROM evidence_items WHERE user_id = ?")
        .bind(userId)
        .first<{ n: number }>()
    )?.n ?? 0;
  const caseCount =
    (
      await db
        .prepare("SELECT COUNT(*) AS n FROM recovery_cases WHERE user_id = ?")
        .bind(userId)
        .first<{ n: number }>()
    )?.n ?? 0;
  const lastImport = await db
    .prepare("SELECT MAX(finished_at) AS last FROM imports WHERE user_id = ? AND status LIKE 'completed%'")
    .bind(userId)
    .first<{ last: string | null }>();

  const hasIdentity = accounts.results.some(
    (a) => !!a.recovery_email || !!a.recovery_phone_enc,
  );
  const hasProfile = accounts.results.some((a) => !!a.username || !!a.profile_url);

  const openCases = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM recovery_cases WHERE user_id = ? AND status NOT IN ('resolved','closed')`,
    )
    .bind(userId)
    .first<{ n: number }>();

  const readiness = computeReadiness(
    {
      hasIdentity,
      hasProfile,
      photoCount,
      videoCount,
      documentCount,
      importantCount,
      evidenceCount,
      hasCase: caseCount > 0,
      lastImportAt: lastImport?.last ?? null,
    },
    (openCases?.n ?? 0) > 0,
  );

  const recentSecurity = await db
    .prepare(
      `SELECT kind, at FROM security_events WHERE user_id = ? AND kind IN ('login_failed','password_changed')
       ORDER BY at DESC LIMIT 5`,
    )
    .bind(userId)
    .all<{ kind: string; at: string }>();

  const recentActivity = await db
    .prepare(
      `SELECT action, at FROM audit_logs WHERE actor_user_id = ?
       ORDER BY at DESC LIMIT 10`,
    )
    .bind(userId)
    .all<{ action: string; at: string }>();

  const unreadNotifications =
    (
      await db
        .prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL")
        .bind(userId)
        .first<{ n: number }>()
    )?.n ?? 0;

  // Recommended actions derived from unsatisfied checklist items.
  const recommended = readiness.checklist
    .filter((i) => !i.satisfied)
    .map((i) => ({ id: i.id, label: i.label, detail: i.detail }));

  return c.json({
    readiness,
    counts,
    totals: {
      assets:
        Object.values(counts).reduce((a, b) => a + b, 0),
      important: importantCount,
      cases: caseCount,
      openCases: openCases?.n ?? 0,
      evidence: evidenceCount,
      platforms: accounts.results.length,
    },
    lastImportAt: lastImport?.last ?? null,
    recentSecurity: recentSecurity.results,
    recentActivity: recentActivity.results,
    unreadNotifications,
    recommendedActions: recommended,
  });
});

// ----------------------------------------------------------- notifications

miscRoutes.get("/notifications", requireAuth, async (c) => {
  const userId = c.get("userId");
  const rows = await c.env.DB.prepare(
    `SELECT id, kind, title, body, link, read_at, created_at FROM notifications
     WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
  )
    .bind(userId)
    .all<any>();
  const notifications: Notification[] = rows.results.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    link: r.link,
    readAt: r.read_at,
    createdAt: r.created_at,
  }));
  return c.json({ notifications });
});

miscRoutes.post("/notifications/:id/read", requireAuth, async (c) => {
  const userId = c.get("userId");
  await c.env.DB.prepare("UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?")
    .bind(nowIso(), c.req.param("id"), userId)
    .run();
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- settings

miscRoutes.get("/me", requireAuth, async (c) => {
  const userId = c.get("userId");
  const row = await c.env.DB.prepare(
    "SELECT id, email, role, email_verified_at, mfa_enabled, created_at FROM users WHERE id = ?",
  )
    .bind(userId)
    .first<any>();
  return c.json({
    user: {
      id: row?.id,
      email: row?.email,
      role: row?.role,
      emailVerified: !!row?.email_verified_at,
      mfaEnabled: row?.mfa_enabled === 1,
      createdAt: row?.created_at,
    },
  });
});

miscRoutes.post("/mfa/setup", requireAuth, async (c) => {
  // Architecture placeholder: TOTP enrollment requires an authenticator
  // secret display + verification step. Honest no-op until implemented.
  return c.json(
    {
      ok: false,
      code: "not_implemented",
      message:
        "Multi-factor authentication enrollment is not available in this build. The schema and session layer already support it (users.mfa_enabled).",
    },
    501,
  );
});

export {}; // module has no named exports; routes are mounted from index.ts
