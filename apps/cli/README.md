# patchctl

For account registration, database onboarding, and a first reviewed change, start with the
[customer getting-started guide](../../docs/customer-getting-started.md).

From the repository root:

```powershell
pnpm install --frozen-lockfile
pnpm --filter @corely/contracts build
pnpm --filter @corely/api-client build
pnpm --filter patchctl build
node apps/cli/dist/cli.js --help
```

The strict TypeScript source is `src/cli.ts`; `tsc` emits the Node.js executable to `dist/cli.js`. Generated output is ignored by Git. Rebuild after source changes. The package declares the `patchctl` executable for package-manager linking; no global installation is required for the demo.

The CLI is a runnable application under `apps/cli`, separate from the Next.js review UI and HTTP API in `apps/app`. It depends on shared contracts, not server-side use cases or database adapters. Its package name remains `patchctl`, so `pnpm --filter patchctl test`, `typecheck`, and `build` still select it. The local `pnpm local:agent` helper invokes this entrypoint with the scoped demo credential.

The CLI and browser review UI use the same typed `@corely/api-client/patchctl` methods and shared response validation. The portable client uses native `fetch` with no automatic retries, redirects blocked, a 30-second timeout, and injected token retrieval/transport. `@corely/auth-client` remains a browser integration for human login; the CLI supplies only its scoped agent key. See the [shared-client architecture](../../docs/patchctl-client.md).

Set `PATCHCTL_URL` to the service origin and `PATCHCTL_TOKEN` to a scoped agent key. Do not pass secrets in command arguments or commit them. The CLI does not receive Postgres credentials and has no approve/apply command.

```text
patchctl sources
patchctl schema SOURCE_ID
patchctl read SOURCE_ID --file query.json
patchctl read SOURCE_ID --after LAST_RECORD_ID --limit 50
patchctl validate --file proposal.json
patchctl propose --file proposal.json
patchctl status PATCH_ID
patchctl history PATCH_ID
```

Use `--stdin` instead of `--file` to pipe JSON. `validate` checks local structural constraints without a token, API call, or database mutation. Submission performs authoritative live schema, value, permission, and version validation. Never treat local validation as approval.

All successful output is JSON on stdout; errors are JSON on stderr. Exit codes: 0 success, 2 invalid input/configuration, 3 authentication/authorization, 4 conflict, 5 network/server failure. Reads return a nextCursor; pass it as `--after` while preserving the same query filters. Proposal output includes the human review URL and affected-record count. Input is limited to 2 MB and proposals to 100 records. No request is automatically retried.
