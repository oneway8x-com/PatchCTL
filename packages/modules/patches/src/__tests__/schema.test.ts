import { describe, expect, it } from "vitest";
import {
  contentSchemaInput,
  fingerprint,
  quoteIdentifier,
} from "../content-schema";
export const articleSchema = {
  namespace: "public",
  table: "articles",
  key: "id",
  isolation: { mode: "row", tenantColumn: "tenant_id" },
  fields: {
    title: { type: "text", readable: true, editable: true },
    summary_en: {
      type: "text",
      readable: true,
      editable: true,
      nullable: true,
      locale: "en",
    },
    body: { type: "text", readable: true, editable: false },
  },
};
describe("declared content schema", () => {
  it("requires explicit Tenant isolation and safe identifiers", () => {
    expect(contentSchemaInput.parse(articleSchema).isolation.mode).toBe("row");
    expect(() =>
      contentSchemaInput.parse({ ...articleSchema, isolation: undefined }),
    ).toThrow();
    expect(() => quoteIdentifier("articles; DROP TABLE users")).toThrow();
    expect(() =>
      contentSchemaInput.parse({ ...articleSchema, arbitrarySQL: "select 1" }),
    ).toThrow();
  });
  it("protects keys, Tenant IDs, unreadable and unsupported fields", () => {
    for (const fields of [
      { id: { type: "text", readable: true, editable: true } },
      { tenant_id: { type: "text", readable: true, editable: true } },
      { title: { type: "text", readable: false, editable: true } },
      { status: { type: "enum", readable: true, editable: true } },
      { category: { type: "relation", readable: true, editable: true } },
      { price: { type: "money", readable: true, editable: true } },
    ])
      expect(() =>
        contentSchemaInput.parse({ ...articleSchema, fields }),
      ).toThrow();
  });
  it("fingerprints object content independently of property insertion order", () => {
    expect(fingerprint({ a: 1, b: 2 })).toBe(fingerprint({ b: 2, a: 1 }));
    expect(fingerprint({ a: 2 })).not.toBe(fingerprint({ a: 1 }));
  });
});
