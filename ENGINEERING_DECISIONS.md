# Engineering Decisions

## 1. Relational model with explicit team membership
Users can belong to multiple teams through `team_members`. A work item is attached to one team and may be assigned to a user. This supports team-level visibility and avoids duplicating user/team data. Foreign keys protect referential integrity.

**Trade-off:** A work item has one primary team in this first version. Cross-team work can be added through a many-to-many `work_item_teams` table if the product needs it.

## 2. Server-side authorization
The API authenticates requests with a signed JWT, then checks role and resource/team membership on protected routes. The frontend hides unavailable actions for usability, but this is never treated as a security boundary.

**Trade-off:** The simple roles are `ADMIN`, `MANAGER`, and `MEMBER`. A larger organization may need granular permissions and team-scoped role assignments.

## 3. Optimistic concurrency with version numbers
Every work item has a monotonically increasing `version`. The client submits the version it last read. An update succeeds only if the database row still has that version. Otherwise the API returns `409 Conflict`, and the client must refresh before retrying.

**Trade-off:** This avoids long-held locks and is suitable for short edits. It requires clients to handle conflicts rather than silently overwriting work.

## 4. Idempotency for create requests
The client can supply an `Idempotency-Key`. The backend stores the key and serialized response in the same transaction as work-item creation. A retry with the same key returns the original response.

**Trade-off:** Keys are scoped to a user and retained in the database. A production system should define a retention policy and reject reuse of a key with a different request payload.

## 5. Append-only activity history
Status, priority, title, assignment, and comment actions write activity records. Activity history is not edited through the API, which gives users a useful explanation of how an item changed.

**Trade-off:** The first version records readable summaries rather than a fully normalized event-sourcing model. Activity logs are for auditability, not the source of truth.

## 6. Explicit approval workflow and atomic claim
The workflow includes `AWAITING_APPROVAL`, and only `LEAD` or `ADMIN` may transition an item from approval to resolved. The claim endpoint checks both an unassigned item and the version the client last saw, then performs the assignment in a transaction and records an activity event.

**Trade-off:** This makes the critical operation deliberate, but roles are currently global rather than scoped per team. A future version should store each user's role in the team-membership relationship.

## 7. Synchronous primary writes; secondary work deferred
The primary work-item mutation and its activity record are committed in a database transaction. Notifications are omitted rather than pretending to deliver them reliably. If notifications are added later, use a transactional outbox and retryable worker.

## 8. Bounded queries
The list endpoint uses server-side pagination and filtering, with indexes for common filters. It never loads the full table into the browser.

## Testing strategy
Automated unit tests cover invalid workflow transitions, role/team authorization, and stale-version handling. Integration tests against a disposable MySQL database should be added before production release to verify transaction and idempotency behaviour end to end.
