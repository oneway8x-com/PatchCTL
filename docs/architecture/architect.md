# Corely Architecture

**Version:** 2.0  
**Date:** 2026-04-06

---

## Intent

Corely is an **AI-native modular Coding Agent ready Boilerplate** delivered as a **modular monolith**. The repository maintains strict boundaries (DDD + hexagonal) so feature teams can iterate in one codebase today and peel out services later if needed.

It is built around:
- one Next.js App Router runtime in `apps/app`
- shared business modules in `packages/modules/*`
- shared contracts in `packages/contracts`
- shared persistence schema in `packages/data/prisma`
- shared storage adapters in `packages/storage`

The repository treats Next.js route handlers as the synchronous transport layer, while domain and business logic stays purely in shared, framework-agnostic packages. PostgreSQL + Prisma back the transactional core.

---

## Active runtime surfaces

- **App (`apps/app`)**: public pages, admin pages, auth entrypoints, and synchronous API route handlers. This serves as the primary UI and HTTP transport layer.
- **Database (`packages/data/prisma`)**: Prisma schema, migrations, and generated client source of truth.
- **Shared module packages (`packages/modules/*`)**: domain entities, application use cases, ports, and infrastructure adapters.
- **Storage package (`packages/storage`)**: runtime adapters for GCS and Vercel Blob behind `ObjectStoragePort`.

---

## Monorepo layout (Detailed)

- **apps/**: 
  - `app`: The Next.js unified application containing all UI and route handlers.
- **packages/**:
  - `contracts`: Shared schemas, enums, events, and tool cards (single source of truth for wire formats).
  - `modules/*`: Extracted feature areas like `todos`, and future domains (identity, workflows, AI copilot).
  - `data`: Prisma schema (`packages/data/prisma`), shared repositories, Unit of Work, and outbox adapters.
  - `storage`: Storage abstractions for files/objects.

---

## Backend architecture

- **Hexagonal per module:** `packages/modules/*` follow domain → application (ports/use-cases) → infrastructure (Prisma/adapters) with testkits. 
- **Transport layer:** Next.js Route handlers in `apps/app/app/api/*` act as thin orchestration/serialization layers that invoke use cases from `packages/modules/*`.
- **Data & transactions:** Prisma access stays strictly behind adapters in the module packages, not in page components or route handlers. Only repositories talk to Prisma.
- **AI Copilot:** AI integrations are modeled as modules that propose structured actions (tool cards). They record tool executions, runs, and messages, with mutations being explicit and user-confirmed.
- **Error model:** Standardized domain errors (UserFriendly, Validation, Unauthorized, Forbidden, NotFound, Conflict) which map to HTTP responses at the transport boundary.

---

## Boundary rules (Core Rules)

1. **Transport Separation:** UI and HTTP transport live in `apps/app`.
2. **Business Logic Isolation:** Domain and application logic live in `packages/modules/*`. Shared modules must stay framework-free (no Next.js imports).
3. **Contracts:** `packages/contracts` is the wire-format source of truth for communication across boundaries.
4. **Database Access:** Prisma access stays behind adapters. Modules communicate via contracts/events, not direct table writes to another module's domain.
5. **Thin Handlers:** Route handlers are only for orchestration and serialization.
6. **Cross-platform contracts:** Any future clients consume versioned contracts from `packages/contracts`.

---

## Domain module catalog

As Corely grows, domains should be treated as bounded contexts with their own ownership and APIs following **Domain-Driven Design (DDD)** principles:
- **Bounded Contexts:** Each module encapsulates its own domain model, isolated from others. It has its own ubiquitous language, meaning terms used within the module are specific to its context.
- **Aggregate Roots:** Modules expose aggregate roots (e.g., a `WorkflowDefinition` or a `Tenant`) to guarantee consistency of changes. Cross-aggregate updates should be eventually consistent via domain events.
- **Explicit APIs:** Modules communicate with each other through well-defined contracts and events, never by sharing database tables directly.

| Module domain             | Purpose                                             | Core entities (examples)                           |
| ------------------------- | --------------------------------------------------- | -------------------------------------------------- |
| Identity & Access         | Tenants, users, roles, policies, API keys.          | Tenant, User, Membership, Role, Permission         |
| Documents                 | Receipts, contracts, attachments, OCR metadata.     | Document, File, DocumentLink                       |
| Billing & Payments        | Invoices, payments, refunds, allocations.           | Invoice, InvoiceLine, Payment, Allocation          |
| Workflows                 | State machines, approvals, tasks.                   | WorkflowDefinition, WorkflowInstance, Task         |
| AI Copilot                | Tool registry, runs, messages, tool execution logs. | AgentRun, Message, ToolExecution, Attachment       |
| Todos (Sample)            | Sample domain for task management.                  | Todo, TodoList                                     |

---

## Multi-tenancy, security, and customization

**Tenant isolation:** Every relevant row is scoped by `tenantId`; uniqueness and indexes include `tenantId`. 

**Authorization:** RBAC by default, optional ABAC policies for high-precision rules.

**Customization strategy:** Configuration first (custom fields, statuses, numbering, templates) + workflow definitions. Code-level module packs are only used for heavy extensions.

---

## Current implementation status

The first extracted module is `todos`, which already follows the new shape:

- Next pages under `apps/app/app/(dashboard)/todos/*`
- route handlers under `apps/app/app/api/todos/*`
- module package under `packages/modules/todos`

Additional legacy domains must follow the same extraction pattern before they become part of the new runtime.
