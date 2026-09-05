# Corely — Overall Structure

```text
corely/
  apps/
    app/                               # Next.js App Router runtime
    e2e/                               # Playwright tests

  packages/
    api-client/                        # transport helpers
    auth-client/                       # auth client primitives
    contracts/                         # shared request/response schemas
    data/                              # Prisma schema + generated client workflow
    domain/                            # shared domain primitives
    email/
    email-templates/
    kernel/                            # cross-cutting ports/tokens/helpers
    storage/                           # object storage adapters (GCS, Vercel Blob)
    modules/
      todos/                           # extracted module package
    prompts/
    public-api-client/
    public-urls/
    ui/                                # shared UI components

  docs/
  scripts/
  package.json
  pnpm-workspace.yaml
```

## Next app structure

```text
apps/app/
  app/
    (auth)/
    (dashboard)/
    api/

  src/
    app/
      providers.tsx
    lib/
    modules/
      todos/
    server/
      object-storage.ts
      prisma.ts
      problem-details.ts
      tenant-context.ts
      todos-runtime.ts
```

## Module package structure

```text
packages/modules/todos/
  src/
    domain/
    application/
      ports/
      use-cases/
    infrastructure/
    index.ts
```

## Persistence structure

```text
packages/data/
  prisma/
    schema/
    migrations/
  src/
```

`packages/data/prisma` remains the canonical schema/migration location even though the active HTTP runtime is now `apps/app`.
