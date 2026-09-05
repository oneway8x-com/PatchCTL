# Repository agent skills

The nine skills under [`.agents/skills/`](../../.agents/skills) support PatchCTL's
solo-maintainer, open-source workflow. They are versioned with the repository; do not install
them globally or copy machine-specific configuration just to use this project.

| Skill                                                                      | When to use                                                                  |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [implement-ticket](../../.agents/skills/implement-ticket/SKILL.md)         | Implement an issue, direct request, or ordered ticket batch                  |
| [bug-fix](../../.agents/skills/bug-fix/SKILL.md)                           | Reproduce/diagnose a bug; fix it only when requested                         |
| [code-review](../../.agents/skills/code-review/SKILL.md)                   | Review a diff or perform focused self-review                                 |
| [prepare-pull-request](../../.agents/skills/prepare-pull-request/SKILL.md) | Prepare a PR description or an authorized PR submission                      |
| [ui-change](../../.agents/skills/ui-change/SKILL.md)                       | Change Next.js UI and verify the rendered behavior                           |
| [create-e2e-test](../../.agents/skills/create-e2e-test/SKILL.md)           | Add or repair PatchCTL browser/full-stack tests                              |
| [release](../../.agents/skills/release/SKILL.md)                           | Assess release readiness or execute an explicitly scoped, documented release |
| [build-in-public](../../.agents/skills/build-in-public/SKILL.md)           | Draft one evidence-backed public update after meaningful verified work       |
| [marketing-publish](../../.agents/skills/marketing-publish/SKILL.md)       | Explicitly prepare or reconcile a controlled, human-approved publication     |

Read a selected `SKILL.md` completely, then only the references relevant to the task. The skills
must preserve [AGENTS.md](../../AGENTS.md), user scope, and the handbook. They do not require an
issue, PR, second reviewer, external message, or release for every change. Hosts that do not
automatically discover repository skills can use the linked files as explicit instructions.

Each skill folder must match its frontmatter `name` and contain a useful `description` with clear
triggers. Keep instructions compact; shared policies belong in the handbook. After updates,
validate YAML frontmatter, local links, examples against current code, and meaningful decision
cases (including diagnosis-only, main-branch work, and missing deployment infrastructure).
Use a skill validator if the agent environment provides one; do not commit its machine-specific path.

`.agents/skills` is canonical. Codex discovers it directly; `marketing-publish/agents/openai.yaml`
disables implicit Codex invocation. Claude Code compatibility uses relative per-skill links under
`.claude/skills` and a project `skillOverrides` entry that keeps publishing user-invocable-only.
Symlink checkout requires filesystem/Git symlink support (native on macOS/Linux; Windows may need
Developer Mode or an equivalent Git setting). Metadata and written instructions are not security
boundaries, and no skill grants blanket shell or network access. Host discovery must be checked
separately from syntax and link validation.

No automated AI PR-review service, `/codex review` bot, corporate Slack integration, model service,
or deployment/publishing workflow is installed by these documents. Build-in-public drafting is
optional after meaningful verified work; it is not required per commit and never publishes as a
side effect of engineering completion.
