CREATE TABLE "LocalContentPatch" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "connectionId" TEXT NOT NULL,
  "revision" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
  "document" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "LocalContentPatch_tenantId_status_connectionId_createdAt_idx"
ON "LocalContentPatch"("tenantId", "status", "connectionId", "createdAt");
