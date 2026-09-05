---
name: ui-change
description: Implement or revise PatchCTL Next.js screens and interactions using existing UI patterns, with rendered verification and relevant browser tests.
---

# Change the PatchCTL UI

Read [AGENTS.md](../../../AGENTS.md) and the
[verification guidance](../../../docs/ENGINEERING-HANDBOOK.md#verification).
Inspect the owning screen under `apps/app/src/modules`, its route, data contracts, server use
cases, and existing components/styles. Reuse established UI patterns; do not import another
product's brand, design tokens, framework, or authentication bypass.

Keep server-side authorization authoritative. Agents must not gain approval/apply by changing
client state. Review interactions must bind the exact patch revision and make affected records,
before/after values, and outcomes clear. Preserve pagination and null/empty distinctions; render
content as text, not executable markup. Never expose source credentials in UI errors or network data.

Cover the relevant loading, empty, error, unauthorized, pending, success, rejection, and conflict
states. Use accessible labels, keyboard interactions, focus behavior, and readable layouts for
the changed surface. Validate UTC scheduling presentation without adding publishing semantics.

Run type checks and relevant browser tests using the PatchCTL-specific config, then inspect the
actual rendered page at appropriate viewport sizes and capture evidence. Existing review tests
mock HTTP; use the real demo when the change claims end-to-end approval/apply behavior. Store local
evidence under ignored `apps/e2e/.patchctl-results` and inspect it for secrets before sharing.

Do not run builds concurrently with browser tests or silently reuse an unidentified local server.
If rendering cannot be verified, report the blocker rather than claim visual QA. Self-review and
commit the scoped change under the requested branch workflow; no automatic PR or deployment.
