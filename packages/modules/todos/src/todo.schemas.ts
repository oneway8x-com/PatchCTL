import { z } from "zod";

export const CreateTodoSchema = z.object({
  title: z.string().min(1, "Title is required").max(255),
  description: z.string().nullable().optional(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  dueDate: z.coerce.date().nullable().optional(),
});

export type CreateTodoInput = z.infer<typeof CreateTodoSchema>;

export const UpdateTodoSchema = z.object({
  todoId: z.string().uuid(),
  title: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  dueDate: z.coerce.date().nullable().optional(),
});

export type UpdateTodoInput = z.infer<typeof UpdateTodoSchema>;

export const CompleteTodoSchema = z.object({
  todoId: z.string().uuid(),
});

export type CompleteTodoInput = z.infer<typeof CompleteTodoSchema>;

export const DeleteTodoSchema = z.object({
  todoId: z.string().uuid(),
});

export type DeleteTodoInput = z.infer<typeof DeleteTodoSchema>;

export const ReopenTodoSchema = z.object({
  todoId: z.string().uuid(),
});

export type ReopenTodoInput = z.infer<typeof ReopenTodoSchema>;
