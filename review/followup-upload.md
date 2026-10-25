# Upload review follow-up

Coordinator addendum: `review/upload_disposal_test.dart` has three deterministic controller lifecycle cases (raw output in [followup-upload-disposal-final.log](followup-upload-disposal-final.log)). It confirms disposal cancellation/reload release, exact default 5-second/24-poll behavior plus manual retry on the same attempt, and disposal after a valid local selection with zero API calls. A separate route-level UP-24 test now mounts the real composer and a prior route: a valid local selection causes zero media API and post-repository calls; close remains blocked by the existing guard; clearing then closing returns to the prior route with both call counts still zero.

Follow-up to `upload.md`: execute mobile lifecycle/composer cases and the terminal janitor cleanup branch with local fixtures. Runs used Flutter 3.41.1 / Dart 3.11.0 and the shared Pub cache prepared by the integration lane. No provider, production database, detector, or live service was accessed.

## Mobile upload and composer tests

Command:

```sh
PUB_CACHE=/workspace/.lythaus-cache/pub \
XDG_CONFIG_HOME=/workspace/.lythaus-cache/config \
XDG_CACHE_HOME=/workspace/.lythaus-cache/xdg \
PATH=/workspace/.lythaus-tools/flutter-sdk/flutter/bin:/workspace/.lythaus-tools/flutter-sdk/flutter/bin/cache/dart-sdk/bin:/workspace/.lythaus-tools/java17/bin:$PATH \
/workspace/.lythaus-tools/flutter-sdk/flutter/bin/flutter test test/features/media/private_image_upload_test.dart
```

Result: **15 passed, 0 failed**. Relevant cases included:

- `queued polling is bounded, foreground-only and never reuploads`
- `bad images remain local and a stale picker cannot publish selection`
- `account switch clears selection and ignores late picker results`
- `composer blocks image-bearing submission until explicitly cleared`
- `private controls remain readable at 320 pixels and double text`

The first attempt omitted Flutter's writable config/cache environment and failed before test startup while trying to create `/home/agent/.config/flutter`. Retrying with the shared activation paths above passed; this was an environment setup issue, not a test failure.

## Terminal janitor cleanup

Command:

```sh
node --test --test-name-pattern='actual standard-upload handlers, Queue dispatcher and local private R2' packages/media/tests/standard-upload.workerd.mjs
```

The name pattern selects the suite's parent test, so Node executed the full fixture suite. A temporary test-only case exercised a cancelled terminal session with an unreferenced approved derivative: the first approved-bucket deletion failed, quarantine deletion completed, the cleanup marker stayed unset, then retry removed the derivative and set the marker without ledger writes. Result: **30 passed, 0 failed** (parent plus 29 nested tests, including this case). The temporary case was removed afterward; no business logic changed.

Raw terminal janitor command output:

```text
✔ actual standard-upload handlers, Queue dispatcher and local private R2 (4962.865733ms)
ℹ tests 30
ℹ suites 0
ℹ pass 30
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 5464.074782
```

The exact temporary UP-21 test is preserved in [followup-terminal-janitor.patch](followup-terminal-janitor.patch); `git apply --check` verifies it applies cleanly. The earlier baseline and ref 1087 test evidence remain in `upload-test-log.md`. Matrix status is 23 executed and UP-22 partial: the test checks local clearing and the disclosure that uploaded bytes are not deleted, but does not exercise disposal-triggered behavior. These are deterministic local fixtures.

## Affected-screen semantics (main checkout)

Source revision: main checkout `c0963c36693476ecc49ab1fcba0572454926b4d3`. Pending refs were not used for this check.

Command:

```sh
PUB_CACHE=/workspace/.lythaus-cache/pub \
XDG_CONFIG_HOME=/workspace/.lythaus-cache/config \
XDG_CACHE_HOME=/workspace/.lythaus-cache/xdg \
PATH=/workspace/.lythaus-tools/flutter-sdk/flutter/bin:/workspace/.lythaus-tools/flutter-sdk/flutter/bin/cache/dart-sdk/bin:/workspace/.lythaus-tools/java17/bin:$PATH \
/workspace/.lythaus-tools/flutter-sdk/flutter/bin/flutter test --no-pub test/review/affected_screen_accessibility_test.dart
```

Result: **3 passed, 0 failed**. The review-only harness mounts actual widgets with local fixture data and asserts:

- Feed `Post actions` exposes its tooltip as a meaningful semantics tooltip, is a button with a tap action, and its `PopupMenuButton` target is at least 48 px.
- `CommentThreadScreen` exposes the `Write a reply` label on its text field; the send icon’s `Send reply` semantic label is attached to an actionable button with a target at least 48 px.
- Rewards error-state `Retry` is a labeled actionable button with a target at least 48 px.

These assertions check framework semantics roles, action exposure, the labels present in the UI, and the existing minimum interactive target size. The tests do not add policy requirements for unrelated controls. An initial harness draft queried the tooltip wrapper and text child for button labels/sizes; those selectors were corrected to inspect semantics tooltip data and the actual button target before the passing run. No production widget code changed.

Integration screenshot checks remain separate visual evidence; this harness adds feed, comment, and reward semantics-tree evidence for the main checkout. Upload matrix status: **24 executed, 0 partial**.
