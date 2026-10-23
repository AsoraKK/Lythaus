# Focused robustness hunt — 23 October 2026

Baseline: main `868be4ee163ba5f7968212230d731682ff005e45`, confirmed with
`git ls-remote origin refs/heads/main`. This is a bounded local investigation,
not a whole-app audit or deployed acceptance. All data and responses below are
synthetic. No provider, production, credential, migration, activation, release
gate, authentication refresh, or other worker-owned production file changed.

## Reproduced defects

### Private owner-post cache survives an explicit access denial

- Source: `OwnerPostsController.loadMore` in
  `lib/features/profile/application/owner_posts.dart`; its data state is rendered
  by `_OwnerPostsSection` in `lib/ui/screens/profile/profile_screen.dart`.
- Reproduction: load an owner-only first page containing a private under-review
  post and a continuation cursor; return HTTP 401 or 403 from the second page
  without changing the local account. Tap **Load more posts**.
- Before: the private card remains visible and the UI offers **Retry loading
  posts**. The controller treats the explicit denial like a temporary network
  failure. The HTTP client does not automatically sign this account out.
- Impact: cached private text remains displayed after the server refuses the
  owner collection read. This does not demonstrate another account obtaining
  the content or a server authorization bypass.
- Fix: after the existing session/revision/cancellation guards, scrub the
  timeline and cursor for 401/403, then publish the error. Riverpod 2.6 retains
  previous values during error transitions, so setting `AsyncError` alone is
  insufficient. The empty timeline is intentional. The existing UI now shows
  **Posts could not be loaded** and **Retry posts**, which starts at page one.
- Regression: `test/features/profile/application/owner_posts_access_loss_test.dart`
  exercises the real controller and profile widget at 390×800 (401) and
  1024×800 (403), checks removal and first-page retry, and verifies HTTP 500 and
  offline errors still retain content and retry the same continuation cursor.

### Malformed deep links throw, and navigation skips availability validation

- Source: `DeeplinkRouter.canNavigate`, `navigate`, and `handleNotificationTap`
  in `lib/core/routing/deeplink_router.dart`.
- Reproduction: call availability/navigation with `/post/%FF`,
  `/post/id?commentId=%FF`, or `lythaus://post/%FF`. URI construction succeeds,
  but lazy path/query UTF-8 decoding throws `FormatException`.
- Current caller: `NotificationsScreen._handleTap` checks `canNavigate` before
  navigation. That exception escapes its `try/finally`, preventing the intended
  unavailable-destination feedback. This is a failed navigation, not evidence
  of an OS process crash.
- Separate entry-point inconsistency: direct `navigate` pushes a route for an
  external HTTPS host, HTTP link, protocol-relative external link,
  `/moderation/unsupported`, or `/invite`, even though `canNavigate` rejects it.
  A non-string `deeplink` payload also throws in `handleNotificationTap`.
  These direct-entry tests establish API robustness; they do not establish that
  every input is currently delivered by a live notification integration.
- Fix: availability and navigation share the same supported-link resolver,
  including the existing origin/scheme/destination rules, with malformed
  decoding rejected. Non-string notification payloads are ignored. Unsupported
  links are not logged verbatim. Valid existing destinations remain supported.
- Regression: `test/core/routing/deeplink_invalid_input_test.dart` checks all
  invalid cases, route push counts, payload type handling, and ten positive
  first-party formats. Existing deep-link navigation tests still pass.

## Executed evidence

Environment: Flutter 3.41.1 / Dart 3.11.0, Linux Flutter test engine, synthetic
services. Run from the repository with the existing workspace SDK on PATH and:

```sh
export XDG_CONFIG_HOME=/workspace/.lythaus-cache/config
export PUB_CACHE=/workspace/.lythaus-cache/pub
flutter test --no-pub --reporter expanded \
  test/core/routing/deeplink_invalid_input_test.dart \
  test/features/profile/application/owner_posts_access_loss_test.dart
```

The final tests were run unchanged with both production files restored to the
exact baseline, then with the patch restored. Baseline: **8 passed, 16 failed**;
fixed: all **24 cases pass** as part of the broader run below. Failures include
both visible private-card retention cases, both controller access-denial cases,
malformed decoding, rejected-link navigation, and non-string payload handling.
No fixture, timeout, assertion, or release gate was weakened to make these pass.

Broader command, **82 passed, zero failed/skipped**:

```sh
flutter test --no-pub --reporter expanded \
  test/core/routing/deeplink_invalid_input_test.dart \
  test/features/profile/application/owner_posts_access_loss_test.dart \
  test/core/routing/deeplink_router_test.dart \
  test/core/routing/app_router_test.dart \
  test/features/profile/application/owner_posts_test.dart \
  test/ui/screens/profile/profile_screen_test.dart \
  test/ui/screens/profile/profile_rapid_reentry_test.dart \
  test/features/profile/presentation/profile_post_author_backstack_test.dart \
  test/features/notifications/presentation/notifications_screen_test.dart
```

Targeted `flutter analyze --no-pub` for the two production and two new test files:
pass. `dart format --output=none --set-exit-if-changed` on those four files: pass.
`node scripts/validate-repository-hygiene.mjs`, `bash scripts/secret-scan.sh
--no-git`, and `git diff --check`: pass. An initial Flutter invocation needed the
existing writable XDG cache setting; no sandbox escalation was required.

The optional `LYTHAUS_ROBUSTNESS_EVIDENCE_DIR` environment variable writes four
synthetic profile screenshots from the widget test. Retained evidence in the
selected workspace: `/workspace/lythaus-robustness-evidence/`, including
`prefix-final.log`, `regressions.log`, and `prefix/` / `postfix/` loaded and denied
screenshots. These are Flutter widget raster captures, **not browser, deployed,
physical-device, or screen-reader acceptance**. The initial screenshot harness
was stopped while waiting on image I/O in the fake clock; the final harness
runs that optional I/O in `tester.runAsync`, without changing behavior assertions.

## Scope and handoff

- Read the root AGENTS, the forty-package acceptance ledger, and PR metadata /
  changed-file inventories for #1082, #1084, #1085, #1086 and #1087. No nested
  AGENTS or repository `.agents` skills were present; workspace `.agents` was
  empty. Owned production edits are only the two files named above.
- Traced search pagination, main feed session/cancellation guards, owner-profile
  and owner-post readers, routed Trending, deep-link dispatch, and the relevant
  profile/notification rendering. Existing tests were read and selected, not
  counted as new acceptance. Trending explicitly returns an unavailable state;
  its dormant provider concerns were not treated as a reproduced launch bug.
- Collision for parent/comment lane: `OwnerCommentsController.loadMore` has
  the same retain-on-every-error pattern. Production and tests there are
  untouched; this is a source finding requiring its own reproduction, not a
  claimed fixed or newly executed comments acceptance.
- Search pagination likewise retains results on errors. No new permission-loss
  regression was executed for search and no private-content leak is claimed.
- Not run: full Flutter suite/coverage, compiled browser journey, WebKit,
  physical device/system-tray deep links, expired live invites, real token
  expiry, server permissions, offline/reconnect against an actual transport,
  production account switching, publishing/duplicate mutations, or all forty
  acceptance packages. No performance claim or optimization is included.
- Smallest next steps: independent review of these two production deltas;
  current-main integration and required CI; parent/comment-lane reproduction
  of denial retention; then exact-candidate notification invalid-link feedback
  and owner Posts denied/read-retry checks using authorized fixtures. Keep the
  PR draft until the parent completes review and controls merge/deployment.
