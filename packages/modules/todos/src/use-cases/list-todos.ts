import type { TodoListQuery } from "@corely/contracts";
import type { TodoRepository } from "../todo.repository";
import type { Todo } from "../todo.types";

export async function listTodos(
  query: TodoListQuery,
  context: { tenantId: string },
  repository: TodoRepository
): Promise<{ items: Todo[]; total: number }> {
  return repository.list({ tenantId: context.tenantId, query });
}
