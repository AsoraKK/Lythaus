# Lythaus Authenticity AI Model Assessment — WP002

**Assessment date:** 2026-08-09
**Status:** research and licensing readiness only; no model deployed or trained

## Licence rule

Code licence, checkpoint/weight licence, upstream foundation-model licence,
dataset/image licence, and commercial/distillation rights are separate fields.
An Apache-2.0 repository does not prove that its checkpoint, upstream CLIP
weights, or referenced datasets may be used commercially. Any missing item is
`UNKNOWN` and blocks commercial training or deployment.

## Candidate register

| Candidate | Role | Code/source | Weights | Technical fit | Commercial status | Recommendation |
|---|---|---|---|---|---|---|
| SAFE | TEACHER / BASELINE | Official PyTorch repository, Apache-2.0 | Separate verification required | Strong transformation/generalisation research; multi-GPU training path; not CPU-first | `UNKNOWN` until checkpoint and data rights are verified | Keep as research teacher/control, not production |
| GRIP CLIP | CONTROL / TEACHER | Official repository, Apache-2.0 | Separate CLIP and checkpoint review | Lightweight CLIP-feature detector with reported degraded/unseen-generator robustness; Python/PyTorch runtime | `UNKNOWN` until weight, upstream CLIP, and data rights are verified | Keep as independent control, not production |
| Spectral/phase branch | BASELINE | Lythaus-owned deterministic features | Not applicable for v0 | CPU-feasible FFT magnitude/phase, DCT, wavelet, residual, and compression features | Lythaus-owned code | Implement as measurement baseline |
| DIRE | EXPERIMENTAL | Official paper/code | Diffusion dependency and checkpoint review required | Reconstruction-error signal; likely expensive and GPU-oriented | `UNKNOWN` | Compare as occasional escalation |
| LaRE2 (LaRE²) | EXPERIMENTAL | Official paper and code repository | Dependency/weight review required | Latent reconstruction feature claims lower extraction cost than pixel reconstruction | `UNKNOWN` | Compare as possible lower-cost escalation |
| ADRD | WATCHLIST / EXPERIMENTAL | Paper and released code reference | Current licence/weights require review | Perturbation-induced reconstruction discrepancy; current work | `UNKNOWN` | Research comparison only |
| Camera-origin deterministic branch | BASELINE | Lythaus-owned feature contract | Not applicable | Cheap metadata, edge, noise, CFA and screen indicators; device-dependent limits | Lythaus-owned code | Evidence only; never a solved classifier |
| Lythaus Student v0 | EXPERIMENTAL | Future Lythaus-owned model | Not trained | Small CPU fusion of approved teacher outputs and deterministic features | Not applicable yet | Design only; no training in WP002 |
| GPT-OSS-20B | JUDGE / WATCHLIST | Workers AI adapter | Provider/model terms require current review | Evidence reconciliation only; not a sole detector or enforcement authority | `UNKNOWN` for production use | Shadow/reasoning interface only |

## SAFE card

- **Architecture:** image synthetic-detection classifier using preserved and
  augmented features; exact implementation and parameter count must be recorded
  from the pinned upstream release before use.
- **Parameter and weight size:** `UNKNOWN`; no upstream artefact was downloaded
  or pinned in WP002.
- **Code licence:** Apache-2.0 at the official repository.
- **Weights:** repository supplies a pretrained checkpoint, but the checkpoint
  and all referenced training/test data require separate licence evidence.
- **Runtime:** PyTorch/torchvision research environment; upstream instructions
  describe a four-GPU training path. CPU inference feasibility is `UNKNOWN`
  until a bounded local benchmark is run.
- **Memory, ONNX and quantisation:** peak RAM, ONNX export feasibility and
  quantisation feasibility are `UNKNOWN`; no export experiment is authorised.
- **Training requirement:** the upstream training path is multi-GPU; Lythaus
  will not reproduce full SAFE training locally.
- **Container fit:** not suitable for the `lite` proof without a separately
  measured compact inference artefact. Do not deploy SAFE.
- **Benchmark/generalisation limits:** transformation-oriented research and
  newer-generator tests are not Lythaus validation; camera-native, screenshot,
  mixed-origin and local-region performance remain `UNKNOWN`.
- **Production suitability:** not a production candidate in WP002.
- **Conclusion:** `KEEP_AS_TEACHER` conditionally, with `KEEP_AS_BASELINE` only
  after reproducible evaluation and licence approval. Never a sole blocker.

## GRIP CLIP card

- **Architecture:** CLIP image features plus a lightweight detector/classifier.
- **Parameter and weight size:** `UNKNOWN`; checkpoint material was not
  downloaded or measured in WP002.
- **Code licence:** Apache-2.0 repository with an explicit copyright notice.
- **Weights:** repository includes weight material, but upstream CLIP weights,
  detector weights, and referenced datasets require separate records.
- **Runtime:** Python/PyTorch, torchvision/timm/open_clip and checkpoint files;
  upstream examples use CUDA, so CPU/container feasibility is not assumed.
- **Memory, ONNX and quantisation:** peak RAM, ONNX export feasibility and
  quantisation feasibility are `UNKNOWN`; no export experiment is authorised.
- **Strength:** independent control with published unseen-generator and
  post-processing experiments.
- **Weakness:** licence lineage, input resolution, transformation robustness,
  real-world camera, screenshot, and local-edit coverage remain unverified.
- **Production suitability:** not a production candidate in WP002.
- **Conclusion:** `KEEP_AS_CONTROL` and possible teacher only after rights and
  bounded inference tests; not a production candidate in WP002.

## Spectral/phase recommendation

Implement the first Lythaus branch as a deterministic, multi-scale feature
extractor over grayscale/luminance and chroma residuals:

1. log FFT magnitude statistics and radial bands;
2. wrapped FFT phase concentration and phase-difference summaries;
3. block DCT energy and quantisation-table context;
4. Haar-like wavelet bands and high-pass residual statistics;
5. repeated features after JPEG, resize, crop, screenshot, blur, and sharpening.

The v0 output is evidence, not an AI-origin verdict. A later logistic or small
tree classifier may consume the feature vector after benchmark calibration.

## Reconstruction-family recommendation

Do not preselect a production candidate. Compare DIRE, LaRE2 (LaRE²), ADRD, and newer
reconstruction approaches on the same benchmark slices. The comparison must
record reconstruction model dependency, number of passes, GPU/CPU time, memory,
localisation capability, unseen-generator performance, transformation stability,
and all code/weight/data rights. The best WP003 escalation candidate is the one
that satisfies the licence gate and materially improves evidence on degraded or
mixed-origin images within the cost budget; otherwise retain the family as
research-only.
