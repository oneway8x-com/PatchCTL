# Adapt engineering guidance for PatchCTL

## Context and scope

- Direct maintainer request; no new issue or PR required.
- Work on existing local `main`. Import/review the handbook, agent instructions, and seven skills
  from the local TruckerPoints repository; tailor them for an open-source solo maintainer using
  autonomous agents. Keep the source repository unchanged.
- Documentation and instruction files only. No runtime behavior, dependencies, schema, GitHub
  state, production data, deployment, or license changes.

## Adaptation decisions

- Merged the source root/nested agent guidance into PatchCTL's root `AGENTS.md`, retaining the
  original 17 architecture rules and adding scope-based verification guidance.
- Replaced nested source paths and the source project's board with PatchCTL's root workspace,
  real feature/test paths, and Project 7. Existing `@corely/*` package names remain accurate.
- Removed mandatory assigned tickets, second reviewers, draft-only PR gates, Slack ceremonies,
  and corporate roles. Direct requests and explicit main-branch batches can proceed autonomously;
  maintainer review-later holds remain visible and separate from code delivery.
- Preserved human content approval, Tenant isolation, atomicity, receipts, audit, isolated test
  databases, public-repository hygiene, and explicit release boundaries.
- Adapted all seven source skill names, supporting review/sizing/GitHub/skill guides, and optional
  task conventions. Added a short contributor entrypoint and README navigation.
- Did not copy machine launch configuration, driver-product rules, Cloud Run deployment policies,
  automated PR-review instructions, credentials, or unrelated application code. PatchCTL has no
  verified deployment runbook or installed AI review bot established by this import.

## Verification

- Passed: skill-creator's frontmatter/scaffold validator for all seven skills; all folder names
  match the declared names.
- Passed: 59 local links/anchors across 18 Markdown files, and focused Prettier checks.
- Passed: `pnpm arch:check`, `pnpm typecheck`, and Prisma schema validation.
- Passed: `pnpm test` against the existing disposable loopback `patchctl_test` database, followed
  by `pnpm --filter patchctl test`. No production data or migration was used.
- Passed: `pnpm build`, run after tests so package outputs were not replaced concurrently.
- Not run: browser suites (no UI/runtime changes), remote CI, deployment, or publication.
- Static instruction walkthroughs passed: a direct main-branch request needs no issue/PR;
  diagnosis-only and review requests do not authorize fixes or comments; a blocked batch proceeds
  only to independent work; review-later holds stay In review; deployment without a verified
  runbook stops with a blocker; coding autonomy never grants human content-approval authority.
  These are instruction-consistency checks, not a claim of live agent or deployment execution.
- Source-specific naming scan found only deliberate provenance/exclusion explanations. All 17
  original architecture rules match verbatim; no executable/configuration/schema files changed.
- Passed: final staged whitespace/diff checks and scope review (18 Markdown files only).

## Blockers

None for this documentation import. Existing product/runtime issues are outside this task.

## Handoff

Self-reviewed and prepared for the accompanying local documentation commit on `main`. No push,
PR, issue comment, or board update was requested for this documentation task. Runtime/deployment
claims in imported source instructions were not carried over as facts. Revert the documentation
commit if the conventions need to be withdrawn; there is no database or content rollback.
