# #22 — Shared PatchCTL API client

Ticket: https://github.com/hadoan/PatchCTL/issues/22

## Scope

- Portable compiled API-client package, typed PatchCTL subpath, public contracts.
- CLI and Next.js browser use the same methods; credentials are injected per request.
- Preserve server use cases, authorization, conflict-safe apply, receipts, and audit.
- No human auth redesign, additional SDK package, backend service, publishing, or push.
- Work on `main` and leave In review for the maintainer.

## Verification and delivery

- Portable client increment: contracts/API-client builds and patch-feature typecheck passed.
- API-client suite: 39 tests passed (22 existing, 17 new shared-client cases).
- Native Node package exports and real HTTP redirect/timeout checks: 2 tests passed.
- Root build/typecheck and CI now include the compiled API-client package.
- CLI and browser callers now use the typed client with per-request credential adapters.
- CLI: 12 checks passed; local launcher: 5 checks passed.
- Full unit/integration suite against the isolated Docker `_test` database: 180 passed.
- Root and browser-test TypeScript checks, Prisma validation, and architecture checks passed.
- Mocked Chromium review UI: 8 tests passed, including token rotation and malformed-response denial.
- Full-stack Chromium/compiled CLI/Postgres demo passed: ten English summaries, rejection,
  conflict blocking, 50-record translation, enum/relation assignments, authorization and audit.
- Inspected the rendered review and ten-proposed-updates screenshots; before/after values,
  affected counts, review controls, and audit remain visible with the shared client.
- Focused self-review against `306ecac`: no remaining actionable findings after the fixes below.
  This is not independent human acceptance or a remote CI result.
- Production `pnpm build` passed (internal packages, compiled CLI, and Next.js).
- Changed implementation/test formatting checks and `git diff --check` passed.
- Delivery: local `main` commits only; no push, publication, or remote CI execution.
  Ticket remains open and is handed off In review for the maintainer.

## Resolved verification issues

- Next.js's old TypeScript alias and cached module resolution bypassed compiled package exports.
  Removed the API-client source alias/transpile entry and rebuilt the disposable Next.js cache.
- Schema discovery can expose zero readable fields. The output contract now allows this without
  weakening the separate configuration validator; a regression test covers it.
- The malformed-response browser assertion initially also matched Next.js's route announcer.
  Scoped it to the actual error content; all eight cases pass.
- The first root test invocation omitted the explicit test DB variables and failed in Todo setup.
  Reran with both Prisma URLs and the PatchCTL test URL targeting isolated Postgres; all 180 pass.

## Blockers

- Optional lint check is blocked by pre-existing repository setup: ESLint 9 has no
  `eslint.config.js/mjs/cjs` configuration. No lint pass is claimed; no unrelated lint migration.
