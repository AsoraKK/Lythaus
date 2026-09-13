# WP006B — Rights-Clean Benchmark Materialisation

## Executive decision

`BENCHMARK_READINESS = READY_FOR_LIMITED_SPECIALIST_CALIBRATION`

`FINAL_CLASSIFICATION = WP006B_BENCHMARK_READY`

`RECOMMENDATION_CONFIDENCE = HIGH` for the bounded data-foundation decision; specialist performance, commercial detector readiness, unseen-generator generalization, and the human-FPR target remain unresolved because no specialist inference was run.

The owner-controlled pool is now large enough to establish a bounded active benchmark and substantial untouched future holdouts. The benchmark uses independent origin axes, exact-hash duplicate exclusion, conservative pHash isolation, three known camera device families, and eight deterministic conventional partial-edit descendants. It does not claim detector performance.

## Scope and safety

- `WP006B_RESEARCH_DATE = 2026-09-13`
- Exact repository baseline at continuation start: `f264558a63690b56916a32e84eccd69529a89c25`.
- Branch: `agent/wp006b-rights-clean-benchmark`; production configuration, public labels, enforcement, and WP005B architecture were not changed.
- Cloud/model inference: `0`; specialist downloads: `0`; Cloudflare image generation: `0`; broad transformations: `0`.
- Original media was not modified, copied, uploaded, or committed. New persistent derivative media is limited to the controlled partial-edit slice: 22917605 bytes.
- `CSAFE_LOCAL_STATUS = NOT_FOUND`; no CSAFE download or arbitrary-directory crawl was performed.

## Full-pool inventory

| Measure | Count |
|---|---:|
| OWNER_POOL_FILES_TOTAL | 735 |
| OWNER_POOL_IMAGES | 710 |
| OWNER_POOL_VIDEOS | 25 |
| CAMERA_FILES_TOTAL | 459 |
| SYNTHETIC_FILES_TOTAL | 33 |
| HARD_NEGATIVE_FILES_TOTAL | 218 |
| MIXED_ORIGIN_FILES_TOTAL | 0 |
| UNKNOWN_FILES_TOTAL | 0 |
| INDEPENDENT_CAMERA_FAMILIES | 459 |
| INDEPENDENT_SYNTHETIC_FAMILIES | 31 |
| INDEPENDENT_HARD_NEGATIVE_FAMILIES | 216 |
| EXACT_DUPLICATE_FILES | 8 |
| NEAR_DUPLICATE_GROUPS (pHash <= 2) | 7 |
| BROAD pHash CANDIDATE PAIRS (<=16) | 708 |
| MIME_SIGNATURE_MISMATCH_IMAGES | 2 |

The 25 videos are inventoried hash-only and excluded from the image benchmark. No frames were extracted and no video inference was run.

### Historical seed mapping

The previous 18-file seed is preserved as lineage evidence. 11/18 logical seed files are present in the current owner root: `CAM_001, HN_001, HN_002, HN_003, HN_004, SYN_001, SYN_002, SYN_003, SYN_004, SYN_005, SYN_006`. Missing from the current root: `CAM_002, CAM_003, CAM_004, CAM_005, CAM_006, CAM_007, CAM_008`. The prior manifest is not silently repopulated with absent media.

Exact duplicates are excluded from independent source-family counts. The four exact groups include legacy/new copies of two hard negatives, one synthetic seed/new export pair, and one duplicate synthetic export pair. The broader pHash<=16 pairs are not treated as source-family identity because the screenshot pool contains repeated app/template layouts; only pHash<=2 pairs are used as split-isolation groups.

## Qualification summary

`VIDEO_FILES_FOUND = 25`
`CAMERA_DEVICE_FAMILIES_TOTAL = 3` (safe metadata-indicated families; not independent camera-origin truth)
`GENERATOR_FAMILIES_TOTAL = 0` (generator provenance unknown)
`MIXED_ORIGIN_FAMILIES = 0`
`EXACT_DUPLICATE_FILES = 8` across four exact groups; four additional duplicate aliases are excluded from independent-family counts.
`NEAR_DUPLICATE_GROUPS = 7` at the declared pHash<=2 isolation threshold; broader pHash candidates remain review-only.

## Active and reserved materialisation

| Slice | Active families | Reserved families |
|---|---:|---:|
| Camera | 32 | 122 |
| Synthetic | 20 | 9 |
| Hard negative | 20 | 61 |
| Partial edit | 8 | 0 |
| Mixed origin | 0 | 0 |

`ACTIVE_BENCHMARK_SOURCE_FAMILIES = 72`
`ACTIVE_CAMERA_DEVICE_FAMILIES = 2`
`ACTIVE_GENERATOR_FAMILIES = 0`
`RESERVED_CAMERA_FAMILIES = 122`
`RESERVED_SYNTHETIC_FAMILIES = 9`
`RESERVED_HARD_NEGATIVE_FAMILIES = 61`

Active selection is deterministic and feature-diverse using owner category, device family where available, aspect bucket, dimensions, MIME, and metadata presence. It does not use specialist scores, forensic measurements, or visual authenticity judgments. The majority of the owner pool remains `OWNER_RESERVED_FUTURE_HOLDOUT` or `FUTURE_EXPANSION_POOL`.

Camera device holdout source families: `WP006B-FAMILY-CAMERA_20190727_210215, WP006B-FAMILY-CAMERA_20190727_210238, WP006B-FAMILY-CAMERA_20190727_210348, WP006B-FAMILY-CAMERA_20190727_210410, WP006B-FAMILY-CAMERA_20190727_211026, WP006B-FAMILY-CAMERA_20190727_211827, WP006B-FAMILY-CAMERA_20190727_211836, WP006B-FAMILY-CAMERA_20190727_212036, WP006B-FAMILY-CAMERA_20190727_212040, WP006B-FAMILY-CAMERA_20190727_212128, WP006B-FAMILY-CAMERA_20190727_212232, WP006B-FAMILY-CAMERA_20190727_212237, WP006B-FAMILY-CAMERA_20190727_212413, WP006B-FAMILY-CAMERA_20190727_212554, WP006B-FAMILY-CAMERA_20190727_212557, WP006B-FAMILY-CAMERA_20190727_212723, WP006B-FAMILY-CAMERA_20190727_213455, WP006B-FAMILY-CAMERA_20190727_213458, WP006B-FAMILY-CAMERA_20190727_213503, WP006B-FAMILY-CAMERA_20190727_213508, WP006B-FAMILY-CAMERA_20190728_104229, WP006B-FAMILY-CAMERA_20190801_142721, WP006B-FAMILY-CAMERA_20190901_103851, WP006B-FAMILY-CAMERA_20190901_104834, WP006B-FAMILY-CAMERA_20190901_105352, WP006B-FAMILY-CAMERA_20190901_105841, WP006B-FAMILY-CAMERA_20190901_105929, WP006B-FAMILY-CAMERA_20190901_110048, WP006B-FAMILY-CAMERA_20191013_110023, WP006B-FAMILY-CAMERA_20191013_110026, WP006B-FAMILY-CAMERA_20191013_110028, WP006B-FAMILY-CAMERA_20191129_163202, WP006B-FAMILY-CAMERA_e97040410dfef6b7`; the least represented known device family is held out completely. Generator holdout source families: `none`; generator identity is unknown for the supplied synthetic pool, so `GENERATOR_HOLDOUT_LEAKAGE = NOT_READY`.

## Partial-edit truth

Each partial-edit record is bound to the parent content SHA-256 before materialization; a parent-hash mismatch fails closed.

Eight conventional, exact-mask edit descendants are planned/materialised from active camera parents. Operations are: COPY_MOVE, LOCAL_BLUR, LOCAL_RESIZE, SPLICE, REGION_REPLACEMENT, OBJECT_PASTE, LOCAL_RESAMPLING, COMPOSITE_INSERTION. Each record retains the parent sample ID and source family, edited content hash, mask hash, operation, parameters, and region.

`CONVENTIONAL_PARTIAL_EDIT_FAMILIES = 8`
`AI_PARTIAL_EDIT_FAMILIES = 0`
`AI_INPAINTING_SLICE_NOT_READY`

These edits are infrastructure truth for EF5 localization; they are not equivalent to AI inpainting and no EF5 specialist was run.

## Rights and privacy

Owner authorization is recorded once at pool scope:

- `SOURCE_MEDIA_RIGHTS = CONFIRMED_OWNER_CONTROLLED`
- `INTERNAL_RESEARCH_RIGHTS = AUTHORIZED`
- `LYTHAUS_PRODUCT_RESEARCH_AND_EVALUATION_RIGHTS = AUTHORIZED`
- `COMMERCIAL_PRODUCT_EVALUATION_RIGHTS = AUTHORIZED`
- `PUBLIC_REDISTRIBUTION_RIGHTS = NOT_AUTHORIZED_UNLESS_SEPARATELY_GRANTED`
- `THIRD_PARTY_REDISTRIBUTION_RIGHTS = NOT_AUTHORIZED_UNLESS_SEPARATELY_GRANTED`

Rights are kept separate from truth. Training and distillation remain disabled by scope. Manifests retain only safe metadata markers, logical references, hashes, dimensions, MIME, sanitized device families, and privacy flags; GPS values, serial numbers, raw metadata, private absolute paths, and personal filenames are not persisted.

## Truth axes

The canonical benchmark has no binary REAL/FAKE field. Camera samples carry owner-confirmed physical-camera acquisition; synthetic samples carry owner-confirmed synthetic depicted content; hard negatives are explicitly typed, with screenshot-heavy coverage and legacy digital-art/UI examples. Native/export status, synthetic generator lineage, and possible post-processing remain separately represented as UNKNOWN when not established.

A mixed-origin record may still carry both physical camera acquisition and synthetic depicted content as TRUE. No axis is derived as the complement of another.

## Diversity

`CAMERA_DEVICE_DIVERSITY = ADEQUATE` — three safe metadata-indicated device families exist; two are balanced in the active slice and one is complete holdout.
`GENERATOR_DIVERSITY = WEAK` — generator lineage is UNKNOWN for the supplied synthetic pool.
`HARD_NEGATIVE_DIVERSITY = WEAK` — active coverage is dominated by SCREENSHOT, with smaller UI_CAPTURE and DIGITAL_ART slices.
`PARTIAL_EDIT_DIVERSITY = ADEQUATE` — eight distinct conventional operations are represented; AI inpainting is absent.

## Leakage and readiness

`SOURCE_FAMILY_LEAKAGE = PASS`
`NEAR_DUPLICATE_SPLIT_LEAKAGE = PASS` for exact hashes and the declared pHash<=2 probable-near isolation groups; broader pHash<=16 similarity candidates remain flagged for future review.
`DEVICE_HOLDOUT_LEAKAGE = PASS`
`GENERATOR_HOLDOUT_LEAKAGE = NOT_READY`
`PARENT_EDIT_LINKAGE = PASS`

The active benchmark meets the count-based revised thresholds for limited calibration; hard-negative subtype diversity remains weak and limits generalization claims: camera >=20 (32), synthetic >=12 (20), diverse hard-negative families >=12 (20), and exact-mask partial edits >=8 (8). This is sufficient for limited specialist calibration only; it is not statistically sufficient for commercial accuracy or human-FPR claims.

## Owner actions required

- Confirm active camera technical lineage in batch: native original vs export, known edits, screen recapture, and synthetic depicted content.
- Provide generator family/model/version for active synthetic families where known; UNKNOWN is valid.
- Resolve the small pHash<=2 probable-near groups if those samples will later be split across distinct experiments.

No further permission question is required for the supplied pool.

## Next experiment

`NEXT_EXPERIMENT = WP006C — EF2 camera-acquisition enrollment and device-holdout feasibility on the active owner-controlled camera slice`

This is selected because the pool has three known device families and one complete device holdout, while synthetic generator diversity is currently unknown and AI partial edits are absent. Do not infer EF2 validity until that experiment is blinded and calibrated.

## Scientific boundaries

`END_TO_END_AUTHENTICITY_ACCURACY = UNRESOLVED`
`HUMAN_FPR_TARGET = UNRESOLVED`
`UNSEEN_GENERATOR_GENERALIZATION = UNRESOLVED`
`EF2_DIRECTIONAL_VALIDATION = UNRESOLVED`
`EF3_DIRECTIONAL_VALIDATION = UNRESOLVED`
`EF5_DIRECTIONAL_VALIDATION = UNRESOLVED`

## Artifacts

- `benchmark-manifest.json` — active image families and exact-mask descendants only.
- `owner-pool-inventory.json` — sanitized full-pool image/video inventory and role assignment.
- `reserved-holdout-manifest.json` — untouched future holdout membership.
- `benchmark-rights.json` — dimension-separated rights records.
- `benchmark-splits.json` — predeclared source-family/device boundaries.
- `benchmark-fingerprint.json` — deterministic membership, truth, rights, split, and pool-boundary fingerprint.
- `owner-confirmation-template.json` — minimal technical-lineage questions only.
- `partial-edit-plan.json` — deterministic EF5 derivative plan; generated media remains external.
- `video-future-inventory.json` — hash-only image-excluded video inventory.

`CLOUDFLARE_SYNTHETIC_GENERATION = UNRESOLVED`; no generation was requested or performed.
