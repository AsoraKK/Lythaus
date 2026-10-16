# Feed viewer session isolation

Draft review: https://github.com/AsoraKK/Lythaus/pull/1025

The feed cache previously belonged only to a `FeedModel`. Its controller read
the current JWT for each request and accepted every completion, including a
response started by an earlier signed-in account. Changing accounts therefore
retained A's cached cards and cursor, and a late A response could replace B's
feed. The synthetic pre-fix reproduction failed both expected-isolation
assertions. This matters even for Discover: the native read handler applies
viewer-specific block and mute filters, and authenticated responses are
`private, no-store` (`apps/lythaus-public-api/src/feed-runtime-policy.ts`).

Custom-feed names, subscription entitlements, selected-feed index and restore
snapshots also outlived the viewer. `AsyncValue` can retain previous data while
reloading; using it without checking loading could expose A's private feed
choices while B's requests were pending. An already open selector captured a
list of those names. Custom-list failures were previously reported as a
successful empty list.

## Repair

- `feed_read_session.dart` captures one authentication revision and token
  revision, with that session's credential future. The existing synchronous
  `AuthSessionRevision` catches A → logout → A transitions within one event
  turn. Account, credential and provider invalidation retire the old session.
- `feed_providers.dart` clears retired cards, cursors and restore state,
  cancels cancellable transport, and checks ownership after each await before
  dispatch or publication. News and custom transports also reject late results
  even when their underlying calls ignore cancellation. Discover reads require
  either a current member session or explicit guest mode, preventing a transient
  signed-out shell from dispatching a request during logout. Guest reads never
  use a retained member token. Loading, failed authentication and missing member
  credentials fail closed.
- Duplicate refresh and pagination requests coalesce. Refresh supersedes an
  old page. Overlapping post IDs are deduplicated; repeated or cyclic cursors
  become visible retryable errors. HTTP 401, 403 and 404 clear inaccessible
  cached cards and cursors. A same-session network failure remains an error.
- Private list and entitlement projections suppress previous data during
  reload. The navigator resets page/scroll ownership, clears and dismisses an
  open selector on session change, offers sign-in recovery for unverifiable
  credentials, and distinguishes private-list failure from an empty list.

Runtime edits are confined to the new feed session helper, the feed providers,
and the existing feed navigator. The earlier Discover presentation changes are
preserved. The browser test entry point passes the new session argument and
uses consistent synthetic authentication state and current-user projection.
PR #1023's authentication/root reload patch was inspected read-only; this PR
does not edit its root lifecycle, auth providers or session revision helper.
PR #1023 subsequently merged as `53ac0f4e`; combined integration validation
and independent security review remain required. Custom-feed creation writes and unrelated legacy feed
providers are not certified by this read-cache repair.

## Validation

Pinned Flutter 3.41.1 was used with synthetic identities and loopback fixtures.

- 324 Flutter/provider/widget/service regressions passed in one combined run.
  These include all `test/state/providers`, feed and navigator presentation,
  auth revision/gate, guest navigation/contracts, public author projection,
  and custom/social service tests.
- The dedicated isolation file passes 28 tests: A→B, logout, same-turn A→A,
  late credentials/success/failure, loading/auth errors, missing credentials,
  token rotation, explicit invalidation, News/custom late responses, private
  list/entitlement caches, duplicate/overlapping pagination, refresh races,
  access revocation and cursor loops. Three tests use the real mobile navigator.
  The final navigator guard also rejects an old scroll callback before the new
  frame, so it cannot repopulate B's cleared restore state. Its combined
  provider/navigator regression run passes 47 tests.
- Full `flutter analyze`, pinned formatting and `git diff --check` pass.
- Backend feed/content policy contracts pass 14 tests, preserving private cache
  policy, block/mute/visibility checks and publication gates.
- The content-journey Flutter web fixture builds successfully. Browser results
  and exact-head CI are recorded on the PR after the commit is pushed.

The dedicated file can produce four 390px mobile screenshots:

```sh
LYTHAUS_FEED_EVIDENCE=/tmp/feed-session-evidence flutter test --no-pub \
  test/state/providers/feed_session_isolation_test.dart
```

They show B loading with A removed; B after a rejected late A page; an
unverifiable session with sign-in recovery; and private-feed offline recovery.
All were inspected locally. The existing Discover renderer additionally
covers 320/390/1280px, light/dark and 100%/200% text. The original Library
screenshots `27467.jpg` and `27469.jpg` were materialized through the Library
helper, verified as readable JPEGs and inspected as image pixels. They are not
included in the synthetic evidence bundle.

No production database rows, publication holds, media gates, detectors,
credentials, provider resources, rewards or support workflows are changed.
Source tests do not establish operational detection or publishing acceptance.
No merge or deployment is authorized by this evidence.
