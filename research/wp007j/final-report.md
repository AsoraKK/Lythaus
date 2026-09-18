# WP007J — Research reconnaissance final report

## Scope and disposition

This package is a literature, rights, runtime, and bounded-prototype reconnaissance. It does not retrain SAFE, add a detector, change production routing, alter public labels, access FLUX.2, or authorize enforcement.

The starting parent is `cce247e66be4de3fb0e927cc12e7a0c87d70561d` (WP007I PR #849 head). WP007H and WP007I are preserved without reclassification. The ledger contains 35 primary studies, including 15 compression-specific studies and 22 unseen-generator/generalization studies, plus 10 deterministic/codec tools or methods.

The strongest conclusion is a roadmap, not a new detector result:

> Keep SAFE-A frozen as a positive synthetic specialist, own a conservative JPEG/input inspector as applicability context, and test a frozen-backbone SAFE-B only after a representation probe. Do not interpret low SAFE scores as human authorship.

## 1. Why does JPEG hurt SAFE?

JPEG quantization removes or perturbs high-frequency DCT amplitude information, while chroma subsampling and resampling alter spatial structure. SAFE's official implementation first applies a wavelet/DWT transform and then classifies with a ResNet-50; WP007H shows that its positive signal collapses under JPEG95/JPEG85/JPEG75. The most defensible explanation is that SAFE relies partly on local/high-frequency relationships that are destabilized by quantization and encoder/grid variation. This is an inference from the implementation plus measured behavior, not a causal ablation.

The phase-spectrum paper reports that phase retains more useful information than magnitude under its tested compression conditions, but Lythaus has not reproduced that result. JPEG-forensic training work independently shows that quality and block-grid alignment are part of the train/test distribution. These sources support a codec-aware experiment, not a claim that phase alone solves JPEG.

Sources: [SAFE](https://arxiv.org/abs/2408.06741), [CPTFormer](https://openaccess.thecvf.com/content/CVPR2026/html/Li_Detecting_Compressed_AI-Generated_Images_via_Phase_Spectrum_Robustness_CVPR_2026_paper.html), [JPEG forensic CNN training](https://arxiv.org/abs/2009.12088).

## 2. Which cues survive JPEG best?

No universal cue was established by Lythaus. The literature makes the following hypotheses plausible:

- phase relationships may be more stable than magnitude in some regimes;
- low-frequency/global structure and semantic consistency may survive better than fine local traces;
- exact DCT/table/grid evidence survives as evidence about the current codec, not necessarily the generator;
- provenance and camera-pipeline evidence are independent of the synthetic detector and should remain separate;
- deterministic input facts can identify some degradation, but cannot recover lost pixels.

The correct next step is an ablation with actual encoders, exact tables, encoder diversity, and hard negatives. A quality label alone is insufficient.

## 3. Can phase-spectrum evidence help?

Possibly, and it is the best research lead for a distinct JPEG-robust cue. CPTFormer combines phase processing with cross-modal guidance, an adapter, and consistency training. Its official implementation and checkpoint rights were not located in this reconnaissance, so full adoption is not justified. A CPU-friendly first step is a Lythaus-owned phase/DCT measurement prototype followed by an independent evaluation. It must beat SAFE's specific errors without introducing hard-negative false positives; a phase score is not authenticity evidence until that test passes.

## 4. Can DCT/JPEG features become a Lythaus-owned skill?

Yes, as an input-eligibility and evidence-quality family. The bounded inspector can expose exact current DQT tables, sampling, progressive state, dimensions, and metadata presence without third-party weights. Grid, resampling, and double-JPEG analysis can be added only as validated probabilistic forensic methods.

The existing Lythaus parser's table-count `doubleCompressionIndicator` must not be presented as double-JPEG detection: two tables are normal in a colour JPEG. The new prototype reports history as undetermined. This is an intentional integrity improvement, not a production parser change.

## 5. How reliably can compression history be estimated?

| Question | Status |
| --- | --- |
| Is the current file JPEG? | reliably measurable for a valid header |
| What are the current tables/sampling/dimensions? | reliably measurable for a valid JPEG |
| What standard-table-equivalent quality is likely? | estimable under table-family assumptions |
| Is it likely recompressed or double-compressed? | probabilistic; needs a validated method and assumptions |
| Is it resampled or grid-shifted? | probabilistic; needs a validated method |
| Was it definitely never compressed? | not inferable from final bytes alone |
| Was a PNG previously JPEG-compressed? | not provable from the container alone |
| What is the complete prior edit chain? | generally unknowable without provenance |

Quality numbers are not universal across encoders. Exact tables, sampling and operation order should be frozen in any future benchmark. [libjpeg-turbo documentation](https://github.com/libjpeg-turbo/libjpeg-turbo/blob/main/doc/libjpeg.txt), [ImageMagick identify](https://imagemagick.org/identify/), [quantization-table quality estimation](https://arxiv.org/abs/1802.00992), and [mixed-factor double-JPEG detection](https://openaccess.thecvf.com/content_ECCV_2018/html/Jin-Seok_Park_Double_JPEG_Detection_ECCV_2018_paper.html) support this separation.

## 6. Is there a safe eligibility boundary?

A three-tier boundary is defensible for a future research/product package:

- **Evidence-grade:** original bytes, valid decode, supported format, and no measured condition outside the specialist's validated regime. This can include some camera-native JPEGs.
- **Limited evidence:** analyzable but mildly or ambiguously recompressed/resampled. High SAFE evidence can remain useful; low SAFE evidence is limited or inconclusive.
- **Unsupported for certification:** destructive or unresolved propagation, severe resampling, failed decode, or unsupported codec/history. The result is insufficient evidence, not AI and not human.

PNG is not automatically evidence-grade and JPEG is not automatically disqualified. The original upload bytes should be analyzed before application transforms, but the original may itself be a screenshot or social-media download.

## 7. Does SAFE need retraining, or only a head/adapter?

This reconnaissance cannot answer without the frozen feature probe. The official model exposes a plausible 512-dimensional pre-classifier representation, so a frozen-backbone linear head is the lowest-risk test. A small adapter is second. Full retraining is not justified by current evidence.

The future objective should use actual clean/degraded pairs, multiple encoders and exact quantization tables, with feature consistency and prediction consistency as candidates. Differentiable JPEG is only a simulator; it must be checked against actual encoders. [Diff-JPEG](https://github.com/necla-ml/Diff-JPEG) and [Kornia JPEG codec documentation](https://kornia.readthedocs.io/en/stable/enhance.html) are implementation references, not evidence that the simulator is faithful enough for deployment training.

## 8. Does SAFE's representation contain information about Seedream/Imagen misses?

Unknown. Source inspection gives a precise test point: the flattened 512-dimensional vector after DWT, `layer1`, `layer2`, and global average pooling, before `fc1`. The probe was not run because the bounded environment lacks Torch, Pillow, and NumPy; installing a new runtime and extracting embeddings would exceed this reconnaissance's declared prototype boundary. The probe plan is complete and records leakage controls. This is an explicit unresolved question, not a guessed negative.

## 9. Best current JPEG-failure rescue

The best candidate is not a new downloaded detector. It is a future SAFE-B protocol: frozen SAFE-A backbone/head reference plus an independently trained small head or objective with real JPEG encoder/table augmentation and clean/degraded consistency. CPTFormer's phase idea is the best independent specialist lead if code/rights/CPU feasibility later resolve. A deterministic phase/DCT inspector should be built first because it is cheap and fully auditable.

## 10. Best current unseen-generator rescue

The best first test is the SAFE feature probe, not another detector tournament. If the representation separates Seedream/Imagen from real controls, a tiny family-held-out head may recover information already present in SAFE. If it does not, the strongest research directions are broad generator diversity, content-aligned training, global structural features, or a reconstruction specialist. Community Forensics, B-Free, DIRE, FakeInversion, source-asymmetry work, and CO-SPY are useful design references, but their paper metrics are not Lythaus evidence and several have rights/compute blockers.

## 11. One method for both JPEG and unseen generators?

No method is currently validated for both in Lythaus. DCPT-like paired consistency and global/phase representations plausibly address both, but this is a hypothesis. The correct experiment must demonstrate clean specificity, hard-negative FPR, per-generator recall, per-table/encoder JPEG recall, and family-held-out transfer. A single headline accuracy is insufficient.

## 12. CPU feasibility

- JPEG inspector: `LOCAL_FEASIBLE`, Node core, no weights.
- phase/DCT measurements: `LOCAL_FEASIBLE` for bounded deterministic features.
- SAFE-A inference: already CPU-feasible by WP007H.
- SAFE feature extraction: conceptually local, but the current clean environment lacks the Python runtime and was not hydrated in this package.
- tiny SAFE-B head: likely laptop-feasible, but not run or authorized.
- full CPTFormer, VLM/MLLM, DIRE/FakeInversion inversion, and broad generator training: `LOCAL_EVAL_ONLY` or `GPU_REQUIRED` until measured.

## 13. Rights suitability

SAFE code is Apache-2.0, but its checkpoint and upstream training data do not have a clear commercial deployment grant in the inspected release; status remains `RESEARCH_EVALUATION_ELIGIBLE_DEPLOYMENT_REVIEW_REQUIRED`. CO-SPY code is MIT, but checkpoint/foundation/data rights remain open. Diff-JPEG is BSD-3-Clause and is a library reference. B-Free's repository is not deployment-cleared. Anonymous/unlocated code and weights are not candidates. The Lythaus-owned inspector has the clearest code-ownership path, subject to product/privacy review.

No candidate is recommended for production deployment by WP007J.

## 14. Should V1 require evidence-grade inputs?

The research supports an evidence-grade-first boundary, not universal rejection. V1 should preserve original bytes, classify input applicability, accept supported camera-native JPEGs when evidence is suitable, and mark degraded/unknown-history inputs limited or unsupported for certification. No path should convert a low SAFE score into a Human-authored label.

## 15. SAFE-A and SAFE-B

SAFE-A should remain a permanently reproducible reference for the research programme. SAFE-B should initially be a frozen-backbone linear head or tiny adapter trained with content-aligned, actual-codec paired data. It must be a separate artifact, separate threshold, and separate rights record. It must pass family-held-out generator tests and the WP007I hard-negative control before any policy role is considered.

## 16. Is a deterministic specialist preferable?

For current constraints, yes as the first new component. It cannot replace synthetic detection, but a JPEG/DCT/phase inspector is cheap, transparent, and useful for applicability. A second neural model is justified only when it demonstrates unique SAFE rescue with an acceptable false-positive and runtime burden.

## 17. Single highest-value next experiment

Run the planned frozen SAFE feature probe, then—only if it shows separability—run a separately authorized SAFE-B small-head experiment with real-encoder degradation pairs. This directly tests whether the failure is in SAFE's representation or head, while addressing JPEG and generator gaps without a new model zoo.

## 18. FLUX.2 and production

FLUX.2 remains sealed: zero pixels, zero transforms, zero scoring, zero provider calls. WP007J provides no reason to consume it. A later reserve package would require the SAFE-A/SAFE-B candidate, applicability rule, rights, and hard-negative policy to be frozen first.

Production authorization is **NO**. This PR changes no production route, public label, Safety policy, Judge authority, database schema, or upload behavior.

## Validation note

The complete authenticity directory passed: 346/346 tests. Native typecheck, native scope, retired-provider dependency validation, workflow-action pin validation, JSON parsing, and diff hygiene passed. The broad native architecture command reported one unrelated existing auth-acceptance fixture failure (`canonical manifest finalizes VERIFIED or BLOCKED after production smoke`) caused by `auth_acceptance_observer_access_service_token_incomplete`; it was recorded in `validation-summary.json` and not modified.

## Final recommendation

Proceed with a narrow WP007K-style SAFE representation/codec experiment only after owner review of the research runtime and rights boundary. Keep the JPEG inspector as a research artifact and do not turn its measurements into authenticity scores. Preserve SAFE-A, preserve abstention, and treat the unresolved Cloudflare FLUX.1 discrepancy and Seedream/Imagen misses as domain-risk until independently explained.
