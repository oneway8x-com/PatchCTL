# Propose a text correction

1. Authenticate and GET `/api/patchctl/sources/{sourceId}/schema`.
2. POST `/api/patchctl/sources/{sourceId}/records/query` with fields and filters to retrieve the record ID, version, and schemaVersion.
3. POST `/api/patchctl/patches` with the exact returned versions:

```json
{
  "sourceId": "SOURCE_UUID",
  "schemaVersion": "SCHEMA_VERSION_FROM_READ",
  "reason": "Correct a typo in the article title",
  "records": [
    {
      "id": "ARTICLE_ID",
      "version": "RECORD_VERSION_FROM_READ",
      "changes": { "title": "Corrected title" }
    }
  ]
}
```

The response identifies a pending patch and its reviewPath. Source content remains unchanged. The server captures before values, validates declared fields/types/lengths, and rejects stale snapshots. Text is preserved exactly, including Unicode and newlines; length limits count Unicode code points. Null is accepted only on declared nullable fields. No-op edits, NUL characters, malformed Unicode, protected fields, and new-record/deletion operations are rejected.

The human review, decision, and apply tickets complete the source-write portion of this flow. Agents never receive a direct mutation or approval override.
