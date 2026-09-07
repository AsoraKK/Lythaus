# WP001 Final Report — Authenticity AI Foundation

**PR:** #538  
**Branch:** `agent/wp001-foundation`  
**Head SHA:** `ce17e3d5f482798fb4d43845c50ae6af45087ff9`  
**Merge SHA:** `94ea99fb4b58cfdbd6fbf440f853995e5994c65c`  
**Merged:** 9 August 2026  
**Disposition:** COMPLETE at repository level; production enforcement NO-GO by design

## Executive outcome

WP001 created the provider-independent foundation for Lythaus Authenticity AI while preserving all safety, cost and governance gates. No model was deployed, no new provider or permanent Cloudflare resource was created, no model weights were downloaded, no user content was used for training, and authenticity enforcement remained disabled.

## Delivered architecture

- ADR-003 governing Safety / Forensics / Judge separation.
- Five evidence-family architecture (EF1–EF5).
- Independent camera-origin and synthetic-origin axes.
- Versioned authenticity evidence and deterministic policy contracts.
- UUID v7 auditability.
- Moderation/authenticity isolation.
- Provider-neutral moderation interface.
- Model registry/model manifest foundations.
- Media intake/quarantine contracts.
- Deterministic forensic feature foundations.
- Transformation laboratory v0.
- Evaluation harness.
- ECO-TRAIN local-compute controls.
- Thermal qualification utilities and fail-closed telemetry state machine.
- Disabled Cloudflare Container proof skeleton reusing existing resource names.
- Cost hard stop: US$10/month total incremental R&D ceiling.

## Evidence/data contracts

WP001 introduced/standardised contracts for cases, evidence, forensic bundles, model and transformation runs, moderation decisions, authenticity recommendations, policy decisions, appeal evidence, model manifests and evaluation runs. Material decisions carry model/policy/schema versions, reason/applicability/uncertainty, execution time, cost estimate and audit outcome.

## Deterministic forensics v0

The foundation covered safe, provider-independent extraction of file/provenance and deterministic image evidence such as metadata interfaces, encoding/compression indicators, hashes, FFT/DCT/wavelet/residual foundations and an image pyramid. The implementation must explicitly mark unavailable decoded-pixel evidence rather than interpreting raw bytes as camera evidence.

## Local compute / ECO-TRAIN

Official local development node:

- HP Laptop 15-fc0xxx
- AMD Ryzen 7 7730U, 8C/16T
- 16 GB DDR4-3200
- integrated Radeon graphics
- ~228 GB free SSD at the time of the original brief

It is treated as CPU-only. Default controls: 40% CPU target, 50% ceiling, four initial workers, six maximum after qualification, below-normal process priority, 6 GB process memory, >=4 GB free system memory, >=80 GB free disk, AC power required.

Thermal policy: CPU TjMax reference 95°C; Lythaus pause at 75°C; emergency stop at 85°C; resume only below 65°C for 120 stable seconds. These are engineering safety thresholds, not AMD specifications.

## Telemetry result

A controlled LibreHardwareMonitor proof was merged. Non-elevated probing found no valid CPU Package sensor. A `Tctl/Tdie` reading of 0°C was rejected as implausible, which is the required fail-safe behaviour. Unattended training therefore remained prohibited. The optional elevated proof is human-only; Codex must not bypass UAC or install a privileged service silently.

## Cloudflare proof skeleton

A disabled proof-only Container boundary was added to demonstrate future routed event -> quarantine R2 read -> bounded CPU work -> structured result -> PlanetScale/audit write -> sleep-to-zero. It intentionally had no active deployment, no second mixed-queue consumer and no model inference.

## Validation

Reported PR validation:

- `npm run test:authenticity-foundation`: 15 passed.
- Coverage: ~86.9% lines / 80.9% functions.
- `npm run typecheck:native`: passed.
- Container TypeScript/server syntax/Wrangler type freshness: passed.
- Native architecture tests: 31 passed.
- No-retired-provider dependency validator: passed.
- Lythaus resource registry/native Worker/native scope validators: passed.
- PlanetScale migration/extension/identity guards: passed.
- Thermal qualification: plan-only; unattended remained disabled.

## Human gates retained after WP001

- Review/accept architecture and contracts.
- Verify live Cloudflare resource/cost state before any Container binding/deploy.
- Approve/execute any elevated telemetry proof.
- Approve datasets/licences/evaluation.
- Complete model-card/calibration/rollback/appeal/legal/commercial API reviews before any enforcement.

## Final assessment

WP001 is accepted as the completed foundation. It established contracts, auditability, deterministic evidence, local-safety controls and future Cloudflare proof boundaries without granting any model production authority.
