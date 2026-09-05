# patchctl

From the repository root:

```powershell
pnpm install --frozen-lockfile
pnpm --filter @corely/contracts build
pnpm --filter patchctl build
node apps/cli/dist/cli.js --help
```

The strict TypeScript source is `src/cli.ts`; `tsc` emits the Node.js executable to `dist/cli.js`. Generated output is ignored by Git. Rebuild after source changes. The package declares the `patchctl` executable for package-manager linking; no global installation is required for the demo.

The CLI is a runnable application under `apps/cli`, separate from the Next.js review UI and HTTP API in `apps/app`. It depends on shared contracts, not server-side use cases or database adapters. Its package name remains `patchctl`, so `pnpm --filter patchctl test`, `typecheck`, and `build` still select it. The local `pnpm local:agent` helper invokes this entrypoint with the scoped demo credential.

The CLI currently uses native `fetch` with no automatic retries, redirects blocked, a timeout, and injectable transport for tests. The existing `@corely/api-client` needs Node-compatible build output and equivalent transport options before reuse. `@corely/auth-client` manages human login and refresh-token storage; scoped agent keys do not use that flow.

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
