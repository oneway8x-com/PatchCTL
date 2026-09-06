# Issue 24: local Postgres credentials

## Scope

Make local Postgres source configuration the default CLI path. Persist only source metadata and an
OS-credential reference, keep DSNs out of hosted contracts/requests/output, and retain the existing
server-connected implementation only through an explicit compatibility namespace.

## Decisions

- Preserve the existing local Tenant/draft keys during migration, but add explicit source
  `{ id, name, type, credentialRef }` metadata to each local connection.
- Use OS credential service `patchctl` with account `patchctl/source/<source-id>`.
- Keep `PATCHCTL_DATABASE_URL` as a documented process-only fallback.
- Keep old `<tenant>/database` keyring entries readable through an atomically persisted
  migration record; copy the secret to the canonical source-specific key on first use.
- Reject credential references that do not exactly match their source ID.
- Route `sources` and `schema` locally; a schema argument is always a source name/ID,
  with an optional second resource argument.
- Use `server ...` only for old hosted commands whose server owns a customer DSN.
- Keep local-first `login`/`submit` top-level because they synchronize non-secret review
  documents and never grant the hosted service source connectivity.
- Keep unsupported `sync` out of command dispatch so it cannot make a preliminary HTTP request.
- Reject unknown fields in hosted source/schema response contracts and redact
  credential-shaped hosted error details.

## Verification

Passed:

- `pnpm --filter patchctl test`: 23 passed; native keyring and disposable real-Postgres
  integrations skipped because `PATCHCTL_TEST_KEYRING` and
  `PATCHCTL_LOCAL_TEST_DATABASE_URL` were not supplied.
- `pnpm --filter @corely/api-client test --run`: 41 passed.
- `pnpm --filter @corely/api-client test:node`: 2 passed.
- `pnpm local:test`: 6 passed.
- `pnpm typecheck`.
- `pnpm arch:check`.
- `pnpm --filter @corely/data exec prisma validate`.
- `pnpm --filter @corely/e2e exec tsc -p tsconfig.patchctl.json`.
- `pnpm build`.
- `git diff --check`.

Environment-blocked:

- `pnpm test`: 138 passed and 43 database-dependent tests skipped, but the Todo
  integration suite failed during setup/cleanup because the configured local Prisma
  database user was denied access. PatchCTL unit/API-client suites passed in this run.

## Limitations

Local apply/sync and source-metadata-only synchronization remain later migration phases. The
native keyring adapter supports macOS Keychain, Windows Credential Manager, and Linux Secret
Service/kernel keyring through `@napi-rs/keyring`; platform round-trip tests remain
environment-dependent.
