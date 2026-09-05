import { expect, type APIRequestContext } from "@playwright/test";
import { authHeaders, type SeededSession } from "./auth";

const API_URL = process.env.API_URL || "http://127.0.0.1:3000";

export interface SeededTodo {
  id: string;
  title: string;
  description?: string | null;
  status: "open" | "done";
  priority: "low" | "medium" | "high";
  dueDate?: string | null;
}

export async function createTodo(
  request: APIRequestContext,
  session: SeededSession,
  input?: Partial<{
    title: string;
    description: string;
    priority: "low" | "medium" | "high";
    dueDate: string;
  }>
): Promise<SeededTodo> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const response = await request.post(`${API_URL}/todos`, {
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(session),
    },
    data: {
      title: input?.title ?? `Seeded todo ${suffix}`,
      description: input?.description ?? "Seeded description",
      priority: input?.priority ?? "medium",
      dueDate: input?.dueDate,
    },
  });

  expect(response.status(), "todo seed should succeed").toBe(201);
  return (await response.json()) as SeededTodo;
}
