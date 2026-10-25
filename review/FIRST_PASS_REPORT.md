# Lythaus bounded reliability review — 2026-10-25

## Result
**Do not treat this review as public-publishing readiness certification.** Local media processing and reward projections passed the selected executable checks. No newly discovered implementation defect was confirmed. One known, intentionally staged integration prerequisite remains before #1090's threaded-comment capability can be enabled: its checked-in Worker still uses the legacy reader and its client falls back when conversation capabilities are absent. Three expected-contract assertions fail against the exact real handler (SQL transport mocked). No production behavior, Flutter rendering, full database transaction behavior, or detector execution was verified.

The 67-case lane matrix is newly defined for this review; it is not evidence that a historical 40-case promise was fulfilled. Many UI cases remain source-reviewed, not executed. Additional coordinator seam cases are listed in TEST_MATRIX.md. No business logic was changed, features activated, merges performed, or deployments attempted.

## Versions and scope
Main: `c0963c36693476ecc49ab1fcba0572454926b4d3`. Last owner-reported deployment: `3880a8be4c89459dd7ef831c9385817a887511ef`, not independently verified live. All seven exact PR heads and model limitations are in [BASELINE.md](BASELINE.md). Original saved checkout remained unchanged. Review branch/worktree: `review/e2e-reliability-20261025`, `/workspace/lythaus-e2e-review`.

PR labels in the assignment were historical context: #1086 changes homepage-protection tests; #1087 adds cancelled-upload cleanup regression; #1090 proposes threaded comments; #1093 improves a homepage mutation test; #1084 pins SDK security test commands; #1092 changes private navigation/account-action redirects; #1091 prepares suggestion observations. None is assumed deployed.

## F1 — known staged integration prerequisite, not a new defect
- **Class:** intentionally staged missing integration. The exact pending documentation explicitly reserves shared hooks for parent coordination. This is not a newly discovered bug or production incident.
- **Priority/severity:** P1 / high for enabling #1090 threaded conversations; not a reason to claim the existing legacy reader is broken for its supported contract.
- **Likelihood:** deterministic when a new client requests conversation/newest or exact-target behavior from the checked-in handler.
- **User impact:** the future threaded journey remains unavailable. The UI gates Newest/Oldest controls on _conversationMode and falls back to the existing flat API; no user-visible false Newest selection was demonstrated. Exact-target parameters do not change the legacy lookup. No rendered regression was established.
- **Scope:** exact pending #1090 SHA `a10c381213373c0cb93e7dbc14404806ddf21cf2`. Main and owner-reported deployed-source commit contain the identical legacy getComments function, SHA-256 `51edd1cd7817bba619168fac5f78014b94b02f313aeccff2579f2c1a97910c8b`. That source comparison is not a live probe.
- **Evidence:** [comment-seam.test.mjs](comment-seam.test.mjs) extracts the actual TypeScript AST function without changing it, transpiles it, and invokes it with real page parsing and local query/response mocks. It observes identical SQL/arguments with targetId and conversation/newest parameters and missing capabilities. [Observed reproduction](comment-seam-observed.tap): 3/3 pass verifying current legacy behavior. [Expected invariant run](comment-seam-expected.tap): 0/3 pass, 3 failures against the proposed future contract after reaching real handler behavior. These are expected capability-gap failures, not failures of the supported legacy contract.
- **Independent corroboration:** #1090 Worker imports/calls neither readCommentThread nor the new reader. GET dispatch calls legacy getComments. Its comment-runtime-fixture applies integratePublicApiComments during bundling; the hook suite's 2 passing tests validate the proposed transformation, not the checked-in consumer. Flutter requests view=conversations, sort and targetId at lines 451–524 and reveals targets at 732 onward. Main's first-page highlight gap is the same unresolved journey boundary, not a second ticket.
- **Intent evidence:** at a10c381, docs/testing/comment-propagation-2026-10-23.md:71–99 explicitly leaves shared indexes unchanged and documents flat fallback; docs/evidence/comment-propagation-20261023/checkpoint.md:36–43 records the parent-coordinated boundary. comment_thread_screen.dart:1361 gates sort controls on conversation capability. This corrects the earlier P1-new-defect framing; P1 applies only to a future activation prerequisite.
- **Limits:** isolated real-handler execution proves request interpretation. It does not exercise routing/auth, SQL execution, Flutter navigation, or concurrency in a real PostgreSQL database.

## Journey and contract map
| Boundary | Concrete paths | Observed contract / evidence |
|---|---|---|
| Selection → private session | lib/features/media/; lib/features/feed/presentation/create_post_screen.dart; public-api/src/index.ts createUploadSession (1332), uploadSessionBytes (1387) | Owner/session, size, MIME and checksum binding; local byte-stream tests and Workerd handlers passed. UI cancellation/poll ordering inspected, not rendered. |
| Finalise → outbox → queue | public-api/src/index.ts finaliseUpload (1493); jobs/src/index.ts; packages/media/src/standard-upload.ts | Durable receipt and replay checks; duplicate ordinary delivery, failed transforms and cleanup exercised with synthetic state/local R2. Database persistence semantics remain mocked. |
| Queue → status → publication eligibility | public-api/src/standard-media-status.ts; uploadSessionStatus (1382); jobs reconcileExpiredStandardMediaSessions (1929) | Internal integrity-approved state maps to review, not public approval. Safety/authenticity not_run; images remain private and image-bearing posts rejected. This is intentional inactivity, not a broken detector. |
| Text submission → moderation → publication | public-api/src/index.ts; jobs/src/text-review-runtime.ts and index.ts; admin-api/src/index.ts moderation decision/outbox (657 onward) | sourceEventId/bodyHash/creation mode bind review to content revision. New seam tests reject stale edit/deletion/late deliveries. No real detector or end-to-end approval was run. |
| Publication → comments/replies | public-api/src/index.ts getComments (3441); pending comment-thread-reader.ts; Flutter comment_thread_screen.dart | Legacy flat reader wired; pending conversation reader only integrated by test transforms. F1. Relevance intentionally unavailable; no ranking activation proposed. |
| Published comment → notification | jobs/src/index.ts processNotificationSource (514); notification models; post_detail_screen.dart → comment_thread_screen.dart | Parent author/post author chosen from canonical event. Exact-target client lookup must agree with actual server reader. Source reviewed, full notification delivery unexecuted. |
| Publication → reputation | jobs/src/index.ts processReputationSource (707); packages/db/src/reputation.ts | Canonical outbox event supplies author/content/creation mode; source-event deduplication and subject transaction path exist. This review does not certify DB lock/migration behavior or award rules. |
| Reputation → rewards display | public-api/src/monthly-reputation-routes.ts and monthly-reputation-projection.ts; lib/state/providers/reward_providers.dart; rewards_dashboard.dart; monthly_reputation_widgets.dart | Pending/shadow/preparation values cannot confer top-level confirmed authority. 7 projection and 15 route tests pass with local fixtures. UI session revisions and local unlock separation source-reviewed only. |

## Execution ledger
Use [REGRESSION_PACK.md](REGRESSION_PACK.md) for commands and fixture scope. Counts are per command, not summed unique coverage:
- Standard upload pure functions: 7 pass.
- Main media Workerd suite: 29 TAP tests pass (one parent + 28 subtests).
- Same suite plus exact #1087 regression: 30 pass (one parent + 29 subtests); overlapping baseline intentionally not counted again.
- Monthly projection: initial 6 pass; after one new serialization regression, 7 pass.
- Monthly routes: 15 pass.
- Newly authored event/revision seams: 12 pass.
- Pending comment integration-hook suite: 2 pass, **transformed proposal only**.
- F1 observed behavior harness: 3 pass; expected contract mode: 3 fail against the not-yet-integrated future capability; not new defects.

Initial missing-sharp, missing pending test file in main, missing Flutter, and npm default-cache errors were setup limitations, not application failures. Dependency setup succeeded with a writable /tmp cache. No unrelated broad suite or database diagnostic was run. No known pre-existing failing test baseline was otherwise established.

## Matrix accounting
Of the 67 lane cases: 20 upload cases passed at their stated local handler/helper scope; 0 cases are confirmed failures of the currently supported contract; 47 are not fully executed (4 upload, 20 comments, 23 integration). All 47 were source-inspected. Integration I-13–I-15 additionally have passing projection-component evidence, but their UI actions were not executed, so they are not counted as whole-case passes. Comments C01/C08 are corroborated by the isolated CS harness, not complete journey tests. Separately, 12 coordinator S cases passed and 3 CS assertions failed against a proposed future contract. No test-runner skips were reported in executed selections. Source-inspected and not-run counts overlap by definition.

## Readiness and limitations
The review supports local correctness of the tested media integrity/cleanup and reward serialization paths. It does not certify a complete upload→detection→publication→comments→awards journey. Public image attachment and validated detector execution are intentionally withheld; preserve those gates. F1 blocks releasing the new threaded-comment experience until actual handlers are wired and verified.

Flutter/Dart/FVM were unavailable on PATH; no screenshots were captured or manufactured, no accessibility/responsive pass claimed, and historical repository screenshots are not presented as current evidence. PostgreSQL comment propagation, UI offline/resume/navigation, and real session transitions remain unexecuted. Local dependency download was the only new dependency setup; no provider/customer operations, credentials, permission changes or production loads occurred.

No operation was denied by approval review. Environment startup briefly returned no usable executor before availability propagated; the subsequent command succeeded. The unsupported coordinator/tier settings and default Luna tier uncertainty are documented in BASELINE.md.

## Handoff
[Remediation tickets](TICKETS.md), [matrix index](TEST_MATRIX.md), [regression commands](REGRESSION_PACK.md), and lane reports provide detail. The only policy-lane question returned to the parent is whether canonical suggestion-observation consumers from #1091 are intended to remain preparation-only; this review did not activate them or repeat monthly rule analysis.

The reusable assignment is [LYTHAUS_END_TO_END_RELIABILITY_PROMPT.md](../LYTHAUS_END_TO_END_RELIABILITY_PROMPT.md). [CURRENT_BRIEF_EXACT.md](CURRENT_BRIEF_EXACT.md) preserves the delegated input separately. Saving these files provides reusable workspace memory, not a claim of cross-session personal memory.
