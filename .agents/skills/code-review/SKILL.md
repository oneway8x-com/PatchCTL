---
name: code-review
description: Review a PatchCTL diff, commit range, or pull request for actionable correctness, safety, and regression risks; also use for focused implementation self-review.
---

# Review code

Read [AGENTS.md](../../../AGENTS.md) and
[review guardrails](../../../docs/engineering/REVIEW-GUARDRAILS.md).

Establish the requested diff/base and inspect changed files plus the relevant callers, contracts,
use cases, repositories, and tests. For main-branch batches, isolate the selected ticket's commit
range; do not present all unpublished work as that ticket's diff. Preserve the worktree.

Focus on demonstrable defects: Tenant leakage, authorization bypass, mutable approvals,
conflict races, partial writes, broken receipt recovery/audit, contract drift, unsafe rendering,
and incorrect CLI/UI behavior. Consider compatibility and whether tests exercise real boundaries.
Do not introduce generic architecture demands or label unrelated baseline debt a new regression.

Run relevant read-only diagnostics/tests where safe. Database tests require disposable local
fixtures; running a review does not authorize production mutation. A passing mock test or local
build is not evidence of full-stack correctness or remote CI success.

Report must-fix findings first, each with a precise location, trigger, impact, and concise remedy.
Separate suggestions and questions. If no actionable findings are supported, say so and mention
verification gaps. Do not invent findings to fill a quota or include private logs/transcripts.

A review request is read-only: do not fix files, post GitHub comments, request reviewers, change
statuses, or merge unless separately requested. Self-review during authorized implementation
can lead to in-scope fixes, but must not be represented as independent human acceptance.
