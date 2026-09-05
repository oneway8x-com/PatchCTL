---
name: bug-fix
description: Reproduce and diagnose PatchCTL defects, and implement a focused regression-tested fix when requested. Diagnosis-only requests stop before editing.
---

# Diagnose or fix a bug

Read [AGENTS.md](../../../AGENTS.md) and the
[verification guidance](../../../docs/ENGINEERING-HANDBOOK.md#verification).

Establish the expected behavior, actual failure, affected Tenant/source, and safe reproduction.
Inspect the full owning flow, contracts, and relevant tests. Use synthetic local fixtures and
sanitized evidence; do not obtain production records or expose credentials to reproduce a bug.

For diagnosis-only requests, report the cause, evidence, uncertainty, and suggested remedy;
do not edit code, create a branch, post a comment, or implement the fix.

When fixing is requested:

- Add a focused regression that fails before and passes after the fix when practical. If the
  failure cannot be reproduced safely, state that and distinguish hypotheses from findings.
- Fix the owning use case or boundary. Do not patch only the UI when server authorization is
  broken, weaken validation to satisfy a fixture, or perform unrelated architecture cleanup.
- For apply bugs, test the relevant race/rollback/replay path against isolated Postgres. Preserve
  exact-revision approval and receipt recovery; never repair production content through ad hoc SQL.
- Run relevant tests and the handbook's behavior-change checks. Self-review the complete diff,
  make a focused local commit when requested, and record remaining limitations.

Respect the selected main/branch workflow. Use a [task record](../../../tasks/README.md) only
when the work is substantial or blocked. Issue comments and board updates require an in-scope
tracking request; a bug investigation does not automatically require a new public issue or PR.
