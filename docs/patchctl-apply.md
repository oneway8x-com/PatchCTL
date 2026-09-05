# Approved apply and recovery

Run `scripts/patchctl-target-setup.sql` as the owner of each intended content database. Grant the content service role SELECT and INSERT on `public.patchctl_apply_receipts`, along with SELECT on the content table and UPDATE on allowed fields. Do not grant agents database access. Receipt installation is an operator setup step; application requests never create database objects.

A human submits the exact revision to POST `/api/patchctl/patches/{id}/decision` with `decision: approved` or `rejected`. Only approved revisions can be POSTed to `/api/patchctl/patches/{id}/apply` with `revision`. The review UI runs both steps when the human has review and apply permission.

Apply revalidates actor, Tenant, revision, source/schema configuration and editable values. A transaction-level lock serializes the stable Tenant/patch ID; the service then checks its receipt, holds content table/row locks, checks every original record version, updates only approved fields, verifies returned values, and commits the receipt with the content changes. A conflict or constraint failure rolls back the whole batch.

The receipt contains creator, reviewer, applying human, apply time and exact before/after values. It is authoritative even when metadata and content live in different databases. If metadata persistence or a response fails after commit, retry the same patch/revision. It stays `applying`; retry reads the receipt and reconciles metadata without rewriting content. Source configuration cannot change while one of its patches is applying. Restore connectivity/receipt permissions and recover pending applications before changing source credentials or configuration.

`conflict` or `failed` is terminal for that proposal; inspect the result and prepare a new patch requiring new human approval. Transient/unknown outcomes retain `applying` and expose a recovery action. Never resolve an unknown result by manually resetting the state or creating duplicate proposals.
