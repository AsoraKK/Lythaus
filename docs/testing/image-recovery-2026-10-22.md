# Private image recovery — 22 October 2026

This is source and synthetic test evidence. UX-10, PUB-12–14 and their security
dependencies remain **OPEN**. Upload, processing, detection, attachment,
publication and owner activation are distinct outcomes.

## Candidate and provenance

- Published base: `d9d50807dd36664cda61b137a25aba8f31017b6f` (PR1073),
  freshly fetched before implementation. PR1072 UI and PR1070 media retry/quota
  fixes are already incorporated and were retained.
- Implementation candidate: `0240c59e9a5b049e47261f38a881d45cf4492eb3`;
  branch `codex/image-recovery-20261022-astra`.
- Reviewed browser teardown correction: `097281a2ddd784bf60e1d02ca9d01c5ce9fb83a4`.
  Its only change awaits context closure before browser closure. Client source
  is byte-identical to the implementation commit; this report is a later
  documentation-only addition.
- Clean recovery worktree: `/workspace/lythaus-image-recovery-20261022-astra`.
  The saved `/workspace/Lythaus` checkout at `76454aba` was preserved.
- This is a clean implementation of missing integration against published
  main. **No unpublished workspace was recovered** from stalled task
  `01a15da4-e108-70ae-9205-95ddf8a64010`, turn
  `01a16279-e978-74eb-bf2f-9e52eb5fab76`. No task-history tool was available.
  Its reported unexecuted test counts are not evidence for this candidate.
- Fresh remote checks before and during work found no new overlapping image
  branch/PR. Existing attachment PR1060 and text PR1063 were not merged or copied.
  The final publication check and PR identity belong in the handoff.

The original Library document `libfile_c739e80137688191ba85c00a400627d6`,
“Lythaus Real World Test and Fix Plan 2026-10-12.docx”, was read successfully
(771 extracted lines, 16 pages). Its preserved criteria remain in the
[forty-package ledger](forty-package-acceptance-ledger-2026-10-22.md).

## Implemented behavior

- A false-by-default client flag prepares PNG/JPEG selection, bounded reading,
  private byte upload, same-attempt retry and bounded foreground status polling.
  Selection stays in memory, is scoped to the current account/session, blocks
  text submission and Close/Back, and must be explicitly cleared. Clearing is
  not represented as deleting an uploaded object.
- `GET /media/uploads/{uploadSessionId}` requires the existing server media
  gate and active authenticated owner. It conceals foreign/nonstandard/invalid
  sessions and returns `private, no-store`. It exposes no object key, serving
  URL, filename, provider output or claimed detector score.
- Storage `approved` means the integrity transform completed. The client status
  is `review`, with safety and authenticity both `not_run`, publication false.
  This is not evidence that a detector inspected the pixels.
- Ordinary post creation rejects unsupported fields/image intent before quota,
  post or outbox effects. The client serializer and composer also prevent
  silently dropping image attachments into a text-only submission.
- Existing private SAFE-A beta cache reuse/presentation now requires current
  source-history approval, exact input/case/revision/run identity, current
  runtime/preprocessing/protocol and coherent result/policy versions. Withdrawal
  suppresses owner/admin findings and prevents stale retry/adviser settlement.
  Stored history is preserved; this adds no inference or qualification.
- OpenAPI, bundled schema and generated Dart API/model files include the private
  status contract. Required existing CI includes the new cache regression suite.
  Homepage product files, runtime configuration and activation flags are unchanged.

## Acceptance mapping

| Package | Narrow implemented/tested scope | Still unproven |
| --- | --- | --- |
| UX-10 | Synthetic selected-image → private upload → retry/status/error UI; no post while selected | Real client/storage/review/attachment/feed chain and owner acceptance |
| PUB-12 | Existing owner-bound byte storage retained; new owner-only status and rejected attachment intent | Approved attachment schema/lifecycle/retention and actual least-privilege hosted roles |
| PUB-13 | Honest not-run presentation; withdrawal invalidates stale detector evidence | Authorized real inference, independent safety coverage, labelled-data/calibration/holdout qualification |
| PUB-14 | Disabled defaults, no public serving result or publication path; text-only recovery after clearing | Real serving/cache/version/retention races and separate activation |
| SEC-01/04/05/06/07/08/12 | Synthetic ownership, no-store, exact bytes, retries, stale-session disposal, no unauthorized post/outbox, observable failures | Deployed account isolation, actual providers/roles/queues and exact-release acceptance |

## Executed checks

The current run's secret-free logs are retained under
`/workspace/lythaus-image-recovery-evidence/`. Node 22.23.3, Flutter 3.41.1 /
Dart 3.11.0 and PostgreSQL 17.11 were used. Dependency package links were checked
to resolve to this recovery worktree; a provisional run before that correction
was not counted.

| Check | Observed result | Evidence limit |
| --- | --- | --- |
| Media integrity/status/unsupported-post tests | 41 passed, 0 failed/skipped | Runner total includes parent tests: seven pure tests, 28 Workerd cases plus parent, four PG17 cases plus parent |
| SAFE beta/cache and post policy | 30 passed, 0 failed/skipped | Mocked private evidence and provider transport; no external AI calls |
| Flutter media/composer/model/navigation | 184 passed, 0 failed/skipped | Synthetic repository/API/widget fixtures |
| Focused architecture | 56 passed, 0 failed/skipped | Source/runtime architecture contracts |
| OpenAPI contract | 77 passed, 17 skipped | External/live cases deliberately skipped; this count is unrelated to the stalled task's reported media count |
| Generated Dart SDK | 1,587 passed, plus four generator regression tests | Many generated smoke/property tests; not 1,587 acceptance cases. Canonical analyzer reports 75 existing generated warnings |
| Homepage freeze | 42 passed, 0 failed/skipped | Exact independently reviewed backend blob allocations and negative controls; homepage source unchanged |
| Native typecheck, targeted Flutter analysis, OpenAPI lint/examples, immutable workflow pins, whitespace | Passed | OpenAPI retains its two existing warnings |

The PG17 run used a new loopback-only disposable container/database and a minimal
synthetic schema inside a rolled-back transaction. No grants, role changes,
canonical migration loader or restore ran. It proves actual PostgreSQL query
semantics, **not canonical runtime-role permissions**. The canonical media suite
requires grants and remains unexecuted locally under this task's restriction.
The earlier stopped database/container was not touched.
After the tests, a read-only query confirmed zero remaining `identity`/`media`
fixture schemas. Only the newly owned recovery container was stopped and removed.

Reproduction uses the existing repo toolchain. Run media unit/Workerd tests with
`node --experimental-strip-types --test packages/media/tests/standard-upload.test.mjs packages/media/tests/standard-upload.workerd.mjs`.
Run the narrow PG17 file separately with `LYTHAUS_MEDIA_STATUS_PG17_URL` pointing
only to a fresh, owned loopback `lythaus_image_recovery_test` database; it refuses
other target names/hosts and does not invoke the canonical migration loader.
Run `scripts/tests/image-upload-recovery.browser.mjs` against a locally compiled
release via `IMAGE_WEB_ARTIFACT_DIR` and retain receipts via `IMAGE_QA_DIR`.
Use `PRIVATE_IMAGE_UPLOADS_ENABLED=true` only when building the enabled synthetic
artifact; omit it for the ordinary build and run that matrix with
`IMAGE_QA_DISABLED=1`. Browser transport remains isolated by the test fixture.

Independent review inspected actual code/tests and independently executed the
same final source's 30 Node and 15 focused Flutter tests. Verdict on full
implementation SHA `0240c59e9a5b049e47261f38a881d45cf4492eb3`: no remaining
P0/P1/P2 findings. The independent reviewer made no source edits.

## Rendered candidate evidence

**Final result: 12 passed, 0 failed/cancelled/skipped; 32 captures.** Chromium
and WebKit each exercised 390px light and 1440px dark configurations. Eight
enabled-candidate cases cover a lost finalisation acknowledgement and a denied
owner-status read; four default-build cases verify no photo picker or media
request. All twelve receipts are complete with zero product runtime errors and
zero unhandled API paths. A successful retry creates one upload session, uploads
the exact generated PNG once, reuses the same finalisation key and never calls
post creation. Clearing restores the text-only control. Desktop private-result
and mobile denied-status captures were visually inspected.

These are the actual compiled release app with **scripted synthetic API
responses**, generated two-by-two-pixel fixtures and a loopback TLS proxy that
never forwards to hosted services. No production identity, upload, object,
detector execution, physical device or real screen reader is represented.
The true client flag exists only in the local enabled test artifact; the
ordinary build remains false by default.

Both artifacts were built from `0240c59e9a5b049e47261f38a881d45cf4492eb3`.
The successful harness ran at `097281a2ddd784bf60e1d02ca9d01c5ce9fb83a4`;
`git diff 0240c59e..097281a -- lib assets web pubspec.yaml pubspec.lock .fvmrc`
is empty. Receipts preserve that history rather than relabelling an old build.
They also bind every tracked/untracked client source path through a manifest.

| SHA-256 binding | Value |
| --- | --- |
| Enabled `main.dart.js` | `21a6c017709d3c4ccd3eab89012ffc7a57e9109d54007a7e4be423da7bcb37a2` |
| Default-disabled `main.dart.js` | `7b0ba4cfade8bc2090d55de5eb71851e8c08539ed1c7a2ba0e60a725e2f2ecc3` |
| Executed browser harness | `c23643a89883dc5aafc55f8d1a403ab0a804cccc047e973890bfa2364caa5c43` |
| Client source manifest | `eb289739a5a752efb1c5f2d8b46e580897b6f9fd8bf615a66507d7c8569ebb34` |

Failed attempts remain retained separately. Initial Chromium passes/failures
were 0/4 (immediate Post-state assertion) and 2/2 (matching the previous status
error before the retry response). The harness now waits for the actual control
transition and new response. The next enabled matrix was 7 passed/1 failed:
all functional assertions completed, but an uncaught `ECONNRESET` occurred during
fixture teardown. Independent review recommended the documented Playwright
context-before-browser close order; no error suppression was added. The final
8/8 enabled and 4/4 disabled rerun passed. The precise original socket emitter
was not established; the earlier transport failure remains a failure.
Early client tests also exposed two fixture setup errors (12 passed/2 failed),
corrected before the 184-test run. The initial OpenAPI check exposed stale route
count/inventory expectations, corrected to include the new GET before its
77-pass/17-skip result. None of these superseded failures is current acceptance.

## Live blockers and release state

1. SAFE-A has runtime source, not qualified deployed image detection evidence.
   The earlier evaluation authorization expired. No new provider was selected,
   no external model was called, and no historical score was promoted to human
   authorship/safety/publication authority.
2. A current finite evaluation envelope must authorize exact model/checkpoint,
   source/runtime/preprocessing identity, source-history rights, permitted data
   transmission, private evidence retention, calls/retries, window and cost.
   Rights-cleared labelled data, independent safety truth, frozen family-separated
   calibration/holdout splits and accepted error/coverage limits remain missing.
3. Parent must reconcile hosted migration and actual runtime role permissions,
   then authorize bounded hosted fixture uploads and verify R2/Images/Queue/
   Hyperdrive behavior, cleanup/deletion/holds/export and physical-storage cost.
   The proposed column grants were not executed by this task.
4. The post/asset relationship, attachment capabilities, supported format/quota
   policy, original/derivative retention and private serving acceptance remain
   incomplete. This PR supplies a private upload workflow and explicit blocks;
   it does not complete photo publication or the end-to-end feed journey.
5. Merge is held for parent reconciliation with any recovered stalled-task
   output and exact candidate review. Exact-head required CI, merge, deployment,
   actual acceptance and separate owner activation remain distinct gates.

Implemented and locally tested does not mean merged, deployed or qualified.
All runtime media, detector enforcement and public-posting gates remain disabled.
No production database, content, storage, credential, billing or deployment
mutation occurred.
