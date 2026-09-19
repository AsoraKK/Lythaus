# WP007N — Two completed bounded investigations, neither advanced

## Decision

**Observed Lythaus evidence:** faithful RIGID-style response produced no positive detections or unique SAFE rescue at the frozen operating point. The richer static representations detected modern synthetic examples, including Seedream and Imagen, but their false-positive burden was unacceptable. JPEG augmentation did not repair it.

**Scientific dispositions:** Arm A `NO_INCREMENTAL_EVIDENCE_AT_TESTED_OPERATING_POINT`; Arm B and A0 `UNSAFE_AT_TESTED_OPERATING_POINT`. Neither current candidate merits a larger independent **qualification** experiment. The bounded experiments completed and were independently checked; this is not model qualification. Broad human-created digital-content specificity remains `BLOCKED_DATA`, not a completed negative experiment.

**Inference:** B0 retains the most useful *research lead*, because its ranking contains signal that A's response lacks. Its next step would be a negative-domain/calibration-transfer falsification, not promotion, another backbone, or a favorable reinterpretation of these thresholds. See [one next experiment](recommended-next-experiment.md).

Parent is the unchanged, open PR854 head `e3adbcb3cb2ac0991db231476441d133db3e2cd3`; branch `agent/wp007n-two-arm`. No parent merge or history rewrite. [Current-state audit](current-state-audit.json). SAFE-A, CES-S's unqualified status, EF1/EF2, Safety, Moondream, Judge and deterministic-policy authority are unchanged. Production **NO**. FLUX.2 and future EF2 reserves remain sealed.

Delivered as open, unmerged PR855. [Delivery receipt](pr-delivery.json), [completion self-audit](completion-self-audit.md). Blocked or optional comparisons are not counted as completed detector evaluations.

## What actually ran

| ID | Frozen representation / measurement | Status and scope |
| --- | --- | --- |
| A0 | DINOv2 ViT-L/14,1024-D normalized CLS; L2-normalized features, FIT-only standardization, logistic head | Legitimately fitted static baseline; not SAFE-B |
| A1 | Same DINOv2;224 bilinear squash, ImageNet normalization; normalized-tensor Gaussian noise0.05, no clamp; `1-cos`, draw0 | Pinned RIGID notebook measurement CPU port; not reproduction of its published dataset benchmark |
| A2 | Same measurement, mean of three fixed input-derived draws | Separately frozen stochastic-stability adaptation |
| B0 | PE-Core-B16-224,1024-D official vision attention pool plus projection; official224 squash and0.5 normalization; clean-trained logistic head | Lythaus adaptation, not the larger/underspecified model configuration in Simplicity Prevails |
| B1 | Same PE identity and feature; head trained on original/JPEG95/JPEG75, both classes, equal aggregate parent weight | Codec-augmentation experiment, no backbone training |
| S | Original SAFE checkpoint; native center256 and ToTensor; threshold0.5864923000335693 | Recomputed exact-view raw experimental reference; not authorized evidence on these unqualified regimes |

One backbone loaded at a time, CPU float32, batch1, two Torch threads. A0/B0/B1 each have1025 trainable coefficients/intercept, plus FIT-derived normalization state. C was selected from0.01/0.1/1 using the frozen DEV rule; all principal heads selected0.01. No PCA, intermediate-layer sweep, fusion, backbone tuning, SAFE imitation or evaluation-driven reversal. Separate nuisance-only and fixed label-permutation controls ran.

Code/checkpoint pins, licences and paper/code discrepancies are in [rights audit](model-data-rights-audit.md), [checkpoint freeze](checkpoint-freeze.json) and [primary-paper extraction](primary-paper-audit.md). DINOv2 explicitly licenses its models Apache-2.0; selected PE checkpoint/card and LICENSE.PE explicitly specify Apache-2.0. These are affirmative model permissions, not inferences from an unrelated code licence. DINOv3 was not selected or downloaded.

**Published external results are separate:** RIGID's notebook uses real-positive reporting, unlike N's synthetic-positive metrics. Simplicity Prevails uses a different training recipe and incompletely specifies some model variants. Its reported benchmark results do not establish Lythaus's1% FPR target. N makes no claim of reproducing either paper's headline benchmark. [Pinned source audit](primary-paper-audit.md).

## Data and independence

| Current role | Photograph parents | Synthetic parents | Procedural supplements | Total |
| --- | ---: | ---: | ---: | ---: |
| FIT |12 CSAFE|12 DiffusionDB|0|24|
| DEV |6 CSAFE|6 DiffusionDB|0|12|
| CALIBRATION |8 CSAFE|0|0|8|
| EVAL_N |12 CSAFE +8 Unsplash|0|8|28|
| HISTORICAL_CHALLENGE |0|20|0|20|

The screen is **48 parents**, not152 independent images or456 independent noise draws. It contains five each of Seedream-4, Imagen-4, SD3.5-Large and already-consumed Cloudflare FLUX.1. All were excluded from N's supervised fitting; they are historical programme challenges, not fresh unseen-generator confirmation. Positive fitting/DEV cover only the SD1-era DiffusionDB family.

The original/JPEG75 pair ran for all48. A score-blind12-parent subset ran six conditions; four parents additionally ran original/JPEG75 matched256 views. There are152 evaluated views per arm and SAFE, A236 total cached feature rows and B308 including FIT/DEV/CALIBRATION. Invariant PNG tensors were reused, not counted as additional independent evidence.

CSAFE roles separate physical devices; prompts/source/hash groups do not cross roles. The retained same-role near-duplicate procedural pair and unknown cross-device scenes/Unsplash photographer relationships make nominal parent intervals optimistic. EVAL_N means held out from N fitting/selection, not untouched programme data. [Frozen memberships and hashes](cohort-freeze.json), [independent lineage audit](independent-results-audit.json).

CSAFE CC BY4.0 and DiffusionDB's per-item training authorization/CC0 permit the actual fitting. Unsplash, T2I and Cloudflare were evaluation-only in N; none entered fitting, standardization, DEV or calibration. Unsplash is a registered photographic negative source with uncertain prior processing, not verified native/pristine capture; scores never changed its labels. No actual representative human artwork/CGI/game corpus was available. Eight owned procedural templates cannot impersonate it. Broad human-content specificity is blocked even apart from the observed failures. [Rights/source inventory](model-data-rights-audit.md).

## Frozen operating-point results

Thresholds were selected solely from eight CSAFE calibration parents: strict score greater than maximum negative, separately for original and maximum across six conditions. Eight parents give1/8 rank resolution, not a resolved1% quantile. Zero calibration errors are by construction. SAFE's historical `>=` threshold was not changed. AP below is synthetic-positive **average precision**, not trapezoidal PR-AUC; prevalence is20/48.

| Candidate | Original TP/FN | Original FP/TN | Original AUROC / AP | JPEG75 TP/FN | JPEG75 FP/TN | Source-worst FP/28, Wilson95% |
| --- | --- | --- | --- | --- | --- | --- |
| A0 |19/1|13/15|0.82143 /0.79185|19/1|13/15|13/28 =46.43%,29.53–64.19%|
| A1 |0/20|0/28|0.24107 /0.30075|0/20|0/28|0/28 =0%,0–12.06%|
| A2 |0/20|0/28|0.21607 /0.29427|0/20|0/28|0/28 =0%,0–12.06%|
| B0 |20/0|15/13|0.90357 /0.89929|20/0|15/13|15/28 =53.57%,35.81–70.47%|
| B1 |20/0|15/13|0.88929 /0.87594|20/0|15/13|15/28 =53.57%,35.81–70.47%|
| SAFE raw |5/15|0/28|0.62143 /0.60721|0/20|1/27|2/28 across declared reference conditions|

Source-worst uses one count per negative parent if any declared reference condition exceeds its **worst-condition calibration threshold**. The twelve-parent panel has broader transformation coverage than the other36; this limitation is explicit. Matched views are a separate diagnostic, not silently added to the primary denominator. [Principal results](candidate-results.json), [per-condition/source/generator metrics](group-metrics.json), [independent recomputation](independent-results-audit.md).

| Negative subgroup, source-worst | A0 | A1/A2 | B0/B1 |
| --- | --- | --- | --- |
| CSAFE held-out devices |0/12|0/12|0/12|
| Processed Unsplash photographs |7/8|0/8|7/8|
| All photographs |7/20 =35%|0/20|7/20 =35%|
| Procedural non-AI supplements |6/8|0/8|8/8|
| Actual human-created artwork/CGI |NOT EVALUATED|NOT EVALUATED|NOT EVALUATED|

For0/12, the nominal Wilson upper bound is24.25%; for7/8 the interval is52.91–97.76%; for8/8 it is67.56–100%. Good CSAFE specificity does not transfer to the processed-photo source. This is a concrete failure of the intended operating point, not merely statistical underpowering. `FPR_TARGET_NOT_STATISTICALLY_DEMONSTRATED` applies throughout; static heads additionally exhibit clearly unacceptable observed harm.

On each five-parent generator family, B0/B1 detect5/5 originals and JPEG75 descendants. A0 detects5/5 Seedream, Imagen and Cloudflare, but4/5 SD3.5. A1/A2 detect0/5 in every family. These are not solved Seedream/Imagen gaps at acceptable specificity: the same heads falsely flag most processed photographs and digital supplements.

## Complementarity and augmentation

B0/B1 uniquely detect15 original parents missed by SAFE: the five Seedream, five Imagen and five consumed Cloudflare parents. At JPEG75, SAFE detects0/20 while B0/B1 detect20/20; A0 detects19/20. **The cost is15 extra negative parents on originals and14 extra negative parents at JPEG75** relative to raw SAFE. Across all declared conditions, B0/B1 have20 exact-condition rescued parents but14 parents positive only for the candidate across the entire set; SAFE fires on another condition for six sources. Those two rescue definitions are not interchangeable. [Exact IDs, paired errors and conditions](unique-safe-rescue.json), [positive-parent review](positive-parent-review.json).

Original B0/B1 rescue IDs are `Seedream-4__R-GR-009-1`, `013-0`, `019-1`, `056-0`, `064-0` under that same prefix; `imagen-4__R-GR-027-1`, `046-0`, `061-3`, `075-0`, `083-2` under that prefix; and consumed `WP007AH_FLUX_1_SCHNELL_PROMPT_001`, `002`, `004`, `012`, `013`. The linked artifact gives full IDs without abbreviation. B0/B1's15 false-positive parents are seven Unsplash sources plus all eight procedural sources, retained in the denominator and individually enumerated in the review.

A1/A2 provide **zero** SAFE rescue and no useful incremental decision beyond A0. This does not prove every response observable is information-free or refute RIGID on all populations; it rejects this frozen, source-calibrated direction in N. A0 itself is unsafe. No combined A0+response classifier was fitted; that optional comparison remains unperformed.

B1 has the same principal confusion counts as B0 across every declared condition; no augmentation benefit is demonstrated. In the twelve-parent panel, B0/B1 give4/4 synthetic detections but6/8 negative positives for JPEG95, resize75, resize75→JPEG95 and PNG roundtrip. A0 gives4/4 and5/8; A1/A2 give0/4 and0/8. High transformed recall accompanied by high genuine error is not codec-resilient qualification.

**Descriptive evaluation-only ranking diagnostic:** at a threshold inferred from the maximum *evaluation* negative, A0 could retain8/20 originals, B0 twelve, and B1 nine with zero observed evaluation FP; at JPEG75 these counts are8,12,12. A1/A2 retain zero. These are post-evaluation curve summaries, **not admissible calibrated operating points**, and no new cuts were exported or substituted. They motivate a bounded B0 research question, not advancement. [Explicitly non-operational diagnostic](descriptive-rank-capacity.json).

## Falsification and alternative explanations

- **Implementation/noise:** ten engineering fixtures per arm agree with pinned arithmetic/loaders. Clean/zero-noise/replay differences are zero at the recorded feature level; cosine-arithmetic discrepancy is at float32 numerical scale. Four real calibration-parent replays, reversed order and two-image batching reproduce exactly. All heads refit and all calibrations recompute exactly. [Engineering A](engineering-A.json), [B](engineering-B.json), [replay](legacy-cache-certificate.json), [recertification](admission-transition.json).
- **Seed sensitivity:** two of152 views change the decision across individual draws, both the same genuine CSAFE parent (`CSAFE_WP006E_s21_4_13`, original/JPEG75). Draw2 alone exceeds A1's cutoff; predeclared draw0 and the mean remain low. This is one source, not two independent errors. No favorable seed was selected. The response exceeds numerical replay noise but is not useful positive evidence here.
- **Metadata/current pixels:** all twelve PNG controls retain identical model tensors/features/responses. This validates current-pixel invariance, not lossless history. No raw EXIF, GPS or serial values were exported; color conversion policy remains EXIF-transposed RGB without ICC transformation, an explicit limitation.
- **View geometry:** all principal-candidate decisions are unchanged on the four-parent matched256 panel; one nuisance-baseline decision changes. This small panel does not establish general crop invariance or remove all content confounding. SAFE still uses its native tensor preprocessing after the shared view.
- **Codec:** original/JPEG75 and the small compound panel preserve the static heads' errors as well as their detections. Pillow and Sharp decode identically on all three engineering fixtures and share libjpeg-turbo lineage. There is **no independent held-out encoder-family robustness result**. Current re-encoding does not erase previous compression.
- **Nuisance/source:** the permitted nuisance-only head has original AUROC0.70893, TP7/20 and FP9/28; at JPEG75 it detects nothing. Static heads exceed that simple ranking, but their0/12 CSAFE versus7/8 Unsplash error pattern exposes source/calibration-domain fragility. Within-label A1 correlations with contrast/sharpness are modest in this panel, so no single noise/blur variable is proven causal. Coarse matched pairs favor B0/B1 in19/20 comparisons but nuisance alone favors synthetic in20/20 originals. Such matching plainly does not establish an origin mechanism. Dimensions, processing history, scene/content and pretraining exposure remain unresolved alternatives.
- **Permutation:** the complete frozen permuted procedures produce no synthetic positives; original AUROC is0.28214 for A0,0.12321 for B0 and0.12857 for B1. They do not show the strong shuffled-label performance that would trigger that leakage alarm. One permutation and small N do not prove absence of every leak.

[All seed values, nuisance correlations, view deltas and paired intervals](falsification-results.json), [matching distances/strata](matched-nuisance-controls.json), [error correlation](error-correlation.json). A0/A1/A2 share a backbone; different encoders can share pretraining. No error independence, corroboration authority, ensemble or causal universal fingerprint is claimed.

## Runtime, reproduction and quality control

Scientific extraction including fitting/calibration extraction and charged interruption: A **1891.95s,781 attempted image-forwards**; B **238.86s,288 forwards**. Both stay below2700s and A900/B450 caps. Engineering admission is separately recorded. A evaluation measurement p50/p95/max is6.764/17.788/20.989s for clean plus three noisy forwards; B is0.382/1.311/3.553s per vision feature. These exclude decode/preprocessing and reflect observed host load, not a dedicated latency lab. Head-only p95 is about0.115–0.120ms and must not be presented as whole-system latency. SAFE's152-view run takes52.25s including decoding/initialization.

OS process peak working sets are2,817,777,664bytes for A and1,459,773,440 for B; peak process commit is3,671,740,416 and2,642,628,608bytes. Minimum recorded free system memory is5,957,705,728 and7,084,748,800bytes respectively, above the4GiB guard. No unattended training, GPU, paid API or owner-application closure. The two checkpoint files total3,008,373,027bytes; PE's1,790,786,632-byte artifact includes an unused text tower, while the loaded vision tower has93,672,960 parameters. DINO has304,368,640. Head state is approximately84KB each outside Git. [Runtime](runtime-benchmark.json), [A memory](process-memory-A.json), [B memory](process-memory-B.json).

One Windows atomic-budget-write sharing failure interrupted A after30 completed evaluation parents. It was recorded, not hidden;377 attempts and920.78s remained charged. Resume validated/skipped those30 and completed18, using unchanged frozen code/seeds. Observer reads of the changing budget file were removed. [Interruption and limits](runtime-interruption.md), [commands/cache contracts](reproduction.md).

The independent auditor uses separate standard-library metric, NPY and logistic arithmetic, not the primary summaries. It checks every candidate-positive parent plus a score-blind four-negative-per-kind panel, all calibration maxima, exact view/source/feature identities and principal confusion/rescue counts. Largest reported score difference is3.33e-16 across controls; primary heads are at most2.22e-16. It does not pretend to independently rerun every backbone forward. [Audit results](independent-results-audit.md).

Repository validation:388/388 authenticity tests, native typecheck, native scope and workflow pins pass; N Python41 tests plus E/M Python regressions pass. Independent known-answer suite36 checks passes. Native architecture is255/256 on N **and unchanged M parent**, failing the same CRLF-sensitive release-workflow regex. The retired-provider checker reports the same six inherited research artifacts on both. Neither failure is weakened or called a pass. Transient missing dependency links caused additional validation failures; links were restored without new packages, and the full checks rerun. Those runtime failures are not labeled inherited code failures. Final receipts now reject incomplete/dependency-failed validation. [Validation summary](validation-summary.json), [recovery record](validation-runtime-recovery.md).

## Answers and limits

The exact selected configurations ran; no arm is rights/runtime-blocked. RIGID response adds no usable rescue beyond its legitimate static baseline here. PE improves ranking and modern-family recall but **not the practical low-FPR tradeoff at the frozen calibrated point**. Codec augmentation shows no decision benefit. Seedream/Imagen are detected only by unsafe heads, so their safe detection problem is not solved. Processed photographs and procedural negatives defeat specificity; actual human art remains untested. Seed and input controls support numerical reproducibility, not generalization. Generator families are held out from N heads but historically exposed and potentially present in backbone pretraining.

The small Lythaus-owned instruments/head code can be retained as research tools. Their pretrained dependencies remain separately licensed and are not Lythaus-owned. Evaluation permission was not used to authorize fitting; the permitted fitting lineage is explicit. Commercial use requires a separate deployment-rights/notice review, representative permitted fitting/calibration data, truly independent source/family confirmation and demonstrated low FPR. No score means HUMAN, no high score enforces anything, and neither backbone changes EF1/EF2 or advisory-model authority.

**Next:** do not enlarge qualification of either current detector. If another bounded study is authorized, test B0's frozen feature/head ranking against a separately rights-cleared, source-diverse negative calibration/evaluation design, especially processed photographs and actual human digital works. Do not recycle N evaluation into calibration. If those data/rights are unavailable, stop that study. A's tested response and B1's augmentation add no reason for further scale-up now. FLUX.2 remains sealed. Production remains **NO**.
