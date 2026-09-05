---
name: release
description: Assess PatchCTL release readiness or carry out an explicitly requested release using verified repository procedures. Does not invent deployment infrastructure or publish during ordinary implementation.
---

# Release readiness and authorized delivery

Read [AGENTS.md](../../../AGENTS.md), the
[security/release policy](../../../docs/ENGINEERING-HANDBOOK.md#security-and-release-boundaries),
[product release boundaries](../../../docs/patchctl-release.md), and
[apply/recovery notes](../../../docs/patchctl-apply.md).

First distinguish readiness assessment from an actual release. Assessment is read-only except
for explicitly requested local documentation; it does not authorize tags, npm publication,
deployment, remote migrations, or content changes.

Inspect the current commit, dirty worktree, requested artifact/environment, and available workflows.
At the time these skills were imported, `.github/workflows/patchctl.yml` only ran verification;
there was no verified deployment runbook. Recheck current files instead of assuming this remains
true. A README hosting suggestion or passing CI is not proof of a configured deployment process.

For readiness, compare the requested scope against product limits and verification evidence.
Run authorized local checks with disposable fixtures; keep builds and browser tests sequential.
Report failures, missing evidence, unpublished commits, schema implications, and unresolved
publishing semantics honestly. Do not treat historical access blockers as current without checking.

Execute a release only when it is explicitly in scope and there is a verified procedure for the
named target, exact commit/artifact, credentials, required checks, migration plan, and rollback.
Respect existing repository protection and release gates; no additional team reviewer is invented.
If any necessary procedure or material choice is missing, log the blocker and report the exact
requirement. Do not invent Cloud Run/Vercel workflows, credentials, release labels, npm packages,
or dispatch verification CI as if it deployed the app.

Verify the observable result of any authorized publication/deployment and report its identifier
and limitations. Application rollback is not database/content rollback. Never undo approved
content by direct SQL: use a new reviewed patch; reconcile an interrupted apply using its existing
receipt and approved ID. Broad coding autonomy does not override human content approval.
