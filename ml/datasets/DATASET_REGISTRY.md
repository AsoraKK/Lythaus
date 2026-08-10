# Dataset and Licence Registry

This register is a legal-research index, not a permission grant. The machine-
readable source is `dataset-registry.json`. Version 2 adds explicit
`CLASS_A_COMMERCIAL_TRAINING`, `CLASS_B_EVALUATION_ONLY`, and
`CLASS_C_LYTHAUS_OWNED` rights classes. Rights are recorded separately for
code, images, labels, weights, training, distillation, modification, and
redistribution. `UNCLEAR` always maps to `DO_NOT_TRAIN`.

## Approved policy

- Ordinary Lythaus user uploads are never training or distillation data.
- Binaries are materialised only in the external task cache; they are never
  committed or uploaded to R2 by this work package.
- Unsplash Dataset Lite is a bounded evaluation source until downstream model
  and API rights are explicitly verified. Ordinary Unsplash website downloads
  are not a substitute.
- Open Images is evaluated per image. URLs, annotations, and dataset landing
  pages do not by themselves prove image redistribution or commercial training
  rights.
- Every materialised sample needs a content hash, source URL, licence evidence,
  provenance, privacy review, and retention decision.
- Per-file or per-image terms override a dataset landing page.
- Evaluation-only records cannot generate teacher targets or distillation data.
- Lythaus-owned records require a capture or generator release identifier for
  every sample before training or distillation can be enabled.
- Public availability, a GitHub repository, or a paper does not establish
  commercial training rights.

## Candidate decisions

| Candidate | Main use | Current classification | Decision |
|---|---|---|---|
| Open Images V7 | Curated camera/hard-negative evaluation | `APPROVED_WITH_CONDITIONS` | Verify each image licence; do not redistribute URLs as images |
| COCO | Camera/hard-negative evaluation | `UNCLEAR` | Legal review before training or distillation |
| Unsplash | Camera-native evaluation | `APPROVED_WITH_CONDITIONS` | No bulk corpus without written review of anti-compilation and releases |
| Wikimedia Commons | Diverse hard negatives and camera imagery | `APPROVED_WITH_CONDITIONS` | Per-file licence, attribution, privacy, and consent audit |
| RAISE-1k | Camera-native benchmark | `REQUIRES_PERMISSION` | Official page states non-commercial research/education use; commercial training or distillation needs permission |
| MIT-Adobe FiveK | RAW/retouched camera study | `REQUIRES_PERMISSION` | Request permission; do not train commercially |
| HDR+ | Computational photography | `REQUIRES_PERMISSION` | Permission-gated research candidate |
| GenImage | Multi-generator evaluation | `UNCLEAR` | Research reference only until image terms are verified |
| DiTFake | Unseen DiT-generator evaluation | `UNCLEAR` | Evaluation candidate; no training inference |
| T2I-CoReBench | Current generator diversity | `UNCLEAR` | Future evaluation after source and closed-generator review |
| GPT-ImgEval | Closed-generator evaluation | `REQUIRES_PERMISSION` | Permission required |
| FaceForensics++ | Face manipulation research | `REQUIRES_PERMISSION` | Excluded from WP002 due to biometric/privacy risk |

Hard negatives should preferentially be assembled from a small, individually
audited manifest containing CGI, 3D renders, digital paintings, scans, game
screenshots, memes, composites, edited photographs, medical/scientific images,
and screenshots. No item is commercially approved merely because its category
is useful.
