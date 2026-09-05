# PatchCTL implementation progress

Work is performed sequentially on `main`, following issue #1. Each feature receives focused verification and a commit. GitHub issues stay open until their acceptance criteria are verified.

| Order | Issue | State |
| --- | --- | --- |
| 1 | #2 Tenant authorization | Implemented; verification in progress |
| 2 | #3 Postgres connection | Implemented; local database check pending |
| 3 | #4 Content schema | Implemented; 28 focused/integration tests pass |
| 4 | #5 Content reads | Implemented; 32 focused/integration tests pass |
| 5 | #6 Patch persistence | Implemented; 42 focused/integration tests pass |
| 6 | #7 Text corrections | Implemented; Unicode-aware text validation |
| 7 | #10 Review UI | In progress |
| 8 | #11 Approval/rejection | Pending |
| 9 | #12 Conflicts | Pending |
| 10 | #13 Atomic apply | Pending |
| 11 | #14 Audit | Pending |
| 12 | #15 CLI | Pending |
| 13 | #8 Bulk changes | Pending |
| 14 | #9 Missing content/translations | Pending |
| 15 | #17 English-summary demo | Pending |
| 16 | #16 Enum/relation assignment | Pending |
| 17 | #18 Release verification | Pending |
| 18 | #19 Scheduling | Pending |
| 19 | #20 Status transitions | Pending |

## Blockers

- 2026-09-05: GitHub Projects updates are blocked: the active CLI token has `repo` but lacks `project`. `gh project item-list 7 --owner hadoan` fails with insufficient scopes. Remedy: `gh auth refresh --hostname github.com --scopes project`. Continue implementation and issue comments; mirror status here until the board can be synchronized.

## Verification

- #2: 18 access-control tests pass; patches package typecheck and Prisma validation pass. The new boundary validates signed human credentials, rechecks membership, and restricts hashed agent keys to declared scopes and connections.
- Root typecheck currently stops in pre-existing Todo integration tests: lines 57, 61, 85 pass `{}` where parsed query input requires `page` and `pageSize`. Tracked for #18; this does not prevent focused patches checks.
- Docker server is unavailable on both configured local contexts. Installed PostgreSQL directories contain no postgres/initdb/pg_ctl binaries. Real database verification remains pending while checking a local runtime alternative.
- No production database changes are performed; database verification uses isolated local fixtures.
- #2 production build and application typecheck passed. #3 adds configured Tenant-owned secret references, connection probing, redacted source APIs, and setup documentation. Focused suite: 21 passing tests.
- Docker blocker resolved by starting the installed Docker Desktop. A dedicated test Postgres container is being provisioned on loopback port 55437.
- #3/#4 verified against Postgres 17 in `patchctl-test-20260905`; migrations applied only to isolated `patchctl_test`. Schema checks verify the primary key, field types, Tenant column, and drift fingerprint. Patches/app typechecks pass; 28 focused/integration tests pass.
