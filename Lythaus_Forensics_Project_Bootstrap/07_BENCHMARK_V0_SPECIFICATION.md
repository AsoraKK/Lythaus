# Benchmark v0 Specification — Lythaus Authenticity AI

**Status:** WP003 partial materialisation; media external and uncommitted  
**Purpose:** evaluate evidence quality before any model receives enforcement authority

## 1. Design principles

- Small, legally auditable, provenance-first benchmark.
- Source identity and transformations are grouped by stable source-family IDs.
- Generator family/model versions remain explicit.
- At least one generator family and one transformation combination are held out.
- No normal Lythaus user content.
- Rights class/gates are carried at sample level.
- Evaluation-only data cannot create commercial teacher/distillation targets.
- Media stays outside ordinary source control.
- Results do not change publication/enforcement state.

## 2. Initial 320-source target

| Slice | Sources | Required coverage |
|---|---:|---|
| Camera-native | 80 | smartphones, dedicated cameras, computational photo, HDR/night, low light, portrait, landscape, indoor/outdoor, regional/skin-tone diversity |
| AI-generated | 80 | >=8 generator families across diffusion, autoregressive, transformer/unified and approved closed-source evaluation outputs |
| CGI/3D/digital art | 40 | renders, digital paintings, illustrations, game screenshots |
| Scans/scientific/medical | 20 | scans/documents/artwork and non-social scientific/medical imagery where rights permit |
| Screenshots/composites | 30 | UI screenshots, memes, composites, aggressively edited photography |
| Partial edits | 40 | inpainting, generative fill, local replacement, mixed-origin; face manipulation only if permission/privacy gates pass |
| Reserved unseen holdout | 30 | withheld generator/source family, never used for calibration |

Target maximum transformation descendants: up to 2,880, for ~3,200 records including originals. Do not pad blocked slices with ambiguous data.

## 3. WP003 materialised state

- 80 camera-native Unsplash Dataset Lite originals.
- 720 descendants.
- 800 records.
- 80 external feature bundles generated.
- No AI-generated, partial edit, CGI/hard-negative or unseen-generator slice was materialised in WP003.

Therefore Benchmark v0 is **not complete**.

## 4. Transformation matrix

Where meaningful:

- ORIGINAL
- JPEG quality 95
- JPEG quality 75
- resize 75%
- resize 50%
- crop 10%
- mild blur
- mild sharpening
- metadata stripping
- screenshot-style resampling

Future real fixtures:

- physical screen recapture;
- inpainting/local edit;
- selected compound transformations such as screenshot + recompression.

Do not create an uncontrolled combinatorial explosion.

## 5. Manifest fields

Required:

`sampleId`, `groupId`, `sourceFamilyId`, `origin`, `transformation`, `generatorFamily`, `generatorVersion`, `sourceDatasetId`, `sourceUrl`, `licenceClassification`, `rightsClass`, `trainingGate`, `evaluationGate`, `distillationGate`, `contentSha256`, `perceptualHash`, `width`, `height`, `mime`, `hasPii`, `consentStatus`, `split`, `truthSynthetic`, `truthLocalManipulation`, `retentionClass`.

Also record tool/decoder/transformation version and deterministic seed where applicable.

## 6. Splits

- TRAIN
- VALIDATION / CALIBRATION
- KNOWN_TEST
- UNSEEN_TEST
- EVALUATION_ONLY

Rules:

- descendants remain in the same source-family split;
- camera/device families must not leak across source-camera evaluation splits;
- prompt/seed/nearly identical synthetic families should not cross train/test;
- reserve at least one generator family completely unseen during fitting/calibration.

## 7. Metrics

Every model/baseline run reports:

- FPR / FNR;
- precision / recall / F1;
- AUROC / AUPRC;
- Brier score and ECE;
- abstention rate;
- per-generator performance;
- unseen-generator performance;
- per-transformation performance;
- hard-negative performance;
- local manipulation metrics when masks exist;
- latency;
- memory;
- CPU/GPU time;
- estimated inference cost;
- transformation stability.

Policy target: human-content FPR <=1% overall; material subgroup/language rate >2% triggers mitigation/review. These are eligibility targets, not current claims.

## 8. Transformation stability metrics

For each source family/model:

- score/feature mean;
- variance;
- embedding/feature movement;
- classification flips;
- evidence-family stability;
- robustness grade.

Strong evidence that collapses after mild JPEG/resize/screenshot transformation is treated as fragile and should increase abstention/review rather than false certainty.

## 9. First WP004 expansion

Before sophisticated model integration, complete a rights-clean benchmark using:

- Unsplash Lite / CSAFE / Lythaus Originals for human-camera evidence;
- Lythaus-generated rights-clean synthetic images with exact model/prompt/seed provenance;
- Lythaus-owned procedural/UI/CGI/digital-art hard negatives;
- controlled AI edits/inpainting with masks;
- a strictly held-out generator family.

Then run ablations:

1. spectral only;
2. camera only;
3. compression/file only;
4. residual only;
5. all deterministic 169 features;
6. optional +SAFE;
7. optional +GRIP;
8. optional +reconstruction.

This establishes the incremental value of expensive teachers over Lythaus-owned cheap evidence.
