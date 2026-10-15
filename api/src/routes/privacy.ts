import { Hono } from "hono";
import type { AppEnv } from "../env";
import { requireAuth } from "../middleware/context";
import { uuid, nowIso } from "../lib/ids";
import { audit } from "../lib/audit";
import { decryptField } from "../lib/crypto";

/**
 * Privacy & Data: storage summary, full data export, account deletion request.
 */
export const privacyRoutes = new Hono<AppEnv>();
privacyRoutes.use("*", requireAuth);

privacyRoutes.get("/summary", async (c) => {
  const userId = c.get("userId");
  const assets = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n, COALESCE(SUM(size_bytes), 0) AS bytes FROM digital_assets WHERE user_id = ?`,
  )
    .bind(userId)
    .first<{ n: number; bytes: number }>();
  const imports = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM imports WHERE user_id = ?")
    .bind(userId)
    .first<{ n: number }>();
  const platforms = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM platform_accounts WHERE user_id = ?",
  )
    .bind(userId)
    .first<{ n: number }>();
  const cases = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM recovery_cases WHERE user_id = ?")
    .bind(userId)
    .first<{ n: number }>();
  const evidence = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM evidence_items WHERE user_id = ?")
    .bind(userId)
    .first<{ n: number }>();
  const user = await c.env.DB.prepare("SELECT status FROM users WHERE id = ?")
    .bind(userId)
    .first<{ status: string }>();
  return c.json({
    stored: {
      assets: assets?.n ?? 0,
      assetBytes: assets?.bytes ?? 0,
      imports: imports?.n ?? 0,
      platformAccounts: platforms?.n ?? 0,
      recoveryCases: cases?.n ?? 0,
      evidenceItems: evidence?.n ?? 0,
    },
    accountStatus: user?.status ?? "active",
  });
});

privacyRoutes.get("/export", async (c) => {
  const userId = c.get("userId");
  const master = c.env.ENCRYPTION_MASTER_KEY;
  const user = await c.env.DB.prepare(
    "SELECT id, email, role, email_verified_at, mfa_enabled, status, created_at FROM users WHERE id = ?",
  )
    .bind(userId)
    .first<any>();
  const platformAccounts = await c.env.DB.prepare(
    `SELECT id, platform, username, display_name, profile_url, account_id, recovery_email, recovery_phone_enc, created_at
     FROM platform_accounts WHERE user_id = ?`,
  )
    .bind(userId)
    .all<any>();
  const assets = await c.env.DB.prepare(
    `SELECT id, kind, title, description, platform, source, original_filename, content_hash, mime, size_bytes, taken_at, is_important, created_at
     FROM digital_assets WHERE user_id = ? LIMIT 20000`,
  )
    .bind(userId)
    .all<any>();
  const imports = await c.env.DB.prepare(
    `SELECT id, platform, status, original_filename, format, files_total, assets_created, started_at, finished_at
     FROM imports WHERE user_id = ?`,
  )
    .bind(userId)
    .all<any>();
  const cases = await c.env.DB.prepare(
    `SELECT * FROM recovery_cases WHERE user_id = ?`,
  )
    .bind(userId)
    .all<any>();
  const evidence = await c.env.DB.prepare(
    `SELECT id, case_id, original_filename, sha256, mime, size_bytes, source, description, uploaded_at
     FROM evidence_items WHERE user_id = ?`,
  )
    .bind(userId)
    .all<any>();
  const events = await c.env.DB.prepare(
    `SELECT e.id, e.case_id, e.at, e.kind, e.actor, e.title, e.body FROM recovery_events e
     JOIN recovery_cases c ON c.id = e.case_id WHERE c.user_id = ?`,
  )
    .bind(userId)
    .all<any>();
  const notifications = await c.env.DB.prepare(
    `SELECT id, kind, title, body, link, read_at, created_at FROM notifications WHERE user_id = ?`,
  )
    .bind(userId)
    .all<any>();
  const auditRows = await c.env.DB.prepare(
    `SELECT action, target_type, target_id, at FROM audit_logs WHERE actor_user_id = ? ORDER BY at DESC LIMIT 1000`,
  )
    .bind(userId)
    .all<any>();

  await audit(c.env.DB, "PRIVACY_EXPORT_REQUESTED", { actorUserId: userId });
  await c.env.DB.prepare(
    `INSERT INTO privacy_requests (id, user_id, kind, status, created_at, completed_at) VALUES (?, ?, 'export', 'completed', ?, ?)`,
  )
    .bind(uuid(), userId, nowIso(), nowIso())
    .run();

  // Decrypted sensitive fields included: this is the user's own data export.
  const decryptedAccounts = await Promise.all(
    platformAccounts.results.map(async (a) => ({
      ...a,
      recovery_phone_enc: undefined,
      recovery_phone: await decryptField(master, a.id, a.recovery_phone_enc ?? ""),
    })),
  );

  return c.json({
    exportedAt: nowIso(),
    product: "DigitalShield",
    notice:
      "This file contains all information DigitalShield stores about you, excluding file contents (listed by hash). Keep it secure.",
    user: { ...user, password_hash: undefined },
    platformAccounts: decryptedAccounts,
    digitalAssets: assets.results,
    imports: imports.results,
    recoveryCases: cases.results,
    evidenceItems: evidence.results,
    recoveryEvents: events.results,
    notifications: notifications.results,
    auditTrail: auditRows.results,
  });
});

privacyRoutes.post("/deletion-request", async (c) => {
  const userId = c.get("userId");
  const existing = await c.env.DB.prepare(
    `SELECT id FROM privacy_requests WHERE user_id = ? AND kind = 'deletion' AND status IN ('requested','processing') LIMIT 1`,
  )
    .bind(userId)
    .first();
  if (existing) {
    return c.json({ ok: true, message: "A deletion request is already in progress.", requestId: existing.id });
  }
  const id = uuid();
  await c.env.DB.prepare(
    `INSERT INTO privacy_requests (id, user_id, kind, status, created_at) VALUES (?, ?, 'deletion', 'requested', ?)`,
  )
    .bind(id, userId, nowIso())
    .run();
  await audit(c.env.DB, "PRIVACY_DELETION_REQUESTED", { actorUserId: userId, targetType: "privacy_request", targetId: id });
  return c.json(
    {
      ok: true,
      requestId: id,
      message:
        "Deletion request received. Account deletion removes your vault items, imports, cases and evidence after an administrator processes the request. You will remain signed in until deletion is complete.",
    },
    201,
  );
});

privacyRoutes.get("/requests", async (c) => {
  const userId = c.get("userId");
  const rows = await c.env.DB.prepare(
    "SELECT id, kind, status, created_at, completed_at FROM privacy_requests WHERE user_id = ? ORDER BY created_at DESC",
  )
    .bind(userId)
    .all<any>();
  return c.json({
    requests: rows.results.map((r) => ({
      id: r.id,
      kind: r.kind,
      status: r.status,
      createdAt: r.created_at,
      completedAt: r.completed_at,
    })),
  });
});
