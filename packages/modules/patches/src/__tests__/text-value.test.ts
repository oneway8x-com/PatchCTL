import { describe, expect, it } from "vitest";
import { validateTextValue } from "../text-value";
describe("content text values", () => {
  it("uses character length consistently for supplementary Unicode", () => {
    expect(() =>
      validateTextValue("🙂🙂", { nullable: false, maxLength: 2 }, "title"),
    ).not.toThrow();
    expect(() =>
      validateTextValue("🙂🙂🙂", { nullable: false, maxLength: 2 }, "title"),
    ).toThrow();
  });
  it("allows intentional blank/multiline content and declared nulls without trimming", () => {
    expect(() =>
      validateTextValue(" A\nB ", { nullable: false, maxLength: 6 }, "body"),
    ).not.toThrow();
    expect(() =>
      validateTextValue(null, { nullable: true, maxLength: 10 }, "summary"),
    ).not.toThrow();
  });
  it.each([null, 123, "bad\0text", "\ud800"])(
    "rejects text that violates the declared type or Postgres encoding",
    (value) => {
      expect(() =>
        validateTextValue(value, { nullable: false, maxLength: 100 }, "title"),
      ).toThrow();
    },
  );
});
