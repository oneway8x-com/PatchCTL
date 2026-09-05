import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";

declare global {
  var __corelyPrisma: PrismaClient | undefined;
  var __corelyPrismaPool: Pool | undefined;
}

export function getPrisma(): PrismaClient {
  if (!globalThis.__corelyPrisma) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL must be set before using the Next.js todos API");
    }

    const pool = new Pool({
      connectionString: url,
      connectionTimeoutMillis: Number(process.env.PRISMA_CONNECT_TIMEOUT_MS ?? "15000"),
    });

    attachDatabasePool(pool);

    globalThis.__corelyPrismaPool = pool;
    globalThis.__corelyPrisma = new PrismaClient({
      adapter: new PrismaPg(pool),
    });
  }

  return globalThis.__corelyPrisma;
}
