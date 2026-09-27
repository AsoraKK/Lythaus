# Lythaus Authenticity v0.1 beta

Lythaus (formerly Asora) adds private image analysis to the existing Flutter app, public API, Jobs consumer and administrator app. This is an implementation candidate, not a deployed or qualified detector. Public authenticity enforcement remains unapproved.

## Index

- [Operations and activation](../runbooks/authenticity-v0.1-beta.md)
- [SAFE-A identity, rights and limitations](../models/safe-a-v0.1.md)
- [Frozen historical smoke selection](../models/safe-a-v0.1-smoke.json)
- [Machine-readable readiness](../releases/authenticity-v0.1-readiness.json)
- [Acceptance evidence](../releases/authenticity-v0.1-acceptance.md)

## Baseline and gaps

The integration branch starts at reviewed main `8e3b3ebad2f846e61db2bfe819376723da7e9863`, verified against origin on 2026-09-27. The user's original checkout was dirty and was preserved. Research PRs #848, #849 and #851 were open, without reviews, and not reachable from main when inspected. Their pinned implementations and historical results inform this candidate; extraction does not confer review approval.

Main already supplied the independent Safety route, EF1/EF2/EF4 arithmetic, Evidence Packet v1, WP005A compiler, WP005B routing architecture, provider-envelope adapters, authenticated uploads, transactional outbox, PostgreSQL through Hyperdrive, privacy workflows and Flutter design system. It did not supply a deployed SAFE image detector. The old proof container and generic image risk prompt do not meet this beta's acceptance target.

## Implemented path

The continuation of PR #862 reconciles these implementation differences without changing SAFE or its interpretation policy:

| Agreed behavior | Corrected implementation |
| --- | --- |
| Initially 40 million decoded pixels | Retain 16,777,216 (4096 × 4096) as the safer unmeasured resource ceiling. Reject larger input without resizing. No maximum-input measurement is claimed. Expansion needs a separately measured fit. |
| Peak below 75% of provisioned RAM | Exact integer comparison `4 × peakBytes < 3 × capacityBytes`; equality fails, no rounding. Whole-container peak must be measured after response construction. |
| Optional administrator advice | Authenticated/audited `POST /admin/authenticity/cases/{caseId}/advice` schedules the existing outbox only for eligible persisted evidence and an unused attempt. SAFE and Safety are not rerun. |
| Bound the entire runtime | Independent Linux supervisor kills the Node/Python process group and removes scratch on startup/request wall deadline or observed client abort, including blocked forensic computation. |
| Truthful author result | Allowlisted `detectorExecution` distinguishes completed inference, unusable output and no recorded completion, independently of an inconclusive interpretation. |
| Measured case admission | No fixed case-price default. Protected activation derives a case reservation from a measured envelope and current account meters; smoke and recurring case bounds remain separate. |

1. An authenticated, server-allowlisted author consents to processing without dataset consent. Flutter `file_selector` reads the selected bytes without compression, rotation or format conversion. A selected file is an accepted upload, not proof of camera originality.
2. The public API reserves storage and cost, creates an existing moderation case plus a beta extension, and issues a bounded quarantine upload. Completion validates owner, size, byte signature and SHA-256, copies to an immutable revision object, and records an outbox event transactionally.
3. The existing mixed Jobs consumer validates durable event identity, claims a bounded lease, verifies original ETag/hash, and runs independent OpenAI Safety through the existing approved adapter. A block or review stops expensive analysis.
4. A stable Container instance performs frozen SAFE-A CPU inference. The same decoded RGB bytes feed the existing TypeScript forensic arithmetic. A separate orientation-corrected, metadata-free PNG is private display media. No CDN derivative is detector input.
5. A canonical packet preserves missingness, contradictions, EF2 measurement-only status and independent camera/synthetic axes. The unchanged historical compiler is extracted into `epistemic-compiler.ts`; the Ledger remains diagnostic. A separately versioned conservative beta support policy and selective routing gate decide whether useful evidence supports advice.
6. SAFE output is durably stored before optional `GPT_OSS_BETA_ADVISOR`. Strict canonical parsing rejects unknown evidence references, tool calls, invalid envelopes and stronger authorship claims. Provider failure preserves the deterministic result. No output can publish content or change rewards/reputation.
7. The private app resumes persisted cases and supports review, feedback, cancellation and deletion. Administrator diagnostics and media require separate authorization and audit. Feedback is linked to the case and policy version; reviewer statements are neither ground truth nor training data.

## Source map

| Component | Source |
| --- | --- |
| Versioned contract, support policy, parser, author DTO | `packages/authenticity/src/beta.ts`, `beta-config.ts` |
| Compiler and routing core | `packages/authenticity/src/epistemic-compiler.ts`, `resolution-gate.ts` |
| Admission, immutable upload, private results | `apps/lythaus-public-api/src/authenticity-beta.ts` |
| Durable steps, Safety, inference, adviser | `apps/lythaus-jobs/src/authenticity-beta.ts` |
| Authenticated internal Container | `apps/lythaus-authenticity-runtime/` |
| Additive case/step/feedback storage and privacy functions | `database/planetscale/migrations/0017_authenticity_beta.sql` |
| Cancellation/deletion fencing and R2 purge | `packages/db/src/authenticity-beta.ts` |
| Flutter upload and result experience | `lib/features/authenticity/` |
| Administrator review | `apps/lythaus-admin-api/src/authenticity-beta.ts`, `apps/control-panel/src/pages/AuthenticityBeta.jsx` |
| API contract | `api/openapi/authenticity-beta.yaml` |
| PostgreSQL handler integration | `scripts/ci/validate-authenticity-beta-postgres17.mjs` |

## Boundaries and unavailable capabilities

EF1 reports file/provenance facts. C2PA presence is unverified without a working trust path. EF2 is measurement-only. EF3 is SAFE. EF4 uses existing compression/spectral/stability measurements, not a new classifier. EF5 is unavailable; the Observer is disabled, preserving its existing interface elsewhere. Safety, declarations, filenames and missingness cannot establish origin.

JPEG is degraded; PNG with unknown history remains unknown. Only separately authorized, documented lossless fixture hashes can enter the conservative supported category. Crossing the threshold and eligibility to interpret it are separate records. Camera evidence can coexist with synthetic content, including a photograph of generated material. The beta never certifies human authorship.

No new publication path exists. Beta cases do not enter public feeds. The local rewards sandbox only changes transient UI state. Runtime dependencies do not import work-package directories. The ordinary Workers do not bundle Torch or heavyweight image decoders.

## Execution and privacy

Cases expire after 15 minutes. Upload URLs expire after 10 minutes. Leases are five minutes; dispatch is single-instance and one inference at a time. Step uniqueness consumes ambiguous external attempts rather than assuming exactly-once delivery. Polling never initiates inference. A SAFE success is reusable only under its owner, input hash, checkpoint, preprocessing, runtime and analysis identity. Compiled/advisory records additionally bind their packet/policy configuration.

Deletion increments the revision and clears result/step/feedback payloads before purging originals and display media. Purge repeats through the signed-upload validity window plus five minutes; late callbacks cannot recreate a result. Existing retention rules and legal holds apply through narrowly scoped database functions. Originals, raw metadata, provider bodies and hidden reasoning never enter public DTOs, logs or CI artifacts.
