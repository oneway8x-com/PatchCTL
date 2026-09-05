# PatchCTL: CLI, API, web app, and database communication

## Scope and implementation status

This is the communication architecture for PatchCTL, replacing the legacy boilerplate overview
as the entry point for this feature. It describes the source inspected on **2026-09-05** in
`codex/local-first-v01`, including uncommitted work. It is not a deployment or test-pass claim.

Two execution models coexist during the migration:

| Model                   | Who connects to the user's content database? | Status in the inspected checkout                                                                                                                                              |
| ----------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local-first             | CLI on the user's machine                    | Local connection, discovery, reads and drafts exist. Submission, tokens and browser review are in-progress source changes. Local execution through `sync` is not implemented. |
| Legacy server-connected | PatchCTL server                              | Existing read/propose/review/apply flow, gated in this branch by `PATCHCTL_LEGACY_SERVER_CONTENT=1`.                                                                          |

The default review pages in the inspected branch select the local-first UI. The legacy source
runtime returns `LOCAL_EXECUTION_REQUIRED` unless its explicit compatibility flag is enabled.
The flag selects behavior; it does not complete or verify the new workflow. The legacy demo
test configuration explicitly enables the legacy path; do not assume every local launcher does.

## 1. Components and ownership

**The web app and API are two surfaces of the same Next.js application**, not independently
deployed services. A browser runs the review UI; Next.js runs the HTTP handlers on the server.

| Component              | Location                                   | Responsibility                                                                                                                                         |
| ---------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CLI                    | `apps/cli`                                 | Commands, local configuration, credential retrieval, content reads, draft preparation and HTTP submission. Future local execution belongs here.        |
| Local Postgres adapter | `packages/postgres` (`@patchctl/postgres`) | Node-only database connections, discovery, selected record reads, snapshots and relation validation. Called by the CLI.                                |
| Web UI                 | `apps/app/src/modules/patches`             | Display proposed before/after content, request a human decision, show status/history. No direct Postgres connection.                                   |
| API handlers           | `apps/app/app/api/patchctl`                | Authenticate requests and delegate to explicit patch use cases.                                                                                        |
| Patch use cases        | `packages/modules/patches`                 | Tenant/permission checks, immutable proposal revisions, human decisions, audit and persistence coordination. Legacy content execution also lives here. |
| Shared HTTP client     | `packages/api-client`                      | Typed endpoint calls using `fetch`; no local filesystem, keyring or database access.                                                                   |
| Shared contracts       | `packages/contracts`                       | Runtime validation and public request/response types. No application/database runtime dependencies.                                                    |
| Browser auth           | `packages/auth-client`                     | Existing human sign-in and token-storage integration. Not a CLI dependency.                                                                            |

Keep simple features colocated, as in the Todo reference. These responsibilities do not require
full DDD layers, a separate API application, a message broker, or a generic automation domain.

## 2. There are two different databases

**PatchCTL metadata database:** owned/operated by the PatchCTL service. Next.js connects using
its server `DATABASE_URL`; Prisma is used inside persistence code. It contains users, Tenants,
memberships, API-key hashes, patch documents, review decisions, and audit events.

**User content database:** the existing Postgres database holding articles or other customer
content. It has its own URL and database role. It can be on a customer's laptop, private network,
or remote database host. “Local-first” means the **client initiates access**, not that Postgres
must run on the same laptop.

They are logically separate even when a development fixture happens to put metadata and content
in one Postgres instance. Never assume one database credential should authorize both.

## 3. Local-first: what talks to what

| Sender → receiver                         | Transport                                                | Information sent                                                                             | What does not happen                                                            |
| ----------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| CLI → OS credential store                 | Local native keyring API                                 | Store/retrieve the database URL and, after login, a server client token                      | Secrets are not written into CLI config JSON as a fallback.                     |
| CLI → user Postgres                       | Postgres protocol through the Node adapter               | Database authentication and bounded discovery/read queries                                   | No PatchCTL API call is needed for local discovery or drafting.                 |
| CLI → PatchCTL API                        | HTTPS; loopback HTTP allowed for development             | Scoped client token, proposal, selected resource metadata, before/after snapshots and hashes | The normal submission envelope has no database URL/password field.              |
| Browser → PatchCTL API                    | Same-origin HTTP requests over the instance's connection | Human token, list/detail requests, exact revision and approve/reject decision                | The browser neither connects to user Postgres nor executes content SQL.         |
| API → metadata database                   | Prisma persistence                                       | Tenant-scoped patch document, revision, status, attribution and events                       | Local-first handlers do not resolve source secrets or connect to user Postgres. |
| CLI → API → CLI, then CLI → user Postgres | Planned `sync` flow                                      | Fetch approved revision, execute locally, report result                                      | This execution loop is not implemented in the inspected source.                 |

All remote communication is initiated by the CLI/browser. There is no implemented server
callback into the user's machine, background sync daemon, WebSocket approval stream, or queue.
The browser fetches/refetches HTTP data; the proposed executor would pull approvals.

### Local-first workflow, in order

1. **Connect locally:** `connect --tenant NAME` prompts for a database URL, tests local access,
   and stores it in the OS credential store unless explicitly supplied by environment.
2. **Select content:** `init` discovers supported tables and requires explicit table/column
   selection. `resources`, `schema`, `list`, and `get` read through `@patchctl/postgres`.
3. **Prepare a draft:** `patch start`, `update`, `diff`, and `validate` operate on a local draft.
   `update` changes the draft file, not a database row. Validation reads live data but does not
   establish a lock lasting until a future apply.
4. **Pair with the service (in progress):** an authorized human creates a scoped client token
   in the web UI. `login --server ORIGIN` checks it against `/api/patchctl/me` and associates the
   local configuration with a server Tenant and connection ID. This is token pairing, not an
   email/password login inside the CLI.
5. **Submit (in progress):** the CLI rechecks resource metadata, snapshots and proposed values,
   freezes the submission locally, then sends it to `/api/patchctl/local-patches`. The API validates
   the document, checks Tenant/connection permission, computes its revision, and stores it as
   `SUBMITTED`. Reusing an ID with a different revision/creator is rejected.
6. **Human review (in progress):** the browser fetches the stored document and posts its exact
   revision with `APPROVED` or `REJECTED`. The API checks human review permission and persists
   the decision. **Approval does not write to the user database.**
7. **Local execution (planned):** `sync` must fetch an approved revision, verify its relationship
   to the local database/draft, recheck conflicts under transaction locks, apply only approved
   changes atomically, and persist a durable local/target receipt for recovery.
8. **Execution reporting (partial):** an execution-result endpoint exists in the working tree,
   but the CLI executor that calls it is missing. The intended client reports start and outcome
   for the exact approved revision; the API stores those reports and the web UI displays them.

The current help text/UI mention `sync`, but `runServerCommand` rejects non-`submit` commands
after its login branch. Do not treat the displayed command or an `APPROVED` status as evidence
that content was applied. The local-flow browser test source stops after approval and asserts
that the content database remains unchanged; it is not an execution/recovery test.

### Local API surface in the working tree

All paths below are relative to `/api/patchctl` and require authenticated Tenant access.

| Endpoint                                    | Caller                            | Purpose                                                                   |
| ------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------- |
| `GET /me`                                   | CLI or browser                    | Resolve the authenticated actor and effective permissions.                |
| `POST /local-client-token`                  | Human with `configure` permission | Generate a client token scoped to one new connection ID.                  |
| `POST /local-patches`                       | Authorized proposer               | Submit an immutable local proposal.                                       |
| `GET /local-patches`                        | Authorized reader                 | List accessible patches; `approved=true` filters approved work.           |
| `GET /local-patches/{id}`                   | Authorized reader                 | Retrieve the reviewed document and current status.                        |
| `POST /local-patches/{id}/decision`         | Human reviewer                    | Approve/reject the exact revision.                                        |
| `POST /local-patches/{id}/execution-result` | Authorized local client           | Record a reported execution start/outcome, only for an approved revision. |

The server's local connection ID scopes client access; it is not a server-side Postgres
connection. `databaseId` is a locally assigned identifier used to bind drafts to configuration;
it is not a verified server fingerprint of the remote database.

## 4. Local-first storage and trust boundaries

| Data                          | Current location                                                                      | Important boundary                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| User database URL/password    | OS credential store, service `patchctl`, account `<local-name>/database`              | Available to the local process; not intentionally uploaded to the API.                                                    |
| Headless database URL         | `PATCHCTL_DATABASE_URL` in the CLI environment                                        | Explicit override, not persisted by PatchCTL. Protect the environment from logs and unrelated processes.                  |
| Server client token           | OS credential store account `<local-name>/server-token`, or `PATCHCTL_TOKEN` override | API stores its SHA-256 hash in `ApiKey`, not the plaintext token.                                                         |
| Local configuration           | `~/.patchctl/config.json`, or under `PATCHCTL_HOME`                                   | Selected resources, current local name, database ID and server binding; no database password/token.                       |
| Draft and frozen submission   | Local PatchCTL directory                                                              | Contains actual selected content. These files are sensitive even without connection credentials.                          |
| Submitted patch/review/events | Metadata database `LocalContentPatch.document`                                        | Contains actual before/after content and schema metadata, not just hashes. No application-level encryption is added here. |

“Database credentials stay local” does **not** mean “content never leaves the machine.”
Submission uploads the selected before/after snapshots for affected records, including selected
unchanged fields, plus resource/constraint metadata. Unselected row values are used inside
Postgres to compute a whole-row hash; the local snapshot query does not return those values.
The code checks for the exact configured URL/token appearing in a submission, but that is not
a general secret scanner. Select only fields suitable for upload and human review.

The local `--tenant NAME` is a configuration namespace, not a row-filtering security boundary.
Server Tenant membership scopes review data; local database access is controlled by the supplied
Postgres role and database policies. Local queries do not automatically add the legacy
`tenant_id = actor.tenantId` predicate. Never assume selecting a name isolates a shared table.

An agent/process with access to the local database credential may have the database role's
permissions outside PatchCTL too. Keyring storage is not an approval sandbox. Use read-only
credentials for current read/draft work; a future write executor needs an explicit least-privilege
and process-trust design. The server cannot independently prove that a client-reported `APPLIED`
status matches a database commit when it has no connection to that database.

Local-client token creation currently does not set an expiry in its repository method, and no
customer token-revocation UI is shown here. Do not assume the expiring legacy demo-key behavior
applies to these new tokens. Tenant onboarding and credential lifecycle remain separate work.

## 5. Legacy server-connected communication

This is the previously implemented flow, still available behind the compatibility flag:

1. An operator stores user database URLs in the server's `PATCHCTL_SOURCE_SECRETS` mapping,
   keyed by secret reference and Tenant. `IntegrationConnection.configJson` stores the reference
   and registered schema, not the URL itself.
2. The CLI sends `read`/`propose` requests using its scoped agent key. The API invokes authorized
   patch use cases; their Postgres adapters connect from the **server** to the user database.
3. The API stores immutable patches and audit metadata in the PatchCTL database.
4. The browser displays before/after values and requests a human decision on the exact revision.
5. The browser's **Approve and apply** action requests server-side apply. The server checks
   authorization, schema and whole-row versions under locks, writes content and a target receipt
   in one transaction, then reconciles metadata/audit.

In this model, the CLI never needs the user's database URL. The local demo additionally keeps
its synthetic database URL in an ignored, unencrypted session file before injecting it into
the server environment. See [legacy operator setup](../patchctl-setup.md) and
[approved apply/recovery](../patchctl-apply.md).

The legacy guarantees do not automatically transfer to local-first execution. In particular,
its target receipts, transaction locks and metadata recovery cannot be claimed for the unfinished
`sync` path simply because an execution-result API exists.

## 6. Shared TypeScript code, separate runtime responsibilities

- CLI HTTP calls and browser HTTP calls share `@corely/api-client/patchctl` and
  `@corely/contracts`. The API client accepts a token getter and `fetch`; it does not own login,
  persistence, OS keyring access, or SQL.
- Browser code supplies its current human token through `@corely/auth-client` integration.
  Local CLI code supplies its scoped server token through its local credential adapter.
- CLI database access uses **the separate Node-only `@patchctl/postgres` package**. Do not pull
  that dependency into the browser or the portable HTTP client.
- Next.js routes call explicit use cases and persistence adapters, not their own HTTP endpoints.
  Prisma stays in persistence code; public contracts must not import Prisma/server entity types.

The migration is an execution-location change, not merely a CLI directory move. Review approval
continues to belong to an authorized human; local execution must consume that decision, never
replace it with a CLI confirmation flag.

## 7. Source map and remaining work

Read the implementation before updating status claims in this document:

- [CLI routing](../../apps/cli/src/cli.ts), [local commands](../../apps/cli/src/local/commands.ts),
  [credentials](../../apps/cli/src/local/credentials.ts),
  [configuration](../../apps/cli/src/local/config.ts),
  [submission/pairing](../../apps/cli/src/local/server-commands.ts).
- [Postgres adapter](../../packages/postgres/src/index.ts).
- [Shared client](../../packages/api-client/src/patchctl.ts) and
  [local wire contracts](../../packages/contracts/src/patches/local-patches.schema.ts).
- [Review UI](../../apps/app/src/modules/patches/screens/LocalPatchReview.tsx),
  [local routes](../../apps/app/app/api/patchctl/local-patches/route.ts),
  [use cases](../../packages/modules/patches/src/local-patches.ts),
  [metadata persistence](../../packages/modules/patches/src/local-patches.repository.ts).
- [Legacy runtime gate](../../apps/app/src/server/patch-runtime.ts) and
  [local-flow test source](../../apps/e2e/tests/patchctl/local-flow.spec.ts).

Before describing local-first as end-to-end complete, implement and verify the local executor,
exact approval binding, database identity checks, transactional conflicts/constraints, duplicate
execution prevention, durable receipts and recovery after lost responses. Validate the migration,
client-token lifecycle, supported platforms, and both mode-specific deployment configurations.
No builds, migrations, database writes, or runtime test suites were run for this documentation update.
