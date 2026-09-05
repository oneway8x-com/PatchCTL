# Reviewed scheduling fields

This follow-up writes scheduling data only. The consuming application remains responsible for activation, expiry and any business side effects. PatchCTL adds no scheduler or automatic publishing engine.

Declare both endpoints as readable `type: "timestamp"` fields and add `schedules: [{ startsAt: "starts_at", endsAt: "ends_at" }]` to the content schema. At least the field being changed must be editable. Set `nullable: true` explicitly for an open start/end. The backing columns must be `timestamptz(0..3)`; `timestamptz(3)` is recommended. Unqualified timestamps, timestamp-without-timezone, and higher/default microsecond precision are rejected to avoid losing approved precision.

Submit ISO-8601 instants with `Z` or an explicit offset, seconds and at most three fractional digits. For example, a two-week promotion uses `starts_at: "2026-09-01T10:00:00+02:00"` and `ends_at: "2026-09-15T10:00:00+02:00"`. Preparation normalizes them to `2026-09-01T08:00:00.000Z` and `2026-09-15T08:00:00.000Z` before hashing and review. Review labels timestamps as UTC; audit retains those exact approved values.

Naive local times, invalid dates, infinity and sub-millisecond inputs are not accepted. Explicit offsets distinguish repeated daylight-saving wall times; a region name alone does not determine an instant. When both endpoints are present, start must be strictly earlier than end. A partial edit is checked against the unchanged endpoint too. The range is checked again with locked current values inside the apply transaction, and any intervening record edit blocks the patch.

Nullable endpoints mean no bound. Required endpoints cannot be cleared. These are data constraints, not a promise that the consuming application supports every possible scheduling combination; the source administrator must expose only fields whose application semantics are understood.
