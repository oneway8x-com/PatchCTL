export type Source = {
  id: string;
  tenantId: string;
  name: string;
  secretRef: string;
  schema?: unknown;
};
export interface SourceRepository {
  find(tenantId: string, id: string): Promise<Source | null>;
  list(tenantId: string): Promise<Source[]>;
  save(source: Source, create: boolean): Promise<void>;
}
export interface SourceSecrets {
  resolve(tenantId: string, reference: string): string;
}
export interface ConnectionProbe {
  test(url: string): Promise<void>;
}
export function publicSource(source: Source) {
  return { id: source.id, name: source.name };
}
