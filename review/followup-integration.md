# Follow-up integration evidence

The earlier review marked Flutter widget coverage as unrun because the SDK was not initially on `PATH`. The cached SDK is available at `/workspace/.lythaus-tools/flutter-sdk/flutter/bin/flutter`; sourcing `/workspace/.lythaus-tools/activate.sh` sets SDK paths and cache locations only. It contains no credentials. The repository pins Flutter 3.41.1; observed versions were Flutter 3.41.1 and Dart 3.11.0.

Dependency resolution completed with `flutter pub get --offline` using `/workspace/.lythaus-cache/pub`. No lockfile change was observed. Tests ran against local mocks/fakes; no live data, detector, provider, or device biometric interaction was used.

The following targeted batch completed with `All tests passed!` and progress `+115`:

```sh
flutter test --reporter expanded \
  test/features/auth/application/auth_session_revision_test.dart \
  test/features/feed/application/feed_actions_service_test.dart \
  test/state/providers/feed_session_isolation_test.dart \
  test/features/feed/presentation/comment_thread_screen_test.dart \
  test/features/rewards/domain/reward_models_test.dart \
  test/ui/screens/rewards/monthly_reputation_widgets_test.dart \
  test/features/member_verification/device_unlock_foundation_test.dart \
  test/ui/responsive_product_test.dart
```

That batch covers session revisions, feed action receipts and reconciliation, feed session isolation, comment-thread flows, reward model state, pending/shadow/confirmed monthly UI and account-change invalidation, local unlock storage/isolation/cancellation/offline behavior, and responsive layouts at 320px with 200% text scale in light and dark themes. The comment-thread screen suite overlaps the active #1090 comments lane; it ran in this main review worktree before lane coordination reached me. I notified that agent to avoid duplicating that suite if it is in their selection.

The targeted accessibility suite also passed (exit code 0; five tests):

```sh
flutter test --reporter expanded test/ui/screens/profile/profile_accessibility_test.dart
```

It checks announced loading state, accessible retry and settings actions, and preference saving/unavailable states. The coordinator separately ran the selected post/rewards design-review screenshot suite, recorded below. These test suites do not prove real-device behavior or production service outcomes.

Additional focused runs closed publication, comment recovery, and feed-action gaps:

- The coordinator’s `review/followup-post-rewards.log` records 35/35 tests across post creation, reward redemption, reward providers, and dashboard UI. `review/followup-malformed-receipt.log` records 3/3 malformed-receipt cases. `review/followup-screenshots.log` records 12/12 selected post/rewards screenshot cases.
- A filtered `post_comment_journey_test.dart` run passed 8/8 matching cases: canonical pending comment creation, timeout/`idempotency_in_progress`/`idempotency_outcome_unknown` retries with the same body and key, malformed receipt recovery, pending-post comment gating, deferred refresh fenced to the active account, and private pending-comment recovery after restart.
- A filtered `content_mutation_test.dart` run passed 2/2 reload-readiness/storage cases. The comments lane then executed an actual same-context `page.reload()` for an unsent comment; `review/followup-comments-reload-browser-final.log` records restored draft/disclosure, no pre-submit write, exact post-reload submission body, and no browser errors or off-origin requests.
- `feed_redesign_regression_test.dart` plus `reaction_bar_test.dart` passed 10/10; the bounded `pending_review` layout test passed 1/1.
- [integration_widget_regression_test.dart](integration_widget_regression_test.dart) passed 5/5: delayed Useful addition/removal acknowledgements, timeout-to-pending behavior, guest sign-in without a service call, and bookmark-read failure refresh.

The exact focused commands and final output summaries are:

```sh
source /workspace/.lythaus-tools/activate.sh && flutter test --reporter expanded --name='root Create tab accepts under_review without removing the shell' test/features/feed/presentation/create_post_navigation_test.dart
```

Result: 1/1 passed; the test asserts “Post submitted. Publication checks are pending.”

```sh
source /workspace/.lythaus-tools/activate.sh && flutter test --no-pub --reporter expanded --name='bare canonical create response|retry reuses body and key|incomplete write response|pending post disables new comments|deferred refresh stays scoped to the active account|own pending comment is restored privately after process restart' test/features/feed/presentation/post_comment_journey_test.dart test/features/feed/application/content_mutation_test.dart test/ui_components/feed_redesign_regression_test.dart test/features/reactions/reaction_bar_test.dart
```

Result: 8/8 matching tests passed. The `--name` filter matched only the comment journey file in this invocation; the other named files were run separately below.

```sh
source /workspace/.lythaus-tools/activate.sh && flutter test --no-pub --reporter expanded --name='reload readiness|unavailable recovery storage' test/features/feed/application/content_mutation_test.dart
```

Result: 2/2 passed.

```sh
source /workspace/.lythaus-tools/activate.sh && flutter test --no-pub --reporter expanded test/ui_components/feed_redesign_regression_test.dart test/features/reactions/reaction_bar_test.dart
```

Result: 10/10 passed.

```sh
source /workspace/.lythaus-tools/activate.sh && flutter test --no-pub --reporter expanded --name='keeps supplied pending_review state visible before expansion' test/ui_components/feed_reading_layout_test.dart
```

Result: 1/1 passed.

```sh
source /workspace/.lythaus-tools/activate.sh && flutter test --no-pub --reporter expanded review/integration_widget_regression_test.dart
```

Result after the final test additions: 5/5 passed. These cover delayed Useful addition and removal acknowledgements, timeout-to-pending behavior, guest sign-in gating, and bookmark error refresh.

```sh
source /workspace/.lythaus-tools/activate.sh && flutter test --no-pub --reporter expanded review/local_unlock_reward_isolation_test.dart
```

Result: 1/1 passed. This checks the real local store/controller against both actual reward providers backed by a synthetic Dio adapter.

```sh
node --experimental-strip-types --test apps/lythaus-public-api/tests/monthly-reputation-projection.test.mjs
```

Result: 7/7 passed, including the serialized fresh pending projection case.

The upload lane’s font-corrected `test/review/affected_screen_accessibility_test.dart` run passed 4/4, including CommentThreadScreen at 320×640, 320×900, and 390×844 with 2× text. It loaded all bundled Manrope weights and Material Icons. `review/followup-accessibility.md` records exact command, assertions, screenshot paths, and hashes. The earlier Ahem fallback overflow was superseded and is not a product finding.

The full raw tool stream for the initial 115-test batch and five-test profile accessibility run was not saved as a file. Their final outputs were `+115: All tests passed!` and exit code 0 with five named tests passed, respectively; they are recorded in this workspace’s tool transcript. The focused runs above likewise have command/result excerpts in the transcript. No test was rerun just to recreate logs. Counted suite outcomes total 210 including the comments browser reload and four font-corrected semantics/responsive tests; these counts include suites that exercise overlapping behavior and must not be read as distinct scenarios.
