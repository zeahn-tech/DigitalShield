import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { requireAuth } from "../middleware/context";
import { readJson } from "./auth";
import { uuid, nowIso } from "../lib/ids";
import { audit } from "../lib/audit";
import { analyzeMessage, SCAM_SHIELD_RULES } from "../security/scam";
import { searchWeb } from "../security/webSearch";
import { rateLimit } from "../lib/ratelimit";
import type { SecurityEventRow } from "../../../shared/types";

/**
 * Security module: Scam Shield, security events/alerts, scam reporting.
 */
export const securityRoutes = new Hono<AppEnv>();
securityRoutes.use("*", requireAuth);

securityRoutes.get("/scam-shield/rules", async (c) => c.json({ rules: SCAM_SHIELD_RULES }));

securityRoutes.post("/scam/analyze", async (c) => {
  const userId = c.get("userId");
  await rateLimit(c.env.DB, `scamanalyze:${userId}`, 60, 300);
  const body = await readJson(
    c,
    z.object({ message: z.string().min(3).max(8000), channel: z.string().max(40).optional() }),
  );
  return c.json({ result: analyzeMessage(body.message) });
});

/**
 * Search the public web (via Exa) for reports about a suspicious offer,
 * sender or domain. Read-only and server-side: the Exa key never leaves the
 * Worker. Results are third-party pages, shown with their source links.
 */
securityRoutes.post("/scam/web-search", async (c) => {
  const userId = c.get("userId");
  await rateLimit(c.env.DB, `scamwebsearch:${userId}`, 20, 3600);
  const body = await readJson(
    c,
    z.object({ query: z.string().trim().min(3).max(300) }),
  );
  const search = await searchWeb(c.env.EXA_API_KEY, body.query);
  return c.json({ search });
});

securityRoutes.post("/scam/reports", async (c) => {
  const userId = c.get("userId");
  await rateLimit(c.env.DB, `scamreport:${userId}`, 10, 3600);
  const body = await readJson(
    c,
    z.object({
      channel: z.enum(["email", "sms", "dm", "whatsapp", "other"]),
      messageExcerpt: z.string().min(3).max(8000),
      notes: z.string().max(2000).optional(),
    }),
  );
  const analysis = analyzeMessage(body.messageExcerpt);
  const matched = analysis.indicators.filter((i) => i.matched).map((i) => i.id);
  const id = uuid();
  await c.env.DB.prepare(
    `INSERT INTO scam_reports (id, user_id, channel, message_excerpt, indicators, reporter_notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, userId, body.channel, body.messageExcerpt.slice(0, 4000), JSON.stringify(matched), body.notes ?? null, nowIso())
    .run();
  await audit(c.env.DB, "SCAM_REPORTED", {
    actorUserId: userId,
    targetType: "scam_report",
    targetId: id,
    details: { indicators: matched.length },
  });
  return c.json({ ok: true, id, indicators: matched }, 201);
});

securityRoutes.get("/events", async (c) => {
  const userId = c.get("userId");
  const rows = await c.env.DB.prepare(
    `SELECT id, kind, details, at FROM security_events WHERE user_id = ?
     ORDER BY at DESC LIMIT 100`,
  )
    .bind(userId)
    .all<SecurityEventRow>();
  return c.json({
    events: rows.results.map((r) => ({ id: r.id, kind: r.kind, details: r.details, at: r.at })),
  });
});

securityRoutes.get("/alerts", async (c) => {
  const userId = c.get("userId");
  // Security alerts = recent failed logins, lockouts, and password changes.
  const rows = await c.env.DB.prepare(
    `SELECT id, kind, details, at FROM security_events
     WHERE user_id = ? AND kind IN ('login_failed', 'rate_limited', 'password_changed')
     ORDER BY at DESC LIMIT 20`,
  )
    .bind(userId)
    .all<SecurityEventRow>();
  const failedRecent = rows.results.filter(
    (r) => r.kind === "login_failed" && Date.now() - new Date(r.at).getTime() < 7 * 86400_000,
  );
  return c.json({
    alerts: rows.results.slice(0, 20).map((r) => ({
      id: r.id,
      kind: r.kind,
      details: r.details,
      at: r.at,
    })),
    failedLoginCount7d: failedRecent.length,
  });
});
