# PatchCTL release boundaries

Supported v0.1: existing Postgres records; text corrections, bulk changes, missing-text fills, locale-to-locale translation proposals, enum assignment and existing many-to-one relation assignment. All changes require an immutable proposal and an authorized human decision before transactional application. Agent keys only read/propose; there is no agent SQL, approval, apply, delete or schema-administration command.

Limits: 100 records per patch; 50 changed fields per record; 2 MB request bodies; 100,000 Unicode code points per configured text field; 100-record read/target pages. Larger jobs are separate, independently reviewed batches, not one atomic job. Text generation itself belongs to the coding agent; PatchCTL does not call a translation provider.

Sources must be explicitly configured by a Tenant administrator. Only plain tables with a single-column primary key are supported. Views, partitions, custom triggers, rewrite rules, RLS policies and editable fields that cascade updates into referencing records are rejected. These require a dedicated integration with explicit business semantics. PostgreSQL constraints still run: source administrators and database code are trusted; never connect an untrusted database as an execution sandbox. Publishing business logic is not inferred from enum names.

Use least-privilege server database credentials, keep source secrets out of agent environments, and protect the metadata/audit and target receipt tables from direct agent writes. The target receipt table must be installed by an operator; see `patchctl-apply.md`. A metadata failure after a target commit leaves an `applying` patch: retry the same approved ID to reconcile its receipt, not a newly prepared replacement. Do not rotate source configuration/credentials while resolving such a patch.

Whole-row versions include PostgreSQL transaction identity; any intervening record edit is conservatively conflicting, including changes to fields outside the patch. Relation targets are also versioned and locked. Long-lived proposals across database restore/migration are unsupported; re-read, re-prepare and review. Audit is durable application history, not a cryptographically tamper-proof log against a database administrator.

`pnpm typecheck`, `pnpm test` with isolated database environment, CLI checks, both PatchCTL Playwright configs, Prisma validation and `pnpm build` are the release checks. Do not run package builds concurrently with CLI/browser tests because build cleanup replaces package output. CI uses the same sequence and a disposable Postgres service. Remote CI execution occurs only after commits are pushed; local checks do not imply a remote CI result.

The repository currently lacks an ESLint 9 flat configuration; lint cannot start. GitHub Project updates also require the missing `project` OAuth scope. Neither limitation is silently reported as passed.
