# Threat Model

Scoped to the current build. Not exposed in-product. Revisit before each major release.

## Assets

Personal identity data (emails, recovery contacts), photos/videos/documents, recovery evidence (screenshots, correspondence), case timelines, account metadata, audit logs, platform-resource directory (tampering → user harm).

## Attacker classes, impact, and mitigations

| Threat | Impact | Likelihood | Existing control | Additional mitigation (backlog) |
|---|---|---|---|---|
| External attacker — credential stuffing / brute force | Account takeover | High | PBKDF2-100k (workerd cap; SECURITY.md), generic errors, per-IP + per-email rate limits, 8-fail lockout, session revocation | Breach-list password checks; MFA enrollment; anomaly-based lockout tuning |
| External attacker — IDOR/API probing | Data exposure | High | Every query scoped to authenticated user id; 404 on foreign resources; smoke-tested IDOR suite | Automated authorization test matrix in CI |
| CSRF / XSS against session | Account takeover | Medium | Same-origin enforcement on all mutations, SameSite=Lax cookies, strict CSP (no inline scripts), no user HTML rendering, outputs React-escaped, signed downloads served `nosniff` attachment | CSP report endpoint; token-based double-submit as defense-in-depth |
| Malicious uploaded file (malware, polyglot, zip-slip) | User/device compromise | Medium | Extension+MIME+magic-byte validation, size caps, quarantine→scan→publish hook, path-randomized keys, never rendered inline | Real antivirus engine behind `scanBuffer`; async scanning with pending state |
| Stolen device / session hijack | Vault exposure | Medium | HttpOnly cookies, short signed URLs, "revoke other sessions", 14-day session expiry | Device-bound sessions; MFA; anomaly alerts |
| Malicious authenticated user (abuse, scam lures via shared packages) | User harm | Low | Packages/evidence are per-user private; scam reports reviewable by admin | Rate limits on package generation; report auto-triage |
| Compromised administrator | Mass data/ops abuse | Low | Admin cannot access vault contents by design; admin actions audit-logged (`ADMIN_*` events) | Mandatory audited break-glass workflow; admin MFA; alerting on admin actions |
| Import parser attack (hostile archive) | Worker crash / data corruption | Medium | Defensive parsers (unit-tested against hostile shapes), per-file and total caps, per-file error isolation | Fuzzing corpus in CI; memory/time budgets per archive |
| Insider threat | Data exposure | Low | No admin content access; append-only audit logs; secrets in platform secret store, never in repo | Audit-log export to WORM storage; separation of duties |
| Resource exhaustion (huge imports, rate abuse) | Availability/cost | Medium | Per-request file/size caps, fixed-window rate limits, bounded loops (5k drafts, 500 timeline rows) | Queues-based async imports; per-user quotas |
| Secret/key leakage (master encryption key) | Field decryption | Medium | Key as platform secret only; per-record HKDF derivation limits blast radius; no keys in code/logs | Key rotation runbook; HSM/KMS-backed keys |

## Deliberately out of scope (by design)

Anything requiring platform-side access (restore/unlock/bypass), because no such capability exists or is sought. The product cannot be tricked into harvesting credentials because no field, endpoint, or flow accepts platform credentials.

## Residual risks accepted for MVP

Administrator-assisted deletion (manual step), no MFA yet, email transport unwired, single-region deployment. Each is tracked in README's honest-limitations section.
