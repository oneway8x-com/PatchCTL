# Task records

Use a short record for multi-step work, cross-session handoffs, or blockers. Tiny changes do not
need a file. GitHub remains the shared tracker for ticketed work; these files hold durable factual
implementation evidence without forcing every direct request through an issue or PR.

- With an issue: `tasks/<issue>-<short-summary>.md`, independent of the branch name.
- Without an issue: `tasks/<short-summary>.md`; state that it is a direct maintainer request.
- For a main-branch batch, keep a record per substantial ticket or use an existing batch log;
  do not create one ambiguous `main.md` or duplicate historical progress reports.
- Start from the [template](templates/task-template.md), omit irrelevant sections, and update the
  same record. Keep it short: scope, factual decisions, checks, blockers, and handoff.
- A blocker needs the failed operation/evidence, affected work, requirement to unblock, and safe
  next step. Record resolved blockers as resolved; do not leave old access failures as current facts.
- No invented issue IDs, credentials, private logs, personal data, agent transcripts, or detailed
  internal reasoning. Public summaries should link to evidence and state limitations honestly.

Task notes do not override [AGENTS.md](../AGENTS.md) or authorize pushes, issue creation, or deployment.
