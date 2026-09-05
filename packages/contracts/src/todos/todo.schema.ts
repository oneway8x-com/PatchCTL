import { z } from "zod";
import { ListQuerySchema, createListResponseSchema } from "../common/list.contract";

export const TodoStatusSchema = z.enum(["open", "done"]);
export type TodoStatus = z.infer<typeof TodoStatusSchema>;

export const TodoPrioritySchema = z.enum(["low", "medium", "high"]);
export type TodoPriority = z.infer<typeof TodoPrioritySchema>;

export const TodoDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  workspaceId: z.string().optional(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  status: TodoStatusSchema,
  priority: TodoPrioritySchema,
  dueDate: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TodoDto = z.infer<typeof TodoDtoSchema>;

export const CreateTodoInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  priority: TodoPrioritySchema.default("medium"),
  dueDate: z.string().optional(),
  idempotencyKey: z.string().optional(),
});
export type CreateTodoInput = z.infer<typeof CreateTodoInputSchema>;

export const UpdateTodoInputSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: TodoStatusSchema.optional(),
  priority: TodoPrioritySchema.optional(),
  dueDate: z.string().nullable().optional(),
});
export type UpdateTodoInput = z.infer<typeof UpdateTodoInputSchema>;

export const TodoListQuerySchema = ListQuerySchema.extend({
  status: TodoStatusSchema.optional(),
  priority: TodoPrioritySchema.optional(),
});
export type TodoListQuery = z.infer<typeof TodoListQuerySchema>;

export const TodoListResponseSchema = createListResponseSchema(TodoDtoSchema);
export type TodoListResponse = z.infer<typeof TodoListResponseSchema>;
