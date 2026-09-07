# WP001 Final Report — Authenticity Foundation

Status: **COMPLETE / ACCEPTED**

PR: #538

Branch: `agent/wp001-foundation`

Head: `ce17e3d5f482798fb4d43845c50ae6af45087ff9`

Merge: `94ea99fb4b58cfdbd6fbf440f853995e5994c65c`

Merged: 2026-08-09

Production authenticity enforcement: **NO-GO by design**.

## Objective

Build the provider-independent foundation before integrating or granting authority to authenticity models.

WP001 was intentionally architecture, evidence, safety and measurement work. It did not claim model accuracy.

## Delivered

### ADR and system split
- ADR-003 accepted.
- Safety / Forensics / Judge separation established.
- deterministic policy retained as only final enforcement authority.
- Azure/Hive-era active authenticity assumptions superseded.
- Cloudflare-first boundary established.
- shadow/review-only mode established.
- US$10/month experimental ceiling established.

### Evidence contracts
Versioned contracts cover authenticity cases, evidence, forensic feature bundles, model runs, transformation runs, moderation decisions, recommendations, deterministic policy decisions, appeal evidence packets, model manifests and evaluation runs.

UUID v7 is canonical for material identifiers.

### Dual-axis origin
Camera evidence and synthetic evidence were explicitly separated. WP001 prohibited the architectural shortcut `real = 1 - AI`.

### Moderation isolation
Provider-neutral moderation interface:
- `analyseText()`
- `analyseImage()`
- `analyseVideoFrame()`

Canonical results:
- `ALLOW`
- `REVIEW`
- `BLOCK`
- `PROVIDER_FAILURE`

Moderation and authenticity evidence remain separately auditable.

## Media-intake foundation

The intake design includes:
- MIME/signature validation;
- bounded file size/dimensions;
- decompression-bomb protection;
- SHA-256;
- perceptual hash;
- duplicate/idempotency control;
- quarantine-before-publication;
- queue handoff;
- R2/Hyperdrive reuse.

No new permanent Cloudflare resource was created.

## Deterministic forensics v0

Interfaces cover:
- JPEG/PNG structure;
- EXIF/XMP;
- C2PA;
- encoding/compression;
- quantisation;
- double-compression indicators;
- FFT magnitude/phase;
- DCT;
- wavelets;
- high-pass residuals;
- edge statistics;
- image pyramids;
- hashes.

Reusable output: `ForensicFeatureBundle`.

If decoded pixels are unavailable, the system must report unavailable evidence rather than convert raw bytes into fake camera evidence.

## Transformation laboratory v0

Initial transformations:
- JPEG95;
- JPEG75;
- resize75;
- resize50;
- crop10;
- mild blur;
- mild sharpening;
- metadata strip;
- screenshot-style resampling.

Purpose: transformation stability and counterfactual evidence trajectories, not enforcement.

## Model-registry foundation

Initial keys included:
- SAFE
- GRIP_CLIP_CONTROL
- SPECTRAL_PHASE_EXPERIMENT
- RECONSTRUCTION_EXPERIMENT
- LYTHAUS_STUDENT_V0
- GPT_OSS_20B_REASONER
- VISUAL_SEMANTIC_MODEL

Large model artefacts are prohibited from ordinary CI.

Model records require source/licence/weight licence/commercial status/contracts/artifact hash/evaluation/deployment/rollback/approval information.

## ECO-TRAIN foundation

Official local node:
- HP Laptop 15-fc0xxx;
- AMD Ryzen 7 7730U;
- 8 cores / 16 threads;
- 16 GB RAM;
- integrated Radeon;
- CPU-only ML posture.

Suitable:
- deterministic preprocessing;
- transforms;
- feature extraction;
- benchmark/calibration;
- classical ML;
- small models;
- frozen/precomputed features.

Not suitable/approved:
- GPT-OSS training;
- full SAFE training;
- major ViT/VLM training;
- large video models;
- unbounded processing.

Initial safety policy:
- AC required;
- 40% CPU target;
- 50% software ceiling;
- 4 workers initially;
- 6 maximum only after qualification;
- below-normal priority;
- max process memory 6 GB;
- minimum free system RAM 4 GB;
- minimum free disk 80 GB;
- checkpoint/resume;
- unattended disabled without valid CPU-package telemetry.

Thermal policy:
- AMD Tjmax 95 C;
- Lythaus pause 75 C;
- hard stop 85 C;
- resume only below 65 C stable for 120 seconds.

## LHM telemetry result

Controlled non-elevated LibreHardwareMonitor proof did not expose a trustworthy CPU-package sensor.

`Tctl/Tdie = 0 C` was rejected as implausible.

Result: `UNAVAILABLE`.

Unattended training remains prohibited. This is the intended fail-closed behaviour.

## Cloudflare Container proof skeleton

A disabled future proof was created to reuse existing infrastructure where possible.

Target proof:
- HTTP health;
- typed/routed proof event;
- quarantine R2 read;
- bounded CPU feature computation;
- structured result;
- sanitised audit write;
- scale-to-zero.

No queue consumer, model or production deployment was enabled.

## Validation

Merged PR evidence:
- `npm run test:authenticity-foundation`: 15 passed;
- coverage: 86.90% lines / 80.90% functions;
- native architecture: 31 passed;
- native typechecks: passed;
- Container TS/server/Wrangler checks: passed;
- retired-provider validator: passed;
- resource-registry validator: passed;
- native Worker/scope validators: passed;
- PlanetScale migration/extension/identity guards: passed;
- thermal qualification: plan-only.

## Explicit non-actions

WP001 did not:
- deploy SAFE;
- download weights;
- train a model;
- create a GPU provider;
- create a paid provider;
- create a database/queue/permanent Cloudflare resource;
- deploy the Container proof;
- use user content for training;
- enable authenticity enforcement.

## Human gates after WP001

Originally:
1. approve ADR/contracts;
2. verify live Cloudflare resource/cost before proof deployment;
3. obtain valid CPU-package telemetry if unattended training desired;
4. approve datasets/licences;
5. approve model cards/calibration/rollback/appeal/legal/commercial gates.

Subsequent status:
- ADR/WP001 merged and accepted;
- owner confirmed Workers Paid;
- non-elevated thermal telemetry remains invalid;
- WP002/WP003 advanced dataset/model/benchmark readiness.

## Enduring WP001 rules

- evidence over one score;
- no public confidence percentage;
- no model as sole blocker;
- no PII logs;
- no normal user-content training;
- deterministic policy authority;
- fail-closed local training;
- versioned auditability;
- cost hard stops.
