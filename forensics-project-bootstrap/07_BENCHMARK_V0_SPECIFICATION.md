# Lythaus Authenticity Benchmark v0 — Current Specification

Status: **PARTIALLY MATERIALISED; NOT YET BALANCED**.

Canonical repo spec: `ml/evaluation/BENCHMARK_V0_SPEC.md`.

Purpose: evaluate evidence quality before any model receives production enforcement authority.

## Design principles

- small enough to audit;
- provenance first;
- rights aware;
- source-family split;
- transformation rich;
- hard-negative aware;
- unseen-generator aware;
- never use normal Lythaus user content;
- never pad missing slices with unclear-rights media.

## Target source composition

| Slice | Target | Coverage |
|---|---:|---|
| Camera-native | 80 | smartphone, dedicated camera, computational photography, HDR/night, low light, portrait/landscape, indoor/outdoor, diverse environments |
| AI-generated | 80 | at least eight generator families where practical; diverse generation architectures |
| CGI/3D/digital art | 40 | renders, paintings, illustrations, game imagery |
| Scans/scientific/medical | 20 | lawful provenance-known non-social imagery |
| Screenshots/composites | 30 | UI, memes, composites, heavy edits |
| Partial edits | 40 | inpainting, generative fill, local replacement, mixed origin |
| Reserved unseen holdout | 30 | withheld source/generator family, never calibration/training |
| **Total** | **320** | rights/provenance outrank quota |

Up to 2,880 transformed descendants / roughly 3,200 records including originals.

## Current WP003 materialisation

- 80 Unsplash Lite camera-metadata-selected originals;
- 720 deterministic descendants;
- 800 total records;
- 80 source families;
- no normal Lythaus user content.

Recorded hashes:
- source manifest `49433abe86b6702eeacab6f2bfa3406dbbe1a4b6e1d508818666c46c4f547cdf`;
- transformed manifest `aeb03fc24b976e7ca67d0634eaa5f48690237bc2ed69bed953b365b7b0914c10`;
- benchmark JSON `2ea0e693fffe963ff2187360ac58cd16d9818eecac242791010a278224d98009`;
- feature-store index `18aa56cdea25340864204b2609cf28b602700b558da5094de1011f974ebc5a95`.

Current source slice is not sufficient to measure detector accuracy because balanced synthetic/hard-negative truth is absent.

Do not report current WP003 results as FPR/FNR/AUROC/calibration/generalisation.

## Initial transformation matrix

- ORIGINAL
- JPEG95
- JPEG75
- RESIZE75
- RESIZE50
- CROP10
- BLUR
- SHARPEN
- METADATA_STRIPPED
- SCREENSHOT_SIMULATION

Future controlled fixtures:
- true screen recapture;
- inpainting/local edit;
- combined laundering, e.g. screenshot + recompression.

Do not create combinatorial explosion until individual transforms are understood.

## Manifest fields

Required:
- `sampleId`
- `groupId`
- `sourceFamilyId`
- `origin`
- `transformation`
- `generatorFamily`
- `generatorVersion`
- `sourceDatasetId`
- `sourceUrl`
- `licenceClassification`
- `rightsClass`
- `trainingGate`
- `evaluationGate`
- `distillationGate`
- `contentSha256`
- `perceptualHash`
- `width`
- `height`
- `mime`
- `hasPii`
- `consentStatus`
- `split`
- `truthSynthetic`
- `truthLocalManipulation`
- `retentionClass`

Recommended WP004 additions:
- camera device family;
- original/native format;
- RAW pair ID;
- prompt family ID;
- generator seed;
- edit-mask SHA-256;
- synthetic-region fraction;
- rights-evidence hash.

## Partition policy

Canonical partitions:
- TRAIN
- CALIBRATION / VALIDATION
- KNOWN_TEST
- UNSEEN_TEST
- EVALUATION_ONLY

All descendants of the same source family stay together.

Stronger anti-leakage holdouts should include, where relevant:
- physical camera/device families;
- photographer/source families;
- prompt families;
- generator families;
- transformation combinations.

Never place an original in train and its JPEG/crop/screenshot in test.

## Deterministic baseline

Current Lythaus deterministic branch:
- fixed 169-element vector;
- FFT magnitude/phase;
- DCT;
- wavelets;
- residuals;
- compression;
- camera evidence.

WP003 runtime on 80 originals:
- 554–1,990 ms;
- mean 1,074.03 ms.

This measures preprocessing cost, not detection accuracy.

## Required metrics

Classification:
- FPR;
- FNR;
- precision;
- recall;
- F1;
- AUROC;
- AUPRC.

Calibration:
- Brier score;
- ECE;
- reliability analysis;
- abstention rate.

Generalisation:
- per generator;
- unseen generator;
- per device/source;
- hard-negative categories;
- partial edits.

Robustness:
- per transformation;
- feature/embedding movement;
- score mean/variance;
- classification flips;
- evidence-family stability.

Operations:
- latency;
- CPU time;
- RAM;
- model/artifact load time;
- estimated cost;
- failure and abstention reasons.

## Lythaus critical policy gate

Human-content false-positive target: **<=1% overall**.

Material subgroup/language rate **>2%** triggers mitigation/review.

A model with good aggregate accuracy but poor human false-positive performance is not production eligible.

## WP004 ablation order

1. spectral only;
2. camera only;
3. compression/provenance only;
4. residual/noise only;
5. all deterministic features;
6. later + SAFE if rights cleared;
7. later + GRIP if rights cleared;
8. later + reconstruction if justified.

Goal: measure marginal value per evidence family and per compute/cost.

## First learned baseline

Once a rights-clean Class A/C training slice exists, begin with interpretable small models:
- logistic regression;
- regularised linear classifier;
- shallow tree/boosted model;
- small calibrated fusion layer.

Do not begin with a large end-to-end neural model.

## Reproducibility

Every run records:
- dataset-registry version;
- benchmark manifest hash;
- split hash;
- model manifest/version;
- evidence schema;
- policy version;
- transform implementation version;
- exact Git SHA;
- runtime/CPU;
- seed;
- artifact hashes.

## WP004 benchmark completion gate

Required:
- rights-clean human/camera slice;
- rights-clean known synthetic slice;
- hard negatives;
- partial edits;
- unseen generator;
- source-family leakage tests;
- transforms;
- privacy review;
- regenerable feature store;
- baseline metrics.

SAFE/GRIP are optional comparisons, not entry blockers.
