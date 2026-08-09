# Lythaus Authenticity AI — Research Plan WP002

Status: `VERIFIED_REPO` for the design and contracts in this repository. External account state, unreviewed dataset terms, and unexecuted model experiments remain `UNKNOWN`.

This report keeps authenticity evidence separate from safety moderation. It is a research plan only: no model in this report has enforcement authority and no model artefact is bundled or deployed.

## Camera-origin research plan

Camera origin is an applicability-qualified evidence axis, not a proof of human authorship. Missing metadata or weak camera evidence must not be converted into a synthetic-origin classification.

| Method | Initial implementation | Cost | Properties | Boundary |
| --- | --- | --- | --- | --- |
| MIME, dimensions, EXIF/XMP, encoder and quantisation inspection | Deterministic | `CHEAP`, `TRANSFORMATION_RESISTANT` for some fields | Establishes file/provenance context and missingness | Cannot authenticate a camera by itself |
| CFA/demosaicing consistency | Deterministic feature candidate | `MODERATE`, `FRAGILE`, `DEVICE_DEPENDENT` | Tests whether colour-filter and ISP traces cohere | Sensitive to resizing, screenshots and computational photography |
| PRNU or sensor-noise correlation | Research-only device-linked feature | `EXPENSIVE`, `FRAGILE`, `DEVICE_DEPENDENT`, `RESEARCH_ONLY` | Potentially useful with a trusted reference device set | Not applicable to most submissions; requires reference images and privacy controls |
| Optical blur/chromatic aberration | Deterministic feature candidate | `CHEAP`, `FRAGILE`, `DEVICE_DEPENDENT` | Adds physical-camera consistency evidence | Scene content and post-processing confound it |
| ISP pipeline coherence | Deterministic plus calibration | `MODERATE`, `DEVICE_DEPENDENT` | Compares demosaicing, sharpening, denoising and colour behaviour | Model and firmware changes reduce portability |
| Screen recapture, moiré and display geometry | Deterministic feature candidate | `CHEAP`, `TRANSFORMATION_RESISTANT` for some cues, `FRAGILE` | Detects a photograph of a display as a distinct acquisition path | Does not establish the origin of the displayed image |
| Camera-evidence applicability | Deterministic contract | `CHEAP` | Records `applicable`, `unavailable` or `uncertain` per method | Absence is not synthetic evidence |

WP003 may implement the first four rows as reusable feature extractors and leave PRNU calibration, device attribution and broad camera authentication as research-only work.

## Generator fingerprint atlas design

The atlas is an internal clustering aid, not an attribution claim. It must be versioned independently from public classifications and must permit novelty and abstention.

```text
generator_family_embedding: vector reference or sealed artifact pointer
known_generator_family: string | null
distance_to_known_cluster: number | null
novelty_score: number | null
attribution_uncertainty: number | null
embedding_model_version: string
atlas_version: string
applicability: applicable | unavailable | uncertain
```

Required controls:

- Build clusters only from legally approved, provenance-recorded material.
- Keep generator family and exact model version distinct.
- Evaluate nearest-cluster distance on held-out generators and transformations.
- Do not expose cluster distance, novelty, or attribution as public confidence.
- Route high novelty, disagreement, or transformation instability to abstention/review in research mode.

## Teacher-to-student distillation plan

No teacher output is to be generated from proprietary APIs for commercial-model training unless the applicable terms expressly permit that use. Human labels and deterministic evidence remain independently auditable.

### Student v0

CPU-first tabular/classical model with these inputs:

- SAFE and GRIP scores when legally and technically approved;
- deterministic EF1–EF5 feature vector;
- camera-origin features and applicability states;
- spectral/phase, DCT, wavelet and residual features;
- reconstruction score only for samples where the escalation ran;
- human labels, with an explicit disagreement/unknown state.

Targets are synthetic-origin probability, camera-origin evidence state, manipulation applicability, and abstention. Use class-weighted supervised loss or calibrated logistic/gradient-boosted objectives, plus a disagreement penalty only where teacher labels are valid. Calibration must be fitted on a disjoint calibration split and reported with ECE/Brier, per-generator and per-transformation slices.

### Student v0.5

Add precomputed frozen visual embeddings from an approved model. Store the embedding artefact hash and extraction configuration; do not download or execute the model in ordinary CI.

### Student v1

Evaluate a compact multi-branch image model only after v0 demonstrates an improvement over deterministic controls without exceeding the human-content false-positive gate. Branches remain separable for file/provenance, physical acquisition, spectral stability, generative forensics and local reconstruction evidence.

For every student version:

- preserve teacher scores, raw evidence, validity/applicability, and human labels;
- model teacher disagreement as uncertainty rather than forcing a binary target;
- train abstention against out-of-distribution, unseen-generator and unstable-transformation slices;
- checkpoint frequently and record dataset manifest, code SHA, feature schema, seed, calibration split and artefact SHA-256;
- keep Lythaus-owned fusion code and derived parameters distinct from third-party weights and data rights;
- prohibit training on normal Lythaus user uploads.

## WP003 readiness matrix

| Component | WP003 state | Reason |
| --- | --- | --- |
| Deterministic forensics | `READY_FOR_WP003` | Implemented, reusable and covered by foundation tests; still research evidence, not enforcement |
| SAFE | `NEEDS_MORE_RESEARCH` | Code repository evidence exists; checkpoint, data and benchmark rights require separate verification |
| GRIP CLIP | `NEEDS_MORE_RESEARCH` | Independent control is useful; upstream CLIP, weights, data and CPU performance require diligence |
| Spectral branch | `READY_FOR_WP003` | Deterministic features can be benchmarked before a learned branch |
| Reconstruction branch | `NEEDS_MORE_RESEARCH` | DIRE, LaRE², ADRD and newer candidates require a controlled comparison; compute and licence status are not yet verified |
| Camera branch | `READY_FOR_WP003` | Applicability-aware deterministic features can be evaluated; device attribution remains research-only |
| Gemma visual reasoning | `REQUIRES_HUMAN_APPROVAL` | No model/licence/deployment decision is made in WP002 |
| gpt-oss-20b | `REQUIRES_HUMAN_APPROVAL` | Evidence orchestration only; no fine-tuning, deployment or enforcement authority in WP002 |
| Cloudflare Container proof | `REQUIRES_HUMAN_APPROVAL` | Structural skeleton exists; live eligibility, billing and bounded test approval are unavailable |
| Lythaus Student v0 | `READY_FOR_WP003` | Design and evaluation gates exist; no training has occurred |
| Benchmark v0 | `REQUIRES_HUMAN_APPROVAL` | Composition is specified, but source-level licence and privacy approval is still required |

## Security, privacy and supply-chain controls

- Dataset manifests must contain provenance and content hashes, not untracked bulk media. Face, medical, scientific and personal imagery require a separate privacy/legal review.
- Do not place EXIF GPS, face embeddings, user identifiers or raw user content in operational logs.
- Keep code licence, model-weight licence, foundation-model licence and dataset rights as separate records.
- Pin model source URLs, commit/tag where available, artefact SHA-256 and evaluation status before any future materialisation.
- Treat external weights and benchmark downloads as untrusted inputs: verify hashes, scan archives, enforce size limits, and keep them outside normal CI by default.
- Preserve shadow/research mode and deterministic enforcement boundaries; evidence scores remain internal.

## Human-only gates remaining

The owner must decide dataset/legal approval, any use of permission-gated imagery or weights, live Cloudflare read-only access refresh, the bounded Container proof budget, elevated LHM telemetry proof, and which WP003 candidate models may be downloaded or evaluated. Codex can implement the repository contracts and validation around those decisions without making them implicitly.
