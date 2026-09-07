# ADR-003 — Lythaus Authenticity AI

**Status:** Accepted for Foundation Work Package 001; production enforcement is not approved  
**Original decision date:** 9 August 2026  
**Export consolidation date:** 7 September 2026  
**Owners:** Lythaus product and architecture owners  
**Supersedes:** active provider-coupled authenticity/moderation assumptions from the earlier Azure/Hive architecture

## 1. Decision

Lythaus Authenticity AI is a **Lythaus-owned, provider-independent evidence and recommendation system**. It is explicitly not a single “AI detector,” and it does not receive automatic publication or enforcement authority.

The system is split into three logical products:

1. **Lythaus Safety** — determines whether content violates harmful-content/moderation policy.
2. **Lythaus Forensics** — collects evidence about file provenance, physical acquisition, synthetic origin, transformations, local manipulation and uncertainty.
3. **Lythaus Judge** — reconciles structured evidence, contradictions, applicability and policy context into a structured recommendation. The first reasoning/orchestration candidate is `gpt-oss-20b` on Cloudflare Workers AI. It is not an authorship detector, cannot mutate content state, and cannot be the sole blocking authority.

Deterministic application policy remains the only enforcement authority.

## 2. Runtime boundary

Cloudflare-first is the operating constraint:

- Workers: API/auth/rate-limits/job creation/policy/customer metering.
- R2: quarantine originals, approved media, transforms/heatmaps and evidence artefacts.
- Queues: analysis, retries, deep escalation, appeals and DLQs.
- Workflows: long-running provider-neutral orchestration where appropriate.
- KV: small feature flags/kill switches, not case/evidence blobs.
- Containers: CPU-heavy deterministic/file/forensic work and compact models where justified.
- Workers AI: hosted open models such as the reasoning layer and future semantic vision models.
- AI Gateway: optional provider/model routing and observability.
- PlanetScale PostgreSQL through Hyperdrive: authoritative case/audit/policy data.
- GitHub: source and CI/CD authority.

No permanent external GPU or new provider may be introduced merely for convenience. External providers require documented justification.

## 3. Processing modes

The contracts support:

- `MODERATION_ONLY`
- `AUTHENTICITY_ONLY`
- `MODERATION_THEN_AUTHENTICITY`
- `AUTHENTICITY_THEN_MODERATION`
- `PARALLEL`
- `CUSTOM_POLICY`

The default Lythaus social-platform sequence is:

`SUBMISSION -> PREFLIGHT -> CHEAP FORENSICS -> SAFETY MODERATION -> FAST AUTHENTICITY -> UNCERTAINTY ROUTER -> DEEP AUTHENTICITY -> JUDGE -> DETERMINISTIC POLICY -> RESULT / REVIEW / APPEAL`

Cheap intake work occurs before moderation because hashes, MIME verification, safe decoding, duplicate suppression, provenance/C2PA and quarantine are useful regardless of final outcome. If safety moderation produces an unequivocal independent block, expensive authenticity work normally stops; minimal audit evidence is retained. Provider failure routes to review rather than silent allow.

## 4. Mandatory evidence families

### EF1 — File / provenance

Record where applicable:

- SHA-256 and perceptual hashes;
- MIME/signature, dimensions and decoding state;
- EXIF/XMP;
- C2PA/provenance interface;
- encoder/codec information;
- JPEG quantisation/compression/double-compression indicators;
- metadata presence/absence;
- screenshot indicators;
- transformation history.

**Missing metadata is not proof of AI generation.**

### EF2 — Physical acquisition

Independent evidence of physical/camera origin, including:

- camera-pipeline consistency;
- CFA/demosaicing evidence;
- sensor/noise characteristics;
- optical/lens consistency;
- ISP/processing coherence;
- screen recapture and moire indicators;
- applicability/quality flags.

### EF3 — Generative forensics

Evidence such as:

- synthetic texture/features;
- latent/decoder traces;
- long-range/global structure;
- generator-family embeddings;
- local synthetic regions;
- specialist classifier outputs.

### EF4 — Spectral / transformation stability

Evidence includes:

- FFT magnitude;
- FFT phase;
- DCT;
- wavelets;
- high-pass/noise residuals;
- transformation trajectories after JPEG/resize/crop/blur/sharpen/screenshot;
- feature/score movement, mean, variance and robustness grade.

### EF5 — Reconstruction / local manipulation

Evidence includes:

- inpainting/local generation;
- reconstruction discrepancies;
- manipulation masks/regions;
- mixed-origin evidence;
- boundary/regional inconsistency.

## 5. Dual-axis origin model

Never implement `REAL = 1 - AI`.

Camera-origin evidence and synthetic-origin evidence are independent. The system must permit, for example:

- camera high / synthetic low -> likely camera-native;
- camera low / synthetic high -> likely synthetic;
- camera high / synthetic high -> possible photographed/screen-recaptured synthetic media;
- camera low / synthetic low -> CGI, digital art, composite, screenshot or unresolved/unknown.

Low camera evidence alone must never be interpreted as AI generation.

## 6. Contracts and auditability

Core contracts include:

- `AuthenticityCase`
- `AuthenticityEvidence`
- `ForensicFeatureBundle`
- `ModelRun`
- `TransformationRun`
- `ModerationDecision`
- `AuthenticityRecommendation`
- `PolicyDecision`
- `AppealEvidencePacket`
- `ModelManifest`
- `EvaluationRun`

Canonical identifiers are UUID v7. Material decisions record model/version, policy version, evidence-schema version, timestamp, reason codes, applicability, uncertainty, execution time, estimated cost, final classification and appeal outcome. Operational logs must contain no PII.

## 7. Moderation boundary

Moderation is provider-neutral through a `ModerationProvider` interface with text/image/video-frame methods and canonical results:

- `ALLOW`
- `REVIEW`
- `BLOCK`
- `PROVIDER_FAILURE`

Authenticity and harmful-content moderation have separate taxonomies, evidence, policy, evaluation and appeals even when they share safe decoding, hashes, R2 objects or queue infrastructure.

## 8. Model lifecycle

Every model requires a registry/model card covering:

- source and code licence;
- weight/checkpoint licence;
- foundation-model licence;
- training dataset lineage;
- commercial-use status;
- distillation/derived-weight status;
- input/output contract;
- artefact SHA-256;
- evaluation/calibration status;
- deployment status;
- rollback version;
- approval timestamp;
- latency/memory/cost measurements.

Large model artefacts are never downloaded automatically by ordinary CI.

A blocking model requires independent evaluation, dataset lineage, subgroup/generalisation checks, transformation stability, calibration, shadow mode, rollback rehearsal and appeal testing before it may even be considered for enforcement authority.

## 9. Public labels and policy

Public labels:

- Human-authored
- AI-assisted
- AI-generated
- Under review

Internal confidence/evidence scores may support calibration and enforcement but are not public.

Current publication policy foundations:

- Human-authored text: allowed, Discovery eligible, reputation eligible.
- Human-authored images/video: allowed in policy but feature-gated until authenticity/safety gates pass.
- AI-assisted text <=249 user-perceived Unicode characters after normalisation/trim: allowed with label, Discovery eligible, no authorship reputation.
- AI-assisted text >=250 characters: blocked.
- AI-assisted images/video: blocked.
- AI-generated public content: blocked/excluded/no authorship reputation; may temporarily exist in private author-only feedback for review/edit/delete/appeal.
- Spellcheck, grammar correction, formatting, accessibility help and transcription of the user's own speech do not automatically imply AI assistance.

## 10. Appeals

Every decision must be reproducible and appealable. Judge output is advisory. Deterministic policy records the final action. Appeal packets preserve model/policy/evidence versions and human adjudication without exposing internal confidence publicly.

## 11. Training-data governance

- Ordinary Lythaus user uploads are not training data by default.
- Training sources must be Lythaus-owned, explicitly licensed/permissive, or explicitly opted-in/curated under approved terms.
- Large datasets remain outside ordinary Git history.
- Every materialised sample must have provenance, hash, rights class, retention decision and privacy review.
- Evaluation-only data cannot generate commercial teacher targets or distillation data unless later relicensed.
- The long-term moat is intended to include Lythaus-owned datasets, evaluation methodology, evidence schemas, calibration, policy and proprietary student weights.

## 12. Modalities

Images are the first active forensic-media focus. Video/audio remain research/shadow until separate gates pass. Future video design should use scene segmentation, selected keyframes, temporal consistency, audio/voice, lip-sync/crossmodal evidence and bounded processing rather than inspecting every frame.

## 13. Commercial API boundary

No external commercial authenticity API is production-approved yet. Future API modes must explicitly select processing mode and policy context, keep Safety and Forensics outputs separate, redact internal confidence, and allow customer policy to be applied deterministically outside provider taxonomy.

## 14. Consequences / NO-GO conditions

Passing foundation tests is not a production-authenticity GO. The following remain prohibited without explicit later approval:

- automatic authenticity blocking;
- normal-user-content training;
- unreviewed model downloads;
- external GPU provisioning;
- unbounded pay-as-you-go inference;
- new paid providers/resources beyond the approved cost ceiling;
- bypassing local thermal safeguards;
- restoring Azure or Hive.
