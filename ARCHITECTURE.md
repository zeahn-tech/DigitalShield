# Architecture

## System overview

```text
[React SPA — static assets in ../dist]
        │  same-origin fetch (cookies, CSRF via Origin/SameSite)
        ▼
[Hono Worker (api/src/index.ts)]
  security headers → config → CSRF origin check → session load → routes
        │                    │
        ▼                    ▼
   [D1: metadata]       [R2: files — quarantine/ → published/]
        │
        └── [mailer.ts transport abstraction → provider (future)]
```

One Worker serves both the API (`/api/*`) and the SPA (assets binding with
single-page fallback). `run_worker_first = true` ensures API routes are
matched before static assets.

## Request pipeline

1. `securityHeaders` — CSP, HSTS (https only), nosniff, DENY framing, COOP,
   Permissions-Policy, `Cache-Control: no-store` on `/api/*`.
2. `withConfig` — parses env into a typed `Config`. **`DEV_MODE` only takes
   effect when `APP_ORIGIN` is loopback** (structural production guard).
3. `loadSession` — CSRF same-origin enforcement for all `/api` mutations, then
   session cookie → peppered SHA-256 hash lookup → context variables.
4. Route handlers (all data access keyed to `c.get("userId")`).
5. `onError` — `ApiError` → safe JSON; unknown errors → generic 500 with a
   redacted structured log (never stack traces to clients).

## Modules

| Module | Location | Notes |
|---|---|---|
| Auth | `api/src/auth/service.ts`, `api/src/routes/auth.ts` | PBKDF2 hashing, single-use hashed tokens, lockout, generic errors |
| Vault | `api/src/routes/vault.ts` | Assets, tags, Important flag, platform accounts, uploads |
| Import engine | `api/src/import/*`, `api/src/routes/imports.ts` | See IMPORT_ENGINE.md |
| Recovery | `api/src/recovery/*`, `api/src/routes/recovery.ts` | See RECOVERY_SYSTEM.md |
| Security/Scam Shield | `api/src/security/scam.ts`, `api/src/routes/security.ts` | Indicator analysis, never verdicts |
| Privacy | `api/src/routes/privacy.ts` | Summary, export, deletion requests |
| Admin | `api/src/routes/admin.ts` | Least privilege; no vault-content access by design |
| Files | `api/src/routes/files.ts` | Signed-URL downloads, attachment + nosniff |
| Misc | `api/src/routes/misc.ts` | Dashboard readiness, notifications, platforms, health |

## Key design decisions

- **PBKDF2-SHA256** via Web Crypto; iterations configurable and stored per
  hash (production: 100k — workerd rejects counts above 100k, see
  SECURITY.md/DEPLOYMENT.md). No native-dependency libraries work on
  Workers.
- **Envelope field encryption** (AES-256-GCM, HKDF per-record key, record id
  as salt context) for sensitive columns (recovery phone). Rationale over
  zero-knowledge client-side encryption: server-side search, recovery-package
  generation, and export all require server readability; a lost client key in
  a *recovery* product would be catastrophic. Documented in SECURITY.md.
- **Signed downloads instead of public buckets.** R2 bindings do not provide
  presigned URLs, so downloads go through `/api/files` with HMAC-signed,
  expiring, user-scoped URLs.
- **Client-side ZIP extraction** (fflate) before upload keeps Worker request
  sizes manageable and enables per-file import reporting.
- **Recovery Resources are database rows** (admin-editable, no redeploy).

## SPA structure (`web/src`)

- `App.tsx` — routes + authenticated shell (sidebar: Dashboard, Vault,
  Import, Recovery, Security, Privacy, Settings, Admin; persistent
  🚨 Account Emergency entry).
- `pages/*` — one file per screen; `lib/api.ts` typed fetch client;
  `lib/auth.tsx` session context; `components/ui.tsx` primitives.
- Mobile-first responsive CSS in `styles.css` (no CSS framework);
  WCAG-conscious contrast, focus-visible styles, skip link, semantic HTML,
  reduced-motion support, status colors always paired with text/icons.

## Extension points

- **New platform importer:** implement parser + register in
  `detect.ts`/`platforms.ts`; engine, jobs, and UI are platform-agnostic.
- **Email provider:** `api/src/lib/mailer.ts::sendViaProvider`.
- **Malware scanner:** `api/src/lib/storage.ts::scanBuffer` (currently magic-
  byte/type validation; pluggable async engine can replace it).
- **Async import worker:** `import_jobs` table already models queued work.
- **MFA:** `users.mfa_enabled` + session layer ready; enrollment endpoint
  returns an honest 501.
