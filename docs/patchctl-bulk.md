# Bulk changes

Use the same proposal format as a text correction, with one entry per record. Read each page with the same fields/filters and preserve its version tokens. For a shared replacement, repeat the field/value in each record's changes object; for generated descriptions, supply the corresponding per-record value.

The server accepts 1–100 records and at most 2 MB of JSON. It validates every record before persisting the proposal, freezes explicit IDs, and returns the exact affectedRecords count. It never reruns the selection filter at apply time. New matching rows are not silently included. Duplicate record IDs, no-op changes, invalid fields and values reject the proposal. Value errors identify the record and field to correct.

The CLI can validate structure locally before submission. Review shows ten records per page and the total count throughout. All selected records still apply in a single transaction; one conflict or database failure rolls back the batch. Larger jobs must be deliberately partitioned into separately reviewed patches.
