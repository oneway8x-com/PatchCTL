# GitHub workflow reference

Repository: [hadoan/PatchCTL](https://github.com/hadoan/PatchCTL).
Board: [Project 7](https://github.com/users/hadoan/projects/7).
Use this reference when GitHub inspection or mutation is part of the task, not as an automatic
requirement for local work. Follow the [handbook](../ENGINEERING-HANDBOOK.md) for status meanings.

## Inspect before changing

Run from the repository root. These commands are read-only:

```powershell
git status --short
git branch --show-current
git remote -v
gh auth status
gh issue list --repo hadoan/PatchCTL --state open
gh project field-list 7 --owner hadoan --format json
gh project item-list 7 --owner hadoan --limit 100 --format json
gh project view 7 --owner hadoan --format json
```

For larger boards, retrieve all relevant items rather than assuming the first 100 are complete.
Verify the issue's repository and URL, its project item, and the actual Status field/options.
Project item IDs, issue numbers, and PR numbers are different identifiers. Do not hardcode IDs
from a prior session or another project. Never print a token to diagnose access.

## Authorized updates

When ticket tracking is requested, move the selected item to In progress, then In review or Done
under the agreed workflow. Use `gh project item-edit` with the discovered project ID, item ID,
Status field ID, and selected option ID. Verify the resulting item after the update.

Comment on the actual issue with a concise change summary, commit, verification, remaining
blocker, and delivery state. Prefer `gh issue comment --repo hadoan/PatchCTL <issue> --body-file
<reviewed-file>` for multiline text; prepare the file safely without shell interpolation. Do not
paste a whole task log, secrets, or claim remote CI/human review that did not occur. Creating an
issue, closing it, editing the project README, and moving an item are separate operations.

If access fails, log the operation and sanitized error locally. Explain the specific missing
capability (Projects access is distinct from issue access); never assume an old missing-scope
report still applies. Continue independent implementation if requested. Do not loop interactive
authentication or repeatedly retry without a state change. Credential changes require the user
when the current environment cannot perform the authorized operation.

PRs are optional for the maintainer's main-branch workflow. Before any authorized push or PR,
verify remote, branch, intended commits, and existing PRs; do not force-push or duplicate a PR.
Use the [PR skill](../../.agents/skills/prepare-pull-request/SKILL.md) when appropriate. A local
commit, a board update, and a successful CI run must each be reported on their own evidence.
