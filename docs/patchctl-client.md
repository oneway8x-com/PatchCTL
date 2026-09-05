# Shared PatchCTL client

For execution location, secret storage, and the local-first migration's current status, see
[communication architecture](architecture/patchctl-communication.md). The legacy method example
below assumes server-connected mode; it is not the local database command path.

The CLI and Next.js browser UI use `createPatchctlClient` from
`@corely/api-client/patchctl`. The HTTP endpoints remain in `apps/app`; server routes
continue to invoke authorized use cases in `packages/modules/patches`.

## Ownership

- `packages/contracts`: public input/output schemas and types. Pure content-schema,
  decision, and apply-input validation is reused by server use cases.
- `packages/api-client`: native-fetch transport and typed PatchCTL endpoint methods.
  It emits Node-compatible ESM and declarations under `dist`; its source has no imports
  from Next.js, React, Node-only APIs, authentication adapters, or server modules.
- `apps/cli`: arguments, files/stdin, environment variables, output and exit codes.
- `apps/app/src/modules/patches/patches-api.ts`: client-only browser wiring. It reads
  the current token through the existing web auth adapter on every request.
- `packages/auth-client`: existing human sign-in/refresh/storage flow. It is not a
  dependency of the CLI or portable API client.

Do not put source credentials or SQL in the portable HTTP client or browser. The local-first
CLI separately retrieves database credentials through its OS keyring adapter and uses the
Node-only `@patchctl/postgres` package; those responsibilities do not belong in this HTTP package.
Next.js server-side callers
should use authorized use cases directly, not make HTTP calls to their own routes.
Never share a mutable user-token singleton across server requests or Tenants.

## Consumption

```ts
import { createPatchctlClient } from "@corely/api-client/patchctl";

const client = createPatchctlClient({
  baseUrl: "https://patchctl.example", // Empty string for same-origin browser requests.
  getAccessToken: () => currentToken, // Supplied by the caller, read per request.
  fetch, // Optional; useful for tests or custom transport.
});

const sources = await client.sources();
const content = await client.read(sources[0].id, {
  filters: [{ field: "summary_en", op: "missing" }],
});
```

Methods: `actor`, `sources`, `schema`, `targets`, `read`, `propose`, `patch`, `patches`,
`history`, `decide`, and `apply`. Request/response types are inferred from shared
contracts. Invalid responses fail with `INVALID_RESPONSE`, not unchecked type casts.
The client validates proposal/query/decision/apply input before making requests.
`propose` returns a same-origin review URL (relative for the browser).

Having a method in an SDK is not authorization: the server denies agent review and legacy
server-side apply. The CLI exposes no human decision command and uses scoped client credentials,
not a human sign-in credential. Planned local execution still requires an exact human approval.

The local-first working tree also adds `createLocalToken`, `localSubmit`, `localPatches`,
`localPatch`, `localDecide`, and `localResult`. These manage review documents and reported
outcomes, not direct server access to the user database. The presence of these methods does not
mean local `sync` execution is implemented; check the communication architecture's status section.

## Transport policy

PatchCTL calls block redirects, omit ambient cookies, require an injected bearer token,
use a 30-second deadline (configurable with `timeoutMs`), and never automatically retry.
The last optional method argument accepts `{ signal }` for caller cancellation.
The server determines Tenant/source permissions from the authenticated actor.

`PatchctlClientError` exposes `code`, `status`, and a safe message. Network exception
details are not exposed. HTTP errors preserve their code/status; invalid JSON or a
response-contract mismatch fails closed. An error after a mutation does not prove no
write occurred: refresh the patch state/history before choosing any retry.

The existing generic `request` export keeps its retry/cookie defaults for other callers;
PatchCTL explicitly selects its stricter policy. No global fetch or auth state is changed.

## Build and verification

From the repository root:

```powershell
pnpm install --frozen-lockfile
pnpm --filter @corely/contracts build
pnpm --filter @corely/api-client build
pnpm --filter patchctl build
pnpm --filter @corely/api-client exec vitest run
pnpm --filter @corely/api-client test:node
pnpm --filter patchctl test
```

`build:packages`, local setup, and CI include the API-client build. The native Node
checks import the package's actual compiled root/subpath exports without a TypeScript
loader and exercise real HTTP redirects/timeouts. Browser tests cover the same client
through review screens, while the isolated full-stack demo proves CLI → API → human
review → Postgres. Run those checks and builds sequentially; see the handbook.
