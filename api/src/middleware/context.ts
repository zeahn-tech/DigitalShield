import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import type { AppEnv } from "../env";
import { loadConfig } from "../env";
import { forbidden, unauthorized } from "../lib/errors";
import { tokenHash } from "../lib/crypto";
import { nowIso } from "../lib/ids";
import { ipHashOf } from "../lib/ratelimit";
import { securityEvent } from "../lib/audit";

export const SESSION_COOKIE = "ds_session";

/** Resolve runtime config once per request and expose it as a variable. */
export const withConfig: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("config", loadConfig(c.env));
  await next();
};

/**
 * Load the session (if any) into context variables. Does not enforce auth —
 * use requireAuth for protected routes.
 */
export const loadSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  // Every API mutation must be same-origin (CSRF defense) whether or not the
  // request is authenticated.
  await enforceSameOriginMutation(c);
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) {
    await next();
    return;
  }
  const config = c.get("config");
  const hash = await tokenHash(token, config.appOrigin);
  const row = await c.env.DB.prepare(
    `SELECT s.id AS session_id, s.expires_at, s.revoked_at,
            u.id, u.email, u.role, u.email_verified_at, u.status
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?`,
  )
    .bind(hash)
    .first<{
      session_id: string;
      expires_at: string;
      revoked_at: string | null;
      id: string;
      email: string;
      role: "user" | "admin";
      email_verified_at: string | null;
      status: string;
    }>();

  if (!row || row.revoked_at || row.expires_at <= nowIso() || row.status !== "active") {
    await next();
    return;
  }
  c.set("userId", row.id);
  c.set("userRole", row.role);
  c.set("userEmail", row.email);
  c.set("emailVerified", row.email_verified_at !== null);
  await next();
};

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("userId")) throw unauthorized();
  await enforceSameOriginMutation(c);
  await next();
};

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("userId")) throw unauthorized();
  if (c.get("userRole") !== "admin") throw forbidden("Administrator access required.");
  await enforceSameOriginMutation(c);
  await next();
};

/**
 * CSRF defense for all state-changing API requests: the Origin header (when
 * present, i.e. browser requests) must match the host the request is actually
 * being served on — i.e. genuinely same-origin. Comparing against the request's
 * own Host (instead of a configured origin) keeps deployment-agnostic preview
 * and production hostnames working while still rejecting any foreign origin.
 * Loopback origins are always tolerated for local development.
 */
export async function enforceSameOriginMutation(c: {
  req: { method: string; header: (n: string) => string | undefined };
  get: (k: "config") => { appOrigin: string };
}): Promise<void> {
  const method = c.req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;
  const site = c.req.header("Sec-Fetch-Site");
  if (site && site !== "same-origin" && site !== "none") {
    throw forbidden("Cross-site request blocked.");
  }
  const origin = c.req.header("Origin");
  if (!origin) return; // non-browser API clients (scripts) — not cookie-lockstep CSRF
  if (isLoopback(origin)) return;
  const host = c.req.header("host");
  let originHost: string | null = null;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw forbidden("Cross-origin request blocked.");
  }
  if (host && originHost === host) return; // same host = same deployment target
  if (origin === c.get("config").appOrigin) return;
  throw forbidden("Cross-origin request blocked.");
}

function isLoopback(origin: string | undefined): boolean {
  return !!origin && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);
}

/** Record a failed-auth security event (fire-and-forget). */
export async function recordFailedLogin(c: any, userId: string | null): Promise<void> {
  const ipHash = await ipHashOf(c);
  await securityEvent(c.env.DB, "login_failed", {
    userId,
    ipHash,
    userAgent: c.req.header("User-Agent"),
  });
}
