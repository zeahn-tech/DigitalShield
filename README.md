# DigitalShield

**Protect your digital identity. Preserve your memories. Prepare for account emergencies.**

DigitalShield is a privacy-first digital account protection, data preservation, and recovery-assistance platform. It helps individuals and small organizations prepare for account emergencies *before* they happen: preserve important digital assets, import official platform archives, organize recovery cases and evidence, follow legitimate official recovery procedures, and avoid account-recovery scams.

> **What DigitalShield is not:** it does not restore, unlock, bypass, or recover any platform account. It has no privileged access to Facebook/Meta or any other platform. Account recovery is always performed by the platform itself, through its own official processes. DigitalShield prepares, documents, and guides — nothing more. The product never asks for platform passwords, session cookies, or authentication codes.

## Product philosophy

**Protect → Detect → Preserve → Document → Guide → Recover**

## Feature overview (current build)

| Module | Status |
|---|---|
| Secure authentication (email/password, email verification, reset, sessions, lockout, rate limiting) | ✅ |
| Dashboard with explainable recovery-readiness scoring | ✅ |
| Digital vault (assets, tags, Important marking, search, upload) | ✅ |
| Facebook archive import engine (defensive JSON parser, per-file reporting, duplicate detection) | ✅ |
| Recovery cases with unique case numbers, timeline, evidence (SHA-256), official resource directory | ✅ |
| Recovery Package generator (printable HTML → PDF via browser print) | ✅ |
| Recovery Assistant (8-step guided flow) | ✅ |
| Recovery Scam Shield (indicator analysis, Exa-powered web search for public reports, reporting) | ✅ |
| Privacy & Data (summary, full export, deletion requests) | ✅ |
| Admin portal (users, resources, scam reports, audit log, privacy requests — least privilege) | ✅ |
| Multi-factor authentication enrollment | 🔜 (schema-ready, honestly reported as unavailable) |
| Instagram / other platform importers | 🔜 (architecture ready, not faked) |
| Transactional email provider | 🔜 (transport abstraction in place; dev log transport used locally) |

## Architecture (short version)

- **Frontend:** React 18 + TypeScript SPA (Vite), served as static assets.
- **Backend:** Hono API on Cloudflare Workers (single Worker serves API + SPA).
- **Database:** Cloudflare D1 (SQLite), versioned migrations in `api/migrations/`.
- **File storage:** Cloudflare R2 with per-user key prefixes, quarantine → scan → publish flow, short-lived HMAC-signed download URLs.
- **Crypto:** Web Crypto only — PBKDF2-SHA256 (600k iterations) password hashing, HMAC-SHA256 signing, AES-256-GCM envelope field encryption via HKDF-derived per-record keys.

See [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY.md](SECURITY.md), [DATABASE.md](DATABASE.md), [IMPORT_ENGINE.md](IMPORT_ENGINE.md), [RECOVERY_SYSTEM.md](RECOVERY_SYSTEM.md), [PRIVACY.md](PRIVACY.md), [THREAT_MODEL.md](THREAT_MODEL.md), [DEPLOYMENT.md](DEPLOYMENT.md).

## Development

```bash
npm install

# apply local D1 migrations
npm run db:local:migrate

# build SPA (required once — the Worker serves ../dist) and start the dev server
npm run build:web
npm run dev:api          # http://localhost:3000

# optional: Vite dev server with hot reload on :5173, proxying /api to :8787
npm run dev:api &        # API on 8787
npm run dev:web          # SPA on 5173
```

Local development runs with `DEV_MODE=1` and `REQUIRE_EMAIL_VERIFICATION=0` (see `api/wrangler.toml`). These flags are **refused on non-loopback origins** by `loadConfig`, so they cannot leak into production behavior. In dev mode, password-reset links are surfaced in the API response (logged email transport has no inbox).

### Verification

```bash
npm run check    # TypeScript strict typecheck (API + SPA + shared)
npm test         # 39 unit tests (crypto, import parsers, readiness, case numbers, scam analyzer)
npm run build    # SPA + Worker bundle
node scripts/smoke.mjs   # 57-check end-to-end smoke test against a running dev server
```

## Creating the first admin

Admin is a role flag on `users`. Promote a user directly in the database:

```bash
npx wrangler d1 execute DS_DB --local --config api/wrangler.toml \
  --command "UPDATE users SET role='admin' WHERE email='you@example.com'"
```

## Honest limitations

- Import parsing covers Facebook's JSON export variant; HTML exports are recognized but only minimally parsed (users are directed to re-download in JSON).
- Archive formats drift over time; the importer is defensive and reports per-file outcomes rather than silently dropping data.
- Email sending requires wiring a transactional provider in `api/src/lib/mailer.ts` (extension point documented).
- MFA enrollment UI is not implemented (backend schema is ready).
- Monetization/plans are not implemented.
- Scam Shield's web search needs a server-side Exa key (`EXA_API_KEY`); without it the
  feature reports that search is unconfigured instead of returning empty results.

DigitalShield is an independent tool and is not affiliated with, endorsed by, or connected to Meta or any other platform.
