# #22 — Shared PatchCTL API client

Ticket: https://github.com/hadoan/PatchCTL/issues/22

## Scope

- Portable compiled API-client package, typed PatchCTL subpath, public contracts.
- CLI and Next.js browser use the same methods; credentials are injected per request.
- Preserve server use cases, authorization, conflict-safe apply, receipts, and audit.
- No human auth redesign, additional SDK package, backend service, publishing, or push.
- Work on `main` and leave In review for the maintainer.

## Verification and delivery

- Portable client increment: contracts/API-client builds and patch-feature typecheck passed.
- API-client suite: 38 tests passed (22 existing, 16 new shared-client cases).
- Native Node package exports and real HTTP redirect/timeout checks: 2 tests passed.
- Root build/typecheck and CI now include the compiled API-client package.
- Consumer migration and full-stack verification remain in progress.

## Blockers

None currently.
