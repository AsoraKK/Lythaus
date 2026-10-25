# Reproducible local regression pack

## Follow-up execution, superseding missing-tool assumptions

Flutter3.41.1/Dart3.11.0 and postgres:17 were already cached. Set `PUB_CACHE=/workspace/.lythaus-cache/pub`, `XDG_CONFIG_HOME=/workspace/.lythaus-cache/config`, `XDG_CACHE_HOME=/workspace/.lythaus-cache/xdg`, and use `/workspace/.lythaus-tools/flutter-sdk/flutter/bin/flutter`. `flutter pub get --offline` succeeded. No production service or paid setup is needed for these fixtures.

Exact follow-up command groups and result evidence are in `followup-upload.md`, `followup-comments.md`, `followup-integration.md` and REPORT.md. New review-only commands:

```sh
flutter test --no-pub --reporter=expanded review/upload_disposal_test.dart
flutter test --no-pub --reporter=expanded review/malformed_receipt_test.dart
flutter test --no-pub --reporter=expanded review/integration_widget_regression_test.dart
flutter test --no-pub --concurrency=1 --reporter=expanded test/integration/post_creation_integration_test.dart test/integration/rewards_redemption_integration_test.dart test/features/rewards/application/reward_providers_test.dart test/ui/screens/rewards/rewards_dashboard_test.dart
```

Results: 1, 3, 4, and35 passes respectively. Actual post/rewards PNG generation command and source/viewport labels are in screenshots/README.md;12 renders passed. `followup-terminal-janitor.patch` preserves the additional passing synthetic janitor regression. It was applied temporarily and reverted after a30-count parent/nested run; do not count that as30 new unique tests. PG17 comments required only a task-owned loopback fixture initialized by the standard repository schema script, then cleaned up. Workerd comment tests apply the documented proposed hooks in memory; this is deliberately staged capability evidence, not checked-in integration or a new defect.

## Historical initial execution ledger (retained)

Worktree: /workspace/lythaus-e2e-review, base c0963c36693476ecc49ab1fcba0572454926b4d3. Node v24.19.0; npm 11.9.0; TypeScript 5.5.4; sharp 0.35.5; Wrangler 4.129.1; Miniflare 5.20260907.0-alpha. Dependencies pinned by unchanged package-lock.json.

Setup (already completed once):
```sh
npm ci --cache /tmp/lythaus-e2e-npm-cache --ignore-scripts --no-audit --no-fund
```
715 packages installed. Initial default-cache ENOENT was resolved by selecting writable /tmp cache, not by an approval bypass. No setup error is counted as an application regression.

Commands from worktree root:
```sh
node --test packages/media/tests/standard-upload.test.mjs
node --test packages/media/tests/standard-upload.workerd.mjs
node --experimental-strip-types --test apps/lythaus-public-api/tests/monthly-reputation-projection.test.mjs
node --experimental-strip-types --test apps/lythaus-public-api/tests/monthly-reputation-routes.test.mjs
node --experimental-strip-types --test review/seams.test.mjs
node --experimental-strip-types --test review/comment-seam.test.mjs
EXPECT_COMMENT_INTEGRATION=1 node --experimental-strip-types --test review/comment-seam.test.mjs
```

Results respectively: 7 pass; 29 pass (parent + 28); 7 pass; 15 pass; 12 pass; 3 pass verifying known bug; 3 expected-contract failures. The last command should exit 1. It reaches the actual extracted pending handler, not a broken fixture. Do not count the two comment modes as six distinct product scenarios.

Fixtures: packages/media/tests/standard-upload-fixture.mjs and image-fixtures.mjs supply local Workerd R2 plus synthetic SQL callbacks and generated pixels; no detector/provider requests. Monthly route tests supply local fake query clients; projection tests supply in-memory snapshots. review/seams.test.mjs supplies fixed synthetic event/revision IDs. review/comment-seam.test.mjs reads a10c381 from git, extracts getComments with TypeScript AST, executes unchanged logic with SQL/response transport mocks and real page parsing; no API server/DB or provider is called.

Logs: upload-test-log.md (captured TAP plus setup history); monthly-routes.tap; seams.tap; comment-seam-observed.tap; comment-seam-expected.tap. Projection 6/6 then 7/7 was recorded in tool output/integration.md; no raw projection TAP file was captured. Pending hooks 2/2 was recorded by the helper/in comments.md; it validates a transformation only. Do not claim these last two have standalone raw logs.

Pending #1087 extra case: review/1087-cancelled-cleanup.patch contains the exact added regression. It was temporarily applied, suite ran 30/30, then reverted; runtime logic never changed. Reproduce only in an isolated copy of this baseline: apply the patch, run the same media Workerd command, then discard that isolated copy. `git apply --check review/1087-cancelled-cleanup.patch` passed. This augmented run overlaps baseline coverage and is not 30 additional independent scenarios.

Pending hook validation: in an isolated detached a10c381 worktree with shared locked dependencies, run `node --experimental-strip-types --test apps/lythaus-public-api/tests/comment-integration-hooks.test.mjs`. 2/2 passed. The temporary worktree was removed; original pending branch was never changed.

Not run: Flutter/Dart widget/browser tests (SDK unavailable); actual SQL-backed comment propagation (local PostgreSQL URL unset); deployment, provider, real detector, or DB restore diagnostics. No test thresholds/assertions were weakened, no full suites duplicated. The intentional known-bug harness pass is explicitly not a correctness pass.

# Final evidence index

EVIDENCE_LEDGER.md is the authoritative final command/count/scope ledger. REPORT.md and the three lane matrices contain the reconciled66-direct/1-qualified accounting. Original outputs below remain historical evidence; overlapping suites must not be summed as unique coverage. screenshots/manifest.json lists16 actual renders. New final test-only harnesses include local_unlock_reward_isolation_test.dart, upload_disposal_test.dart, integration_widget_regression_test.dart, test/review/affected_screen_accessibility_test.dart, comment-reload.browser.mjs and pendingtests/comments-boundary-followup.postgres.mjs.
