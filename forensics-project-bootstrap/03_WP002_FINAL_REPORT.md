# WP002 Final Report — Measurement & Evaluation Readiness

Historical execution status: **PARTIAL**, because live Cloudflare verification was unavailable at execution time.

Repository integration: **MERGED / ACCEPTED**.

PR: #539

Branch: `agent/wp002-measurement-evaluation`

Head: `e54f7b55c1ab2148d39229909d7b23a2b8fc6e62`

Merge: `6c5eb0f0dd6fb361f0ee05d6a3d9069ecca20aa1`

Merged: 2026-08-09

## A. Executive outcome

WP002 built the measurement, dataset/licensing, model-selection and benchmark-readiness layer required before model integration.

It preserved:
- `AUTHENTICITY_ENFORCEMENT_ENABLED=false`;
- research/shadow mode;
- no model deployment;
- no user-content training;
- no Cloudflare mutation;
- no external GPU/new paid provider.

The `PARTIAL` status reflected unavailable live-provider evidence, not incomplete repository implementation.

## B. Repository changes

Added/expanded:
- Cloudflare readiness report;
- bounded cost baseline;
- dataset/licence registry and machine-readable form;
- Benchmark v0 specification/schema;
- evaluation metrics;
- transformation robustness contracts;
- model assessment and manifests;
- SAFE/GRIP/reconstruction-family entries;
- camera-origin research plan;
- generator fingerprint atlas design;
- teacher-to-student distillation design;
- cost controls and safety tests.

No migrations, model downloads or infrastructure changes were introduced.

## C. Validation

Merged PR evidence:
- WP002 authenticity suite: 19 passed;
- coverage: 89.77% lines / 85.50% functions;
- native architecture: 31 passed;
- native TypeScript: passed;
- targeted authenticity TypeScript: passed;
- resource registry/native Worker/retired-provider/Hyperdrive-manifest validation: passed;
- thermal plan: passed; unattended disabled;
- JSON schema parsing: passed;
- `git diff --check`: passed.

Historical external limitations:
- Wrangler live inventory blocked by expired non-interactive credential;
- Container dry-run blocked by missing local workspace/package hydration;
- no deployment attempted.

## D. Cloudflare readiness

Repository evidence identified reusable structures:
- public API;
- jobs Worker;
- admin API;
- quarantine R2;
- audit R2;
- config KV;
- Jobs Hyperdrive;
- existing queues/DLQs;
- Workflows;
- Workers AI binding;
- disabled Container proof.

Critical queue rule: do not add an extra consumer to a mixed queue. A future proof must use a narrowly typed, idempotent routed event.

Historical live account facts remained `UNKNOWN`.

## E. Dataset findings at WP002

Conditional/evaluation candidates:
- Open Images V7 — per-image rights required;
- Unsplash — use dedicated dataset terms, not arbitrary website downloads;
- Wikimedia Commons — per-file licence/attribution/privacy review.

Permission-gated:
- RAISE-1k;
- MIT-Adobe FiveK;
- HDR+;
- GPT-ImgEval;
- FaceForensics++ with additional biometric/privacy concern.

Unclear for intended commercial-model use:
- COCO;
- GenImage;
- DiTFake;
- T2I-CoReBench.

WP002 approved no dataset for commercial Student training.

## F. SAFE

Role: conditional TEACHER / baseline.

Known:
- repository code recorded Apache-2.0;
- useful transformation/generalisation research direction.

Unresolved:
- checkpoint licence;
- encoder/backbone terms;
- training data lineage;
- commercial use;
- distillation/derived-weight rights;
- CPU/ONNX/quantisation viability;
- Lythaus benchmark performance.

Conclusion: `KEEP_AS_TEACHER` conditionally. Never a sole blocker.

## G. GRIP CLIP

Role: independent CONTROL / possible teacher.

Known:
- repository code recorded Apache-2.0;
- CLIP-feature approach;
- useful degraded/unseen-generator research control.

Unresolved:
- detector weights;
- upstream CLIP/open_clip rights;
- training data;
- commercial/distillation rights;
- CPU/container fit.

Conclusion: `KEEP_AS_CONTROL` conditionally.

## H. Spectral/phase

Recommended first Lythaus-owned measurement branch:
- multi-scale FFT magnitude;
- FFT phase;
- DCT;
- wavelets;
- high-pass residual;
- compression features.

Reason:
- provider independent;
- deterministic/auditable;
- CPU feasible;
- ownable;
- useful for transformation trajectories.

## I. Reconstruction family

Candidates:
- DIRE;
- LaRE2/LaRE²;
- ADRD;
- newer credible methods.

No production candidate preselected.

Compare:
- reconstruction dependency;
- passes;
- GPU/CPU;
- memory;
- local-region utility;
- unseen-generator performance;
- transformation stability;
- rights/licences.

Use, if justified, as occasional escalation evidence rather than universal inference.

## J. Camera-origin research

Implement evidence, not authentication:
- metadata/provenance;
- CFA/demosaicing;
- sensor/noise;
- optical/edge/ISP evidence;
- screen recapture;
- moire.

PRNU/device attribution remains fragile/device-dependent research.

## K. Student plan

### Student v0
Small CPU fusion of:
- deterministic EF1-EF5;
- camera features;
- spectral features;
- rights-cleared teacher outputs;
- human truth labels.

### Student v0.5
Adds frozen/precomputed visual embeddings.

### Student v1
Compact multi-branch image model.

No training until data, teacher-rights, benchmark and compute gates pass.

## L. GPT-OSS-20B

Role: Judge/reasoner.

Never:
- standalone detector;
- sole authority;
- direct enforcer.

## M. Benchmark v0 design

Target 320 sources:
- 80 camera-native;
- 80 AI-generated;
- 40 CGI/digital art;
- 20 scan/scientific/medical;
- 30 screenshot/composite;
- 40 partial edits;
- 30 reserved unseen holdout.

Up to 2,880 descendants / roughly 3,200 records including originals.

## N. Required metrics

- FPR;
- FNR;
- precision;
- recall;
- F1;
- AUROC;
- AUPRC;
- Brier;
- ECE;
- abstention;
- per-generator;
- unseen-generator;
- per-transformation;
- hard negatives;
- latency;
- memory;
- CPU time;
- estimated cost;
- transformation stability.

Human-content false-positive target: <=1% overall. Material subgroup >2% triggers mitigation/review.

## O. Transformation robustness

Initial family:
- original;
- JPEG95;
- JPEG75;
- resize75;
- resize50;
- crop10;
- blur;
- sharpen;
- metadata strip;
- screenshot simulation.

Measure score/feature mean, variance, movement, flips and evidence-family stability. Fragile evidence should increase abstention, not authority.

## P. Rights/data governance

Every sample requires source, rights, hash, provenance, privacy, source-family ID and split. Descendants cannot cross train/test partitions.

Desired negotiated rights include commercial research, training/fine-tuning, feature extraction, transformations, distillation, derived samples/weights, retained weight use, production deployment and future paid Lythaus API use.

Normal Lythaus user uploads remain excluded from training by default.

## Q. Cost/local/security

New WP002 spend: US$0.

R&D ceiling: US$10/month unless separately approved.

Ryzen 7 7730U host remains CPU-only. Short attended preprocessing/benchmark/small classical work allowed; unattended work blocked without valid package telemetry.

No PII in ops logs. Large media/model artefacts stay outside Git and require hashes/provenance.

## R. Historical human gates

1. current Cloudflare read-only verification;
2. dataset/licence approval;
3. model code/weight/foundation/data rights;
4. bounded Container proof approval;
5. elevated LHM proof;
6. benchmark materialisation;
7. future model-download approval.

## S. WP003 recommendation

`CONDITIONAL GO` for deterministic forensics, legally clean benchmark curation, transformation evaluation and offline teacher comparison after rights clearance.

No model deployment, unattended training, Container deployment or authenticity enforcement.

## Later status

WP003 subsequently materialised 80 Unsplash Lite originals plus 720 deterministic descendants and implemented the fixed 169-element deterministic spectral/camera baseline.

The owner has since confirmed Lythaus has approved access/use of Unsplash Dataset Lite. The repository dataset registry still reflects the earlier conservative evaluation-only classification; sync the exact granted rights before treating Lite as commercial Student-training data.
