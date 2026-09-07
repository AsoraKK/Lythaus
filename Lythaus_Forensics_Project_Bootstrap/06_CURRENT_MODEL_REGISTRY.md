# Current Model Registry — Lythaus Forensics

**Consolidation date:** 7 September 2026  
**Registry policy:** no automatic large-model downloads in CI; code, weights, foundation encoders, training data and derived-model rights are separate gates.

## 1. Registry summary

| Registry key / family | Role | Ownership | Status | Deployment | Current decision |
|---|---|---|---|---|---|
| SAFE | forensic teacher | third-party | rights/runtime unresolved | not deployed | conditional teacher only |
| GRIP_CLIP_CONTROL | independent control/teacher | third-party | rights/runtime unresolved | not deployed | keep as control |
| SPECTRAL_PHASE_EXPERIMENT | deterministic baseline | Lythaus | implemented v1 | evidence code only | approved baseline |
| CAMERA_FORENSICS_DETERMINISTIC | physical-acquisition baseline | Lythaus | implemented evidence branch | evidence code only | approved baseline |
| RECONSTRUCTION_EXPERIMENT | family abstraction | mixed | research only | not deployed | escalation family |
| RECONSTRUCTION_DIRE | reconstruction candidate | third-party | rights/compute unresolved | not deployed | reference/teacher candidate |
| RECONSTRUCTION_LARE2 | latent reconstruction | third-party | rights/compute unresolved | not deployed | preferred first reconstruction evaluation if cleared |
| RECONSTRUCTION_ADRD | perturbation reconstruction | third-party | watchlist | not deployed | newer research comparison |
| LYTHAUS_STUDENT_V0 | compact fusion student | Lythaus future | design only | not deployed | no training yet |
| GPT_OSS_20B_REASONER | Judge/reasoner | open model via Workers AI candidate | interface/watchlist | not enforcement | structured recommendation only |
| VISUAL_SEMANTIC_MODEL | semantic scene/ROI evidence | unselected | watchlist | not deployed | choose only after need/terms benchmark |

## 2. Lythaus-owned deterministic spectral branch

**Status:** implemented.  
**Version:** v1.  
**Weights:** none.  
**Commercial status:** Lythaus-owned code.  
**Current feature vector:** fixed 169 elements with camera/spectral/compression integration.

Core evidence:

- multi-scale FFT magnitude;
- multi-scale FFT phase;
- DCT;
- wavelets;
- high-pass/noise residual;
- compression context;
- transformation stability.

Purpose: measurable, CPU-feasible evidence baseline and future Student v0 input. It is not by itself an authenticity verdict.

## 3. Lythaus deterministic camera branch

**Status:** implemented evidence baseline.  
**Role:** EF2 physical-acquisition evidence.  
**No external weights.**

Evidence may include metadata/provenance, quantisation/encoder signatures, channel/noise/edge/chromatic consistency, CFA/demosaicing research features and screen/moire indicators. It must never claim camera authentication unless cryptographic/provenance evidence actually supports that claim.

PRNU/device attribution remains fragile, device-dependent and research-only until rigorous evaluation.

## 4. SAFE

- **Research role:** TEACHER / possible baseline.
- **Code:** upstream repository Apache-2.0.
- **Checkpoint:** separate review required.
- **Training/test data:** separate lineage/right review required.
- **Runtime:** PyTorch/torchvision; upstream training described as multi-GPU.
- **CPU fit:** limited/unverified.
- **Strength:** transformation/generalisation research orientation.
- **Weakness:** checkpoint/data/foundation/dependency rights; not CPU-first; no Lythaus benchmark result yet.
- **Current decision:** do not download/deploy until the exact use is cleared; never sole blocking authority.

## 5. GRIP CLIP

- **Research role:** CONTROL / possible TEACHER.
- **Code:** Apache-2.0 repository.
- **Weights/upstream:** detector weights and upstream CLIP/open_clip require separate records.
- **Runtime:** Python/PyTorch/timm/open_clip; CUDA common upstream.
- **Strength:** independent CLIP-feature control with reported unseen/degraded-image robustness.
- **Weakness:** CLIP/data/weight lineage and CPU feasibility unresolved.
- **Current decision:** keep as independent research control; no production dependency.

## 6. Reconstruction family

### DIRE
Diffusion reconstruction error. Potentially useful as an offline/occasional teacher signal. Expected heavy reconstruction dependency and GPU-oriented practical latency. Rights and artefacts must be checked.

### LaRE²
Latent reconstruction-error approach designed to reduce extraction cost relative to pixel-level reconstruction. Current preferred first reconstruction candidate **if** rights/runtime gates clear.

### ADRD
Perturbation-induced reconstruction discrepancy watchlist. Newer evidence base; rights, weights, compute and robustness must be verified independently.

**Family policy:** do not run reconstruction universally. Evaluate as occasional escalation and teacher signal only if it provides material incremental evidence relative to the cheap Lythaus baseline.

## 7. Lythaus Student roadmap

### Student v0
Small CPU fusion model consuming:

- deterministic EF1–EF5 features;
- camera/spectral features;
- approved teacher scores;
- reconstruction outputs where rights-cleared;
- human ground-truth labels.

No training until commercial/internal corpus rights, teacher rights, benchmark and thermal/compute gates pass.

### Student v0.5
Add precomputed frozen visual embeddings; still lightweight and local-friendly if memory permits.

### Student v1
Compact multi-branch image encoder with RGB/residual/frequency-phase/global/camera/patch-localisation branches and heads for camera origin, synthetic origin, screen recapture, local manipulation, transformation/uncertainty.

Long-term objective: proprietary Lythaus architecture/weights trained on Lythaus-controlled/licensed data, with third-party models serving as teachers/evaluation controls rather than permanent dependencies.

## 8. GPT-OSS-20B Judge

- First reasoning/orchestration candidate on Cloudflare Workers AI.
- Consumes structured evidence, contradictions, applicability and policy context.
- Produces a structured recommendation/reviewer packet.
- Cannot directly block/publish or mutate case state.
- Not an authorship detector.
- Not to be trained/fine-tuned locally on the Ryzen laptop.

## 9. Semantic vision model

Purpose is not “is this AI?” classification. It may provide structured observations about scene/object geometry, reflections, shadows, OCR/text, repeated structures and regions of interest. It remains a watchlist/interface until a specific model is selected and its value is measured.

## 10. Model acquisition gate

Before any third-party artefact download, record:

- exact repo/release/commit;
- code licence;
- checkpoint/weight licence;
- upstream foundation licence;
- training dataset lineage/rights;
- commercial research rights;
- distillation/derived-weight rights;
- redistribution restrictions;
- file size + SHA-256;
- runtime/GPU/RAM requirements;
- owner approval status.

If any material right is unknown, the default is research reference only / `DO_NOT_TRAIN`.
