-- Run as the target database owner, once per content database.
-- The service content role needs SELECT/INSERT here, not UPDATE/DELETE or DDL.
CREATE TABLE IF NOT EXISTS public.patchctl_apply_receipts (
  tenant_id text NOT NULL,
  patch_id text NOT NULL,
  revision text NOT NULL,
  receipt jsonb NOT NULL,
  PRIMARY KEY (tenant_id, patch_id)
);
