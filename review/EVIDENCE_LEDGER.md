# Final evidence ledger — 2026-10-25

## Interpretation
Every matrix row retains its original preconditions/actions. Final audit: upload24 direct passes; comments20 direct passes at reader/UI/transformed-proposal scopes; integration22 direct passes plus I-08 qualified documented-contract execution. Total **66 direct passes +1 qualified case**, no wholly unexecuted case and no confirmed current-contract defect. This is not67 production end-to-end passes. The earlier64/67 estimate was audited and superseded.

I-08 ambiguity: app-driven reload readiness is gated until durable recovery is safe; actual browser reload was performed after the journal changed, restored the unsent draft/disclosure, caused no automatic write, then an explicit synthetic submit proved the exact restored body. No contract was found promising a forced manual reload before persistence would be blocked. Do not invent that requirement or silently mark it fully proved.

## Pinned scope and tools
- M: main c0963c36693476ecc49ab1fcba0572454926b4d3 at /workspace/lythaus-e2e-review.
- P: pending #1090 a10c381213373c0cb93e7dbc14404806ddf21cf2 at /workspace/lythaus-comments-review.
- Flutter3.41.1 / Dart3.11.0. Cached SDK/Pub supported offline setup.
- Node v24.19.0 for original Node checks; activation-script browser run used Node22.23.3. Docker28.4.0, cached postgres:17, disposable loopback only.
- `source /workspace/.lythaus-tools/activate.sh` selects cached Flutter/browser/cache paths. This is the prefix for Flutter/browser commands below. Alternatively use the explicit Flutter path with PUB_CACHE/XDG paths listed in REGRESSION_PACK.md.
- PostgreSQL commands use PLANETSCALE_PG17_TEST_DATABASE_URL to the named disposable lythaus_auth_test_comments database. Initial port5432; later boundary port55432. No remote DB URL. Standard baseline initialized approved schema, including0021 only as fixture prerequisite; separate qualification/restore diagnostics were not run.

## Exact closure commands and results
| Scope / case | Command after activation, from named worktree | Result / evidence |
|---|---|---|
| P / I-08 browser build | `flutter build web --debug --no-pub --no-wasm-dry-run --target test/browser/content_journey_entry.dart --output build/content-journey-web` | Build succeeded; followup-comments-browser-build.log |
| P / I-08 actual browser | `node review/comment-reload.browser.mjs` | 1 scenario passed; followup-comments-reload-browser-final.log. Actual candidate widgets + existing local synthetic HTTP fixture, not Worker/DB. Archived script in review documents pending checkout requirement |
| M / I-18 | `flutter test --no-pub --reporter expanded review/local_unlock_reward_isolation_test.dart` | 1 pass; real local controller/store and actual reward/monthly providers with synthetic Dio. Read counts, entitlements, auth revisions and stored tokens unchanged |
| M / I-23 | `flutter test --no-pub test/review/affected_screen_accessibility_test.dart` | 4 pass; semantics-final.log. Actual widgets, bundled Manrope/MaterialIcons; local provider fixtures |
| M / independent I-23 | `flutter test --no-pub --reporter=expanded test/review/affected_screen_accessibility_test.dart --plain-name 'comment reply semantics remain usable at 200% text on compact viewports'` | 1 pass covering three viewports; semantics-independent.log |
| M / UP-22,23,24 controller | `flutter test --no-pub review/upload_disposal_test.dart` | 3 pass; followup-upload-disposal-final.log. Exact default5-second/24-poll settings, same-attempt manual retry, dispose/no API, cancellation/reload-block release |
| M / UP-24 actual route | `flutter test --no-pub test/features/media/private_image_upload_test.dart --plain-name='UP-24 valid local selection blocks close until cleared, then leaves without upload or submission'` | 1 pass; followup-upload-route.log. Actual CreatePostScreen, local picker, zero API/repository calls; guarded close then clear/close |
| M / I-01 pending copy | `flutter test --reporter expanded --name='root Create tab accepts under_review without removing the shell' test/features/feed/presentation/create_post_navigation_test.dart` | 1 pass; exact pending-publication wording asserted |
| M / I-09,10,21,22 | `flutter test --no-pub --reporter expanded review/integration_widget_regression_test.dart` | Final5 pass; delayed add/removal, actual timeout→pending, read-only status recovery, guest zero-write/sign-in and bookmark-error retry. Original4-case result preserved in prior report |
| P / C02,C20 boundary | `node --experimental-strip-types --test --test-name-pattern='pagination remains continuous beyond 25\|inactive author root and replies' apps/lythaus-public-api/tests/comments-boundary-followup.postgres.mjs` | 2 pass; followup-comments-boundary-postgres.log. 31 roots, four limit10 pages, no duplicate IDs. Test archive/install instructions in review/pendingtests |
| P / stronger C20 direct access | Same file with `--test-name-pattern='inactive author root and replies'` | 1 pass; followup-comments-boundary-inactive-postgres.log. Suspended-root conversation rejected, exact child read empty, active unrelated root remains |

For the boundary commands set the local55432 URL documented in followup-comments.md. Original C02 precision/snapshot/scope mismatch checks still supplement the31-root test. C20 prior block/mute tests supplement the suspended-author test. These extra runs close exact original preconditions, not revised easier cases.

## Earlier executed groups retained
| Scope | Exact selection / command | Result |
|---|---|---:|
| M | `node --test packages/media/tests/standard-upload.test.mjs` | 7 pass |
| M | `node --test packages/media/tests/standard-upload.workerd.mjs` | 29 pass (parent+28) |
| M + exact pending1087 test-only patch | Same Workerd command | 30 pass (parent+29); overlaps baseline |
| M + terminal janitor test-only patch | `node --test --test-name-pattern='actual standard-upload handlers, Queue dispatcher and local private R2' packages/media/tests/standard-upload.workerd.mjs` | 30 pass; parent necessarily executes children |
| M | `node --experimental-strip-types --test apps/lythaus-public-api/tests/monthly-reputation-projection.test.mjs` | 6 initial,7 after added serialization case |
| M | `node --experimental-strip-types --test apps/lythaus-public-api/tests/monthly-reputation-routes.test.mjs` | 15 pass |
| M | `node --experimental-strip-types --test review/seams.test.mjs` | 12 pass |
| P | `node --experimental-strip-types --test apps/lythaus-public-api/tests/comment-integration-hooks.test.mjs` | 2 pass, transformed proposal compile/adapter only |
| P + loopbackPG | `node --experimental-strip-types --test apps/lythaus-public-api/tests/comment-propagation.postgres.mjs` | 11 pass, actual standalone candidate reader |
| P + loopbackPG | `node --experimental-strip-types --test apps/lythaus-public-api/tests/comment-propagation.workerd.mjs` | 4 pass, explicitly transformed shared hooks |
| P | `flutter test test/features/feed/presentation/post_comment_journey_test.dart` | 55 pass |
| P | `flutter test test/features/feed/presentation/comment_thread_screen_test.dart` | 15 pass |
| P | `flutter test test/features/feed/domain/comment_notification_link_test.dart` | 2 pass |
| M | `flutter test test/features/media/private_image_upload_test.dart` before route addition | 15 pass |
| M | Eight-file Flutter batch fully enumerated in followup-integration.md | 115 pass |
| M | `flutter test --reporter expanded test/ui/screens/profile/profile_accessibility_test.dart` | 5 pass |
| M | Four-file post/reward batch fully enumerated in REGRESSION_PACK.md | 35 pass |
| M | `flutter test --no-pub --reporter=expanded review/malformed_receipt_test.dart` | 3 pass |
| M | Filtered comment/recovery command verbatim in followup-integration.md | 8 pass |
| M | `flutter test --no-pub --reporter expanded --name='reload readiness\|unavailable recovery storage' test/features/feed/application/content_mutation_test.dart` | 2 pass |
| M | `flutter test --no-pub --reporter expanded test/ui_components/feed_redesign_regression_test.dart test/features/reactions/reaction_bar_test.dart` | 10 pass |
| M | `flutter test --no-pub --reporter expanded --name='keeps supplied pending_review state visible before expansion' test/ui_components/feed_reading_layout_test.dart` | 1 pass |
| M | Screenshot command in screenshots/README.md | 12 pass |
| Isolated actual P legacy handler | `node --experimental-strip-types --test review/comment-seam.test.mjs` | 3 current-behavior checks pass |
| Same handler, future contract | `EXPECT_COMMENT_INTEGRATION=1 node --experimental-strip-types --test review/comment-seam.test.mjs` | 3 expected failures, not current defects |

Some earlier full raw streams (115/5 and focused helper runs) exist only in the execution transcript; their commands/results are recorded in followup-integration.md. This limitation is explicit; no tests were rerun merely to manufacture logs. Suite counts overlap and have no meaningful unique-total sum.

## Preserved non-product failures
- Missing PATH/dependencies/cache setup from initial pass: superseded by successful supported cached setup.
- Browser CanvasKit text-locator attempts: superseded by actual reload, restored-status/disclosure and exact submitted-body checks; original logs retained.
- Compact layout318px overflow with fallback Ahem glyphs: superseded by bundled-font4/4 and independent1/1; original semantics-provisional-ahem.log retained. No layout defect ticket.
- Test-font error messages from original future-contract harness used “BUG”; those original logs remain exact. Harness labels now say STAGED FUTURE CONTRACT; assertions are unchanged and were not rerun for the label-only edit.

## Screenshot manifest
The authoritative16-file manifest is screenshots/manifest.json, including actual dimensions, SHA256, source SHA, kind and text scale. No generated mock images.
-12 M widget renders: post/rewards × widths320,390,1440 × light/dark; height900; width320 uses2×text.
-3 M real-font comment widget renders:320×640,320×900,390×844; light,2×text,DPR1.
-1 P Chromium screenshot: comment-unsent-actual-reload-390-light.png,390×900, normaltext; after actual reload/before explicit submit.
Coordinator inspected the narrow comment render and browser restoration screenshot. Widgets expose semantics; this is not a certification of real-device screen-reader usability or WCAG compliance.

## Delivery and residual boundaries
No Library retry was made after authenticated discovery returned401. It was not an upload attempt; no delivered Library files or IDs exist. Files remain local, with plain report/manifest available to parent. No production mutation, paid API, feature activation, merge or deployment occurred. Live deployment remains unverified. Shared comment hooks remain intentionally staged, not a discovered defect.
