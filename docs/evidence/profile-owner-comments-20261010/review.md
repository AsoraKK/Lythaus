# Owner profile Comments implementation slice

Base: current main `dba135ca3720b1311c5ec3d1d9e00ab7a67a568d`, verified by fetch on 2026-10-10.
PRs #975–#978 are merged. #976's Settings-first toolbar, author links, URL tabs,
keyboard semantics, narrow layouts and reduced-motion behavior are retained.
No equivalent open owner Comments collection PR was found.
No repository `.agents/skills/SKILL.md` files exist in this checkout.

## Verified remaining gap

Main already implements GET `/api/users/me/posts`, its owner timeline service,
cursor controller and Posts UI. Those implementations are retained.
Comments has only GET `/api/comments/{id}/owner-view`; its profile tab displays
an unavailable placeholder. Other-member collections remain out of scope.

## Implementation and mapping

| Requirement | Code | Verification |
| --- | --- | --- |
| Private own-comment collection | `owner-content-reader.ts`: `ownerCommentsQuery` and existing reader handler; OpenAPI `usersMeCommentsList` / `OwnerCommentsPage` | Reader tests; local PostgreSQL runtime-role test; canonical schema test |
| JWT subject ownership / guest exclusion | Existing injected principal; SQL binds actor as `$1`, presenter verifies comment author | Guest/foreign-body unit cases; actual Worker tests awaiting route guard |
| Visibility, moderation and deletion | Existing `assertFeedItemEligibility`, parent visibility/follow/block/public-label rules; allowed or pending owned comments only; active comment/post authors | Candidate rejection cases; local SQL deletion/block tests; Worker follow-revocation test awaiting route guard |
| Cursor pagination | Existing bounded 8/default, 20/max parser; descending microsecond timestamp plus UUID tie-break; limit plus one | Unit cursor/validation cases; real PostgreSQL same-timestamp/concurrent reads |
| Account switch / late responses | `owner_comments.dart`: session revision keys, cancellation, author response validation and request revision fence | Controller tests cover account switch, late success/error, refresh overlap and disposal |
| Duplicate pages / retries | In-flight guard and deduplication; repeated cursor rejection in Comments and existing Posts timelines | Controller overlap, retry, foreign response and repeated-cursor tests |
| Truthful UI | `owner_comments_section.dart`; ProfileScreen owner wiring; Posts and Comments offline messaging | Loading, empty, error, offline, pending/reply, retry, large-text and guest/foreign widget tests |
| Preserved tab state | `profile_tab_view.dart` keeps each tab subtree alive; existing session-keyed screen reset retained | Tab round-trip test plus existing navigation/accessibility regression tests |
| Generated contract compatibility | Generated CommentsApi and OwnerCommentsPage; canonical isolated validator's new serialization fixture | Real pending/nullable round-trip and operation authorization/cursor tests |

Pending means **Awaiting review**. It does not authorize public publication.
The collection returns no parent post/comment bodies or private moderation signals.
No visitor policy, follower lists/counts, preference persistence, support/admin,
feature flags, migrations, provider resources, credentials or CI workflows change.

## Local evidence

Passed:

- `npm run typecheck:native`.
- `npm run openapi:lint` and `npm run openapi:bundle` (two existing lint warnings).
- 14 owner-content-reader unit cases, including Comments; 100% line and
  97.80% branch coverage for `owner-content-reader.ts`.
- Existing owner-post workerd test.
- `npm run openapi:test:dart`: four verifier tests plus 1,568 generated-package
  tests passed, including the two meaningful new owner Comments tests.
- Full critical production coverage gate: 44 modules, 13 required categories.
- `flutter test --no-pub test/features/profile test/ui/screens/profile/profile_screen_test.dart test/screens/profile_screen_test.dart --reporter expanded`: 159 passed.
- Final focused Posts/Comments controller rerun: 23 passed.
- Focused `flutter analyze --no-pub`: no issues; changed application/test Dart format check passes.
- Disposable local PostgreSQL 17 canonical migrations/grants verification on
  `lythaus_content_test_comments` and `lythaus_auth_test_comments`.
- Existing content journey PostgreSQL regression: four passed.
- Isolated Comments handler against actual PostgreSQL with `SET ROLE lythaus_runtime`:
  pagination, concurrent cursor reads, foreign/deleted/blocked/private exclusions,
  immediate deletion and block changes passed.

Current gate:

- Canonical contract tests: 69 passed, 17 staging cases skipped, one route-parity
  failure because the reserved dispatcher guard does not admit Comments.
- Two actual Worker-to-PostgreSQL Comments tests return 404 at that same guard.
  These are retained as integration checks and are not bypassed.
- Main's required-status-check configuration read returned
  `403 Resource not accessible by integration`. That operation stopped.

The first UI compile/fixture/format errors were corrected; their reruns pass.
The generated client validator includes meaningful new serialization and request
tests in addition to the generator's existing scaffold tests.

## Routing ownership handoff

The parent was asked to grant this lane ownership of the shared guard before
editing `apps/lythaus-public-api/src/index.ts`. Pending that answer, the file is
untouched. The exact required guard change is:

```diff
-      if (request.method === 'GET' && (ownerItem || url.pathname === '/api/users/me/posts')) {
+      if (request.method === 'GET' && (ownerItem || url.pathname === '/api/users/me/posts' || url.pathname === '/api/users/me/comments')) {
```

The canonical route-parity test then needs its public route-count assertion
updated from 127 to 128 and `GET /users/me/comments` added to required routes.
After serialized parent ownership, rerun contract parity and all three cases in
`apps/lythaus-public-api/tests/owner-comments.postgres.mjs`.
This draft is not end-to-end complete or merge-ready before that gate passes.

## Screenshots

All screenshots render synthetic fixtures with bundled fonts:

- [Approved comment and pending reply](screenshots/comments-owner.png)
- [Truthful empty list](screenshots/comments-empty.png)
- [Offline retry](screenshots/comments-offline.png)
- [Large text](screenshots/comments-large-text.png)

## Provider and owner gates / rollback

PlanetScale read-only metadata confirmed only production `main` exists.
The documented `development` schema lookup returned `Not Found`; that operation
stopped. No live user records were read or written. Database validation uses only the
disposable local PostgreSQL 17 container and synthetic fixtures.

No feature activation, live migration, paid resource, merge or deployment occurs.
Owner hands-on testing remains postponed to Sunday 2026-10-11.
Exact-head PR CI and parent-reviewed serialized integration remain required.
Rollback is a normal revert of this slice; no schema/data rollback is needed.
