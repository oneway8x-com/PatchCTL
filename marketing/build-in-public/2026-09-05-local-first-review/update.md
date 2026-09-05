# Local-first source review — 2026-09-05

PatchCTL is exploring a local-first content-change workflow. At source revision `4fdbf2c`, the CLI can connect to a supplied PostgreSQL database, discover readable resources and schema, require explicit selected columns, and read selected supported values. This is resource/schema discovery after connection—not database host discovery.

The inspected source also supports local drafts, before/after diffs, point-in-time validation, scoped client-token pairing, frozen immutable proposal submission, and browser review by a human for the exact revision.

The important limit: local `sync`/execution is not implemented. Approval records a decision but does not apply content. The legacy server-connected apply path is separate and does not make local-sync claims valid. Database URL/password are not intentionally part of local proposal submission, but selected snapshots and schema metadata do leave the client for server-backed human review.

No product tests or remote CI were executed during this initial content draft. This is a source-status update, not a release, deployment, availability, or user-adoption announcement; the root and CLI packages are private.

Drafted with AI assistance and reviewed against repository source. A human must review the exact channel payload, destination, account/community, and hash before any publication.
