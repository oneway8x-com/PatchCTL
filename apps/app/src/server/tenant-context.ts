import type { NextRequest } from "next/server";

const FALLBACK_TENANT_ID = process.env.CORELY_DEV_TENANT_ID || "dev-tenant";

export function getTenantContext(request: NextRequest) {
  return {
    tenantId: request.headers.get("x-tenant-id") || FALLBACK_TENANT_ID,
  };
}
