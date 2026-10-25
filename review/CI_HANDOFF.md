# Reliability test artifact handoff — 2026-10-25

This branch contains review artifacts based on main c0963c36693476ecc49ab1fcba0572454926b4d3 and pending comments candidate a10c381213373c0cb93e7dbc14404806ddf21cf2 (#1090). No runtime logic or workflow changes are included.

Read REPORT.md and EVIDENCE_LEDGER.md first. Final coverage is66 direct local-scope passes plus1 qualified case (I-08), not67 production end-to-end passes. Suite counts overlap. The three historical future-contract failures are expected against intentionally staged comment dispatch; they are not current defects and must not become required failing CI checks.

## Portable regression candidates

These run against checked-in main runtime with local synthetic dependencies. Integrator should relocate review tests into conventional suite directories, preserve relative imports, and select bounded CI jobs instead of launching duplicate suites.

| Source | Last executed result | Integration notes |
|---|---:|---|
| apps/lythaus-public-api/tests/monthly-reputation-projection.test.mjs | 7 passed | One new serialized fresh-pending case;6 existing cases. Existing Node runner. |
| test/features/media/private_image_upload_test.dart | Added route case1 passed; prior suite15 passed | New actual composer guard/clear/close regression; no upload/submission. |
| review/seams.test.mjs | 12 passed | Real runtime-policy exports, synthetic event/revision fixtures; Node strip-types runner. |
| review/malformed_receipt_test.dart | 3 passed | Actual creation repository with synthetic HTTP receipts. |
| review/upload_disposal_test.dart | 3 passed | Default5-second/24-poll limit, same-attempt retry, disposal/cancellation. Fake clock, no provider. |
| review/integration_widget_regression_test.dart | 5 passed | Real controls with synthetic adapters: delayed reaction changes, uncertain timeout, guest action, retry. |
| review/local_unlock_reward_isolation_test.dart | 1 passed | Actual preferences/controller and reward providers; fake authenticator/HTTP. No earned entitlement or session changes. |
| test/review/affected_screen_accessibility_test.dart | 4 passed | Bundled Manrope/MaterialIcons fonts required; writes three small review/screenshots images. Make evidence output optional or temp-dir scoped when adopting into CI. Independent compact selection1 passed across three viewports. |

Exact commands/versions are in EVIDENCE_LEDGER.md. Flutter3.41.1/Dart3.11.0 matches .fvmrc. Cached workspace activation paths in historical commands are environment-specific; CI must use its normal repository SDK setup. No new dependencies were added.

## Candidate-dependent or historical artifacts

- review/comment-seam.test.mjs reads the exact pending SHA through git show. A shallow clone lacking that object cannot run it. Observed mode3 passed; EXPECT_COMMENT_INTEGRATION=1 intentionally fails3 future-contract expectations. Historical diagnostic only; do not install unchanged as a required current-contract CI gate.
- review/comment-reload.browser.mjs requires the exact pending candidate's existing content-journey entry point and browser runtime. Build/run from that checkout as documented in its header and ledger. One actual reload scenario passed after durable journal persistence. It does not promise to block forced manual reload before persistence; I-08 remains qualified.
- review/pendingtests/comments-boundary-followup.postgres.mjs must be installed at the candidate test path in its README. Actual standalone candidate reader, disposable local PG17 only:2 boundary tests passed; stronger inactive-access rerun1 passed. This does not prove the reader is wired into main dispatch.
- review/1087-cancelled-cleanup.patch and followup-terminal-janitor.patch are archived test-only patches. Each augmented Workerd run passed30 counting the outer test and nested cases, overlapping baseline29. Review overlap before adopting; do not count them as60 unique cases.
- Pending Workerd/hook results use explicitly transformed proposed shared hooks. The real checked-in shared handlers remain intentionally unintegrated. Adoption should eventually test the unchanged integrated runtime, not silently transform it to supply missing features.
- Original logs, FIRST_PASS_REPORT.md and early lane reports preserve historical conclusions and setup failures. Final REPORT.md, EVIDENCE_LEDGER.md and updated lane matrices supersede earlier status estimates. Provisional Ahem-font overflow and browser locator failures are harness artifacts, not product bugs.

## Evidence and exclusions

screenshots/manifest.json lists16 actual images with hashes, dimensions and source SHA:12 main post/reward widget renders,3 main compact comment renders,1 pending browser reload screenshot. All16 hashes were verified before handoff. The source snapshot contains small text logs and screenshots, not SDKs, caches, node_modules, browser builds, database dumps or credentials. Synthetic loopback DB credentials in reproduction instructions are fixtures only.

No Library transfer occurred; authenticated discovery failed401 and was not retried. This repository branch is the explicitly authorized source handoff. No merge, deployment, feature activation or blanket CI claim is authorized by this artifact commit.
