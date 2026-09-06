# English-summary demo

Prompt: **Add English summaries to all articles missing one.**

This demo uses real HTTP, CLI, browser review and Postgres. The automated run uses deterministic English summaries, not a language-model service. A manual agent can substitute its own summaries using the same read/propose interface.

## Local setup

For the repeatable interactive setup, use [Local development with Docker](local-development.md).
It uses a separate persistent database on port 55438 and app port 3109. The commands below remain
the disposable automated-test/manual fixture workflow on app port 3108.

Prerequisites: Node 22, pnpm, Docker and Playwright Chromium. Use a dedicated, disposable loopback database; never point this fixture at production. In PowerShell, from the repository root:

```powershell
pnpm install
docker run --detach --rm --name patchctl-demo -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_USER=patchctl_test -e POSTGRES_DB=patchctl_demo -p 127.0.0.1:55437:5432 postgres:17-alpine
$env:PATCHCTL_TEST_DATABASE_URL='postgresql://patchctl_test@127.0.0.1:55437/patchctl_demo'
$env:DATABASE_URL=$env:PATCHCTL_TEST_DATABASE_URL
pnpm prisma:generate
pnpm --filter @corely/data exec prisma migrate deploy
pnpm --filter @corely/contracts build
pnpm --filter @corely/api-client build
pnpm --filter patchctl build
pnpm --filter @corely/e2e exec playwright install chromium
pnpm exec tsx scripts/patchctl-demo.ts
```

The seed prints a `sessionPath`, not credentials. Every run creates a new Tenant and a fresh `pct_demo_<uuid>.articles` table with ten eligible records (null, empty and whitespace summaries), one populated control and one other-Tenant control. Re-seed for a fresh demonstration; there is no destructive reset script. Stop the explicitly named disposable container when finished to discard its data.

The schema allows title edits, read-only body text, and nullable English `summary_en` edits. Row isolation uses `tenant_id`. The server resolves the `demo` secret reference to this local source. The seeded human has an ADMIN membership; the agent has only read/propose permissions on this source. Credentials expire after one hour.

## Automated walkthrough

```powershell
$env:PATCHCTL_DEMO_SESSION='<absolute sessionPath from seed>'
pnpm --filter @corely/e2e exec playwright test --config playwright.patchctl-demo.config.ts
```

The test launches the local app on port 3108, invokes the actual CLI, checks exactly ten proposed updates and unchanged database values before approval, signs the browser into the seeded human account, reviews and applies, and checks database changes and provenance. It also rejects a second patch without writes and introduces a conflicting edit to block a third patch atomically. Screenshots are in `apps/e2e/.patchctl-results/demo`.

## Manual live-agent walkthrough

Start the server in one terminal:

```powershell
$env:PATCHCTL_DEMO_SESSION='<absolute sessionPath from a fresh seed>'
node scripts/patchctl-demo-server.mjs
```

In another local terminal, read the session without printing it:

```powershell
$demoSession=Get-Content -LiteralPath $env:PATCHCTL_DEMO_SESSION -Raw | ConvertFrom-Json
$env:PATCHCTL_URL='http://127.0.0.1:3108'
$env:PATCHCTL_TOKEN=$demoSession.agentToken
node apps/cli/dist/cli.js server schema $demoSession.sourceId
'{"filters":[{"field":"summary_en","op":"missing"}]}' | node apps/cli/dist/cli.js server read $demoSession.sourceId --stdin
```

Give the agent the prompt above and only the scoped agent environment, never `session.json` or the human credential. This fixture intentionally uses the explicit `server` compatibility namespace; it does not represent the default local-first source path. Ask the agent to read the source bodies, produce a proposal file with `mode: "fill-missing"`, the returned `schemaVersion`, and each record's `id`, `version`, and `changes.summary_en`. Then run `node apps/cli/dist/cli.js server validate --file proposal.json` and `node apps/cli/dist/cli.js server propose --file proposal.json`. Follow the returned review URL.

For this isolated fixture only, a local human can place the session's `humanToken` in the browser's `accessToken` localStorage key at `http://127.0.0.1:3108`, then reload. The automated test performs that step without exposing credentials. Production uses normal sign-in; do not add a demo-login endpoint or share this credential with an agent. Inspect all ten changes and click **Approve and apply**. The compatibility CLI `server status` and `server history` commands show the result.

Session files contain credentials and are ignored by Git. Keep their directory private (Windows uses inherited directory ACLs; Unix creation requests owner-only permissions). Delete the specific session directory after stopping its demo, and clear the browser's demo token.
