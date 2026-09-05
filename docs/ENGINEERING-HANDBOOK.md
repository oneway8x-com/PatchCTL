# PatchCTL Engineering Handbook

PatchCTL is an open-source, solo-maintained project built with autonomous coding agents.
The objective is small, working increments with reproducible evidence, not team ceremony.
This handbook adapts the reusable practices from TruckerPoints to PatchCTL; the
[agent instructions](../AGENTS.md) define the repository's architecture constraints.

## Product and ownership

Coding agents safely manage structured content through `patchctl`, with human review before
content changes go live. The first demo is **adding English summaries to ten articles missing
one**. Text edits, bulk edits, missing content, translations, and simple enum/relation assignments
share the proposal/review/apply flow. Scheduling is field validation, not an activation engine;
publishing requires explicit source-specific business semantics.

The maintainer sets product direction and accepts risk. An agent can investigate, implement,
test, document, and commit an authorized task autonomously. It must stop or isolate the affected
ticket when a material product choice, missing authority, or unsafe environment prevents progress.
The maintainer need not act as a second developer, appoint a reviewer, or hold a planning meeting.

Development autonomy never grants an agent human content-approval credentials. Preserve the
product's authorization boundary even when the maintainer has said "work autonomously."

## Repository map

Run commands from the root with the Node and pnpm versions in [package.json](../package.json)
(currently Node >=22.19 and pnpm 10.26).

| Area                     | Location and responsibility                                             |
| ------------------------ | ----------------------------------------------------------------------- |
| Web application          | `apps/app`: Next.js pages and API routes                                |
| Patch feature            | `packages/modules/patches`: explicit use cases and persistence/adapters |
| Simple-feature reference | `packages/modules/todos/src`: colocated types, repository, use cases    |
| Public contracts         | `packages/contracts`: validated request/response schemas                |
| Metadata persistence     | `packages/data/prisma`: schema and migrations                           |
| Agent CLI                | `packages/patchctl-cli`: read/propose interface                         |
| Browser verification     | `apps/e2e`: PatchCTL-specific Playwright configs                        |
| CI                       | `.github/workflows/patchctl.yml`: checks, not deployment                |

Inspect the full affected path before editing: CLI or UI -> route -> authorization -> use case
-> repository/target adapter -> response. Keep rules in use cases, Prisma in persistence, and
Tenant scope enforced on the server. Reuse simple patterns; do not add DDD layers or abstractions
for one trivial implementation. Historical Corely documents may describe removed architecture;
current code and the explicit [architecture rules](../AGENTS.md#architecture-rules) take precedence.

## Lightweight planning and delivery

- Use [Project 7](https://github.com/users/hadoan/projects/7) and
  [repository issues](https://github.com/hadoan/PatchCTL/issues) for tracked work. A clear direct
  maintainer request can be implemented without first manufacturing an issue.
- Take the existing priority/dependency order. Prefer one independently testable outcome per
  ticket; see [ticket sizing](engineering/TICKET-SIZING-AND-SCOPE.md). Do not grow scope to fill time.
- Preserve the requested branch. The maintainer's main-branch workflow permits sequential work,
  frequent focused local commits, and later maintainer review. Do not switch branches mid-task.
  When creating a branch, prefer `codex/<issue>-<summary>` or `codex/<summary>` without an issue.
- For substantial work, use a short [task record](../tasks/README.md) for scope, decisions,
  verification, and blockers. Keep tiny fixes lightweight. Existing historical progress logs
  remain valid; do not duplicate or rewrite them merely to adopt this convention.
- Self-review the complete owned diff before committing. Stage explicit files, preserve unrelated
  changes, and use English messages such as `fix(patches): reject stale proposals (#12)`.
- A requested ticket workflow includes truthful progress updates and concise issue comments.
  Missing GitHub access must not block independent local implementation: record the failed
  operation, intended update, and access requirement, then continue where safe. Do not repeatedly
  retry unchanged failures or mark an unsynchronized update as successful.
- Local implementation, pushed code, remote CI, maintainer acceptance, and deployment are different
  facts. Report each accurately. Do not push, publish, or deploy solely because a checklist mentions it.

### Board states

Discover current field IDs/options before writing; never assume another project's IDs.
The working convention is:

| Status      | Meaning                                                                         |
| ----------- | ------------------------------------------------------------------------------- |
| Backlog     | Candidate work, or blocked work with the reason recorded                        |
| Ready       | Scope and prerequisites are sufficient to start                                 |
| In progress | Actively being implemented                                                      |
| In review   | Ready for the requested maintainer review, with checks and limitations recorded |
| Done        | Accepted and delivered under the agreed workflow; no required work remains      |

`In review` can mean a local main-branch handoff when the maintainer requested review later;
include the commit and explicitly say whether it is pushed. It does not require a PR or another
reviewer. If the maintainer explicitly delegates completion without a review hold, an agent may
mark verified, delivered work Done when board updates are in scope; it must not claim human review.
When review was reserved, leave the ticket In review until accepted. Closing an issue is separate
from updating its board status. Keep blockers visible; do not relabel dependent work as complete.

## Open-source contributions and review

External contributors normally use a branch/fork and PR; the maintainer can work directly on main.
An issue is helpful for a substantial proposal but is not required for a typo or focused fix.
No mandatory assignee, second human reviewer, Slack notification, or artificial wait period.
Respect configured branch protection and required checks in either workflow.

Use a draft PR while work is incomplete; a self-reviewed, verified contribution may be ready
without an assigned second reviewer. A request to write a PR description is not permission to
push or open one. PRs should contain: **Ticket/context**, **What changed**, **How to test**,
**UI evidence** (or not applicable), and **Notes/risks**. Include actual check results and limitations.
Use the same concise structure for a main-branch handoff when helpful, not as compulsory paperwork.

Review for correctness and scope using [review guardrails](engineering/REVIEW-GUARDRAILS.md).
Separate must-fix findings from suggestions and questions. Public issue/PR comments should be
short, factual, and useful to a future contributor; never paste agent transcripts, credentials,
private environment details, or unsupported claims. Posting comments must be part of the request.

## Verification

Choose checks for the changed behavior and record actual results. Baseline failures are not new
regressions, but remain failures: document them and avoid unrelated fixes or suppression.

For documentation-only work, inspect links, command/path accuracy, Markdown formatting, and any
skill frontmatter. Runtime tests, Prisma validation, and production build need not be rerun when
no executable behavior, configuration, schema, or generated code changed. If a documented command
cannot be safely exercised, validate it against the implementation and disclose that limitation.

For behavior changes, the standard verification set is:

```powershell
pnpm typecheck
pnpm --filter @corely/data exec prisma validate
pnpm arch:check
pnpm test
pnpm --filter patchctl test
pnpm --filter @corely/e2e exec tsc -p tsconfig.patchctl.json
pnpm build
```

`pnpm test` includes database integration tests; even `test:unit` currently points to that same
workspace. Supply a verified disposable loopback `PATCHCTL_TEST_DATABASE_URL` with a database
name ending in `_test`, and the appropriate local `DATABASE_URL`. Follow the existing fixtures
and CI setup; never borrow production credentials to satisfy a test. Prisma client generation
is local code generation; migration/seed commands change data and require a verified target.
Do not use `prisma db push` as a shortcut for reviewed migrations.

For review UI and end-to-end behavior, run as applicable:

```powershell
pnpm --filter @corely/e2e exec playwright test --config playwright.patchctl.config.ts
pnpm --filter @corely/e2e exec playwright test --config playwright.patchctl-demo.config.ts
```

The first uses mocked HTTP boundaries; the second needs the isolated session setup in the
[English-summary demo](patchctl-demo.md) and proves real CLI/browser/Postgres behavior.
Run these and package/Next.js builds sequentially: builds replace shared output and can break
concurrent tests. Check the identity of a reused local server. For UI changes, inspect the actual
rendered page and capture relevant evidence; do not claim a screenshot proves database safety.

Format only changed files with `pnpm exec prettier --check <paths>` (or `--write` when needed).
As of this import, `pnpm lint` lacks an ESLint 9 flat config and `test:int` references an absent
workspace file. Recheck before relying on them; never report them as passing or silently weaken
checks. [CI](../.github/workflows/patchctl.yml) is the executable validation reference, not proof
that a remote run has occurred.

## Security and release boundaries

This is a public repository. Use synthetic fixtures and redact tokens, connection strings with
secrets, private logs, and personal data from commits, screenshots, issue comments, and artifacts.
Do not paste a suspected vulnerability's exploit details or secrets into a public ticket; prepare
a minimal private maintainer handoff through an available private channel. Do not invent a
security email address. Preserve the existing license and third-party notices; a documentation
import does not authorize relicensing or copying unrelated proprietary assets.

Content writes require schema allowlists, an authorized human decision on the exact immutable
patch revision, whole-record conflict checks, transactional all-or-nothing apply, durable target
receipts, and audit provenance. Never bypass a failed gate with direct target SQL. Do not infer
publishing transitions from enum labels. See [release boundaries](patchctl-release.md) and
[apply/recovery](patchctl-apply.md).

There is no verified deployment runbook in this import. The CI file performs checks, not release.
Release readiness can be assessed autonomously; actual publication, deployment, remote migrations,
credential rotation, and production access require an explicitly in-scope target and supported
procedure. Missing infrastructure is a blocker, not permission to invent deployment commands.
Rolling back application code does not undo already-applied content or database migrations.
Content corrections must go through a new reviewed patch; receipt reconciliation follows the
existing apply runbook, not a duplicate proposal.

## Maintenance

Update these instructions when actual repository behavior changes. Keep reusable procedures in
the [skill catalog](ai/skills-management.md), not personal absolute paths or copied team policies.
Historical progress reports describe their original run; recheck access and environment status
before treating an old blocker as current. See [contributing](../CONTRIBUTING.md) for a short entrypoint.
