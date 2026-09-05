import type { TodoRepository } from "../todo.repository";
import { TodoNotFoundError } from "../todo.errors";
import type { Todo } from "../todo.types";

export async function getTodo(
  todoId: string,
  context: { tenantId: string },
  repository: TodoRepository
): Promise<Todo> {
  const todo = await repository.findById({ tenantId: context.tenantId, id: todoId });
  if (!todo) {
    throw new TodoNotFoundError(todoId);
  }
  return todo;
}
