---
name: create-e2e-test
description: Add or repair PatchCTL Playwright review-UI tests or real CLI/browser/Postgres scenarios using the appropriate isolated test topology.
---

# Create an end-to-end test

Read [AGENTS.md](../../../AGENTS.md), the
[verification guidance](../../../docs/ENGINEERING-HANDBOOK.md#verification), and the selected
existing config/spec before editing. For real database scenarios, also read the complete
[English-summary demo setup](../../../docs/patchctl-demo.md).

## Choose the boundary being proved

- `apps/e2e/playwright.patchctl.config.ts` selects `review.spec.ts`, uses port 3107, and mocks HTTP
  authorization/data boundaries. Use it for rendering and interaction contracts, not proof of
  server authorization, atomic writes, or persistence.
- `apps/e2e/playwright.patchctl-demo.config.ts` selects `demo.spec.ts`, uses port 3108, and launches
  the seeded server with real CLI/browser/Postgres. Use it for cross-boundary product behavior.
- The generic Playwright config contains legacy assumptions; do not use it blindly. If adding
  a separate spec, deliberately update the appropriate `testMatch` so it is actually discovered.

Use a disposable loopback database and the existing synthetic fixtures. Integration fixtures
require a `_test` database; demo seeding accepts `_test` or `_demo`. Verify the target before
migrations or seeding. Never reuse production credentials/data or remove fixture safety guards.
The isolated demo seeds a human and scoped agent with short-lived signed credentials; this is
test setup, not permission to add a production demo-login endpoint or bypass real authorization.
Keep `.patchctl-demo` sessions private and out of Git/output.

## Assert observable behavior

The primary demo fills ten missing **English** summaries and leaves populated and other-Tenant
controls unchanged. For affected scenarios, prove the target is unchanged before human approval,
then verify reviewed values and provenance after apply. Include relevant rejection, stale revision,
concurrent/conflicting edit, atomic failure, or replay assertions at the real boundary being changed.
Do not replace the path under test with mocks merely to get a green test.

Prefer accessible role/label locators and retrying assertions over fixed sleeps. Seed deterministic
records rather than depend on existing rows. Capture relevant rendered evidence without secrets.
Run the exact selected config and browser-suite typecheck; disclose if only mocked UI checks ran.
Run builds and the two configs sequentially because they share generated outputs. Verify any
reused server identity; the full-stack config intentionally does not reuse a server.

Report the scenario, topology, actual results, and remaining gaps. Do not label a mocked browser
test full-stack evidence or claim CI ran remotely based on local execution.
