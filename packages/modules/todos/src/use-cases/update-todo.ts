import type { UpdateTodoInput } from "../todo.schemas";
import type { TodoRepository } from "../todo.repository";
import { TodoNotFoundError } from "../todo.errors";
import type { Todo } from "../todo.types";

export async function updateTodo(
  input: UpdateTodoInput,
  context: { tenantId: string },
  repository: TodoRepository
): Promise<Todo> {
  const todo = await repository.findById({ tenantId: context.tenantId, id: input.todoId });
  if (!todo) {
    throw new TodoNotFoundError(input.todoId);
  }

  if (input.title !== undefined) todo.title = input.title;
  if (input.description !== undefined) todo.description = input.description;
  if (input.priority !== undefined) todo.priority = input.priority;
  if (input.dueDate !== undefined) todo.dueDate = input.dueDate;
  
  todo.updatedAt = new Date();

  await repository.save(todo);
  return todo;
}
