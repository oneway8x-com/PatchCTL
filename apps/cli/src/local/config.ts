import { mkdir, readFile, rename, writeFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { homedir } from "node:os";
import { z } from "zod";
import { LocalError } from "./errors.js";

export const tenantIdSchema = z
  .string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/)
  .refine(
    (value) => !["__proto__", "constructor", "prototype"].includes(value),
  );
const selectionSchema = z
  .object({
    schemaName: z.string().min(1),
    tableName: z.string().min(1),
    columns: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type Selection = z.infer<typeof selectionSchema>;
export const configSchema = z
  .object({
    currentTenant: tenantIdSchema.optional(),
    tenants: z.record(
      tenantIdSchema,
      z
        .object({
          resources: z.array(selectionSchema),
        })
        .strict(),
    ),
  })
  .strict();
export type LocalConfig = z.infer<typeof configSchema>;

export function configDirectory(env: NodeJS.ProcessEnv): string {
  return env.PATCHCTL_HOME ?? join(homedir(), ".patchctl");
}
export async function readConfig(directory: string): Promise<LocalConfig> {
  try {
    return configSchema.parse(
      JSON.parse(await readFile(join(directory, "config.json"), "utf8")),
    );
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return { tenants: {} };
    throw new LocalError(
      "INVALID_CONFIG",
      "Local configuration is invalid or unreadable.",
    );
  }
}
export async function writeConfig(
  directory: string,
  config: LocalConfig,
): Promise<void> {
  // Strict schema rejects accidental secret properties before touching the disk.
  const parsed = configSchema.safeParse(config);
  if (!parsed.success)
    throw new LocalError(
      "INVALID_CONFIG",
      "Only non-secret configuration metadata is accepted.",
    );
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = join(directory, `config-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, JSON.stringify(parsed.data, null, 2) + "\n", {
      mode: 0o600,
      flag: "wx",
    });
    await rename(temporary, join(directory, "config.json"));
  } finally {
    await unlink(temporary).catch(() => {});
  }
}
