# ADR-003 — Lythaus Authenticity AI

Status: Accepted foundation. Production authenticity enforcement remains separately gated.

Original acceptance date: 2026-08-09

Canonical repository source: `docs/adr/ADR-003-lythaus-authenticity-ai.md`

WP001 merge: `94ea99fb4b58cfdbd6fbf440f853995e5994c65c`

## Decision

Lythaus Authenticity AI is a Lythaus-owned, provider-independent evidence and recommendation system. It is not a single classifier and no model receives automatic publication or enforcement authority.

The system has three logically separate layers:

1. **Lythaus Safety** — harmful-content/platform moderation.
2. **Lythaus Forensics** — acquisition, synthesis, provenance, transformations, local manipulation and uncertainty evidence.
3. **Lythaus Judge** — structured reconciliation of evidence, contradictions, applicability and policy context. The first reasoning candidate is `gpt-oss-20b` on Cloudflare Workers AI. It is not an authorship detector and is never the sole blocking authority.

Deterministic Lythaus application policy code remains the only final enforcement authority.

## Active architecture

Cloudflare-first:
- Workers: `lythaus-public-api`, `lythaus-admin-api`, `lythaus-jobs`.
- R2, Queues, Workflows, KV, Workers AI, AI Gateway and bounded Containers where approved.
- PlanetScale PostgreSQL authoritative through Hyperdrive.
- GitHub canonical source/CI/CD.
- One hosted startup environment until scale, revenue, regulation or risk justifies more.
- Deploy exact reviewed/merged `main` SHAs.

Azure and Hive are retired and must not be restored as active dependencies.

## Default Lythaus processing flow

`SUBMISSION -> DECLARATION -> PREFLIGHT -> CHEAP FORENSICS/PROVENANCE -> SAFETY MODERATION -> FAST AUTHENTICITY -> UNCERTAINTY ROUTER -> DEEP AUTHENTICITY -> JUDGE -> DETERMINISTIC POLICY -> RESULT/REVIEW/APPEAL`

File validation, hashing, provenance, duplicate/cache checks and quarantine happen before expensive analysis. An unequivocal safety block normally stops expensive authenticity work while preserving necessary audit evidence.

Contracts must also support external modes:
- `MODERATION_ONLY`
- `AUTHENTICITY_ONLY`
- `MODERATION_THEN_AUTHENTICITY`
- `AUTHENTICITY_THEN_MODERATION`
- `PARALLEL`
- `CUSTOM_POLICY`

## Five mandatory evidence families

### EF1 — File / Provenance
SHA-256, perceptual hash, MIME/signature, dimensions, EXIF, XMP, C2PA, encoding/codec, compression, double compression, JPEG quantisation, screenshot indicators and metadata presence/absence.

**Missing metadata is never proof of AI generation.**

### EF2 — Physical Acquisition
Camera-pipeline consistency, CFA/demosaicing, sensor/noise characteristics, optics/lens/ISP evidence, screen recapture, moire and applicability.

### EF3 — Generative Forensics
Synthetic textures/features, latent/decoder traces, global structural signals, specialist classifiers, generator-family embeddings and local synthetic regions.

### EF4 — Spectral / Stability
FFT magnitude and phase, DCT, wavelets, residuals, transformation trajectories, score/feature movement, variance and robustness/stability.

### EF5 — Reconstruction / Local Manipulation
Inpainting, local generation, reconstruction discrepancies, manipulation masks, mixed-origin evidence and regional inconsistency.

## Dual-axis origin model

Never model `REAL = 1 - AI`.

Camera-origin evidence and synthetic-origin evidence are independent.

- camera high / synthetic low: likely camera-native.
- camera low / synthetic high: likely synthetic.
- camera high / synthetic high: possible photographed/screen-recaptured synthetic or mixed origin.
- camera low / synthetic low: CGI, digital art, screenshot, scan, composite or unknown; abstain rather than accuse.

Low camera evidence is not AI evidence.

## Counterfactual forensic testing

Do not trust one score. Apply controlled transforms and measure evidence trajectories:
- JPEG95 / JPEG75;
- resize75 / resize50;
- crop;
- blur;
- sharpen;
- metadata removal;
- screenshot-style resampling;
- later, true screen recapture and approved local edits.

Strong stable evidence is more useful than strong fragile evidence. Instability contributes to uncertainty/abstention.

## Core contracts

Versioned records include:
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

Identifiers use UUID v7. Material decisions carry model/policy/evidence versions, timestamps, reason codes, applicability, uncertainty, runtime, estimated cost, final classification and appeal outcome. No PII in operational logs.

## Public authenticity policy

Public labels:
- Human-authored
- AI-assisted
- AI-generated
- Under review

No public numeric confidence scores.

Text policy:
- human-authored text: allowed, Discovery and authorship reputation eligible;
- AI-assisted text up to 249 user-perceived Unicode characters after normalisation/trim: allowed with label, Discovery eligible, no authorship reputation;
- AI-assisted text >=250 characters: blocked;
- AI-generated public content: blocked, excluded from Discovery/public profiles and no authorship reputation;
- spellcheck, grammar correction, formatting, accessibility help and transcription of the user's own speech do not automatically make content AI-assisted.

Image/video policy:
- human media are policy-allowed but feature-gated until authenticity/safety gates pass;
- AI-assisted images/video: blocked;
- AI-generated public images/video: blocked;
- screenshots, threads, segmentation or other evasion are assessed cumulatively.

## Moderation/authenticity separation

Moderation asks whether content is permitted. Authenticity asks how it was created/transformed. They may share safe decoding, resizing, hashes, storage/queues and selected reusable features, but must not collapse into one label, threshold or audit record.

## Model lifecycle

Any future blocking-capable model requires:
- model card;
- code/weight/foundation-model licence review;
- dataset lineage;
- independent Lythaus evaluation;
- calibration;
- subgroup checks;
- transformation stability;
- latency/memory/cost measurement;
- shadow mode;
- rollback rehearsal;
- appeal testing.

Human-content false-positive target: **<=1% overall**. Material subgroup/language rates **>2%** require mitigation/review.

## Model strategy

Approved research direction:
- SAFE — conditional teacher/baseline after rights clearance.
- GRIP CLIP — independent control/teacher after rights clearance.
- Lythaus-owned spectral/phase branch.
- Lythaus-owned deterministic camera branch.
- Reconstruction research including DIRE, LaRE2, ADRD and newer credible work.
- Semantic visual observer as structured evidence only.
- `gpt-oss-20b` as Judge/reasoner only.
- `gpt-oss-120b` deferred until evidence/cost justify it.
- Long-term proprietary Lythaus Student distilled from legally approved evidence/teachers/data.

Student v0 is intended to be a small CPU-friendly fusion model using deterministic EF1-EF5 features, camera/spectral features, rights-cleared teacher scores and human truth labels. Student v0.5 adds frozen embeddings; Student v1 evolves toward compact multi-branch RGB/residual/spectral/camera/local/global architecture with explicit uncertainty.

## Training-data governance

Normal Lythaus user uploads are not training material by default.

Commercial training should use:
- Lythaus-owned/commissioned data;
- expressly commercially licensed data;
- permissive data whose terms cover the intended use;
- Lythaus-generated transformations;
- teacher outputs only where distillation rights are established.

Large media/model artefacts stay outside ordinary Git and must carry provenance, source/version, SHA-256, rights and retention records.

## Appeals

Authenticity evidence must be reviewable and versioned. Soft-launch appeals target five independent reviewers, Level 5 participation where available, >=60% weighted majority and trained Editorial/journalist adjudicator confirmation; higher-risk overrides may require two adjudicators. Random assignment, recusal, anti-brigading and immutable audit records are required.

## Commercial boundary

The future external product should be positioned as visual-origin/forensic-evidence infrastructure, not a simplistic AI-probability API. Structured outputs may include camera evidence, synthetic evidence, transformations, suspicious regions, robustness, supporting/contradictory evidence, alternatives, uncertainty and a deterministic policy recommendation.

## Cost and no-go boundaries

Approved R&D ceiling: US$10/month unless separately approved.

Codex/automation may not, without explicit human approval:
- create a new paid provider;
- provision an external GPU;
- change Cloudflare plan/billing;
- accept custom-model commercial terms;
- enable unbounded inference;
- enable authenticity enforcement;
- train on user content;
- run unbounded local training.

A green build is not a production-authenticity GO.
