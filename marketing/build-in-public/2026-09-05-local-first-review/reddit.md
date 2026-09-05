# We reviewed PatchCTL's local-first source boundary (AI-assisted draft)

Affiliation: this is a PatchCTL project update. This draft was prepared with AI assistance and checked against repository source at revision `4fdbf2c`; a human will review it before any post.

The current source supports connecting the CLI to a supplied PostgreSQL database, discovering readable resources/schema, explicitly selecting columns, reading selected supported values, preparing local drafts, viewing before/after diffs, and running point-in-time validation. It also contains scoped client-token pairing, frozen immutable proposal submission, and browser approval by a human for the exact revision.

What it does **not** support yet is just as important: local `sync`/execution is not implemented, so approval does not apply content. The legacy server-connected apply flow is separate and cannot be used as evidence that local sync works. Database URL/password are not intentionally submitted, but selected snapshots and schema metadata do leave the client for server-backed review.

No product tests or remote CI were run while drafting this update. This is a source-status review, not a release, deployment, availability, or adoption announcement; the root and CLI packages are private.

Before posting, we still need to select a named community and check its current rules, flair, self-promotion, affiliation, and AI-disclosure requirements. Until then this is manual-export content only, not permission to publish.
