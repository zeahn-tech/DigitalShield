# Import Engine

Preserves **user-authorized, user-downloaded** platform archives. DigitalShield never automates platform logins, never scrapes, and never asks for platform credentials.

## Pipeline

```text
User downloads official archive (e.g. Facebook "Download Your Information", JSON)
        ↓
SPA extracts ZIP client-side (fflate; bounded to MAX_IMPORT_FILES=200)
        ↓
POST /api/imports (multipart, per-file archive paths preserved)
        ↓
Validation (count/size caps; friendly errors; "your original file has not been modified")
        ↓
Format detection (detect.ts) — conservative; claims a format only on structural match
        ↓
Parser (facebook.ts) — defensive; tolerates format drift; never throws on hostile shapes
        ↓
Normalization (kind/title/timestamp) + duplicate detection (sha256 of dedupe key)
        ↓
Persistence (digital_assets rows) + per-file report (import_files)
        ↓
Profile merge into platform_accounts (best-effort, non-destructive)
        ↓
Audit events (IMPORT_STARTED/COMPLETED/FAILED) + in-app notification
```

## Supported formats

| Format id | Coverage |
|---|---|
| `facebook-json-v1` | `posts_v2`-style posts, media metadata arrays (uri/creation_timestamp, nested), profile/personal_information arrays |
| `facebook-html-limited` | Recognition + index-document capture only; users directed to download JSON for full preservation |
| `generic-json` | Honest rejection with explanation |

## Defensive guarantees

- Unknown/unrecognized files are **listed with reasons**, never silently dropped (`import_files.status = skipped` with reason; UI shows the report).
- Invalid JSON per-file → reported, other files still processed (`completed_with_warnings`).
- Duplicate assets (same content within the archive or against the user's vault) are skipped and counted.
- Hostile shapes (nulls, wrong types, deep nesting) cannot crash the parser (unit-tested).
- Direct binary media (jpg/png/mp4/mov) inside archives are preserved as assets.

## Extending to a new platform

1. Add the platform to `api/src/lib/platforms.ts` (mark `supported: true` when ready).
2. Add a format id + detector logic in `detect.ts`.
3. Add a defensive parser module (same contract: tolerate drift, report skips).
4. Wire it in `engine.ts::processFiles` switch.
5. Unit tests with fixtures of real export variants (including malformed ones).

The UI, jobs, audit, notifications and vault are platform-agnostic — no other changes needed.
