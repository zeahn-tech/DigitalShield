import type { MiddlewareHandler } from "hono";

/**
 * Secure response headers (CSP tuned for the SPA; API responses inherit the
 * same baseline). 'frame-ancestors none' prevents clickjacking of recovery
 * flows; HSTS is only meaningful over TLS and is set unconditionally (browsers
 * ignore it on plain http during local development).
 */
export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Cross-Origin-Opener-Policy", "same-origin");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  c.header("Content-Security-Policy", buildCsp());
  if (c.req.url.startsWith("https://")) {
    c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  if (c.req.url.includes("/api/")) {
    c.header("Cache-Control", "no-store");
  }
};

function buildCsp(): string {
  const directives = [
    "default-src 'self'",
    "script-src 'self'",
    // Vite dev injects inline styles; production build uses external CSS only.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  return directives.join("; ");
}
