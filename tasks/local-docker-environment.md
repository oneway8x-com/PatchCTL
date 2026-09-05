# Local Docker environment and demo data

## Scope

Direct maintainer request on local `main`: prepare a working local environment and seed data.
Use a dedicated Docker Postgres service and host Next.js, preserving other containers and files.
No production deployment, remote database, GitHub mutation, or content approval is in scope.

## Implementation

- Added isolated Compose configuration, local setup/start/info/agent/stop commands, safety tests,
  and local development documentation. Reused existing migrations, seed persistence, and CLI.
- Local database uses loopback port 55438; interactive app uses 3109. Existing demo default remains 3108. Setup overrides both Prisma URLs and never loads or overwrites ambient environment files.
- Fresh setup adds an isolated Tenant/dataset instead of deleting previous data. Human sign-in
  uses existing terminal OTP; source and human credentials are never printed by the helpers.

## Verification

- Passed: Compose configuration validation, dedicated container health, all three local migrations,
  Prisma generation, and fixture seed. SQL verification confirms 12 rows and ten missing summaries.
- Passed: four launcher tests, including remote Prisma URL override, private session path checks,
  rejection of unrelated database sessions, and invalid server-port rejection before startup.
- Passed: root typecheck, Prisma validation, architecture checks, 163 repository tests, and nine
  CLI tests. Regression tests used the separate existing loopback `patchctl_test` database.
- Passed: `pnpm local:stop` stops only the dedicated service without removing its volume/data.
- Passed: production build, restart from stopped Postgres, HTTP 200 login page, CLI source access,
  and scoped reads of all ten missing summaries after restart. Setup refuses an occupied app port
  before starting database/migration/seed work.
- Found a Windows pnpm runner stdin issue: piped JSON reaches the CLI empty. Direct Node helper
  invocation succeeds with the same input; documentation now uses that verified path for piping,
  while pnpm remains supported for `--file` and non-stdin commands. No validation was relaxed.
- Passed: direct CLI proposal creates a pending ten-record patch, with SQL confirming all ten
  summaries remain missing. Human fixture access returns HTTP 200; agent approval returns 403.
- Passed: existing OTP request and verification flow resolves the seeded Tenant and authorizes
  review access. No credential or OTP was committed or included in public output.
- Passed: focused formatting and self-review of source paths, secret handling, isolated targets,
  and non-destructive setup/stop behavior. Ctrl+C stopped the interactive app and released 3109.
- Passed: existing full-stack CLI/browser/Postgres demo on separate test data (one scenario,
  41.8 seconds), including real apply, rejection and conflicts. The interactive fixture was not
  used by that test and its ten-record proposal remains pending for human review.
- Final self-review pins development-mode OTP and same-origin API calls despite inherited
  production environment settings; the launcher environment regression test covers both overrides.
- Passed: ten local documentation links/anchors. Remote CI and deployment were not run.

## Blockers and handoff

None identified. Existing legacy Compose configuration is intentionally left unchanged.
The interactive fixture contains a pending patch for later human review; no content was applied.
Docker Postgres remains healthy on loopback 55438. The interactive app was stopped after smoke
checks so the maintainer can run `pnpm local:start` in their own terminal and see login codes.
Implementation commit: `24266db`; follow-up verification and environment hardening accompany
this record. No push or production changes. The agent credential expires one hour after setup;
human OTP login can still review the pending patch with the selected fixture.
