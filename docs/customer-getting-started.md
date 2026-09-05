# New customer guide: from account to your first reviewed content change

This guide describes the current PatchCTL v0.1 implementation, not a planned onboarding UI.
The example task is **add English summaries to articles that do not have one**.

## Before you start: what works today

**Onboarding is operator-assisted today.** Email verification creates a user account, but it
does not create a Tenant, assign membership, connect a database, or issue an agent key.
There is no customer-facing Tenant/source/key setup wizard yet.

The CLI connects to the **PatchCTL HTTP service**, not directly to Postgres:

```text
Your CLI / coding agent -> PatchCTL API -> proposed patch
Your browser           -> human review -> approved apply -> your Postgres content
```

An operator connects the database on the server. Your coding agent receives a scoped API key,
never the database password or your human sign-in token. The CLI currently has no `login`,
`connect`, `register`, `approve`, or `apply` command.

You need:

- A running PatchCTL instance and its URL, supplied by its operator. This repo does not provide
  a verified hosted signup address or production deployment runbook.
- An email address for your human account.
- An existing supported Postgres content table. Start with a development copy, not live content.
- An operator to complete Steps 2–3. If you self-host, you fill that role too.
- Git, Node.js >=22.19, pnpm 10.26, and PowerShell 7.1+ for the commands below.

Want to try the workflow without connecting your own database? Follow the
[local Docker demo](local-development.md) instead. It provisions a synthetic Tenant, reviewer,
agent key, and articles. Use the email printed by that setup; signing in with a different new
email does not grant access to the demo Tenant. Docker is needed for that demo, not for a CLI
that talks to an already-running service.

## 1. Register your human account

1. Open `<your-instance-url>/login` in your browser.
2. Enter your email and click **Continue with email**.
3. Enter the six-digit code and click **Continue**. Your user is created on first successful
   verification; there is no separate password registration form.
4. Open `<your-instance-url>/patches` directly after verification. The current login screen
   still uses legacy branding and redirects to `/dashboard`, which is not the PatchCTL queue.

On an operator-configured production instance, codes are sent by email. During local development,
codes appear in the server terminal instead. Never post a code or server log in an issue/chat.
Codes expire after 15 minutes; wait for the resend cooldown if a new one is needed.

**Expected at this stage:** you have a user account, but a completely new user cannot access
PatchCTL content yet. A successful login is not proof of Tenant membership or source access.

## 2. Ask the operator to activate your Tenant

Send the operator your registered email and your intended Tenant name through your normal
support channel. A **Tenant** is the account boundary that owns your sources, permissions,
patches, and audit history.

The operator must provision an active Tenant and membership for your user, with an appropriate
role. For the first self-managed account, an OWNER/ADMIN role normally provides configuration,
review, and apply permissions; explicit permission denials still take precedence.

There is no supported self-service Tenant creation command/UI in this checkout. The operator
must arrange metadata provisioning; do not insert arbitrary Tenant IDs into browser storage,
request headers, or tokens to bypass this step.

After membership is provisioned, **sign out and sign in again** so your new access token carries
the Tenant. Refreshing the old session alone does not pick up a previously missing Tenant.
If you belong to multiple Tenants, ask the operator to verify the intended active Tenant;
the current login flow selects a membership and has no customer Tenant-switching UI.

## 3. Connect your content database — operator-assisted

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
7. Issue an expiring, revocable agent key owned by your active user, with **read/propose only**
   and an explicit list containing this source ID. Key issuance is currently operator provisioning,
   not a customer API/UI. See [operator setup](patchctl-setup.md) for its storage requirements.

The operator should return the **service URL**, **source ID**, **configured field names**, and
**agent key plus expiry**, delivering the key privately. Your database connection URL is not
needed by the CLI.

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
git clone https://github.com/hadoan/PatchCTL.git
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

This guide runs the built executable directly; it does not assume
a published npm package or global `patchctl` installation. You do not need Prisma migrations or
database credentials merely to run this CLI against an existing instance.

## 5. Configure your CLI connection

In the same PowerShell terminal, enter the service origin supplied by the operator. Use only
scheme/host/port, without `/api`, a path, query string, or embedded credentials.

```powershell
$env:PATCHCTL_URL = 'https://your-patchctl-instance.example'
$env:PATCHCTL_TOKEN = Read-Host 'Paste your scoped agent key' -MaskInput
node $cli sources
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

## 6. Inspect the content schema and read articles

Copy the correct ID from `sources`:

```powershell
$sourceId = '<source-id-from-sources>'
node $cli schema $sourceId
node $cli read $sourceId --limit 10
```

The schema lists readable/editable fields and locales. The read result includes each record's
`id`, `version`, and `values`, plus a `schemaVersion` and `nextCursor`. The versions are opaque
conflict checks: preserve them exactly; never invent or recalculate them yourself.

For this example, `summary_en` must be editable and `body` readable. If your fields differ,
adapt the following query and proposal to the registered schema.

## 7. Find articles missing an English summary

Keep exported customer content and proposal files outside the public repository in a private
local folder. These files may contain sensitive content even though they contain no API key.

```powershell
$jobDir = Join-Path $env:LOCALAPPDATA 'PatchCTL/customer-walkthrough'
New-Item -ItemType Directory -Path $jobDir -Force | Out-Null
Set-Location $jobDir

$query = '{"fields":["title","body","summary_en"],"filters":[{"field":"summary_en","op":"missing"}],"limit":10}'
$resultJson = $query | node $cli read $sourceId --stdin
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

## 8. Prepare a proposal — no database writes yet

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
node $cli validate --file proposal.json
if ($LASTEXITCODE -ne 0) { throw 'Fix the proposal before submission.' }
$proposalJson = node $cli propose --file proposal.json
if ($LASTEXITCODE -ne 0) { throw 'Inspect the error and current patch queue before retrying.' }
$proposal = ($proposalJson -join "`n") | ConvertFrom-Json
$proposal | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath 'submission.json' -Encoding utf8
$patchId = $proposal.id
$proposal.reviewUrl
```

`validate` only checks local structure. `propose` performs server-side authorization, schema,
value, and version checks and saves a pending patch. **Neither command changes article content.**
Keep `submission.json` so you can find the patch again.

## 9. Review and approve in the browser

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

## 10. Verify the result and continue managing content

In the same terminal:

```powershell
node $cli status $patchId
node $cli history $patchId
node $cli read $sourceId --limit 10
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
  [assignments](patchctl-assignments.md). `node $cli targets $sourceId <relation-field>` discovers
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

| Symptom                                       | What to check                                                                                                                                                               |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login succeeds but the queue is unavailable   | Tenant/membership is not provisioned, the token predates membership, or the server JWT configuration is inconsistent. Ask the operator, then sign out/in.                   |
| No verification email                         | Local development logs codes to the terminal; an email-delivering instance needs working operator email configuration. Do not keep requesting codes rapidly.                |
| CLI 401 / exit 3                              | Missing, expired, revoked, or incorrect key; inactive owning user/Tenant. Ask for a valid scoped key.                                                                       |
| CLI 403 / exit 3                              | Insufficient permissions or source not assigned to this key. Do not replace it with a human token.                                                                          |
| `sources` is empty or reads return no records | Verify source assignment, selected database/table, exact Tenant mapping, and filters. Empty content is not a reason to weaken isolation.                                    |
| Local validation fails / exit 2               | Check JSON, placeholders, schema version, record versions, required fields, and input size.                                                                                 |
| Schema/connection failure                     | Operator checks database reachability, allowlist compatibility, role grants, and receipt setup.                                                                             |
| Conflict / exit 4                             | Reread affected content; create a new proposal and obtain a new human decision.                                                                                             |
| Timeout/network/server failure / exit 5       | The CLI does not retry automatically. A failed response does not prove a write/proposal did not happen. Check the queue/status/history first.                               |
| Patch remains `applying`                      | Ask an authorized human/operator to follow [receipt recovery](patchctl-apply.md) for the same approved patch ID/revision. Do not submit duplicates or manually reset state. |

The missing self-service pieces are Tenant provisioning, database-secret/source onboarding, and
agent-key creation/revocation UI/API. Account verification alone does not finish those steps.
Until they are implemented, use the operator-assisted path above or the isolated local demo.

## Implementation references

This guide was checked against the current account [UI](../apps/app/src/components/auth/auth-card.tsx)
and [server](../apps/app/src/server/auth.ts), [source/schema routes](../apps/app/app/api/patchctl/sources/route.ts),
[source/schema use cases](../packages/modules/patches/src/use-cases/schema.ts),
[agent authorization](../packages/modules/patches/src/access.repository.ts), and
[CLI implementation](../apps/cli/src/cli.ts). See also [CLI usage](../apps/cli/README.md) and
[shared-client architecture](patchctl-client.md).
