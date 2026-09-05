import type { TodoListQuery } from "@corely/contracts";
import type { Todo, TodoPriority, TodoStatus } from "./todo.types";

export type TodoPrismaClient = {
  todo: {
    findFirst(args: unknown): Promise<any>;
    upsert(args: unknown): Promise<any>;
    deleteMany(args: unknown): Promise<any>;
    findMany(args: unknown): Promise<any[]>;
    count(args: unknown): Promise<number>;
  };
};

export class TodoRepository {
  constructor(private readonly prisma: TodoPrismaClient) {}

  async findById(args: { tenantId: string; id: string }): Promise<Todo | null> {
    const row = await this.prisma.todo.findFirst({
      where: { id: args.id, tenantId: args.tenantId },
    });
    return row ? this.mapToEntity(row) : null;
  }

  async save(todo: Todo): Promise<void> {
    await this.prisma.todo.upsert({
      where: { id: todo.id },
      create: {
        id: todo.id,
        tenantId: todo.tenantId,
        
        title: todo.title,
        description: todo.description,
        status: todo.status,
        priority: todo.priority,
        dueDate: todo.dueDate,
        createdAt: todo.createdAt,
        updatedAt: todo.updatedAt,
      },
      update: {
        
        title: todo.title,
        description: todo.description,
        status: todo.status,
        priority: todo.priority,
        dueDate: todo.dueDate,
        updatedAt: todo.updatedAt,
      },
    });
  }

  async delete(args: { tenantId: string; id: string }): Promise<void> {
    await this.prisma.todo.deleteMany({
      where: { id: args.id, tenantId: args.tenantId },
    });
  }

  async list(args: { tenantId: string; query: TodoListQuery }): Promise<{ items: Todo[]; total: number }> {
    const { page = 1, pageSize = 50, q, status, priority } = args.query;
    const skip = (page - 1) * pageSize;

    const where: {
      tenantId: string;
      OR?: Array<{ title?: { contains: string; mode: "insensitive" }; description?: { contains: string; mode: "insensitive" } }>;
      status?: string;
      priority?: string;
    } = { tenantId: args.tenantId };

    if (q) {
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ];
    }
    if (status) {
      where.status = status;
    }
    if (priority) {
      where.priority = priority;
    }

    const [rows, total] = await Promise.all([
      this.prisma.todo.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.todo.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.mapToEntity(row)),
      total,
    };
  }

  private mapToEntity(row: any): Todo {
    return {
      id: row.id,
      tenantId: row.tenantId,
      
      title: row.title,
      description: row.description,
      status: row.status as TodoStatus,
      priority: row.priority as TodoPriority,
      dueDate: row.dueDate,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
