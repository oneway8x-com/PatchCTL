import { randomUUID } from "crypto";
import type { CreateTodoInput } from "../todo.schemas";
import type { TodoRepository } from "../todo.repository";
import type { Todo } from "../todo.types";

export async function createTodo(
  input: CreateTodoInput,
  context: { tenantId: string },
  repository: TodoRepository
): Promise<Todo> {
  const now = new Date();
  const todo: Todo = {
    id: randomUUID(),
    tenantId: context.tenantId,
    title: input.title,
    description: input.description ?? null,
    status: "open",
    priority: input.priority,
    dueDate: input.dueDate ?? null,
    createdAt: now,
    updatedAt: now,
  };

  await repository.save(todo);
  return todo;
}
