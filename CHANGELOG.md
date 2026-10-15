# Changelog

All notable changes are documented here. Format: Keep a Changelog, semver.

## [0.1.0] — 2026-10-15 (initial implementation)

### Added
- Secure authentication: email/password with PBKDF2-SHA256 (600k iterations), email verification, password reset, session management with revocation, lockout, rate limiting, generic error messages, no-credential-logging guarantees.
- Dashboard with explainable recovery-readiness scoring (weights sum to 100; every item shows why).
- Digital vault: uploads (quarantine → scan → publish), tags, Important marking, search/sort/filter, SHA-256 deduplication, signed short-lived download URLs.
- Facebook archive import engine: client-side ZIP extraction, conservative format detection, defensive JSON parsers, per-file skip reporting (never silent data loss), duplicate detection, profile merge, import history.
- Recovery system: Emergency Mode wizard, unique `DS-XX-YYYY-NNNNNN` case numbers, status workflow, timeline, immutable evidence with SHA-256, official resource directory (admin-maintained, verified-dated), 8-step Recovery Assistant, Recovery Package generator (printable HTML).
- Recovery Scam Shield: 11-indicator analyzer (non-verdict by design), warning-sign reference, suspicious-offer reporting.
- Privacy & Data: storage summary, full JSON export, deletion requests with admin workflow.
- Admin portal: overview aggregates, user directory (no vault contents access), resource CRUD + re-verification, scam reports, audit log viewer, privacy-request processing.
- Security architecture: CSP/HSTS/nosniff headers, CSRF same-origin enforcement on all mutations, envelope-encrypted sensitive fields, append-only audit log, redacting logger.
- React 18 SPA with mobile-first responsive design, accessibility basics (skip link, focus states, aria attributes, reduced motion), honest copy throughout ("DigitalShield cannot restore accounts").
- Verification: 39 unit tests, 57-check end-to-end smoke test, strict TypeScript typecheck, production builds.
- Documentation: README, ARCHITECTURE, SECURITY, PRIVACY, THREAT_MODEL, DATABASE, IMPORT_ENGINE, RECOVERY_SYSTEM, DEPLOYMENT, CONTRIBUTING.

### Known limitations (honest)
- MFA schema-ready but not enrollable; endpoint returns 501.
- Email transport abstraction present; no provider wired (dev log transport locally).
- HTML Facebook exports recognized but only minimally parsed (JSON recommended).
- Monetization/plans not implemented.
