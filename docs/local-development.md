# Local development with Docker Postgres

The supported local setup runs **Postgres 17 in Docker** and **Next.js on your host machine**.
This keeps hot reload and the CLI straightforward on Windows, macOS, and Linux. It is a local
development/demo environment, not a containerized production deployment.

Prerequisites: Docker with Compose v2 running, Node >=22.19, and pnpm 10.26.
From the repository root:

```powershell
pnpm install --frozen-lockfile
pnpm local:setup
pnpm local:start
```

Leave the last command running. Open [PatchCTL](http://127.0.0.1:3109/patches), sign in with the
email printed by setup/start, and retrieve the one-time code from that terminal. Local sign-in
uses the existing development OTP flow; no Resend account or email delivery is required.
`pnpm local:info` prints the email and source ID again without exposing credentials.

## What setup prepares

- Separate Compose project `patchctl-local`, using [docker-compose.patchctl.yml](../docker-compose.patchctl.yml).
- Postgres bound only to `127.0.0.1:55438`, database `patchctl_demo`, with a persistent named volume.
  The Compose username/password are public **local-only** defaults, not production secrets.
- Metadata migrations, generated Prisma client, built internal packages, and the compiled TypeScript CLI.
- A new demo Tenant, reviewer, read/propose-only agent, configured article source and receipt table.
- Ten articles with missing English summaries, one populated control, and one other-Tenant control.
  Existing [demo schema and safety rules](patchctl-demo.md) apply.
- Private session files in ignored `.patchctl-demo/`; the local pointer selects the active fixture.
  No root `.env` or existing containers/databases are overwritten. Both Prisma connection variables
  are explicitly directed at this local database before migrations.
  The launcher also forces development-mode OTP delivery and same-origin browser API calls,
  even if the calling shell contains production settings.

Setup is additive: running it again creates a fresh isolated dataset and selects it, preserving
older datasets and sessions. Stop the app first. Agent credentials expire one hour after setup;
run setup again for a fresh agent/demo and sign out/in with the newly printed email. Normal human
login uses the app's OTP flow, not a hardcoded token or new authentication bypass.

## Use the agent CLI

The CLI source lives in `apps/cli/src/cli.ts`; setup builds its executable at `apps/cli/dist/cli.js`.
After changing CLI source, run `pnpm --filter patchctl build` before invoking it again.
See [CLI usage](../apps/cli/README.md) for running it without the local helper.

In another terminal:

```powershell
pnpm local:agent sources
pnpm local:agent schema <source-id-from-local-info>
'{"filters":[{"field":"summary_en","op":"missing"}]}' | node scripts/patchctl-local.mjs agent read <source-id-from-local-info> --stdin
pnpm local:agent validate --file proposal.json
pnpm local:agent propose --file proposal.json
```

Give your agent the task **Add English summaries to all articles missing one**, with the records
and schema from the CLI. Use the returned versions and `mode: "fill-missing"`; see the
[manual demo walkthrough](patchctl-demo.md#manual-live-agent-walkthrough) for the proposal shape.
The helper passes only the scoped agent token to the CLI, not the human token or source secret.
Do not share the session file with an agent or commit it. Proposals do not write article content:
review the returned URL and approve or reject as the human reviewer.

Use the direct `node scripts/patchctl-local.mjs agent ...` entrypoint when piping JSON to stdin;
the pnpm script runner can consume piped input on Windows. The `pnpm local:agent` commands work
with `--file` and commands that do not read stdin. Both entrypoints use the same scoped credential.

## Stop, resume, and troubleshoot

Stop the app with Ctrl+C, then `pnpm local:stop` to stop only the dedicated Postgres service.
The volume and data remain. `pnpm local:start` restarts the database and app with the selected
session. Do not use `down -v` unless you deliberately intend to erase this demo's database.

For database status/logs:

```powershell
docker compose --project-name patchctl-local --file docker-compose.patchctl.yml ps
docker compose --project-name patchctl-local --file docker-compose.patchctl.yml logs postgres
```

If port 55438 or 3109 is occupied, resolve the specific conflict; do not stop unrelated services.
Keep login codes, session files, and app logs private. The demo credential expires after an hour;
a 401 from the CLI after that requires a fresh setup, not relaxed authorization.

Run `pnpm local:test` for launcher safety tests. Other integration tests must continue using a
separate `_test` database, not this interactive `_demo` database. The automated full-stack demo
uses port 3108 by default; stop the interactive app before running builds or browser suites because
they share Next.js/package output directories. See the [handbook](ENGINEERING-HANDBOOK.md#verification).
