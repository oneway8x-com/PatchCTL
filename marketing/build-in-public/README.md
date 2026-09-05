# Build-in-public bundles

Each dated directory is a reviewable unit, not publication authority.

## Updates

- [2026-09-05: local-first source review](2026-09-05-local-first-review/update.md) — draft;
  X account and Reddit community remain unconfigured.

## Manifest v1

`manifest.json` contains:

- `version`: integer `1`.
- `updateId`: stable bundle identifier.
- `timestamp`: ISO-8601 timestamp.
- `editorialState`: `draft` or `ready`.
- `sourceRevision`: immutable full Git commit ID for the inspected source.
- `evidence`: entries with `id`, `kind` (`source`, `test`, `commit`, `remote-ci`, `release`, `deployment`, or `adoption`), `status` (`verified`, `passed`, `failed`, `not-run`, or `unknown`), `description`, and optional `path`, `revision`, `command`, `checkedAt`, or `url`.
- `claims`: public claim text plus the supporting `evidenceIds`.
- `channels`: `x` and `reddit` payload descriptors. Payload paths are relative to the bundle.
- `aiAssistance`: drafting/disclosure and review requirements.
- `blockers`: unresolved bundle-wide blockers.

Channel requirements:

- X: `path`, `intendedAccount`, `destination` (`timeline` for this MVP), `options`, and `blockers`.
- Reddit: `path`, `intendedCommunity`, `rulesCheckedAt`, and `blockers`.

A draft may contain payloads, but it cannot be published. `ready` means evidence, copy, destinations, and hashes have passed the available validation and exact human review; it does not waive channel policy or operator gates. The X approval fingerprint binds `updateId`, `sourceRevision`, normalized payload text, channel, intended account, destination, and supported options. Validation resolves the manifest revision and verified commit/source evidence as Git commits; verified source paths must reference the same resolved source commit. All supplied evidence revisions must be immutable full Git commit IDs rather than
branches, tags, or abbreviations.

## Files and receipts

- `update.md`: channel-neutral evidence narrative.
- `x.txt`: exact standalone text payload, within X's weighted limit.
- `reddit.md`: proposed title/body for manual export.
- `publications/`: optional public-safe receipts/addenda. Create it only when adding a real file; Git cannot track an empty directory.

Corrections never mutate old evidence or receipts silently. Add a new commit and receipt/addendum, and link any corrective public action. If authoritative state is already `published` after a receipt-write failure, `reconcile --repair-receipt` recreates only the exact matching receipt; it never posts and refuses conflicting or symbolic-link receipt files.
