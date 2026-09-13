# WP006A Executive Decision

BENCHMARK_READINESS = `INSUFFICIENT_TRUTH`

EF2_DECISION = `MORE_DATA_REQUIRED`

EF3_DECISION = `MORE_DATA_REQUIRED`

EF5_DECISION = `MORE_DATA_REQUIRED`

OWNER_ACTION_REQUIRED = `CONFIRM_CSAFE_LOCATION_IF_ALREADY_DOWNLOADED; CONFIRM_PROVENANCE_AND_RELEASES_FOR_LYTHAUS_ORIGINALS`

RECOMMENDATION_CONFIDENCE = `MODERATE`

`WP006A_RESEARCH_DATE = 2026-09-13`

## Executive answer

WP006A does not produce a product-feasible forensic specialist. The correct result is `WP006A_DATA_FOUNDATION_REQUIRED`, not a forced detector selection. The decisive blocker is not a shortage of papers: there are zero locally verified, rights-clean, calibration-ready source families for camera acquisition, synthetic content, hard negatives, or local edits.

The best next direction is a rights-clean, provenance-first benchmark materialisation package. It must establish independent camera, synthetic, hard-negative, and partial-edit source families before any specialist score is admitted as directional evidence.

The strongest research paths to carry forward are:

- EF2: a Lythaus-controlled camera-device enrollment experiment using pixel residual, CFA/demosaicing, and noise-pipeline measurements. SDAIE is a useful research reference, not an adoptable component.
- EF3: SPAI as the first spectral specialist to inspect after rights-clean data exists, with PatchCraft as a texture-based comparator. Neither is commercially cleared by this work.
- EF5: FUSED as the first image-plus-mask candidate to investigate after resource and rights review. RITA and OpenSDI are research references; IMDLBenCo and ForensicHub are benchmark infrastructure, not specialists.

No candidate passed all four gates of rights, runtime, generalization, and independent evidence. Therefore:

`NO_CURRENT_PRODUCT_FEASIBLE_SPECIALIST`

This package did not change production configuration, Evidence Packet v1, the WP005B Selective Resolution Gate, model IDs, public labels, or enforcement state.

## Starting state and scope

- Actual starting `origin/main`: `ee57d7b97fd7be65a761841d275178160af83439`.
- No intervening commits were present after the expected WP005B merge (`PR #811`).
- Research branch: `agent/wp006a-forensic-specialist-feasibility`.
- No Cloudflare inference, image generation, checkpoint download, training, or normal-user-upload analysis was performed.
- The locked WP005B architecture is preserved. WP005B's Judge slot and packet-versus-ledger disposition remain unresolved as required; WP006A does not reopen them.

## Locked architecture consequence

The architecture remains the correct insertion point for future specialists:

```text
Safety
  -> deterministic EF1 / EF2 / EF4
  -> Vision Observer
  -> Evidence Packet v1
  -> Epistemic Compiler
  -> Selective Resolution Gate
       -> bounded deterministic result
       -> ambiguity/conflict/mixed-origin
            -> optional advisory adjudicator
            -> canonical validation
            -> deterministic product policy
```

The specialist interface added by this work package is measurement-only. A specialist cannot emit `SUPPORTS`, `CONTRADICTS`, a final origin axis, or enforcement authority. The admission sequence is:

```text
raw measurement
  -> benchmark analysis
  -> transformation analysis
  -> calibration
  -> directional validation
  -> policy-controlled Evidence Packet adapter
```

See [`specialist-interface.md`](./specialist-interface.md) and [`wp006a.ts`](../../packages/authenticity/src/wp006a.ts). The Evidence Packet remains `lythaus-evidence-packet-v1`.

## Data readiness

### Current reconciliation

`CSAFE_LOCAL_STATUS = NOT_FOUND`

No registered CSAFE cache path, completion marker, manifest, or hash was found in the safe Lythaus roots. The current host has approximately 52.58 GB free on `C:` and no verified second data volume, below the 80 GB minimum free-disk floor. The approximately 123.62 GB CSAFE archive was not downloaded again.

Host facts used for the stop decision:

- CPU: AMD Ryzen 7 7730U, 8 cores / 16 threads.
- RAM: approximately 15.34 GB total, approximately 4.03 GB free at inspection.
- GPU: no usable CUDA GPU assumed; integrated Radeon only.
- Reliable thermal telemetry: unavailable.
- New disk used by WP006A: 0 bytes.
- Local specialist smoke tests: not executed (`RUNTIME_NOT_EXECUTED_SAFETY_LIMIT`).

### Benchmark source table

| Source | Rights class | Truth type | Families available now | Calibration eligible | Holdout eligible | Major limitation |
|---|---|---|---:|---|---|---|
| Unsplash Dataset Lite WP003 slice | Class B evaluation only | Source/acquisition records, not camera-origin truth | 80 source families / 800 records including descendants | No | No | Camera selection used metadata, creating EF2 circularity; descendants are not independent samples |
| CSAFE Multi-camera Smartphone Database | CC BY 4.0, additional data-use review required | Device-study metadata, not automatic camera-origin truth | 0 locally verified | No | No | No local manifest; 123.62 GB archive exceeds current safe disk budget; privacy and commercial use require review |
| Lythaus Originals camera pool | Class C Lythaus-owned pending release | Owner-confirmed physical capture, if documented | 0 | No | No | Capture records and contributor release are not present in the repository or registered cache |
| Lythaus-controlled synthetic slice | Class C pending generator terms | Exact generator/version/seed provenance, if generated | 0 | No | No | No samples generated; output retention and downstream use rights are not yet closed |
| OpenSDI / OpenSDID | CC BY-SA 4.0 with academic-use language | Generator and mask labels, source lineage requires review | 0 locally materialized | No | No | Not a commercial calibration clearance; large download out of scope |
| Open Images V7 | Per-image review | Natural-image source only | 0 approved locally | No | No | Registry requires per-image rights review and does not establish camera truth |
| COCO, GenImage, DiT-FAKE, T2I-CoreBench, GPT-ImgEval, RAISE, MIT-Adobe-FiveK, HDR+ | Mixed or unclear | Varies | 0 approved locally | No | No | Permission, lineage, privacy, or commercial-use gates remain open |

The detailed machine-readable reconciliation is [`wp006a-data-readiness.json`](./wp006a-data-readiness.json). The empty, strict foundation manifest is [`microbench-manifest.json`](./microbench-manifest.json), with its required-field schema in [`microbench-manifest.schema.json`](./microbench-manifest.schema.json).

### Required benchmark counts

`MICROBENCH_SOURCE_FAMILIES = 0 calibration-ready; 80 registered evaluation-only external families`

`CAMERA_FAMILIES = 0 calibration-ready`

`SYNTHETIC_FAMILIES = 0`

`HARD_NEGATIVE_FAMILIES = 0`

`PARTIAL_EDIT_FAMILIES = 0`

`UNSEEN_GENERATOR_HOLDOUT = UNSEEN_GENERATOR_HOLDOUT_NOT_READY`

The long-term 320-source target remains a planning target, not a claim about current usable data. Source-family, device-family, generator-family, parent/descendant, mask, and transformation boundaries are predeclared in the schema. No split was tuned against a candidate.

## Current Cloudflare check

The official Workers AI catalog and model pages were rechecked on 2026-09-13. The five WP005B finalists remain documented, but this did not justify a WP006A inference call:

- [Workers AI model catalog](https://developers.cloudflare.com/workers-ai/models/)
- [Workers AI pricing and free allocation](https://developers.cloudflare.com/workers-ai/platform/pricing/): 10,000 neurons/day free allocation; paid usage is documented separately.
- [Workers AI data usage](https://developers.cloudflare.com/workers-ai/platform/data-usage/): inputs and outputs are Customer Content, while third-party model terms still apply.
- [JSON Mode](https://developers.cloudflare.com/workers-ai/features/json-mode/) documents JSON output mode but does not create rights-clean forensic truth.
- [Workers AI errors](https://developers.cloudflare.com/workers-ai/platform/errors/) documents access, capacity, and free-neuron failure classes.

The catalog pages for [GPT-OSS 20B](https://developers.cloudflare.com/workers-ai/models/gpt-oss-20b/), [Qwen3 30B A3B FP8](https://developers.cloudflare.com/workers-ai/models/qwen3-30b-a3b-fp8/), [Llama 3.3 70B Fast](https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/), [Moondream 3.1](https://developers.cloudflare.com/ai/models/%40cf/moondream/moondream3.1-9B-A2B/), and [Llama 4 Scout](https://developers.cloudflare.com/workers-ai/models/llama-4-scout-17b-16e-instruct/) were checked for availability, modality, context, controls, and published pricing. These are orchestration facts inherited from WP005B, not WP006A research questions.

Cloudflare image generation was not launched. [FLUX.1 Schnell](https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/) is documented, but model terms and downstream output rights were not sufficient to authorize retaining a synthetic benchmark slice in this package. A future generation run needs a separate written terms assessment and bounded authorization.

## Specialist candidate decisions

The full registry is [`candidate-registry.json`](./candidate-registry.json). “Prototype next” means a bounded, rights-gated research implementation after benchmark materialisation; it does not mean production approval.

### EF2 — physical camera acquisition

| Candidate | Signal | Generalization / transforms | Code rights | Weight rights | Data / evaluation rights | Checkpoint / resources | Runtime result | Commercial feasibility | Decision |
|---|---|---|---|---|---|---|---|---|---|
| Lythaus classical enrollment | Pixel residual, CFA/demosaicing, noise-pipeline consistency; PRNU only with enrolled reference and alignment | Unresolved across crop, scaling, lens correction, JPEG, and recapture | Lythaus-owned path | N/A | New provenance-confirmed camera families required | No checkpoint; CPU-feasible in principle | Not run; host safety gate | Likely, conditional on validation and owned data | `PROTOTYPE_NEXT` / `RESEARCH_FEASIBLE` |
| [SDAIE](https://github.com/Ekko-zn/SDAIE) / [paper](https://arxiv.org/abs/2512.05651) | EXIF-supervised photographic features and high-frequency residuals | Paper claims perturbation and multi-generator tests; unseen-device, metadata-ablation, JPEG/crop/screenshot behavior remains unverified | No repository license detected | External Google Drive checkpoint terms unresolved | Training corpus and metadata leakage boundaries unresolved | External checkpoint; README uses an 8-process `torchrun` path; no CPU smoke | Not run; host safety gate | Unresolved | `RESEARCH_REFERENCE` / `RESEARCH_ONLY_LICENSE_UNRESOLVED` |

**EF2 conclusion.** The credible path is not “download a camera classifier.” It is an enrolled, provenance-controlled physical-capture study that tests pixel-only acquisition cues, metadata ablation, unseen devices, and recapture. Camera identification of known devices is not equivalent to physical-camera acquisition. Existing Lythaus CFA/noise features remain instrumentation only.

`BEST_EF2_RESEARCH_PATH = LYTHAUS_CONTROLLED_MULTI_DEVICE_ENROLLMENT_WITH_PIXEL_ONLY_ABLATIONS`

`BEST_EF2_RUNTIME_CANDIDATE = NONE_CURRENTLY_QUALIFIED`

`EF2_CALIBRATION_READINESS = MORE_DATA_REQUIRED`

### EF3 — generative / synthetic-image forensics

| Candidate | Signal | Generalization / transforms | Code rights | Weight rights | Data / evaluation rights | Checkpoint / resources | Runtime result | Commercial feasibility | Decision |
|---|---|---|---|---|---|---|---|---|---|
| [SPAI](https://github.com/mever-team/spai) / [CVPR 2025 paper](https://openaccess.thecvf.com/content/CVPR2025/html/Karageorgiou_Any-Resolution_AI-Generated_Image_Detection_by_Spectral_Learning_CVPR_2025_paper.html) | Spectral distribution modeling and reconstruction similarity; less semantically correlated than CLIP-only detectors | Paper reports cross-generator and common-perturbation results; Lythaus JPEG75, resize50, crop10, screenshot, and hard-negative tests remain open | README states Apache-2.0 for code/weights | README statement requires independent verification of the exact checkpoint | Training/evaluation data provenance and commercial use unresolved | Google Drive checkpoint; training used high-end GPU; CPU feasibility unknown | Not run; host safety gate | Unresolved | `PROTOTYPE_NEXT` / `RESEARCH_FEASIBLE` |
| [PatchCraft](https://github.com/cvlcgabriel/PatchCraft) / [paper](https://arxiv.org/abs/2311.12397) | Rich/poor texture patch contrast after smash-and-reconstruction preprocessing | Intended unseen-generator testing; repository exposes JPEG, resize, crop, and blur controls; no Lythaus measurement | No repository license detected | External checkpoint terms unresolved | CNNDetection and evaluation data terms unresolved | External checkpoint; repository is approximately 1.8 GB and GPU-oriented | Not run; host safety gate | Unresolved | `RESEARCH_ONLY_LICENSE_UNRESOLVED` |
| [UnivFD](https://github.com/WisconsinAIVision/UniversalFakeDetect) | Frozen CLIP representation plus classifier head | Useful historical open-world control; likely overlaps semantic visual signals and Lythaus has no transformation results | MIT code | CLIP/fc weights and data terms not fully resolved for commercial use | External 72 GB data and source rights unresolved | ViT-L/14 plus weights; GPU-oriented | Not run; host safety gate | Unresolved | `REJECT_REDUNDANT_SIGNAL` |
| [DualSight](https://github.com/CeMOS-IS/dualsight) | Forensic/artifact branch plus CLIP semantic branch | Cross-generator claims are interesting, but Lythaus robustness and commercial rights are open | AGPL-3.0 code | Checkpoint terms require review | OpenSDI/data lineage and use restrictions open | README describes 72 GB source and 270 GB converted data, H100 Docker | Not run; exceeds current research envelope | Research only | `REJECT_RESOURCE_REQUIREMENT` |
| [Community Forensics](https://openaccess.thecvf.com/content/CVPR2025/html/Park_Community_Forensics_Using_Thousands_of_Generators_to_Train_Fake_Image_CVPR_2025_paper.html) | Broad generator diversity as training strategy, not a small runtime specialist | Strong research rationale for unseen-generator evaluation; no Lythaus transformation result | Project/data terms require review | No small deployable checkpoint established | Large multi-generator data rights require review | Research-scale, no qualifying checkpoint | Not applicable | Unresolved | `RESEARCH_REFERENCE` |

**EF3 conclusion.** SPAI is the best first research path because its spectral signal is less obviously identical to Moondream or CLIP semantics. It still has no Lythaus calibration, no local runtime result, and unresolved data/checkpoint commercial clearance. A single “AI probability” cannot enter EF3 directionally until its real-image distribution, seen/unseen generator split, perturbation behavior, and hard-negative FPR are measured.

`BEST_EF3_RESEARCH_PATH = SPAI_SPECTRAL_MEASUREMENT_WITH_PATCHCRAFT_TEXTURE_COMPARATOR`

`BEST_EF3_RUNTIME_CANDIDATE = NONE_CURRENTLY_QUALIFIED`

`EF3_CALIBRATION_READINESS = MORE_DATA_REQUIRED`

### EF5 — local manipulation / reconstruction

| Candidate | Signal | Generalization / transforms | Code rights | Weight rights | Data / evaluation rights | Checkpoint / resources | Runtime result | Commercial feasibility | Decision |
|---|---|---|---|---|---|---|---|---|---|
| [FUSED](https://github.com/AntonNuzhdin/FUSED) / [paper](https://arxiv.org/abs/2608.28302) | Image-level AI-inpainting logit plus full-resolution manipulation mask; sparse forensic and semantic branches | Reports cross-dataset/zero-shot transfer; Lythaus JPEG, resize, crop, screenshot, and local-edit hard negatives remain open | Repository license not detected | [HF model card](https://huggingface.co/aonuzhdin/FUSED) states MIT for checkpoint files | Underlying training data and frozen ConvNeXt dependency terms remain unresolved | Approximately 306 MB FUSED weights plus ConvNeXt-XXL; CPU/RAM unknown | Not run; host safety gate | Unresolved | `PROTOTYPE_NEXT` / `RESEARCH_FEASIBLE` |
| [RITA](https://github.com/scu-zjz/RITA) / [CVPR 2026 Findings paper](https://openaccess.thecvf.com/content/CVPR2026F/html/Zhu_Revisiting_Image_Manipulation_Localization_under_Realistic_Manipulation_Scenarios_CVPRF_2026_paper.html) | Autoregressive process-aware manipulation masks | Realistic manipulation focus is relevant; repository release and Lythaus transform behavior incomplete | No repository license detected | Partial external checkpoint release; terms unresolved | Dataset/training restrictions unresolved | `torchrun`/GPU-oriented reference; not a small CPU candidate | Not run; host safety gate | Unresolved | `RESEARCH_REFERENCE` |
| [IMDLBenCo](https://github.com/scu-zjz/IMDLBenCo) | Benchmark/framework; signal depends on selected model | Useful protocol and metric harness, not a detector result | CC BY 4.0 repository | Model-specific and external | Dataset/model rights are per component | External model zoo; framework-only for this decision | Not applicable | Not applicable | `BENCHMARK_TOOL_ONLY` |
| [ForensicHub](https://github.com/scu-zjz/ForensicHub) / [NeurIPS 2025 paper](https://proceedings.neurips.cc/paper_files/paper/2025/hash/5d8a47fc1cb0a143f149ee07321621c9-Abstract-Datasets_and_Benchmarks_Track.html) | Framework across AIGC, IMDL, deepfake, and document tasks | Useful cross-domain benchmark infrastructure; model-specific validity and rights remain separate | CC BY 4.0 repository | External model-specific | Dataset/model rights require separate audit | External checkpoints; framework-only for this decision | Not applicable | Not applicable | `BENCHMARK_TOOL_ONLY` |
| [OpenSDI](https://github.com/iamwangyabin/OpenSDI) / [CVPR 2025 paper](https://openaccess.thecvf.com/content/CVPR2025/html/Wang_OpenSDI_Spotting_Diffusion-Generated_Images_in_the_Open_World_CVPR_2025_paper.html) | Global/local diffusion masks using CLIP plus MAE collaboration | Open-world generator diversity is useful; dataset card states CC BY-SA 4.0 and academic-use language | Repository terms require review | [MaskCLIP weights](https://huggingface.co/nebula/MaskCLIP-weights) lack a clear visible commercial license | Dataset/source image lineage and commercial training rights unresolved | External weights; large evaluation corpus; not downloaded | Not run; host safety gate | Research only | `RESEARCH_REFERENCE` / `RESEARCH_ONLY_LICENSE_UNRESOLVED` |

**EF5 conclusion.** FUSED is the best first research candidate because it exposes both global and local outputs. That makes it more directly useful to the Evidence Packet than a global classifier, but it is not yet a commercial component. A global synthetic score is not EF5; local-edit presence, mask quality, and source-family-aware localization must be evaluated separately.

`BEST_EF5_RESEARCH_PATH = FUSED_IMAGE_PLUS_MASK_EVALUATION_ON_CONTROLLED_LOCAL_EDIT_PAIRS`

`BEST_EF5_RUNTIME_CANDIDATE = NONE_CURRENTLY_QUALIFIED`

`EF5_CALIBRATION_READINESS = MORE_DATA_REQUIRED`

## Rights gate

Rights were recorded separately in the machine-readable registry. No candidate receives a single collapsed `LICENSE_OK` flag.

| Candidate/source | CODE_RIGHTS | WEIGHT_RIGHTS | DATA_RIGHTS | EVALUATION_RIGHTS | COMMERCIAL_DEPLOYMENT_RIGHTS |
|---|---|---|---|---|---|
| Lythaus classical path | Lythaus-owned implementation | N/A | Requires provenance/release confirmation | Not yet approved | Conditional on owned data and validation |
| SDAIE | Unresolved; no repository license detected | Unresolved external link | Unresolved | Research review only | Unresolved |
| SPAI | Apache-2.0 stated by project | Project statement; exact artifact still needs verification | Unresolved | Paper benchmark, not Lythaus clearance | Unresolved |
| PatchCraft | Unresolved | Unresolved external link | Unresolved | Research review only | Unresolved |
| FUSED | Repository license unresolved | MIT stated by model card | Underlying training data unresolved | Research evaluation only | Unresolved |
| RITA | Unresolved | Partial release, terms unresolved | Unresolved | Research review only | Unresolved |
| OpenSDI / MaskCLIP | Dataset/repository terms require review | Visible weight license not established | CC BY-SA 4.0 with academic-use language | Evaluation-only pending audit | Research only / unresolved |
| Unsplash Lite | Dataset terms and image non-redistribution constraints | N/A | Class B external evaluation terms | Evaluation only | Not a calibration/training source |
| CSAFE | Dataset CC BY 4.0 | N/A | Fair-use/commercial and privacy review required | Not approved locally | Unresolved |

Commercial relevance for every neural specialist is `UNRESOLVED` or `RESEARCH_ONLY`. The classical Lythaus path is `LIKELY` only if a fresh, rights-confirmed camera corpus and a successful directional validation study exist. Repository source-code licenses do not settle weights, training data, evaluation, or commercial deployment rights.

## Signal independence

The desk-level matrix is [`forensic-signal-independence-matrix.json`](./forensic-signal-independence-matrix.json). The principal conclusions are:

- Lythaus classical camera enrollment is `LIKELY_INDEPENDENT` from current semantic Observer output and only partially overlaps current deterministic EF2 instrumentation.
- SDAIE is `UNKNOWN` against the current EF2 proxies because both use photographic residual/pipeline cues and no ablation was run.
- SPAI is `LIKELY_INDEPENDENT` from CLIP-heavy detectors at the feature-family level, but can overlap current EF4 spectral/transformation measurements; it must not be stacked blindly.
- PatchCraft is `PARTIALLY_OVERLAPPING` with texture/residual measurements and needs correlation testing.
- UnivFD and the semantic branches of DualSight/OpenSDI are `HIGHLY_OVERLAPPING` or `PARTIALLY_OVERLAPPING` with generic visual semantics; they are not three independent votes.
- FUSED may add local-mask evidence, but its semantic branch is partially overlapping with generic image representation. The mask branch is the valuable possible increment.
- RITA's process-aware mask is potentially independent of a global detector, but release/resource/license gaps prevent qualification.

No sample-level correlation was calculated because no candidate was executed on a rights-clean shared corpus. These are research hypotheses, not measured independence coefficients.

## Runtime/resource report

`new disk used = 0 bytes`

`largest checkpoint downloaded = 0 bytes`

`longest local smoke = NOT_RUN`

`failed installs = 0 (no installs attempted)`

`runtime status = RUNTIME_NOT_EXECUTED_SAFETY_LIMIT`

The local safety gate was correct: free disk was below 80 GB, free RAM was only approximately 4.03 GB, and reliable thermal telemetry was unavailable. Candidates rejected or deferred for resource reasons include DualSight, Community Forensics, the OpenSDI corpus, and large benchmark/checkpoint stacks. FUSED's approximately 306 MB model card artifact is not by itself a safe CPU runtime guarantee because its ConvNeXt-XXL dependency and working memory were not measured.

No runtime result should be read as a capability failure. The result is a controlled non-execution decision.

## Benchmark foundation decision

`BENCHMARK_READINESS = INSUFFICIENT_TRUTH`

The foundation is structurally ready but scientifically not ready for specialist calibration. The manifest supports the required provenance, rights, truth basis, hashes, source families, transformations, parent/mask alignment, privacy, retention, and train/evaluation/distillation gates. It intentionally contains zero samples rather than padding the benchmark with circular or unclear truth.

The existing 80 Unsplash source families and deterministic descendants can support bounded external evaluation after the existing terms snapshot is honored. They cannot validate EF2 because metadata influenced source selection, cannot serve as calibration truth, and cannot create an unseen holdout. CSAFE could become an important device-diversity source if its local archive, provenance, privacy, and commercial-use gates are independently closed. Lythaus Originals and a Lythaus-controlled synthetic slice are the cleanest eventual calibration sources, but neither is currently manifested.

`HUMAN_FPR_TARGET_NOT_YET_PROVEN`

The small foundation cannot support an end-to-end accuracy claim, an overall human-content FPR claim, an unseen-generator claim, or specialist threshold admission.

## Required scientific gaps

`END_TO_END_AUTHENTICITY_ACCURACY = UNRESOLVED`

`HUMAN_FPR_TARGET = HUMAN_FPR_TARGET_NOT_YET_PROVEN`

`UNSEEN_GENERATOR_GENERALIZATION = UNRESOLVED`

`EF2_DIRECTIONAL_VALIDATION = UNRESOLVED`

`EF3_DIRECTIONAL_VALIDATION = UNRESOLVED`

`EF5_DIRECTIONAL_VALIDATION = UNRESOLVED`

These gaps remain even though the research paths are now prioritized. A paper result, a raw score, a metadata signal, or a one-image smoke cannot close them.

## Owner Actions Required

1. If the CSAFE download was previously started, confirm only the logical Lythaus research-cache location and provide its completion/manifest/hash evidence. Do not download it again for this package.
2. For any Lythaus Originals that may become camera truth, confirm the capture-record and contributor-release status for the specific source families. The records must establish capture/device/mode/provenance without retaining GPS, serial numbers, account identifiers, or private media in Git.
3. If a later package proposes Cloudflare-generated synthetic samples, approve retention only after the selected model/output terms and provenance fields are reviewed. No generation is requested now.

No API key, provider subscription, personal-media copy, or elevated system setup is requested.

## Next work package

`NEXT_RESEARCH_PRIORITY = WP006B — Rights-Clean Benchmark Materialisation`

Objective: materialise a small, rights-auditable, provenance-first source-family benchmark with at least one valid split boundary for camera, synthetic, hard-negative, and partial-edit evidence, without using personal media or unclear datasets.

Why it matters: every specialist decision is currently limited by truth and rights, not by the absence of candidate papers. Calibration against the current Unsplash slice would repeat EF2 circularity and could create commercially unsafe thresholds.

Expected scientific value: high. It enables blinded transformation tests, unseen-generator/device holdouts, mask alignment checks, and later FPR/calibration estimates.

Estimated cost: $0 for manifest/rights work using existing tooling; any acquisition/storage cost must be separately approved. No Cloudflare inference is required.

Estimated complexity: medium. The difficult work is provenance and rights reconciliation, not code volume.

This is intentionally one next work package. Specialist calibration should follow it, not run in parallel against weak truth.

## Deferred and no-go paths

- Do not admit current CFA/noise/metadata proxies as directional EF2 evidence.
- Do not adopt SDAIE until code, checkpoint, data, metadata-ablation, unseen-camera, and CPU conditions are resolved.
- Do not build a commercial EF3 ensemble from UnivFD, DualSight semantic features, OpenSDI, and other correlated representations.
- Do not treat SPAI or PatchCraft paper performance as Lythaus calibration.
- Do not treat a global synthetic score as EF5 localization.
- Do not use IMDLBenCo or ForensicHub as if a framework were a deployable detector.
- Do not download CSAFE, OpenSDI, DualSight, or large checkpoint stacks on this host under the current disk/RAM state.
- Do not launch Cloudflare image generation until output rights are written and separately authorized.
- Do not start another Judge tournament, reopen GPT-OSS/Qwen/Llama selection, or revisit WP005B architecture.

## Final classifications

`EF2_CALIBRATION_READINESS = MORE_DATA_REQUIRED`

`EF3_CALIBRATION_READINESS = MORE_DATA_REQUIRED`

`EF5_CALIBRATION_READINESS = MORE_DATA_REQUIRED`

`ARCHITECTURE_DECISION = PRESERVE_WP005B_LOCKED_ARCHITECTURE`

`JUDGE_DECISION = PRESERVE_WP005B_UNRESOLVED_SLOT`

`OBSERVER_DECISION = PRESERVE_MOONDREAM_PROVISIONAL_PRIMARY`

`REPRESENTATION_DECISION = PRESERVE_WP005B_UNRESOLVED_PACKET_VS_LEDGER`

`LLM_VALUE_DECISION = PRESERVE_WP005B_NOT_DEMONSTRATED`

`NEXT_RESEARCH_PRIORITY = WP006B_RIGHTS_CLEAN_BENCHMARK_MATERIALISATION`

`RECOMMENDATION_CONFIDENCE = MODERATE`

`FINAL_CLASSIFICATION = WP006A_DATA_FOUNDATION_REQUIRED`

The confidence is moderate for the data-foundation stop and priority because it is supported by direct repository reconciliation and host safety facts. Confidence is low-to-moderate for neural candidate ranking because no local runtime or rights-complete benchmark was available. This report locks the research direction, not detector performance or commercial authenticity claims.
