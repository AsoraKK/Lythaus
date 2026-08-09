# ADR-003: Lythaus Authenticity AI foundation

- Status: Accepted for Foundation Work Package 001; production enforcement is not approved
- Date: 2026-08-09
- Owners: Lythaus product and architecture owners
- Supersedes: active provider-coupled authenticity/moderation assumptions in earlier architecture records

## Decision

Lythaus Authenticity AI is a Lythaus-owned, provider-independent evidence and
recommendation system. It is not a single classifier and it does not receive
automatic publication or enforcement authority in this work package.

The system has three separate logical systems:

1. **Lythaus Safety** decides whether content violates safety policy.
2. **Lythaus Forensics** records evidence about acquisition, synthesis,
   transformations, provenance, and uncertainty.
3. **Lythaus Judge** reconciles evidence, contradictions, and policy context
   into a structured recommendation. The first reasoning candidate is
   `@cf/openai/gpt-oss-20b`; it is not an authorship detector or sole blocking
   authority.

Deterministic application code remains the only enforcement authority. During
Foundation 001, authenticity recommendations are shadow/review evidence only.
Numeric confidence and raw evidence are internal and must not be exposed as
public metadata.

## Runtime boundary

Cloudflare Workers are the runtime edge. Existing R2 quarantine storage,
Queues, Workers AI interfaces, and the existing jobs Worker are reused where
applicable. Hyperdrive connects Workers to the canonical PlanetScale
PostgreSQL database. The Container proof is attached to the existing jobs
Worker as a disabled, proof-only future capability; it is not deployed by this
package.

No new provider, database, permanent Cloudflare resource, GPU, paid model
training, or recurring resource over the approved US$10/month experimental
ceiling is permitted. Provider state and cost must be checked before any
future deployment or resource change.

## Processing modes

Contracts support `MODERATION_ONLY`, `AUTHENTICITY_ONLY`,
`MODERATION_THEN_AUTHENTICITY`, `AUTHENTICITY_THEN_MODERATION`, `PARALLEL`,
and `CUSTOM_POLICY`. Lythaus's default mode is:

`SUBMISSION -> PREFLIGHT -> CHEAP FORENSICS -> SAFETY MODERATION -> FAST AUTHENTICITY -> UNCERTAINTY ROUTER -> DEEP AUTHENTICITY -> GPT-OSS REASONING -> DETERMINISTIC POLICY -> RESULT / REVIEW / APPEAL`

Hashing, file inspection, provenance interfaces, duplicate detection, and
quarantine happen before safety moderation. An unequivocal independent safety
block enters quarantine/audit and stops expensive authenticity work. A
provider failure routes to review; it is not silently treated as an allow.

## Evidence architecture

Foundation evidence is versioned as `lythaus-authenticity-evidence-v1` and its
policy contract as `lythaus-authenticity-policy-v1`. The existing application
evaluation wrapper's `lythaus-authenticity-v2` version is a separate,
evaluation-only boundary. The five mandatory
families are:

- **EF1 — File / Provenance:** SHA-256, perceptual hash, MIME, dimensions,
  EXIF, XMP, C2PA interface, encoder information, compression, double
  compression indicators, metadata presence/absence, and screenshot indicators.
- **EF2 — Physical Acquisition:** camera-pipeline consistency, CFA/demosaicing,
  sensor/noise and optical characteristics, screen recapture, moire, and
  camera-evidence applicability.
- **EF3 — Generative Forensics:** synthetic features, texture statistics,
  latent-decoder signals, global structure, generator-family embeddings, and
  local synthetic regions.
- **EF4 — Spectral / Stability:** FFT magnitude and phase, DCT, wavelets,
  residuals, transformed-image scores, feature movement, mean, variance, and a
  robustness grade.
- **EF5 — Reconstruction / Local Manipulation:** inpainting, local-generation
  regions, reconstruction characteristics, mixed-origin images, manipulation
  masks, and regional inconsistency.

Missing metadata is evidence of absence, not proof of AI generation. The
dual-axis origin model keeps camera evidence independent from synthetic
evidence. It permits strong camera evidence and strong synthetic evidence at
the same time, for example a camera photograph of an AI-generated image shown
on a screen.

The deterministic v0 module produces a reusable `ForensicFeatureBundle` with
edge statistics and an image pyramid.
When a platform decoder is unavailable, it marks decoded-pixel features as
unavailable and returns only bounded container/byte features; it does not
pretend that raw bytes are camera evidence.

## Contracts and auditability

Foundation contracts cover `AuthenticityCase`, `AuthenticityEvidence`,
`ForensicFeatureBundle`, `ModelRun`, `TransformationRun`,
`ModerationDecision`, `AuthenticityRecommendation`, `PolicyDecision`,
`AppealEvidencePacket`, `ModelManifest`, and `EvaluationRun`.

Identifiers are UUID v7. Material decisions carry model version, policy
version, evidence schema version, timestamp, reason codes, applicability,
uncertainty, execution time, estimated cost, final classification, and appeal
outcome. Operational logs contain no PII.

Moderation is exposed through a provider-neutral `ModerationProvider` with
`analyseText`, `analyseImage`, and `analyseVideoFrame`, returning only
`ALLOW`, `REVIEW`, `BLOCK`, or `PROVIDER_FAILURE`. Moderation and authenticity
evidence remain separately auditable.

## Model lifecycle

Every model has a registry record and model card information: source and
licences, weight licence, commercial-use status, input/output contracts,
artifact SHA-256, evaluation status, deployment status, rollback version, and
approval timestamp. The initial registry entries are SAFE, GRIP CLIP CONTROL,
SPECTRAL PHASE EXPERIMENT, RECONSTRUCTION EXPERIMENT, LYTHAUS STUDENT V0,
GPT-OSS 20B REASONER, and VISUAL SEMANTIC MODEL.

Large artifacts are not downloaded by ordinary CI. A model must pass dataset
lineage review, independent modality-specific evaluation, calibration,
subgroup checks, transformation-stability checks, latency/memory/cost
measurement, shadow mode, rollback rehearsal, and appeal testing before any
future production authority is considered.

## Appeals and policy

The Judge can identify contradictions and recommend review, but it cannot
enforce policy. A deterministic policy decision records the final action and
keeps `authenticityEnforcementEnabled: false` for this package. Appeals receive
an auditable evidence packet, versioned policy context, and human adjudication.
Public labels remain categorical; internal scores are never public.

## Training-data governance

Normal Lythaus user content is not training material for Foundation 001. Large
datasets stay outside ordinary source control and are represented by external
or R2-backed manifests, content hashes, lineage, licence status, and approval
records. Student/distillation work may consume precomputed, approved teacher
outputs only after the dataset and licence gates pass.

## Image, video, and future modalities

Image intake quarantines before publication, verifies MIME/signatures and
dimensions, computes SHA-256/perceptual hashes, suppresses duplicate jobs, and
queues work. Video will use bounded frame sampling, temporal consistency,
audio/provenance tracks, and separate evidence records; it is not activated by
this package. The same evidence contracts can later carry audio, documents,
and other media without collapsing safety and authenticity.

## Commercial API boundary

No commercial billing or external customer access is implemented. Future API
adapters must select a processing mode and policy context explicitly, keep
moderation and authenticity outputs separate, redact internal confidence, and
apply the customer's deterministic policy outside provider taxonomy.

## Consequences

This foundation supports measurement, replacement of providers, reproducible
appeals, and cost hard stops. It deliberately leaves model accuracy,
production decoding infrastructure, live provider provisioning, and policy
approval as later gated work. A build passing the foundation tests is not a
production-authenticity GO.
