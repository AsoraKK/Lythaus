# SAFE-A v0.1 model card

Status: **BLOCKED_RIGHTS / BLOCKED_RUNTIME**. No hosted beta or public authenticity enforcement is approved by this card.

| Identity | Frozen value |
| --- | --- |
| Detector | SAFE-A, upstream `Ouxiang-Li/SAFE` |
| Upstream commit | `4e998724651b227def64f5be0cd60c0aa1552c35` |
| Checkpoint SHA-256 | `b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e` |
| Preprocessing | `SAFE_OFFICIAL_RGB_CENTER_CROP_256_DWT_CLASS1_V1` |
| Threshold | `0.5864923000335693`, comparison `score >= threshold` |
| Threshold provenance | WP007G-R1 `NEGATIVE_CALIBRATION_G` |

The historical Python scorer supplies class-1 softmax. The historical TypeScript specialist compares with `>=`, including equality. Beta fixtures explicitly test below/equal/above. A raw score is an uncalibrated classifier output, never an AI probability, and is restricted to administrator diagnostics.

Exact inference converts RGB, center-crops 256 by 256 and applies `ToTensor` (division by 255, no mean/std normalization). The pinned upstream model is a two-class ResNet-50 variant using `DWTForward(J=1, mode='symmetric', wave='bior1.3')`, high-frequency component index 2, and its original internal resize. There is no additional orientation normalization, resizing, augmentation, quantization or alternate export runtime. CPU evaluation disables gradients, uses batch one and one intra/inter-op thread. The runtime lock and Dockerfile record dependency versions, wheel hashes and base-image digests. The final built image digest and measured parity remain unavailable.

The admission policy deliberately narrows decoded inputs to single-frame RGB PNG/JPEG, at least 256 pixels on each axis and at most 16,777,216 pixels and 10 MiB. HEIC, animation, other color modes, tiny images and untested formats return unsupported; they are not silently converted. Decode has a five-second limit; inference has a 90-second limit. Missing dependencies/checkpoints, checksum mismatch, timeout, decode error and invalid/nonfinite score yield null output with a failure state.

## Historical evidence and scope

| Record | Finding | Interpretation |
| --- | --- | --- |
| [WP007H pinned report](https://github.com/AsoraKK/Lythaus/blob/bcbadd676f8ff0670369de80d487d77a6613fcf5/research/wp007h/wp007h-final-report.md) | 155/160 synthetic detections on eight selected families | Bounded historical panel, not universal accuracy. |
| [WP007I pinned report](https://github.com/AsoraKK/Lythaus/blob/cce247e66be4de3fb0e927cc12e7a0c87d70561d/research/wp007i/wp007i-final-report.md) | 79/120 on six fresh families; 4/800 negative false positives | Substantial generator dependence; reported Wilson upper bound exceeded 1%. |
| WP007I | Seedream-4 and Imagen-4 were major misses | Small family denominators do not establish population coverage. |
| [WP007J-R1 pinned report](https://github.com/AsoraKK/Lythaus/blob/d6eb253b8e219d1920196fda037bae6b2e3caf4c/research/wp007j-r1/final-report.md) | Q95: 0/40 synthetic detections and 8/60 negative false positives | JPEG damages both sensitivity and specificity. |
| WP007I | Public and Cloudflare FLUX.1 scores differed materially | Cause unresolved; no generic FLUX coverage claim. |

These are the same configuration's different panels. Neither 96.9% nor 65.8% is general beta accuracy. SAFE cannot identify the generator of an arbitrary upload. Low SAFE is not human evidence; weak camera evidence is not synthetic evidence. PNG, metadata and original-upload status do not establish pristine history. JPEG-to-PNG conversion cannot restore lost evidence.

The frozen eight-source smoke manifest reuses already-used, nonsealed historical records and separately declares controlled descendants. It does not access FLUX.2 reserves, sealed EF2 material or future holdouts. Absolute tolerance `1e-6` and relative tolerance `1e-5` were selected before beta inference; a failure requires investigation rather than widening tolerance. No beta TP/FN/FP/TN or parity observations exist yet.

## Rights and supply chain

The existing model-rights record allows research evaluation and still requires deployment review. The upstream code license does not establish checkpoint hosting, redistribution, commercial deployment, distillation or derivative-weight rights. Build preparation verifies the pinned upstream license and source hashes and requires a separate private checkpoint-rights receipt. It never downloads arbitrary weights.

Decision required from the owner/rights decision-maker: identify evidence authorizing this exact checkpoint's hosting in a private Cloudflare Container image, restricted beta processing and the intended commercial context, including required notices and image distribution scope. Record the decision owner, evidence reference, permitted use and unresolved conditions. Until then, do not upload the checkpoint or build/push an image containing it. No new provider signup is needed.

Beta consent authorizes processing only. Optional future dataset consent remains disabled. User uploads, predictions, reviews and feedback are not training, calibration or distillation data.

## Advisory model

`GPT_OSS_BETA_ADVISOR` uses Cloudflare Workers AI `@cf/openai/gpt-oss-20b` through the existing AI Gateway. WP005B selected an architecture, not a primary Judge winner. This separately named integration grants no enforcement authority. It accepts sanitized bounded evidence, at most once per case, without tools or autonomous loops. The provider does not expose an immutable hosted-weight hash; do not invent one. Live advisory acceptance is still outstanding.
