# Task: implement the build-in-public marketing workflow

## Context and scope

- Issue: direct maintainer request (no issue).
- Branch/workflow: preserved `main`; local implementation and verification only. No commit, push,
  deployment, credential setup, purchase, platform setting, or live social action authorized.
- Outcome: canonical agent skills, public marketing policy/archive, strict offline tooling, guarded
  isolated X publisher, Reddit export, durable recovery journal, focused tests, and read-only CI.
- Out of scope: product architecture changes, social scheduling/listening, Reddit publishing,
  GitHub-hosted publishing, credential installation, and local-first PatchCTL `sync` implementation.

## Implementation notes

- Product code under `apps/*` and `packages/*` was not reorganized. Maintainer tooling is under
  `scripts/marketing/`; `.agents/skills` remains canonical; `marketing/` contains public-safe data.
- Manifest v1 separates source/test/commit/CI/release/deployment/adoption evidence, uses `draft` and
  `ready` editorial states, validates bounded non-symlink paths and immutable full Git commit IDs, and
  binds X approval to update ID, source revision, normalized text, channel, account, destination,
  and options with SHA-256.
- X uses reviewed `xurl` v1.3.1 through fixed non-shell argv and checks the selected OAuth2 token
  with `/2/users/me`. Live mode requires a policy confirmation no more than 30 days old both before
  review and under the journal lock immediately before send, exact hash,
  matching user identity, an interactive phrase, and an owner-only atomic journal. Ambiguous
  outcomes block reposting and require reconciliation against the attempt's exact fingerprint and
  source revision. Published journal state supports idempotent, conflict-safe receipt-only repair.
- Reddit is named-community, current-rules, manual export only. AI drafting and human review are
  disclosed. The initial draft describes source revision `4fdbf2c`, including that local execution
  is not implemented and approval does not apply content.
- `twitter-text` 3.1.0 is pinned for X weighted-character validation. No optional writing catalog
  was copied or installed.

## Verification

Passed locally on 2026-09-05:

- `pnpm install --frozen-lockfile` — lockfile is reproducible.
- `pnpm marketing:test` — 30/30 offline tests passed, including malformed/unsafe/oversized input,
  immutable Git commit/evidence resolution and mutable-ref refusal, Unicode/emoji/URL/NFC counting,
  account/hash/policy-freshness gates including post-confirmation recheck, update/revision fingerprint
  binding, noninteractive refusal, Reddit refusal, successful receipts, restart deduplication,
  malformed-journal blocking, concurrent attempts, malformed success-ID ambiguity, definitive and
  ambiguous failures including success-shaped nonzero xurl output, both journal/receipt persistence
  failures, content-bound reconciliation without reposting, canonical credential-free reconciliation
  URL refusal, idempotent atomic conflict-safe receipt repair, authenticated
  `/2/users/me` argv, redaction, compatibility links, commands, and local documentation links.
- `pnpm marketing validate marketing/build-in-public --json` — one draft bundle valid; X payload
  weighted length 263/280; fingerprint
  `cbca88f820b88b051d21ead329f70c6a70ce06de781f9aa605540bd8c2877e87`.
- X `preview --json` and `publish --dry-run --json` — passed offline; no network/journal write.
- Focused `prettier --check` — passed.
- `pnpm arch:check` — passed.
- Final complete tracked/untracked semantic review — `PASS`; no confirmed must-fix correctness or
  safety issue remained after the persistence-boundary regressions were added.
- `pnpm prisma:generate && pnpm build:packages && pnpm typecheck && pnpm build` — passed. The first
  typecheck attempt lacked built contract artifacts; the first package-build attempt lacked the
  generated Prisma client. Both prerequisites were then run explicitly; no database was changed.

Not run/verified:

- Claude `plugin validate .claude/skills` is not a bare-skill validator and failed because it
  expected a plugin manifest. Repository tests verify frontmatter, relative links, and invocation
  metadata, but actual Claude/Codex host discovery remains unverified (Codex is not installed).
- Remote CI, product test suites, social authentication, live platform calls, release, deployment,
  and adoption checks were not run.

## Blockers

- X live use requires a separately isolated publisher identity, pinned xurl installation, OAuth2
  user-context app/account, operator/profile labeling, current policy confirmation, billing credits
  if required, a hard spending limit with auto-recharge off, and maintainer review of an exact
  bundle changed to `ready` with blockers cleared.
- Reddit requires a named suitable community, recorded current-rules check, and manual maintainer
  posting. API publication remains deliberately unimplemented.

## Handoff

- Commits/delivery state: working tree only; no commit, push, publication, receipt, or deployment.
- Existing unrelated deletions of `clean-api.py`, `clean.py`, and `docker/postgres/init.sql` were
  preserved and not included in this work.
- Recovery: back up the external publisher state while stopped. Never clear pending/unknown state
  or retry a potentially successful POST; reconcile independently and preserve attempt history. A
  published attempt with a missing public receipt can use `reconcile --repair-receipt`, which does
  not call X and refuses content, revision, symlink, or receipt conflicts. Treat stale locks as
  fail-closed until a backup is preserved and the operator verifies no publisher process or
  ambiguous attempt remains.
