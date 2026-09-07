# Current Model Registry — Lythaus Forensics

Bootstrap date: 2026-09-07

Code registry: `packages/authenticity/src/model-registry.ts`

Rights registry: `ml/models/MODEL_RIGHTS_REGISTRY.md` and `model-rights-registry.json`

Artifact policy: `NO_AUTOMATIC_LARGE_MODEL_DOWNLOAD_IN_CI`.

## Governing rule

Code licence, model/checkpoint weights, foundation encoder, dependencies, training data, commercial use, distillation/derived weights and redistribution are separate approval fields.

An Apache-2.0 repository does not by itself clear the included checkpoint, upstream encoder or training data.

Unknown rights => do not download/train for commercial-model use.

No model currently has production authenticity enforcement authority.

## Lythaus-owned active baselines

### SPECTRAL_PHASE_EXPERIMENT
Role: `BASELINE`.

Version: v1.

Ownership: Lythaus-owned deterministic code; no external weights.

CPU: feasible.

GPU: none.

Evidence:
- multi-scale FFT magnitude;
- multi-scale FFT phase;
- DCT;
- wavelets;
- high-pass residual;
- compression/JPEG context.

Strengths:
- deterministic;
- auditable;
- provider independent;
- CPU friendly;
- ownable;
- useful for ablation/robustness.

Weakness:
- not a learned detector;
- needs balanced truth-labelled benchmark before discriminatory claims.

Authority: evidence only.

### CAMERA_FORENSICS_DETERMINISTIC
Role: `BASELINE`.

Ownership: Lythaus-owned deterministic code; no weights.

Evidence:
- metadata/provenance;
- quantisation/encoder;
- CFA/demosaic proxy;
- channel correlation;
- residual noise;
- edge coherence;
- chromatic consistency;
- screen/moire evidence.

Never claim cryptographic camera authentication without actual provenance evidence. Missing camera evidence is not synthetic evidence.

### Current combined vector
The deterministic WP003 spectral/camera path produces a fixed 169-element vector.

## SAFE

Registry role: `TEACHER`.

Status: `NEEDS_PERMISSION` / conditional research.

Code repo: https://github.com/Ouxiang-Li/SAFE

Code licence recorded: Apache-2.0.

Weights licence: UNKNOWN.

Foundation encoder rights: UNKNOWN/separate review.

Training data rights: UNKNOWN.

Commercial use: UNKNOWN.

Distillation: `DO_NOT_TRAIN` until cleared.

Artifact download: prohibited until all required rights are verified.

Technical role:
- transformation-oriented teacher/control;
- upstream unseen-generator research reference.

Operational concerns:
- upstream training is multi-GPU;
- CPU inference unmeasured;
- weight size/RAM/ONNX/quantisation need bounded verification;
- no Lythaus benchmark result.

Current decision: **KEEP_AS_TEACHER conditionally**, not production.

## GRIP CLIP CONTROL

Registry role: `CONTROL` / possible teacher.

Repo: https://github.com/grip-unina/ClipBased-SyntheticImageDetection

Code licence recorded: Apache-2.0.

Weights: UNKNOWN separate review.

Foundation encoder: upstream CLIP/open_clip requires separate rights review.

Training data: UNKNOWN.

Commercial use: UNKNOWN.

Distillation: `DO_NOT_TRAIN` until cleared.

Artifact download: prohibited until all rights verified.

Strength:
- architecture independent of SAFE;
- useful control;
- upstream degraded/unseen-generator evidence.

Risk:
- CLIP dependency;
- weight/data lineage;
- CPU/container fit;
- image-level scope.

Current decision: **KEEP_AS_CONTROL conditionally**.

## Reconstruction family

### DIRE
Role: `EXPERIMENTAL`.

Signal: diffusion reconstruction error.

Likely compute: GPU-heavy for practical latency.

Rights: unresolved.

Use: offline/escalation comparison only.

### LaRE2 / LaRE²
Role: `EXPERIMENTAL`.

Signal: latent reconstruction error / refinement.

Potential value: aims to reduce extraction cost relative to pixel reconstruction.

Rights/runtime: unresolved.

Current priority: first reconstruction candidate to evaluate if rights clear.

### ADRD
Role: `WATCHLIST`.

Signal: perturbation/reconstruction discrepancy.

Rights/weights/data: unresolved.

Use: research comparison.

No reconstruction method is preselected for production.

## LYTHAUS STUDENT V0

Role: future proprietary CPU-friendly fusion model.

Status: **NOT TRAINED**.

Intended inputs:
- EF1-EF5 deterministic evidence;
- 169-element spectral/camera features;
- approved teacher scores;
- optional approved reconstruction outputs;
- human truth labels.

Design priorities:
- calibration;
- explicit uncertainty/applicability;
- teacher disagreement;
- abstention;
- source-family leakage control;
- reproducibility/versioning.

Training remains prohibited until:
- Class A/Class C commercial data exists;
- teacher/distillation rights clear;
- benchmark can measure generalisation;
- compute path is approved.

## Student v0.5

Planned:
- Student v0 inputs;
- precomputed frozen visual embeddings from a rights-cleared encoder.

## Student v1

Long-term compact multi-branch architecture:
- RGB/global;
- residual/noise;
- spectral/phase;
- camera;
- local patches/manipulation;
- global structure.

Potential heads:
- camera-origin evidence;
- synthetic-origin evidence;
- screen recapture;
- local manipulation;
- transformation;
- uncertainty/applicability.

## GPT_OSS_20B_REASONER

Role: `JUDGE` / reasoning orchestration.

Preferred runtime: Cloudflare Workers AI.

Allowed:
- reconcile structured evidence;
- contradictions;
- applicability;
- alternate explanations;
- policy recommendation;
- reviewer/appeal packet structuring.

Not allowed:
- authorship detector claim;
- sole blocker;
- direct state mutation;
- direct enforcement.

`gpt-oss-120b` remains deferred until cost/need evidence justifies experimentation.

## VISUAL_SEMANTIC_MODEL

Role: semantic observer/watchlist.

A candidate previously considered is Gemma 4 26B A4B through Workers AI, subject to current model availability and terms.

Potential structured observations:
- scene/object relations;
- geometry;
- reflections;
- shadows/lighting;
- OCR/text;
- repeated structures;
- regions of interest;
- interpretation of forensic heatmaps.

Never use semantic plausibility, e.g. “weird hands”, as sole AI evidence.

## Generator/source attribution research

Internal future representation may include:
- generator-family embedding;
- nearest known cluster;
- novelty score;
- attribution uncertainty.

Do not expose exact generator attribution publicly without strong evidence/policy approval.

## Teacher council

Potential approved teacher evidence:
- SAFE;
- GRIP;
- Lythaus spectral/camera;
- reconstruction;
- future specialist classifiers;
- human truth labels;
- reviewer/appeal outcomes where policy permits.

The long-term moat is intended to be Lythaus evidence taxonomy + datasets + transformation descendants + calibration/evaluation + proprietary Student weights + policy/audit/appeal integration.

## Model-card gate before any blocking authority

Required:
- model ID/version;
- artifact SHA-256;
- code/weight/foundation/data licence packet;
- training/eval lineage;
- benchmark manifest hash;
- FPR/FNR/calibration;
- unseen-generator;
- hard-negative;
- transformation robustness;
- subgroup metrics;
- latency/memory/cost;
- shadow results;
- rollback version;
- appeal testing;
- human approval.

## Current third-party download status

Per merged WP003 evidence:
- SAFE: not downloaded;
- GRIP: not downloaded;
- DIRE: not downloaded;
- LaRE2: not downloaded;
- ADRD: not downloaded.

Do not change this merely because upstream code is public.
