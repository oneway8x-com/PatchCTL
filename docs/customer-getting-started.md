# New customer guide: from account to your first reviewed content change

This guide describes the current PatchCTL v0.1 implementation. The example task is **add English
summaries to articles that do not have one**.

## Before you start: what works today

**Account and Tenant onboarding is automatic.** On the first successful email verification,
PatchCTL creates the user and, when the user has no existing membership, creates a personal Tenant
with an OWNER membership. Later sign-ins reuse an existing membership instead of creating another
Tenant. The dashboard shows the active Tenant name and ID plus the commands for connecting the
local CLI. Database connection and scoped client-token creation remain explicit steps; PatchCTL
does not automatically connect a database or expose a token in a command or URL.

The default source workflow connects **directly from the local CLI runtime to
Postgres**. The OS credential backend owns the customer DSN; normal PatchCTL config
contains only a credential reference and non-secret source metadata:

```text
Your CLI / coding agent -> local credential store -> your Postgres
Your CLI / coding agent -> selected values and schema metadata -> PatchCTL review API
Your browser             -> human review of the exact immutable proposal
```

The hosted service never receives or resolves the DSN. Selected before/after values and schema
metadata do leave the machine when you submit a proposal for browser review. Treat that payload as
potentially sensitive customer content even though it contains no database credential.

The implemented local-first path is `connect postgres` → `init` → `list`/`get` → `patch start` →
`update` → `diff`/`validate` → `login --server` → `submit` → browser approval or rejection. See the
[local CLI guide](local-cli.md) for detailed command behavior and storage boundaries.

**Local apply is not implemented.** Browser approval records a human decision on the exact
immutable proposal, but it does not write the approved values to Postgres. The optional
compatibility walkthrough later in this guide uses the separate legacy hosted path when you need
to exercise the existing server-side apply flow:

```text
Your CLI / coding agent -> patchctl server ... -> PatchCTL API -> proposed patch
Your browser             -> human review -> approved compatibility apply -> Postgres
```

Every compatibility CLI invocation uses the explicit `server` namespace, and the operator must
enable `PATCHCTL_LEGACY_SERVER_CONTENT=1` on the server. That path uses a separately configured
server credential; it never receives or resolves the credential stored by
`patchctl connect postgres`. It is migration protection, not the default architecture.

You need:

- A running PatchCTL instance and its URL, supplied by its operator. This repo does not provide
  a verified hosted signup address or production deployment runbook.
- An email address for your human account.
- An existing supported Postgres content table. Start with a development copy, not live content.
- An operator only if you use the optional compatibility setup in Step 3. If you self-host, you
  fill that role too.
- Git, Node.js >=22.19, pnpm 10.26, and PowerShell 7.1+ for the commands below.

Want to try the workflow without connecting your own database? Follow the
[local Docker demo](local-development.md) instead. It provisions a synthetic Tenant, reviewer,
agent key, and articles. Use the email printed by that setup to access the demo Tenant; signing in
with a different new email creates that account's own personal Tenant instead. Docker is needed
for the demo, not for a CLI that talks to an already-running service.

## 1. Register your human account

1. Open `<your-instance-url>/login` in your browser.
2. Enter your email and click **Continue with email**.
3. Enter the six-digit code and click **Continue**. Your user is created on first successful
   verification; there is no separate password registration form.
4. After verification, PatchCTL redirects to `<your-instance-url>/dashboard`.

On an operator-configured production instance, codes are sent by email. During local development,
codes appear in the server terminal instead. Never post a code or server log in an issue/chat.
Codes expire after 15 minutes; wait for the resend cooldown if a new one is needed.

**Expected at this stage:** the dashboard shows your active Tenant name and Tenant ID. A new account
receives one personal Tenant and OWNER membership. This grants access to PatchCTL review features;
it does not grant access to a database until you connect one locally.

## 2. Review your Tenant and dashboard CLI guide

A **Tenant** is the hosted account boundary that owns permissions, patches, and audit history. On
the dashboard, confirm the active Tenant name and copy its ID when you need to identify that hosted
boundary. Do not insert arbitrary Tenant IDs into browser storage, request headers, or tokens.

The **Connect your local CLI** card previews the workflow and the exact commands for this Tenant.
Build the CLI in Step 4 before executing them, then follow the complete local-first flow in Step 5:

1. `pnpm patchctl connect postgres --tenant <local-alias>` creates a local connection profile. The
   value after `--tenant` is a local profile alias, not the hosted Tenant ID shown above it.
2. `pnpm patchctl init` selects the tables and columns the CLI may read.
3. The card can create a one-connection scoped client token. The displayed
   `pnpm patchctl login --server <your-instance-url>` command pairs the profile after you paste the
   token at its hidden prompt. The dashboard never embeds the raw token in a command or URL.
4. The remaining commands prepare, validate, and submit an immutable proposal.

The token can submit proposals for its paired connection but cannot approve them. Database
credentials stay in the local operating-system credential backend. Approval records a human
review decision, but local apply is not implemented and does not write the approved values back to
Postgres.

If the account already belongs to one or more Tenants, sign-in deterministically reuses an existing
membership and does not create an extra personal Tenant. The current login flow has no
customer-facing Tenant switcher, so ask the instance operator to verify the intended membership if
the selected Tenant is not the one you expected.

## 3. Optional legacy hosted connection — operator-assisted

Skip this section when you only need the default local-first proposal and browser-review flow.
Use it only to exercise the separately enabled compatibility apply path while local apply remains
unimplemented.

Tell the operator which database/table you want to manage and which fields may be edited.
For the example in this guide, request:

- An existing `articles` table with a single-column primary key, such as `id`.
- Read access to `title`, `body`, and `summary_en`.
- Edit access to `summary_en` only, with locale `en` and an agreed length limit.
- The correct Tenant isolation rule: an existing Tenant column, or an explicitly dedicated
  source belonging only to your Tenant.

Do not send a database password to a coding agent, public ticket, or proposal file. Exchange
connection credentials only through an operator-approved secure channel.

The operator then completes this checklist:

1. Verify the intended database, connectivity from the PatchCTL server, TLS configuration,
   and schema compatibility. Start against a development database with synthetic/non-sensitive data.
2. Configure a least-privilege server database role: connection/schema access, SELECT on the
   content table (whole-record conflict checks need it), and UPDATE only on approved editable
   columns. Do not give this role schema-creation authority.
3. As the target database owner, install [the receipt table](../scripts/patchctl-target-setup.sql)
   once in the intended content database. Grant the service role SELECT/INSERT on that table.
   Follow [apply setup and recovery](patchctl-apply.md). This is deliberate database setup,
   not something the agent CLI performs.
4. Supply the connection URL server-side via `PATCHCTL_SOURCE_SECRETS`, mapped to your Tenant.
   Keep this distinct from `DATABASE_URL`, which is PatchCTL's application metadata database.
5. Using an authorized human session, register the source with
   `POST /api/patchctl/sources`, then register its allowlisted schema with
   `PUT /api/patchctl/sources/{id}/schema`.
6. Retest with `POST /api/patchctl/sources/{id}/test` and confirm discovery/reads work for your
   Tenant. A successful connection test alone does not verify every apply/receipt permission;
   verify one reviewed change in the development database before using live content.
7. Issue an expiring, revocable legacy agent key owned by your active user, with **read/propose
   only** and an explicit list containing this source ID. Legacy key issuance is currently operator
   provisioning, not a customer API/UI. This is separate from the local-client token a configured
   human can create in `/patches`. See [operator setup](patchctl-setup.md) for storage requirements.

The operator should return the **service URL**, **source ID**, **configured field names**, and
**legacy agent key plus expiry**, delivering the key privately. Your database connection URL is not
needed by the compatibility CLI; the separate default local-first path uses its own locally stored
credential.

### Example source configuration for the operator

These are HTTP request bodies, not CLI commands. They do not create the content table or columns.
The operator must adapt them to the actual database and use a human credential with `configure`
permission, separate from the agent environment.

`POST /api/patchctl/sources`:

```json
{ "name": "Articles", "secretRef": "articles-dev" }
```

`articles-dev` must already exist in the server's secret mapping for this Tenant. Use the returned
source `id` in `PUT /api/patchctl/sources/{id}/schema`:

```json
{
  "namespace": "public",
  "table": "articles",
  "key": "id",
  "isolation": { "mode": "row", "tenantColumn": "tenant_id" },
  "fields": {
    "title": { "type": "text", "readable": true, "editable": false },
    "body": { "type": "text", "readable": true, "editable": false },
    "summary_en": {
      "type": "text",
      "readable": true,
      "editable": true,
      "nullable": true,
      "maxLength": 2000,
      "locale": "en"
    }
  }
}
```

For row isolation, content `tenant_id` values must match the actual PatchCTL Tenant ID; there is
no automatic mapping of your existing customer IDs. For a genuinely dedicated source, the
operator can instead declare `{"mode":"dedicated","dedicatedTenantId":"<actual-tenant-id>"}`.
Do not use dedicated mode to expose a shared multi-customer table.

Only supported plain tables may be registered. Views, partitions, user triggers, rewrite rules,
RLS policies, and unsafe cascading behavior are rejected. Do not disable existing safety/business
rules simply to make onboarding pass; discuss a dedicated integration instead. See
[supported scope](patchctl-release.md).

## 4. Build the CLI on your computer

Use the repository revision compatible with your running instance. If you do not have a checkout
yet, clone it first:

```powershell
git clone https://github.com/oneway8x-com/PatchCTL.git
cd PatchCTL
```

From your checkout root:

```powershell
pnpm install --frozen-lockfile
pnpm --filter @corely/contracts build
pnpm --filter @corely/api-client build
pnpm --filter patchctl build
node apps/cli/dist/cli.js --help
$cli = (Resolve-Path 'apps/cli/dist/cli.js').Path
```

This guide runs the built executable directly; it does not assume a published npm package or global
`patchctl` installation. You do not need Prisma migrations to use the CLI. The default local-first
path does require the Postgres credential on this machine; the optional compatibility commands in
Steps 6–11 instead use a server-owned database credential.

## 5. Create and submit a local-first proposal

Use the local-first path unless you explicitly need the legacy apply flow. Connect to a development
copy of your database first. The connection prompt is hidden, and PatchCTL stores the DSN in the OS
credential backend—not in its JSON config or the review service:

```powershell
node $cli connect postgres --tenant my-project
node $cli sources
node $cli init --resources public.articles --columns id,title,body,summary_en
node $cli resources
node $cli schema my-project articles
node $cli list articles --limit 10
```

`init` creates an optional additional local read restriction. After pairing, the CLI also syncs
normalized, credential-free schema metadata and consumes the resources and writable fields that a
human enables in the web UI. Include the single-column primary key and every field needed for
review when using `init`. Reconnecting successfully clears this local selection because the new
credential may point to a different database; a failed reconnect preserves the previous credential,
configuration, database identity, and draft association. Only allowed values are returned, although
the conflict hash covers the full row.

Create one local draft and add the intended changes. Set `$articleId` and replace the sample
summary with values reviewed against the record returned by `list` or `get`:

```powershell
$articleId = '<article-id-from-list-or-get>'
node $cli patch start --title 'Add an English article summary'
node $cli update articles $articleId --set 'summary_en=Your article-specific summary.'
node $cli diff
node $cli validate
```

These commands do not write content. The draft stores selected before/after customer values under
the local PatchCTL configuration directory, so protect it like other customer data. `validate`
checks the current schema, selected fields, types, relations, baseline, and whole-record conflict
hash at that point in time.

To submit the immutable proposal for human review:

1. Sign in to `<your-instance-url>/dashboard` as the human who owns the active Tenant.
2. In **Connect your local CLI**, create a scoped client token and copy it immediately. It is
   shown only in that browser session. The same guide is also available from `/patches`.
3. Pair this local CLI. Enter the token at the hidden prompt; do not put it on the command line:

   ```powershell
   node $cli login --server 'https://your-patchctl-instance.example'
   ```

4. Submit the validated draft and open the returned review URL:

   ```powershell
   $submissionJson = node $cli submit
   if ($LASTEXITCODE -ne 0) { throw 'Submission failed; inspect the error before retrying.' }
   $submission = ($submissionJson -join "`n") | ConvertFrom-Json
   $submission.reviewUrl
   ```

The scoped local-client token can submit for its one connection but cannot approve. PatchCTL stores
that token in the OS credential backend unless `PATCHCTL_TOKEN` was explicitly supplied as a
process-only override. Normal config stores only the server origin, Tenant ID, connection ID, and
credential references.

Submission revalidates the current local schema and record snapshots, syncs normalized schema
metadata without credentials, and freezes a proposal bound to the server's schema and configuration
versions. The server rejects stale retries, unmanaged resources, and fields that are no longer
writable. The proposal sends selected before/after values plus schema metadata to the review
service, but never sends the Postgres DSN or local-client token. After submission, the local draft
is immutable.

A human with `review` permission opens the returned URL, checks every before/after value and the
exact revision, and chooses **Approve** or **Reject**. Approval currently stops there: no local
`sync` or apply command exists, and approval does not modify Postgres. Use the optional compatibility
path below only when you deliberately need to test the existing server-side apply implementation.

## 6. Configure the optional compatibility CLI connection

Everything from this section through Step 11 uses the optional `patchctl server ...` path and
requires the operator setup from Step 3. It is not part of the default local-first proposal flow.

In the same PowerShell terminal, enter the service origin supplied by the operator. Use only
scheme/host/port, without `/api`, a path, query string, or embedded credentials.

```powershell
$env:PATCHCTL_URL = 'https://your-patchctl-instance.example'
$env:PATCHCTL_TOKEN = Read-Host 'Paste your scoped agent key' -MaskInput
node $cli server sources
if ($LASTEXITCODE -ne 0) { throw 'Resolve the CLI connection error before continuing.' }
```

Replace the example URL. For the local Docker instance, use `http://127.0.0.1:3109` instead.
Remote instances require HTTPS; plain HTTP is accepted only on loopback.

The masked prompt avoids putting the key literally into command history. It still lives in your
process environment: use a trusted machine, do not print it, and do not enable transcripts or
upload environment dumps. Never substitute your browser's human token for the agent key.

**Expected:** JSON listing the sources assigned to this key, such as an `Articles` entry with
an `id`. An empty array means no sources are visible; ask the operator to check the key's source
assignment rather than guessing IDs.

## 7. Inspect the compatibility content schema and read articles

Copy the correct ID from `sources`:

```powershell
$sourceId = '<source-id-from-sources>'
node $cli server schema $sourceId
node $cli server read $sourceId --limit 10
```

The schema lists readable/editable fields and locales. The read result includes each record's
`id`, `version`, and `values`, plus a `schemaVersion` and `nextCursor`. The versions are opaque
conflict checks: preserve them exactly; never invent or recalculate them yourself.

For this example, `summary_en` must be editable and `body` readable. If your fields differ,
adapt the following query and proposal to the registered schema.

## 8. Find articles missing an English summary through compatibility reads

Keep exported customer content and proposal files outside the public repository in a private
local folder. These files may contain sensitive content even though they contain no API key.

```powershell
$jobDir = Join-Path $env:LOCALAPPDATA 'PatchCTL/customer-walkthrough'
New-Item -ItemType Directory -Path $jobDir -Force | Out-Null
Set-Location $jobDir

$query = '{"fields":["title","body","summary_en"],"filters":[{"field":"summary_en","op":"missing"}],"limit":10}'
$resultJson = $query | node $cli server read $sourceId --stdin
if ($LASTEXITCODE -ne 0) { throw 'Read failed; do not prepare a patch from this output.' }
$content = ($resultJson -join "`n") | ConvertFrom-Json
$content | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath 'articles-to-review.json' -Encoding utf8
```

Use direct `node` invocation for piped stdin; the pnpm script runner can consume stdin on Windows.
Use your own access-controlled folder instead if this location is not private on your machine.

Missing means null, empty, or whitespace-only text. If `records` is empty, stop: no patch is
needed. If `nextCursor` is not null, there are more results. Complete this small batch first, then
repeat the same filtered query with `--after <returned-nextCursor>` to continue. Each patch is
reviewed/applied separately; a large job is not one atomic transaction.

## 9. Prepare a compatibility proposal — no database writes yet

Write the summaries yourself, or give your coding agent the exported records and this instruction:

> Add a concise English summary to each article in this batch. Base it only on the article's
> title/body; do not invent facts. Prepare proposal.json using mode fill-missing. Preserve sourceId,
> schemaVersion, and every record id/version from the CLI output. Change only summary_en.
> Do not approve or apply. Stop if any required source text is missing or ambiguous.

Only share content with an agent/provider approved for your data. PatchCTL itself does not call
a language model or translation service. Your agent's ability to write code is separate from
permission to approve content.

Save `proposal.json` in the private folder. Its shape is:

```json
{
  "sourceId": "<actual-source-id>",
  "schemaVersion": "<schemaVersion-from-read>",
  "reason": "Add English summaries to articles missing one.",
  "agentRunLabel": "first-english-summary-batch",
  "mode": "fill-missing",
  "records": [
    {
      "id": "<record-id-from-read>",
      "version": "<record-version-from-read>",
      "changes": {
        "summary_en": "Your finished, article-specific English summary."
      }
    }
  ]
}
```

Replace every placeholder and include one entry per selected article. Do not submit template text.
`fill-missing` rejects already-populated target fields; it does not overwrite existing summaries.
Start with one to ten records. The maximum is 100 records per patch and 2 MB input.

Validate and submit:

```powershell
node $cli server validate --file proposal.json
if ($LASTEXITCODE -ne 0) { throw 'Fix the proposal before submission.' }
$proposalJson = node $cli server propose --file proposal.json
if ($LASTEXITCODE -ne 0) { throw 'Inspect the error and current patch queue before retrying.' }
$proposal = ($proposalJson -join "`n") | ConvertFrom-Json
$proposal | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath 'submission.json' -Encoding utf8
$patchId = $proposal.id
$proposal.reviewUrl
```

`validate` only checks local structure. `propose` performs server-side authorization, schema,
value, and version checks and saves a pending patch. **Neither command changes article content.**
Keep `submission.json` so you can find the patch again.

## 10. Review and apply through the compatibility browser flow

1. Open the returned `reviewUrl` in your normal browser on the same PatchCTL instance.
2. Sign in as your human account if necessary, then reopen the link.
3. Check the source, number of affected records, every before/after value, and the reason.
   Use the record pagination controls to inspect all records, not just the first page.
4. Check the summaries for accuracy and language. Review the exact proposed content, not only
   the agent's description of its work.
5. Click **Approve and apply** only when you want these values written. Or enter an optional
   rejection reason and choose **Reject patch** to leave content unchanged.

With separate review/apply permissions, the UI may offer separate actions; an authorized human
with apply permission must finish the approved patch. Agent keys cannot take either action.
Proposals are immutable: to change proposed text, reject it and prepare a fresh proposal.

On apply, changed/deleted records, schema drift, or changed relation targets block the batch.
Do not force an old proposal through; reread the data and prepare a new human-reviewed revision.

## 11. Verify the compatibility result and continue managing content

In the same terminal:

```powershell
node $cli server status $patchId
node $cli server history $patchId
node $cli server read $sourceId --limit 10
```

Expect `state: "applied"` after successful application. Inspect the patch's before/after values
and history for creation, human decision, and application. `history` is paginated; if its
`nextCursor` is non-null, call `history $patchId --after <cursor>` for subsequent events.
For a specific article, inspect that record rather than assuming it is in the first read page.

Other supported tasks use the same read → propose → human review flow:

- **Fix text or bulk edit:** use `mode: "edit"` and change only declared editable fields.
- **Translate:** use distinct declared source/target locales and translation metadata; see
  [translations and missing content](patchctl-missing-content.md).
- **Assign an enum/category:** use only permitted values or existing relation targets; see
  [assignments](patchctl-assignments.md). `node $cli server targets $sourceId <relation-field>` discovers
  allowed target IDs.
- **Schedule:** only explicitly configured timestamp pairs; see [scheduling](patchctl-scheduling.md).
  PatchCTL does not run a background publication/activation engine.

This version updates existing records. It does not insert articles, create tables/columns, delete
records, or infer publishing rules. To undo an applied content change, prepare a new corrective
patch and review it; rolling back application code does not undo content writes.

When finished, remove the key from this terminal and close any agent processes that inherited it:

```powershell
Remove-Item Env:PATCHCTL_TOKEN
```

This removes only the local environment variable, not the server-side key. Ask the operator to
revoke/replace a key if needed; retain or securely remove your exported content according to
your own data policy.

## Troubleshooting and current onboarding gaps

| Symptom                                          | What to check                                                                                                                                                               |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard has no active Tenant                   | Sign out and verify the email again. If provisioning still fails, ask the operator to inspect account provisioning and metadata database health.                            |
| No verification email                            | Local development logs codes to the terminal; an email-delivering instance needs working operator email configuration. Do not keep requesting codes rapidly.                |
| CLI 401 / exit 3                                 | Missing, expired, revoked, or incorrect key; inactive owning user/Tenant. Ask for a valid scoped key.                                                                       |
| CLI 403 / exit 3                                 | Insufficient permissions or source not assigned to this key. Do not replace it with a human token.                                                                          |
| Local `resources` is empty                       | Run `init` and explicitly select supported tables and columns; reconnecting clears prior selections.                                                                        |
| Compatibility `server sources` is empty          | Ask the operator to verify the legacy key's source assignment rather than guessing IDs.                                                                                     |
| Local validation fails / exit 2                  | Check that the patch has an update and that selected schema, field types, relations, baselines, and current record state still match.                                       |
| Compatibility validation fails / exit 2          | Check proposal JSON, placeholders, schema version, record versions, required fields, and input size.                                                                        |
| Local schema/connection failure                  | Check the locally stored DSN, database reachability, TLS, least-privilege grants, and selected resources.                                                                   |
| Compatibility schema/connection failure          | The operator checks server database reachability, allowlist compatibility, role grants, and receipt setup.                                                                  |
| Conflict / exit 4                                | Reread affected content; create a new proposal and obtain a new human decision.                                                                                             |
| Local proposal is approved but data is unchanged | Expected today: local apply/`sync` is not implemented. Approval records a decision but does not write Postgres.                                                             |
| Timeout/network/server failure / exit 5          | The CLI does not retry automatically. A failed response does not prove a write/proposal did not happen. Check the queue/status/history first.                               |
| Compatibility patch remains `applying`           | Ask an authorized human/operator to follow [receipt recovery](patchctl-apply.md) for the same approved patch ID/revision. Do not submit duplicates or manually reset state. |

Personal Tenant provisioning is automatic for an account with no existing membership;
customer-facing Tenant switching is not implemented. For the default local-first path, customers
can connect Postgres and select resources in the CLI, and the personal Tenant OWNER can create a
one-connection local-client token from `/dashboard` or `/patches`. Self-service token listing,
expiry, and revocation are not implemented yet. The optional legacy path still requires
operator-managed server database secrets, source/schema registration, and legacy agent-key
provisioning.

## Implementation references

This guide was checked against the current account [UI](../apps/app/src/components/auth/auth-card.tsx),
[server](../apps/app/src/server/auth.ts), and
[provisioning use case](../apps/app/src/server/auth-provisioning.ts); the
[dashboard](../apps/app/src/modules/dashboard/screens/DashboardHome.tsx) and
[CLI connection guide](../apps/app/src/modules/patches/components/LocalClientConnectionGuide.tsx);
[local CLI commands](../apps/cli/src/cli.ts),
[local draft commands](../apps/cli/src/local/patch-commands.ts),
[local submission](../apps/cli/src/local/server-commands.ts), and
[local proposal/review use cases](../packages/modules/patches/src/local-patches.ts). The optional
compatibility path uses the [source/schema routes](../apps/app/app/api/patchctl/sources/route.ts),
[source/schema use cases](../packages/modules/patches/src/use-cases/schema.ts), and
[agent authorization](../packages/modules/patches/src/access.repository.ts). See also
[local CLI behavior](local-cli.md), [CLI usage](../apps/cli/README.md), and
[shared-client architecture](patchctl-client.md).
