# Review guardrails

Use these for a requested review or focused self-review. Reviewing does not authorize editing,
posting comments, changing board status, or merging. The maintainer may review later; no second
reviewer is required for ordinary solo development.

## Establish the evidence

- Identify the requested diff/base and inspect the whole affected request flow and tests.
  On a main-branch ticket batch, compare the ticket's commits, not an arbitrary remote baseline.
- Separate introduced defects from existing debt. Do not suppress checks, widen ignores, or
  refactor unrelated code to make the diff appear clean.
- Verify behavior and check results. An agent's summary, mocked response, or screenshot alone
  does not prove transactional safety, authorization, or a remote CI result.
- Report an actionable defect with its location, triggering condition, impact, and concise remedy.
  Prioritize correctness/security/data loss. Label optional suggestions and unanswered questions.
  If no actionable defect is found, say so and state verification gaps without inventing findings.

## PatchCTL-specific checks

- Routes, UI, and CLI delegate business behavior to explicit use cases. Prisma stays in persistence.
  Simple features follow the Todo structure; keep ports for volatile/external boundaries.
- Tenant scope and membership are checked server-side. Agent keys cannot approve/apply or obtain
  source credentials. A disabled UI button is not an authorization check.
- Public payloads are validated through contracts. Treat external values as `unknown` and narrow
  them; do not introduce `any`, unsafe assertions, or suppressions to evade the contract.
- Approval binds the exact immutable revision; changed records, schema drift, and changed relation
  targets fail closed. Conflict checks and writes must not be separated by a race window.
- Batch writes are atomic; duplicate/concurrent apply and metadata failure after target commit
  preserve receipt-based recovery and truthful audit. Rejection performs no target writes.
- Editable fields and relations are allowlisted; publishing rules are not inferred from an enum.
  Scheduling validates explicit UTC fields without inventing a background publishing engine.
- Review screens display before/after, affected records, null/empty values, and outcomes clearly;
  render untrusted content as text and do not leak secrets or another Tenant's data.
- Tests cover the relevant success, denial, conflict, and failure paths with isolated fixtures.
  Avoid changing established behavior to fit a mock or adding abstractions solely for test plumbing.

Keep the final review concise. Detailed factual reproduction notes may live in a task record;
private credentials and internal agent transcripts do not belong there or in public comments.
