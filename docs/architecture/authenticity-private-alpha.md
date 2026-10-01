# Lythaus private authenticity alpha

Lythaus private alpha composes OpenAI Safety, the frozen SAFE-A image detector, deterministic forensic/provenance evidence, the versioned Moondream observer and a bounded GPT-OSS explanation step inside the existing Flutter, Workers, Jobs and PostgreSQL path. It is author/admin-only, private, and non-enforcing. `PUBLIC_ENFORCEMENT_NOT_APPROVED` remains in force.

## Capability matrix

| Submission | OpenAI Safety | SAFE-A and forensics | Moondream | GPT-OSS explanation | Current state |
| --- | --- | --- | --- | --- | --- |
| Text | Text moderation when the approved key is configured | Unsupported; no qualified text-authorship detector | Not applicable | Explicit request may explain that text authorship is unavailable | Implemented, gated, not live-validated |
| Image | Image moderation before expensive work | Frozen SAFE-A plus deterministic evidence when the runtime and support policy allow it | Optional, separately gated visual observations | Explicit request on the persisted packet; one bounded attempt | Implemented, gated, not live-validated |
| Text + image | Independent text and image moderation | SAFE-A applies to the image; text authorship remains unavailable | Optional for the image only | Explains both completed and missing evidence | Implemented, gated, not live-validated |

Provider calls are never made merely to fill a diagram. Alpha admission, owner allowlisting, budget reservation, consent, Safety, input integrity and component flags are checked before each call. All switches are off by default.

## State contract

Each component records execution separately from interpretation. Execution is one of `not_requested`, `queued`, `running`, `completed`, `skipped`, `unsupported`, `failed` or `timed_out`; interpretation is one of `not_requested`, `available`, `inconclusive` or `unavailable`. A completed SAFE call can therefore yield an inconclusive finding when JPEG or source history is degraded. A missing provider is recorded as unavailable/failed rather than as a negative finding.

The only positive SAFE findings remain `SYNTHETIC_LIKE_EVIDENCE` and `NO_POSITIVE_SAFE_EVIDENCE`. The latter never implies human authorship. Raw scores, thresholds, packet internals, prompts and provider bodies are restricted to audited administrator diagnostics; the author DTO exposes execution, interpretation, limitations and version identities only.

## Request path

1. The authenticated Flutter alpha screen submits text, an image, or both with a separate processing consent and `trainingConsent: false`. Image bytes are uploaded to the existing quarantine bucket without client resizing or conversion.
2. The public API checks the private alpha switch, existing beta expiry/allowlist, content limits, SHA-256 and budget reservation. It creates a row in `moderation.authenticity_alpha`, an existing moderation case and a transactional outbox event. Image finalisation verifies size, MIME signature, hash, ownership and revision before moving bytes to the immutable original key.
3. Jobs verifies the outbox event, claims a five-minute lease under a single alpha runtime lock and initializes the component matrix. Text and image Safety steps use separate reuse keys. Safety is context only and can stop expensive image analysis.
4. An eligible image may run SAFE-A through the existing internal Container binding. The binding includes case, run, revision, input hash, frozen preprocessing and runtime identities; the response is validated before persistence. Deterministic forensic arithmetic and the canonical Evidence Packet preserve missingness and independent origin axes.
5. An explicitly requested observer step may call the existing Moondream adapter with a bounded visual-observation task. It cannot emit an authorship label, probability or generator identity. Its versioned observations remain separate evidence and do not repair unsupported SAFE interpretation.
6. A persisted result may receive one explicit GPT-OSS explanation request. A create-time request reserves advice separately and dispatches it through the transactional outbox after analysis; a later owner request uses the same measured budget boundary. Admin advice returns `alpha_owner_advice_required` because the admin role cannot create reservations. The packet is sanitized, canonical and reference-checked. The parser requires `INSUFFICIENT_EVIDENCE`, high uncertainty, review, no additional tests and no enforcement authority. SAFE is never rerun for advice.
7. The result is private and resumable. Review, feedback, cancellation and deletion are audited and fenced by owner, revision, lease and expiry. No alpha result enters public feeds, reputation, rewards or training data.

## Frozen identities and limitations

SAFE-A remains upstream commit `4e998724651b227def64f5be0cd60c0aa1552c35`, checkpoint SHA-256 `b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e`, preprocessing `SAFE_OFFICIAL_RGB_CENTER_CROP_256_DWT_CLASS1_V1`, threshold `0.5864923000335693`, comparison `>=`. The accepted Apache-2.0 licence-reliance record is [safe-a-v0.1-license-reliance.md](../models/safe-a-v0.1-license-reliance.md); checkpoint-scope uncertainty and unknown training-data provenance remain visible.

The 10 MiB byte and 16,777,216 decoded-pixel limits are enforced without resizing. JPEG interpretation is degraded and unknown-history PNG is inconclusive even if the raw model score crosses the threshold. Only separately documented lossless fixture hashes qualify for supported interpretation. Moondream is an observer, not an authenticity classifier. GPT-OSS is an explanation adviser, not an independent detector or policy authority. EF2 remains measurement-only and EF5 is unavailable.

## Implementation map

| Concern | Implementation |
| --- | --- |
| Alpha contract, packet compilation and author DTO | `packages/authenticity/src/private-alpha.ts` |
| OpenAI Safety, SAFE-A, observer and adviser orchestration | `apps/lythaus-jobs/src/authenticity-alpha.ts` |
| Authenticated create/upload/result/review/feedback/advice/delete | `apps/lythaus-public-api/src/authenticity-alpha.ts` |
| Audited administrator diagnostics, review and one-attempt advice | `apps/lythaus-admin-api/src/authenticity-alpha.ts` |
| Additive persistence and privacy location | `database/planetscale/migrations/0018_authenticity_private_alpha.sql`, `database/planetscale/migrations/0019_authenticity_alpha_hardening.sql` |
| Shared measured admission and retryable purge | `packages/db/src/budget.ts`, `packages/db/src/authenticity-alpha.ts` |
| Flutter author experience | `lib/features/authenticity/alpha_screen.dart`, `alpha_api.dart` |
| Existing app route | `/authenticity` |
| Protected frozen SAFE smoke preparation | `.github/workflows/authenticity-cpu-evaluation.yml`, `scripts/authenticity/materialize-private-evaluation.mjs`, `scripts/authenticity/sanitize-beta-cpu-receipt.mjs` |

Current engineering and operational evidence is recorded in [the 2026-10-01 execution report](../reports/authenticity-private-alpha-execution-2026-10-01.md). Real provider calls, a checkpoint-bearing image, deployment, ordinary-input evaluation and live app acceptance remain separately gated.
