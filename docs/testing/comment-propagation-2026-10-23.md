# Comment conversations and propagation candidate

Base: `868be4ee163ba5f7968212230d731682ff005e45` (main verified read-only on
23 October 2026). This is a draft implementation for parent review. No provider
writes, deployment, production migration, posting or notification delivery was
performed. The token refresher, authentication/settings, detection, earning,
monthly policy, marketing and release gates are unchanged.

## Authority and design

The parent supplied the owner's 23 October 14:11 UTC “Yes, please action” approval
for Newest by default, a remembered sort, expandable chronological replies,
capped mobile indentation, exact reply-parent links and stable reading order.
This supersedes the initial restriction on changing comment sorting. It does
not approve an invented quality score or production activation.

The parent's research supports this as a reasonable hybrid, rather than a
universally preferred layout: [YouTube's comment guidance](https://support.google.com/youtube/answer/6000976?hl=en)
documents threaded replies and Top/Newest controls; [Discourse's nested-reply discussion](https://meta.discourse.org/t/introducing-nested-replies/402812)
describes depth/timeline tradeoffs; the [randomized social influence study author's account](https://seanjtaylor.com/2013/08/08/science-paper-on-social-influence-bias.html)
supports caution about raw popularity. These references were supplied by the
parent's research worker. Local task-based tests, not those references, verify
this implementation's behavior.

Newest and Oldest order top-level conversations by `(created_at, id)` descending
and ascending respectively. Replies always use that tuple ascending. The API
preserves all six fractional timestamp digits. A cursor binds post, sort, view,
conversation and snapshot; changing any scope requires a fresh cursor. New root
conversations do not enter an existing snapshot. Readers explicitly check for
new replies; no background resorting or live insertion is introduced. Sort is
remembered per account on the device through the existing storage abstraction.

Most relevant is disabled and the API rejects it explicitly. Available source
signals do not establish comment usefulness: `social.reactions` is post-level,
author reputation is not a comment-quality score, and moderation/authenticity
signals are publication controls. There is no validated comment helpfulness or
quality signal with an approved anti-manipulation definition. No text-length,
argument-volume, raw-like or reputation boost is substituted. A future formula
needs a trusted comment-level signal, eligibility, missing-signal behavior,
gaming limits and calibration tests before activation.

## Source trace and behavior

| Area | Existing contract and candidate behavior |
| --- | --- |
| Canonical object | `content.comments.post_id` references `content.posts.id`. `editorial.publications.post_id` points to that same object. Post-backed articles share its conversation; publications without a post do not acquire a fabricated comment store. |
| Creation | Existing authenticated, daily-limited, idempotent mutation and declaration pipeline remains. Human/AI-assisted disclosure is preserved; generated public content and AI-assisted text of 250 or more graphemes remain blocked. New comments remain under review. |
| Nesting | `parent_id` keeps the exact immediate parent, including replies to replies. Stored/rendered `depth` remains 0/1. New traversals allow at most 64 nodes including the root; writes reject targets that would exceed that bound. Cross-post parents, cycles, inconsistent depth, inactive authors and unavailable ancestors fail closed. No schema change is needed. |
| Display | Root conversations have expandable replies. Descendants have one 18-pixel indentation level and an accessible link to the exact parent. Missing loaded context is fetched by a scoped target read, not reconstructed from an author name or copied private quote. |
| Counts | A root's reply count is the number of visible, non-deleted descendants at its snapshot, including nested replies. Pending/blocked/muted/blocked-author and unavailable-ancestor rows are excluded. Counts come from canonical rows, not queue increments. Counts refresh with root reads; loading a reply page does not claim to update a whole-post total. The detail button no longer invents `Comments (0)` when the API supplies no post comment count. |
| Edits | The stored declaration is preserved by body-only edits; edits return to review. Old pending receipts no longer override fresh owner reads. A locally edited ancestor withholds its loaded descendants. |
| Deletion/hiding | Allowed deleted ancestors remain body-free tombstones, preserving the existing thread contract. A blocked/under-review/inactive/blocked-author ancestor withholds descendants. Parent-post privacy, follow, block, moderation, author status and deletion eligibility applies to public and private owner-comment reads. No cascading deletion or retention policy is introduced. |
| Cache | Comment responses, including guest reads, are private/no-store. Account changes clear comment/reply state and invalidate outstanding loads. HTTP 401/403/404 clears cached child content. Transient errors retain an honest retry state. There is no new live invalidation service. |
| Notifications | Jobs locks the comment revision, verifies the canonical outbox aggregate, current revision and latest resolved allow decision, derives recipient from current relationships, then retains existing preference-aware, conflict-safe insertion. Public projections recheck current revision/visibility with existing runtime permissions. List and both unread-count projections share the same visibility predicate. Canonical first-party deep links include the post and exact comment. |
| Historical events | An event without the exact revision/decision envelope is withheld from delivery/projection; stored rows are not deleted or backfilled. Community-appeal publication already carries these fields. The parent patch adds them to admin comment publication. Historical reconciliation requires separate parent review. |

## Shared integration boundary

The owned shared files are **not edited**. Apply the separately reviewable
[shared-hooks.patch](../evidence/comment-propagation-20261023/shared-hooks.patch)
only after coordinating the active workers:

- Public API `index.ts`: delegate comment reads to the reader; use the nested
  target validator; filter notification list and both unread-count sources;
  derive comment notification destinations from current canonical relationships.
- Jobs `index.ts`: lock the revision before recipient selection, then use the
  current publication/visibility query with the existing notification inserter.
- Admin API `index.ts`: include existing `source_event_id` and `decisionId` on
  comment publication events. Post event payloads are unchanged.
- Native notification model: accept the guarded comment-only destination through
  `commentNotificationLink`; other native notification navigation is unchanged.

The patch is generated from explicit source anchors with
`node scripts/comment-integration-patch.mjs`. `git apply --check` verifies its
base. The workerd fixture applies the same backend transformations **in memory**
and runs the real handlers with disposable PostgreSQL roles. A TypeScript
compiler-host test checks the complete integrated native program without writing
any shared source. The Flutter notification guard is tested independently;
parent must run the native notification journey after applying its small adapter.

The Flutter UI recognizes conversation capabilities returned by the new reader.
Until parent integrates that reader, the existing flat API remains in use and
the UI does not pretend it supplies Newest/relevance or nested creation.

The parent subsequently delegated the owner-comments analogue of the owner-post
retention finding in PR #1088. Two new 401/403 tests reproduced the private-card
and cursor retention before the fix. `OwnerCommentsController.loadMore` now
empties the cached timeline before publishing an authorization error (Riverpod
otherwise retains previous data on errors). A full retry starts without the old
cursor. Network errors retain the loaded data and retry cursor; a late denial
from account A cannot clear account B. The 25 controller/presentation regressions
pass. Only the owner-comments controller and tests are changed; #1088's
owner-post files are untouched.

## Validation and evidence

Disposable local PostgreSQL 17 is initialized from the approved migration
manifest and existing grants. No production database is accessed. Regression
coverage includes exact replay, concurrent create, delayed/replayed/failed
notification work, real blocking between a notification revision lock and an
edit, scoped cursor misuse, equal timestamps, snapshot refresh, 64-node limits,
cross-post/cyclic links, tombstones, declaration limits, foreign ownership,
post withdrawal and A → B → A visibility.

Run from the repository root:

```sh
node --experimental-strip-types --test apps/lythaus-public-api/tests/comment-integration-hooks.test.mjs
node --experimental-strip-types --test apps/lythaus-public-api/tests/comment-propagation.postgres.mjs
node --experimental-strip-types --test apps/lythaus-public-api/tests/comment-propagation.workerd.mjs
flutter test --no-pub test/features/feed/presentation/comment_thread_screen_test.dart test/features/feed/presentation/post_comment_journey_test.dart test/features/feed/domain/comment_notification_link_test.dart
flutter test --no-pub test/features/profile/application/owner_comments_test.dart test/features/profile/presentation/owner_comments_section_test.dart
npm run typecheck:native
npm run openapi:lint
npm run openapi:test:contract
npm run openapi:test:dart
```

The PostgreSQL suites require `PLANETSCALE_PG17_TEST_DATABASE_URL` pointing to an
owned loopback disposable `lythaus_auth_test*` database. Use a fresh database for
the workerd suite; it seeds synthetic publication cases and notification data.
The standard contract suite retains its existing skipped tests; no gate is
disabled. Generated-client analysis retains its existing warning allowance.

The isolated browser preview uses only synthetic in-memory responses. It has no
production API/notification transport. Browser tooling is not exposed in this
execution environment, so regular Playwright drives local Chromium:

```sh
flutter build web --no-pub --no-web-resources-cdn --target test/fixtures/comment_conversation_preview.dart --output .artifacts/comment-preview-web
python3 -m http.server 5188 --bind 127.0.0.1 --directory .artifacts/comment-preview-web
node --test apps/lythaus-public-api/tests/comment-conversation.browser.mjs
```

Screenshots are in [the evidence directory](../evidence/comment-propagation-20261023/screenshots).
They cover collapsed/expanded conversations, Oldest, 320-pixel large text and
desktop dark mode. Browser assertions cover exact context links, chronological
reply positions, real sort selection, disabled relevance, no horizontal overflow,
no page exceptions and no requests outside the local preview origin.

## Remaining acceptance

Parent must review/apply the shared hooks and rerun the complete integrated
release checks, native notification navigation, and actual device/screen-reader
journeys. Long exchanges require user task testing for context and return position;
the tests establish mechanics, not universal usability preference. Large-post
query plans/cost need operational acceptance before launch. Moderation-driven
visibility changes are enforced on server reads and refresh, not pushed instantly
to an already rendered screen. Complete authentication/detection/publication,
provider delivery and rollback acceptance remain launch gates. Public posting
stays withheld and the PR stays draft.
