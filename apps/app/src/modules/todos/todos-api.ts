import type {
  CreateTodoInput,
  TodoDto,
  TodoListQuery,
  TodoListResponse,
  UpdateTodoInput,
} from "@corely/contracts";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";

export async function fetchTodos(query: TodoListQuery): Promise<TodoListResponse> {
  const searchParams = new URLSearchParams();

  if (query.page) searchParams.set("page", query.page.toString());
  if (query.pageSize) searchParams.set("pageSize", query.pageSize.toString());
  if (query.q) searchParams.set("q", query.q);
  if (query.status) searchParams.set("status", query.status);
  if (query.priority) searchParams.set("priority", query.priority);

  const qs = searchParams.toString();
  return apiGet<TodoListResponse>(`/api/todos${qs ? `?${qs}` : ""}`);
}

export async function fetchTodo(id: string): Promise<TodoDto> {
  return apiGet<TodoDto>(`/api/todos/${id}`);
}

export async function createTodo(input: CreateTodoInput): Promise<TodoDto> {
  return apiPost<TodoDto>("/api/todos", input);
}

export async function updateTodo(id: string, input: UpdateTodoInput): Promise<TodoDto> {
  return apiPatch<TodoDto>(`/api/todos/${id}`, input);
}

export async function deleteTodo(id: string): Promise<void> {
  await apiDelete<{ success: true }>(`/api/todos/${id}`);
}

export async function completeTodo(id: string): Promise<TodoDto> {
  return apiPost<TodoDto>(`/api/todos/${id}/complete`, {});
}

export async function reopenTodo(id: string): Promise<TodoDto> {
  return apiPost<TodoDto>(`/api/todos/${id}/reopen`, {});
}
