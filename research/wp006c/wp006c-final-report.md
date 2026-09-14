# WP006C — EF2 Physical Camera-Acquisition Feasibility

## Executive decision

WP006C_BASE_SHA = 04f3d3e6d83540dbf52a21f6760fb2398ab1c9f9
WP006C_BENCHMARK_FINGERPRINT = 1d3244ff464118904768acdeeb80561253dd7dccf65fff445148b26b9a6d77fb
FEATURE_REGISTRY_SHA256 = 1476739369d5968b7b1a3183bcd513364ad742fa71b69457ca4b937f2dc4d5f9
CONFIGURATION_SHA256 = acf2319934f8b5a8554e2665b3c039001e30c9a4d0beac2dd9e8932abded635e
CALIBRATION_CAMERA_FAMILIES = 29
CALIBRATION_DEVICE_FAMILIES = 2
SEEN_CAMERA_EVALUATION_FAMILIES = 3
NON_CAMERA_EVALUATION_FAMILIES = 26
HARD_NEGATIVE_EVALUATION_FAMILIES = 20
SYNTHETIC_EVALUATION_FAMILIES = 6
CALIBRATION_LOFO_ACCEPTANCE = 0.896552
CALIBRATION_THRESHOLD_VALUE = 3.515089
SEEN_CAMERA_EVALUATION_ACCEPTANCE = 0.333333
NON_CAMERA_FALSE_ACCEPTANCE = 0.038462
HARD_NEGATIVE_FALSE_ACCEPTANCE = 0
SYNTHETIC_FALSE_ACCEPTANCE = 0.166667
SHORTCUT_RISK = HIGH
DEVICE_CONFOUNDING = MODERATE
TRANSFORMATION_ROBUSTNESS = MIXED
STAGE_A_FEASIBILITY = FAIL
DEVICE_HOLDOUT_STATUS = SEALED
LGE_HOLDOUT_FAMILIES = 33
LGE_HOLDOUT_ACCEPTANCE = NOT_RUN
UNSEEN_DEVICE_TRANSFER = NOT_RUN
WP006C_EF2_DECISION = REJECT_CURRENT_EF2_MEASUREMENT
FINAL_CLASSIFICATION = WP006C_EF2_NOT_DEMONSTRATED

## Frozen measurement

The experiment used `LYTHAUS_EF2_PIXEL_ACQUISITION_CONSISTENCY_V0` as a deterministic one-class camera-consistency measurement. It operated on native decoded pixels, selected up to eight 256×256 patches by fixed sampled luminance variance, aggregated 26 interpretable residual/pipeline scalars, balanced the two enrolled Samsung devices equally, and used a calibration-camera-only 90th-percentile leave-one-family-out distance threshold.

The normalized measurement is monotonic with camera-manifold consistency and is not a probability of camera origin. `PRNU_STATUS = NOT_ADMITTED_AS_PRIMARY_EF2_SIGNAL`; no sensor fingerprint, camera identification, synthetic verdict, directional evidence, or product enforcement was produced.

## Routing and validity

The frozen benchmark contained 29 calibration camera families (samsung Galaxy A56 5G, samsung SM-A526B) and 3 seen-device camera evaluation families. The non-camera evaluation controls were kept as separate hard-negative (20) and synthetic (6) slices. Routing-fixture coverage is not production traffic coverage, and these results are not commercial detector accuracy.

Stage A failed because: NO_STABLE_CAMERA_MANIFOLD, INSUFFICIENT_SEEN_CAMERA_EVALUATION, SHORTCUT_RISK. The screenshot-heavy hard-negative slice, unknown generator provenance, owner-controlled source pool, and small seen-camera evaluation remain material limitations.

Per-device calibration LOFO acceptance at the frozen threshold: samsung Galaxy A56 5G=0.769231 (10/13); samsung SM-A526B=1 (16/16).

## Evaluation results

| Slice | Families | Valid | Median raw distance | IQR | Acceptance | Runtime p50 / p95 / max ms |
|---|---:|---:|---:|---:|---:|---:|
| SEEN_DEVICE_CAMERA_EVALUATION | 3 | 3 | 5.186317 | 1.293776 | 0.333333 | 753.7715 / 823.51772 / 831.2673 |
| HARD_NEGATIVE_NON_CAMERA_EVALUATION | 20 | 20 | 161.920471 | 160.932339 | 0 | 158.56055 / 227.75276 / 366.7066 |
| SYNTHETIC_NON_CAMERA_EVALUATION | 6 | 6 | 18.647511 | 15.129304 | 0.166667 | 165.29675 / 185.52375 / 188.233 |

Descriptive camera-versus-non-camera ROC AUC = 0.961538; bootstrap 95% interval = 0.884615–1; Cliff's delta = 0.923077. These are low-powered research diagnostics, not a Lythaus accuracy claim.

## Shortcut audit

- dimensions: risk=HIGH, descriptive AUC=0.012821.
- fileSize: risk=HIGH, descriptive AUC=0.
- metadataPresence: risk=LOW, descriptive AUC=0.5.
- encoderPresence: risk=LOW, descriptive AUC=0.628205.
- deviceIdentityPresence: risk=HIGH, descriptive AUC=0.

Camera evaluation rows carry known device labels while non-camera controls do not; this is a benchmark curation nuisance and is not evidence of general EF2.

Device confounding = MODERATE; median normalized center separation = 0.788051. No high pooled feature-center separation was observed between the two enrolled devices under the declared diagnostic rule.

## Transformation stress

Metadata-strip decoded-pixel invariance = PASS. The bounded stress used eight calibration families (four per active device) and did not retune the score or threshold.

Feature-group drift was not computed in this executed run because calibration feature-group scores were not persisted in the calibration artifact; this supplementary omission does not affect the primary score, threshold, Stage-A gate, or sealed-holdout decision.

- metadataStripped: valid=8, acceptance=0.875, median score delta=NOT_RUN, group drift median=NOT_RUN.
- JPEG95: valid=8, acceptance=0.875, median score delta=0.120064, group drift median=NOT_RUN.
- JPEG75: valid=8, acceptance=0.875, median score delta=0.876818, group drift median=NOT_RUN.
- resize75: valid=8, acceptance=0.75, median score delta=1.400587, group drift median=NOT_RUN.
- crop10: valid=8, acceptance=0.875, median score delta=0.980513, group drift median=NOT_RUN.

## Holdout protocol

Stage A did not authorize unblinding. The complete 33-family LGE LM-G710 device holdout remains sealed; no LGE pixels, features, thumbnails, or scores were accessed, and no holdout result artifact was created.

## Scientific boundaries

- Owner attestation is benchmark ground truth, not an input feature.
- Physical camera acquisition and synthetic depicted content remain independent axes.
- `nativeStatus` and byte-for-byte native-original availability remain unresolved.
- This work does not establish end-to-end authenticity accuracy, human false-positive rate, broad camera generalization, unseen-generator generalization, camera-native probability, native-byte originality, sensor identity, or EF2 directional validation.
- `END_TO_END_AUTHENTICITY_ACCURACY = UNRESOLVED`.
- `HUMAN_FALSE_POSITIVE_RATE = UNRESOLVED`; `HUMAN_FPR_TARGET = UNRESOLVED`.
- `COMMERCIAL_DETECTOR_ACCURACY = UNRESOLVED`.
- `BROAD_CAMERA_GENERALIZATION = UNRESOLVED`; `BROAD_NON_CAMERA_GENERALIZATION = UNRESOLVED`.
- `UNSEEN_GENERATOR_GENERALIZATION = UNRESOLVED`.
- `CAMERA_NATIVE_PROBABILITY = UNRESOLVED`; `NATIVE_BYTE_ORIGINALITY = UNRESOLVED`; `SENSOR_IDENTITY = UNRESOLVED`.
- `EF2_DIRECTIONAL_VALIDATION = UNRESOLVED`; `PARTIAL_EDIT_ORTHOGONALITY = NOT_RUN`.
- The current benchmark has three known device families, two active enrollment devices, one unseen device, limited seen-device positives, screenshot-heavy hard negatives, unknown synthetic generator provenance, no screen-recapture slice, no external camera replication, and no population-representativeness claim.

## Next research step

NEXT_RESEARCH_STEP = WP006D — EF2 Benchmark Expansion and Independent Device/Non-Camera Replication

No WP006D work was started, no production configuration changed, no specialist/model inference ran, no cloud calls were made, and no source media or raw residuals were committed.
