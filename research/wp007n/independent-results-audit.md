# WP007N independent results audit

Status: **PASS_WITH_BOUNDED_LIMITATIONS**

Recomputed from candidate/SAFE row files, not summaries. N=48: 28 negatives / 20 synthetics; actual human digital controls absent.
Candidates use strict `>`; SAFE uses `>=`. AP is non-interpolated, synthetic-positive; orientation is never selected on EVAL.

| Candidate | View | TP | FN | FP | TN | AP | AUROC |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A0 | reference/original | 19 | 1 | 13 | 15 | 0.79184718 | 0.82142857 |
| A0 | reference/jpeg75 | 19 | 1 | 13 | 15 | 0.78958324 | 0.81785714 |
| A1 | reference/original | 0 | 20 | 0 | 28 | 0.30074505 | 0.24107143 |
| A1 | reference/jpeg75 | 0 | 20 | 0 | 28 | 0.28820291 | 0.19285714 |
| A2 | reference/original | 0 | 20 | 0 | 28 | 0.29427061 | 0.21607143 |
| A2 | reference/jpeg75 | 0 | 20 | 0 | 28 | 0.28983848 | 0.2 |
| B0 | reference/original | 20 | 0 | 15 | 13 | 0.89928549 | 0.90357143 |
| B0 | reference/jpeg75 | 20 | 0 | 15 | 13 | 0.90329459 | 0.90714286 |
| B1 | reference/original | 20 | 0 | 15 | 13 | 0.87594009 | 0.88928571 |
| B1 | reference/jpeg75 | 20 | 0 | 15 | 13 | 0.89474041 | 0.89642857 |
| NUISANCE | reference/original | 7 | 13 | 9 | 19 | 0.51507651 | 0.70892857 |
| NUISANCE | reference/jpeg75 | 0 | 20 | 0 | 28 | 0.4216005 | 0.54107143 |
| A0_PERMUTED | reference/original | 0 | 20 | 0 | 28 | 0.31157073 | 0.28214286 |
| A0_PERMUTED | reference/jpeg75 | 0 | 20 | 0 | 28 | 0.31105692 | 0.28035714 |
| B0_PERMUTED | reference/original | 0 | 20 | 0 | 28 | 0.27299602 | 0.12321429 |
| B0_PERMUTED | reference/jpeg75 | 0 | 20 | 0 | 28 | 0.27511113 | 0.13392857 |
| B1_PERMUTED | reference/original | 0 | 20 | 0 | 28 | 0.27482988 | 0.12857143 |
| B1_PERMUTED | reference/jpeg75 | 0 | 20 | 0 | 28 | 0.27528086 | 0.13035714 |
| NUISANCE_PERMUTED | reference/original | 0 | 20 | 1 | 27 | 0.32030539 | 0.30714286 |
| NUISANCE_PERMUTED | reference/jpeg75 | 0 | 20 | 0 | 28 | 0.31736246 | 0.29821429 |

| Candidate | Source-worst FP/N | Exact-input rescue parents: original / JPEG75 / all declared | Checked parents | Max score difference |
| --- | ---: | --- | ---: | ---: |
| A0 | 13/28 | 15 / 19 / 19 | 37 | 2.22e-16 |
| A1 | 0/28 | 0 / 0 / 0 | 12 | 0 |
| A2 | 0/28 | 0 / 0 / 0 | 12 | 0 |
| B0 | 15/28 | 15 / 20 / 20 | 40 | 2.22e-16 |
| B1 | 15/28 | 15 / 20 / 20 | 40 | 2.22e-16 |
| NUISANCE | 6/28 | 4 / 0 / 1 | 25 | 1.11e-16 |
| A0_PERMUTED | 0/28 | 0 / 0 / 0 | 12 | 3.33e-16 |
| B0_PERMUTED | 0/28 | 0 / 0 / 0 | 12 | 1.11e-16 |
| B1_PERMUTED | 0/28 | 0 / 0 / 0 | 12 | 2.22e-16 |
| NUISANCE_PERMUTED | 0/28 | 0 / 0 / 0 | 12 | 2.22e-16 |

Every candidate-positive parent and the same score-blind four-negative-per-kind panel receive cached-feature/head-inference checks; all eight calibration parents are recomputed for every candidate. No backbone or SAFE forwards are replayed.
Source IDs, exact-input rescue evidence, per-row hashes/deltas, calibration maxima, SAFE metrics and input SHA-256 receipts are in [the JSON audit](independent-results-audit.json).

## Limitations

- N=48: 28 negative parents and 20 historical synthetic parents; synthetic=1.
- Actual human-created digital controls are absent; procedural supplements are not substitutes.
- Eight CSAFE calibration parents give 1/8 rank resolution, not demonstrated 1% population FPR.
- Source-worst coverage is unequal: original/JPEG75 for all, six conditions for the frozen 12-parent panel.
- Historical exposure, unknown pretraining membership, scene/device/template dependence and single-family fitting remain.
- SAFE is an unqualified raw experimental reference; exact-input rescues do not authorize production use.
- Feature lineage is checked against receipts; pixels, backbone forwards and SAFE forwards are not independently regenerated.
- Unselected parents receive row/decoded-view lineage checks, not independent feature-array inference checks.
- Negative results are bounded to this frozen cohort and transforms; no new-programme or broad detector confirmation.
