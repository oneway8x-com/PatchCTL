# Issue 26: account-to-local-CLI E2E

## Scope

Add deterministic full-stack coverage for passwordless account registration, operator Tenant
activation, fresh browser authentication, browser-issued local-client credentials, the basic
local-first CLI proposal flow, and human review.

## Decisions

- Extend the real local-first Playwright topology on port 3110 rather than the mocked review suite or
  server-owned-DSN compatibility demo.
- Use the real request-code and verify-code endpoints, replacing only the newest OTP hash in the
  isolated metadata database so the test does not depend on external email or a production bypass.
- Represent Tenant enablement as explicit operator fixture provisioning of an active Tenant, ADMIN
  role, and membership; require a fresh sign-in rather than forging Tenant identity in browser state.
- Create the scoped local-client token through `/patches`, hide it immediately after capture, pass
  it only to authenticated CLI calls, and build child environments from an allowlist so seeded
  session paths, metadata credentials, and unrelated parent secrets are not inherited.
- Use a unique content schema and temporary `PATCHCTL_HOME`; keep the Postgres URL process-local and
  assert that neither it nor a private column reaches the hosted patch document.
- Treat approval as metadata-only because local apply/sync is not implemented.
- Run the local-first config in release CI after the seeded compatibility demo, reusing only its
  isolated metadata session and never its seeded account credentials for this scenario.

## Verification

Passed:

- `pnpm --filter @corely/e2e exec playwright test --config playwright.patchctl-local.config.ts`:
  2 full-stack tests passed after child-environment hardening, including the new account flow
  (17.8s) and existing local flow (2.4s).
- `pnpm typecheck`.
- `pnpm --filter @corely/data exec prisma validate`.
- `pnpm arch:check`.
- `pnpm test` against a migrated disposable loopback `_test` database.
- `pnpm --filter patchctl test` against the same `_test` database.
- `pnpm --filter @corely/api-client test:node`.
- `pnpm --filter @corely/e2e exec tsc -p tsconfig.patchctl.json`.
- `pnpm build`.
- Prettier checks for all changed files and `git diff --check`.

## Limitations

This ticket does not add self-service Tenant activation, production email-provider coverage,
multi-Tenant switching, or local apply/sync.
