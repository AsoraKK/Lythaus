# WP003 Final Report — Dataset Acquisition & Evaluation Foundation

Historical outcome: **PARTIAL**

Current integration: **MERGED / ACCEPTED AS CONDITIONAL FOUNDATION**

Recommendation: **CONDITIONAL GO**

PR: #540

Branch: `agent/wp003-dataset-prep`

Commit/merge: `2efe6de30c6d0f6d53f66c9127516e7e9e21cc0f`

Merged: 2026-08-11

Authenticity enforcement: disabled.

## A. Executive result

WP003 delivered:
- reproducible dataset materialisation;
- hashing/provenance;
- rights gates/classes;
- deterministic transformations;
- source-family leakage protection;
- external Benchmark v0 slice;
- deterministic spectral/camera baseline;
- fixed 169-element feature vector;
- feature-store tooling;
- model-rights registry;
- rights-holder outreach dossier;
- Cloudflare/cost readiness;
- local ML controls.

It did not deploy models/Containers, download third-party detector artefacts, create paid infrastructure, train Student v0 or enable enforcement.

## B. Unsplash materialisation

WP003 materialised the official Unsplash Dataset Lite archive into the external task cache.

Ledger:
- archive: `unsplash-research-dataset-lite-latest.zip`;
- SHA-256: `aa0fcbb859040ed64e93817d1d878d0c6f861763283261ba1a6aa5d8d4af6aec6`;
- archive size: 320,024,071 bytes;
- terms snapshot SHA-256: `79bec96fe07431e1c40efcdf9f9753da24338a3cb97d7d22ac29dc830e3e2437`;
- 80 source originals;
- 720 descendants;
- 800 benchmark records;
- 706,840,926 bytes of materialised slice media + descendants.

No media binaries were committed to Git.

## C. Rights status at execution time

At WP003 execution, Lite was conservatively registered:
- `CLASS_B_EVALUATION_ONLY`;
- `trainingGate=DO_NOT_TRAIN`;
- `distillationGate=DO_NOT_TRAIN`.

Reason: not all desired derived-weight/API/post-termination rights had been established by that work package.

### Post-WP003 owner update

The owner has since confirmed Lythaus has approved access/use of Unsplash Dataset Lite.

Operational consequence:
- acquisition/use is no longer unresolved;
- the repository registry must still be synchronised with the exact granted rights before commercial Student training;
- do not invent broader rights than the approval actually grants.

The current official Unsplash dataset page states Lite contains 25,000 images and is free for commercial and non-commercial usage. Preserve the exact terms/permission packet applicable to Lythaus.

## D. Current external benchmark slice

Materialised:
- 80 camera-metadata-selected Unsplash originals;
- 720 descendants;
- 800 records;
- 80 source families;
- no normal Lythaus user content.

Transforms:
- JPEG95;
- JPEG75;
- resize75;
- resize50;
- crop10;
- blur;
- sharpen;
- metadata stripped;
- screenshot-style resampling.

The benchmark is not truth-balanced yet. Missing:
- AI-generated sources;
- CGI/digital-art hard negatives;
- scans/scientific/medical;
- screenshot/composites;
- partial synthetic edits;
- unseen generator.

## E. Feature store

External, hash-keyed, regenerable and outside Git.

Each record can carry:
- dataset/sample/source-family IDs;
- feature schema;
- spectral/camera/compression evidence;
- transformation lineage;
- future rights-cleared teacher scores.

WP003 feature store contains 80 original v1 bundles.

Manifest hashes:
- source manifest: `49433abe86b6702eeacab6f2bfa3406dbbe1a4b6e1d508818666c46c4f547cdf`;
- transformed manifest: `aeb03fc24b976e7ca67d0634eaa5f48690237bc2ed69bed953b365b7b0914c10`;
- benchmark JSON: `2ea0e693fffe963ff2187360ac58cd16d9818eecac242791010a278224d98009`;
- feature-store index: `18aa56cdea25340864204b2609cf28b602700b558da5094de1011f974ebc5a95`.

## F. Deterministic spectral baseline

`generateForensicFeatureBundleV1` includes:
- FFT magnitude at 8x8 and 16x16;
- FFT phase at 8x8 and 16x16;
- DCT;
- Haar-like wavelet statistics;
- high-pass residuals;
- JPEG quantisation/double-compression indicators;
- metadata/encoder/XMP/C2PA observations;
- camera proxies;
- fixed 169-element vector.

It is model-free and evidence-only.

## G. Camera baseline

Current evidence:
- metadata/provenance;
- quantisation;
- encoder markers;
- channel correlation / CFA-demosaic proxy;
- residual noise;
- edge-gradient coherence;
- chromatic consistency;
- periodic moire proxy;
- screenshot/recapture indicators.

It never emits `AUTHENTICATED_CAMERA`. Missing camera evidence is not converted into AI evidence.

## H. Measurement result

On the 80 external camera originals:
- vector length: 169 for all 80;
- execution: 554–1,990 ms;
- mean execution: 1,074.03 ms;
- camera evidence: 80 `CAMERA_NATIVE_LIKELY`;
- screen recapture likely: 0;
- moire proxy: 0–0.076059;
- mean moire: ~0.000969;
- neural detector: not run;
- enforcement authority: none.

These are preprocessing measurements, not FPR/FNR/accuracy/calibration/generalisation claims.

## I. Leakage controls

Partitions:
- TRAIN;
- CALIBRATION;
- KNOWN_TEST;
- UNSEEN_TEST;
- EVALUATION_ONLY.

All descendants remain in the same source family. The test suite explicitly rejects original/train versus descendant/test leakage.

## J. Privacy

Materialisation flags GPS, creator/owner, serial/device-owner, biometric/face and medical concerns.

Precise GPS is not copied into routine benchmark or feature-store records.

Preferred pattern:
- restricted research original only where justified;
- privacy-safe derived representation for routine modelling.

## K. Lythaus-owned camera corpus

A capture/ingest runbook was added.

Recommended metadata:
- capture ID;
- device make/model;
- native format;
- RAW/DNG pair where available;
- JPEG/HEIC pair;
- capture mode;
- broad scene category;
- edit history;
- SHA-256;
- rights/release ID.

The owner previously identified 1,000+ potentially usable personal photographs; they are not yet formally ingested, deduplicated or partitioned.

## L. Synthetic corpus

No large synthetic corpus was generated in WP003.

Future provenance must record generator, exact model/version, prompt, seed, steps/sampler/guidance where available, resolution, generation time, rights/terms snapshot and SHA-256.

At least one whole generator family must be held out from training/calibration for unseen-generator evaluation.

## M. Hard negatives

Required categories:
- CGI/3D;
- digital art;
- vectors;
- diagrams/charts;
- game imagery;
- scans;
- screenshots/UI;
- memes;
- composites;
- heavily processed real photos;
- scientific/medical where lawful;
- photographed screens.

Goal: prevent `non-photographic == AI`.

## N. SAFE

Conditional teacher; no artefact downloaded.

Code repository licence recorded Apache-2.0. Checkpoint, foundation encoder, training-data, commercial-use, distillation, CPU/ONNX/quantisation and derived-weight rights remain unresolved.

## O. GRIP CLIP

Control/possible teacher; no artefact downloaded.

Repository code recorded Apache-2.0. Detector weights, upstream CLIP/open_clip, dataset lineage, commercial/distillation rights and CPU fit remain unresolved.

## P. Reconstruction

Candidates:
- LaRE2/LaRE² — attractive first technical candidate if rights clear because latent reconstruction aims to reduce extraction cost;
- DIRE — useful reference, compute-heavy;
- ADRD — watchlist/newer perturbation-reconstruction direction.

No production candidate selected. No artefact downloaded.

## Q. Local machine

Status:
- CPU-only research node;
- trustworthy CPU-package telemetry unavailable;
- `Tctl/Tdie=0 C` rejected;
- thermal qualification not passed;
- unattended training prohibited.

Allowed: short attended preprocessing, transforms, deterministic extraction, benchmark calculations and small classical experiments.

## R. Cloudflare/cost

Repository proof skeleton is structurally valid:
- `lite`;
- one max instance;
- no queue consumer;
- proof flag disabled;
- designed to reuse existing quarantine R2 / Jobs Hyperdrive structures.

Historical live account status remained `UNKNOWN/BLOCKED` because the Codex session lacked callable account tooling and Wrangler auth was expired.

Owner later restored Cloudflare access outside that session, but merged forensics reports still do not contain a full `VERIFIED_LIVE` audit.

Container remains undeployed.

WP003 new provider spend observed: US$0. Planning bound for one fully active `lite` instance was ~US$0.007254/hour before included allowances. R&D ceiling remains US$10/month without further approval.

## S. Rights-holder outreach

Historical priority:
1. MIT-Adobe FiveK — HIGH;
2. HDR+ — HIGH;
3. RAISE-1k — HIGH;
4. GPT-ImgEval — MEDIUM;
5. FaceForensics++ — MEDIUM, biometric/privacy review;
6. Unsplash clarification — historically MEDIUM, now owner access/use approved;
7. GenImage — LOW/unclear;
8. DiTFake — LOW/unclear.

The owner handles commercial negotiation/signature. Desired rights include commercial research, training, feature extraction, transformations, distillation, derived samples/weights, retained weight use, production deployment and future commercial API.

## T. Validation and WP004 recommendation

Reported:
- authenticity foundation: 25/25 passed;
- coverage: 85.92% lines / 84.52% functions;
- WP003 targeted tests: 5/5 passed;
- native typecheck: passed;
- retired-provider/resource/native validators: passed;
- JSON Schema 2020-12 validation: passed;
- Wrangler proof dry-run with rollout disabled: passed;
- thermal qualification: plan only.

Recommendation: **CONDITIONAL GO**.

WP004 should prove whether the Lythaus-owned 169-feature deterministic stack provides useful separation/robustness on a balanced, truth-labelled, rights-clean corpus. SAFE/GRIP, Container deployment and unattended laptop training are not WP004 entry blockers.
