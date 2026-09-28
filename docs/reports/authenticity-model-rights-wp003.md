# Lythaus Authenticity AI Model Rights and Evaluation - WP003

**Status:** the pinned SAFE checkpoint was fetched only to verify the published
bytes and was not activated, loaded for inference, or used for training.
Code, weights, foundation encoders, datasets, dependencies, and derived-model
rights remain separately reviewed.

## Ranked model decisions

| Candidate | Role | Code licence | Weights/data | Technical fit | Decision |
|---|---|---|---|---|---|
| SAFE | Teacher | Apache-2.0 repository and published checkpoint path | Root Apache-2.0 licence supports a provisional reliance record; checkpoint-specific scope and training-data provenance are not explicit | Strong transformation/generalisation research; upstream training uses four GPUs; CPU inference and RAM unmeasured | `LICENCE_RELIANCE_REVIEW` |
| GRIP CLIP | Control/teacher | Apache-2.0 repository | Git-LFS weights, upstream CLIP/open_clip and data rights unresolved | Lightweight CLIP strategy with reported degraded/unseen-generator robustness; upstream example is CUDA-oriented | `NEEDS_PERMISSION` |
| LaRE2 | Reconstruction experiment | Apache-2.0 repository | DIFT/LASTED dependencies, weights and GenImage rights unresolved | Lower extraction cost than full reconstruction in the paper; still requires foundation models and GPU-oriented research stack | `RESEARCH_ONLY` |
| DIRE | Reconstruction experiment | No repository licence verified | Diffusion reconstruction dependencies, weights and dataset rights unresolved | Established reconstruction evidence but high compute and latency for escalation-only use | `RESEARCH_ONLY` |
| ADRD | Reconstruction watchlist | MIT repository | Weights and training data rights unresolved | Newer perturbation/reconstruction behaviour; strong GPU recommended, at least 16 GB RAM stated | `RESEARCH_ONLY` |
| Lythaus spectral branch | Deterministic baseline | Lythaus-owned | No model weights | CPU-compatible, reproducible, no external model rights | `APPROVE_DETERMINISTIC_ONLY` |
| Lythaus camera branch | Deterministic evidence | Lythaus-owned | No model weights | CPU-compatible evidence extraction; not camera authentication | `APPROVE_DETERMINISTIC_ONLY` |

## SAFE decision package

The detailed, owner-reviewable record is
[`safe-a-v0.1-license-reliance.md`](../models/safe-a-v0.1-license-reliance.md).

- **Code and published checkpoint:** the pinned tree contains root Apache-2.0
  `LICENSE`, `checkpoint/checkpoint-best.pth`, and a README instruction to run
  that pretrained checkpoint for inference.
- **Checkpoint identity:** the pinned bytes are 5,840,638 bytes and hash to
  `b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e`, the
  frozen Lythaus identity.
- **Restrictions observed:** Apache notice and modification obligations,
  trademark exclusion, patent-termination language, and warranty disclaimer.
  No non-commercial, research-only, inference, or hosting prohibition was
  found.
- **Training data rights:** `UNKNOWN`; this is not treated as a proved ban on
  inference from the published checkpoint.
- **Dependencies:** PyTorch, torchvision, DWT, and other dependency terms are
  reviewed separately.
- **Distillation:** `DO_NOT_TRAIN`.
- **Classification:** `LICENCE_RELIANCE_REVIEW`; no separate maintainer
  permission is presumed universally necessary. Owner/legal review must record
  whether the root licence is relied on for the included binary checkpoint.

## GRIP decision package

- **Code licence:** Apache-2.0 repository licence verified.
- **Weight licence:** `UNKNOWN`; the repository instructs users to retrieve
  weights with Git LFS.
- **Foundation encoder rights:** `UNKNOWN`; CLIP/open_clip and their weights
  must be cleared independently.
- **Training data rights:** `UNKNOWN`.
- **Commercial research:** `UNKNOWN`.
- **Distillation:** `DO_NOT_TRAIN`.
- **CPU feasibility/RAM/weight/download size:** `UNKNOWN`; no artefact was
  downloaded or measured.
- **Artifact hash source:** unavailable because no artifact was acquired.
- **Classification:** `NEEDS_PERMISSION`.

GRIP remains a useful independent **control/teacher** candidate because its
published method targets degraded and out-of-distribution images. It is not a
production candidate until the complete dependency and weight chain is clear.

## Reconstruction comparison

This is an escalation-family review, not a production selection:

1. **LaRE2:** evaluate first if all dependency and weight terms clear; its
   latent reconstruction error is intended to reduce extraction cost, but the
   code documents GenImage and DIFT/LASTED dependencies.
2. **DIRE:** retain as a reproducibility reference; its CUDA-specific setup and
   diffusion reconstruction make it unsuitable for universal CPU inference.
3. **ADRD:** retain on the watchlist; the repository is MIT and explicitly
   describes perturbation-induced reconstruction discrepancy, but model/data
   rights and operational cost remain unresolved.

No candidate is approved for training, distillation, deployment, or
enforcement. SAFE's published checkpoint was fetched only for identity and
licence-scope verification; it has not been loaded for inference. A future
experiment must compare generalisation, transformations, latency, localisation,
memory, and licence terms on an approved corpus.

## Research sources

- [SAFE repository](https://github.com/Ouxiang-Li/SAFE)
- [GRIP CLIP repository](https://github.com/grip-unina/ClipBased-SyntheticImageDetection)
- [DIRE repository](https://github.com/ZhendongWang6/DIRE)
- [LaRE2 repository](https://github.com/luo3300612/LaRE)
- [ADRD repository](https://github.com/ezell-chou/adrd)

Repository pages establish the published licence and artifact facts recorded
above. They do not establish the licence of unrelated upstream encoders,
dependencies, or training datasets.
