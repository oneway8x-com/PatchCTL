import type { TodoRepository } from "../todo.repository";
import { TodoNotFoundError } from "../todo.errors";
import type { Todo } from "../todo.types";

export async function reopenTodo(
  todoId: string,
  context: { tenantId: string },
  repository: TodoRepository
): Promise<Todo> {
  const todo = await repository.findById({ tenantId: context.tenantId, id: todoId });
  if (!todo) {
    throw new TodoNotFoundError(todoId);
  }

  todo.status = "open";
  todo.updatedAt = new Date();
  
  await repository.save(todo);
  return todo;
}
