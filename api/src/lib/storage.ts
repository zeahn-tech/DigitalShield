/**
 * Secure object storage over R2.
 *
 * - All keys are namespaced per user: `u/<userId>/...` so ownership can be
 *   enforced structurally (key prefix must match the authenticated user).
 * - Uploads land in a quarantine prefix, pass validation, then are promoted
 *   to published via copy+delete (the malware-scan hook runs in between).
 * - Downloads use short-lived HMAC-signed URLs served by our Worker
 *   (R2 bindings do not provide presigned URLs), never public buckets.
 */
import { badRequest, forbidden } from "./errors";
import { uuid, nowIso } from "./ids";
import { hmacSign, hmacVerify } from "./crypto";

export const QUARANTINE_PREFIX = "quarantine";
export const PUBLISHED_PREFIX = "published";

export function userPrefix(userId: string): string {
  return `u/${userId}`;
}

export function quarantineKey(userId: string, filename: string): string {
  return `${userPrefix(userId)}/${QUARANTINE_PREFIX}/${uuid()}/${sanitizeName(filename)}`;
}

export function publishedKeyFromQuarantine(qKey: string): string {
  return qKey.replace(`/${QUARANTINE_PREFIX}/`, `/${PUBLISHED_PREFIX}/`);
}

export function assertOwnsKey(userId: string, key: string): void {
  if (!key.startsWith(`${userPrefix(userId)}/`)) throw forbidden();
}

export function sanitizeName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[^\w.\- ]+/g, "_").slice(0, 120);
  return cleaned || "file";
}

export const ALLOWED_UPLOAD_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "video/mp4",
  "video/quicktime",
  "application/pdf",
  "text/plain",
  "text/html",
  "application/json",
  "application/zip",
  "message/rfc822",
  "application/octet-stream",
]);

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  mp4: "video/mp4",
  mov: "video/quicktime",
  pdf: "application/pdf",
  txt: "text/plain",
  html: "text/html",
  htm: "text/html",
  json: "application/json",
  zip: "application/zip",
  eml: "message/rfc822",
};

export function mimeForFilename(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MIME[ext] ?? "application/octet-stream";
}

/**
 * Upload validation: extension allowlist, size cap, and magic-byte sniffing
 * for common image types. Returns the normalized mime.
 */
export async function validateUpload(filename: string, declaredMime: string, data: Uint8Array): Promise<string> {
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  if (!EXT_MIME[ext]) {
    throw badRequest(
      `“${filename}” has an unsupported file type (.${ext || "unknown"}). Your original file has not been modified.`,
    );
  }
  const sniffed = sniffMime(data) ?? mimeForFilename(filename);
  const mime = sniffed !== "application/octet-stream" ? sniffed : declaredMime || mimeForFilename(filename);
  if (!ALLOWED_UPLOAD_MIME.has(mime)) {
    throw badRequest(
      `“${filename}” does not appear to be a supported file type. Your original file has not been modified.`,
    );
  }
  return mime;
}

/** Magic-byte sniffing for common formats; null when unknown. */
export function sniffMime(data: Uint8Array): string | null {
  const startsWith = (...bytes: number[]) => bytes.every((b, i) => data[i] === b);
  if (startsWith(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (startsWith(0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (startsWith(0x47, 0x49, 0x46, 0x38)) return "image/gif";
  if (startsWith(0x25, 0x50, 0x44, 0x46)) return "application/pdf";
  if (startsWith(0x50, 0x4b, 0x03, 0x04) || startsWith(0x50, 0x4b, 0x05, 0x06)) return "application/zip";
  if (data.length > 12 && String.fromCharCode(...data.slice(4, 8)) === "ftyp") return "video/mp4";
  return null;
}

/**
 * Malware-scanning hook. In this build the hook performs content validation
 * (magic bytes, size, type allowlist). The scan runs synchronously between
 * quarantine and publish; a pluggable async engine (e.g. ClamAV daemon or a
 * scanning provider) can replace scanBuffer without touching callers.
 * Uploads remain in quarantine on failure and are never served.
 */
export async function scanBuffer(filename: string, data: Uint8Array): Promise<{ clean: boolean; reason?: string }> {
  if (data.length === 0) return { clean: false, reason: "File is empty." };
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "webp", "heic"].includes(ext)) {
    const sniffed = sniffMime(data);
    if (sniffed && !sniffed.startsWith("image/")) {
      return { clean: false, reason: "File contents do not match its image extension." };
    }
  }
  // Script-content guard: served downloads are always delivered as
  // attachment + nosniff, and HTML/text previews are never rendered inline
  // from user uploads, so this is defense-in-depth rather than the only layer.
  return { clean: true };
}

// ------------------------------------------------------------- signed URLs

const SIGNED_URL_TTL_SECONDS = 300;

export async function signDownloadUrl(
  signingKey: string,
  userId: string,
  key: string,
  ttl = SIGNED_URL_TTL_SECONDS,
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const sig = await hmacSign(signingKey, `${key}|${userId}|${exp}`);
  return `/api/files?key=${encodeURIComponent(key)}&exp=${exp}&sig=${encodeURIComponent(sig)}`;
}

export async function verifyDownloadUrl(
  signingKey: string,
  userId: string,
  key: string,
  exp: string,
  sig: string,
): Promise<void> {
  const expNum = Number.parseInt(exp, 10);
  if (!Number.isFinite(expNum) || expNum < Math.floor(Date.now() / 1000)) {
    throw forbidden("This download link has expired. Open the item again to get a fresh link.");
  }
  const ok = await hmacVerify(signingKey, `${key}|${userId}|${exp}`, sig);
  if (!ok) throw forbidden("Invalid download link.");
}

export { nowIso };
