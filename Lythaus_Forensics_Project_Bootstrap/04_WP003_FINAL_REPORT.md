# WP003 Final Report — Dataset Acquisition & Evaluation Foundation

**PR:** #540  
**Branch:** `agent/wp003-dataset-prep`  
**Commit / merge SHA:** `2efe6de30c6d0f6d53f66c9127516e7e9e21cc0f`  
**Merged:** 11 August 2026  
**Outcome:** PARTIAL / CONDITIONAL GO

## Executive outcome

WP003 moved Lythaus from architecture-only work into reproducible external dataset materialisation, provenance/hashing, transformation descendants, leakage controls, a deterministic 169-element spectral/camera feature vector and external feature-store tooling. No third-party model artefact was downloaded and no authenticity enforcement or infrastructure deployment was enabled.

## Dataset acquisition delivered

The official Unsplash Dataset Lite archive was materialised in the external task cache. The recorded archive SHA-256 was:

`aa0fcbb859040ed64e93817d1d878d0c6f861763283261ba1a6aa5d8d4af6aec6`

The captured terms snapshot SHA-256 was:

`79bec96fe07431e1c40efcdf9f9753da24338a3cb97d7d22ac29dc830e3e2437`

The materialisation tool validates manifests, downloads externally, hashes, computes perceptual hashes, records provenance and rights classes, creates deterministic transformations and fails closed for unclear training rights. Large media is not committed to Git.

## WP003 external evaluation materialisation

- 80 camera-metadata-selected Unsplash Dataset Lite originals.
- 720 deterministic descendants.
- 800 total evaluation records.
- 80 source families, all kept within source-family leakage boundaries.
- No ordinary Lythaus user content.
- Media remained external/uncommitted.

The August WP003 registry conservatively treated these as evaluation-only. Since then, the owner has confirmed Lythaus has access/approval to use Unsplash Lite. The current official Lite terms explicitly permit internal business ML training, but external API/commercial-derived-weight scope should remain separately documented before changing the most expansive commercial training/distillation flags.

## Transformations delivered

Nine descendants per source:

- JPEG95
- JPEG75
- resize75
- resize50
- crop10
- blur
- sharpen
- metadata stripped
- screenshot-style resampling

Parent/child IDs, source-family IDs, inherited rights, content hashes, dimensions and transformation parameters are recorded. True screen recapture and inpainting were not falsely simulated as completed categories.

## Deterministic spectral baseline

WP003 implemented a Lythaus-owned deterministic branch with:

- multi-scale FFT magnitude;
- multi-scale FFT phase;
- DCT statistics;
- wavelet statistics;
- high-pass/residual features;
- compression evidence;
- camera evidence integration.

The output is a fixed **169-element feature vector** integrated into `ForensicFeatureBundle`.

On the 80 external camera originals, the reported execution range was about 554–1,990 ms with mean ~1,074 ms in the WP003 environment. These are research measurements, not production latency SLOs.

## Deterministic camera baseline

Evidence includes metadata/provenance, quantisation, encoder markers, channel correlation, residual noise, edge coherence, chromatic consistency and screen/moire indicators. The 80 selected camera records were reported `CAMERA_NATIVE_LIKELY`, but this is evidence classification, not cryptographic camera authentication and not proof that non-camera media is AI-generated.

## Feature store

The regenerable external feature store is hash-keyed and records dataset/sample/source-family IDs, feature schema, spectral/camera/compression evidence, transformation lineage and an empty future teacher-score list. Raw media and large feature stores are excluded from ordinary Git history.

## Leakage controls

Source-family partitioning prohibits original and descendant leakage across TRAIN/CALIBRATION/KNOWN_TEST/UNSEEN_TEST/EVALUATION_ONLY. Tests include an explicitly prohibited original/train vs transformed/test case.

## Privacy controls

The materialiser flags GPS, creator/owner, serial, face/biometric and medical metadata categories. Precise GPS was not copied into routine benchmark/feature-store records. Research originals should remain restricted when metadata is forensically useful; privacy-safe derivatives should be used for ordinary model work.

## Rights-holder priorities from WP003

High priority:

1. MIT-Adobe FiveK — RAW/retouched camera/editing pairs.
2. HDR+ — computational photography/burst/low-light evidence.
3. RAISE-1k — high-resolution camera-native evidence.

Medium:

- GPT-ImgEval — current proprietary generator evaluation/edits.
- FaceForensics++ — local/face manipulation, subject to biometric/privacy review.
- Unsplash clarification — downstream commercial/API/derived-weight rights.

Lower/research:

- GenImage.
- DiTFake.
- T2I-CoReBench.

## Third-party model status

- SAFE: keep as teacher conditionally; download blocked until checkpoint/data/foundation/dependency/derived-rights review.
- GRIP: keep as control/possible teacher; download blocked until CLIP/weight/data/dependency rights review.
- Reconstruction: LaRE² first candidate if rights clear; DIRE reference; ADRD watchlist. No artefacts downloaded.

## Local machine

Ryzen 7 7730U system remains CPU-only. Reliable CPU-package telemetry unavailable; 0°C Tctl/Tdie rejected; unattended training remains prohibited. Safe work remains short attended preprocessing, transformations, deterministic features, benchmark calculations and small classical experiments.

## Cloudflare / Container position at WP003

Repo-level Container proof was structurally ready and disabled. Live account state in the WP003 execution was unavailable/blocked, so no resource mutation occurred. Future proof design: one `lite` instance, one-hour maximum active time, fixed request count, published-rate bound, kill switch and rollback.

## Cost

New provider spend observed during WP003: US$0. No model inference, paid dataset, GPU, new recurring resource or Container deployment was introduced.

## Validation

- WP003 targeted tests: 5/5 passed.
- Foundation authenticity suite: 25/25 passed.
- Coverage: 85.92% lines / 84.52% functions.
- Native typecheck: passed.
- Retired-provider/resource/native-scope/native-worker validators: passed.
- JSON Schema 2020-12 dataset/benchmark validation: passed.
- Wrangler proof dry-run with container rollout disabled: passed.
- Thermal qualification: plan-only.

## Final WP003 disposition

`CONDITIONAL GO` into WP004 preparation. Proceed with rights-clean corpus expansion, Lythaus-owned camera/synthetic/hard-negative data, deterministic baseline measurement and benchmark completion. Do not proceed to authenticity enforcement, large external models, unrestricted dataset acquisition, student training or production Container/model deployment until their specific gates pass.
