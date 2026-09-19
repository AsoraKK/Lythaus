# WP007M — measured cross-scale discovery result

## Scientific disposition

**NO_GENERALIZABLE_INCREMENTAL_EVIDENCE_FOUND** for the frozen cross-scale mismatch rule. The new measurement ran on actual approved media and exposed a spatial relationship not present equivalently in the existing marginal feature panel, but it did not earn synthetic-origin authority. Retain the instrument for research; abandon this fixed scalar as an EF3 candidate. This is a bounded negative finding, not a proof that every cross-scale method must fail.

**FPR_TARGET_NOT_STATISTICALLY_DEMONSTRATED. Production authorization: NO. FLUX.2: REMAIN_SEALED.** SAFE-A weights, preprocessing and threshold remain unchanged. CES-S remains unqualified. EF1/EF2/EF4, Safety, Moondream, GPT-OSS, enforcement and appeals are unchanged.

Parent: `63d5daf05243673ad65f2b59dbdb81e94290180b`, open WP007L PR #853. No research-stack merges or historical-report rewrites. The final PR records the exact delivery head; [current-state-audit.json](current-state-audit.json) records the starting state.

## Question, instrument and prior art

**Hypothesis:** the change in spatial parent-child wavelet magnitude dependence across scales carries origin information beyond static spectral marginals. The [measurement inventory](existing-measurements.md) identified this gap; simple noise/intensity coupling was rejected as duplicate EF2 work. SAFE response probing was deferred for cost/dependence reasons, not disproved. Provenance remains valuable but absence supplies no passive origin evidence.

The Lythaus-owned [instrument](../../scripts/authenticity/wp007m_probe.py) takes a native centered 256×256 RGB crop, forms luminance and three orthonormal Haar levels, and measures adjacent-level magnitude rank correlations and upper-quartile co-occurrence. Its frozen primary scalar is `abs(dependency12 - dependency23)`. The fixed shifted-parent control retains each band's marginal values but disrupts spatial alignment. It is not a calibrated randomization test. No classifier was trained.

**Published external evidence:** cross-scale statistics are established prior art, not a claim of a new unpublished algorithm. Farid/Lyu studied higher-order wavelet statistics for photographs versus computer graphics; Portilla/Simoncelli used joint wavelet statistics for texture synthesis. Neither establishes modern-generator detection, and the latter warns against treating this relationship as uniquely physical. [Primary-source audit](source-and-tooling-audit.md), including [Farid/Lyu's paper](https://farid.berkeley.edu/downloads/publications/sacv03.pdf) and [Portilla/Simoncelli's author record](https://www.cns.nyu.edu/~lcv/pubs/makeAbs.php?loc=Portilla99).

**Inference:** measuring a joint relationship is technically distinct from measuring marginal energy, but distinct construction does not prove error independence or useful forensic value.

## Data, rights and frozen decisions

All selected media were previously consumed approved research data. HELDOUT means held out from WP007M design/reference selection, **not fresh programme confirmation**. All descendants stay with their source parent. Generator families, photographic model groups and procedural template groups are disjoint across roles. Physical-device identity is not known for Unsplash. Exact membership, rights and hashes are in [cohort-freeze.json](cohort-freeze.json).

| Role | Photographic parents | Procedural hard-negative parents | Synthetic parents | Condition rows |
|---|---:|---:|---:|---:|
| Discovery | 40 | 20 | 39 | 792 |
| Held out from M design | 60 | 30 | 59 | 1,192 |
| Total | 100 | 50 | 98 | 1,984 |

Score-blind selection excluded cross-role prompt overlap and perceptual-near-duplicate flags; counts differ from intended targets. Hard-negative selection caps each template subtype at five. **The CGI/art/game-like labels here describe owned procedural templates, not a representative corpus of human CGI, paintings or game captures.** Unsplash photographs are not assumed pristine camera-native originals despite inherited subtype labels. The heldout generator panel contains GoT-R1-7B 13, Nano-Banana 20, Seedream-4 15 and imagen-4 11. Discovery uses SD-3.5-Large 20 and Gemini-2.0-Flash 19.

Synthetic media remained evaluation-only: no fitting, feature selection or direction selection from synthetic outcomes. The pre-inference amendment fixed the primary scalar/direction. Only approved discovery negatives set the maximum across conditions, with strict greater-than decisions. The candidate cutoff is **0.3487158244046029**; the existing K `dctDcStd` baseline cutoff is **2.2144267960080066**. Both were frozen before heldout extraction. Zero discovery FPs is therefore by construction, not independent specificity evidence. No post-result reversal of the poorly performing candidate direction occurred. [Frozen protocol](experiment-plan.md), [decision freeze](decision-freeze.json), [runtime/licence record](runtime-rights-freeze.json).

An additional diagnostic, never used for tuning, measured 36 already-consumed CSAFE originals from eight physical-device IDs and ten consumed Cloudflare FLUX.1 images under original/JPEG95/resize75: 138 rows. There were zero candidate positives in each group/condition. This does not establish specificity or resolve provider domain shift. SAFE was not rerun on that diagnostic panel. [Diagnostic membership](diagnostic-cohort-freeze.json), [results](diagnostic-results.json).

## Observed Lythaus results

These are crop-level controlled tests, not whole-upload qualification. JPEG uses actual encoders and recorded DQT/sampling. RESIZE75 means 256→192→256 bicubic. PNG_STRIP is a metadata-free lossless roundtrip. SAFE numbers below are frozen **raw references**, not authorized evidence on unsupported regimes.

| Heldout condition | Candidate TP / 59 | Candidate FP / 90 | Candidate AUROC | SAFE TP / 59 | SAFE FP / 90 | Unique rescue parents in condition |
|---|---:|---:|---:|---:|---:|---:|
| Original crop | 1 | 0 | 0.52693 | 33 | 1 | 1 |
| Pillow JPEG95 | 1 | 0 | 0.51827 | 0 | 13 | 1 |
| Pillow JPEG85 | 1 | 0 | 0.54633 | 0 | 6 | 1 |
| Pillow JPEG75 | 0 | 0 | 0.51507 | 0 | 4 | 0 |
| Resize75 | 0 | 1 | 0.51073 | 40 | 9 | 0 |
| Resize75 + JPEG95 | 0 | 0 | 0.53616 | 0 | 7 | 0 |
| Sharp JPEG95 | 1 | 0 | 0.51827 | 0 | 13 | 1 |
| PNG strip | 1 | 0 | 0.52693 | 33 | 1 | 1 |

The rescue is **one Seedream parent**, not five independent discoveries. It disappears at JPEG75 and in both resize routes. Original per-generator candidate recall: GoT 0/13, Nano-Banana 0/20, Seedream 1/15, Imagen 0/11. Original SAFE recall is respectively 13/13, 20/20, 0/15, 0/11. The candidate misses 58/59 originals. Its original recall is 1.69% (Wilson 95% 0.30%–9.00%). [Full counts/distributions](empirical-results.json), [all error categories and sole FP](error-analysis.json).

Original comparison: candidate AUROC **0.52693**, average precision **0.49592**; existing `dctDcStd` AUROC **0.69454**, with TP 0/59 and FP 4/90 at its separately frozen specificity-oriented reference. SAFE raw TP 33/59 and FP 1/90. A diagnostic set union would be 34/59 and FP 1/90, but **no union policy, ensemble or automatic corroboration is implemented**. The incremental evidence is insufficient to justify it.

| Candidate negative scope | FP / source parents | Observed FPR | Wilson 95% interval |
|---|---:|---:|---:|
| Original, all | 0/90 | 0% | 0%–4.094% |
| Worst declared condition per source, all | 1/90 | 1.111% | 0.196%–6.028% |
| Worst condition, photographic | 1/60 | 1.667% | 0.295%–8.855% |
| Worst condition, procedural hard negative | 0/30 | 0% | 0%–11.351% |

The sole false-positive source is an Unsplash photograph after RESIZE75, candidate 0.36631618, SAFE 0.06181801. Its truth/membership was not overridden. Worst-case SAFE raw reference is 22/90 sources and baseline 4/90; these are not product operating policies. Descendants are never counted as independent N. Wilson intervals are nominal source-parent intervals: within-template/model clustering remains an additional limitation.

## Falsification and independent validation

- **No compelling origin separation:** original candidate medians are photo 0.03872, synthetic 0.05729, hard negative 0.09972. Procedural negatives exceed synthetics. Discovery AUROC is 0.32160 (39 positive/59 measurable negative; one unavailable negative), not evidence for reversing the frozen rule.
- **Content/statistical matching:** matching without replacement on pixel standard deviation, DCT DC deviation, FFT log mean and Haar energy ratio yields original candidate AUROC 0.62999 against 59 photographic pairs, but **0.34667 against 30 hard-negative pairs**. JPEG95 counterparts are 0.57483 and 0.36222. Distances and matching details are recorded; this is nuisance matching, not same-content causal ground truth. No threshold was refit.
- **Spatial control:** shifted-parent primary AUROC is 0.50734 on originals; observed-minus-shifted median is 0.03946. Alignment changes the measurement, but useful origin specificity does not follow. A single deterministic shift does not eliminate all texture structure.
- **Codec replication limitation:** Pillow95 and Sharp95 yield identical decoded pixels for **248/248 parents**. They are two code paths, not evidence of unseen-decoded-encoder generalization. PNG roundtrip preserves pixels for 248/248. The source's unknown earlier processing is not erased by uniform current encoding. No screenshot or full-image resize result is claimed.
- **Repeated real media:** 24 selected source crops reproduce identical pixels, candidate repeats and K/J-R1 baseline values. Independent PyWavelets/scipy arithmetic differs by up to **0.035516** in near-tie rank correlations, particularly procedural patterns. This numerical sensitivity is not hidden. All six candidate-high heldout rows (five descendants of one synthetic plus one genuine FP) were remeasured independently: **zero high/low decision disagreements**. Other threshold-negative cases were not all independently decoded.
- **Independent metrics/lineage:** a separate audit recomputed exact membership, hashes, thresholds, source-worst-case denominators and unique rescue; no metric disagreements. Pairwise AUC with half-credit ties agrees with the trusted implementation. The auditor found missing metadata/code-identity enforcement; guards and adversarial tests now reject those cases. Historical rows matched the frozen metadata, so there was no observed result corruption. The audit files retain their original snapshot findings, not silent rewrites.
- **SAFE preservation:** 248 original comparisons with historical WP007I scores differ by at most 0.00000238419, with zero frozen-threshold changes. Existing CPU numerical variation is not a checkpoint or threshold change.

Evidence: [falsification-results.json](falsification-results.json), [independent audit](final-independent-audit.json), [24-media crosscheck](real-media-crosscheck.json), [positive-case crosscheck](positive-case-independent-check.json), [integrity tests](../../scripts/authenticity/test_wp007m_probe.py). Remaining alternatives: content/texture, unknown ISP/edit history, procedural-template bias, crop choice, and finite/historically exposed family coverage. Low correlation with selected old features does not prove useful independence from SAFE.

## Resources, ownership and validation

One CPU worker, Torch two threads, no model/data download, paid execution or provider calls. The stricter 4 GiB available-RAM inference guard stopped combined workers; completed rows were preserved. Separate feature-only and lean SAFE-only passes completed the missing 720 SAFE values with exact regenerated pixel-hash checks. No guard was weakened and no missing score became a negative. No training occurred; ECO-TRAIN admission is not claimed passed.

Feature bundle (new measurements, shifted control **and all old baselines**) p50 **35.26 ms**, p95 **104.35 ms**, max 412.05 ms. SAFE p50 61.36 ms, p95 183.01 ms. Transform+feature+SAFE p50 104.45 ms, p95 316.09 ms, excluding full source decode and including Sharp process overhead. Six-case independent process peak working set **175.77 MiB** excludes Torch and is not a full-corpus peak. SAFE-only minimum observed free RAM was 4.10 GiB. [Runtime](runtime-benchmark.json), [resume](heldout-run.json), [SAFE completion](safe-enrichment-run.json).

The instrument is locally implemented; dependency notices/rights remain applicable. No GPL/AGPL method code was copied. Evaluation-media permissions do not authorize future training; SAFE checkpoint deployment review remains unresolved. No media, private EXIF or bulk tensors are committed. [Rights](runtime-rights-freeze.json), [reproduction](reproduction.md), [reserve accounting](flux2-zero-access.json).

Validation: **380/380 authenticity tests**, **14 focused Python tests**, native typecheck, scope, workflow pins, syntax, JSON and private-path/secret scan pass. Native architecture **255/256**: one pre-existing Windows CRLF-sensitive release-workflow assertion fails, reproduced on unchanged parent. Retired-provider validator also fails on unchanged historical J-R1/K/L research references with identical parent/current log hashes. Worktree-only package junction repair resolved missing-workspace dependencies without changing package versions/lockfiles. These two inherited failures are **not passes** and were not bypassed. [Exact commands/log hashes](validation-summary.json).

## Required answers and next decision

| Question | Evidence-bounded answer |
|---|---|
| 1–4: New hypothesis, discovery, alternatives, priority? | Joint spatial cross-scale magnitude dependence, identified by the existing measurement gap audit; selected over duplicate noise cues and costlier representation probing because it is cheap and directly falsifiable. Known prior art, new project measurement. |
| 5: Actual sources/families? | 248 approved historical parents across photographs, ten procedural template groups and six generator families; separate 36-CSAFE/eight-device and ten-Cloudflare diagnostics. No fresh independence claim. |
| 6–7: Implementation/observable? | Deterministic three-level Haar rank/co-occurrence instrument plus frozen negative-reference rule and shifted-parent control; no public origin label. |
| 8–10: Origin, codec and source separation? | Near-chance heldout primary AUC; metadata-free/common-crop conditions do not reveal a useful advantage. Source groups are separated, but both encoders yield identical pixels. |
| 11–13: Unseen generators, hard negatives, transformations? | No generalizable rescue: one Seedream source, zero Imagen; hard-negative ordering contradicts a simple AI interpretation. Rescue fails at JPEG75/resize; one resized photograph becomes positive. |
| 14–16: SAFE independence, rescue and cost? | A distinct observable, not qualified independent evidence. One unique source rescue; source-worst-case FP 1/90 with wide interval. |
| 17–18: Alternatives tested/remain? | Matched size/current encoding, marginal-feature matching, shifted alignment, template/model/family split, exact/perceptual duplicates and lossless roundtrip tested. Content, prior processing, representative digital negatives and programme-fresh validation remain unresolved. |
| 19–20: Runtime/ownership? | CPU-feasible bounded bundle, p95 104.35 ms; scoped memory figure above. Small locally owned instrument using audited numerical dependencies. |
| 21–22: Status/commercial use? | Research measurement only. This rule does not justify qualification or deployment. Any different candidate needs fresh frozen protocol, representative rights-cleared data, independent source/codec confirmation and adequate FPR evidence. |
| 23: Highest-value next experiment? | A separately authorized, matched static-versus-perturbation-response test of an already-approved non-SAFE representation, with a strict stop rule and digital hard negatives. [Bounded proposal](recommended-next-experiment.md). |
| 24: Pursue/revise/restrict/abandon? | Abandon this frozen scalar as an EF3 detector; retain its instrumentation as descriptive research context. Do not tune it on these heldout outcomes or launch the next experiment automatically. |

The selected achievable experiment is completed as a cross-checked negative finding. Untested alternative hypotheses are explicitly deferred, not marked scientifically proven. No new supported-upload class or certification policy is inferred from WP007M.
