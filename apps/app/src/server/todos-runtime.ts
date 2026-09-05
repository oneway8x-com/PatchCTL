import {
  completeTodo,
  createTodo,
  deleteTodo,
  getTodo,
  listTodos,
  reopenTodo,
  updateTodo,
  TodoRepository,
  TodoPrismaClient,
} from "@corely/modules-todos";
import { getPrisma } from "./prisma";
import type { 
  CreateTodoInput, 
  UpdateTodoInput, 
  TodoListQuery 
} from "@corely/contracts";

export function createTodoRuntime() {
  const repository = new TodoRepository(getPrisma() as TodoPrismaClient);

  return {
    createTodo: (input: CreateTodoInput, context: { tenantId: string }) => 
      createTodo({ ...input, dueDate: input.dueDate ? new Date(input.dueDate) : undefined }, context, repository),
    listTodos: (query: TodoListQuery, context: { tenantId: string }) => listTodos(query, context, repository),
    getTodo: (id: string, context: { tenantId: string }) => getTodo(id, context, repository),
    updateTodo: (input: UpdateTodoInput, context: { tenantId: string }) => 
      updateTodo({ ...input, dueDate: input.dueDate ? new Date(input.dueDate) : undefined }, context, repository),
    deleteTodo: (id: string, context: { tenantId: string }) => deleteTodo(id, context, repository),
    completeTodo: (id: string, context: { tenantId: string }) => completeTodo(id, context, repository),
    reopenTodo: (id: string, context: { tenantId: string }) => reopenTodo(id, context, repository),
  };
}
