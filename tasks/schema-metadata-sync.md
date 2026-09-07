# Task: Sync local PostgreSQL schema metadata for web configuration

## Context and scope

- Issue: direct maintainer request (no issue).
- Branch/workflow: existing `main` checkout; implement, verify, commit, and push the requested increment directly to `main`.
- Outcome and acceptance checks: keep PostgreSQL credentials local; normalize and fingerprint local discovery; synchronize tenant-scoped schema metadata; configure managed resources, writable fields, and semantic overrides in the web UI; make paired CLI operations consume the effective server configuration; preserve patch review/apply safety.
- Out of scope: hosted credentials/tunnels, arbitrary SQL, row replication, non-Postgres sources, generic database administration, migration tooling, and local patch apply.

## Implementation notes

- Current behavior: `connect` stores only a credential reference in `~/.patchctl/config.json` and the DSN in the environment or OS keyring. `init` stores a local table/column allowlist. Local commands re-introspect PostgreSQL and intersect discovery with that allowlist. Pairing creates a scoped API key but no durable server source record. Submitted proposals carry only frozen semantic metadata for touched resources. The default server has no synchronized local source catalog or source settings UI.
- Affected flow: local PostgreSQL introspection -> strict public metadata contract/API client -> authenticated source metadata route -> explicit patch-module use cases -> tenant-scoped `IntegrationConnection` adapter -> source configuration UI; CLI effective schema remains intersected with fresh local discovery.
- Factual decision: reuse `IntegrationConnection` with a distinct local-Postgres provider and one strict versioned JSON document instead of adding snapshot/resource/field tables. The scoped connection ID is the server source ID; local config already persists it. Token creation provisions the source and API key transactionally.
- Factual decision: sync all normalized discovered resources but no PostgreSQL type names, raw catalog rows, constraint SQL, values, procedures, triggers, credentials, or connection options. SHA-256 is computed over canonical resource/field ordering.
- Factual decision: persisted configuration defaults every resource to unmanaged and every field to non-writable; compatible settings survive later snapshots. Effective CLI resources are managed server resources intersected with fresh local discovery, and a field is writable only when both the database capability and explicit server setting allow it.
- Factual decision: unchanged fingerprints are no-op syncs. Configuration updates use an expected version and serialize with local apply-start by locking the same `IntegrationConnection` row. Immutable proposals bind the synchronized schema/configuration versions; submit and apply-start reject stale versions and recheck current managed/writable policy.
- Factual decision: valid PostgreSQL identifiers and enum labels remain exact (including whitespace and empty enum labels), while canonical ordering uses explicit code-unit comparison rather than locale collation.
- Factual decision: reconnect discovers and syncs before replacing the keyring secret, then restores the previous secret if writing local configuration fails. A failed sync leaves the credential, database identity, selection, and draft association unchanged.
- Factual decision: the established source-list contract merges local and compatibility-hosted sources when `PATCHCTL_LEGACY_SERVER_CONTENT=1`; the source configuration UI requests local sources only.

## Verification

Passed on the disposable local `patchctl_schema_sync_test` database:

- `pnpm typecheck`
- `pnpm --filter @corely/data exec prisma validate`
- `pnpm arch:check`
- `pnpm test` — 31 files, 195 tests
- `pnpm --filter patchctl test` — 25 passed, 2 environment skips without database variables; 26 passed, 1 native-keyring skip with `PATCHCTL_LOCAL_TEST_DATABASE_URL`
- `pnpm --filter @corely/api-client test:node` — 2 tests
- `pnpm --filter @corely/e2e exec tsc -p tsconfig.patchctl.json`
- `pnpm local:test` — 6 tests
- `pnpm build`
- `pnpm --filter @corely/e2e exec playwright test --config playwright.patchctl-local.config.ts` — 3 tests
- `git diff --check`

Targeted evidence includes 13 source/policy unit tests, two real-PostgreSQL apply-start/configuration ordering tests, exact whitespace/non-ASCII metadata fingerprint checks, an exact-label browser round trip for empty/whitespace/comma enum labels, and a database-backed reconnect sync-failure check that leaves the prior credential and local identity unchanged.

An attempted concurrent `pnpm build` and `pnpm test` run failed because the build cleaned the contracts package's generated `dist` while Vitest resolved it; both commands passed when run sequentially. An earlier full-suite run during implementation encountered the repository's existing concurrent PostgreSQL fixture race (`pg_type_typname_nsp_index`); the isolated apply suite passed and subsequent full runs, including the final 195-test run above, passed without weakening or skipping checks.

## Blockers

None.

## Handoff

- Commits/delivery state: verified implementation ready for the requested commit and normal push to `origin/main`; no PR, release, deployment, or publication is implied.
- Issue/board updates: not requested.
- Remaining limitations: local content apply remains intentionally out of scope. A successful remote schema sync followed by an exceptional local config-write failure can temporarily leave server metadata ahead of the restored local credential; the next paired CLI operation re-syncs fresh local discovery before use. Compatibility hosted-source listing remains gated by `PATCHCTL_LEGACY_SERVER_CONTENT=1`.
