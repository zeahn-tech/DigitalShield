# Database

D1 (SQLite) schema; versioned migrations in `api/migrations/`. All timestamps are ISO-8601 UTC strings; ids are UUIDs.

## Entity relationships

```text
users 1─n sessions
users 1─n email_tokens
users 1─n platform_accounts
users 1─n digital_assets ──n asset_tags
users 1─n imports ──n import_files, 1─1 import_jobs
users 1─n recovery_cases ──n recovery_events
recovery_cases 1─n evidence_items
recovery_cases 1─n recovery_packages
users 1─n notifications
users 1─n security_events
users 1─n privacy_requests
users 1─n scam_reports (nullable — abuse reports)
(no owner) platform_resources, audit_logs (actor_user_id nullable), rate_limits
```

## Tables (summary)

| Table | Purpose |
|---|---|
| `users` | Credentials (PBKDF2 hash), role (`user`/`admin`), verification state, lockout counters |
| `email_tokens` | Single-use hashed tokens for email verification + password reset |
| `sessions` | Hashed session tokens, IP hash, expiry, revocation |
| `platform_accounts` | Per-platform identity/recovery info; `recovery_phone_enc` envelope-encrypted |
| `digital_assets` | Vault items: kind, source (`upload`/`import`/`manual`), content hash, R2 key, `is_important` |
| `asset_tags` | Tag strings per asset |
| `imports` / `import_files` / `import_jobs` | Import runs, per-file parse/skip report, job status for a future async runner |
| `recovery_cases` | User-side cases with `DS-XX-YYYY-NNNNNN` numbers and status workflow |
| `recovery_events` | Case timeline (note / status_change / evidence_added / attempt / platform_contact) |
| `evidence_items` | Immutable evidence records: original filename, SHA-256, source, R2 key |
| `recovery_packages` | Generated package documents (R2-backed HTML) |
| `platform_resources` | Official recovery links, per-resource verification date/status — admin-editable without deploys |
| `security_events` | Login success/failure, lockout, password change (IP hashed, UA truncated) |
| `scam_reports` | User-reported suspicious recovery offers + detected indicators |
| `notifications` | In-app notifications (never contain secrets) |
| `audit_logs` | Append-only sensitive-action log; no API write path exists for updates/deletes |
| `privacy_requests` | Export/deletion requests with status lifecycle |
| `rate_limits` | Fixed-window counters keyed by bucket string |

## Conventions

- Soft enforcement of tenancy: every user-owned row carries `user_id`; queries always filter by the authenticated id (belt-and-braces: FK cascade deletes).
- `ON DELETE CASCADE` from `users` makes account deletion complete; storage cleanup handled in the admin deletion flow (evidence/packages keys deleted from R2 before/with the row deletion).
- Case numbers are unique (`UNIQUE` index) and allocated with a max+1 retry loop (`allocateCaseNumber`).
- Duplicate import protection: `digital_assets.content_hash` stores `sha256(dedupeKey)`; engine checks `(user_id, content_hash)` before insert.
- No table stores file contents; all media lives in R2.

## Migrations

```bash
npm run db:local:migrate                     # local (miniflare) state
npx wrangler d1 migrations apply DS_DB --remote --config api/wrangler.toml  # production
```

Migration files are append-only: never edit an applied migration; add a new one.
