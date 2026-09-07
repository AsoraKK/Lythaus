# Current Dataset Registry — Lythaus Forensics

Bootstrap date: 2026-09-07

Canonical repo registry: `ml/datasets/DATASET_REGISTRY.md` and `dataset-registry.json`.

## Rights policy

Track separately:
- source/image rights;
- annotations/labels;
- commercial use;
- training;
- distillation;
- transformation/modification;
- redistribution;
- derived weights/deployment;
- privacy/consent.

Public availability, a GitHub repository or a paper is not a permission grant.

Unknown rights => `DO_NOT_TRAIN`.

Rights classes:
- `CLASS_A_COMMERCIAL_TRAINING` — expressly cleared for intended commercial training use.
- `CLASS_B_EVALUATION_ONLY` — evaluation/benchmark only, no teacher-target/distillation leakage.
- `CLASS_C_LYTHAUS_OWNED` — created/commissioned under rights sufficient for training/modification/distillation/deployment/API use.

Normal Lythaus user uploads are never silently training/distillation data.

## 1. Unsplash Dataset Lite

Official page: https://unsplash.com/data

Current official catalogue:
- Lite: 25,000 images;
- 25,000 keywords;
- 1,000,000 searches;
- official page states free for commercial and non-commercial usage.

WP003 artefact:
- archive `unsplash-research-dataset-lite-latest.zip`;
- SHA-256 `aa0fcbb859040ed64e93817d1d878d0c6f861763283261ba1a6aa5d8d4af6aec6`;
- terms snapshot SHA-256 `79bec96fe07431e1c40efcdf9f9753da24338a3cb97d7d22ac29dc830e3e2437`.

WP003 materialised:
- 80 originals;
- 720 descendants;
- 800 records.

### Current owner update

The owner confirms Lythaus has approved access/use of Unsplash Dataset Lite.

The merged repo registry still contains the older WP003 evaluation-only classification. Before commercial Student training, update the registry to the **exact scope actually granted**. Do not infer API/derived-weight/retention rights beyond the applicable permission/terms.

Ordinary Unsplash website images are not a substitute for the dedicated dataset path.

Operational status: `OWNER_APPROVED_ACCESS; RIGHTS_SCOPE_TO_SYNC`.

## 2. CSAFE Multi-camera Smartphone Image Database

Official source: https://iastate.figshare.com/articles/dataset/CSAFE_Multi-camera_Smartphone_Image_Database/26932084

Official properties:
- ~50,000 JPEG images;
- 60 multi-camera smartphones;
- 123.62 GB download;
- CC BY 4.0;
- designed for source-camera identification/forensic research.

Conversation/local status:
- owner began the roughly 126 GB download;
- completion has not been independently confirmed.

For Lythaus this is high-value because it can support physical acquisition/camera fingerprint research better than web-processed photography alone.

Before training/benchmark use:
1. verify local archive/folder completion and integrity;
2. preserve official citation/licence;
3. define attribution record;
4. inspect content/privacy composition;
5. partition by physical device/source family;
6. consider device-level unseen holdouts;
7. keep media outside Git.

Operational status: `HIGH_VALUE; LOCAL_COMPLETION_UNVERIFIED; RIGHTS/CONTENT REVIEW REQUIRED`.

## 3. Lythaus Originals / personal camera archive

Owner previously estimated 1,000+ potentially usable personal photographs, with possible additional family material.

Potential value:
- known human/camera origin;
- native file preservation;
- RAW/DNG + JPEG/HEIC pairs;
- controlled transformations;
- controlled screen recapture.

Before Class C use:
- identify photographer/rights owner;
- obtain release/permission where creator is not solely the owner;
- ingest native originals, not just social-media copies;
- hash/deduplicate;
- classify edited vs original;
- isolate unnecessary PII/GPS;
- record device/source family;
- split by source/device family.

Operational status: `POTENTIAL CLASS_C; NOT FORMALLY INGESTED`.

## 4. Open Images V7

Use: diverse camera/hard-negative evaluation.

Repo status: `APPROVED_WITH_CONDITIONS`.

Rule: verify rights per image and retain attribution/provenance. Dataset landing pages/URLs/annotations alone do not prove commercial training rights to every image.

## 5. Wikimedia Commons

Use: diverse camera/hard negatives.

Status: `APPROVED_WITH_CONDITIONS`.

Per-file licence/attribution/privacy/consent review required.

## 6. COCO

Use: possible camera/hard-negative evaluation.

Status: `UNCLEAR` for intended commercial Student training.

Decision: do not train until rights are reviewed.

## 7. RAISE / RAISE-1k

Use: high-resolution camera-native benchmark/evidence.

Status: `REQUIRES_PERMISSION`.

Owner outreach priority: HIGH.

Desired rights: commercial research, training, transforms, feature extraction, distillation, derived weights, production deployment and future API.

## 8. MIT-Adobe FiveK

Use: RAW-to-retouched camera/editing pairs.

Status: `REQUIRES_PERMISSION`.

Owner outreach priority: HIGH.

## 9. HDR+

Use: computational photography, burst/HDR/low-light processing evidence.

Status: `REQUIRES_PERMISSION`.

Owner outreach priority: HIGH.

## 10. GenImage

Use: multi-generator evaluation.

Status: `UNCLEAR`.

Do not infer training rights from research availability.

## 11. DiTFake

Use: newer transformer/DiT unseen-generator evaluation.

Status: `UNCLEAR`.

Good holdout candidate if rights permit evaluation.

## 12. T2I-CoReBench

Use: current generator diversity.

Status: `UNCLEAR`.

Require lineage/source-generator/closed-provider review.

## 13. GPT-ImgEval

Use: proprietary/current-generator evaluation and edits.

Status: `REQUIRES_PERMISSION`.

Owner outreach priority: MEDIUM.

## 14. FaceForensics++

Use: local/face manipulation research.

Status: `REQUIRES_PERMISSION`.

Additional gate: biometric/privacy review. Not necessary for initial WP004 unless the specific manipulation value justifies the risk.

## What the corpus still needs

Unsplash Lite helps solve broad real-photography coverage, but does not solve:

### Known-native camera originals
Need true native device files, known device IDs and preferably RAW/DNG pairs. Primary paths: Lythaus-owned capture, CSAFE and later restricted camera datasets if licences are secured.

### Rights-clean known-generator synthetic images
Every sample should record generator, exact model/version, prompt, seed where possible, steps/sampler/guidance where relevant, timestamp, rights/terms snapshot and SHA-256.

### Partial synthetic/manipulated images
Need source + mask + model + prompt + output lineage for inpainting/generative fill/local replacement.

### Hard negatives
Need CGI, 3D, digital art, vectors, charts, diagrams, scans, UI screenshots, memes, composites, heavily processed human photos, scientific/medical imagery where lawful, and photographed screens.

Purpose: prevent `non-photographic = AI`.

### Unseen-generator holdout
Reserve at least one entire generator family that is never used for fitting/calibration.

## Desired commercial corpus v0

Planning target only:
- ~2,000 Unsplash Lite photographic sources after exact rights sync;
- 250–500 known camera originals;
- 1,000–1,500 rights-clean AI-generated sources;
- 250–500 partial edits;
- 300–500 hard negatives;
- >=250 unseen/generalisation holdout.

Quality/provenance beats size.

## Required per-sample provenance

- dataset ID;
- sample ID;
- source URL/source record;
- creator/attribution where required;
- retrieval/generation timestamp;
- SHA-256;
- perceptual hash;
- licence evidence;
- rights class;
- training/evaluation/distillation/redistribution/modification gates;
- origin truth;
- generator/device where known;
- source-family ID;
- privacy flags;
- consent/release ID where relevant;
- retention class.

## Leakage rule

Original and all transformations/children stay in one source family. Do not put original in train and JPEG/crop/screenshot of the same source in test. For camera research, consider device-level holdouts as well.

## Immediate WP004 dataset tasks

1. Verify CSAFE local completion/integrity.
2. Sync Unsplash owner-approved rights in the repo registry.
3. Materialise only the needed Unsplash subset, not all 25,000 blindly.
4. Ingest Lythaus-owned camera originals.
5. Build a rights-clean synthetic corpus with multiple generator families.
6. Build partial-edit fixtures/masks.
7. Build hard negatives.
8. Reserve unseen generator.
9. Complete balanced Benchmark v0 before serious detector comparisons.
