# Lythaus Authenticity AI - Dataset Acquisition and WP003 Preparation Report

**Assessment date:** 2026-08-09
**Outcome:** `PARTIAL`
**Enforcement:** disabled; research/shadow mode only
**User-content training:** prohibited
**Repository baseline:** `origin/main` at `6c5eb0f0dd6fb361f0ee05d6a3d9069ecca20aa1`

WP003 produced reproducible provenance and transformation tooling, a legally
conservative external evaluation slice, deterministic spectral/camera
features, rights registries, leakage controls, and decision-quality cost and
Cloudflare reports. It is `PARTIAL` because no Class A commercial training
corpus has been cleared, the 320-source benchmark target is not complete, live
Cloudflare account evidence was unavailable in this session, and third-party
model artefact rights remain unresolved.

## A. Dataset Acquisition

The official Unsplash Dataset Lite archive was materialised into the external
task cache. The archive SHA-256 is
`aa0fcbb859040ed64e93817d1d878d0c6f861763283261ba1a6aa5d8d4af6aec6`; the
terms snapshot SHA-256 is
`79bec96fe07431e1c40efcdf9f9753da24338a3cb97d7d22ac29dc830e3e2437`.

The reproducible tool at
`ml/datasets/tools/materialise/materialise.mjs` fetches/validates manifests,
hashes files, computes perceptual hashes, records provenance, assigns rights
classes, plans/applies transformations, and fails closed for unclear rights.
No ordinary downloaded Unsplash website images were substituted for the
dedicated dataset.

## B. Commercial Training Corpus

**Currently trainable commercially:** none.

The Unsplash Lite terms expressly describe internal business ML training, but
the captured terms do not clearly grant all intended Lythaus rights for
commercial deployment of trained weights, a commercial API, sublicensing, or
continued use after termination. It is therefore registered conservatively as
`CLASS_B_EVALUATION_ONLY`, `trainingGate=DO_NOT_TRAIN`, and
`distillationGate=DO_NOT_TRAIN` pending written clarification.

No Open Images image entered Class A because rights must be verified per image;
URLs and annotations alone are not sufficient proof. No restricted dataset was
used for training or distillation.

## C. Evaluation-Only Corpus

The materialised corpus contains:

- 80 camera-metadata-selected Unsplash Dataset Lite originals;
- 720 deterministic descendants;
- 800 total benchmark records;
- 80 source families, all in `EVALUATION_ONLY`;
- `containsUserContent=false`;
- all records Class B with `DO_NOT_TRAIN` and `DO_NOT_TRAIN` distillation gates.

This is an internal, provenance-first evaluation slice. It is not a complete
Benchmark v0 and it is not a claim that the terms permit public redistribution
or public comparison results.

## D. Lythaus-Owned Dataset

The camera-capture pipeline is documented in
`docs/runbooks/lythaus-owned-camera-dataset.md`. The synthetic corpus design
records generator/version/checkpoint/prompt/seed/sampler/terms/hash fields,
but no large synthetic corpus was generated because output and model terms
were not verified. No contributors were contacted or enrolled automatically.

## E. Rights-Holder Targets

Codex prepared the dossier but did not contact anyone or negotiate terms.

1. `HIGH`: MIT-Adobe FiveK - RAW-to-retouched camera/editing pairs.
2. `HIGH`: HDR+ - computational photography, burst, HDR and low-light evidence.
3. `HIGH`: RAISE-1k - camera-native metadata and high-resolution imagery.
4. `MEDIUM`: GPT-ImgEval - current proprietary-generator evaluation and edits.
5. `MEDIUM`: FaceForensics++ - local/face manipulation, subject to biometric
   and permission review.
6. `MEDIUM`: Unsplash Dataset Lite clarification - commercially useful terms
   may be clarified without assuming rights.
7. `LOW`: GenImage - broad coverage, but lineage/terms require diligence.
8. `LOW`: DiTFake - newer transformer-generator holdout, rights unclear.

The detailed score and contact routes are in
`docs/reports/dataset-rights-holder-outreach.md`. Human outreach is required
for every restricted/high-value target.

## F. SAFE

SAFE remains `KEEP_AS_TEACHER` in research architecture, but its download
decision is `NEEDS_PERMISSION`. The upstream repository code is Apache-2.0 and
documents a pretrained checkpoint and a four-GPU training path. The separate
checkpoint, data, foundation encoder, dependencies, and derived-weight rights
are not cleared. No weight was downloaded.

## G. GRIP

GRIP remains `KEEP_AS_CONTROL`/possible teacher, but its download decision is
`NEEDS_PERMISSION`. The repository code is Apache-2.0; Git-LFS weights,
upstream CLIP/open_clip, dependencies, and training data require separate
clearance. No weight was downloaded.

## H. Reconstruction

The reconstruction family remains escalation-only research. LaRE2, DIRE, and
ADRD were compared without preselecting a production candidate. LaRE2 is the
first candidate to evaluate if rights clear because its latent reconstruction
approach is designed to reduce extraction cost. DIRE remains a useful reference
but is compute-heavy. ADRD is a newer watchlist candidate with MIT code and
strong GPU guidance, but weights/data rights remain unknown. No artefact was
downloaded.

## I. Spectral Baseline

The Lythaus-owned deterministic v1 branch produces multi-scale FFT magnitude
and phase, DCT, wavelets, residuals, compression features, and a fixed
169-element vector. It is integrated into `ForensicFeatureBundle` and is
explicitly evidence-only.

On 80 external camera originals, execution was 554-1,990 ms with a 1,074.03 ms
mean. A conservative periodic moire proxy ranged from 0 to 0.076059 with mean
approximately 0.000969. No neural score was generated and no enforcement
decision was possible.

## J. Camera Baseline

The deterministic camera branch currently measures metadata/provenance,
quantisation, encoder markers, channel correlation, residual noise, edge
coherence, chromatic consistency, and screen/moire indicators. It reported
`CAMERA_NATIVE_LIKELY` for all 80 selected records, with no screen-recapture
likely result after the proxy correction.

This is not camera authentication. No cryptographic provenance was present,
and the branch cannot infer AI generation from missing camera evidence.

## K. Benchmark v0

The target remains 320 source images: 80 camera-native, 80 AI-generated, 40
CGI/digital art, 20 scan/scientific/medical, 30 screenshot/composite, 40
partial synthetic, and 30 unseen holdout. It was not padded.

The current exact materialisation is 80 camera-native sources and 800 records
including transformations. Source media, manifest hashes, archive hash, and
terms hash are recorded in `ml/evaluation/BENCHMARK_V0_MATERIALISATION.md`.

## L. Transformations

The tool generated nine descendants per source: JPEG95, JPEG75, resize75,
resize50, crop10, blur, sharpen, metadata stripped, and screenshot-style
resampling. Parent/child IDs, inherited rights, hashes, dimensions, and
transformation names are recorded. There are 720 descendants. Screen
recapture and inpainting remain planned fixtures, not falsely simulated as
completed source categories.

## M. Feature Store

`ml/evaluation/feature-store.mjs` and `ml/evaluation/extract-features.mjs`
write regenerable, hash-keyed JSON records outside Git. Each record includes
dataset/sample/source-family IDs, feature schema, spectral/camera/compression
features, transformation lineage, and an empty future-teacher-score list. Raw
media and large feature stores are not committed.

The current external store contains 80 regenerated v1 bundles and an index.

## N. Dataset Leakage Controls

The provenance contract rejects unclear rights for training and prevents
source-family partitions from crossing `TRAIN`, `CALIBRATION`, `KNOWN_TEST`,
`UNSEEN_TEST`, and `EVALUATION_ONLY`. Every transformed descendant retains the
source-family ID. The WP003 tests include a prohibited original/train versus
descendant/test split and pass.

## O. Privacy

The materialiser flags GPS, creator, owner, serial, face/biometric, and medical
metadata categories. The Unsplash slice flagged source GPS/creator metadata in
provenance where present; precise GPS was not copied into benchmark records or
feature-store records. Original research files stay in the external protected
cache; routine feature records contain hashes and evidence, not raw metadata
blobs. A future Lythaus-owned flow must retain a restricted research original
only when justified and create a privacy-safe derived representation.

## P. Local Machine

The HP Laptop 15-fc0xxx remains CPU-only. Non-elevated LibreHardwareMonitor
did not expose trustworthy CPU-package telemetry; `Tctl/Tdie=0 C` was rejected.
Thermal qualification has not passed. Unattended training remains prohibited.

Allowed now: short attended preprocessing, transformations, deterministic
feature extraction, benchmark calculations, and small classical/ML experiments.
Prohibited: overnight/unattended training, full SAFE, large ViT/VLM, video
models, gpt-oss training, and unbounded processing.

## Q. Cloudflare

The existing proof skeleton is `VERIFIED_REPO` and structurally reuses the
quarantine R2 and Jobs Hyperdrive with `lite`, one maximum instance, no queue
consumer, and the proof flag disabled. Live resources, bindings, eligibility,
limits, usage, and billing are `UNKNOWN/BLOCKED` in this session because the
account-control MCP tool was unavailable and Wrangler authentication was
expired. No deployment or resource mutation occurred.

Recommendation for a separately approved future experiment:
`PROCEED_TO_CPU_CONTAINER_PROOF` with a one-instance, one-hour maximum active
time, published-rate estimate, kill switch, and rollback.

## R. Cost

New provider spend observed: **US$0.00**. Current Cloudflare account spend:
`UNKNOWN`. The published-rate gross bound for one `lite` instance is about
`US$0.007254/hour` before included plan allowances. No model inference, paid
dataset, GPU, or recurring resource was created. The plan remains compatible
with the US$10/month ceiling only because future remote experiments are gated
and bounded.

## S. Human Actions

1. Restore/read-enable the Cloudflare account-control MCP or an equivalent
   read-only credential and review the live resource/cost audit.
2. Review the external Unsplash Lite terms classification; obtain written
   clarification if Class A training, derived weights, commercial API use, or
   post-termination use is desired.
3. Conduct rights-holder outreach and negotiate the requested non-exclusive
   training, distillation, transformation, storage, weights, deployment, and
   API rights for restricted targets.
4. Approve or reject any future SAFE/GRIP/reconstruction artefact acquisition
   after separate code, weight, encoder, dependency, and dataset diligence.
5. Run the elevated LHM proof command in the local runbook and return the JSON;
   do not treat it as valid unless it identifies a dynamic CPU-package sensor.
6. Separately approve or reject a bounded Container dry-run after live
   Cloudflare and billing evidence is available.

## T. WP003/WP004 Recommendation

**`CONDITIONAL GO`.** Proceed with deterministic forensics, provenance,
benchmark completion from rights-cleared sources, rights-holder outreach,
feature-store regeneration, and measurement contracts. Do not proceed to
production authenticity model enforcement, third-party model deployment,
student training, unrestricted dataset acquisition, or user-content training.

The next model-integration gate requires at least one Class A or Class C corpus,
cleared teacher artefacts, a complete benchmark with unseen generators and hard
negatives, valid thermal telemetry or approved compute, and human approval for
any remote inference or Container mutation.
