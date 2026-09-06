# Enum and relation assignments

Declare a field as an editable/readable `enum` with an explicit `values` allowlist, for example `["HOME", "EARN_TOP"]`. The schema endpoint exposes that allowlist. Native PostgreSQL enum values are checked during schema registration and included in its drift fingerprint.

For existing many-to-one categories, declare `type: "relation"` and `relation: { namespace, table, key, label, tenantColumn }`. Registration requires a real, validated, single-column foreign key, a single-column target primary key, a text display label, and a Tenant column. Targets are always scoped by the authenticated Tenant, including dedicated source schemas. Nested creation and many-to-many rewrites are unsupported.

The hosted compatibility command `patchctl server targets SOURCE_ID category_id` discovers permitted IDs and labels, with `--after ID` pagination. The equivalent read-only endpoint is `GET /api/patchctl/sources/:id/relations/:field?limit=50&after=ID`. Only explicitly readable relation fields can expose targets. IDs are represented as strings, including numeric foreign keys.

Use the normal proposal contract with `changes: { placement: "EARN_TOP", category_id: "existing-id" }`. Explicit `null` is allowed only for nullable fields. Missing, foreign-Tenant or invalid targets are rejected without disclosing their labels. Bulk proposals retain the shared 100-record cap and require human review.

Preparation snapshots permitted old/new labels, stable IDs and target versions into the immutable patch. Review and audit preserve these labels. Apply checks the exact approved source record versions, then holds shared row locks on the proposed targets and verifies their whole-record versions and Tenant visibility. Target removal, reassignment or even a label edit blocks the entire patch with `RELATION_CONFLICT`; prepare and review a new patch. Database foreign keys remain enforced.
