# patchctl

From the repository root, run `pnpm install`, `pnpm --filter @corely/contracts build`, then `node packages/patchctl-cli/cli.mjs --help`. The package declares the `patchctl` executable for package-manager linking; no global installation is required for the demo.

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
