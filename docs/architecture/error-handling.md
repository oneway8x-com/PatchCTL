# Error Handling

Corely now standardizes on **HTTP Problem Details style responses** from Next.js route handlers.

## Principles

- route handlers catch transport-facing errors
- module use cases throw domain/application errors
- serializers convert them into stable HTTP responses

## Current implementation

The active implementation lives in:

- `apps/app/src/server/problem-details.ts`

That layer currently handles:

- module not-found errors
- Zod validation errors
- unexpected server errors

## Direction

As more modules are extracted, error handling should stay centralized in `apps/app/src/server/*` rather than being reimplemented inside each route.
