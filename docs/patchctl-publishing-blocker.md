# #20: publishing/status transitions blocked

Evidence: the existing feature implementation contains generic declared content fields, explicit review/apply use cases and Postgres persistence; it does not contain a target application's publishing use case, state-transition policy or side-effect API. The requirement says to confirm target semantics first and not bypass business validation through raw SQL. An enum's values do not establish those semantics.

Required input to unblock:

- The target application/table and status field, current states, permitted directed transitions and any prerequisites.
- Whether a transition is a data-only update or triggers indexing, notifications, cache invalidation, publication timestamps, billing or other domain effects.
- The authorized human roles and the application's existing validation/transition API, including idempotency and transaction boundaries.

When those are available, add an explicit status-field policy and transition-map validation at preparation and final apply. For side effects, use a domain-specific port into the target application's use case; do not introduce a generic workflow engine. Test forbidden transitions, concurrent state changes, denial/rejection and atomic failure before marking #20 complete.

For now, source administrators must leave publishing/status fields non-editable. Generic enum assignment is for known data-only placements/categories, not implicit permission to publish. Scheduling support only writes declared time bounds and does not activate content.

This blocker does not prevent the completed v0.1 text/bulk/translation/assignment/review demo. The ticket remains open and no publishing behavior is claimed.
