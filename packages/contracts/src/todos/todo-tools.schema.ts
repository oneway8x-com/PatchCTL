import { z } from "zod";
import { TodoPrioritySchema, TodoStatusSchema } from "./todo.schema";

export const TodoSearchToolSchema = z.object({
  q: z.string().optional(),
  status: TodoStatusSchema.optional(),
  limit: z.number().int().min(1).max(50).default(10),
});

export const TodoCreateToolSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  priority: TodoPrioritySchema.optional(),
  dueDate: z.string().optional(),
});

export const TodoUpdateToolSchema = z.object({
  id: z.string().uuid(),
  title: z.string().optional(),
  description: z.string().optional(),
  priority: TodoPrioritySchema.optional(),
  dueDate: z.string().optional(),
});

export const TodoCompleteToolSchema = z.object({
  id: z.string().uuid(),
});

export const TodoReopenToolSchema = z.object({
  id: z.string().uuid(),
});

export const TodoDeleteToolSchema = z.object({
  id: z.string().uuid(),
});
