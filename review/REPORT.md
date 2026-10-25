# Lythaus reliability review — updated execution report, 2026-10-25

## Outcome
The available cached environment supported the missing tests. The earlier PATH-only Flutter/PostgreSQL limitation was incorrect. Final row-level audit: **66 of 67 defined lane cases passed directly at their named local fixture scope; I-08 has qualified documented-contract execution. None is wholly unexecuted. No new current-contract implementation defect was confirmed.** This supersedes the intermediate 64-direct/3-partial assessment. No public-publishing readiness certification is claimed.

The only comment contract mismatch is an explicitly staged integration prerequisite in pending #1090. Its documentation reserves shared API/Jobs/Admin hooks for coordinated integration and its UI falls back to the legacy flat reader until capabilities arrive. Three future-contract assertions fail against that unintegrated reader as expected; these must not be presented as current defects.

Original results and the corrected first-pass report remain in FIRST_PASS_REPORT.md and the original logs. No assertions were weakened, runtime/business code changed, branches merged, features activated or deployments performed.

## Exact source baseline
Main review: `c0963c36693476ecc49ab1fcba0572454926b4d3`.
Pending comments: `a10c381213373c0cb93e7dbc14404806ddf21cf2`.
Previously reported deployed source: `3880a8be4c89459dd7ef831c9385817a887511ef`; live deployment not queried.
All seven pinned PR heads and the original checkout are in BASELINE.md. Main tests use the dedicated review worktree; pending comment tests use an unchanged detached #1090 worktree.

## Environment and setup
Repository .fvmrc pins Flutter 3.41.1. The saved SDK at /workspace/.lythaus-tools/flutter-sdk/flutter matches that version and supplies Dart 3.11.0. The saved activation script sets only SDK/cache/browser paths. Offline Pub resolution succeeded with /workspace/.lythaus-cache/pub; lockfiles remained unchanged. Docker 28.4.0 and an already cached postgres:17 image were available. No SDK download, privileged package install, new credentials, security-setting change, paid service or production connection was needed.

A task-owned loopback PG17 container and disposable lythaus_auth_test_comments database were initialized with the repository's standard baseline validator. This necessarily applied the approved schema manifest, including migration 0021, as fixture setup; no separate 0021 qualification, restore diagnostic or provider database test was run. The task-owned database/container were destroyed afterward.

## Matrix accounting
| Lane | Cases | Directly exercised, passed | Partial | Wholly source-only | Current-contract failures |
|---|---:|---:|---:|---:|---:|
| Upload/publication | 24 | 24 | 0 | 0 | 0 |
| Comments/replies | 20 | 20 | 0 | 0 | 0 |
| Integration/session/UI | 23 | 22 | 1 qualified | 0 | 0 |
| Total | 67 | 66 | 1 qualified | 0 | 0 |

“Direct” means the action/invariant was exercised in the local scope named by each row, not that 66 production journeys ran end-to-end. Comment reader/Workerd cases validate the pending reader or documented in-memory hook integration; Flutter cases use synthetic adapters. This is a newly defined review matrix, not proof of a historical suite. No executed selection reported runner skips.

The three requested follow-ups were executed:
- I-08: an actual Chromium page.reload() after durable journal persistence restored an unsent comment and disclosure, made zero automatic writes, and explicit submit proved the restored body. Two app-driven reload-readiness tests passed. The original broader expectation that forced manual reload before persistence must be blocked has no documented guarantee; this case remains qualified rather than silently declared fully passed.
- I-18: one test changed enabled local unlock preferences using the real controller/store and actual reward/monthly providers over synthetic Dio. Entitlements, provider read counts, auth revision and stored session tokens remained unchanged.
- I-23: four real-widget semantics tests passed with bundled production fonts; an independent compact-screen rerun passed across three viewports. Actions and labels are checked, not real-device assistive-technology certification.

The row audit also added exact default upload timeout/manual retry, actual guarded composer-route exit, more-than-25-root pagination, inactive-parent direct access, and preconfirmed reaction removal checks. Detailed commands, counts and fixture distinctions are in EVIDENCE_LEDGER.md; row mappings are in upload-matrix.md, comments-matrix.md and integration-matrix.md.

## Follow-up execution ledger
Counts are per command group; do not sum them as unique coverage.
| Selection | Result | Scope/evidence |
|---|---:|---|
| Main integration/session/reward/local-unlock/responsive batch | 115 pass | followup-integration.md; summary output recorded |
| Profile accessibility | 5 pass | followup-integration.md; summary output recorded |
| Flutter media/composer | 15 pass | followup-upload.md |
| Terminal janitor retry addition | 30 pass | one outer test +29 nested tests, overlaps previously passing suite; exact followup-terminal-janitor.patch preserved |
| New disposal regression | 1 pass | upload_disposal_test.dart; followup-upload-disposal.log |
| Pending comment PostgreSQL reader | 11 pass | followup-comments-postgres.log |
| Pending transformed comment Workerd | 4 pass | followup-comments-workerd.log |
| Pending comment journey | 55 pass | followup-comments-post-journey.log |
| Pending comment screen | 15 pass | followup-comments-thread-screen.log |
| Pending notification link | 2 pass | followup-comments-notification-link.log |
| Main post/reward mutation and recovery batch | 35 pass | followup-post-rewards.log |
| New malformed creation receipt tests | 3 pass | malformed_receipt_test.dart; followup-malformed-receipt.log |
| Main filtered comment/recovery cases | 8 pass | followup-integration.md |
| Reload readiness | 2 pass | followup-integration.md |
| Feed redesign/reaction controls | 10 pass | followup-integration.md |
| Exact pending-review widget label | 1 pass | followup-integration.md |
| New real feed-control widget harness | 5 pass final | integration_widget_regression_test.dart; original4-pass result preserved |
| Selected post/rewards renders | 12 pass | followup-screenshots.log; screenshots/README.md |

The initial pass remains valid: media pure functions7; baseline media Workerd29; #1087-augmented Workerd30; monthly projection6 then7 after the added test; monthly routes15; new event seams12; proposed hook compile tests2. The two comment harness modes verify legacy behavior3/3 and reject future-contract expectations0/3 respectively. Hook compile tests were not counted as three extra future-contract product failures.

Some suites were necessarily repeated to execute an added nested case; those overlaps are disclosed, not counted as fresh unique coverage. Main and pending comment screen runs are different source builds. No unrelated full suite was launched.

## Staged comment prerequisite
At #1090, public-api/src/index.ts:3441–3480 is the legacy reader; line3627 dispatches to it. It ignores future target/conversation/sort parameters and omits future capabilities. The exact function is also present in main and the previously reported deployed-source commit (function SHA256: 51edd1cd7817bba619168fac5f78014b94b02f313aeccff2579f2c1a97910c8b).

docs/testing/comment-propagation-2026-10-23.md:71–99 explicitly requires coordinated shared-hook application and documents client fallback; comment_thread_screen.dart:1361 gates sort controls on capability. comment-runtime-fixture.mjs:21–22 applies the shared hooks in memory. The new local results validate that proposed integration, not its presence in the checked-in dispatch. Coordinate with the existing owner before activation; do not open a duplicate “new bug” ticket based on the expected future-contract failures.

## Journey and contract map
| Boundary | Concrete paths | Observed contract / evidence |
|---|---|---|
| Selection → private session | lib/features/media/; lib/features/feed/presentation/create_post_screen.dart; public-api/src/index.ts createUploadSession (1332), uploadSessionBytes (1387) | Owner/session, size, MIME and checksum binding; local byte-stream tests and Workerd handlers passed. Flutter media/controller/composer suite and explicit disposal regression passed. |
| Finalise → outbox → queue | public-api/src/index.ts finaliseUpload (1493); jobs/src/index.ts; packages/media/src/standard-upload.ts | Durable receipt and replay checks; duplicate ordinary delivery, failed transforms and cleanup exercised with synthetic state/local R2. Database persistence semantics remain mocked. |
| Queue → status → publication eligibility | public-api/src/standard-media-status.ts; uploadSessionStatus (1382); jobs reconcileExpiredStandardMediaSessions (1929) | Internal integrity-approved state maps to review, not public approval. Safety/authenticity not_run; images remain private and image-bearing posts rejected. This is intentional inactivity, not a broken detector. |
| Text submission → moderation → publication | public-api/src/index.ts; jobs/src/text-review-runtime.ts and index.ts; admin-api/src/index.ts moderation decision/outbox (657 onward) | sourceEventId/bodyHash/creation mode bind review to content revision. New seam tests reject stale edit/deletion/late deliveries. No real detector or end-to-end approval was run. |
| Publication → comments/replies | public-api/src/index.ts getComments (3441); pending comment-thread-reader.ts; Flutter comment_thread_screen.dart | Legacy flat reader remains wired. Pending reader passed PG17 tests; documented transformed Workerd integration and adapter-backed Flutter journeys passed. F1 is staged, not a defect. Relevance remains unavailable. |
| Published comment → notification | jobs/src/index.ts processNotificationSource (514); notification models; post_detail_screen.dart → comment_thread_screen.dart | Parent author/post author chosen from canonical event. Exact-target client lookup must agree with actual server reader. Proposed notification revision/visibility and retry paths passed local PG17/transformed Workerd fixtures; no live delivery. |
| Publication → reputation | jobs/src/index.ts processReputationSource (707); packages/db/src/reputation.ts | Canonical outbox event supplies author/content/creation mode; source-event deduplication and subject transaction path exist. This review does not certify DB lock/migration behavior or award rules. |
| Reputation → rewards display | public-api/src/monthly-reputation-routes.ts and monthly-reputation-projection.ts; lib/state/providers/reward_providers.dart; rewards_dashboard.dart; monthly_reputation_widgets.dart | Pending/shadow/preparation values cannot confer top-level confirmed authority. 7 projection and 15 route tests pass with local fixtures. Flutter session and reward-state tests passed. Explicit local-unlock preference changes leave actual reward-provider reads and entitlement state unchanged. |


## User-visible evidence
Sixteen actual images are saved under screenshots/: twelve main post/reward widget renders; three main comment-thread renders at200% text (320×640,320×900,390×844) with bundled fonts; and one pending #1090 Chromium screenshot after actual reload restoring the draft (390×900). Synthetic fixtures only. Representative post/reward images, the narrow comment render and browser draft restoration were visually inspected. screenshots/manifest.json records every filename, source SHA, dimensions and SHA256; screenshots/README.md documents states and limits.

## Remaining limitations and delivery
I-08 retains the documented-policy boundary described above; no missing-tool blocker remains. No real detector/provider, mobile device biometric interaction, production account, deployment or end-to-end public publication was exercised. Public image attachment/validated publishing remains intentionally withheld. Preserve all gates and the existing refresh-token mechanism.

## Deliverables
This report, FIRST_PASS_REPORT.md, BASELINE.md, TEST_MATRIX.md, the three lane matrices, REGRESSION_PACK.md, TICKETS.md, follow-up records, review-only regression tests/patches and screenshots are preserved in this artifact branch. The matrix records local scope and the evidence ledger gives exact commands and results.
