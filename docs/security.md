# PatchCTL security

## Current implementation status

The local-first CLI supports connection, inspection, draft preparation, and
validation. Local submission, browser approval of these drafts, and `sync` remain
unfinished. The existing server-connected application is a legacy implementation:
it can hold content source credentials and execute changes server-side. Do not
describe that legacy workflow as having local-only credentials.

## Credentials stay local

The new local CLI stores database credentials through the operating system
credential store, separate from non-secret table/column configuration. It never
sends a database connection string to an HTTP service. Keyring failures do not
write a plaintext fallback. Headless users may explicitly provide
`PATCHCTL_DATABASE_URL`, which is not persisted and produces a structured warning.
Connection strings are entered through a hidden terminal prompt, never a command
argument. Database and keyring exceptions are replaced with safe error messages.

## Local execution and least privilege

Local inspection connects directly from the CLI to PostgreSQL. Use a dedicated
PostgreSQL role restricted to intended content tables and columns. The CLI warns
for broad privileges. Users explicitly select resources and columns; reconnecting
clears the selection. Unsupported PostgreSQL types are read-only, and unsupported
values are excluded from record output. Local commands currently never mutate content.

## Human approval and conflict protection

The intended complete workflow requires human approval of an exact immutable
revision before local execution. There is no local approval command. Updates
prepare a draft with before/after values and a deterministic whole-row hash.
Validation detects intervening changes, including edits to unselected fields.
Transactional local application and durable execution receipts remain work to do;
a successful validation is not an approval or an application.

## Private local content

Draft files contain selected application content and must not be committed to
source control or attached to public issues. Only credentials belong in the
keyring; a draft is not a secret vault. See [local CLI usage](local-cli.md) for
configuration locations, JSON output, test isolation, and current limitations.
