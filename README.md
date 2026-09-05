# CorelyBase

CorelyBase is now a **Next.js-first modular monolith**.

The active architecture is:

- `apps/app` for pages and synchronous API route handlers
- `packages/modules/*` for business logic
- `packages/contracts` for shared request/response schemas
- `packages/data/prisma` for schema and migrations
- `packages/storage` for object storage adapters (`gcs`, `vercel_blob`)

## Prerequisites

- Node.js 22+
- pnpm
- Postgres

## Setup

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

See `docs/architecture/*` and `docs/guides/*` for the current architecture reference.
