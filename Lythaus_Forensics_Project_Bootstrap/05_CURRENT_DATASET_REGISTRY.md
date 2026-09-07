# Current Dataset Registry — Lythaus Forensics

**Registry consolidation date:** 7 September 2026  
**Repository registry lineage:** `lythaus-authenticity-dataset-registry-v2`  
**Policy:** unclear rights -> `DO_NOT_TRAIN`; normal Lythaus user content -> prohibited for training/distillation

## 1. Rights classes

### Class A — Commercial/internal training corpus
Data whose applicable rights clearly allow the intended internal model-training use. External commercialization, sublicensing, derived-weight/API rights and post-termination rights must still be separately recorded when the licence does not clearly cover them.

### Class B — Evaluation only
May be used for benchmarking/research within the applicable terms but must not generate commercial student-training or teacher-distillation targets unless rights later change.

### Class C — Lythaus-owned
Captured/generated/commissioned under Lythaus-controlled rights suitable for training, modification, evaluation, distillation and eventual commercial deployment subject to approved releases/terms.

## 2. Data already acquired / available

### Unsplash Dataset Lite — ACQUIRED

- **Status:** physically downloaded/extracted by the owner; WP003 also materialised a bounded external slice.
- **Official size:** 25,000 images. Current Unsplash documentation lists Lite as free for commercial/non-commercial usage.
- **Recorded WP003 archive:** 320,024,071 bytes; SHA-256 `aa0fcbb859040ed64e93817d1d878d0c6f861763283261ba1a6aa5d8d4af6aec6` for the archive materialised in WP003.
- **WP003 sample:** 80 originals + 720 descendants.
- **Official current terms:** Lite grants a non-exclusive, non-transferable, non-sublicensable licence to download/store the commercial licensed data and internally use it to train ML models/algorithms for internal business purposes, subject to ongoing compliance.
- **Operational classification now:** `APPROVED_FOR_INTERNAL_BUSINESS_ML_USE_WITH_TERMS`; do not overstate separate external API/sublicensing/derived-weight rights without written analysis.
- **Role:** broad human/camera-photo baseline, metadata/camera diversity, transformation testing.
- **Do not:** substitute ordinary Unsplash website downloads for the Dataset Lite licence; redistribute source images contrary to terms.

### CSAFE Multi-camera Smartphone Image Database — STRATEGIC / LOCAL COMPLETION TO CONFIRM

- **Official source:** Iowa State University research repository / CSAFE.
- **Size:** 123.62 GB.
- **Contents:** roughly 50,000 JPEG images from 60 multi-camera smartphones.
- **Purpose:** source-camera identification / camera-fingerprint forensic research.
- **Licence:** CC BY 4.0.
- **Status in chats:** owner began a ~126 GB download; completion was never confirmed.
- **Registry action:** formally ingest the official dataset record, local archive path/hash/version, attribution requirements and privacy/provenance review.
- **Role:** high-value EF2 physical-acquisition/camera-origin evidence; device/camera fingerprint experiments; independent holdout by phone/device.
- **Important:** split by physical device/source family, never by image only, to avoid camera-identity leakage.

### Lythaus Originals / owner photos — RAW ASSET POOL

- Owner previously identified 1,000+ potentially usable personal photographs, with additional family archives possible.
- Not yet a formal dataset.
- Must ingest with source/device provenance, original-vs-export/edited state, SHA-256, optional RAW/DNG pairing, release/ownership record and privacy review.
- Target classification: Class C when rights and provenance are clean.
- Particularly valuable for known-ground-truth camera originals and transformation descendants.

## 3. Current external candidates

| Dataset | Main forensic use | Current decision | Training status | Key action |
|---|---|---|---|---|
| Unsplash Dataset Lite | broad camera/photo baseline | owner-approved subject to exact terms | internal business ML permitted by current Lite terms | retain terms snapshot; clarify external API/derived-weight scope if needed |
| CSAFE Smartphone | source-camera / EF2 | high-priority | CC BY 4.0 candidate | confirm local download, hash, register, attribute |
| Open Images V7 | camera/hard negatives | conditional | per-image review | curate only audited images |
| Wikimedia Commons | diverse hard negatives/camera/scans | conditional | per-file review | preserve licence/attribution per file |
| COCO | photo/hard-negative eval | unclear | do not train | legal/source-image review |
| RAISE-1k | pristine high-res camera | permission target | do not train until permission | owner outreach |
| MIT-Adobe FiveK | RAW + edited photo pairs | permission target | do not train until permission | owner outreach |
| HDR+ | burst/computational photo | permission target | do not train until permission | owner outreach |
| GenImage | multi-generator AI benchmark | unclear | do not train | evaluate rights/lineage |
| DiTFake | modern DiT/Flux/SD3 holdout | unclear | do not train | candidate unseen-generator eval |
| T2I-CoReBench | modern generator diversity | unclear | do not train | source/generator-rights review |
| GPT-ImgEval | closed-generator eval/edits | permission required | do not train | rights-holder request |
| FaceForensics++ | local/face manipulation | restricted/high privacy | do not train by default | access + biometric/privacy review |

## 4. Lythaus-owned corpus still needed

### Camera corpus
Target initial 250–500 known-camera originals across devices and scenes. Preserve originals, hashes, make/model, capture format/mode where known, transformation history and release/ownership record. GPS should not be required.

### Synthetic corpus
Target known-generator samples with exact generator/model/version, prompt, seed/settings, timestamp, terms snapshot and hash. Use multiple generator families and reserve at least one family for unseen-generalisation testing.

### Partial-edit/manipulation corpus
Need inpainting, generative fill, local replacement and mixed-origin examples with parent image + edit mask + generator/edit metadata.

### Hard negatives
Need non-AI CGI, SVG/vector art, charts, diagrams, UI screenshots, collages, memes, digital illustrations, scans, screen photos and aggressively processed genuine photos. Prefer Lythaus-owned/procedural material to reduce rights ambiguity.

## 5. Required provenance record per sample

- dataset ID / sample ID / source-family ID;
- source URL or Lythaus acquisition ID;
- retrieved/captured/generated timestamp;
- original filename;
- SHA-256 and perceptual hash;
- rights class and licence evidence;
- author/attribution where required;
- commercial training / evaluation / distillation / redistribution / modification gates;
- origin truth and generator/device where known;
- privacy flags;
- split (TRAIN/VALIDATION/TEST/UNSEEN/EVALUATION_ONLY);
- transformation parent/child lineage;
- retention class.

## 6. Dataset leakage rules

- All descendants remain in the same source-family partition.
- Device/source-family separation is mandatory for camera-ID experiments.
- Prompt/seed near-duplicate families should not cross train/test.
- Deduplicate by content/perceptual hashes and inspect near-duplicates.
- Evaluation-only records may never become teacher targets by convenience.

## 7. Immediate reconciliation tasks for WP004 entry

1. Confirm actual local paths and completion state for Unsplash Lite and CSAFE.
2. Record local archive/directory hashes/manifests without copying binaries into Git.
3. Update the repository dataset registry to reflect the owner-approved Unsplash status using the exact accepted terms, not a broader assumption.
4. Add CSAFE formally to the machine-readable registry.
5. Start ingesting a small Class C Lythaus Originals batch.
6. Build rights-clean synthetic and hard-negative slices before training any student model.

## 8. Primary external references

- Unsplash Dataset: https://unsplash.com/data
- Unsplash Dataset Terms: https://github.com/unsplash/datasets/blob/master/TERMS.md
- CSAFE Multi-camera Smartphone Image Database: https://iastate.figshare.com/articles/dataset/CSAFE_Multi-camera_Smartphone_Image_Database/26932084
