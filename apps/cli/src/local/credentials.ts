import { LocalError } from "./errors.js";

export interface CredentialStore {
  set(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
}

// Lazy loading lets headless Linux use the explicit environment fallback even
// when a native binding or Secret Service is unavailable. Never echo OS errors.
export class NativeCredentialStore implements CredentialStore {
  private async entry(key: string) {
    const { Entry } = await import("@napi-rs/keyring");
    // Do not use withTarget: keyring-node 2.0's Windows factory writes an
    // empty placeholder on construction, overwriting an existing credential.
    return new Entry("patchctl", key);
  }
  async set(key: string, value: string): Promise<void> {
    if (!value)
      throw new LocalError("INVALID_VALUE", "Credentials must not be empty.");
    try {
      (await this.entry(key)).setPassword(value);
      if ((await this.entry(key)).getPassword() !== value) throw new Error();
    } catch {
      throw new LocalError(
        "KEYRING_UNAVAILABLE",
        "Cannot store the credential in the OS keyring. No plaintext fallback was written.",
      );
    }
  }
  async get(key: string): Promise<string | null> {
    try {
      return (await this.entry(key)).getPassword() || null;
    } catch {
      throw new LocalError(
        "KEYRING_UNAVAILABLE",
        "Cannot read the OS keyring.",
      );
    }
  }
  async delete(key: string): Promise<void> {
    try {
      (await this.entry(key)).deletePassword();
    } catch {
      throw new LocalError(
        "KEYRING_UNAVAILABLE",
        "Cannot delete the credential from the OS keyring.",
      );
    }
  }
}

export async function databaseCredential(
  tenantId: string,
  store: CredentialStore,
  env: NodeJS.ProcessEnv,
): Promise<{ secret: string; warnings: string[] }> {
  if (env.PATCHCTL_DATABASE_URL) {
    return {
      secret: env.PATCHCTL_DATABASE_URL,
      warnings: [
        "Using PATCHCTL_DATABASE_URL from this process environment; it is not persisted. Prefer the OS keyring.",
      ],
    };
  }
  const secret = await store.get(`${tenantId}/database`);
  if (!secret)
    throw new LocalError(
      "CREDENTIAL_NOT_FOUND",
      "Run patchctl connect, or explicitly provide PATCHCTL_DATABASE_URL.",
    );
  return { secret, warnings: [] };
}
