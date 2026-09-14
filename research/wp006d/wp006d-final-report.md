# WP006D — EF2 Benchmark Expansion & Independent Multi-Device Replication

## Executive decision

WP006D_BASE_SHA = 2b70158f70fd78c9a100e55b85816f40703997dc

WP006D_BENCHMARK_FINGERPRINT = cb1119f9569736f81b0132969a3ea748a03d85ce03a99387f239f074eba235d4

CSAFE_LOCAL_STATUS = FOUND_AND_VERIFIED

CSAFE_RIGHTS_STATUS = VERIFIED_CC_BY_4.0_WITH_ATTRIBUTION

CSAFE_ARCHIVE_DIRECTORY_FINGERPRINT_SHA256 = 4e8c0d40f2c7b548d63417be28a8705ba79cda5b6682764ba0d02d38dd6c6131

CSAFE_DEVICE_FAMILIES_AVAILABLE = 60

CSAFE_IMAGE_FILES_AVAILABLE = 49,970

CSAFE_REPLICATION_DEVICE_COUNT = 6

CSAFE_REPLICATION_CAMERA_FAMILIES = 72

CSAFE_FUTURE_HOLDOUT_DEVICE_COUNT = 4

NEW_NON_CAMERA_CONTROL_FAMILIES = 32

SOURCE_FAMILY_LEAKAGE = PASS

SCENE_LEAKAGE_STATUS = DOCUMENTED_NOT_DISJOINT

WP006D_PLAN_SHA256 = 5519f86aef72dec0d86a9d8bf347e668531c957ea65d171716e655eb6797e996

WP006D_BENCHMARK_EXPANSION = READY_FOR_V1_DESIGN

V0_EXTERNAL_REPLICATION = FAILED

## Frozen v0 results

The experiment ran the unchanged WP006C `LYTHAUS_EF2_PIXEL_ACQUISITION_CONSISTENCY_V0` feature registry, robust model, and calibration-camera-only threshold. CSAFE images were selected from six model/device directories before any EF2 scores; four other device directories were recorded as future holdout only. No refit, recentering, threshold movement, or feature change occurred.

Threshold = 3.515089; feature registry hash = `1476739369d5968b7b1a3183bcd513364ad742fa71b69457ca4b937f2dc4d5f9`; configuration hash = `acf2319934f8b5a8554e2665b3c039001e30c9a4d0beac2dd9e8932abded635e`. The normalized measurement is not a probability of camera origin.

### Original decoded pixels

V0_ORIGINAL_CAMERA_ACCEPTANCE = 0.402778

V0_ORIGINAL_NON_CAMERA_FALSE_ACCEPTANCE = 0

| Device | Families | Median distance | IQR | Acceptance | Runtime p50 / p95 ms |
|---|---:|---:|---:|---:|---:|
| iPhone11_1 | 12 | 5.734544 | 4.116108 | 0.25 | 506.9521 / 674.204825 |
| iPhone12_1 | 12 | 4.801165 | 2.736427 | 0.333333 | 358.97555 / 566.985505 |
| iPhone14_1 | 12 | 4.972643 | 10.765537 | 0.416667 | 322.41965 / 353.270625 |
| note10_1 | 12 | 5.637328 | 5.214997 | 0.333333 | 590.9501 / 1242.435275 |
| s20_1 | 12 | 1.998365 | 4.280845 | 0.583333 | 169.29735 / 179.473165 |
| s21_1 | 12 | 2.939654 | 3.136013 | 0.5 | 174.6955 / 190.309065 |

| Non-camera subtype | Families | False acceptance | Median distance |
|---|---:|---:|---:|
| SCREENSHOT | 32 | 0 | 313.195922 |

Original camera-vs-control ROC AUC = 0.991319; bootstrap 95% = 0.97309–1; Cliff's delta = 0.982639. These are bounded research diagnostics, not detector accuracy.

### Canonical decoded-pixel challenge

CANONICAL_PIXEL_CROP_SIZE = 1024

CANONICAL_CAMERA_ACCEPTANCE = 0.388889

CANONICAL_NON_CAMERA_FALSE_ACCEPTANCE = 0

PIXEL_SIGNAL_SURVIVAL = WEAK

The same centered native-grid crop was applied in memory after decoding. No global resize, file metadata, filename, format marker, or file size was passed to the frozen extractor.

## Shortcut and leakage audit

- dimensions: HIGH (descriptive AUC 0).
- fileSize: HIGH (descriptive AUC 0).
- format: LOW (descriptive AUC 0.5).
- metadataPresence: LOW (descriptive AUC 0.5).
- device identity: HIGH; known CSAFE camera labels are absent from owner controls by design.

SHORTCUT_RISK = HIGH

DEVICE_IDENTITY_SHORTCUT_RISK = HIGH

SCENE_MATCHED_DIAGNOSTIC = NOT_RUN; CSAFE directory paths expose scene type and lens but no stable scene identifiers. Source-family exact-hash isolation passed; probable average-hash near pairs are recorded in the result artifact and were not silently merged.

## Holdout protection

LGE_HOLDOUT_STATUS = SEALED

CSAFE_FUTURE_HOLDOUT_STATUS = SEALED

No LGE pixels, features, thumbnails or scores were accessed. The four CSAFE future-holdout device directories were inspected only through central-directory metadata; no bytes were extracted or decoded.

## Scientific limitations

The CSAFE archive is a rights-audited CC BY 4.0 research source with attribution requirements. The new non-camera slice contains 32 independent owner-controlled future-expansion families but is screenshot-only in the available pool, so broad non-camera generalization remains unresolved. CSAFE supplies no stable scene IDs in the audited directory; primary scene disjointness is therefore not established. Synthetic generator provenance is not relevant to the EF2 target but remains unknown. The owner-controlled population and CSAFE collection are not population-representative. Only six replication devices were used, with four CSAFE devices and the complete 33-family LGE device still reserved.

This replication does not establish end-to-end authenticity accuracy, human false-positive rate, broad camera generalization, camera-native probability, native-byte originality, sensor identity, or EF2 directional validation. WP006C's negative result remains unchanged.

END_TO_END_AUTHENTICITY_ACCURACY = UNRESOLVED

HUMAN_FALSE_POSITIVE_RATE = UNRESOLVED

COMMERCIAL_DETECTOR_ACCURACY = UNRESOLVED

BROAD_CAMERA_GENERALIZATION = UNRESOLVED

BROAD_NON_CAMERA_GENERALIZATION = UNRESOLVED

UNSEEN_GENERATOR_GENERALIZATION = UNRESOLVED

CAMERA_NATIVE_PROBABILITY = UNRESOLVED

NATIVE_BYTE_ORIGINALITY = UNRESOLVED

SENSOR_IDENTITY = UNRESOLVED

EF2_DIRECTIONAL_VALIDATION = UNRESOLVED

## Decision and next step

WP006D_REPLICATION_RESULT = FAILED

The benchmark foundation is READY_FOR_V1_DESIGN. This is a data/protocol result, not a product verdict.

NEXT_RESEARCH_STEP = WP006E — EF2 Device-Invariant Measurement v1 Design & Sealed-Device Evaluation

WP006D_FINAL_CLASSIFICATION = WP006D_REPLICATION_READY_FOR_V1

No model or cloud inference ran; no source media was committed, uploaded, renamed, moved, modified or recompressed; no production configuration, labels, enforcement or WP006C artifact changed. Implementation commit: `d712c77d304f23608ae9ee6a174022c09af0b197`.
