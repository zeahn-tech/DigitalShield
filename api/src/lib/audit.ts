/** Append-only audit + security event logging. */
import type { Env } from "../env";
import { uuid, nowIso } from "./ids";
import { sha256Hex } from "./crypto";
import { redact, logWarn } from "./logger";

export const AUDIT_ACTIONS = [
  "USER_REGISTERED",
  "USER_LOGIN",
  "USER_LOGIN_FAILED",
  "USER_LOCKED",
  "EMAIL_VERIFIED",
  "PASSWORD_CHANGED",
  "PASSWORD_RESET_REQUESTED",
  "SESSION_REVOKED",
  "ASSET_UPLOADED",
  "ASSET_DELETED",
  "IMPORT_STARTED",
  "IMPORT_COMPLETED",
  "IMPORT_FAILED",
  "RECOVERY_CASE_CREATED",
  "RECOVERY_CASE_STATUS_CHANGED",
  "EVIDENCE_ADDED",
  "RECOVERY_PACKAGE_GENERATED",
  "SECURITY_ALERT_CREATED",
  "SCAM_REPORTED",
  "PRIVACY_EXPORT_REQUESTED",
  "PRIVACY_DELETION_REQUESTED",
  "ADMIN_RESOURCE_UPDATED",
  "ADMIN_VIEWED_AUDIT_LOG",
  "ACCOUNT_DELETED",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export async function audit(
  db: D1Database,
  action: AuditAction,
  opts: {
    actorUserId?: string | null;
    targetType?: string;
    targetId?: string;
    ipHash?: string | null;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO audit_logs (id, actor_user_id, action, target_type, target_id, ip_hash, details, at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        uuid(),
        opts.actorUserId ?? null,
        action,
        opts.targetType ?? null,
        opts.targetId ?? null,
        opts.ipHash ?? null,
        JSON.stringify(redact(opts.details ?? {})),
        nowIso(),
      )
      .run();
  } catch (err) {
    // Auditing must never break the user request, but failures are loud.
    logErrorSafe(err);
  }
}

export async function securityEvent(
  db: D1Database,
  kind: string,
  opts: { userId?: string | null; ipHash?: string | null; userAgent?: string | null; details?: Record<string, unknown> },
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO security_events (id, user_id, kind, ip_hash, user_agent, details, at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        uuid(),
        opts.userId ?? null,
        kind,
        opts.ipHash ?? null,
        opts.userAgent ? opts.userAgent.slice(0, 200) : null,
        JSON.stringify(redact(opts.details ?? {})),
        nowIso(),
      )
      .run();
  } catch (err) {
    logErrorSafe(err);
  }
}

export async function hashIp(ip: string): Promise<string> {
  return sha256Hex(`ip:${ip || "unknown"}`);
}

function logErrorSafe(err: unknown): void {
  logWarn("audit_write_failed", { error: String(err) });
}
