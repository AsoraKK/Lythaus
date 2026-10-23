# Image detector evaluation and owner acceptance proposal

Status: **PROPOSED, NOT AUTHORIZED OR EXECUTED**. This is the next bounded
evaluation step after PR1086's independently reviewed readiness plumbing.
It is not a detector activation or a new model research/training project.

## What can actually run next

The smallest real-classifier step is the existing, one-shot attended CPU parity
workflow `.github/workflows/authenticity-cpu-evaluation.yml`, on an exact reviewed
post-merge main SHA. It loads the existing frozen SAFE-A checkpoint in a private,
loopback-only container on the existing standard GitHub runner. It does not need
a new Cloudflare service, production database write, hosted upload or user photo.
Do not dispatch it under the expired September approval.

SAFE-A licence reliance was accepted by the owner on 28 September for bounded
private evaluation and intended private beta hosting, subject to the recorded
Apache-2.0 obligations. That does not expire merely because execution approval
expired. Checkpoint scope uncertainty and unknown training-data provenance remain
recorded. Fixture rights, actual runtime identity, usage, retention, hosting and
activation are separate gates. See [the reliance record](../models/safe-a-v0.1-license-reliance.md).

No replacement qualified detector was found. The current WP007C record rejects
all EF3 candidates, WP007D's route was not materialisable, and WP007E rejects the
local decoder proxy. Do not rerun those experiments, unseal holdouts, retrain,
recalibrate or select a new threshold to make this integration pass.

## Minimal renewed approval: A, real SAFE-A execution

| Item | Exact proposed scope |
| --- | --- |
| Source | Exact reviewed post-merge main SHA, bound into approval and built image; no mutable branch or old release substitution |
| Runtime/provider | Existing standard GitHub-hosted Ubuntu 24.04 runner; existing pinned evaluation Dockerfile; local loopback `/infer` only; no Cloudflare container creation/deployment |
| Model | SAFE-A; upstream `4e998724651b227def64f5be0cd60c0aa1552c35`; checkpoint SHA-256 `b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e` |
| Preprocessing | `SAFE_OFFICIAL_RGB_CENTER_CROP_256_DWT_CLASS1_V1`; approval must supply the current preprocessing hash, runtime evidence hash and immutable runtime digest |
| Inputs | Exactly `docs/models/safe-a-v0.1-smoke.json`, SHA-256 `ca033720b795f700f7985d431fc807e749b5fda1c0cbf47637561e3042b89132`: eight already-used originals plus its eight prescribed descendants; no new dataset selection |
| Attempts | At most 16 SAFE attempts, batch one, one intra/inter-op thread, 30 active minutes; one authorization consumption; no automatic retry or rerun after ambiguous dispatch |
| Request limits | At most 10 MiB and 16,777,216 decoded pixels; single-frame RGB PNG/JPEG; existing decode/inference/supervisor bounds remain unchanged |
| External image recipients | None. Historical pixels go only to the private loopback evaluation container; no OpenAI, Workers AI, public endpoint, public Git or image artifact upload |
| Cost ceiling requested | USD 0.50 total incremental run cost, with fresh usage/allowance evidence proving the existing standard runner fits; stop before execution if that bound or existing allowance cannot be established; no purchase, new resource or credential |
| Window | One attended run, approval expires within 24 hours of issuance; existing workflow timeout remains 45 minutes |
| Working-copy retention | Read-only originals in the private bundle/runtime mount; remove ephemeral images, weights, mounts and raw receipts in existing always-cleanup at run end, at most the 45-minute workflow lifetime; do not delete the owner's source bundle |
| Receipt retention proposed | Sanitized hash/status/performance receipt and consumed marker only, no image pixels, paths, weights, credentials or raw provider body; 48 hours in an explicitly approved evidence destination. Existing sanitized-artifact retention must be verified or bounded before dispatch; do not assume the workflow's repository default is 48 hours |

The exact originals and hashes are already frozen in the referenced manifest:
`CSAFE_WP006E_iPhone11_1_02`, `CSAFE_WP006E_iPhone11_1_03`, `PNGN_CHART_03`,
`PNGN_CHART_05`, `WP007H_BLIP3o-8B_01c5d6b14456`,
`WP007H_Janus-Pro-7B_05830b238f54`, `Seedream-4__R-GR-001-3`, and
`imagen-4__R-GR-001-0`. They are historical integration parity fixtures, not fresh
calibration or independent holdout evidence. **No current private mapping or
transmission/retention attestation for these files was available in this task.**
Their names do not establish rights or absence of sensitive content. Each file
needs the existing validator's explicit nonsealed engineering-use authorization,
rights evidence hash and exact byte match before local use. Nothing authorizes
sending these historical photos to an external image provider.

The existing runner requires the protected bundle URL/token and existing dispatch
secret. Availability was not tested by reading their values. Missing setup is a
blocker; this proposal authorizes no creation or replacement of credentials.
The retention periods above are proposed limits, not measured deletion evidence.
Timeout/cancellation cleanup and artifact expiry must be observed; missing or
failed cleanup remains unresolved and cannot be reported as successful deletion.

## Measurements and acceptance for A

Preflight must accept exact source/model/runtime/preprocessing identity, current
rights/fixture mapping, one-use authority, permitted retention and cost evidence
before loading the checkpoint. Record original and descendant identity, model
status, finite score or explicit null, cold/warm/end-to-end timing, decode and
inference timing, image bytes, and external whole-container post-response peak.
Keep billed cost unknown until actual billing evidence is available.

For the eight originals, require usable finite outputs and parity with each
frozen historical score within the **existing absolute 1e-6 ceiling**. A mismatch
stops the run; do not widen tolerance or tune the historical threshold
`0.5864923000335693`. For degraded/JPEG and unknown-history descendants, preserve
abstention/inconclusive interpretation even above threshold. Any unavailable,
invalid or ambiguous provider outcome consumes its attempt and stops further
work; no fallback to zero, human authorship, allow, enforcement or rewards.

Passing A demonstrates that the real checkpoint and runtime reproduce their
frozen specialist behavior. It does **not** establish modern generator coverage,
safe false-positive limits or population accuracy. Historical evidence includes
155/160 detections in one selected-family panel, 79/120 in a later panel, and
Q95 stress of 0/40 detections with 8/60 negative false positives. Those limits
are recorded in [the model card](../models/safe-a-v0.1.md); no panel is a general
accuracy claim. Low SAFE is not human evidence. Full maximum-input memory
acceptance is still separate: the frozen smoke must not be relabelled a measured
16,777,216-pixel case. Existing release checks require that actual measurement
and `4 * peakBytes < 3 * capacityBytes`; this proposal changes neither condition.

## Separate optional approval B: current external adapter acceptance

This is not included implicitly in A. It requires its own exact-source,
no-replay attempt record, current account/credential availability and bounded
transport driver review before any call; the new Workerd fixture has **no live
mode**. The text-only posting-feedback collector must not be repurposed or
unlocked to send images.

- **OpenAI safety:** at most two `POST /v1/moderations` requests to existing
  `omni-moderation-latest`, with no retry. Send only the two non-sensitive,
  programmatically generated 256×256 RGB solid-color fixtures used by the new
  integration test: original PNG (1,409 bytes, SHA-256
  `0a1276d92bcc7f9182670a486fc532d847387ef774f31d2d0eefd084a017bdf4`) and its
  JPEG-Q85 descendant (652 bytes, SHA-256
  `4aac89d311b45b2293ab74b44008c9c66cf1f9306f4595c9b845df1def26beeb`).
  They contain no people, location, text or user content and are not camera or
  human-authorship examples. These observed bytes use sharp 0.35.4; regenerate
  and compare hashes before approval and do not silently substitute bytes from
  a different image toolchain.
- **Workers AI adviser:** at most one call to existing
  `@cf/openai/gpt-oss-20b` through the existing approved AI Gateway, only if the
  predeclared BLIP3o parity case has a currently supported positive specialist
  packet. Send only the existing sanitized evidence packet, at most 16,000
  bytes and 2,400 output tokens. No image, EXIF, name, filename, key, URL, raw
  score, tools, observer call, alternate model, autonomous loop or retry.
- **Ceiling:** request at most USD 0.50 incremental spend for B, separately
  authorized from A, with current account allowance evidence before dispatch.
  OpenAI documents moderation as free; Cloudflare publishes USD 0.20/M input
  and USD 0.30/M output tokens for this adviser. Even a conservative full
  128,000-input-token plus 2,400-output-token envelope is USD 0.02632 for model
  tokens, not a bill or a complete platform-cost guarantee. Do not infer current
  allowance, gateway/resource costs or paid enrollment from that estimate.
- **Retention:** fixture generation and bytes remain private and ephemeral;
  no training/calibration use or public artifacts. Capture sanitized model/status,
  applied modality, category flags/scores, input/response hashes, attempts,
  timings and usage only in the approved 48-hour receipt destination. Require
  actual Gateway logging/cache settings to match the private-data approval;
  code's `collectLog: false` and `skipCache: true` are not live-provider proof.

For B, require exact requested/returned model identity and coherent schema,
bounded values and image-applied safety categories. A flag on these benign
fixtures remains review and is recorded as unexpected behavior, never converted
into a passing safety result. Provider failure/model drift/partial evidence
abstains. The adviser must retain INSUFFICIENT_EVIDENCE, review required, high
uncertainty, known evidence references and no enforcement authority; malformed or
overreaching advice is consumed and discarded. Two safe fixtures cannot establish
safety coverage, and safety scores cannot establish authorship.

Current primary pricing/privacy references, checked 23 October 2026:
[OpenAI moderation](https://developers.openai.com/api/docs/guides/moderation),
[OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data),
[Workers AI adviser pricing](https://developers.cloudflare.com/workers-ai/models/gpt-oss-20b/),
[Workers AI data usage](https://developers.cloudflare.com/workers-ai/platform/data-usage/).
The OpenAI data-controls table lists no abuse-monitoring or application-state
retention for `/v1/moderations`, subject to the documented image/legal exceptions.
Workers AI's standard stateless processing commitments do not establish the
retention configuration of Lythaus's Gateway or other storage.

## Hosted permission and original-retention blockers

The canonical PG17 suite still denies Jobs ownership insertion. Successful
settlement fixtures add and later revoke this exact local-only prerequisite:

```sql
GRANT INSERT (object_id, owner_id) ON media.ownership TO <verified_mapped_jobs_role>;
```

The standard API rejection path separately needs
`GRANT UPDATE (bytes_rejected) ON media.storage_ledger TO <verified_mapped_runtime_role>`.
These remain **proposals**, as recorded in
`database/planetscale/proposals/media_standard_upload_privileges.patch.proposal`.
No current approval or hosted effective-privilege receipt for these grants was
found. The recently bounded product grant executor covers reward redemptions and
editorial publications, not these media privileges. Do not infer authorization
from it. Resolve the actual physical Jobs/runtime roles from their exact existing
Hyperdrive origin; do not substitute repository logical role names, the app role
for Jobs, grant all table access, recreate credentials, or execute this SQL here.
Fresh read-only effective privilege/schema evidence and a separate human grant
decision are required. The new evidence export/purge helpers use existing logical
Jobs SELECT/UPDATE grants, but their hosted effectiveness is also unproven.

**Retention choice proposed:** keep the frozen evaluation originals read-only in
the ephemeral local run described in A. Leave ordinary upload cleanup unchanged.
Standard processing deletes original pixels after settlement; its WebP derivative
must never be substituted for SAFE-A's original lossless input. A later owner
app test should use the existing consented private-beta original path, with an
explicit separately approved original-retention/deletion policy and quota, not
extend ordinary-upload retention by implication. The beta's 15-minute processing
deadline is not a proven storage TTL: `expireBetaWork` changes state, whereas
`purgeBetaMedia` requires a separate tombstone. Do not promise automatic timed
pixel deletion until that path is implemented/accepted for the selected scope.

PR1086 privacy tests prove owner-scoped export/purge helpers and transaction use;
they do not prove concurrent legal-hold races or complete deployed privacy
Workflows. Those remain explicit hosted acceptance gates.

## Executable provider-free evidence

`apps/lythaus-jobs/tests/image-detection-acceptance.workerd.mjs` executes the real
`processBetaEvent`, OpenAI image adapter, existing SAFE response validator,
forensic/evidence compiler, strict adviser parser, persistence calls and private
owner projection against real Workerd and private local R2. Database responses
and all three transports are scripted; no weights load or inference occurs.
The receipt is labelled `SYNTHETIC_TRANSPORT_TEST_ONLY`, with zero actual
provider requests. This proves orchestration and failure handling, not actual
SQL permissions, provider behavior or detector accuracy. It is imported by the
existing required standard-upload Workerd suite without changing a CI gate.

The suite covers the successful private specialist/adviser chain, terminal replay,
low-score abstention, JPEG/unknown-history withdrawal, safety flags/outages,
disabled admission, forged event, missing budget, changed original bytes,
forged/unavailable specialist output, consumed attempts, late rights/history
withdrawal, stale revisions and discarded adviser overreach. Raw evidence never
appears in the private owner DTO.

```sh
node --experimental-strip-types --test apps/lythaus-jobs/tests/image-detection-acceptance.workerd.mjs
node --experimental-strip-types --test --test-concurrency=1 packages/media/tests/standard-upload.test.mjs packages/media/tests/standard-upload.workerd.mjs
```

The combined local run passes 54 tests, zero failed/skipped (including parent
tests); the new detector chain contributes nine cases plus its parent. No runtime
source, flag, migration, grant, provider resource or production data changes.
Owner-testable now: the local synthetic chain and private readiness evidence.
Owner-testable after approval A: real checkpoint parity and measured bounded
specialist execution. An owner-facing live private app still needs separately
accepted hosting, source retention, safety/adviser transport, account isolation,
quota/cleanup/hold behavior and exact-release validation. Public authorship
enforcement additionally requires independently reviewed qualification and
explicit activation; a general reasoner or a safety score cannot supply it.
