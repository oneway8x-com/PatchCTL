# PatchCTL implementation progress

Work is performed sequentially on `main`, following issue #1. Each feature receives focused verification and a commit. GitHub issues stay open until their acceptance criteria are verified.

| Order | Issue | State |
| --- | --- | --- |
| 1 | #2 Tenant authorization | In progress |
| 2 | #3 Postgres connection | Pending |
| 3 | #4 Content schema | Pending |
| 4 | #5 Content reads | Pending |
| 5 | #6 Patch persistence | Pending |
| 6 | #7 Text corrections | Pending |
| 7 | #10 Review UI | Pending |
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

Baseline dependencies and tooling are being checked. No production database changes are authorized or performed; database verification uses isolated local fixtures.
