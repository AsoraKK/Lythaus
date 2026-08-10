# Lythaus Authenticity AI Model Rights and Evaluation - WP003

**Status:** no external model artefact was downloaded, activated, or used for
training. Code, weights, foundation encoders, datasets, dependencies, and
derived-model rights were reviewed separately.

## Ranked model decisions

| Candidate | Role | Code licence | Weights/data | Technical fit | Decision |
|---|---|---|---|---|---|
| SAFE | Teacher | Apache-2.0 repository | Checkpoint and training-data rights unresolved | Strong transformation/generalisation research; upstream training uses four GPUs; CPU inference and RAM unmeasured | `NEEDS_PERMISSION` |
| GRIP CLIP | Control/teacher | Apache-2.0 repository | Git-LFS weights, upstream CLIP/open_clip and data rights unresolved | Lightweight CLIP strategy with reported degraded/unseen-generator robustness; upstream example is CUDA-oriented | `NEEDS_PERMISSION` |
| LaRE2 | Reconstruction experiment | Apache-2.0 repository | DIFT/LASTED dependencies, weights and GenImage rights unresolved | Lower extraction cost than full reconstruction in the paper; still requires foundation models and GPU-oriented research stack | `RESEARCH_ONLY` |
| DIRE | Reconstruction experiment | No repository licence verified | Diffusion reconstruction dependencies, weights and dataset rights unresolved | Established reconstruction evidence but high compute and latency for escalation-only use | `RESEARCH_ONLY` |
| ADRD | Reconstruction watchlist | MIT repository | Weights and training data rights unresolved | Newer perturbation/reconstruction behaviour; strong GPU recommended, at least 16 GB RAM stated | `RESEARCH_ONLY` |
| Lythaus spectral branch | Deterministic baseline | Lythaus-owned | No model weights | CPU-compatible, reproducible, no external model rights | `APPROVE_DETERMINISTIC_ONLY` |
| Lythaus camera branch | Deterministic evidence | Lythaus-owned | No model weights | CPU-compatible evidence extraction; not camera authentication | `APPROVE_DETERMINISTIC_ONLY` |

## SAFE decision package

- **Code licence:** Apache-2.0 is visible on the upstream repository.
- **Weight licence:** `UNKNOWN`; the repository documents a pretrained
  `checkpoint-best.pth`, but its separate weight grant was not verified.
- **Training data rights:** `UNKNOWN`; the repository references several
  external datasets with separate terms.
- **Upstream model rights:** PyTorch/torchvision and any encoder/checkpoint
  terms require separate review.
- **Commercial research:** `UNKNOWN` until weight, data, and dependency rights
  are documented.
- **Distillation:** `DO_NOT_TRAIN`.
- **CPU feasibility/RAM/weight/download size:** `UNKNOWN`; not downloaded or
  measured.
- **Artifact hash source:** unavailable because no artifact was acquired.
- **Classification:** `NEEDS_PERMISSION`; do not download until all rights are
  recorded and the owner approves the controlled research use.

SAFE remains a possible **teacher**, not a production candidate. The upstream
README describes a four-GPU training script and a supplied checkpoint; that is
useful evidence of research value, not commercial clearance.

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

No candidate is approved for download, distillation, deployment, or
enforcement. A future experiment must compare generalisation, transformations,
latency, localisation, memory, and licence terms on an approved corpus.

## Research sources

- [SAFE repository](https://github.com/Ouxiang-Li/SAFE)
- [GRIP CLIP repository](https://github.com/grip-unina/ClipBased-SyntheticImageDetection)
- [DIRE repository](https://github.com/ZhendongWang6/DIRE)
- [LaRE2 repository](https://github.com/luo3300612/LaRE)
- [ADRD repository](https://github.com/ezell-chou/adrd)

Repository pages establish code-level facts only. They do not establish the
licence of included weights, upstream encoders, or training datasets.
