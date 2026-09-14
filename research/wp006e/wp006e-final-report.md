# WP006E — EF2 Device-Invariant Measurement v1

## Executive decision

WP006E evaluates a new deterministic, pixel-domain EF2 measurement. WP006C v0 and WP006D remain immutable historical results. This package makes no production decision and assigns no directional Evidence Packet role.

- WP006E_BASE_SHA = bc3e17729dda099e4f9e6086d99ef5fc6153a4a9
- WP006E_BENCHMARK_FINGERPRINT = 87daea141221478c72ffafad6c06e5bae256b23e3cbe2c7e8de33e8bc1e35718
- WP006E_IMPLEMENTATION_COMMIT = 9fe9e7bff3b14485b29abaad31c5f2437b871c17
- WP006E_EXECUTION_COMMIT = 9b219a0a5a08de1cf20e60a3907c3e8c0f51d89b
- WP006E_FINAL_ARTIFACT_COMMIT = 6b0968ea1180937134a380d19a5df09c6b453d1e
- WP006E_PLAN_SHA256 = 238459761db48c4aae93de982c03e80793aae6167c80610230197a10f3288fea
- V1_CANDIDATE_FEATURES = 39
- V1_SELECTED_FEATURES = 10
- V1_SELECTED_FEATURE_GROUPS = RESIDUAL_MAGNITUDE, TEXTURE_NORMALIZED_RESIDUAL, LUMINANCE_CONDITIONED_RESIDUAL, CROSS_CHANNEL_RESIDUAL, RESIDUAL_AUTOCORRELATION, DIRECTIONAL_RESIDUAL, PARITY_PERIODICITY, MULTISCALE_RESIDUAL, RESIDUAL_DISTRIBUTION, PATCH_STATIONARITY
- V1_FREEZE_SHA256 = 8d6478c7050f2c4ce50120c703986b33ac9bb1e2c6e764622b47db2779d23897
- WP006E_STAGE_A = PASS
- WP006E_STAGE_A_FAILURES = NONE
- WP006E_STAGE_B = PASS
- WP006E_STAGE_C = MIXED
- WP006E_EF2_DECISION = KEEP_MEASUREMENT_ONLY
- FINAL_CLASSIFICATION = WP006E_EF2_V1_MEASUREMENT_ONLY

## Frozen v1 design

Primary representation: decoded pixels, deterministic centered native 1024x1024 crop, and a fixed 4x4 grid of sixteen non-overlapping 256x256 patches. The primary extractor receives no EXIF, filename, dimensions, file size, MIME, encoder, camera label, truth axis, category or split. Candidate selection was frozen by the predeclared camera/control effect, device-heterogeneity and nuisance-penalized quality function; nested leave-one-device-out refits selection, weights and camera-only threshold per fold.

The score is a bounded linear measurement where higher values mean greater consistency with the enrolled cross-device camera feature relation. A normalized score is not a probability of camera origin. It cannot assign REAL, AI, SUPPORTS, CONTRADICTS or policy authority. PRNU and sensor identity were not admitted.

## Final selected features

| feature | group | computation | direction | quality | device heterogeneity | nuisance penalty | weight |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| residualTailRatio | RESIDUAL_MAGNITUDE | Ninetieth-to-median absolute residual ratio with a fixed epsilon. | -1 | 1.4623739872338821 | 0.9031009871418937 | 0.3042386553311429 | 0.1554463609536208 |
| edgeFlatResidualRatio | TEXTURE_NORMALIZED_RESIDUAL | Edge residual mean divided by flat residual mean with a fixed epsilon. | -1 | 1.3310349423399899 | 0.5179028053528222 | 0.4949045817498744 | 0.1414853791814426 |
| residualIntensityBinContrast | LUMINANCE_CONDITIONED_RESIDUAL | Range-to-mean contrast of absolute residual means across four luminance bins. | -1 | 1.8819394785290373 | 0.3473000941908921 | 0.36611569082906736 | 0.20004502680305586 |
| crossChannelResidualCorrelationRG | CROSS_CHANNEL_RESIDUAL | Pearson correlation of red and green local residuals. | -1 | 0.4701620870479132 | 0.3974307596479567 | 0.25232028168441034 | 0.04997694579359943 |
| normalizedResidualAutocorrX1 | RESIDUAL_AUTOCORRELATION | Correlation of residuals one fixed sampled-grid step horizontally. | -1 | 0.8034076237998794 | 0.21048544586825313 | 0.3786782959643008 | 0.08540003622350628 |
| residualGradientCorrelation | DIRECTIONAL_RESIDUAL | Correlation between absolute residual and local first-difference gradient. | -1 | 0.5402762990883143 | 0.5339412942394868 | 0.41544453344447224 | 0.057429895044581826 |
| parityPeriodicityRatio | PARITY_PERIODICITY | Variance-to-mean ratio of mean absolute residual across four x/y parity classes. | -1 | 0.04613249685880458 | 1.483372038018972 | 0.08323028571073315 | 0.00490375842363682 |
| residualScaleP90Ratio3To5 | MULTISCALE_RESIDUAL | Three-by-three residual ninetieth percentile divided by five-by-five residual ninetieth percentile. | 1 | 0.4075827600338092 | 0.5866441681002544 | 0.35583401393480807 | 0.04332493424238925 |
| residualSignBalance | RESIDUAL_DISTRIBUTION | Absolute positive/negative residual count imbalance. | -1 | 1.4532850193122862 | 0.9559170177804591 | 0.28937377476042403 | 0.15448022848643383 |
| patchEdgeFlatRatioDispersion | PATCH_STATIONARITY | Relative MAD of per-patch edge-to-flat residual ratios. | -1 | 1.01138473227092 | 0.6527862779972379 | 0.2430526216329092 | 0.1075074348477333 |

The selected set contains 10 features from 10 groups. Individual feature weights and diagnostics are measurements of this experiment, not proof of a physical sensor mechanism.

## Development

- DEVELOPMENT_CAMERA_DEVICES = iPhone11_1, iPhone12_1, iPhone14_1, note10_1, s20_1, s21_1, iPhone11_3, iPhone12_3, iPhone14_3, note10_3, s20_3, s21_3, s20_4, s21_4
- DEVELOPMENT_CAMERA_MODEL_FAMILIES = iPhone11, iPhone12, iPhone14, note10, s20, s21
- DEVELOPMENT_CAMERA_FAMILIES = 168
- DEVELOPMENT_NON_CAMERA_FAMILIES = 67
- CALIBRATION_DEVICE_FAMILIES = 14
- CALIBRATION_DEVICE_WEIGHTING = equal device weighting through per-device medians
- NESTED_LODO_CAMERA_ACCEPTANCE = 0.8988095238095238
- MEDIAN_DEVICE_ACCEPTANCE = 0.9166666666666666
- WORST_DEVICE_ACCEPTANCE = 0.75
- DEVELOPMENT_CONTROL_FALSE_ACCEPTANCE = 0.1044776119402985
- V0_DEVELOPMENT_CAMERA_ACCEPTANCE = 0.30357142857142855
- V0_DEVELOPMENT_CONTROL_FALSE_ACCEPTANCE = 0.014925373134328358

| development device | families | valid | median | IQR | acceptance |
| --- | ---: | ---: | ---: | ---: | ---: |
| iPhone11_1 | 12 | 12 | 0.7038772936602999 | 0.07554061735085216 | 1 |
| iPhone11_3 | 12 | 12 | 0.6739952582056448 | 0.062379843419728354 | 0.9166666666666666 |
| iPhone12_1 | 12 | 12 | 0.6935239552465404 | 0.04322898451117785 | 0.9166666666666666 |
| iPhone12_3 | 12 | 12 | 0.7265191889474529 | 0.08410401506995768 | 0.8333333333333334 |
| iPhone14_1 | 12 | 12 | 0.6919610430343075 | 0.0778028918329029 | 0.8333333333333334 |
| iPhone14_3 | 12 | 12 | 0.7079966437441885 | 0.03630181141960176 | 1 |
| note10_1 | 12 | 12 | 0.7099392548361682 | 0.03277468885038948 | 0.9166666666666666 |
| note10_3 | 12 | 12 | 0.7051111934702441 | 0.13435880735599093 | 0.8333333333333334 |
| s20_1 | 12 | 12 | 0.6657937558212157 | 0.03204559203206758 | 0.9166666666666666 |
| s20_3 | 12 | 12 | 0.6669877170089036 | 0.04113379436708953 | 1 |
| s20_4 | 12 | 12 | 0.6769215907111921 | 0.06418835041368154 | 0.8333333333333334 |
| s21_1 | 12 | 12 | 0.6893672647458784 | 0.05362396398686753 | 1 |
| s21_3 | 12 | 12 | 0.7118632818748094 | 0.038484767489690985 | 0.8333333333333334 |
| s21_4 | 12 | 12 | 0.6825423941558906 | 0.0356703922471413 | 0.75 |

## Sealed-role protocol and access

- INTERNAL_VALIDATION_DEVICES = iPhone11_5, iPhone12_5, iPhone14_5, note10_5; families = 48; status = OPENED_AFTER_V1_FREEZE
- INTERNAL_VALIDATION_MODEL_FAMILIES = iPhone11, iPhone12, iPhone14, note10
- SAME_MODEL_INSTANCE_HOLDOUT_DEVICES = iPhone11_2, iPhone12_2, iPhone14_2, note10_2; families = 48; status = OPENED_AFTER_STAGE_B
- FUTURE_MODEL_RESERVE_DEVICES = iPhone11_6, iPhone12_6, iPhone14_6, note10_6; families = 48; status = SEALED
- LGE_HOLDOUT_STATUS = SEALED; families = 33
- DEVELOPMENT_CONTROLS = 67; status = OPENED_FOR_DEVELOPMENT
- SEALED_INTERNAL_VALIDATION_CONTROLS = 32; status = OPENED_AFTER_V1_FREEZE
- FINAL_SEALED_NON_CAMERA_CONTROLS = 24; status = OPENED_AFTER_STAGE_B

The CSAFE archive was not fully extracted. 168 development CSAFE image families, 48 internal-validation families, and 48 same-model holdout families were opened; total CSAFE pixel families opened = 264, below the 300-image cap. The four future-model-reserve devices and LGE remained pixel-sealed. Internal validation is new-device validation; all six broad CSAFE model families are represented in development, so it is not unseen-model validation.

## Stage A — development gate

- NESTED_LODO_CAMERA_ACCEPTANCE = 0.8988095238095238
- MEDIAN_DEVICE_ACCEPTANCE = 0.9166666666666666
- WORST_DEVICE_ACCEPTANCE = 0.75
- DEVELOPMENT_CONTROL_FALSE_ACCEPTANCE = 0.1044776119402985
- V0_DEVELOPMENT_CAMERA_ACCEPTANCE = 0.30357142857142855
- DEVICE_INVARIANCE_RISK = LOW
- SHORTCUT_RISK = MODERATE
- WP006E_STAGE_A = PASS

Stage A passed. This is a development-gate result, not production validation.

## Stage B — sealed internal validation

- VALIDATION_CAMERA_ACCEPTANCE = 0.875
- VALIDATION_CONTROL_FALSE_ACCEPTANCE = 0.03125
- VALIDATION_MEDIAN_DEVICE_ACCEPTANCE = 0.8333333333333334
- VALIDATION_WORST_DEVICE_ACCEPTANCE = 0.8333333333333334
- V0_VALIDATION_CAMERA_ACCEPTANCE = 0.25
- WP006E_STAGE_B = PASS

| validation device | families | valid | median | IQR | acceptance |
| --- | ---: | ---: | ---: | ---: | ---: |
| iPhone11_5 | 12 | 12 | 0.7082545575728287 | 0.03863916277584156 | 1 |
| iPhone12_5 | 12 | 12 | 0.6684239795682927 | 0.052905367365004174 | 0.8333333333333334 |
| iPhone14_5 | 12 | 12 | 0.692186200263075 | 0.10308022974087905 | 0.8333333333333334 |
| note10_5 | 12 | 12 | 0.6920107886591201 | 0.056822761338356065 | 0.8333333333333334 |

Stage B ran once after the v1 freeze. No validation result was used to alter features, weights, threshold, preprocessing or crop rule.

## Stage C — sealed same-model-instance transfer

- SAME_MODEL_HOLDOUT_CAMERA_ACCEPTANCE = 0.7872340425531915
- FINAL_SEALED_CONTROL_FALSE_ACCEPTANCE = 0.043478260869565216
- V0_HOLDOUT_CAMERA_ACCEPTANCE = 0.14893617021276595
- SCENE_CONTAMINATED_DIAGNOSTIC_EXCLUSIONS = 1
- STAGE_C_FAILURES = SCENE_CONTAMINATED_DIAGNOSTIC_EXCLUSIONS
- WP006E_STAGE_C = MIXED

| same-model holdout device | families scored | valid | median | IQR | acceptance |
| --- | ---: | ---: | ---: | ---: | ---: |
| iPhone11_2 | 12 | 12 | 0.7188284625482733 | 0.039172395583075836 | 0.9166666666666666 |
| iPhone12_2 | 11 | 11 | 0.656586077111655 | 0.0921871421396876 | 0.7272727272727273 |
| iPhone14_2 | 12 | 12 | 0.6322889170067985 | 0.12084445474658734 | 0.5833333333333334 |
| note10_2 | 12 | 12 | 0.6780795661676317 | 0.05607665746087842 | 0.9166666666666666 |

Stage C was consumed once under the immutable holdout-unblind freeze. It was MIXED, not PASS: the predeclared near-duplicate contamination diagnostic excluded one family, and iPhone14_2 was the weakest device at 0.583333 acceptance. No post-unblind retuning or retry occurred. This is same-model device-instance transfer evidence, not unseen-model validation.

## Transformation stress

- METADATA_STRIP_INVARIANCE = PASS
- JPEG95_RETENTION = 1
- JPEG75_RETENTION = 1
- RESIZE75_RETENTION = 1
- CROP10_RETENTION = 1
- TRANSFORMATION_ROBUSTNESS = PROMISING

The bounded stress used eight development families and did not tune v1. Metadata stripping was invariant; JPEG, resize and crop retention were recorded as promising for this small sample.

## Shortcut and invariance audit

- DIMENSION_SHORTCUT_RISK = LOW
- FILESIZE_SHORTCUT_RISK = LOW
- FORMAT_SHORTCUT_RISK = LOW
- METADATA_PRESENCE_SHORTCUT_RISK = LOW
- SCENE_SHORTCUT_RISK = MODERATE
- LENS_SHORTCUT_RISK = LOW
- DEVICE_IDENTITY_SHORTCUT_RISK = LOW
- SHORTCUT_RISK = MODERATE
- DEVICE_INVARIANCE_RISK = LOW
- SCENE_LEAKAGE_STATUS = DOCUMENTED_NOT_DISJOINT_CSAFE_SCENE_IDS_UNAVAILABLE

Primary score inputs remained metadata-independent. Scene/lens associations remain a limitation of this CSAFE-only development design; they were audited and not passed to the extractor. Source/dataset-domain invariance remains unresolved.

## Protocol, resources and cost

- CSAFE_ARCHIVE_DIRECTORY_FINGERPRINT_SHA256 = 4e8c0d40f2c7b548d63417be28a8705ba79cda5b6682764ba0d02d38dd6c6131
- FULL_ARCHIVE_EXTRACTION = FALSE
- DEVELOPMENT_CSAFE_PIXEL_IMAGES_DECODED = 168
- INTERNAL_VALIDATION_CSAFE_PIXEL_IMAGES_DECODED = 48
- SAME_MODEL_HOLDOUT_CSAFE_PIXEL_IMAGES_DECODED = 48
- TOTAL_CSAFE_PIXEL_IMAGES_OPENED = 264
- MAX_CSAFE_PIXEL_IMAGES = 300
- MODEL_INFERENCE_CALLS = 0
- CLOUD_CALLS = 0
- INCREMENTAL_COST_USD = 0
- PRODUCTION_CHANGES = FALSE
- LGE_HOLDOUT_STATUS = SEALED
- FUTURE_MODEL_RESERVE_STATUS = SEALED

No source media, patches, thumbnails, residual surfaces, or model weights were committed. The local CSAFE cache remained outside Git. The WP006D frozen v0 registry, configuration and threshold were not modified.

## Scientific conclusion

- WP006E_EF2_DECISION = KEEP_MEASUREMENT_ONLY
- FINAL_CLASSIFICATION = WP006E_EF2_V1_MEASUREMENT_ONLY
- MAXIMUM_RESEARCH_STATUS = CALIBRATION_CANDIDATE

The new v1 measurement passed the development and fresh internal validation gates but did not pass the complete promotion requirement because Stage C was MIXED. Keep it as measurement-only; do not admit it as directional evidence.

The following remain UNRESOLVED: END_TO_END_AUTHENTICITY_ACCURACY; HUMAN_FALSE_POSITIVE_RATE; COMMERCIAL_DETECTOR_ACCURACY; BROAD_CAMERA_GENERALIZATION; BROAD_NON_CAMERA_GENERALIZATION; UNSEEN_GENERATOR_GENERALIZATION; CAMERA_NATIVE_PROBABILITY; NATIVE_BYTE_ORIGINALITY; SENSOR_IDENTITY; EF2_DIRECTIONAL_VALIDATION.

This owner-controlled CSAFE experiment has six broad model families, fourteen development device instances, four internal validation devices, four same-model-instance holdouts, and one external LGE holdout. It is not population-representative, uses a screenshot-heavy non-camera/control design, lacks stable CSAFE scene IDs, and does not test screen recapture or external-domain transfer.

## Next research package

EF3 Generative Forensics Calibration on a rights-clean, generator-diverse benchmark; do not automatically start EF2 v2.
