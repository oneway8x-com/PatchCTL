# Migration Report: Platform, Workspace, and Automation Removal

This document outlines the changes made to simplify the Corely architecture by removing obsolete generic domains.

## Relocated Responsibilities

- **Automation to Infrastructure**: The models inside `95_automation.prisma` (`OutboxEvent`, `DomainEvent`, `AuditLog`, `IdempotencyKey`) were confirmed to be operational infrastructure. The schema file was renamed to `90_infrastructure.prisma` with no changes to the underlying table names, columns, or relations. No data migration is required.
- **Platform to Infrastructure**: The `SeededRecordMeta` model was moved to `90_infrastructure.prisma` since it provides a necessary application function (template customization protection). Its database mapping remains unchanged.

## Removed Models

- **Platform (`05_platform.prisma`)**: Removed entirely. The obsolete models deleted include `AppCatalog`, `TenantAppInstall`, `TemplateCatalog`, `TenantTemplateInstall`, `PackCatalog`, `TenantPackInstall`, `TenantFeatureOverride`, and `TenantMenuOverride`.
- **Workspaces (`20_workspaces.prisma`)**: Removed entirely. The models deleted include `Workspace`, `WorkspaceMembership`, `WorkspaceDomain`, `WorkspaceInvite`, and `LegalEntity`.

## Migration Order

The Workspace to Tenant migration was executed using an expand-and-contract strategy:
1. **Expand**: Verifying that `tenantId` exists alongside `workspaceId`. (In the current schema, all active models like `Todo` and `IntegrationConnection` already required `tenantId`).
2. **Backfill**: N/A, as `tenantId` was already required and populated.
3. **Compatibility**: Application routes and use cases updated to drop `workspaceId` parameters.
4. **Contract (Columns)**: Removed `workspaceId` columns and indexes from `77b_todos.prisma`, `64_integrations.prisma`, and `10_identity.prisma`.
5. **Contract (Tables)**: Dropped `20_workspaces.prisma`.

## Affected APIs and Workers

- `todo` module simplified to a reference feature implementation without DTO mappers, complex ports, or deep AI registry abstractions.
- All references to `workspaceId` in API routes and runtime environments have been updated to rely solely on `tenantId`.

## Compatibility Concerns

- The database migrations removing `workspaceId` and dropping the `Workspace` tables are destructive. They must only be applied after verifying that all data relies successfully on `tenantId`. A `prisma migrate dev` command will generate the SQL, which must be carefully reviewed in a production environment before deployment.
