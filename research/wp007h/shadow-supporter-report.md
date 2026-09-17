# WP007H shadow supporter report

SPAI_C512, RINE, and UniversalFakeDetect were run on the same 272 original H confirmation records using prior frozen descriptive thresholds. They were not fused, refit, or allowed to change SAFE qualification.

| Detector | Threshold | Synthetic recall | Negative FPR | SAFE FP rescued | SAFE FN rescued | Supporter FPs introduced | Supporter FNs introduced |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| SAFE | 0.5864923000335693 | 155/160 (96.875%) | 1/112 (0.893%) | — | — | — | — |
| SPAI_C512 | 1.0 | 60/160 (37.5%) | 2/112 (1.786%) | 1 | 3 | 2 | 98 |
| RINE | 0.890092938 | 39/160 (24.375%) | 1/112 (0.893%) | 1 | 0 | 1 | 116 |
| UniversalFakeDetect | 0.543838277 | 3/160 (1.875%) | 3/112 (2.679%) | 1 | 0 | 3 | 152 |

SAFE/supporter agreement was 61.765% for SPAI, 56.618% for RINE, and 42.647% for UFD. Supporter-only correct cases were 4, 1, and 1 respectively. RINE/UFD score Spearman correlation was 0.327; they remain one related CLIP-generative evidence group. There is no useful threshold-level evidence here to promote UFD beyond shadow status or to justify a SAFE fusion model.

The same descriptive CLIP pass covered all 10 SAFE transformations. It did not rescue the JPEG collapse or provide a stable replacement: RINE maximum transformed recall was 15% on JPEG95 and UFD was 0% on every transformed synthetic group except 2.5% on mild crop. SPAI transformation scoring was not run because its CPU cost was not practical for the full matrix.
