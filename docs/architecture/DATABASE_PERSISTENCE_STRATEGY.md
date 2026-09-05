# Database & Persistence Strategy

## Source of truth

- Prisma schema: `packages/data/prisma/schema`
- Prisma migrations: `packages/data/prisma/migrations`
- generated client: `pnpm prisma:generate`

## Runtime access

The active Next.js runtime should access the database through:

- a server runtime helper in `apps/app/src/server/*`
- module-specific infrastructure adapters in `packages/modules/*`

## Rules

1. Page components do not query Prisma directly.
2. Route handlers do not embed ad hoc SQL or business logic.
3. Module adapters own mapping between database rows and domain entities.
4. Contract DTOs are produced after domain/application processing, not in persistence code.
