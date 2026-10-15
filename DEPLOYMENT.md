# Deployment

Target: Cloudflare Workers (this repo is configured for the platform's Sites flow or direct `wrangler deploy`).

## Components

- **Worker** (`api/src/index.ts`, bundled by esbuild) — API + SPA asset serving (`run_worker_first`).
- **Static assets** (`dist/` from `npm run build:web`) — served by the Worker's ASSETS binding with SPA fallback.
- **D1** `DS_DB` — real `database_id` set in `api/wrangler.toml`; the deploy workflow applies migrations with `--remote`.
- **R2** bucket `digitalshield-files` (or a platform-provisioned bucket bound as `FILES`).

## Environment & secrets

Vars are in `api/wrangler.toml` (safe values); secrets go in the platform secret manager / `wrangler secret put`:

| Name | Purpose |
|---|---|
| `ENCRYPTION_MASTER_KEY` | 32 random bytes, base64url (`openssl rand -base64 32`). Required in production for field encryption. |
| `EMAIL_PROVIDER_API_KEY` | Transactional email provider (once wired in `mailer.ts`). |

Production vars are set in `api/wrangler.toml`: `APP_ORIGIN=https://digitalshield.emmanuelzeahn45.workers.dev`, `DEV_MODE=0`, `REQUIRE_EMAIL_VERIFICATION=0` (pilot — flip to `1` together with wiring `mailer.ts`).
Local `wrangler dev` overrides them from `api/.dev.vars` (copy `api/.dev.vars.example`).
`loadConfig` refuses `DEV_MODE` effects on non-loopback origins — a misconfigured production flag cannot enable dev behavior.

**Never commit secrets.** `.env.example` contains placeholders only.

## PBKDF2 CPU consideration

600k PBKDF2 iterations per login/register runs on Worker CPU. This needs a Workers plan with a sufficient CPU limit (Workers Paid, e.g. 30s CPU). On the free tier, lower `PBKDF2_ITERATIONS` (e.g. 60_000) **only** after documenting the reduced security trade-off, or move hashing off-request. Do not silently ship a weakened default.

## Release checklist

1. `npm run check && npm test && npm run build` — all green.
2. `node scripts/smoke.mjs` against a local `wrangler dev` — 57/57.
3. Apply migrations `--remote`; verify schema version.
4. Set secrets; confirm `DEV_MODE=0` and the documented `REQUIRE_EMAIL_VERIFICATION=0` pilot state (flip to `1` with the mailer).
5. Deploy; verify `/api/health`, registration→verification→login flow, an import, and a package generation on the real origin.
6. Confirm audit rows are being written and no PII appears in logs.
7. Verify email provider delivery (verification + reset) on the real domain.

## Rollback

Workers deployments are immutable and instantly revertible to the previous version; D1 migrations must be append-only and backward-compatible with the previous worker version (write migrations to be deploy-safe: new columns nullable or defaulted).
