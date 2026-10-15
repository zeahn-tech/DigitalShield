# Contributing

## Ground rules

1. **Honesty is a feature.** Never fake capabilities. No "guaranteed recovery," no fake security scores, no pretending an integration exists. If something isn't implemented, the UI and docs say so.
2. **Never request or store platform credentials.** No field, endpoint, or flow should ever accept a Facebook/system password, cookie, or session token.
3. **Least privilege everywhere.** New queries must scope to the authenticated user (`c.get("userId")`). Admin code must not gain user-vault access.
4. **Never log secrets.** The redacting logger handles it — don't bypass it.
5. **Never silently discard user data.** Unsupported/unparsed means *reported*, not dropped.

## Workflow

- Branch from `main`; small, focused commits with conventional prefixes:
  `feat(auth): …`, `fix(import): …`, `test(security): …`, `docs(security): …`.
- Before opening a change:
  1. `npm run check` (strict typecheck)
  2. `npm test` (unit tests)
  3. `npm run build`
  4. `node scripts/smoke.mjs` for anything touching API surface
- Database changes: append a new migration in `api/migrations/`; never edit applied ones; keep them backward-compatible with the previous Worker version.
- Security-sensitive decisions get a paragraph in the relevant doc (SECURITY.md / THREAT_MODEL.md) explaining trade-offs — see the zero-knowledge-encryption decision for the expected level of detail.

## Code style

- TypeScript strict mode (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`).
- Prefer small, boring modules; defensive parsing with explicit skip-reasons.
- UI text: plain, truthful, no fake "hacker" aesthetics, accessible labels.
