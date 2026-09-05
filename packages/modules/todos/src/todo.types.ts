export type TodoStatus = "open" | "done";
export type TodoPriority = "low" | "medium" | "high";

export interface Todo {
  id: string;
  tenantId: string;
  title: string;
  description: string | null;
  status: TodoStatus;
  priority: TodoPriority;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
