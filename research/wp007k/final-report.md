# WP007K — Lythaus-Owned Codec-Resilient Forensic Specialist Qualification

## Disposition

WP007K is scientifically complete with a negative specialist result:

- `CES_E_LIMITED`
- `CES_S_CODEC_SPECIALIST_NOT_QUALIFIED`
- `CES_S_UNIQUE_RESCUE_NOT_SUFFICIENT`
- `GENERATOR_DOMAIN_REMAINS_SEPARATE_PROBLEM`
- `EVIDENCE_GRADE_V1_SUPPORTED_RESEARCH_ONLY`

No CES-S artifact is promoted to an active EF3 role. SAFE-A remains frozen and useful only inside measured applicability regimes. Production authorization remains `NO`.

## What actually ran

The experiment used a frozen 976-record confirmation cohort: 140 synthetic originals from seven generator families and 836 negative source families. The materialized matrix contained 3,656 records: 1,540 synthetic descendants and 2,116 negative records. Every descendant stayed with its source parent. The development cohort contained 2,240 WP007J-R1 records and was not used as independent confirmation.

The codec matrix used real files, not numerical ramps:

- Pillow/libjpeg and Sharp/libvips;
- Q75, Q85, Q95 4:2:0;
- Q95 4:4:4;
- synthetic-only Q95→Q85 double JPEG;
- original PNG/JPEG source bytes and controlled digital negatives.

The Lythaus JPEG inspector and an independent Sharp/libvips metadata path agreed on all 3,656 files for validity, format, dimensions, sampling interpretation, quality estimate where applicable, SHA-256 and progressive state. The current-byte result does not prove prior history.

## SAFE-A reference

SAFE-A was not changed:

- upstream commit: `4e998724651b227def64f5be0cd60c0aa1552c35`;
- checkpoint SHA-256: `b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e`;
- threshold: `0.5864923000335693`;
- preprocessing: `SAFE_OFFICIAL_RGB_CENTER_CROP_256_DWT_CLASS1_V1`.

On the full WP007K confirmation matrix SAFE-A produced 145/1,540 synthetic positives and 377/2,116 negative false positives. The source-level worst-case negative rate was 90/836. That aggregate is intentionally not a product claim: descendants expose codec damage and are counted against their source parent.

On original synthetic records SAFE-A detected 135/140. The seven held-out families were:

| Generator family | Original SAFE-A recall | Full matrix recall |
|---|---:|---:|
| BLIP3o-8B | 20/20 | 20/220 |
| Infinity-8B | 20/20 | 20/220 |
| Janus-Pro-7B | 20/20 | 20/220 |
| LongCat-Image | 20/20 | 22/220 |
| OmniGen2-7B | 20/20 | 28/220 |
| PixArt-Alpha | 20/20 | 20/220 |
| Qwen-Image-2512 | 15/20 | 15/220 |

The JPEG cliff was not a nominal quality-label artefact:

| Regime | Synthetic recall | Negative record FPR |
|---|---:|---:|
| Original | 135/140 | 5/836 |
| Pillow Q95 4:2:0 | 0/280 | 160/320 |
| Pillow Q85 4:2:0 | 2/280 | 104/320 |
| Pillow Q75 4:2:0 | 6/280 | 100/320 |
| Q95 4:4:4 | 2/280 | 8/320 |
| Q95→Q85 | 0/280 | not materialized for negatives |

The key safety result is that JPEG re-encoding can both erase synthetic evidence and move genuine images into SAFE-A's positive region. Therefore unsupported codec regimes withdraw SAFE-A authority in both directions; low SAFE-A is never human evidence.

## CES-E — codec applicability

CES-E is deterministic and emits no authorship or AI classification. Its frozen rule is:

- estimated standard-table JPEG quality `<=97`: `UNSUPPORTED`;
- higher-quality JPEG: `LIMITED` because history is not provable;
- PNG: `LIMITED` because current losslessness does not prove prior history;
- other/invalid: `UNKNOWN`.

On original records, the conservative rule classified all 560 camera-native records as `UNSUPPORTED` and all 416 synthetic/digital PNG records as `LIMITED`; it produced zero `SUPPORTED` records. This is a valid safety boundary but not a useful broad eligibility gate. On controlled synthetic descendants from strong SAFE-A parents, it caught 1,340/1,340 signal-destroyed descendants as `UNSUPPORTED`, but it also downgraded all 10 descendants whose SAFE signal remained high. The gate is therefore high-sensitivity and over-conservative, not qualified for broad automatic acceptance.

Reliable from final bytes:

- current container, dimensions, DQT bytes/hash, sampling and progressive state;
- a conditional standard-table-equivalent quality estimate;
- measured current encoding facts.

Not established from final bytes:

- first camera encode;
- absence of prior JPEG compression;
- complete edit history;
- PNG innocence;
- authorship or synthetic origin.

## CES-S — Lythaus-owned candidate

The primary candidate was a standardized, source-family-weighted logistic regression over Lythaus-owned pixel/DCT/FFT/phase statistics. SAFE-A output was not used as a training target. No ensemble, vote, average, SAFE-A modification or confirmation retuning occurred. The candidate is explicitly `RESEARCH_ONLY_NOT_DEPLOYABLE`.

Independent replay of all 3,656 stored candidate scores produced a maximum absolute score delta of `0.0`, with zero threshold mismatches.

The frozen specificity-first candidate achieved:

- synthetic recall: 163/1,540, Wilson 95% CI 9.14%–12.22%;
- negative record FPR: 7/2,116, 0.33%, Wilson 95% CI 0.16%–0.68%;
- source-level worst-case FPR: 7/836, 0.84%, Wilson 95% CI 0.41%–1.72%;
- AUROC: 0.8176;
- AUPRC: 0.7632.

The source-level point estimate is below 1%, but its upper Wilson bound is above 1%, and recall is far too low for the intended rescue role. This is not a qualified high-authority specialist.

Held-out family recall was:

| Generator family | CES-S high-evidence recall across matrix |
|---|---:|
| BLIP3o-8B | 30/220 |
| Infinity-8B | 29/220 |
| Janus-Pro-7B | 0/220 |
| LongCat-Image | 32/220 |
| OmniGen2-7B | 44/220 |
| PixArt-Alpha | 16/220 |
| Qwen-Image-2512 | 12/220 |

Macro family recall was 10.58%; one family had zero recall. At the specificity-first threshold, CES-S uniquely classified 142 synthetic records that SAFE-A missed, but it lost 124 records SAFE-A got right and introduced six false positives on SAFE-A-negative records. That is not repeated, safe rescue across families and encoders.

## Encoder and shortcut tests

Pillow-trained CES-S evaluated on Sharp descendants at 73/700 recall with 0/640 record false positives. This is low recall. Sharp-trained CES-S evaluated on Pillow descendants at 166/700 recall, but the all-regime result contained 40/836 source-level false-positive sources, 4.78%, above the predeclared gate. No third encoder was installed solely to increase a count.

The pixel-only ablation produced 26/836 source-level false positives (3.11%) and was rejected as hard-negative unsafe. DCT/FFT combinations retained descriptive signal but did not produce sufficient independent rescue. The primary candidate did not use encoder ID, format or DQT features; codec identity was kept in CES-E. The shortcut audit records strong truth/operation/encoder association in the materialized matrix, so a candidate that uses those fields directly would be rejected.

## Phase/DCT validation

The same real media pairs were measured. At Pillow Q95 4:2:0, the strongest individual descriptive feature was DCT AC L1 mean with AUROC 0.7446, followed by FFT log-magnitude mean at 0.7076. DCT DC standard deviation was 0.5675 in this confirmation slice. Phase circular coherence was 0.3490 in the displayed orientation and did not support a robust standalone phase specialist. Stability was measured separately from discrimination; stable does not mean authenticating.

No scalar phase/DCT feature demonstrated a unique, source-family-held-out SAFE-A rescue sufficient for qualification. The correct disposition remains `PHASE_CONTEXT_ONLY`.

## Seedream-4 / Imagen-4 diagnostic

The post-hoc 520-record WP007I challenge used 120 historical synthetic records, including 20 Seedream-4 and 20 Imagen-4 records, plus 400 historical negative controls. It was never used for CES-S fitting or threshold selection.

- SAFE-A: 79/120 synthetic, 3/400 negatives;
- CES-S: 4/120 synthetic, 6/400 negatives;
- Seedream-4: SAFE-A 0/20, CES-S 0/20;
- Imagen-4: SAFE-A 1/20, CES-S 1/20;
- CES-S unique rescue on this challenge: 1 record.

The codec specialist does not solve the known generator-domain gap. A future generator-domain specialist remains a separate problem.

## FLUX.1 diagnostic

After CES-S was frozen, the candidate was run only on already-consumed diagnostic files: 120 processed public FLUX.1 examples and 40 consumed Cloudflare FLUX.1 examples. No fitting or threshold changes followed.

- processed public FLUX.1: CES-S 9/120;
- Cloudflare FLUX.1: CES-S 2/40;
- SAFE-A in the same diagnostic: 105/120 processed-public and 0/40 Cloudflare.

This does not explain the provider shift and does not make FLUX.1 a holdout. It reinforces `FLUX1_PROVIDER_RUNTIME_DOMAIN_SHIFT = UNRESOLVED_AND_MATERIAL`.

## Runtime and ownership

On 100 deterministic materialized files, the Lythaus-owned feature path measured approximately 20.83 ms p50, 31.60 ms p95, 35.78 ms max. CES-S linear inference measured 0.024 ms p50 and 0.032 ms p95. The 2.2 KB primary model is CPU-feasible. Historical SAFE-A CPU p95 remains approximately 93.165 ms. The runtime is not the blocker; evidence quality and rights are.

CES-S code and deterministic features are Lythaus-owned. The fitted artifact remains research-only because T2I output-use rights and SAFE checkpoint deployment rights are not established. No commercial-path claim is made.

## Research-only input boundary

WP007K supports an originals-first research boundary, not a production upload restriction:

- preserve original uploaded bytes before Lythaus resizing/recompression;
- use `EVIDENCE_GRADE` only when current-byte facts and provenance support a validated regime;
- classify ordinary JPEG/PNG and unknown-history media as `LIMITED_FORENSIC_QUALITY` unless stronger provenance exists;
- classify measured destructive or ambiguous regimes as `UNSUPPORTED_FOR_CERTIFICATION` or `UNKNOWN`;
- never infer human authorship from a low SAFE-A/CES-S score;
- never infer AI from JPEG, PNG, missing metadata, double compression or unsupported status.

The bounded cohort cannot estimate customer eligibility rates. Native camera JPEGs cannot currently be broadly accepted by this conservative rule without more provenance-linked validation.

## Architectural conclusion

SAFE-A remains the primary positive specialist in supported/high-quality regimes. CES-E remains an input-context measurement component. CES-S is not promoted. EF1, EF2, EF4, Moondream, Safety and GPT-OSS roles remain unchanged; no numerical averaging or majority vote was introduced.

The next highest-value experiment is **not another model immediately**. It is a rights-clean, provenance-linked native-camera-JPEG versus controlled-recompression applicability study across independent camera families and independent encoders. Its objective is to decide whether a useful `SUPPORTED`/`LIMITED` boundary exists for camera JPEGs. Only if that boundary is measurable should a new codec specialist be reconsidered.

FLUX.2 remains sealed. Production authorization remains `NO`.
