/**
 * Cryptographic primitives (Web Crypto only — works on Cloudflare Workers).
 *
 * - Password hashing: PBKDF2-SHA256 with a per-password random salt.
 *   Iteration count is configurable; default 600,000 per OWASP 2023 guidance.
 *   NOTE: PBKDF2 at this cost requires a Workers plan with a sufficient CPU
 *   limit (Workers Paid). See DEPLOYMENT.md.
 * - Signing: HMAC-SHA256 for signed download URLs and token hashing.
 * - Envelope encryption: AES-256-GCM with a per-record data key derived from
 *   a master key via HKDF (record id as salt context).
 */
import { base64url, fromBase64url, toHex } from "./ids";

const enc = new TextEncoder();
const dec = new TextDecoder();

// ---------------------------------------------------------------- passwords

export async function hashPassword(password: string, iterations: number): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const dk = await pbkdf2(password, salt, iterations);
  return `pbkdf2-sha256$${iterations}$${base64url(salt)}$${base64url(dk)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2-sha256") return false;
  const iterations = Number.parseInt(parts[1] ?? "", 10);
  const salt = fromBase64url(parts[2] ?? "");
  const expected = fromBase64url(parts[3] ?? "");
  if (!Number.isFinite(iterations) || iterations < 10_000) return false;
  const actual = await pbkdf2(password, salt, iterations);
  return constantTimeEqual(actual, expected);
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    keyMaterial,
    256,
  );
  return new Uint8Array(bits);
}

export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/** Password strength policy — returns list of unmet requirements (empty = OK). */
export function passwordProblems(password: string): string[] {
  const problems: string[] = [];
  if (password.length < 12) problems.push("at least 12 characters");
  if (!/[a-z]/.test(password)) problems.push("a lowercase letter");
  if (!/[A-Z]/.test(password)) problems.push("an uppercase letter");
  if (!/[0-9]/.test(password)) problems.push("a number");
  if (!/[^A-Za-z0-9]/.test(password)) problems.push("a symbol");
  const common = ["password", "123456", "qwerty", "letmein", "digitalshield", "welcome"];
  if (common.some((c) => password.toLowerCase().includes(c)))
    problems.push("no common words like 'password' or '123456'");
  return problems;
}

// ------------------------------------------------------------------ hashing

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const data = typeof input === "string" ? enc.encode(input) : input;
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return toHex(new Uint8Array(digest));
}

export async function hmacSign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return base64url(new Uint8Array(sig));
}

export async function hmacVerify(secret: string, message: string, signature: string): Promise<boolean> {
  const expected = await hmacSign(secret, message);
  return constantTimeEqual(enc.encode(expected), enc.encode(signature));
}

/** Hash a session/token value for at-rest storage (peppered with secret). */
export async function tokenHash(token: string, pepper: string): Promise<string> {
  return sha256Hex(`${pepper}:${token}`);
}

// ------------------------------------------------------- envelope encryption

/**
 * Encrypt a sensitive field. Format: `v1:<iv b64url>:<ct b64url>`.
 * Derives a per-record key from the master key + context (record id), so a
 * leaked record key cannot decrypt other records.
 * If no master key is configured (local dev), values are stored with a
 * clearly marked `plain-dev:` prefix — production MUST set ENCRYPTION_MASTER_KEY.
 */
export async function encryptField(
  masterKey: string | undefined,
  context: string,
  plaintext: string,
): Promise<string> {
  if (!masterKey) return `plain-dev:${plaintext}`;
  const key = await deriveDataKey(masterKey, context);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
  return `v1:${base64url(iv)}:${base64url(new Uint8Array(ct))}`;
}

export async function decryptField(
  masterKey: string | undefined,
  context: string,
  stored: string,
): Promise<string | null> {
  if (stored.startsWith("plain-dev:")) return stored.slice("plain-dev:".length);
  if (!masterKey || !stored.startsWith("v1:")) return null;
  const [, ivB64, ctB64] = stored.split(":");
  if (!ivB64 || !ctB64) return null;
  try {
    const key = await deriveDataKey(masterKey, context);
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64url(ivB64) as BufferSource },
      key,
      fromBase64url(ctB64) as BufferSource,
    );
    return dec.decode(pt);
  } catch {
    return null;
  }
}

async function deriveDataKey(masterKeyB64: string, context: string): Promise<CryptoKey> {
  const master = fromBase64url(masterKeyB64.replace(/\s/g, ""));
  const base = await crypto.subtle.importKey("raw", master as BufferSource, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: enc.encode(context),
      info: enc.encode("digitalshield-field-v1"),
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
