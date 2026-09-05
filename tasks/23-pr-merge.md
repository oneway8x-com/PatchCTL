# PR #23: include the full local-first working tree

The maintainer explicitly requested committing all current changes, pushing them, and merging
PR #23 into main. The scope now includes local client pairing, immutable submission, review UI,
metadata migration, execution-result API, and legacy compatibility gating in addition to the
already-pushed CLI/shared-client/documentation commits.

Local `sync` execution remains unimplemented. This is an incremental merge, not a completed
local-first release. Human approval in the new flow must leave the user database unchanged.

## Verification

- Prisma generation, schema validation, and migration deployment passed against the verified
  disposable loopback `patchctl_test` database. No interactive-demo or production migration.
- Internal package builds and application/CLI typechecks passed.
- E2E typechecking initially found a missing declared `zod` dependency; added it to the E2E
  package and lockfile. The new local config is also included in its TypeScript check; passed.
- Root unit/integration suite: 180 passed.
- CLI suite: 20 passed, one native-keyring test explicitly skipped in this run.
- Compiled API-client native Node checks: two passed.
- Launcher checks initially failed because the fixture copied only `cli.js`; it now copies the
  full compiled directory. All five checks passed after that fixture correction.
- Local submission/human-review browser scenario passed, including denied agent approval and
  unchanged target content after human approval.
- Legacy browser regressions and final production build are in progress.

## External limitation

GitHub Actions could not start because of an account-level restriction. No remote CI pass is
claimed. Local verification is recorded separately. Merge must use GitHub's ordinary merge path,
without administrator override or changes to required branch protections.
