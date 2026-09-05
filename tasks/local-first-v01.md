# Local-first PatchCTL v0.1

Direct maintainer request: implement the CLI-first proposal/review/local-execution MVP.

## Existing architecture

The imported implementation is a server-connected content operations application:
server-side source secrets, reads, validation, and transactional apply; the review UI
can approve and apply. It is not the requested local-first v0.1. Retain Tenant naming
and existing approval, isolation, receipt, and atomicity guarantees during migration.
The existing AGPL-3.0-only license is preserved pending provenance review; do not
relicense inherited code merely by replacing LICENSE.

## Progress

- Added local CLI connect/init/resources/schema/list/get and agent-guide.
- Native credential adapter, strict non-secret config, explicit environment fallback.
- Explicit table/column selection; supported single-column keys required.
- PostgreSQL schema inference and selected-column reads with precision-preserving output.
- Real isolated PostgreSQL integration and Windows native credential tests pass (18 CLI tests).
- Native binding uses the standard constructor: its custom-target Windows constructor
  overwrites existing credentials with a placeholder. Regression test covers reopening.
- PostgreSQL adapter extracted to `packages/postgres`; portable clients/contracts
  remain unable to import database or keyring adapters. Existing checks were preserved.
- Local draft start/status, typed updates, dry run, field diff, validation, atomic
  draft file replacement, and serialized draft access.
- Whole-row SHA-256 concurrency hash stays in PostgreSQL; only selected before/after
  values leave the database. Integration test detects changes to unselected fields.
- Root typecheck, Prisma validation, architecture checks, API-client Node tests,
  E2E TypeScript, and production build passed for phase 1.
- Root suite first hit an existing concurrent receipt-table creation race on the
  fresh fixture database; rerun with the table present passed all 180 tests.

- Local phase 2 checks passed: 21 CLI tests (including real PostgreSQL and Windows
  Credential Manager), repository typecheck, and architecture checks. Self-review
  added safe PostgreSQL value-error mapping and keyring write/readback verification.
- macOS/Linux native keyring runs remain unverified on this Windows host.
- Final production build passed after the draft increment. Formatting and
  `git diff --check` passed. No UI behavior changed, so no new browser run was made.

## Remaining

- Adapt API and web review to uploaded immutable local proposals without content DB access (phase 3).
- Local sync, transactional apply, durable receipt recovery, result reporting (phase 4).
- Example database, complete docs, install packaging, end-to-end browser workflow (phase 5).

Not released, pushed, or deployed. The full v0.1 acceptance loop is not yet implemented.
