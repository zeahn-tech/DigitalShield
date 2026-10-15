# Privacy

DigitalShield stores potentially highly sensitive personal information. Privacy-by-design commitments below reflect the actual implementation.

## Data minimization

Collected only what serves protection/recovery: account email, optional platform identity/recovery info, user-imported/uploaded files and metadata, case/evidence records the user chooses to create, and operational security/audit events (with IP stored only as a salted hash and user agent truncated).

## What the user can see and do

- **Privacy & Data page** (`/privacy`): live counts of stored data (assets, bytes, imports, platform accounts, cases, evidence), storage footprint, and account status.
- **Export:** one-click JSON export of everything stored about them — profile, vault metadata (files listed by hash), imports, cases, evidence records, events, notifications, and their audit trail. Sensitive fields (envelope-encrypted phone) are decrypted **for the owner's own export**.
- **Deletion:** self-service deletion request with explicit confirmation; an administrator completes it, which cascades all user-owned rows and removes R2 objects. The user is told plainly that deletion is irreversible and prompted to export first.
- **Request history:** users see the status of their own privacy requests.

## Encryption & access

See SECURITY.md. Summary: TLS in transit, envelope-encrypted sensitive fields at rest, PBKDF2 password hashes, per-user storage prefixes, signed expiring download URLs, least-privilege authorization on every query.

## Logging discipline

No passwords, tokens, cookies, OTPs, or credentials are ever logged (redacting logger + schema design). Notification bodies never contain secrets.

## Administrator access

Administrators cannot browse vault contents, evidence files, or recovery packages through any endpoint (enforced by absence — verified by smoke test). Administrative access to user content, if ever required, must be built as an explicit, audited privileged workflow — none exists today.

## Honest limitations

- No outbound email provider is wired in this build (dev log transport); wire one before production and update this document.
- Deletion processing is administrator-assisted, not fully automated with a grace-period workflow.
- Data residency/retention policies beyond user-driven deletion are not implemented; they must be defined with counsel before launch, along with GDPR/CCPA procedural compliance (lawful basis, DPO contact, breach procedure).
