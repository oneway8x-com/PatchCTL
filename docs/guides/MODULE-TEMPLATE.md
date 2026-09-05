# Module Template

## 1. Shared package

Create a module package under:

```text
packages/modules/<module>/
  src/
    domain/
    application/
      ports/
      use-cases/
    infrastructure/
    index.ts
```

## 2. Next.js transport

Expose the module through:

```text
apps/app/app/api/<module>/
```

Keep route handlers thin:

- parse request
- validate input
- resolve runtime dependencies
- call use cases
- return contract DTOs

## 3. UI module

Create feature UI in:

```text
apps/app/src/modules/<module>/
```

Keep `shared/*` reusable and module-agnostic.
