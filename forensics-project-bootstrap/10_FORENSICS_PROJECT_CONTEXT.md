# FORENSICS_PROJECT_CONTEXT

**Project:** Lythaus Forensics

**Purpose:** project-only workspace for the internal science and engineering of Lythaus authenticity/visual-origin forensics.

**Scope:** image authenticity first. Video/audio later.

**Canonical source:** `AsoraKK/Lythaus`.

**Do not use active Asora/Azure/Hive architecture.** Lythaus is the current product; Azure was retired and Hive is superseded.

## Architecture

Lythaus Authenticity AI is not one detector.

- **Lythaus Safety**: harmful-content/platform moderation.
- **Lythaus Forensics**: provenance, physical acquisition, synthesis, manipulation and transformation evidence.
- **Lythaus Judge**: structured evidence reasoning; first candidate `gpt-oss-20b`.
- **Deterministic policy code**: only final enforcement authority.

Moderation and authenticity remain separate.

Cloudflare-first:
- `lythaus-public-api`
- `lythaus-admin-api`
- `lythaus-jobs`
- R2, Queues, Workflows, KV, Workers AI, AI Gateway and bounded Containers
- PlanetScale PostgreSQL via Hyperdrive
- GitHub canonical CI/CD
- exact reviewed/merged `main` SHAs
- one active hosted startup environment until scale/risk requires more.

## Forensic evidence

Five mandatory families:
1. **EF1 File/provenance** — hashes, MIME, EXIF/XMP, C2PA, encoding/compression, screenshots.
2. **EF2 Physical acquisition** — CFA/demosaic, noise, optics/ISP, screen recapture, moire.
3. **EF3 Generative** — specialist synthetic features/classifiers, latent/global structure, generator-family evidence.
4. **EF4 Spectral/stability** — FFT magnitude/phase, DCT, wavelets, residuals, transformation trajectory.
5. **EF5 Reconstruction/local manipulation** — inpainting, reconstruction discrepancy, mixed-origin/local-generation evidence.

Camera evidence and synthetic evidence are independent axes. Missing camera evidence never means AI.

Abstain/Under Review when evidence conflicts, transforms are unstable, input is OOD/low quality, evaluation is insufficient or tools fail.

## Public policy

Public labels:
- Human-authored
- AI-assisted
- AI-generated
- Under review

No public numeric confidence.

Human text: allowed/Discovery/reputation. AI-assisted text <=249 user-perceived Unicode characters after normalisation/trim may be allowed with label, Discovery eligible, no authorship reputation; >=250 blocked. AI-generated public content blocked. AI-assisted/generated public images/video blocked. Human media are policy-allowed but feature-gated until safety/authenticity gates pass.

Spellcheck, grammar, formatting, accessibility assistance and transcription of own speech do not automatically count as AI assistance.

## Model strategy

Current Lythaus-owned baseline:
- deterministic spectral/phase + camera evidence;
- fixed 169-element feature vector;
- no model enforcement.

Third-party research:
- SAFE: conditional teacher; checkpoint/data/commercial/distillation rights unresolved.
- GRIP CLIP: conditional control/teacher; weights/upstream CLIP/data rights unresolved.
- reconstruction: compare LaRE2, DIRE, ADRD; escalation research only.
- semantic vision: structured observer only.
- `gpt-oss-20b`: Judge only.
- `gpt-oss-120b`: deferred.

Long-term: proprietary Lythaus Student trained from rights-clean Lythaus/licensed data, deterministic EF1-EF5, approved teacher outputs and human truth labels.

Student v0 is small CPU fusion. Do not train until commercial data and teacher rights clear.

## Evaluation gates

Human false-positive target: **<=1% overall**.

Material subgroup/language rate **>2%** requires mitigation/review.

Measure FPR/FNR, precision/recall/F1, AUROC/AUPRC, Brier/ECE, abstention, hard negatives, per-generator, unseen generator, transformations, latency, memory, CPU and cost.

Blocking-capable models require model cards, dataset lineage, independent Lythaus evaluation, shadow mode, rollback and appeal testing.

## Data

Known assets:
- Unsplash Dataset Lite: official 25,000-image dataset; owner confirms Lythaus approved access/use; exact repo rights classification needs sync.
- WP003 Unsplash slice: 80 originals + 720 descendants.
- CSAFE smartphone database: ~50,000 JPEGs / 60 phones / 123.62 GB / CC BY 4.0; owner began download; local completion unverified.
- 1,000+ potential Lythaus/personal originals; not formally ingested.

Still need:
- known native camera originals;
- rights-clean known-generator synthetic corpus;
- partial AI edits + masks;
- hard negatives;
- unseen-generator holdout.

Normal Lythaus user uploads are not training data by default.

## Local compute

HP 15-fc0xxx; Ryzen 7 7730U; 16 GB RAM; CPU-only.

AMD Tjmax: 95 C.

Lythaus safety:
- 40% CPU target;
- 50% ceiling;
- 75 C pause;
- 85 C stop;
- resume <65 C stable 120 s;
- <=6 GB process RAM;
- >=4 GB free RAM;
- >=80 GB free disk;
- AC required.

LHM non-elevated telemetry failed (`Tctl/Tdie=0 C` rejected). Unattended training prohibited. Short attended preprocessing/features/benchmarks allowed.

## Cloudflare/cost

Owner has Workers Paid.

Current published planning facts at 2026-09-07:
- Workers Paid minimum: US$5/month.
- Workers AI: 10,000 neurons/day free; US$0.011/1,000 above.
- Container `lite`: 1/16 vCPU, 256 MiB, 2 GB; WP003 gross planning bound ~US$0.007254/active hour before included allowances.

R&D ceiling: US$10/month unless owner approves otherwise.

Container proof remains undeployed. No automation may create external GPU/new paid provider/change billing without approval.

## Work-package lineage

- WP001 — PR #538, merge `94ea99fb...`: architecture/evidence/ECO-TRAIN.
- WP002 — PR #539, merge `6c5eb0f...`: dataset/model/licence/benchmark readiness.
- WP003 — PR #540, commit/merge `2efe6de...`: materialisation, 80-source slice, 169-feature deterministic baseline, feature store and rights controls.

## Immediate objective — WP004

1. sync Unsplash rights status;
2. verify/ingest CSAFE if local download is complete;
3. ingest Lythaus-owned camera originals;
4. create rights-clean synthetic corpus with multiple known generators;
5. create partial-edit corpus + masks and hard negatives;
6. reserve an unseen generator;
7. complete balanced Benchmark v0;
8. extract deterministic features across original/transformed media;
9. fit simple calibrated baselines;
10. run evidence-family ablations;
11. only then measure incremental SAFE/GRIP/reconstruction value if rights clear.

No production deployment. No authenticity enforcement. No unbounded local training. No user-content training.
