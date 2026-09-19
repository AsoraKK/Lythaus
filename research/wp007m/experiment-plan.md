# WP007M frozen design intent — before measurement

WP007M_PARENT_SHA = `63d5daf05243673ad65f2b59dbdb81e94290180b`. No parent merges or historical edits. SAFE-A remains frozen. No model training, source download, provider call, or reserve access.

## Competing mechanisms

1. Local noise-intensity/edge coupling: rejected as the primary direction because WP006E already measures it. Useful baseline, not new capability.
2. SAFE embedding perturbation: plausible but costlier and dependent on the previously failed representation; deferred, not falsified.
3. Joint cross-scale spatial dependence: selected. Existing K/L tools summarize marginal DCT/FFT/residual distributions; the new instrument measures where fine-scale and coarse-scale coefficient magnitudes co-occur. A shifted-parent null preserves marginal distributions exactly while breaking spatial correspondence. This extends classical image statistics; no claim of unpublished novelty.
4. Provenance/watermark: independently useful but coverage/access limited; no new passive signal from absence. Deferred.

## Experiment

Use only individually allowlisted existing approved records. Discovery: 40 photographic,40 synthetic (SD-3.5-Large and Gemini-2.0-Flash),20 procedural hard-negative parents. Held-out-from-M-design: 60 photographic,80 synthetic (GoT-R1-7B, Nano-Banana, Seedream-4, imagen-4),40 hard-negative parents. Model groups and procedural template categories cannot cross roles. These are previously consumed research data, not fresh programme confirmation. CSAFE and consumed FLUX.1 may be separate diagnostic panels if available. No physical capture request.

Measure centered native 256x256 RGB crop with no EXIF rotation or resize; smaller images fail explicitly. All measurements share this crop. Three orthonormal Haar levels, three orientations each. Candidate features: mean rank correlation of absolute child/parent coefficients at levels1:2 and2:3; their difference; fine/coarse upper-quartile co-occurrence excess. Parent is replicated to child grid. Fixed toroidal parent shifts form a marginal-preserving spatial-null control. Null is a falsification measurement, never additional independent N. Existing K static feature implementation is the baseline, supplemented by marginal Haar energy ratio.

Conditions: native crop, Pillow JPEG95/85/75 (4:2:0), resize75-and-return bicubic, resize75-return + JPEG95, independent Sharp JPEG95 (4:2:0), metadata-free PNG roundtrip. Record actual DQT and decoded pixel hashes. These are crop-level controlled transformations, not full-image upload qualification. Native whole-file SAFE scores are joined separately; fresh crop SAFE inference is preferred if existing runtime permits, otherwise comparison missingness is explicit.

Pre-inference rights amendment: the initial idea of selecting a feature/direction with synthetic labels is withdrawn before any scientific feature extraction. Primary scalar is preselected `abs(dependency12-dependency23)`, a scale-dependence mismatch, with higher values the research challenge direction. This direction is a falsifiable hypothesis, not known physics. Baseline is preselected K `dctDcStd` (higher direction, previously examined in J-R1). Each cutoff is the maximum of that scalar over rights-cleared discovery negatives and all declared conditions; positive requires STRICTLY GREATER. Only owned/Unsplash negative reference data set cutoffs. No synthetic feature selection, predictor fitting, model training or calibration on held-out outcomes. All four candidate feature distributions remain descriptive, with no winner chosen afterward. Freeze reference rules before held-out extraction.

Negative results are successful science. Advancement requires effect retained on both negative strata, unique SAFE rescue on held-out generators, no subgroup observed FPR >2%, and no codec/null explanation. FPR <=1% is not established without adequate source-level Wilson intervals. No universal claim from this pilot. If baseline equals/betters the candidate or confounders explain it, do not promote.

## Controls and stop gates

Freeze exact source membership/hashes before decoding for scientific features; allow decode/rights/hash exclusions only before score access. Split by source parent, generator, camera model when known and procedural template. Report device identity unknown for Unsplash, which is not pristine ground truth. SHA duplicate checks; perceptual-near-duplicate audit before scoring. Read only paths on positive allowlists; block reserve identifiers and path escape before opening. Keep media and bulk rows outside Git. One CPU worker, bounded memory, <100MB new bulk storage target; stop below 1GiB free disk or 1.5GiB available RAM. No neural checkpoint download. No adaptation of SAFE, no production change.

Metrics: per-feature AUROC and rank-biserial effect, stratum/family distributions, paired transformation deltas, null attenuation, fixed-rule recall/FP/Wilson and parent-worst-case FPR, SAFE joint outcomes, runtime. Correlation or stable features alone do not qualify EF3. Same-content ground truth pairs unavailable: matched measured nuisance variables reduce but do not eliminate content confounding.
