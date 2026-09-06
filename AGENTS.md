# PatchCTL agent instructions

PatchCTL is an open-source project maintained by a solo developer with autonomous coding agents.
Read the [Engineering Handbook](docs/ENGINEERING-HANDBOOK.md) for workflow and verification.
Run pnpm commands from this repository root, not from a nested source directory.

## Architecture rules

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

## Autonomous workflow

- Complete the requested work without repeated permission prompts for ordinary, in-scope edits,
  tests, and local commits. A direct maintainer request is sufficient; an issue, assignee, PR,
  second reviewer, and team meeting are not prerequisites.
- Follow the maintainer's selected branch. For an explicitly requested main-branch batch, work
  sequentially on `main`, verify each ticket, and make small, descriptive commits. Otherwise, use a
  short descriptive name such as `<issue>-<summary>` or `<summary>` when a new branch is appropriate
- Self-review every change. Maintainer review can happen later when requested; do not claim it
  already happened. Creating/pushing PRs, merging, publishing, and deploying are separate actions
  that must be within the user's request. Repository rules and branch protection still apply.
- For ticket batches, use the existing order and dependencies. Update Project 7 and comment on
  issues when that workflow is requested. Log a blocker in the task record and continue with the
  next independent ticket; do not implement guessed business semantics to bypass a blocker.
- Keep factual notes for multi-step work or blockers under [tasks/](tasks/README.md). Tiny edits
  need only a commit and handoff. No invented issue IDs or duplicate paperwork.
- Read-only questions, diagnosis, and reviews do not authorize fixes or external messages.
- Preserve unrelated changes. Write English. Never commit credentials, real customer data,
  private logs, demo sessions, or generated build output to this public repository.

## PatchCTL safety boundary

Coding autonomy is not content-approval authority. Agents can read and propose content patches;
an authorized human must approve the exact immutable revision before live content is changed.
Preserve Tenant isolation, schema allowlists, conflict detection, atomic application, receipts,
and audit provenance. Do not expose raw SQL, agent approval/apply, or inferred publishing rules.
Use disposable local databases for tests; verify the target before any migration or seed.
No production database changes or deployment are implied by permission to implement a ticket.

## Validation and reusable skills

For behavior changes, run type checking, relevant tests, Prisma validation, architecture checks,
and build as described in the handbook. For documentation-only changes, validate links, commands,
formatting, and skill metadata instead; explain that runtime checks were not rerun.
Report checks as passed, failed, blocked, or not run, with evidence. Never weaken a check to pass.

The [skill catalog](docs/ai/skills-management.md) describes the nine procedures in
[`.agents/skills/`](.agents/skills). Select only the relevant skill and read it fully before use.
Skills support this repository's rules; they do not expand task scope or require a corporate
review/deployment process. Legacy Corely architecture documents are background, not a mandate
to restore removed domains or layering.

After a meaningful verified increment, consider the `build-in-public` skill and create or update
at most one useful public-safe draft. A routine fix or maintenance commit may need no draft.
Marketing is never a completion gate, and finishing code never authorizes automatic publication;
`marketing-publish` is explicit-only and remains subject to exact human review and channel policy.
