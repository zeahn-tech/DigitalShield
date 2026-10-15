# Recovery System

User-side recovery **management and documentation**. DigitalShield is not the entity restoring any account; every surface states this explicitly.

## Recovery cases

- Created via Emergency Mode (`/recovery/emergency`): 3-step wizard — what happened (11 problem types) → when discovered / last known login / what changed / prior attempts → review & create.
- **Case number:** `DS-<PLATFORM>-<YEAR>-<6-digit sequence>` (e.g. `DS-FB-2026-000184`), allocated race-safely (UNIQUE-index retry loop).
- **Status workflow:** open → investigating → user_action_required → submitted_to_platform → waiting_for_platform → resolved / closed (all user-adjustable; every change appends a timeline event).
- Case detail page: summary, status control, evidence table, timeline, official resources, packages.

## Evidence vault

- Upload screenshots, emails (as files), notifications, documents.
- Each item: original filename preserved, MIME, size, source category, description, **SHA-256 fingerprint**, upload time.
- Stored in R2 (`u/<user>/published/…`), served only via short-lived signed URLs as `attachment` + `nosniff`. Originals are never altered by the app.
- Adding evidence appends a timeline event automatically.

## Recovery Assistant

8-step guided flow (`/recovery/assistant`): secure email → secure phone → check security notifications → preserve evidence → official platform process → identity verification (official flows only) → record reference numbers → monitor the case. Each step explains *why* and *how*; the page carries the anti-scam rule prominently.

## Official resource directory

- `platform_resources` table: platform, title, official URL, purpose, region, status, **last_verified_at**.
- Seeded from official sources (`api/src/resources/seed.ts`), displayed to users with verification dates.
- Admins add/verify/retire resources through the admin portal — **updates are live without a deployment** (satisfies the "no hard-coded recovery URLs" requirement).
- Users see only `status != 'retired'` rows.

## Recovery Package

- `POST /api/recovery/cases/:id/package` assembles: case summary, identity info, evidence list with hashes, full timeline, verified official resources, generation timestamp, and a clear independence disclaimer.
- Rendered as a printable HTML document (browser print → PDF); stored in R2; preview served with a strict `default-src 'none'` CSP; download served as attachment.
- **Never includes credentials** — none are stored, by design; smoke test asserts no credential fields appear in the output.

## Scam Shield (security module)

- `analyzeMessage` matches 11 indicator categories (password/OTP/recovery-code/cookie requests, guaranteed recovery, official claims, crypto payments, remote access, ID-document requests, urgency, off-platform moves).
- Output: matched indicators with severity + risk level + mandatory non-verdict disclaimer. A test asserts the disclaimer never declares certainty.
- Users can report suspicious offers (stored for admin abuse review with detected indicators).
