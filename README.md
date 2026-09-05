# PatchCTL

Safe content changes for coding agents.

PatchCTL is moving to a CLI-first PostgreSQL workflow: agents prepare patches,
humans review them, and the local client applies approved changes. The intended
principle is: **Credentials stay local. Agents propose. Humans approve. Local
clients execute.** PatchCTL does not call an LLM.

The [local CLI foundation](docs/local-cli.md) currently supports secure connection
storage, explicit resource/column selection, schema inspection, record reads,
local drafts, updates, diffs, validation, scoped token pairing, and immutable proposal
submission for browser human review. Local `sync`/execution is still pending: approval does
not apply content. The existing server-connected review application below is the legacy workflow,
not evidence that local-first execution is complete.

The active architecture is:

- `apps/app` for pages and synchronous API route handlers
- `apps/cli` for the `patchctl` terminal application ([CLI usage](apps/cli/README.md))
- `packages/modules/*` for business logic
- `packages/contracts` for shared request/response schemas
- `packages/data/prisma` for schema and migrations
- `packages/storage` for object storage adapters (`gcs`, `vercel_blob`)

## Prerequisites

- Node.js 22+
- pnpm
- Postgres

## Setup

For a ready-to-run PatchCTL environment with isolated Docker Postgres and English-summary demo
data, follow [Local development](docs/local-development.md): `pnpm install --frozen-lockfile`,
`pnpm local:setup`, then `pnpm local:start`. The app runs at `http://127.0.0.1:3109/patches`.

```bash
pnpm install
pnpm prisma:generate
pnpm dev
```

## Environment

Required:

- `DATABASE_URL`

Optional local fallbacks:

- `NEXT_PUBLIC_API_BASE_URL`
- `CORELY_DEV_TENANT_ID`
- `CORELY_DEV_WORKSPACE_ID`
- `STORAGE_PROVIDER` (`gcs` or `vercel_blob`)
- `STORAGE_BUCKET`
- `STORAGE_KEY_PREFIX`
- `SIGNED_URL_UPLOAD_TTL_SECONDS`
- `SIGNED_URL_DOWNLOAD_TTL_SECONDS`
- `GOOGLE_CLOUD_PROJECT` and `GOOGLE_APPLICATION_CREDENTIALS` when using GCS
- `BLOB_READ_WRITE_TOKEN` and optional `VERCEL_BLOB_ACCESS` when using Vercel Blob

## Database

Prisma schema and migrations live under `packages/data/prisma`.

Useful commands:

```bash
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:studio
```

## Active paths

- app runtime: `apps/app`
- CLI source: `apps/cli/src/cli.ts`; compiled entrypoint: `apps/cli/dist/cli.js`
- route handlers: `apps/app/app/api`
- UI modules: `apps/app/src/modules`
- storage runtime: `apps/app/src/server/object-storage.ts`
- shared modules: `packages/modules`
- contracts: `packages/contracts`

## Vercel

Deploy `apps/app` as the single active Vercel project:

- Root Directory: `apps/app`
- Framework Preset: `Next.js`

## Docs

Start with [PatchCTL communication architecture](docs/architecture/patchctl-communication.md)
for how the CLI, API, web app, and user database interact, including local-first migration status.

For the legacy server-connected mode, follow the [customer getting-started guide](docs/customer-getting-started.md)
for account registration, operator-assisted database setup, CLI usage, and your first reviewed patch.

For contribution and agent workflows, start with [Contributing](CONTRIBUTING.md), the
[Engineering Handbook](docs/ENGINEERING-HANDBOOK.md), [agent instructions](AGENTS.md), and the
[repository skill catalog](docs/ai/skills-management.md). The public
[build-in-public archive and workflow](marketing/README.md) records evidence-backed updates,
human review rules, and publication receipts without making marketing a development gate.
PatchCTL is solo-maintained: local agent work can proceed autonomously, while live content
patches and public marketing publication still require separate human approval.

See the [shared CLI/browser client architecture](docs/patchctl-client.md),
`docs/architecture/*`, and `docs/guides/*` for the current architecture reference.
