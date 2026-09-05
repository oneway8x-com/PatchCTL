import type { TodoRepository } from "../todo.repository";
import { TodoNotFoundError } from "../todo.errors";

export async function deleteTodo(
  todoId: string,
  context: { tenantId: string },
  repository: TodoRepository
): Promise<void> {
  const todo = await repository.findById({ tenantId: context.tenantId, id: todoId });
  if (!todo) {
    throw new TodoNotFoundError(todoId);
  }

  await repository.delete({ tenantId: context.tenantId, id: todoId });
}
