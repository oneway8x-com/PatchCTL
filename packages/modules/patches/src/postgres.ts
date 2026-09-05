import { Pool } from "pg";
import type { ConnectionProbe, SourceSecrets } from "./source";
import { PatchError } from "./patch.errors";

export class EnvironmentSourceSecrets implements SourceSecrets {
  constructor(private readonly configuration: string) {}
  resolve(tenantId: string, reference: string): string {
    try {
      const secrets = JSON.parse(this.configuration);
      if (!Object.hasOwn(secrets, reference)) throw new Error();
      const entry = secrets[reference];
      const url = new URL(entry.url);
      if (
        entry.tenantId !== tenantId ||
        !["postgres:", "postgresql:"].includes(url.protocol)
      )
        throw new Error();
      return entry.url;
    } catch {
      throw new PatchError(
        503,
        "SOURCE_SECRET_UNAVAILABLE",
        "The source secret is unavailable for this Tenant.",
      );
    }
  }
}

export function sourcePool(url: string) {
  return new Pool({
    connectionString: url,
    max: 2,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 1000,
    statement_timeout: 10000,
    query_timeout: 12000,
    application_name: "patchctl",
  });
}
export class PostgresProbe implements ConnectionProbe {
  async test(url: string) {
    const pool = sourcePool(url);
    try {
      await pool.query("SELECT 1");
    } catch {
      throw new PatchError(
        503,
        "SOURCE_UNREACHABLE",
        "Could not connect to the content source.",
      );
    } finally {
      await pool.end();
    }
  }
}
