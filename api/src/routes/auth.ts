import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { SESSION_COOKIE, requireAuth } from "../middleware/context";
import * as svc from "../auth/service";
import { badRequest } from "../lib/errors";
import { getCookie, setCookie } from "hono/cookie";
import { clientIp, userAgent } from "../lib/ratelimit";

const registerSchema = z.object({
  email: z.string().min(3).max(254),
  password: z.string().min(1).max(200),
});

export const authRoutes = new Hono<AppEnv>();

authRoutes.post("/register", async (c) => {
  const body = await readJson(c, registerSchema);
  const config = c.get("config");
  const result = await svc.register(c.env, config, {
    email: body.email,
    password: body.password,
    ip: clientIp(c),
    userAgent: userAgent(c),
  });
  return c.json(
    {
      ok: true,
      userId: result.userId,
      emailVerificationRequired: !result.autoVerified,
      message: result.autoVerified
        ? "Your account is ready. You can sign in now."
        : "Account created. Check your email for a verification link.",
    },
    201,
  );
});

authRoutes.post("/verify-email", async (c) => {
  const body = await readJson(c, z.object({ token: z.string().min(10).max(500) }));
  await svc.verifyEmail(c.env, c.get("config"), body.token);
  return c.json({ ok: true });
});

authRoutes.post("/resend-verification", async (c) => {
  const body = await readJson(c, z.object({ email: z.string().min(3).max(254) }));
  await svc.resendVerification(c.env, c.get("config"), body.email, clientIp(c));
  return c.json({ ok: true, message: "If that address needs verification, a new link is on its way." });
});

authRoutes.post("/login", async (c) => {
  const body = await readJson(c, z.object({ email: z.string().min(3).max(254), password: z.string().min(1).max(200) }));
  const config = c.get("config");
  const result = await svc.login(c.env, config, {
    email: body.email,
    password: body.password,
    ip: clientIp(c),
    userAgent: userAgent(c),
  });
  setCookie(c, SESSION_COOKIE, result.sessionToken, {
    httpOnly: true,
    secure: config.appOrigin.startsWith("https://"),
    sameSite: "Lax",
    path: "/",
    maxAge: config.sessionTtlSeconds,
    expires: new Date(result.expiresAt),
  });
  return c.json({ ok: true, user: { id: result.userId, role: result.role } });
});

authRoutes.post("/logout", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  const userId = c.get("userId");
  if (token && userId) {
    const config = c.get("config");
    const { tokenHash } = await import("../lib/crypto");
    const hash = await tokenHash(token, config.appOrigin);
    await c.env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND token_hash = ?")
      .bind(new Date().toISOString(), userId, hash)
      .run();
  }
  c.header("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
  return c.json({ ok: true });
});

authRoutes.get("/session", async (c) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ user: null }, 200);
  return c.json({
    user: {
      id: userId,
      email: c.get("userEmail"),
      role: c.get("userRole"),
      emailVerified: c.get("emailVerified"),
      mfaEnabled: false,
    },
  });
});

authRoutes.post("/password/forgot", async (c) => {
  const body = await readJson(c, z.object({ email: z.string().min(3).max(254) }));
  const config = c.get("config");
  const result = await svc.requestPasswordReset(c.env, config, body.email, clientIp(c));
  return c.json({
    ok: true,
    message: "If an account exists for that email, a reset link has been sent.",
    // Development-only (loopback origins only; refused otherwise in loadConfig).
    ...(config.devMode && result.devResetUrl ? { devResetUrl: result.devResetUrl } : {}),
  });
});

authRoutes.post("/password/reset", async (c) => {
  const body = await readJson(
    c,
    z.object({ token: z.string().min(10).max(500), password: z.string().min(1).max(200) }),
  );
  await svc.resetPassword(c.env, c.get("config"), body.token, body.password, clientIp(c));
  return c.json({ ok: true, message: "Your password has been changed and other sessions were signed out." });
});

authRoutes.get("/sessions", requireAuth, async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  const sessions = await svc.listSessions(c.env, c.get("config"), c.get("userId"), token);
  return c.json({ sessions });
});

authRoutes.post("/sessions/revoke-others", requireAuth, async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) throw badRequest("No active session.");
  const revoked = await svc.revokeOtherSessions(c.env, c.get("config"), c.get("userId"), token);
  return c.json({ ok: true, revoked });
});

async function readJson<T extends z.ZodTypeAny>(c: any, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw badRequest("Request body must be valid JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw badRequest("Please check the highlighted fields.", parsed.error.flatten());
  }
  return parsed.data;
}

export { readJson };
