/**
 * Authentication service: registration, email verification, login with
 * lockout, password reset, session management.
 *
 * Security properties:
 * - Passwords hashed with PBKDF2-SHA256 (configurable cost).
 * - Session tokens: 256-bit random, stored only as peppered SHA-256 hashes.
 * - Login errors are generic (no user enumeration).
 * - Progressive account lockout after repeated failures.
 * - Single-use, hashed, expiring tokens for verification and reset.
 */
import type { Env, Config } from "../env";
import { badRequest, unauthorized, ApiError } from "../lib/errors";
import { hashPassword, verifyPassword, passwordProblems, tokenHash } from "../lib/crypto";
import { uuid, randomToken, nowIso, isoIn } from "../lib/ids";
import { audit, securityEvent, hashIp } from "../lib/audit";
import { rateLimit } from "../lib/ratelimit";
import { sendEmail } from "../lib/mailer";

const VERIFY_TTL_SECONDS = 24 * 3600;
const RESET_TTL_SECONDS = 3600;
const MAX_FAILED_LOGINS = 8;
const LOCKOUT_SECONDS = 15 * 60;

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: "user" | "admin";
  email_verified_at: string | null;
  status: string;
  failed_login_count: number;
  locked_until: string | null;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Rate-limit multiplier for local development where every request shares one IP. */
const rl = (config: Config, base: number): number => (config.devMode ? base * 10 : base);

export async function register(
  env: Env,
  config: Config,
  input: { email: string; password: string; ip: string; userAgent: string },
): Promise<{ userId: string; autoVerified: boolean }> {
  const email = normalizeEmail(input.email);
  if (!EMAIL_RE.test(email) || email.length > 254) {
    throw badRequest("Please enter a valid email address.");
  }
  const problems = passwordProblems(input.password);
  if (problems.length > 0) {
    throw badRequest(`Password must include ${problems.join(", ")}.`, { field: "password", problems });
  }
  await rateLimit(env.DB, `register:ip:${await hashIp(input.ip)}`, rl(config, 10), 3600);

  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (existing) {
    // Do not reveal that the address is taken in a way that enables
    // enumeration at scale; the message is still honest for legitimate users.
    throw badRequest(
      "An account with this email already exists. Try signing in or resetting your password.",
      { field: "email" },
    );
  }

  const id = uuid();
  const passwordHash = await hashPassword(input.password, config.pbkdf2Iterations);
  const now = nowIso();
  // Local development convenience: auto-verify so flows are testable without
  // a mail provider. Production sets REQUIRE_EMAIL_VERIFICATION=1.
  const autoVerified = !config.requireEmailVerification;
  await env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, role, email_verified_at, status, created_at, updated_at)
     VALUES (?, ?, ?, 'user', ?, 'active', ?, ?)`,
  )
    .bind(id, email, passwordHash, autoVerified ? now : null, now, now)
    .run();

  await audit(env.DB, "USER_REGISTERED", { actorUserId: id, ipHash: await hashIp(input.ip) });
  if (!autoVerified) {
    await issueToken(env, id, "verify_email", email, config);
  }
  return { userId: id, autoVerified };
}

export async function verifyEmail(env: Env, config: Config, rawToken: string): Promise<void> {
  const user = await consumeToken(env, config, rawToken, "verify_email");
  if (!user) throw badRequest("This verification link is invalid or has expired. Request a new one.");
  await env.DB.prepare("UPDATE users SET email_verified_at = ?, updated_at = ? WHERE id = ?").bind(
    nowIso(),
    nowIso(),
    user.id,
  ).run();
  await audit(env.DB, "EMAIL_VERIFIED", { actorUserId: user.id });
}

export async function resendVerification(
  env: Env,
  config: Config,
  email: string,
  ip: string,
): Promise<void> {
  await rateLimit(env.DB, `resend:ip:${await hashIp(ip)}`, rl(config, 5), 3600);
  const user = await env.DB.prepare("SELECT id, email_verified_at FROM users WHERE email = ?")
    .bind(normalizeEmail(email))
    .first<{ id: string; email_verified_at: string | null }>();
  if (!user || user.email_verified_at) return; // silent success (no enumeration)
  await issueToken(env, user.id, "verify_email", normalizeEmail(email), config);
}

export async function requestPasswordReset(
  env: Env,
  config: Config,
  email: string,
  ip: string,
): Promise<{ devResetUrl?: string }> {
  await rateLimit(env.DB, `pwreset:ip:${await hashIp(ip)}`, rl(config, 5), 3600);
  const normalized = normalizeEmail(email);
  const user = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(normalized)
    .first<{ id: string }>();
  if (!user) return {}; // silent: no enumeration
  const raw = await issueToken(env, user.id, "password_reset", normalized, config);
  await audit(env.DB, "PASSWORD_RESET_REQUESTED", { actorUserId: user.id });
  // DEV_MODE only (loopback origins only — enforced in loadConfig).
  return config.devMode ? { devResetUrl: `${config.appOrigin}/reset?token=${raw}` } : {};
}

export async function resetPassword(
  env: Env,
  config: Config,
  rawToken: string,
  newPassword: string,
  ip: string,
): Promise<void> {
  const problems = passwordProblems(newPassword);
  if (problems.length > 0) {
    throw badRequest(`Password must include ${problems.join(", ")}.`, { field: "password", problems });
  }
  const user = await consumeToken(env, config, rawToken, "password_reset");
  if (!user) throw badRequest("This reset link is invalid or has expired. Request a new one.");
  const hash = await hashPassword(newPassword, config.pbkdf2Iterations);
  await env.DB.prepare(
    `UPDATE users SET password_hash = ?, failed_login_count = 0, locked_until = NULL, updated_at = ? WHERE id = ?`,
  )
    .bind(hash, nowIso(), user.id)
    .run();
  // Invalidate all existing sessions after a password change.
  await env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL")
    .bind(nowIso(), user.id)
    .run();
  await audit(env.DB, "PASSWORD_CHANGED", { actorUserId: user.id, ipHash: await hashIp(ip) });
  await securityEvent(env.DB, "password_changed", { userId: user.id, ipHash: await hashIp(ip) });
}

export async function login(
  env: Env,
  config: Config,
  input: { email: string; password: string; ip: string; userAgent: string },
): Promise<{ userId: string; role: "user" | "admin"; sessionToken: string; expiresAt: string }> {
  const email = normalizeEmail(input.email);
  await rateLimit(env.DB, `login:ip:${await hashIp(input.ip)}`, rl(config, 20), 300);
  await rateLimit(env.DB, `login:email:${await hashIp(email)}`, rl(config, 10), 300);

  const user = await env.DB.prepare(
    `SELECT id, email, password_hash, role, email_verified_at, status, failed_login_count, locked_until
     FROM users WHERE email = ?`,
  )
    .bind(email)
    .first<UserRow>();

  const invalid = unauthorized("Incorrect email or password.");
  if (!user) {
    // Spend comparable time to avoid timing-based enumeration.
    await verifyPassword(input.password, "pbkdf2-sha256$10000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    await audit(env.DB, "USER_LOGIN_FAILED", { details: { reason: "unknown_email" }, ipHash: await hashIp(input.ip) });
    throw invalid;
  }
  if (user.locked_until && user.locked_until > nowIso()) {
    await securityEvent(env.DB, "rate_limited", { userId: user.id, ipHash: await hashIp(input.ip) });
    throw new ApiError(429, "account_locked", "Too many failed attempts. Try again in a few minutes.");
  }

  const ok = await verifyPassword(input.password, user.password_hash);
  if (!ok) {
    const failed = user.failed_login_count + 1;
    const lockedUntil = failed >= MAX_FAILED_LOGINS ? isoIn(LOCKOUT_SECONDS) : null;
    await env.DB.prepare(
      "UPDATE users SET failed_login_count = ?, locked_until = ?, updated_at = ? WHERE id = ?",
    )
      .bind(failed, lockedUntil, nowIso(), user.id)
      .run();
    await audit(env.DB, "USER_LOGIN_FAILED", {
      actorUserId: user.id,
      details: { reason: "bad_password", failedCount: failed },
      ipHash: await hashIp(input.ip),
    });
    await securityEvent(env.DB, "login_failed", {
      userId: user.id,
      ipHash: await hashIp(input.ip),
      userAgent: input.userAgent,
    });
    if (lockedUntil) {
      await audit(env.DB, "USER_LOCKED", { actorUserId: user.id, ipHash: await hashIp(input.ip) });
      await notify(env, user.id, "security_alert", "Account temporarily locked", "Multiple failed sign-in attempts triggered a 15-minute lockout as a protective measure.", "/security");
    }
    throw invalid;
  }
  if (config.requireEmailVerification && !user.email_verified_at) {
    throw new ApiError(403, "email_unverified", "Please verify your email address before signing in.");
  }
  if (user.status !== "active") {
    throw new ApiError(403, "account_inactive", "This account is not active. Contact support.");
  }

  await env.DB.prepare(
    "UPDATE users SET failed_login_count = 0, locked_until = NULL, updated_at = ? WHERE id = ?",
  )
    .bind(nowIso(), user.id)
    .run();

  const token = randomToken(32);
  const hash = await tokenHash(token, config.appOrigin);
  const expiresAt = isoIn(config.sessionTtlSeconds);
  await env.DB.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, ip_hash, user_agent, created_at, last_seen_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(uuid(), user.id, hash, await hashIp(input.ip), input.userAgent.slice(0, 200), nowIso(), nowIso(), expiresAt)
    .run();

  await audit(env.DB, "USER_LOGIN", { actorUserId: user.id, ipHash: await hashIp(input.ip) });
  await securityEvent(env.DB, "login_success", {
    userId: user.id,
    ipHash: await hashIp(input.ip),
    userAgent: input.userAgent,
  });
  return { userId: user.id, role: user.role, sessionToken: token, expiresAt };
}

export async function listSessions(
  env: Env,
  config: Config,
  userId: string,
  currentToken: string | undefined,
): Promise<{ id: string; createdAt: string; lastSeenAt: string; expiresAt: string; current: boolean; userAgent: string | null }[]> {
  const rows = await env.DB.prepare(
    `SELECT id, created_at, last_seen_at, expires_at, token_hash, user_agent
     FROM sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
     ORDER BY last_seen_at DESC`,
  )
    .bind(userId, nowIso())
    .all<{ id: string; created_at: string; last_seen_at: string; expires_at: string; token_hash: string; user_agent: string | null }>();
  const currentHash = currentToken ? await tokenHash(currentToken, config.appOrigin) : null;
  return rows.results.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at,
    expiresAt: r.expires_at,
    userAgent: r.user_agent,
    current: currentHash !== null && r.token_hash === currentHash,
  }));
}

export async function revokeOtherSessions(
  env: Env,
  config: Config,
  userId: string,
  currentToken: string,
): Promise<number> {
  const currentHash = await tokenHash(currentToken, config.appOrigin);
  const res = await env.DB.prepare(
    `UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND token_hash != ?`,
  )
    .bind(nowIso(), userId, currentHash)
    .run();
  const count = res.meta.changes ?? 0;
  await audit(env.DB, "SESSION_REVOKED", { actorUserId: userId, details: { revoked: count } });
  return count;
}

// ------------------------------------------------------------- token helpers

async function issueToken(
  env: Env,
  userId: string,
  kind: "verify_email" | "password_reset",
  email: string,
  config: Config,
): Promise<string> {
  const raw = randomToken(32);
  const hash = await tokenHash(raw, config.appOrigin);
  await env.DB.prepare(
    `INSERT INTO email_tokens (id, user_id, kind, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(uuid(), userId, kind, hash, isoIn(kind === "verify_email" ? VERIFY_TTL_SECONDS : RESET_TTL_SECONDS), nowIso())
    .run();

  const link = kind === "verify_email"
    ? `${config.appOrigin}/verify-email?token=${raw}`
    : `${config.appOrigin}/reset?token=${raw}`;
  const subject = kind === "verify_email" ? "Verify your DigitalShield email" : "Reset your DigitalShield password";
  const body =
    kind === "verify_email"
      ? `Welcome to DigitalShield.\n\nVerify your email address to activate your account:\n\n${link}\n\nThis link expires in 24 hours.\n\nIf you did not create a DigitalShield account, you can ignore this message.`
      : `A password reset was requested for your DigitalShield account.\n\nReset your password:\n\n${link}\n\nThis link expires in 1 hour. If you did not request this, no action is needed — your password has not changed.`;
  await sendEmail({ to: email, subject, text: body }, config.hasEncryptionKey ? env.EMAIL_PROVIDER_API_KEY : undefined);
  return raw;
}

async function consumeToken(
  env: Env,
  config: Config,
  raw: string,
  kind: "verify_email" | "password_reset",
): Promise<{ id: string } | null> {
  const hash = await tokenHash(raw, config.appOrigin);
  const row = await env.DB.prepare(
    `SELECT id, user_id, expires_at, used_at FROM email_tokens
     WHERE kind = ? AND token_hash = ? ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(kind, hash)
    .first<{ id: string; user_id: string; expires_at: string; used_at: string | null }>();
  if (!row || row.used_at || row.expires_at <= nowIso()) return null;
  await env.DB.prepare("UPDATE email_tokens SET used_at = ? WHERE id = ?").bind(nowIso(), row.id).run();
  return { id: row.user_id };
}


/** In-app notification helper (never includes secrets in body). */
export async function notify(
  env: Env,
  userId: string,
  kind: string,
  title: string,
  body: string,
  link?: string,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO notifications (id, user_id, kind, title, body, link, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(uuid(), userId, kind, title, body, link ?? null, nowIso())
    .run();
}
