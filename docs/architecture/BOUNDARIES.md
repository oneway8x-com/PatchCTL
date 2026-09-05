# Corely — Boundaries

## App boundaries (`apps/app`)

Allowed:

- `src/app/*` -> `src/modules/*`, `src/shared/*`, `src/server/*`
- `src/modules/*` -> `src/shared/*`, package dependencies
- `app/api/*` -> `src/server/*`, package dependencies

Forbidden:

- `src/shared/*` importing `src/modules/*`
- page components importing Prisma directly
- route handlers implementing business rules inline

## Module package boundaries (`packages/modules/*`)

Allowed:

- `application/*` -> `domain/*`, contract types, ports
- `infrastructure/*` -> application ports, domain, persistence clients

Forbidden:

- imports from `next/*`
- imports from `react`
- imports from `apps/app/*`

## Persistence boundaries

- Prisma schema and migrations live under `packages/data/prisma`
- Prisma access must stay inside adapters/runtime helpers
- contracts and UI must not import Prisma types directly

## Public contract boundaries

- `packages/contracts` defines request/response payloads
- route handlers serialize to contract shapes
- client code should consume contract DTOs, not internal entities
