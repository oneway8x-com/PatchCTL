---
name: implement-ticket
description: Implement a PatchCTL issue, direct maintainer request, or ordered ticket batch with scoped verification, commits, and requested progress updates.
---

# Implement a PatchCTL ticket

Read [AGENTS.md](../../../AGENTS.md) and the
[handbook](../../../docs/ENGINEERING-HANDBOOK.md). A clear direct request is sufficient;
do not require an issue, assignee, PR, or second reviewer before starting.

1. Confirm the requested outcome, acceptance criteria, dependencies, branch, and existing changes.
   For a batch, follow the agreed order and handle one ticket at a time. Preserve an explicit
   main-branch workflow; otherwise use the repository's branch convention when needed.
2. Identify the owning feature and inspect the complete CLI/UI -> route -> authorization -> use
   case -> persistence/target flow and tests. Use `packages/modules/todos/src` as the simple-feature
   reference; keep patch-specific transactional boundaries in the patch feature.
3. Implement the smallest complete change and relevant tests. Preserve Tenant checks, immutable
   human approval, conflict detection, atomic apply, receipts, and audit. Permission to implement
   autonomously does not grant human content-approval authority or production database access.
4. Run the handbook's scope-appropriate checks, inspect UI evidence when relevant, and self-review
   the owned diff. Record actual failures/skips. Commit coherent verified increments when commits
   are in scope; stage explicit files and leave unrelated changes untouched.
5. For substantial work or blockers, keep a short [task record](../../../tasks/README.md). When
   the user requested ticket tracking, follow the [GitHub reference](../../../docs/skills/github-workflow.md)
   to update status and comment with commit, checks, and delivery state. Review-later work stays
   In review; do not claim it was accepted or pushed.

If blocked, document the evidence, affected scope, exact unblocking requirement, and safe next
step. Continue with the next independent ticket when continued batch work was requested. Do not
guess publishing semantics, bypass a safety gate, or loop unchanged authentication failures.
For a single blocked task, report the blocker after exhausting safe in-scope alternatives.

Finish with what changed, verification, commit/delivery state, and remaining risks. Do not add
unrequested external actions or treat a local implementation as a release.
