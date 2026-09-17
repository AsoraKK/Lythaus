# WP007H SAFE transformation report

The SAFE checkpoint, preprocessing, and threshold were unchanged. The threshold was `0.5864923000335693`, frozen from WP007G-R1 `NEGATIVE_CALIBRATION_G` before WP007H scoring.

The matrix contains 10 deterministic transformations over 40 synthetic and 40 negative descendants. The SAFE-only result is `FRAGILE` under the predeclared gate because JPEG95 and JPEG85 both collapse synthetic recall to zero. Metadata stripping, resize75, mild crop, mild blur, and screenshot-style resampling retained useful synthetic recall in this bounded sample. Resize50 retained 34/40; mild sharpening retained 27/40.

| Transformation | Applicability declared before scoring | Synthetic recall | Negative FPR | Median all-score shift | Decision flips |
| --- | --- | ---: | ---: | ---: | ---: |
| JPEG95 | MODERATE | 1/40 (2.5%) | 3/40 (7.5%) | -0.14195 | 42/80 |
| JPEG85 | MODERATE | 0/40 (0%) | 0/40 (0%) | -0.33742 | 40/80 |
| JPEG75 | LOW | 0/40 (0%) | 3/40 (7.5%) | -0.34666 | 43/80 |
| RESIZE75 | MODERATE | 40/40 (100%) | 0/40 (0%) | -0.00005 | 0/80 |
| RESIZE50 | LOW | 34/40 (85%) | 0/40 (0%) | -0.00525 | 6/80 |
| SCREENSHOT_STYLE_RESAMPLING | LOW | 38/40 (95%) | 0/40 (0%) | +0.00712 | 2/80 |
| METADATA_STRIP | HIGH | 40/40 (100%) | 0/40 (0%) | 0 | 0/80 |
| MILD_CROP | MODERATE | 38/40 (95%) | 0/40 (0%) | +0.00514 | 2/80 |
| MILD_BLUR | MODERATE | 40/40 (100%) | 3/40 (7.5%) | +0.00395 | 3/80 |
| MILD_SHARPEN | MODERATE | 27/40 (67.5%) | 0/40 (0%) | -0.00518 | 13/80 |

Wilson intervals and full score-shift summaries are in `safe-transformation-results.json`. This result does not authorize retuning or a transformed-input production rule. The predeclared generic `MODERATE` class did not predict JPEG95/JPEG85 collapse; a JPEG-specific applicability amendment requires a new independently frozen package.

The RINE/UFD transform pass was descriptive only. It did not alter the SAFE result, thresholds, or qualification disposition. Full-matrix SPAI transformation scoring was not run because its measured CPU cost was not practical for this bounded package.
