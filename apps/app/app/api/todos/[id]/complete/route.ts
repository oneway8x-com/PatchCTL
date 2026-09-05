import { type NextRequest } from "next/server";
import { createTodoRuntime } from "@/server/todos-runtime";
import { getTenantContext } from "@/server/tenant-context";
import { problemFromError } from "@/server/problem-details";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { tenantId } = getTenantContext(request);
    const { id } = await context.params;
    const runtime = createTodoRuntime();
    const response = await runtime.completeTodo(id, { tenantId });

    return Response.json(response);
  } catch (error) {
    return problemFromError(error);
  }
}
