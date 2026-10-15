import { Hono } from "hono";
import type { AppEnv } from "../env";
import { requireAuth } from "../middleware/context";
import { badRequest } from "../lib/errors";
import { verifyDownloadUrl, assertOwnsKey, ALLOWED_UPLOAD_MIME } from "../lib/storage";

/**
 * Signed-file download endpoint.
 *
 * R2 bucket bindings do not provide presigned URLs, so short-lived HMAC
 * signed URLs are verified here and content is streamed from R2 with
 * attachment disposition + nosniff, preventing inline rendering of
 * untrusted user content.
 */
export const fileRoutes = new Hono<AppEnv>();

fileRoutes.get("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const key = c.req.query("key");
  const exp = c.req.query("exp");
  const sig = c.req.query("sig");
  if (!key || !exp || !sig) throw badRequest("Missing download parameters.");
  assertOwnsKey(userId, key);
  const config = c.get("config");
  await verifyDownloadUrl(`${config.appOrigin}:${userId}`, userId, key, exp, sig);

  const object = await c.env.FILES.get(key);
  if (!object) throw badRequest("This file is no longer available.");
  const bytes = await object.arrayBuffer();
  const filename = key.split("/").pop() ?? "download";
  const contentType = object.httpMetadata?.contentType || "application/octet-stream";
  const safeType = ALLOWED_UPLOAD_MIME.has(contentType) ? contentType : "application/octet-stream";
  return new Response(bytes, {
    headers: {
      "Content-Type": safeType,
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
});
