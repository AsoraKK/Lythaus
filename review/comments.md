# Comments and nested replies review

## Scope and result

Reviewed the comments/replies implementation represented by `a10c381` and the test precision change in `d64d00b`, using `git show`/`git diff` only. Scope covered comment route navigation, parent/reply linkage, pagination and sort modes, unavailable relevance sorting, error and stale-response handling, edit/delete behavior, hidden/deleted ancestors, account changes, optimistic state, and reply counts. No provider state, real user data, database diagnostics, or migration `0021` was accessed.

## Integration boundary

The shared handler integration is intentionally staged for a separate coordinated patch, not a defect in this PR’s scoped implementation. `docs/testing/comment-propagation-2026-10-23.md` explicitly says the owned shared files are not edited and identifies the follow-up API, Jobs, Admin, and native notification changes. It also says the Flutter UI waits for conversation capabilities and does not pretend the current flat API supplies newest/relevance sorting or nested creation. Until that separately reviewable patch is applied, the checked-in API remains the legacy flat handler; production/live deployment status is unknown.

The seam test references added by the coordinator demonstrate mismatches between the legacy handler and proposed future contract. That is consistent with the documented staging boundary and must not be reported as a product bug. The Workerd fixture applies `integratePublicApiComments` and `integrateJobsCommentNotifications` in memory before building the worker; its runtime test validates the proposed transformed handler against the disposable synthetic database, not the unmodified shared worker files. The pure hook suite typechecks the transformed native program without modifying those owned files. Keep that scope distinction in end-to-end or deployment claims.

## Evidence and limits

- `a10c381` adds `comment-thread-reader.ts`, the threaded UI, notification deep links, and focused API/UI tests. The reader validates cursor scope and sort, pins cursor pages to a snapshot, scopes reply pages to a conversation, and reports `mostRelevantAvailable: false` with an explicit unavailable reason when used through the documented staged hook.
- `d64d00b` changes the homepage protection mutation test to target `getComments`; this is test coverage precision, not a runtime behavior change.
- Relevant committed UI scenarios include stale pagination after refresh, stale pagination after deletion, account-scoped deferred refresh, reply context for an unloaded parent, exact notification targets beyond the first page, repeated cached navigation, denied target responses, and withdrawn-parent access. Those widget tests use an adapter for the future API contract; the Workerd test separately executes the proposed transformed handlers.
- Production deployment state and live behavior remain unknown.

## Validation

See [follow-up execution evidence](followup-comments.md) for exact commands, results, raw logs, and local-only fixture scope. No provider database or user data was used. Production/live status remains unknown.

## Tickets

No defect ticket is recommended from this bounded review. The staged shared-handler patch and its deployment coordination remain a separate integration gate documented by the implementation owner.
