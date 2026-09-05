# Repository agent skills

The seven skills under [`.agents/skills/`](../../.agents/skills) adapt TruckerPoints procedures
for PatchCTL's solo-maintainer, open-source workflow. They are versioned with the repository;
do not install them globally or copy machine-specific configuration just to use this project.

| Skill                                                                      | When to use                                                                  |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [implement-ticket](../../.agents/skills/implement-ticket/SKILL.md)         | Implement an issue, direct request, or ordered ticket batch                  |
| [bug-fix](../../.agents/skills/bug-fix/SKILL.md)                           | Reproduce/diagnose a bug; fix it only when requested                         |
| [code-review](../../.agents/skills/code-review/SKILL.md)                   | Review a diff or perform focused self-review                                 |
| [prepare-pull-request](../../.agents/skills/prepare-pull-request/SKILL.md) | Prepare a PR description or an authorized PR submission                      |
| [ui-change](../../.agents/skills/ui-change/SKILL.md)                       | Change Next.js UI and verify the rendered behavior                           |
| [create-e2e-test](../../.agents/skills/create-e2e-test/SKILL.md)           | Add or repair PatchCTL browser/full-stack tests                              |
| [release](../../.agents/skills/release/SKILL.md)                           | Assess release readiness or execute an explicitly scoped, documented release |

Read a selected `SKILL.md` completely, then only the references relevant to the task. The skills
must preserve [AGENTS.md](../../AGENTS.md), user scope, and the handbook. They do not require an
issue, PR, second reviewer, external message, or release for every change. Hosts that do not
automatically discover repository skills can use the linked files as explicit instructions.

Each skill folder must match its frontmatter `name` and contain a useful `description` with clear
triggers. Keep instructions compact; shared policies belong in the handbook. After updates,
validate YAML frontmatter, local links, examples against current code, and meaningful decision
cases (including diagnosis-only, main-branch work, and missing deployment infrastructure).
Use a skill validator if the agent environment provides one; do not commit its machine-specific path.

No automated AI PR-review service, `/codex review` bot, corporate Slack integration, or deployment
workflow is installed by these documents. Source-specific infrastructure and driver-product rules
were intentionally excluded. Keep the original source repository untouched.
