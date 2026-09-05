# Todo Architecture Simplification Audit

## Current Todo Architecture

The current request flow for a Todo (e.g., creating a Todo) follows an overly complex path for a simple feature:

```text
POST route (in apps/app)
→ TodoController (implied) / createTodo
→ CreateTodoUseCase (in use-cases/create-todo.usecase.ts)
→ TodoRepositoryPort (in application/ports/todo-repository.port.ts)
→ PrismaTodoRepository (in infrastructure/prisma-todo-repository.ts)
→ Prisma Client
```

## Current Todo File Map

Files involved in the Todo behavior (found in `packages/modules/todos/src`):
- `domain/todo.entity.ts`: Domain model with basic behavior.
- `application/errors.ts`: Error definitions (e.g., `TodoNotFoundError`).
- `application/mappers/todo-dto.ts`: DTO mappers.
- `application/ports/todo-repository.port.ts`: Interface for repository.
- `application/use-cases/*.usecase.ts`: Individual use case files.
- `infrastructure/prisma-todo-repository.ts`: Concrete Prisma implementation.
- `infrastructure/ai/tools/*.ts` and `application/ai-tools/*`: AI tool implementations and registry for Todos.

## Complexity Findings

### Finding 1: Unnecessary abstraction in persistence layer
- **Severity**: Medium
- **Files**: `application/ports/todo-repository.port.ts`, `infrastructure/prisma-todo-repository.ts`
- **Current Behavior**: Defines an interface `TodoRepositoryPort` and a separate `PrismaTodoRepository` that implements it.
- **Unnecessary Complexity**: For a simple feature, splitting the repository into a port interface and an implementation adds boilerplate without real architectural value, especially if only Prisma is used.
- **Proposed Simplification**: Merge into a single `todo.repository.ts` inside the feature module.
- **Risk**: Low. Dependency injection might need adjustments.
- **Validation Approach**: Ensure the repository can still be mocked or tested.

### Finding 2: Boilerplate domain entities and mappers
- **Severity**: Low
- **Files**: `domain/todo.entity.ts`, `application/mappers/todo-dto.ts`
- **Current Behavior**: Explicit mapping between Prisma row formats, domain entity objects, and DTOs.
- **Unnecessary Complexity**: The Todo entity is mostly a data bucket with trivial `complete` and `update` methods. DTO mappers are excessive for basic CRUD.
- **Proposed Simplification**: Remove the mapper and use typed schemas directly if needed, merging the entity logic into simple use-case functions or utilizing Prisma types.
- **Risk**: Low.
- **Validation Approach**: Run type checks and API route tests.

### Finding 3: AI tools structure is over-engineered
- **Severity**: Low
- **Files**: `application/ai-tools/*`, `infrastructure/ai/tools/*`
- **Current Behavior**: A complex domain tool registry and executor just for Todo AI actions.
- **Unnecessary Complexity**: The tools should just call the existing use cases.
- **Proposed Simplification**: Replace with simple AI tool definitions that directly call use cases.

---

## Schema Removal Findings

### `05_platform`

- **PlatformSetting, PlatformApp, AppCatalog, TenantAppInstall, etc.**: Unused or only support generic platform administration.
- **Classification**:
  - `AppCatalog`, `TenantAppInstall`, `TemplateCatalog`, `TenantTemplateInstall`, `PackCatalog`, `TenantPackInstall`, `TenantFeatureOverride`, `TenantMenuOverride`: **Delete**. These are obsolete generic platform features.
  - `SeededRecordMeta`: **Keep temporarily or Move to Operations**.
- **Must be Migrated?**: No, unless they store vital tenant config.

### `20_workspaces`

- **LegalEntity, Workspace, WorkspaceDomain, WorkspaceMembership, WorkspaceInvite**: Supports the old Workspace concept.
- **Classification**:
  - `Workspace` -> **Migrate** to `Tenant` (in `10_identity.prisma`).
  - `WorkspaceMembership` -> **Migrate** to `Membership` (in `10_identity`).
  - `WorkspaceDomain`, `WorkspaceInvite`: **Delete** or move to `TenantDomain` / `TenantInvite`.
  - `LegalEntity`: **Delete** if obsolete.
- **Must be Migrated?**: Yes, `workspaceId` must become `tenantId`.

### `95_automation`

- **OutboxEvent, DomainEvent, AuditLog, IdempotencyKey**: These are operational capabilities, not generic low-code automation.
- **Classification**:
  - `OutboxEvent`, `DomainEvent`: **Move to Infrastructure / Persistence**.
  - `AuditLog`: **Move to Audit / Operations**.
  - `IdempotencyKey`: **Move to Infrastructure**.
- **Must be Migrated?**: No models are strictly "deleted", they should be **Relocated** as they are independently required infrastructure models.
