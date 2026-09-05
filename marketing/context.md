# Marketing source context

Checked against clean `main` revision `4fdbf2c9816acd9ec782b6933c602f00372ee0b1` on 2026-09-05. This is source-inspection context, not a test-pass, release, deployment, or adoption claim.

## Supported present-tense source claims

- The local CLI connects directly to a supplied PostgreSQL database and discovers readable resources/schema; this is not host or network discovery.
- Configuration requires explicit selected columns. Reads return selected supported values.
- Local drafts retain before/after snapshots and support diffs and point-in-time validation, including whole-row conflict hashes.
- A human can create a client token scoped to proposing for one connection. The CLI revalidates and freezes an immutable proposal before submission.
- The browser review flow requires a human reviewer and an exact immutable revision for approval or rejection.

Primary evidence: [communication architecture](../docs/architecture/patchctl-communication.md), [PostgreSQL adapter](../packages/postgres/src/index.ts), [CLI drafts](../apps/cli/src/local/drafts.ts), [CLI update/validation](../apps/cli/src/local/patch-commands.ts), [CLI pairing/submission](../apps/cli/src/local/server-commands.ts), [browser review](../apps/app/src/modules/patches/screens/LocalPatchReview.tsx), and [local patch use cases](../packages/modules/patches/src/local-patches.ts).

## Required limitations

- Local `sync`/execution is **not implemented**. Browser approval does not apply content.
- Validation is point-in-time; it is not a transaction-held guarantee through a future apply.
- The normal proposal envelope does not intentionally include the database URL/password, but selected before/after snapshots and schema metadata leave the client and are stored for review.
- Legacy server-connected apply is a separate compatibility path. Its execution and receipt behavior cannot support local-sync claims.
- No product tests or remote CI were run while drafting the initial marketing content.
- The root and CLI packages are private. There is no evidence here of a package release, deployment, remote publication, schedule, or user adoption.
- Preserve AGPL-3.0-only package metadata and existing notices. Marketing work does not authorize relicensing.

Recheck current source and evidence before reusing these claims. Never turn a future architecture statement, help text, enum value, historical test, or legacy behavior into a current capability claim.
