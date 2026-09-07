# WP002 Final Report — Measurement, Dataset & Model Evaluation Readiness

**PR:** #539  
**Branch:** `agent/wp002-measurement-evaluation`  
**Head SHA:** `e54f7b55c1ab2148d39229909d7b23a2b8fc6e62`  
**Merge SHA:** `6c5eb0f0dd6fb361f0ee05d6a3d9069ecca20aa1`  
**Merged:** 9 August 2026  
**Outcome:** PARTIAL at completion; repository work complete, live-provider evidence initially unavailable

## A. Executive outcome

WP002 expanded the foundation into a decision-quality measurement/licensing/evaluation programme. It deliberately reported `UNKNOWN` where live Cloudflare access or legal evidence was unavailable rather than inferring facts. No deployment, model download, training run, migration, paid provider or enforcement change occurred.

## B. Repository changes

WP002 added or expanded:

- Cloudflare readiness report;
- cost baseline;
- model-assessment report;
- dataset/licence registry (Markdown + JSON);
- Benchmark v0 specification/schema;
- evaluation contracts and metrics;
- transformation stability metrics;
- camera-origin research plan;
- generator-fingerprint atlas design;
- teacher-to-student distillation plan;
- model manifests for SAFE, GRIP, spectral, camera, reconstruction candidates, Student v0, GPT-OSS-20B and a semantic-vision watchlist;
- local-ML runbook updates and tests.

No database migration or infrastructure mutation was introduced.

## C. Validation

Reported WP002 results:

- WP002 suite: 19 passed.
- Coverage: 89.77% lines / 85.50% functions.
- Native architecture: 31 passed.
- Native and targeted TypeScript checks: passed.
- Resource/Hyperdrive/Worker/retired-provider validators: passed.
- Thermal plan: passed, unattended training disabled.
- JSON schema parsing and `git diff --check`: passed.
- Live Wrangler inventory was blocked by the saved expired credential at that time.
- Container dry-run was initially blocked by missing local workspace/container dependency hydration; no deployment attempted.

## D. Cloudflare readiness conclusion at WP002

Repository registry showed reusable existing resources such as the Jobs Worker, quarantine R2, Jobs Hyperdrive, audit R2, KV feature flags and existing queues/workflows. Live account eligibility/usage/billing/routes/limits remained UNKNOWN in the WP002 execution, so the Container decision remained `DO_NOT_PROCEED` until live evidence and owner approval.

## E. Dataset findings

The policy shift was to separate dataset rights into:

- Class A — commercial training;
- Class B — evaluation only;
- Class C — Lythaus-owned.

WP002 findings included:

- Open Images / Wikimedia: usable only with per-file rights diligence.
- Unsplash: distinguish ordinary website imagery from the dedicated Dataset product.
- RAISE-1k / MIT-Adobe FiveK / HDR+: permission/commercial-rights work required.
- COCO / GenImage / DiTFake / T2I-CoReBench: unclear for intended commercial training; do not infer rights.
- GPT-ImgEval: permission-gated.
- FaceForensics++: access/privacy/biometric concerns; not a default acquisition.

At WP002 completion no third-party dataset was declared fully cleared for the intended commercial student-training path.

## F. Model findings

### SAFE

Role: conditional TEACHER/BASELINE. Repository code Apache-2.0, but checkpoint/data/foundation/dependency rights were not inferred from the repository licence. Multi-GPU training path and CPU/container feasibility remained unverified. No artefact downloaded.

### GRIP CLIP

Role: independent CONTROL/possible TEACHER. Apache repository code, but detector weights, upstream CLIP/open_clip and training-data rights required separate review. CPU feasibility unverified. No artefact downloaded.

### Spectral/phase branch

Role: Lythaus-owned BASELINE. Deterministic multi-scale FFT magnitude/phase, DCT, wavelets, residual/compression evidence. CPU-feasible, provider-independent, auditable. Recommended as the first measurement implementation.

### Camera-origin branch

Role: Lythaus-owned BASELINE evidence only. Metadata/encoding/CFA/noise/optics/screen-recapture research plan. Explicitly not a solved “camera authentication” model.

### Reconstruction family

DIRE, LaRE² and ADRD retained as EXPERIMENTAL/WATCHLIST candidates for occasional escalation. Compare compute, rights, generalisation, transformation stability and localisation; do not preselect production use.

### Lythaus Student v0

Design-only compact CPU fusion model using approved teacher outputs plus deterministic EF1–EF5/camera/spectral features. Training remained prohibited pending corpus/teacher rights and compute gates.

### GPT-OSS-20B

Role: Judge/reasoning interface only; never a detector or direct enforcer.

## G. Evaluation metrics locked

Required metrics include FPR, FNR, precision, recall, F1, AUROC, AUPRC, Brier/ECE calibration, abstention, per-generator and unseen-generator results, transformation and hard-negative results, latency, memory, CPU time and cost.

Policy target: human-content FPR <=1% overall; material subgroup/language rate >2% triggers mitigation/review.

## H. Reconstruction / spectral / camera conclusion

- First implementation priority: deterministic spectral/phase baseline.
- Reconstruction: compare candidate family as escalation only.
- Camera-origin: implement cheap deterministic evidence now; keep PRNU/device attribution fragile/research-only.

## I. Benchmark v0 design

Target 320 source images and up to 2,880 transformation descendants:

- 80 camera-native;
- 80 AI-generated;
- 40 CGI/digital art;
- 20 scans/scientific/medical;
- 30 screenshots/composites;
- 40 partial edits;
- 30 reserved unseen holdout.

No large corpus was to be downloaded merely to hit counts.

## J. Distillation design

Student v0 consumes deterministic/forensic features and only rights-approved teacher outputs/human labels. Distillation from proprietary API output is prohibited unless terms expressly permit it.

## K. Local hardware position

CPU package telemetry remained unavailable; Tctl/Tdie=0°C rejected. Thermal qualification not run. Safe: attended preprocessing/transforms/features/benchmark/calibration/small CPU experiments. Prohibited: unattended/overnight training, major neural training, full SAFE, large VLM/ViT/video training.

## L. Cost position

New recurring spend: $0. Existing Workers Paid base is separate from incremental experiment spend. Container and Workers AI experiments must be bounded under the owner-approved US$10/month incremental R&D ceiling.

## M. WP003 recommendation

`CONDITIONAL GO`: proceed to deterministic forensics, rights-cleared benchmark curation, transformation evaluation and offline teacher comparison. Keep deployment, unattended training, model enforcement and user-content training disabled.
