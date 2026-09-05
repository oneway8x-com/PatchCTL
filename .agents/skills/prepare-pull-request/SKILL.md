---
name: prepare-pull-request
description: Prepare a PatchCTL PR description or an explicitly requested PR submission with verified scope and test evidence. Does not require PRs for maintainer main-branch work.
---

# Prepare a pull request

Read [AGENTS.md](../../../AGENTS.md) and the
[contribution/review policy](../../../docs/ENGINEERING-HANDBOOK.md#open-source-contributions-and-review).
PRs support external contributions and reviewable branches; they are not mandatory for the
maintainer's explicitly selected main-branch workflow.

Determine whether the user wants text only, a draft, or an actual submitted PR. Text-only work
does not authorize a push, PR creation, reviewer request, or branch change. Preserve existing PR
content and user edits when updating a PR rather than replacing unrelated sections.

For submission, verify the repository/remote, base/head branches, intended commits, cleanly
scoped diff, and existing PRs using the [GitHub reference](../../../docs/skills/github-workflow.md).
Push only the authorized branch/commits; never force-push or create a duplicate PR. Do not create
a PR from main to itself; if the current workflow is local main, provide a handoff instead unless
the maintainer has requested a different delivery arrangement.

Self-review with [review guardrails](../../../docs/engineering/REVIEW-GUARDRAILS.md). Include:

- **Ticket/context:** actual issue link, or the direct request without an invented issue.
- **What changed:** concise user-visible and technical scope.
- **How to test:** actual commands/results, including failures, blocked checks, and skips.
- **UI evidence:** relevant rendered screenshot/recording, or not applicable.
- **Notes/risks:** compatibility, security/data implications, rollout or recovery considerations.

Use Draft for incomplete work or when requested. Verified, self-reviewed work can be ready
without an assigned second human reviewer. Respect branch protection and any explicit review hold;
never fabricate review or CI results. Creating a PR does not authorize merging it or deployment.
