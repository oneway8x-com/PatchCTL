# Ticket sizing and scope

Optimize for a solo maintainer reviewing small, working increments from autonomous agents.
There are no required story points, planning meetings, assignees, or minimum ticket counts.
A direct request can be enough to start.

A useful implementation ticket states the outcome, affected flow, acceptance checks, dependencies,
and explicit exclusions. One coherent, testable outcome is a better boundary than a file count.
Prefer work that can be implemented and verified in a focused session; split when independent
outcomes or materially different risks make review difficult. Keep tightly coupled safety changes
atomic rather than creating artificial tickets that temporarily remove a protection.

For a batch:

1. Follow the agreed order and verify prerequisites in the actual repository.
2. Implement one ticket at a time, verify it, self-review, and commit a coherent increment.
3. Record the commit, check results, and requested board/issue update.
4. If blocked, log the cause, evidence, impact, and exact requirement to unblock. Continue only
   with an independent ticket when the user requested continued batch work.

Do not guess publishing semantics, remove Tenant checks, use production data, or replace human
content approval to finish a ticket. If a task keeps expanding across sessions, reassess its scope;
do not add adjacent cleanup, dependencies, frameworks, or future features to justify time spent.

Use [task records](../../tasks/README.md) when useful, and the
[handbook](../ENGINEERING-HANDBOOK.md) for status meanings and delivery rules. A blocker note
is not a successful implementation, and a local commit is not a release.
