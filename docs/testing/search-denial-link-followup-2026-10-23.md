# Search denial and comment-link follow-up

Base: reviewed draft #1088, `8ea0e5dfb79141505ccdfb0b146b3d04109b8338`.
This delta is separate from that review. It changes only `FeedSearchNotifier`
and its imports in `social_feed_providers.dart`, plus comment destination
resolution in `DeeplinkRouter`. No comment/reply controller, UI, producer, API
index, auth/settings implementation, policy, provider, or release gate changes.

## Reproductions and fixes

### Search pagination loses session-recovery semantics

With the real `SocialFeedService`, a synthetic Dio transport returns one search
result and a page-two cursor, then returns HTTP 401. The service correctly
converts this to `AuthRequiredException`, but `FeedSearchNotifier.loadMore`
only rethrows it. `FeedSearchScreen` therefore retains the result and shows
**Retry loading more**, instead of its existing sign-in recovery. HTTP 403/404
likewise leave the denied result set and continuation cursor available.

The regression file `test/features/feed/application/search_access_loss_test.dart`
reproduces all three controller cases and the actual 401 screen journey. Before
the patch: **4 passed, 4 failed**. After: **8 passed**. The synthetic adapter
exercises HTTP decoding and service exception mapping; no real network request
is made. Cached discovery posts are not claimed to be private, and this is not
proof of server authorization bypass.

The current request now empties cached posts/cursor before publishing an access
error, for `AuthRequiredException` or HTTP 401/403/404, then preserves the
existing thrown-error contract. The screen uses its existing error UI; 401
shows **Sign in**, while unavailable/forbidden states can retry from page one.
The empty intermediate value is needed because Riverpod retains prior values
when assigning an error. Offline/500 errors retain results and retry the same
cursor. Existing request generation/cancellation checks run before clearing;
delayed 401/403 after search refresh cannot clear its replacement results.

### Accepted comment link silently does nothing

`/comment/comment-id/post-id?postId=` passed `canNavigate`, because the path
contains a fallback post ID, but navigation selected the empty query value and
returned without opening anything. An empty `postId` also shadowed a nonempty
`post` query argument. Native-scheme links had the same issue.

Availability and navigation now use one resolver: the first nonempty `postId`,
`post`, then first fallback path segment. Nonempty query precedence is retained;
all-empty destinations remain unavailable. The new
`test/core/routing/deeplink_comment_fallback_test.dart` proves the destination,
comment ID, and Back navigation. Its original six cases: **2 passed, 4 failed**
before; all six pass after. A seventh passing control covers normalized dot
segments and external credentialed/ported hosts impersonating the first-party
host. Encoded-slash identifier policy, credentials on the actual first-party
host, and nondefault first-party ports are not changed or newly qualified.

## Requested denial-race controls

Four tests added to `owner_posts_access_loss_test.dart` deliver delayed 401/403
after either refresh or owner A → signed-out → owner A re-entry. The fake owner
service deliberately ignores cancellation. The current session's items/cursor
remain intact with no error. These pass against the reviewed #1088 production
fix; no further owner-post production change is required.

## Validation

Flutter 3.41.1 / Dart 3.11.0, Linux, synthetic services. **94 passed, zero
failed/skipped**:

```sh
flutter test --no-pub --reporter expanded \
  test/features/feed/application/search_access_loss_test.dart \
  test/core/routing/deeplink_comment_fallback_test.dart \
  test/core/routing/deeplink_invalid_input_test.dart \
  test/core/routing/deeplink_router_test.dart \
  test/features/profile/application/owner_posts_access_loss_test.dart \
  test/features/profile/application/owner_posts_test.dart \
  test/features/feed/application/social_feed_providers_test.dart \
  test/features/feed/application/social_feed_providers_coverage_test.dart \
  test/features/feed/application/social_feed_service_test.dart \
  test/screens/home_feed_search_journey_test.dart
```

Targeted analyzer and format checks on the two changed production files and
three affected test files pass; `git diff --check` passes. Raw local logs are in
`/workspace/lythaus-search-robustness-evidence/`: `prefix.log`, `link-prefix.log`,
`postfix.log`, `owner-late-denial.log`, and `regressions.log`. The delayed-search
fixture uses an explicit transport-start signal, not a timing assumption.

No new compiled-browser/device, production expiry, live notifications, real
account switching, full-app audit, or performance acceptance is claimed. The
full required workflow runs only for PRs targeting main: this stacked draft
requires parent review, integration/retargeting and exact-head CI before merge.

## Evidence delivery blocker

The required current Library prepared-upload helper failed at its initial
hosted-app tool discovery with HTTP 401. No preparation, transfer or finalization
occurred, and no Library file IDs were returned. The action was stopped without
retry or switching upload routes. The #1088 synthetic widget screenshots and
evidence bundle remain local; they are not represented as Android-accessible
Library deliverables. Restore the supported Library flow before retrying that
batch. This is an authentication/tooling blocker, not an automatic approval
review rejection.
