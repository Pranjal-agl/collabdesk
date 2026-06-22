# Architecture decisions

## Why H2 in PostgreSQL mode?
H2's `MODE=PostgreSQL` gives us UUID primary keys, `RANDOM_UUID()`, case-insensitive identifiers, and `ON CONFLICT DO NOTHING` — all compatible with a future PostgreSQL migration. The schema file runs unchanged on both engines.

## Optimistic locking flow

```
Angular client                       Spring Boot
─────────────────────────────────────────────────
issue = { id, ..., version: 3 }
[user edits title]
snapshot = [...issues]               PATCH /issues/{id}  { version: 3, title: "new" }
_issues.update(...)  ──────────────►
                                     Hibernate checks @Version == 3
                                     ✓ matches → save → version becomes 4
◄────────────────────────────────    200 { ..., version: 4 }
reconcile with server copy

── concurrent edit by another user ──────────────────────────────
                                     Another PATCH arrives with version: 3
                                     Hibernate checks @Version — already 4
                                     ✗ mismatch → OptimisticLockException
◄────────────────────────────────    409 Conflict
_issues.set(snapshot)  ← rollback
snackBar.open("Someone else edited this...")
```

## Row-level tenancy

Every JPA repository query is tenant-scoped by convention:
`findByIdAndTenantId(issueId, tenantId)` — a missing `tenantId` match returns empty,
surfaced as 404. Cross-tenant data is structurally unreachable, not just hidden in the UI.

## WebSocket reconnect strategy

Exponential backoff: `min(1000 * 2^attempt, 30000)` ms.
On reconnect, the client re-publishes presence events so other users see the correct
online roster. STOMP subscriptions are re-established in `onConnect`.

## Bundle budget enforcement

`angular.json` sets `maximumWarning: 500kb` / `maximumError: 1mb` for the initial bundle.
The CI `build` step (`ng build --configuration production`) fails the pipeline on breach,
so the budget is a hard gate, not an advisory.
