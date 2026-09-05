# Corely Agent Rules

1. Identify the feature that owns the requested change.
2. Use the todo feature as the reference structure for simple features.
3. Inspect the complete request flow before editing.
4. Keep simple feature code close together.
5. Do not introduce full DDD layering for trivial CRUD.
6. Keep explicit use cases.
7. Do not import Prisma outside repository or persistence code.
8. Do not bypass use cases from routes, UI, or AI tools.
9. Use Tenant, never Workspace.
10. Do not reintroduce Platform, Workspace, or generic Automation domains.
11. Do not create abstractions for one trivial implementation.
12. Keep ports for external or volatile boundaries.
13. Preserve tenant isolation and authorization.
14. Avoid unrelated file changes.
15. Add or update tests for changed behavior.
16. Run type checking, relevant tests, Prisma validation, and build.
17. Summarize changed files and remaining risks.
