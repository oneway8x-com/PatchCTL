import { type NextRequest } from "next/server";
import { UpdateTodoInputSchema } from "@corely/contracts";
import { createTodoRuntime } from "@/server/todos-runtime";
import { getTenantContext } from "@/server/tenant-context";
import { problemFromError } from "@/server/problem-details";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { tenantId } = getTenantContext(request);
    const { id } = await context.params;
    const runtime = createTodoRuntime();
    const response = await runtime.getTodo(id, { tenantId });

    return Response.json(response);
  } catch (error) {
    return problemFromError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { tenantId } = getTenantContext(request);
    const { id } = await context.params;
    const body = await request.json();
    const input = UpdateTodoInputSchema.parse(body);
    const runtime = createTodoRuntime();
    const response = await runtime.updateTodo({ todoId: id, ...body }, { tenantId });

    return Response.json(response);
  } catch (error) {
    return problemFromError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { tenantId } = getTenantContext(request);
    const { id } = await context.params;
    const runtime = createTodoRuntime();
    await runtime.deleteTodo(id, { tenantId });

    return Response.json({ success: true });
  } catch (error) {
    return problemFromError(error);
  }
}
