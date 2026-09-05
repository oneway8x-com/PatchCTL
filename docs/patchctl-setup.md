# PatchCTL setup

PatchCTL routes live under `/api/patchctl`. All routes require bearer credentials and verified Tenant membership; agent keys only read/propose on explicitly assigned sources. Existing Todo routes are a reference feature, not the content-write API.

Set `DATABASE_URL` for application metadata and `JWT_SECRET` to a random secret of at least 32 characters shared with the login service. Apply migrations with `pnpm --filter @corely/data exec prisma migrate deploy` only to your intended local/development metadata database. Legacy agent keys default to no PatchCTL access.

Set `PATCHCTL_SOURCE_SECRETS` server-side to a JSON object. Each entry contains an operator-selected reference, its owning Tenant, and the Postgres connection URL, for example:

```json
{"articles-dev":{"tenantId":"your-tenant-id","url":"postgresql://user:password@127.0.0.1:5434/content"}}
```

Use a human credential with `configure` permission to POST `/api/patchctl/sources` with `{"name":"Articles","secretRef":"articles-dev"}`. The service verifies connectivity before saving the reference. GET the same endpoint to list authorized source IDs. POST `/api/patchctl/sources/{id}/test` to retest. URLs, credentials, and secret references are never returned by these endpoints. Operators supply TLS options in the connection URL; certificate validation is not disabled by the adapter.

Use a dedicated database role with SELECT on declared content columns and UPDATE only on declared editable columns. Agents receive no database credentials. Additional target-side receipt permissions for approved application are documented with the apply feature. Do not give the content role schema-creation privileges.

Agent credentials have the form `pct_` followed by at least 32 random URL-safe characters. Store only SHA-256 in ApiKey.keyHash, set ownerUserId to an active Tenant member, scopes to read/propose, connectionIds to explicit source IDs, and an expiry. Revocation takes effect on the next authenticated request. Human OWNER/ADMIN roles can review/apply/configure; explicit patchctl permission DENY overrides apply even to those roles.
