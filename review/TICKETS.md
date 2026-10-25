# Prioritized remediation tickets

## F1 — P1 activation prerequisite: coordinate the intentionally staged comment hooks
Owner: existing parent/comments integration lane; Sol for shared Worker integration and Luna for focused regressions if assigned. Scope: #1090 only. This is an already documented coordination prerequisite, not a newly discovered implementation defect or duplicate ticket. docs/testing/comment-propagation-2026-10-23.md:71–99 deliberately leaves shared files untouched and documents client fallback.

Affected files: apps/lythaus-public-api/src/index.ts, comment-thread-reader.ts, comment-integration-hooks.mjs/comment-runtime-fixture.mjs; lib/features/feed/presentation/comment_thread_screen.dart. Check proposed create/revision, Jobs notification and Admin revision hooks for contract parity as part of the same existing lane; do not assume the read fix wires every mutation.

Reproduction: run `EXPECT_COMMENT_INTEGRATION=1 node --experimental-strip-types --test review/comment-seam.test.mjs`. All three future-capability assertions fail at exact a10c381 real getComments behavior. They do not assert the supported legacy contract and do not establish a new regression. The harness intentionally pins that SHA; after implementing a candidate, explicitly parameterize/read that candidate and keep the original fixture as a historical repro.

Invariant: conversation, sort, targetId, cursor and capability semantics requested by the shipped client must be interpreted by the real dispatched API. Exact-target retrieval must not silently return the ordinary page. Nested reply validation/counts must agree with capability advertising.

Minimal fix: integrate the already proposed reader and mutation contracts into actual dispatch, using existing policy/visibility gates. Do not change ranking, activate unrelated flags, or weaken publication restrictions. Replace or supplement transformed-fixture tests with tests bundling unchanged candidate runtime.

Dependencies: comments lane owner; synthetic local PostgreSQL17 schema/test fixture; Flutter for journey tests. No dependency on restore qualification or migration0021 diagnostics.

Acceptance:
- Real handler discriminates target/conversation/sort and returns scoped capabilities.
- Exact target beyond 25 roots is retrieved and revealed; unavailable/hidden parent remains denied.
- Newest/oldest cursors preserve order without skipped/duplicated items during concurrent insertion.
- Nested reply count and create/edit/delete behavior agree with actual dispatch.
- Old-account responses cannot affect new-account state.
- Workerd tests do not install missing runtime hooks in their loader; Flutter notification-target tests pass.

Rollout: hold threaded experience until actual server and client agree; preserve legacy flat-reader compatibility as required by existing clients. Roll back the client capability/entry point or the paired release if necessary, never claim unsupported capability. No schema rollout is authorized by this ticket.

## V1 — P2 policy clarification: forced reload before durable draft persistence
Owner: Luna. Affected tests: test/features/media/private_image_upload_test.dart; test/features/feed/presentation/comment_thread_screen_test.dart; post_comment_journey_test.dart; monthly_reputation_widgets_test.dart; responsive_product_test.dart.

The requested actual browser reload, enabled local-unlock provider isolation and affected-screen semantics now have execution evidence. EVIDENCE_LEDGER.md records exact commands and16 actual screenshots. I-08 remains qualified only because its original broad expectation includes blocking forced manual reload before persistence; no such guarantee was found. App-driven reload readiness and actual manual reload after durable journaling pass. Ask the product owner whether the broader guarantee is intended before adding a requirement or implementation ticket. This is a policy boundary, not a confirmed bug or unavailable-tool blocker. No implementation change is presently proposed.

Acceptance: report actual passed/failed/skipped counts, runtime versions, screenshots with viewport/state/build SHA, and fix only reproduced defects. Rollback: test-only additions can be reverted; no production changes.

## V2 — P2: preserve serialization and actual-runtime regressions
Owner: Luna. Safe independent test-only work: retain new monthly serialized fresh-account regression, event-revision seam tests, and the #1087 cleanup patch through their owning lanes. Keep F1 future-contract failure explicit until candidate runtime is integrated; do not describe it as a bug in the supported legacy behavior.

Acceptance: fresh pending/shadow projections expose no confirmed top-level level/source fields; stale content revisions cannot be processed as current; failed cancellation cleanup remains retryable and deletes only correct objects. Rollout/rollback: test-only, no feature activation; coordinate with existing PRs to avoid duplicate patches.

## True blockers versus intentional inactivity
- F1 blocks claiming/releasing #1090's threaded experience as operational.
- End-to-end public publishing readiness remains unproven and explicitly withheld; no real detector or real approval pipeline was exercised. Local Flutter, browser and PostgreSQL evidence was produced.
- Unsupported model speed is a capability limitation. The earlier missing-runtime/DB conclusion was corrected using cached tooling; it is no longer a blocker.
- No change to monthly award rules is proposed. Ask the separate owner only whether #1091 observation consumers should remain preparation-only; do not infer activation.
