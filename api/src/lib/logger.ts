/**
 * Redacting structured logger. Passwords, tokens, cookies, and authorization
 * values must NEVER reach logs — keys matching these patterns are redacted.
 */
const SECRET_KEY_RE =
  /(password|passphrase|token|secret|cookie|authorization|session|credential|otp|recovery_code|api[_-]?key)/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[depth-limit]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_KEY_RE.test(k) ? "[redacted]" : redact(v, depth + 1);
  }
  return out;
}

export function logInfo(event: string, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ level: "info", event, ...((redact(data) as object) || {}) }));
}

export function logWarn(event: string, data: Record<string, unknown> = {}): void {
  console.warn(JSON.stringify({ level: "warn", event, ...((redact(data) as object) || {}) }));
}

export function logError(event: string, data: Record<string, unknown> = {}): void {
  console.error(JSON.stringify({ level: "error", event, ...((redact(data) as object) || {}) }));
}
