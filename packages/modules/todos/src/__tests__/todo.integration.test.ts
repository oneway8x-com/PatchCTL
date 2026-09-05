import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { PrismaService } from "@corely/data";
import { TodoRepository } from "../todo.repository";
import { createTodo } from "../use-cases/create-todo";
import { listTodos } from "../use-cases/list-todos";
import { completeTodo } from "../use-cases/complete-todo";
import { deleteTodo } from "../use-cases/delete-todo";

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/corely?schema=public";
const prisma = new PrismaService();
const repository = new TodoRepository(prisma as any);

describe("Todo Integration & Tenant Isolation", () => {
  const tenantA = "tenant-a-" + Date.now() + "-" + Math.random();
  const tenantB = "tenant-b-" + Date.now() + "-" + Math.random();
  let todoA1Id: string;

  beforeAll(async () => {
    await prisma.connect();
    await prisma.tenant.create({ data: { id: tenantA, name: "Tenant A", slug: tenantA } });
    await prisma.tenant.create({ data: { id: tenantB, name: "Tenant B", slug: tenantB } });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.todo.deleteMany({
      where: { tenantId: { in: [tenantA, tenantB] } },
    });
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantA, tenantB] } },
    });
    await prisma.disconnect();
  });

  it("creates a todo for tenant A", async () => {
    const todo = await createTodo(
      { title: "Buy milk", priority: "high" },
      { tenantId: tenantA },
      repository
    );
    expect(todo).toBeDefined();
    expect(todo.id).toBeDefined();
    expect(todo.title).toBe("Buy milk");
    expect(todo.priority).toBe("high");
    expect(todo.status).toBe("open");
    todoA1Id = todo.id;
  });

  it("lists todos for tenant A and does not show them to tenant B", async () => {
    // Create another for B
    await createTodo(
      { title: "Buy bread", priority: "medium" },
      { tenantId: tenantB },
      repository
    );

    const resultA = await listTodos({}, { tenantId: tenantA }, repository);
    expect(resultA.items.length).toBe(1);
    expect(resultA.items[0].title).toBe("Buy milk");

    const resultB = await listTodos({}, { tenantId: tenantB }, repository);
    expect(resultB.items.length).toBe(1);
    expect(resultB.items[0].title).toBe("Buy bread");
  });

  it("prevents tenant B from completing tenant A's todo", async () => {
    await expect(
      completeTodo(todoA1Id, { tenantId: tenantB }, repository)
    ).rejects.toThrow("could not be found");
  });

  it("allows tenant A to complete their own todo", async () => {
    const todo = await completeTodo(todoA1Id, { tenantId: tenantA }, repository);
    expect(todo.status).toBe("done");
  });

  it("prevents tenant B from deleting tenant A's todo", async () => {
    await expect(
      deleteTodo(todoA1Id, { tenantId: tenantB }, repository)
    ).rejects.toThrow("could not be found");
  });

  it("allows tenant A to delete their own todo", async () => {
    await deleteTodo(todoA1Id, { tenantId: tenantA }, repository);
    const resultA = await listTodos({}, { tenantId: tenantA }, repository);
    expect(resultA.items.length).toBe(0);
  });
});
