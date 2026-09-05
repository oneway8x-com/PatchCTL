import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  diffDraft,
  fingerprint,
  parseValue,
  readDraft,
  startDraft,
  updateDraft,
  withDraftLock,
} from "./dist/local/drafts.js";

const title = {
  name: "title",
  type: "text",
  pgType: "text",
  nullable: false,
  readonly: false,
};
const resource = {
  name: "public.articles",
  schemaName: "public",
  tableName: "articles",
  primaryKey: "id",
  fields: [title],
  constraints: [],
};
test("multiple updates retain original baselines and deterministic field diffs", () => {
  const draft = startDraft("demo");
  const snapshot = { record: { id: 1, title: "Before" }, hash: "a".repeat(64) };
  updateDraft(draft, resource, "1", snapshot, { title: "First" });
  updateDraft(draft, resource, "1", snapshot, { title: "Final" });
  updateDraft(
    draft,
    resource,
    "2",
    { record: { id: 2, title: "Second" }, hash: "b".repeat(64) },
    { title: "Other" },
  );
  assert.equal(draft.operations.length, 2);
  assert.deepEqual(diffDraft(draft)[0].changes, {
    title: { before: "Before", after: "Final" },
  });
  assert.throws(
    () =>
      updateDraft(
        draft,
        resource,
        "1",
        { ...snapshot, hash: "c".repeat(64) },
        { title: "Stale" },
      ),
    { code: "PATCH_CONFLICT" },
  );
  draft.status = "SUBMITTED";
  assert.throws(
    () => updateDraft(draft, resource, "1", snapshot, { title: "Late" }),
    { code: "PATCH_ALREADY_SUBMITTED" },
  );
  assert.equal(fingerprint({ a: 1, b: 2 }), fingerprint({ b: 2, a: 1 }));
});

test("typed values reject readonly fields, invalid enums, numeric overflow, null and invalid dates", () => {
  assert.throws(() => parseValue({ ...title, readonly: true }, "x"), {
    code: "FIELD_READONLY",
  });
  assert.throws(() => parseValue({ ...title, enumValues: ["DRAFT"] }, "LIVE"), {
    code: "INVALID_ENUM_VALUE",
  });
  assert.throws(() => parseValue(title, "null"), { code: "INVALID_VALUE" });
  assert.equal(parseValue({ ...title, nullable: true }, "null"), null);
  assert.equal(parseValue({ ...title, pgType: "bool" }, "false"), false);
  assert.throws(() => parseValue({ ...title, pgType: "bool" }, "yes"), {
    code: "INVALID_VALUE",
  });
  assert.throws(() => parseValue({ ...title, pgType: "int2" }, "32768"), {
    code: "INVALID_VALUE",
  });
  assert.equal(
    parseValue({ ...title, pgType: "int8" }, "9223372036854775807"),
    "9223372036854775807",
  );
  assert.throws(
    () => parseValue({ ...title, pgType: "int8" }, "9223372036854775808"),
    { code: "INVALID_VALUE" },
  );
  assert.throws(() => parseValue({ ...title, pgType: "float8" }, "Infinity"), {
    code: "INVALID_VALUE",
  });
  assert.throws(() => parseValue({ ...title, pgType: "date" }, "2026-02-30"), {
    code: "INVALID_VALUE",
  });
  assert.equal(
    parseValue({ ...title, pgType: "date" }, "2024-02-29"),
    "2024-02-29",
  );
  assert.throws(
    () =>
      parseValue({ ...title, pgType: "timestamptz" }, "2026-09-05T12:00:00"),
    { code: "INVALID_VALUE" },
  );
});

test("draft writes are serialized and reject cross-Tenant state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "patchctl-draft-test-"));
  try {
    await assert.rejects(readDraft(directory, "demo"), {
      code: "NO_ACTIVE_PATCH",
    });
    await withDraftLock(directory, "demo", async (save) => {
      await assert.rejects(
        withDraftLock(directory, "demo", async () => {}),
        { code: "PATCH_BUSY" },
      );
      await assert.rejects(save(startDraft("other")), {
        code: "INVALID_PATCH",
      });
      await save(startDraft("demo"));
    });
    assert.equal((await readDraft(directory, "demo")).tenantId, "demo");
    await withDraftLock(directory, "demo", async () => {});
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
