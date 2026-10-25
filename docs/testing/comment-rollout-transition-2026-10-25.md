# Comment-notification rollout transition

The repository `origin/main` snapshot (`c0963c36693476ecc49ab1fcba0572454926b4d3`) and last-known-live code object (`3880a8be4c89459dd7ef831c9385817a887511ef`) both show the pre-integration behavior. Admin comment-publication events in `apps/lythaus-admin-api/src/index.ts` carried content and recipient identifiers but no `sourceEventId` or `decisionId`; `apps/lythaus-jobs/src/index.ts` created notifications from those fields without checking the comment's current revision or latest decision. The notification list and unread queries in `apps/lythaus-public-api/src/index.ts` filtered rows by recipient/dismissal and recipient/read/dismissal, respectively. These are Git code snapshots only; no live database was queried.

The reviewed projection requires current publication evidence before showing a comment notification. Jobs validates the canonical publication event, matching comment revision, resolved moderation case, and latest allow decision before inserting a notice. `packages/db/src/comment-notifications.ts` also requires the source event to match the comment and notification, its revision to match the current comment revision, and a non-null decision ID; it rechecks current post, ancestor, author, block, and mute visibility. The API uses this predicate for both the notification list and unread count.

On rollout, stored comment-notification rows without revision or decision evidence disappear from those API projections. Evidence-backed current publications remain visible. The transition case appended to `apps/lythaus-public-api/tests/comment-propagation.postgres.mjs` exercises the predicate as `lythaus_runtime` for list and unread queries, and confirms the legacy notification rows and outbox payloads remain unchanged. It performs no backfill or deletion. This is a read-projection change, not a database migration.

The last-known native client in `lib/features/notifications/domain/notification_models.dart` handles responses with `notificationType` in a dedicated `Notification.fromJson` branch that copies `entityId` but not `deeplink`; `lib/features/notifications/presentation/notifications_screen.dart` requires a non-null link before navigation. The old API supplied no comment destination, so historical rows were visible but not navigable to an exact comment. Updated clients consume the guarded comment link; older clients may still display evidence-backed new notices but cannot use their exact-comment destination.

An already-open `3880a8be` comment screen keeps retrying an old unscoped
`timestamp,id` cursor, which the new reader rejects. This is a pagination
interruption for that screen. Its post-detail route constructs a new
`CommentThreadScreen` on each open, and initial loading sends no cursor, so
leaving and reopening Comments provides a source-level recovery path even on
that old client. The new PG17 transition case proves that a request with no
view or cursor gets the default flat/oldest page and a new opaque cursor that
can be passed unchanged to retrieve the remaining rows. It also proves that
the old cursor remains rejected. This is protocol and Git-source evidence,
not a test on a deployed device.

The candidate adds a narrower in-screen recovery: only a 400
`invalid_pagination` response for the old two-field cursor offers an explicit
Retry from the first page. Existing rows remain in state while the retry
shows a loading indicator, then the fresh first page replaces the list;
current account, load and mutation fences still apply. A Flutter
journey verifies that Retry preserves a saved unsent draft, performs no
POST/PUT/DELETE request and discards a response arriving after an account
switch. A second case keeps a mismatched versioned cursor rejected. The
[rendered recovery state](../evidence/review-improvements-20261025/comments/comments-legacy-cursor-recovery.png)
shows the banner and saved draft. This does not promise persistence before an
asynchronous draft save completes.

Updating the client does not retrofit an already-loaded tab. Parent owns
normal client/API sequencing and any stale-screen recovery communication,
including the older client's lack of exact notification navigation. No new
owner approval or forced-reload requirement is introduced here.

No additional owner decision is needed to keep historical notices without verifiable provenance hidden; the approved propagation evidence already says events lacking the exact revision/decision envelope are withheld and not backfilled. Restoring historical notices would require separate approval and an authoritative provenance review, not inferred or fabricated evidence.
