# WP007I — SAFE Selective Evidence Policy, Applicability-Gate Qualification & Hard-Negative Scale-Up

## Scientific disposition

**Primary disposition:** SAFE_POSITIVE_SPECIALIST_QUALIFIED_APPLICABILITY_GATE_UNPROVEN

WP007I confirms a strong SAFE positive synthetic-content signal on the bounded fresh corpus, but it does not establish that final image bytes can reliably identify when SAFE's low score has been destroyed by transformation. SAFE is therefore a qualified positive specialist for validated high-quality/original input regimes, with reduced authority required for degraded or unknown regimes. This is not a production authorization.

Secondary findings:

- FPR_TARGET_NOT_YET_DEMONSTRATED: the enlarged bounded negative benchmark produced 4/800 observed false positives; its two-sided Wilson upper bound is 1.2785%, so a population <=1% FPR is not demonstrated.
- SHADOW_SUPPORTERS_NOT_JUSTIFIED: SPAI, RINE and UFD did not provide sufficient low-burden unique rescue to justify a normal-path router in this package.
- FLUX2_REMAINS_SEALED: no FLUX.2 pixels, inference, transforms or provider calls were used.
- Production enforcement: NO.

## Parent and preserved controls

- WP007I_PARENT_SHA: bcbadd676f8ff0670369de80d487d77a6613fcf5
- Parent research PR: #848, intentionally unmerged.
- WP007H historical disposition remains unchanged: SAFE_SPECIALIST_QUALIFIED_WITH_LIMITED_APPLICABILITY.
- SAFE upstream commit: 4e998724651b227def64f5be0cd60c0aa1552c35
- SAFE checkpoint SHA-256: b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e
- Frozen SAFE threshold: 0.5864923000335693
- FLUX.1 remains consumed historical diagnostic evidence, not a fresh holdout.
- FLUX.2 remains sealed. WP007I recorded zero provider calls and zero pixel access.

No historical WP007H report or result was rewritten.

## Protocol and data freezes

The experiment plan was self-hashed before SAFE scoring:

- Experiment plan SHA-256: 3381e62f670a2b7aca4328a872f9eb7efe1a29ba546679355f60a2f60f4268b
- FLUX.2 forbidden-family denylist SHA-256: 106b15f89f259aeb22ef84d49d7fc62a3388ee983213679640284c726dd7b143
- Negative freeze SHA-256: bfcdc660f29b0a762f384ff03be96ac221722c82c7a49d43d46462339583c9a9
- Fresh synthetic freeze SHA-256: 3e327665591994fc8dced9a08d5c8d9e7368f85d233956a3d17d93067ba8b7a9
- Applicability policy SHA-256: 56ff64986982c9186f3875f365ceb36488111742fc4325eb1909a204e8cb3a47

The primary negative denominator contains 800 independent source families:

- 600 camera-native images.
- 200 rights-clean Lythaus procedural/digital hard negatives.
- 400 development and 400 confirmation role assignments.
- Hard-negative subtypes include CGI, renders, illustrations, charts, diagrams, UI/game screenshots, memes, composites, procedural patterns, text graphics and vector-like graphics.

The fresh synthetic set contains 120 images from six families, with three families in development and three disjoint families in confirmation:

- Development: Gemini-2.0-Flash, SD-3.5-Large, Seedream-4.
- Confirmation: GoT-R1-7B, Nano-Banana, imagen-4.
- 20 score-blind deterministic samples per family.
- No FLUX.2 family was selected or materialized.

The controlled transformation matrix contains 16 source families and 160 deterministic descendants. It is used for transformation/applicability characterization, not as an independent source-family denominator.

One source image generated a PIL decompression-bomb warning because of approximately 99.99 million pixels. It decoded and scored successfully; the warning is retained as a data-quality limitation.

## SAFE frozen qualification

SAFE was run with the exact WP007H implementation, checkpoint and preprocessing. No weights, threshold, preprocessing or score interpretation were changed after seeing new scores.

On 920 original bytes:

| Metric | Result |
|---|---:|
| Synthetic TP | 79/120 |
| Synthetic FN | 41/120 |
| Negative FP | 4/800 |
| Negative TN | 796/800 |
| Synthetic recall | 79/120 = 65.83% (Wilson 95% CI 56.97%–73.71%) |
| Overall negative FPR | 4/800 = 0.50% (Wilson 95% CI 0.19%–1.28%) |
| Camera FPR | 4/600 = 0.67% (Wilson 95% CI 0.26%–1.70%) |
| Digital/hard-negative FPR | 0/200 = 0.00% (Wilson 95% CI 0.00%–1.88%) |
| Precision at frozen threshold | 79/83 = 95.18% |
| ROC-AUC | 0.81625 |
| PR-AUC | 0.73157 |
| SAFE failures | 0/920 |

The raw score is not a probability. Brier score and ECE were therefore not applicable.

### Fresh generator-family recall

| Generator family | Recall |
|---|---:|
| Gemini-2.0-Flash | 19/20 = 95.0% (Wilson 76.39%–99.11%) |
| GoT-R1-7B | 20/20 = 100.0% (Wilson 83.89%–100%) |
| Nano-Banana | 20/20 = 100.0% (Wilson 83.89%–100%) |
| SD-3.5-Large | 19/20 = 95.0% (Wilson 76.39%–99.11%) |
| Seedream-4 | 0/20 = 0.0% (Wilson 0.00%–16.11%) |
| imagen-4 | 1/20 = 5.0% (Wilson 0.89%–23.61%) |

Development recall was 38/60 = 63.33% (Wilson 50.68%–74.38%). Disjoint confirmation recall was 41/60 = 68.33% (Wilson 55.77%–78.69%).

The result is not uniform modern-generator generalization. Four families were strongly detected and two families were largely missed. Compared with WP007H/R1's stronger modern-family aggregate, this is evidence of material generator-family dependence, not a reason to select a new threshold.

### Negative failures

All four false positives were camera-native Unsplash examples. They had JPEG encoding, ICC metadata, estimated JPEG quality approximately 89, and ordinary large camera dimensions.

All 12 digital/hard-negative subtype groups had zero observed false positives in this bounded sample, but their individual denominators were only 16 or 17, so their uncertainty remains wide. The camera false positives expose an applicability-rule blind spot: the frozen rule treats JPEGs with metadata as HIGH even when the estimated quality is materially below pristine.

The 4/800 result is promising for this benchmark but does not demonstrate a <=1% population FPR because the Wilson upper bound is 1.2785%.

## Applicability gate

The deterministic policy is WP007I_APPLICABILITY_RULE_V1. It is computed from input/file evidence and does not use SAFE's raw score, ground-truth origin, supporter scores or semantic observations.

The policy records reason codes and can produce HIGH, MODERATE, DEGRADED, UNSUPPORTED or UNKNOWN. It never converts compression, missing metadata or screenshot evidence into AI evidence.

On 920 original inputs:

- HIGH: 920/920.
- False downgrade: 0/920; Wilson upper bound 0.42%.
- Supported coverage: 920/920; Wilson lower bound 99.58%.

On the score-independent applicability development and confirmation matrices, false downgrade was 0/90 in each role; each has a Wilson upper bound of 4.09%.

On the controlled transformation matrix:

| Transformation | Destructive samples detected | SAFE synthetic recall | Negative FP | Mean SAFE score delta | Applicability |
|---|---:|---:|---:|---:|---|
| JPEG95 | 16/16 | 0/8 | 0/8 | -0.3480 | DEGRADED |
| JPEG85 | 16/16 | 0/8 | 0/8 | -0.3523 | DEGRADED |
| JPEG75 | 16/16 | 0/8 | 0/8 | -0.3350 | DEGRADED |
| resize75 | 0/16 | 6/8 | 0/8 | +0.0092 | HIGH |
| resize50 | 0/16 | 3/8 | 0/8 | -0.1233 | HIGH |
| screenshot-style | 0/16 | 5/8 | 0/8 | -0.0064 | HIGH |
| metadata strip | 0/16 | 6/8 | 0/8 | 0.0000 | HIGH |
| mild crop | 0/16 | 6/8 | 0/8 | +0.0166 | HIGH |
| mild blur | 0/16 | 4/8 | 0/8 | -0.0535 | HIGH |
| mild sharpen | 0/16 | 7/8 | 0/8 | +0.0180 | HIGH |

The declared destructive set was detected at 48/64 = 75.0% (Wilson 95% CI 63.18%–83.99%), exactly at the predeclared minimum. That aggregate is not sufficient for a qualified gate because the gate missed every resize50 descendant, and the JPEG rule missed lower-quality JPEGs when metadata was present.

Conclusion: the gate can identify the tested metadata-free JPEG degradation, but it cannot yet identify all materially destructive input regimes without either missing them or becoming too broad. The applicability gate is therefore unproven, not qualified.

## Selective policy comparison

P0, P1, P2 and P3 were compared on identical data without learned fusion:

- P0: frozen SAFE raw reference.
- P1: SAFE positive-only; low SAFE is not a human conclusion.
- P2: P1 plus applicability-conditioned inconclusive state.
- P3: P2 plus independent EF2 conflict preservation.

On original bytes, all four had the same SAFE positive coverage and negative FPR:

- positive synthetic evidence: 79/120;
- genuine high synthetic evidence false positives: 4/800;
- low SAFE was never mapped to HUMAN_AUTHORED;
- P3 had no EF2 records in this corpus, so its conflict path was contract-tested rather than empirically estimated here.

On the controlled JPEG descendants, P0/P1 produced no positive SAFE evidence but also no explicit inconclusive state. P2/P3 converted all 16/16 descendants for each of JPEG95, JPEG85 and JPEG75 to INCONCLUSIVE_DUE_TO_INPUT_REGIME:

- 8/8 synthetic descendants remained unresolved;
- 8/8 genuine descendants became false-review/inconclusive cases;
- no JPEG descendant was falsely called synthetic.

P2 therefore improves the semantics and safety of a low score on detected JPEG degradation, but does not improve raw original-byte metrics. Because resize50 and metadata-bearing lower-quality JPEGs were missed by the current gate, P2 is not yet a reliable broad applicability solution.

EF2 conflict preservation is implemented as an independent-axis rule. It was not scored on this corpus because no paired EF2 evidence records were included; tests verify that strong EF2 plus strong SAFE preserves both axes rather than cancelling one.

## False-negative analysis

The 41 original synthetic misses were concentrated in:

- Seedream-4: 20/20 missed.
- imagen-4: 19/20 missed.
- Gemini-2.0-Flash: 1/20 missed.
- SD-3.5-Large: 1/20 missed.
- GoT-R1-7B: 0/20 missed.
- Nano-Banana: 0/20 missed.

The evidence supports generator-family/domain dependence. It does not support assigning those misses to a particular transformation without additional provenance. WP007I does not tune SAFE to these misses.

## Shadow supporter analysis

SPAI_C512, RINE and UFD were run only as descriptive shadow diagnostics on 1,080 rows: 920 originals plus 160 transformation descendants. Supporters could not change SAFE qualification or any policy result.

| Supporter | SAFE misses rescued | Supporter-only correct | Supporter FP | Induced false contradictions | Runtime p95 |
|---|---:|---:|---:|---:|---:|
| SPAI_C512 | 8/84 | 8 | 34/880 | 34 | 15.12 s |
| RINE | 5/84 | 5 | 15/880 | 14 | 3.12 s |
| UFD | 0/84 | 0 | 46/880 | 45 | 3.14 s |

Rescue precision was 8/42 = 19.05% for SPAI, 5/19 = 26.32% for RINE and 0/45 for UFD. RINE/UFD score correlation was Pearson 0.0793 and Spearman 0.3028 across 1,080 rows. SAFE/RINE correlation was Pearson 0.3575 and Spearman 0.2408.

No supporter met a sufficient marginal-value bar for promotion. SPAI and RINE showed small unique rescue counts but introduced too much contradiction/false-positive burden for a normal path in this bounded analysis. UFD added no unique rescue and remains diagnostic only.

Recommendation: do not start a router package on the basis of these results alone. A future router would need to beat SAFE plus deterministic applicability/contradiction handling on independent data.

## FLUX.1 domain-shift risk

WP007I did not re-score or re-tune consumed FLUX.1 material. It preserves WP007H's post-hoc diagnostic:

- public FLUX.1 median SAFE score: approximately 0.9487, with 39/40 above the frozen threshold;
- consumed Cloudflare FLUX.1 median SAFE score: approximately 0.0466, with 0/40 above threshold;
- dimension matching explained only part of the gap.

The remaining discrepancy is UNRESOLVED_DOMAIN_OR_PIPELINE_SHIFT. It remains a material risk for any future deployment claim. WP007I does not attribute it to a specific provider transform.

## Rights and product boundary

SAFE remains:

- research-evaluation eligible;
- deployment/commercial use review required;
- not cleared for production enforcement.

The evaluation media and checkpoints remain outside Git. No production route, upload flow, public label, moderation policy, Judge authority, PlanetScale schema, appeal workflow or enforcement behavior was changed.

The structured contract in packages/authenticity/src/wp007i.ts records SAFE artifact identity, preprocessing, threshold, raw score, applicability, missingness, runtime and transformation context. Its public view omits the internal raw score. Safety, Moondream, EF1, EF2 and Judge remain isolated from the SAFE score.

## Storage and compute

- Experiment media and derivatives were kept outside Git.
- Materialized experiment bytes: 3,958,862,973.
- Selected bytes preserved after cleanup: 3,107,030,595.
- Regenerable SPAI C512 derivative bytes removed: 851,832,378.
- Unresolved cleanup bytes: 0.
- No sealed reserve data was deleted or opened.
- SAFE original score runtime p95: 165.11 ms in the bounded run.
- SAFE transform score runtime p95: 146.21 ms in the bounded run.
- Supporter runs remained shadow-only; SPAI p95 was 15.12 s, RINE 3.12 s and UFD 3.14 s.

## Required question answers

A. SAFE is strong on four of six fresh families and fails on two; aggregate 79/120, with material family dependence.

B. The enlarged negative benchmark observed 4/800 false positives.

C. The result does not preserve a uniform R1-style separation; modern-family behavior is heterogeneous.

D. JPEG95 destroyed positive recall in the controlled set: 0/8.

E. JPEG85 destroyed positive recall: 0/8.

F. JPEG75 destroyed positive recall: 0/8.

G. resize75 retained 6/8 recall; resize50 retained 3/8.

H. Screenshot-style processing retained 5/8; it weakened rather than completely invalidated all examples in this small matrix.

I. JPEG transformations completely invalidated positive SAFE evidence in the controlled set; resize50 materially weakened it; resize75, crop, sharpening and metadata stripping were less damaging in this matrix. Mild blur was materially weakening.

J. The current gate identifies the tested metadata-free JPEG degradation but misses resize50 and metadata-bearing lower-quality JPEGs. It cannot yet identify all destructive regimes.

K. WP007H's public-to-Cloudflare FLUX.1 diagnostic did not reproduce the low Cloudflare distribution through dimension matching.

L. The largest tested measurable factor, dimension matching, explained only part of the gap; the remaining shift is unresolved.

M. The unexplained generator/pipeline shift remains a material risk.

N. SPAI uniquely rescued 8 SAFE misses but introduced 34 negative contradictions; this is not enough to promote it.

O. RINE uniquely rescued 5 SAFE misses but introduced 14 negative contradictions; this is not enough to promote it.

P. UFD rescued 0 SAFE misses and added no unique value beyond RINE in this experiment.

Q. SAFE is justified as the lead EF3 positive specialist candidate for validated input regimes, not as a universal detector or production authority.

R. A future SAFE-led router is not justified yet by supporter marginal value. Deterministic applicability and conflict handling should be strengthened first.

S. FLUX.2 should remain sealed. WP007I does not produce a sufficiently qualified applicability policy to justify consuming it.

T. Production enforcement is NO.

## Final recommendation

Keep SAFE as a research/shadow primary positive EF3 specialist with explicit applicability-aware semantics:

- high SAFE score plus supported applicability can provide strong positive synthetic evidence;
- low SAFE score is never human authorship evidence;
- low SAFE score under detected degradation is inconclusive;
- missing, timeout and invalid model results are explicit missingness;
- EF2 camera evidence remains an independent axis;
- no public or irreversible action follows from SAFE alone.

Before any future reserve evaluation, obtain independent evidence for a better applicability rule, expand the hard-negative benchmark further, and separately resolve SAFE deployment rights. The permanent engineering rule is:

> A learned meta-calibrator or corroboration router earns a role only by demonstrating material improvement over the strongest specialist plus deterministic applicability/contradiction policy on independent confirmation data, including hard negatives and relevant transformations.

## Artifacts

Key committed artifacts:

- research/wp007i/current-state-audit.json
- research/wp007i/experiment-plan.json
- research/wp007i/negative-data-freeze.json
- research/wp007i/fresh-synthetic-freeze.json
- research/wp007i/data-role-freeze.json
- research/wp007i/applicability-policy.json
- research/wp007i/applicability-policy-freeze.json
- research/wp007i/safe-freeze-reference.json
- research/wp007i/safe-original-scores.json
- research/wp007i/safe-transformation-scores.json
- research/wp007i/safe-qualification-result.json
- research/wp007i/negative-qualification-result.json
- research/wp007i/fresh-synthetic-result.json
- research/wp007i/safe-input-regime-report.json
- research/wp007i/safe-transformation-result.json
- research/wp007i/selective-policy-comparison.json
- research/wp007i/false-positive-analysis.json
- research/wp007i/false-negative-analysis.json
- research/wp007i/shadow-supporter-analysis.json
- research/wp007i/applicability-confirmation-result.json
- research/wp007i/qualification-gate-assessment.json
- research/wp007i/flux1-posthoc-risk.json
- research/wp007i/flux2-zero-access-assertion.json
- research/wp007i/safe-selective-evidence-contract.json
- research/wp007i/storage-delta.json
- research/wp007i/protocol-hashes.json

No raw media, weights, bulk tensors, secrets or private absolute paths are committed.
