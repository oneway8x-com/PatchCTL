import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";

/**
 * Singleton PrismaService managing the PrismaClient lifecycle.
 * This is the only place where PrismaClient should be instantiated.
 */
export class PrismaService extends PrismaClient {
  private readonly pool: Pool;
  private readonly skipConnect: boolean;
  private readonly connectTimeoutMs: number;

  constructor() {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL must be set before accessing Prisma client");
    }

    const timeoutRaw = Number(process.env.PRISMA_CONNECT_TIMEOUT_MS ?? "15000");
    const connectTimeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 15000;

    const maskedUrl = url.replace(/\/\/([^:]+):([^@]+)@/, "//$1:***@");
    console.log(
      `[PrismaService] constructor: url=${maskedUrl}, connectTimeoutMs=${connectTimeoutMs}, skipConnect=${process.env.SKIP_PRISMA_CONNECT === "true"}`
    );

    const pool = new Pool({
      connectionString: url,
      connectionTimeoutMillis: connectTimeoutMs,
    });
    // Let Vercel drain pooled connections before suspending the function instance.
    attachDatabasePool(pool);

    const adapter = new PrismaPg(pool);

    super({ adapter });

    this.pool = pool;
    this.skipConnect = process.env.SKIP_PRISMA_CONNECT === "true";
    this.connectTimeoutMs = connectTimeoutMs;
  }

  async connect() {
    console.log(`[PrismaService] connect called (skipConnect=${this.skipConnect})`);
    if (this.skipConnect) {
      console.log("[PrismaService] Skipping connection (SKIP_PRISMA_CONNECT=true)");
      return;
    }

    const t0 = Date.now();
    console.log(`[PrismaService] Connecting to database (timeout=${this.connectTimeoutMs}ms)...`);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.error(`[PrismaService] Connection TIMED OUT after ${this.connectTimeoutMs}ms`);
        reject(new Error(`Prisma connection timed out after ${this.connectTimeoutMs}ms`));
      }, this.connectTimeoutMs);

      this.$connect()
        .then(() => {
          clearTimeout(timeout);
          console.log(`[PrismaService] Database connected in ${Date.now() - t0}ms`);
          resolve();
        })
        .catch((error) => {
          clearTimeout(timeout);
          console.error(
            `[PrismaService] Connection FAILED after ${Date.now() - t0}ms: ${error instanceof Error ? error.message : error}`
          );
          reject(error);
        });
    });
  }

  async disconnect() {
    console.log("[PrismaService] Disconnecting...");
    if (!this.skipConnect) {
      await this.$disconnect();
    }
    await this.pool?.end();
    console.log("[PrismaService] Disconnected");
  }
}
