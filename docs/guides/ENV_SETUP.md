# Environment Setup

## Local development

Install dependencies:

```bash
pnpm install
```

Generate Prisma client:

```bash
pnpm prisma:generate
```

Start the app:

```bash
pnpm dev
```

## Required environment variables

- `DATABASE_URL`
- `NEXT_PUBLIC_API_BASE_URL` (optional; defaults to same-origin route handlers)
- `CORELY_DEV_TENANT_ID` (optional local fallback)
- `CORELY_DEV_WORKSPACE_ID` (optional local fallback)

## Object storage

Common settings:

- `STORAGE_PROVIDER` (`gcs` or `vercel_blob`)
- `STORAGE_BUCKET`
- `STORAGE_KEY_PREFIX` (optional logical prefix)
- `SIGNED_URL_UPLOAD_TTL_SECONDS` (optional; defaults to `600`)
- `SIGNED_URL_DOWNLOAD_TTL_SECONDS` (optional; defaults to `600`)

For GCS:

- `GOOGLE_CLOUD_PROJECT` (optional if embedded in credentials)
- `GOOGLE_APPLICATION_CREDENTIALS` (path or raw service account JSON)

For Vercel Blob:

- `BLOB_READ_WRITE_TOKEN`
- `VERCEL_BLOB_ACCESS` (`private` by default, `public` optional)
- `VERCEL_BLOB_HANDLE_UPLOAD_PATH` (optional; defaults to `/api/storage/blob/upload`)

## Vercel deployment

- Root Directory: `apps/app`
- Framework Preset: `Next.js`
- Ensure the project can read workspace packages outside `apps/app`
- Run `pnpm prisma:generate` as part of the build environment when needed
- If using Vercel Blob, provision a Blob store and expose `BLOB_READ_WRITE_TOKEN`
