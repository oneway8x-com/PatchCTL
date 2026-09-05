# PatchCTL implementation progress

Work was performed sequentially on local `main`, following issue #1, with per-feature commits. Implemented tickets remain open for the requested human review. Code has not been pushed; remote CI is not claimed to have run.

| Order | Issue                           | State                                                    |
| ----- | ------------------------------- | -------------------------------------------------------- |
| 1     | #2 Tenant authorization         | Implemented and verified locally; ready for human review |
| 2     | #3 Postgres connection          | Implemented and verified locally; ready for human review |
| 3     | #4 Content schema               | Implemented and verified locally; ready for human review |
| 4     | #5 Content reads                | Implemented and verified locally; ready for human review |
| 5     | #6 Patch persistence            | Implemented and verified locally; ready for human review |
| 6     | #7 Text corrections             | Implemented and verified locally; ready for human review |
| 7     | #10 Review UI                   | Implemented and verified locally; ready for human review |
| 8     | #11 Approval/rejection          | Implemented and verified locally; ready for human review |
| 9     | #12 Conflicts                   | Implemented and verified locally; ready for human review |
| 10    | #13 Atomic apply                | Implemented and verified locally; ready for human review |
| 11    | #14 Audit                       | Implemented and verified locally; ready for human review |
| 12    | #15 CLI                         | Implemented and verified locally; ready for human review |
| 13    | #8 Bulk changes                 | Implemented and verified locally; ready for human review |
| 14    | #9 Missing content/translations | Implemented and verified locally; ready for human review |
| 15    | #17 English-summary demo        | Implemented and verified locally; ready for human review |
| 16    | #16 Enum/relation assignment    | Implemented and verified locally; ready for human review |
| 17    | #18 Release verification        | Implemented and verified locally; ready for human review |
| 18    | #19 Scheduling                  | Implemented and verified locally; ready for human review |
| 19    | #20 Status transitions          | Blocked: publishing semantics required                   |

## Blockers

- 2026-09-05: GitHub Projects updates are blocked: the active CLI token has `repo` but lacks `project`. `gh project item-list 7 --owner hadoan` fails with insufficient scopes. Remedy: `gh auth refresh --hostname github.com --scopes project`. Continue implementation and issue comments; mirror status here until the board can be synchronized.
- 2026-09-05: Optional lint execution cannot start: installed ESLint 9 has no root `eslint.config.js/mjs/cjs`. No new lint configuration is invented during feature work. Typecheck, behavior tests, Prisma validation and build remain the release gates.
- 2026-09-05 (#20): The repository has no target application's publishing policy, permitted transition map, validation contract, or side-effect integration. The ticket explicitly requires these semantics to be confirmed before implementation. Do not expose publishing/status fields as generic editable enums as a workaround. Needed to unblock: target application/source, allowed states/transitions, required business checks, human roles and any transactional side-effect API. No publishing engine or raw-SQL status shortcut was implemented; see `docs/patchctl-publishing-blocker.md`. Continue with cumulative verification and issue handoff.

## Verification

- #2: 18 access-control tests pass; patches package typecheck and Prisma validation pass. The new boundary validates signed human credentials, rechecks membership, and restricts hashed agent keys to declared scopes and connections.
- Root typecheck currently stops in pre-existing Todo integration tests: lines 57, 61, 85 pass `{}` where parsed query input requires `page` and `pageSize`. Tracked for #18; this does not prevent focused patches checks.
- Docker server is unavailable on both configured local contexts. Installed PostgreSQL directories contain no postgres/initdb/pg_ctl binaries. Real database verification remains pending while checking a local runtime alternative.
- No production database changes are performed; database verification uses isolated local fixtures.
- #2 production build and application typecheck passed. #3 adds configured Tenant-owned secret references, connection probing, redacted source APIs, and setup documentation. Focused suite: 21 passing tests.
- Docker blocker resolved by starting the installed Docker Desktop. A dedicated test Postgres container is being provisioned on loopback port 55437.
- #3/#4 verified against Postgres 17 in `patchctl-test-20260905`; migrations applied only to isolated `patchctl_test`. Schema checks verify the primary key, field types, Tenant column, and drift fingerprint. Patches/app typechecks pass; 28 focused/integration tests pass.
- #10: production build passes; two Chromium checks pass for queue navigation, 50-record counts, null/empty distinction, safe HTML text rendering and pagination. Existing e2e config targets removed services; the new PatchCTL config runs against current Next.js. UI screenshot visually inspected.
- #11/#12: four Chromium tests pass, including exact-revision approval and hiding agent controls. Focused/integration suite: 56 tests pass. Real Postgres verifies whole-record conflicts, deleted/moved records, and locks blocking concurrent updates until the final transaction releases them.
- #13: 62 tests pass. Real Postgres confirms all-or-nothing rollback, zero writes on conflicts, concurrent apply deduplication, and recovery after target commit succeeds but metadata persistence fails. Patches/app typechecks pass. Target receipt setup is explicit operator SQL, never agent DDL.
- #14: 65 tests pass, including real Prisma membership checks, concurrent decision CAS, atomic audit/state persistence, replay deduplication, history pagination, and audit surviving source-record deletion. All new feature typechecks pass.
- #18: root typecheck and Prisma validation now pass after correcting three Todo test query inputs. Root Vitest discovery no longer runs nested module tests twice. Plain-table safety rejects user triggers, rewrite rules, partitions, row security and cascading writes through editable referenced keys. CI now runs isolated Postgres, CLI and browser checks sequentially around builds. A local overlapping build/demo run failed because rebuilding contracts temporarily removed its output; rerun sequentially (not a product defect).
- #18: sequential real CLI/browser/Postgres regression passed: ten missing summaries, 50-record French-to-English translation, Unicode/multiline values, one text correction plus enum/relation assignment, rejection, conflict, premature apply and revision-tamper denials. Root build passed. GitHub Projects scope was rechecked and remains unavailable; CI is configured but not claimed to have run remotely.

## Final verification and handoff

- 163 repository unit/integration tests pass, including 103 PatchCTL tests against isolated Postgres.
- 9 CLI checks and 7 Chromium tests pass (6 focused review screens plus the full-stack CLI/browser/Postgres scenario).
- Root and browser-suite typechecks, Prisma validation, architecture checks, formatting of the new feature files and the final production build all pass.
- Browser fallback for GitHub Project 7 returned a GitHub 404 under the available browser session. Both available board-access paths were checked; issue comments remain available through the CLI.
- No production content was changed. Dedicated local Postgres `patchctl-test-20260905` remains on loopback port 55437 for review/reseeding; test web servers have stopped. Demo credentials are in ignored `.patchctl-demo` session files and expire after one hour.
- Main changed areas: `packages/modules/patches`, `packages/patchctl-cli`, shared patch contracts, Next.js PatchCTL routes/review screens, metadata migrations, isolated demo/Playwright tests, CI and operator documentation. Existing Todo edits are limited to three test query defaults; the architecture checker received a Windows-safe path fix.
