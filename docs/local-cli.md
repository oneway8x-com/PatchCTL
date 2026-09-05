# Local PostgreSQL CLI foundation

This covers phases 1 and 2 of the local-first v0.1 migration. Local patch
submission and `sync` are not implemented yet. The existing `propose`/review
workflow uses server-side database access and is a separate legacy path.

Run from the repository root after `pnpm install --frozen-lockfile`:

```sh
pnpm --filter patchctl build
node apps/cli/dist/cli.js connect --tenant my-project
node apps/cli/dist/cli.js init --resources public.articles --columns id,title,summary
node apps/cli/dist/cli.js resources --json
node apps/cli/dist/cli.js schema articles --json
node apps/cli/dist/cli.js list articles --limit 20 --json
node apps/cli/dist/cli.js get articles 123 --json
node apps/cli/dist/cli.js patch start --title "Improve article title"
node apps/cli/dist/cli.js update articles 123 --set 'title=New title'
node apps/cli/dist/cli.js diff --json
node apps/cli/dist/cli.js validate --json
```

`connect` prompts for a hidden PostgreSQL connection string and tests it locally.
It stores the secret through the OS keyring adapter. Reconnecting clears the
selected resources, since the connection may now point at another database.
`init` prompts for tables and columns when arguments are omitted in a terminal;
there are no selected defaults. Include each table's single-column primary key.
Use schema-qualified table names when names are ambiguous. `--columns '*'`
explicitly selects all current columns of the selected tables. New columns are
never automatically added later. Tables without a supported single-column
primary key cannot be selected.

Configuration is stored at `~/.patchctl/config.json`; `PATCHCTL_HOME` can select
another local configuration directory. It contains the current Tenant and
table/column selections. It contains no connection string or access token.
The credential service is `patchctl`, with account `<tenant>/database`.

For headless use, explicitly supply `PATCHCTL_DATABASE_URL` through the process
environment. This takes precedence over the keyring and produces a warning in
the JSON response. PatchCTL does not persist it. Never put real secrets into
shell history, scripts, source control, or shared logs. A keyring failure never
creates a plaintext credential file.

The native binding uses Windows Credential Manager and macOS Keychain. On Linux
it prefers Secret Service and may use the kernel keyring if unavailable; a
headless environment can use the explicit environment option above. Native
round-trip behavior has been tested on Windows; macOS/Linux verification is pending.
See the [binding implementation](https://github.com/Brooooooklyn/keyring-node).

## Output contract

These commands return one JSON object per invocation, with or without `--json`.
Successful results go to stdout; structured errors go to stderr with nonzero
exit status. Interactive prompts go to stderr. `--json` never starts interactive
resource selection. `connect` can still request its secret in a real terminal.

- `resources`: `{ resources: [{ name: "public.articles" }], warnings: [] }`.
- `schema [resource]`: resource metadata (or selected resources), including
  fields, primary key, and relevant unique/check/foreign-key constraints.
- `list`: `{ resource, records, warnings }`; limit defaults to 20, maximum 1000.
- `get`: `{ resource, record, warnings }`; missing records return `RECORD_NOT_FOUND`.
- Errors: `{ ok: false, error: { code, message } }`.

Only selected columns are read. Unsupported fields appear read-only in schema
output and their values are omitted from record reads. `numeric` and `int8`
values are decimal strings to avoid JavaScript precision loss. Dates/timestamps
remain PostgreSQL text to avoid timezone conversion or fractional-second loss.
Generated columns and primary keys are read-only. No local command writes content.

## Local drafts

`patch start` creates one active draft for the current Tenant. `patch status`
returns it. A second start refuses to overwrite an existing draft. Drafts are
stored locally as `<tenant>-draft.json` and contain the selected before/after
content; treat these files as private content, not source code. Draft file writes
are atomic and serialized with a lock. A stale lock after process termination
requires inspection before removal. Submitted statuses are immutable to updates.

`update RESOURCE ID --set field=value` can accept multiple `--set` options for
distinct fields. `--dry-run` validates and returns the proposed operation without
saving it. The literal `null` means SQL null; booleans use `true`/`false`. Repeated
updates to the same record retain its first baseline. `diff` emits field-level
changes. `validate` returns `{ valid, errors, warnings }` and exits nonzero on
validation errors. It checks selected schema, types, nullability, enums, related
records, readonly fields, stored baselines, and current whole-record state.
General PostgreSQL check/unique constraints are discovered but are not yet
evaluated by local validation. No constraint is bypassed by writing during validation.

The concurrency hash covers the full row, including unselected columns, and is
computed inside PostgreSQL. Unselected values are not returned or stored in drafts.
An edit to an unrelated field therefore conflicts too. Snapshot/field values are
read in one statement. Concurrency remains a point-in-time validation until the
future transactional `sync` path rechecks it under locks.

## Verification

`pnpm --filter patchctl test` runs ordinary CLI tests and local unit tests.
Set `PATCHCTL_LOCAL_TEST_DATABASE_URL` to a disposable loopback PostgreSQL database
whose name ends in `_test` to include local database integration. The fixture
creates and removes its own random schema. Set `PATCHCTL_TEST_KEYRING=1` to test
store/read/delete with a random synthetic credential that is removed afterwards.
Without these variables the two platform integration tests are explicitly skipped.
