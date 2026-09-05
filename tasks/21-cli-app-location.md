# #21 — CLI application location

Ticket: https://github.com/hadoan/PatchCTL/issues/21

## Scope and decisions

- Move the executable CLI to `apps/cli`; retain package/bin name `patchctl` and existing commands.
- Maintainer follow-up: use strict TypeScript in `src/cli.ts`, compiled to `dist/cli.js`.
- Build the CLI during local setup and CI; CLI/launcher test scripts compile before running.
- Keep native fetch for now: the shared API client exports unbuilt TypeScript and lacks redirect
  and injected-fetch options; the auth client implements human login/refresh rather than agent keys.
- Keep the API/review UI in `apps/app` and shared contracts/use cases/persistence in packages.
- Update launcher, full-stack demo entrypoint, lockfile, and current documentation.
- Preserve historical implementation notes as records of their original delivery.
- Add a disposable, offline launcher regression test using the real CLI package; no live session
  or human approval is used by that test.
- Work on `main`; leave Project 7 In review for the maintainer. No push or release requested.

## Verification

- Passed frozen-lockfile offline installation; only the moved importer/link changed in the lockfile.
- Passed strict CLI and root typechecks, plus the PatchCTL browser-suite typecheck.
- Passed 163 repository tests against the verified disposable loopback `patchctl_test` database.
- Passed 11 compiled-CLI tests and 5 launcher tests, including real subprocess help/stdin checks.
- Passed the real CLI/browser/Postgres scenario: ten English summaries, approval, rejection,
  conflict, provenance, bulk translations, enum/relation assignment, and authorization denials.
- Passed Prisma validation, architecture checks, changed-file formatting, and production build.
- Passed direct compiled CLI and `pnpm local:agent --help` smoke checks.
- Self-review found no outstanding actionable defect in this scope. The TypeScript conversion
  explicitly rejects non-object read queries and preserves HTTP error exit codes for malformed
  error bodies; both boundary cases have regression tests.
- The first launcher-test fixture symlinked the executable, which prevented Node's main-module
  guard from running. Corrected the fixture to copy the entrypoint and link only dependencies;
  the corrected tests pass. No production behavior was changed for that fixture issue.
- Local setup's added build step was inspected; full setup was not rerun to avoid selecting a new
  interactive dataset. Mock-only review tests were not rerun; the real full-stack scenario passed.
- Existing dependency/peer, module-type, and Browserslist age warnings remain. No remote CI run,
  Linux verification, standalone lint pass, or human acceptance is claimed.

## Blockers

None currently.

## Delivery

Local `main` implementation ready for maintainer review; no push or release. The subsequent
shared-client architecture request is research only and does not expand this refactor into
changes to the shared API/auth packages.
