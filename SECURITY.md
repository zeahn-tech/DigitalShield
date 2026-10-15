# Security

Security-sensitive decisions in this document reflect the actual
implementation. Posture: defense in depth, least privilege, honest error
surfaces, and no secrets in code or logs.

## Authentication

- **Passwords:** PBKDF2-SHA256, 600,000 iterations (OWASP 2023 guidance), 16-byte random salt per password, constant-time comparison, stored format `pbkdf2-sha256$iterations$salt$hash`. Iteration count configurable via `PBKDF2_ITERATIONS` (lower only for tests).
- **Policy:** minimum 12 characters with lower/upper/digit/symbol; common words rejected (mirrored client-side for UX, enforced server-side).
- **Sessions:** 256-bit random token, HttpOnly + SameSite=Lax + Secure (https origins) cookie; only a peppered SHA-256 hash is stored. Revocation list; "sign out all other sessions" endpoint; password change resets all sessions.
- **Lockout:** 8 consecutive failures → 15-minute lockout; per-IP (20/5min) and per-email (10/5min) rate limits via `rate_limits` buckets; login errors are generic (no user enumeration); dummy hash verification on unknown emails to reduce timing signals.
- **Email verification & reset:** single-use, hashed, expiring tokens (24h / 1h); reset tokens invalidate all sessions on use.
- **Never stored, never requested:** platform passwords, session cookies, OTPs, recovery codes — no schema field exists for them.

## Transport & headers

CSP (`default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`), HSTS on https, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, Referrer-Policy, COOP, Permissions-Policy; `Cache-Control: no-store` on all `/api/*` responses.

## CSRF

All `/api` mutations enforce same-origin: browser-request origins must match the host the request is actually served on (independent of the configured `APP_ORIGIN`, so preview and production hostnames both work), with `Sec-Fetch-Site` cross-site rejection and SameSite=Lax cookies as a second layer; loopback origins are tolerated for local dev, and non-browser API clients without an Origin header are permitted (they are not cookie-lockstep CSRF vectors).

## Authorization

Every data access is scoped to `c.get("userId")` server-side; client-supplied IDs never grant access. Smoke-tested IDOR cases: cross-user case read (404), cross-user evidence write (404), cross-user package fetch (404), foreign storage-key prefix (403), path traversal in download keys (403/400).

## Encryption

- **In transit:** TLS (enforced at the platform edge in production).
- **At rest (fields):** AES-256-GCM envelope encryption with per-record keys derived from `ENCRYPTION_MASTER_KEY` via HKDF (record id as salt context) — a leaked record key cannot decrypt other records. Used for sensitive columns (recovery phone). Without a master key (local dev only), values are stored with a `plain-dev:` marker; production must set the secret.
- **Zero-knowledge trade-off (decision recorded):** full client-side encryption was rejected because server-side search, recovery-package generation, and the privacy export require server readability, and unrecoverable lost keys in a *recovery* product would be self-defeating. Envelope encryption + least-privilege access + audit logging is the chosen architecture.

## File handling

- Extension allowlist + MIME validation + magic-byte sniffing; 25 MB cap.
- `quarantine → scanBuffer (scan hook) → publish`; failed scans are never served.
- Per-user R2 key prefix (`u/<userId>/…`) enforced structurally on every read.
- Downloads: short-lived HMAC-signed URLs (5 min), served as `attachment` + `nosniff` — user content is never rendered inline by the app.

## Logging & audit

- Redacting logger: any key matching password/token/secret/cookie/authorization/etc. is replaced with `[redacted]`.
- Append-only `audit_logs` for all sensitive actions (registration, login/failure/lockout, password change, sessions, uploads/deletes, imports, cases, evidence, packages, scam reports, privacy requests, admin actions). No API mutates or deletes audit rows.
- `security_events` for login success/failure, lockout, password change.

## Admin least privilege

Admin endpoints expose aggregates, user directory metadata, resources, scam reports, audit logs and privacy requests. **There is no endpoint that returns vault contents, evidence files, or recovery packages** — verified in the smoke test.

## Known limitations (honest)

- Malware scanning is a content-validation hook, not an antivirus engine; a pluggable scanner can replace `scanBuffer`.
- MFA is schema-ready but not enrollable in this build.
- Account-takeover recovery for users who lose their DigitalShield password depends on email security; there is no out-of-band identity verification yet.
