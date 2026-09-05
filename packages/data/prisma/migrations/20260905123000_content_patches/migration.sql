CREATE TABLE "ContentPatch" (
  "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE RESTRICT,
  "sourceId" TEXT NOT NULL, "revision" TEXT NOT NULL, "state" TEXT NOT NULL DEFAULT 'pending',
  "creatorId" TEXT NOT NULL, "payloadJson" JSONB NOT NULL,
  "reviewerId" TEXT, "reviewedAt" TIMESTAMPTZ(6), "rejectionReason" TEXT,
  "appliedAt" TIMESTAMPTZ(6), "failureCode" TEXT, "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContentPatch_state_check" CHECK ("state" IN ('pending','approved','rejected','applying','applied','conflict','failed'))
);
CREATE INDEX "ContentPatch_tenantId_state_createdAt_idx" ON "ContentPatch"("tenantId", "state", "createdAt");
CREATE INDEX "ContentPatch_tenantId_sourceId_idx" ON "ContentPatch"("tenantId", "sourceId");
