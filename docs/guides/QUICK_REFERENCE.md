# Quick Reference

## Core commands

```bash
pnpm install
pnpm prisma:generate
pnpm dev
pnpm build
pnpm typecheck
pnpm arch:check
```

## Active runtime locations

- app pages: `apps/app/app`
- app source modules: `apps/app/src/modules`
- route handlers: `apps/app/app/api`
- shared module packages: `packages/modules`
- contracts: `packages/contracts`
- schema/migrations: `packages/data/prisma`

## First extracted module

- module package: `packages/modules/todos`
- pages: `apps/app/app/(dashboard)/todos/*`
- routes: `apps/app/app/api/todos/*`
