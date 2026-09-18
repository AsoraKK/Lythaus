# Lythaus Authenticity AI — WP007J-R1 final report

## Executive result

WP007J-R1 completed the previously missing empirical work against approved Lythaus media. The frozen SAFE-A representation was extracted and independently checked; the real JPEG laboratory ran 2,140 actual descendants through two encoder paths; phase/FFT/DCT measurements ran on the same source pairs; the JPEG inspector was checked against Pillow/libjpeg and Sharp/libvips; and twelve core papers received structured primary-source extraction.

The result is mixed but decisive:

- SAFE-A's 512-dimensional representation does not expose a simple non-real cluster for the mandatory Seedream-4 or Imagen-4 misses. A SAFE-B head is therefore not justified by this package.
- SAFE-A's JPEG failure is more severe and less reducible to a single quality label than the prior reconnaissance implied. In the primary Pillow/libjpeg 4:2:0 path, synthetic recall was `0/40` at Q100 and at every tested point from Q97 through Q50; Q99 and Q98 each detected `1/40`. Q95 4:4:4 also detected `0/40`.
- Negative scores moved into the positive region under some JPEG paths. In the primary Q95 slice, the observed negative FPR was `8/60` (`13.33%`, Wilson 95% CI `6.91%–24.17%`). This is a bounded laboratory result, not a population estimate.
- Several DCT and FFT scalars retained measurable synthetic/genuine separation after Q95, but no phase/DCT threshold or classifier was fit. The strongest q95 scalar AUCs were DCT DC standard deviation `0.7446`, pixel standard deviation `0.7304`, FFT log-magnitude mean `0.7183`, DCT low-frequency energy `0.7117`, and DCT AC L1 mean `0.7063`. Phase circular coherence was near chance at `0.5246`.
- The JPEG inspector reliably recovered current-byte facts. The independent Pillow cross-check had zero mismatches across 2,140 rows. Sharp/libvips disagreed on 60 Pillow 4:2:2 metadata observations, which is itself evidence that tool/encoder identity must remain in the record.
- Public FLUX.1 and consumed Cloudflare FLUX.1 differ across the full SAFE embedding, not merely at the final score head. Cloudflare FLUX.1 was much closer to the real-control centroid and to the consumed Cloudflare diagnostic cluster. The cause remains unresolved provider/runtime/domain shift.

The evidence-derived recommendation is **Path C**: keep SAFE-A frozen as a positive specialist, define an evidence-grade/original-bytes research boundary, and run one narrowly scoped Lythaus-owned compression/eligibility-specialist qualification before considering any SAFE-B or ensemble work. No production authority is granted.

## Controls and lineage

Parent: `WP007J_HEAD = 1d3830febbbe0a9511e1f7ea3bd0ef322003b1a0`, PR #850, kept open and unmerged.

SAFE-A remained unchanged:

- upstream commit: `4e998724651b227def64f5be0cd60c0aa1552c35`;
- checkpoint SHA-256: `b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e`;
- frozen threshold: `0.5864923000335693`;
- extraction point: 512-dimensional flattened average-pool vector before `fc1`.

The approved CPU environment was reused: Python 3.13.5, torch 2.14.0+cpu, torchvision 0.29.0+cpu, Pillow 12.3.0, NumPy 2.5.2, SciPy 1.18.1, scikit-learn 1.9.1, PyWavelets 1.10.0, pytorch-wavelets 1.3.0, Kornia 0.7.2. No GPU, paid service, new provider or production route was used. One large camera image emitted Pillow's decompression-bomb warning but decoded successfully; it was not silently dropped.

All R1 artifacts record `flux2PixelAccess=false` and `flux2ProviderCalls=0`. No FLUX.2 bytes, thumbnails, features, embeddings or provider calls were accessed.

## A. SAFE representation probe

### Cohort and reproducibility

`representation-cohort-freeze.json` contains 1,080 score-blind records:

- 600 camera controls;
- 200 digital/hard negatives;
- 160 SAFE-easy synthetic records;
- 20 Seedream-4 records;
- 20 Imagen-4 records;
- 40 public FLUX.1 diagnostics;
- 40 consumed Cloudflare FLUX.1 diagnostics.

The embedding array is `[1080, 512]`, finite, and SHA-256 `1f7ba38e496e695231a86abfd4c76cbd86338717454c40b8da9b2d3056f2019d`. The feature-hook path reproduced the official logits with maximum absolute delta `0.0`. An independent comparison against 920 matching historical WP007I scores also produced maximum and mean absolute score deltas of `0.0`.

### Missed-family geometry

The predeclared SAFE-B gate required a missed family to lie outside the real-control cosine P95 and not be closer to the real centroid than to the easy-synthetic centroid.

| Family | n | Median cosine to real centroid | Median cosine to easy-synthetic centroid | Result |
| --- | ---: | ---: | ---: | --- |
| Seedream-4 | 20 | 0.07145 | 0.51210 | `C_REAL_IMAGE_SPACE` |
| Imagen-4 | 20 | 0.18524 | 0.49676 | `C_REAL_IMAGE_SPACE` |

The real-control cosine P95 was `0.85198`. Both missed families were much closer to real than easy synthetic. This is not evidence that they are real; it is evidence that the frozen SAFE representation does not expose the required simple rescue geometry.

### FLUX.1 representation diagnosis

Public FLUX.1 had median cosine distance `0.53124` to the real centroid and `0.02486` to the easy-synthetic centroid. Consumed Cloudflare FLUX.1 had median cosine distance `0.10421` to the real centroid and `0.49866` to the easy-synthetic centroid. SAFE score medians were approximately `0.9487` versus `0.0466`, with 38/40 versus 0/40 threshold passes.

An independent NumPy recomputation from the frozen vectors reproduced all four medians with maximum absolute delta `0.0`. The anomaly is therefore a full representation/domain shift in this diagnostic, not only a final-head calibration issue. It remains post-hoc evidence and does not identify whether the cause is provider encoding, runtime, generator variant or a combination.

**Disposition:** `SAFE_REPRESENTATION_DOMAIN_GAP_CONFIRMED`; `SAFE_B_NOT_JUSTIFIED`.

## B. Real JPEG laboratory

### Frozen source set

The source set contained 100 original parents:

- 40 SAFE-detected synthetic originals from SD-3.5-Large, Gemini, GoT-R1-7B and Nano-Banana;
- 40 native-camera JPEG negatives;
- 20 digital/hard-negative PNGs.

The matrix included original, Q100/Q99/Q98/Q97/Q96/Q95/Q92/Q90/Q85/Q80/Q75/Q65/Q50, 4:4:4/4:2:2/4:2:0 where supported, and bounded compound operations. Pillow/libjpeg generated 2,020 rows. Sharp/libvips 0.35.4/libvips 8.18.6 generated 120 additional rows. The Sharp path did not support 4:2:2 and recorded that request as unsupported instead of pretending it ran.

### SAFE-A curve

The key result is not a universal quality number. It is that the current SAFE-A path collapsed under the first actual re-encoding regime tested in this cohort:

| Pillow/libjpeg 4:2:0 request | Synthetic recall | Negative FPR |
| ---: | ---: | ---: |
| Q100 | 0/40 | 1/60 (1.67%) |
| Q99 | 1/40 (2.5%) | 1/60 (1.67%) |
| Q98 | 1/40 (2.5%) | 5/60 (8.33%) |
| Q97 | 0/40 | 8/60 (13.33%) |
| Q96 | 0/40 | 8/60 (13.33%) |
| Q95 | 0/40 | 8/60 (13.33%) |
| Q92–Q50 | 0/40 at each tested point | 6/60 (10.00%) at each tested point |

The Q100 observation is not a claim that all Q100 encoders destroy SAFE. It is a warning that the requested integer is not the physical compression variable: this path also changed the source into a 4:2:0 JPEG with a new quantization table. At Q95, all tested subsampling paths had 0/40 synthetic recall:

| Encoder/path | Sampling | Synthetic recall | Negative FPR |
| --- | --- | ---: | ---: |
| Pillow/libjpeg | 4:4:4 | 0/40 | 0/20 |
| Pillow/libjpeg | 4:2:2 | 0/40 | 1/20 |
| Pillow/libjpeg | 4:2:0 | 0/40 | 6/20 |
| Sharp/libvips | 4:4:4 | 0/40 | 0/20 |
| Sharp/libvips | 4:2:0 | 0/40 | 6/20 |

The compound operations were also severe: JPEG75→JPEG95, JPEG85→JPEG95, JPEG95→JPEG85, non-8-pixel crop→JPEG95, resize→JPEG95, JPEG95→resize75 and JPEG→PNG all produced 0/40 synthetic recall in the measured slices, except resize75→JPEG95 and screenshot-style→JPEG95, which each produced 1/40.

These FPR values are bounded laboratory observations, not real-world population estimates. For example, the primary Q95 `8/60` negative result has a Wilson 95% interval of approximately `6.91%–24.17%`. It demonstrates that the current SAFE-A rule is unsafe as a low-score/negative-origin rule under these degraded inputs.

### Generator and negative movement

The primary synthetic parents were SAFE-easy families, so the JPEG lab does not claim Seedream/Imagen recovery. The supplemental family-disjoint domain-gap experiment separately tested 20 Seedream-4 and 20 Imagen-4 images at Q95/Q85/Q75; each family had 0/20 detections at each quality. This makes the failure broader than a single SAFE-easy family artifact, but it remains a diagnostic, not a retraining result.

Negative score movement was material: at Pillow Q95 the median raw score was approximately `0.0503` versus median original `0.4057`, but several negative outliers crossed the fixed threshold. Thus compression does not merely reduce synthetic recall; it also changes the negative score distribution in a way that can create false synthetic evidence.

**Disposition:** `COMPRESSION_ROBUST_SPECIALIST_REQUIRED`; no JPEG quality threshold is qualified.

## C. Phase/FFT/DCT measurements

The same 100 originals and 2,140 descendants produced 2,240 feature rows. The extractor used deterministic grayscale, 256×256 crop/pad, FFT summaries and block-DCT summaries. The constant-image DCT fixture produced DC `8.000000000000002` against expected `8.0`, non-DC max absolute error `0.0`, and the impulse FFT fixture max error `0.0`.

At primary Q95, scalar synthetic/genuine AUCs were:

| Feature | Oriented AUC |
| --- | ---: |
| DCT DC standard deviation | 0.7446 |
| Pixel standard deviation | 0.7304 |
| FFT log-magnitude mean | 0.7183 |
| DCT low-frequency energy | 0.7117 |
| DCT AC L1 mean | 0.7063 |
| DCT AC energy | 0.6917 |
| DCT high-frequency energy | 0.6475 |
| FFT phase mean absolute | 0.6154 |
| Block-boundary ratio | 0.5933 |
| FFT phase circular coherence | 0.5246 |
| DCT high/low energy ratio | 0.5100 |

For the 40 SAFE-A Q95 misses versus 60 genuine controls, the strongest scalar miss/genuine AUCs were DCT DC standard deviation `0.74`, pixel standard deviation `0.73`, FFT log-magnitude mean `0.72`, DCT low-frequency energy `0.71` and DCT AC L1 `0.71`. This is evidence that a future scalar or small specialist may be worth testing. It is not unique rescue: no threshold/classifier was fitted, no held-out FPR was measured for such a rule, and the Seedream/Imagen supplemental phase rows did not include a new negative comparator.

Phase circular coherence was relatively stable among the measured features but near chance for q95 synthetic/genuine separation. The current honest disposition is `PHASE_CONTEXT_ONLY`, not `PHASE_SPECIALIST_PROMISING`.

## D. JPEG inspector

The inspector parsed all 2,140 generated rows. It matched the known manifest on format, dimensions and sampling for 2,140/2,140 rows and estimated the known requested standard quality exactly for 2,080 quality rows. The Pillow independent cross-check matched format, dimensions, quantization-table count, sampling and progressive state for 2,140/2,140 rows with zero mismatches.

The independent Sharp/libvips comparison agreed on sampling for 2,080/2,140 rows. The 60 disagreements were the known Pillow 4:2:2 rows; Sharp/libvips reported a different sampling interpretation. R1 preserves this as a cross-tool discrepancy. It does not make a false claim that all decoder metadata agree.

The inspector can reliably state current container/byte facts. It cannot prove the complete edit chain, prove a JPEG is the camera's first encode, or prove a PNG was never previously JPEG-compressed.

**Disposition:** `JPEG_ELIGIBILITY_BOUNDARY_NOT_SIMPLE`.

## E. Evidence-grade input boundary

The research proposal is three-tiered:

1. **Evidence-grade:** original bytes are hash-bound; provenance/acquisition lineage is available or the source is demonstrably lossless; current JPEG DQT/SOF/encoder facts belong to a separately validated profile; no known recompression, screenshot, resampling or non-8-pixel crop is in the lineage.
2. **Limited:** original bytes exist but encoder/history is incomplete. Positive SAFE-A evidence may be retained with a warning; low SAFE-A is inconclusive.
3. **Unsupported for certification:** known destructive recompression, compound history, screenshot/severe resampling, unknown internet propagation, or PNG known/suspected to descend from JPEG. Do not use low SAFE-A as negative authenticity evidence.

This is not a production upload policy. It is a defensible research boundary. JPEG is not automatically rejected, and PNG is not automatically accepted.

## F. Deep paper result

The structured ledger covers SAFE, CPTFormer, DCPT, Mandelli's JPEG forensic training work, GlobalForge, CO-SPY, Fake or JPEG?, Synthetic Laundering, RRDataset, B-Free, Diff-JPEG and PatchCraft. It records exact authors, venue/year, architecture or method, data, degradation conditions, reported numbers where available, ablations, compute, code/checkpoint status, rights and Lythaus transfer limits. Absent paper facts are explicitly `NOT REPORTED BY AUTHORS`; they are not guessed.

The literature points to three different remedies:

- dataset/codec shortcut control, especially the warnings from [Fake or JPEG?](https://arxiv.org/abs/2403.17608);
- complementary phase/global/semantic evidence, including [CPTFormer](https://openaccess.thecvf.com/content/CVPR2026/html/Li_Detecting_Compressed_AI-Generated_Images_via_Phase_Spectrum_Robustness_CVPR_2026_paper.html), [GlobalForge](https://arxiv.org/abs/2607.14684), [CO-SPY](https://arxiv.org/abs/2503.18286) and [PatchCraft](https://arxiv.org/abs/2311.12397);
- paired clean/degraded training objectives such as [DCPT](https://arxiv.org/abs/2604.10102).

None of these sources, as audited here, provides a deployment-cleared drop-in replacement for SAFE-A under Lythaus's hard-negative and rights requirements.

## Required scientific answers

1. **Why does JPEG hurt SAFE?** R1 proves a large empirical dependency on the current encoded representation but does not isolate one causal cue. The result is consistent with forensic-trace and codec-shortcut literature: re-encoding changes local, wavelet, frequency and grid statistics. Exact cue attribution remains a future experiment.
2. **Which cues survive best?** In this bounded lab, DCT low/high energy, DCT DC dispersion, pixel standard deviation and FFT log magnitude remained measurable. Phase circular coherence was relatively stable but near chance for discrimination.
3. **Can phase materially help?** Not yet demonstrated. Scalar phase alone did not separate q95 synthetic/genuine strongly; a full phase specialist remains unqualified.
4. **Can DCT/JPEG become Lythaus-owned skill?** Yes for current-byte inspection and context; not yet as an authenticity classifier.
5. **How reliably can compression history be estimated?** Current JPEG facts are reliable; quality is conditional; double-JPEG/resampling/history are probabilistic or unknowable from final bytes alone.
6. **Is there a safe eligibility boundary?** Yes as a conservative evidence-grade/original-bytes boundary; no as a single QF rule.
7. **Does SAFE need retraining or a head?** The current representation does not justify a head for Seedream/Imagen. Compression robustness likely requires paired real-codec training or a distinct specialist, not threshold adjustment.
8. **Does the representation contain Seedream/Imagen information?** Not in the simple geometry tested: both are nearer real controls than easy synthetics.
9. **Best current JPEG candidate?** For future training, DCPT's paired consistency objective is the strongest literature candidate. For an immediately ownable Lythaus path, a deterministic DCT/quantization/phase eligibility specialist should be qualified first.
10. **Best unseen-generator candidate?** Global/semantic/content-controlled methods such as GlobalForge, CO-SPY and B-Free are research candidates, not adopted models. R1 gives no basis to select one for deployment.
11. **One method for both?** None is justified by the current evidence.
12. **CPU feasibility?** SAFE-A, the inspector, FFT/DCT features and bounded metric analysis are CPU-feasible. Training DCPT-like or large phase/global models is not a current CPU-first deployment path.
13. **Rights?** SAFE-A is `RESEARCH_EVALUATION_ELIGIBLE_DEPLOYMENT_REVIEW_REQUIRED`. External code/checkpoint/foundation/data rights remain individually unresolved unless explicitly recorded.
14. **Should V1 require evidence-grade inputs?** The research evidence supports that as the honest initial scope, without changing production in R1.
15. **Should SAFE-A remain frozen?** Yes, permanently as the reference.
16. **What is SAFE-B?** No SAFE-B artifact was trained. The representation gate failed, so a frozen-backbone head is not justified.
17. **Is a deterministic specialist preferable?** As the next experiment, yes: it is ownable, auditable and CPU-feasible, but it must still pass independent family/encoder/hard-negative tests.
18. **Highest-value next experiment:** qualify a small Lythaus-owned compression/eligibility specialist on disjoint source families and multiple real encoders, comparing unique SAFE-A rescue, hard-negative FPR and applicability coverage.
19. **FLUX.2?** Remains sealed.
20. **Production?** `NO`.

## Dispositions

- `SAFE_REPRESENTATION_DOMAIN_GAP_CONFIRMED`
- `SAFE_B_NOT_JUSTIFIED`
- `COMPRESSION_ROBUST_SPECIALIST_REQUIRED`
- `PHASE_CONTEXT_ONLY`
- `JPEG_ELIGIBILITY_BOUNDARY_NOT_SIMPLE`
- `MORE_EVIDENCE_REQUIRED` for any production-grade compressed-input claim

SAFE-A remains valuable positive evidence within validated regimes. It must not be used as a universal classifier, and a low SAFE-A score must not be converted into human authorship.

## 110% completion self-audit

| Achievable | Core completed | Validated | Cross-checked | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| A Runtime/lineage | Yes | Yes | Yes | 110% | `current-state-audit.json`, `runtime-freeze.json`, PR metadata, checkpoint/hash checks |
| B SAFE representation | Yes | Yes | Yes | 110% | `representation-probe-results.json`, `representation-analysis.json`, NPZ hash, historical 920-row score check |
| C SAFE-B decision | Yes | Yes | Yes | 110% | `safe-b-not-justified.json`, negative geometry gate, no fit performed |
| D Real JPEG lab | Yes | Yes | Yes | 110% | `jpeg-lab-generated-manifest.json`, `jpeg-safe-lab-results.json`, `jpeg-safe-curves.json`, two encoders |
| E Phase/DCT | Yes | Yes | Yes | 110% | `phase-dct-real-results.json`, `phase-dct-effect-sizes.json`, known-answer fixtures |
| F JPEG inspector | Yes | Yes | Yes | 110% | `jpeg-inspector-validation.json`, Pillow cross-check, Sharp discrepancy retained |
| G Core papers | Yes | Yes | Yes | 110% | `core-paper-extraction.json`, `core-paper-extraction.md`, primary URLs/code audit |
| H FLUX.1 representation | Yes | Yes | Yes | 110% | `flux1-representation-diagnostic.json`, independent recomputation with delta 0 |
| I Eligibility | Yes | Yes | Yes | 110% | `eligibility-analysis.json`, `eligibility-recommendation.md`, family-disjoint supplemental check |
| J Reproducibility/validation | Yes | Yes | Yes | 110% | focused tests, run manifest, validation summary, zero-access assertion |
| K Unmerged PR | Pending PR creation | Pending | Pending | In progress | PR opened only after final validation and commit |

## Boundary

No production routing, public labels, upload restriction, Safety policy, Judge authority, Moondream authority, database schema, appeals behavior or enforcement changed. The follow-on PR remains unmerged. FLUX.2 remains sealed.
