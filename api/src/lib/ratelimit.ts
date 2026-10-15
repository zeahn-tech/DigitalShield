/** D1-backed fixed-window rate limiter + helpers for client identification. */
import { tooMany } from "./errors";
import { hashIp } from "./audit";

export function clientIp(c: { req: { header: (n: string) => string | undefined } }): string {
  return c.req.header("CF-Connecting-IP") || c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "0.0.0.0";
}

export async function ipHashOf(c: { req: { header: (n: string) => string | undefined } }): Promise<string> {
  return hashIp(clientIp(c));
}

export function userAgent(c: { req: { header: (n: string) => string | undefined } }): string {
  return c.req.header("User-Agent") ?? "";
}

/**
 * Fixed-window counter. Throws 429 when the bucket exceeds `limit` within
 * `windowSeconds`. Buckets are namespaced strings, e.g.
 * `login:ip:ab12…` or `login:email:cd34…`.
 */
export async function rateLimit(
  db: D1Database,
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % windowSeconds);

  const row = await db
    .prepare("SELECT window_start, count FROM rate_limits WHERE bucket = ?")
    .bind(bucket)
    .first<{ window_start: number; count: number }>();

  if (!row || row.window_start !== windowStart) {
    await db
      .prepare(
        `INSERT INTO rate_limits (bucket, window_start, count) VALUES (?, ?, 1)
         ON CONFLICT(bucket) DO UPDATE SET window_start = excluded.window_start, count = 1`,
      )
      .bind(bucket, windowStart)
      .run();
    return;
  }

  if (row.count >= limit) throw tooMany();

  await db
    .prepare("UPDATE rate_limits SET count = count + 1 WHERE bucket = ? AND window_start = ?")
    .bind(bucket, windowStart)
    .run();
}
