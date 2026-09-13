# WP006B — Rights-Clean Benchmark Materialisation

## WP006B Executive Decision

`BENCHMARK_READINESS = OWNER_CONFIRMATION_REQUIRED`

`EF2_DECISION = MORE_DATA_REQUIRED`

`EF3_DECISION = MORE_DATA_REQUIRED`

`EF5_DECISION = MORE_DATA_REQUIRED`

`OWNER_ACTION_REQUIRED = YES`

`RECOMMENDATION_CONFIDENCE = HIGH` for the data-readiness decision; `LOW` for
any future specialist-performance claim because no specialist inference was
authorized or performed.

`FINAL_CLASSIFICATION = WP006B_OWNER_CONFIRMATION_REQUIRED`

The owner-supplied seed is now inventoried and represented as a privacy-safe,
rights-pending benchmark foundation. It is not yet a calibration benchmark.
The seed is below the minimum slice thresholds and its provenance/permissions
are not confirmed in the repository. No detector, observer, judge, or cloud
inference ran.

## Starting state and scope

- `WP006B_RESEARCH_DATE = 2026-09-13`
- Actual `origin/main` at start: `b47731da6cd1e0f2decdd747b0f741879f46e9c2`
- PR #812 is merged at that SHA and contains the WP006A contracts, report,
  data-readiness records, and specialist interface.
- Work was performed on isolated branch
  `agent/wp006b-rights-clean-benchmark`.
- Owner media remained at its supplied external root. Originals were not
  modified, copied, uploaded, or committed.
- `CSAFE_LOCAL_STATUS = NOT_FOUND`; no CSAFE download or arbitrary-directory
  crawl was performed.
- `specialistInferenceRun = false`; Cloudflare requests, model downloads, and
  transformations were all zero.

## Owner seed reconciliation

The supplied seed contains 18 decodable image files:

| Candidate folder | Logical IDs | Candidate source families | Current truth status |
|---|---|---:|---|
| camera | `CAM_001`–`CAM_008` | 8 | `OWNER_CONFIRMATION_REQUIRED` |
| synthetic | `SYN_001`–`SYN_006` | 6 | `OWNER_CONFIRMATION_REQUIRED` |
| hard-negative | `HN_001`–`HN_004` | 4 | `OWNER_CONFIRMATION_REQUIRED` |
| mixed-origin | none | 0 | not available |

`OWNER_SEED_IMAGES = 18`

`INDEPENDENT_SOURCE_FAMILIES = 18` candidate families after exact-hash and
bounded perceptual comparison.

`CAMERA_FAMILIES = 8`

`CAMERA_DEVICE_FAMILIES = 0` known/confirmed device families. This means
device identity is unavailable, not that the images came from one device.

`SYNTHETIC_FAMILIES = 6`

`GENERATOR_FAMILIES = 0` known/confirmed generator families.

`HARD_NEGATIVE_FAMILIES = 4`

`MIXED_ORIGIN_FAMILIES = 0`

`PARTIAL_EDIT_FAMILIES = 0`

`CONVENTIONAL_PARTIAL_EDIT_FAMILIES = 0`

`AI_PARTIAL_EDIT_FAMILIES = 0`

### Technical inventory

- 18/18 files decoded with Windows WIC.
- 18/18 extension/signature checks matched after correcting the PNG signature
  check in the inventory script.
- Exact SHA-256 duplicate files: `0`.
- Perceptual near-duplicate candidates at the declared Hamming threshold of
  `<=16`: `0`; the closest observed distance was `20`.
- No automatic family merges were made. A legacy WP004A byte-fallback pHash
  collision between two different hard-negative screenshots was not reused as
  family evidence; the bounded visual spot-check found distinct captures.
- Dimensions, byte sizes, MIME, orientation, safe metadata-presence markers,
  hashes, and privacy flags were recorded. Raw EXIF/XMP/C2PA values were not
  persisted.
- The largest source is approximately 19.85 MB (`CAM_002`); it remains in the
  owner-controlled location and was not duplicated.

Technical metadata is not authenticity truth. In particular, EXIF presence,
encoder markers, C2PA-like markers, orientation, format, and image dimensions
do not promote any source to camera-native or synthetic truth.

## Benchmark gap after owner seed

The minimum research thresholds are 12 camera families, 8 synthetic families,
6 hard-negative families, and 6 exact-mask partial-edit families. The current
candidate gap is:

`BENCHMARK_GAP_AFTER_OWNER_SEED = camera -4; synthetic -2; hard-negative -2; partial-edit -6`

This is a source-family gap, not a request to create descendants or pad the
corpus. Even if all 18 candidates are later confirmed, the benchmark remains
below the minimum threshold until these exact categories are filled with
rights-clean families.

`READY_FOR_CALIBRATION = 0`

`EVALUATION_ONLY = 0`

`OWNER_CONFIRMATION_REQUIRED = 18`

`REJECTED = 0`

The owner seed currently has no calibration-eligible or evaluation-eligible
sample because truth and permission closure are pending. The manifest uses
`EVALUATION` as a reserved split label with `eligible = false`; it is not an
authorization to score the media.

## Independent truth axes

Every seed sample carries these separate fields:

- `physicalCameraAcquisition`
- `syntheticDepictedContent`
- `localManipulation`
- `digitalCapture`
- `screenRecapture`

All 18 are currently `UNKNOWN` with
`truthBasis = OWNER_CONFIRMATION_REQUIRED`. There is no binary `real/fake`
field. A future confirmed mixed-origin record may therefore represent, for
example, camera acquisition and synthetic depicted content simultaneously.

The candidate folder names are treated as intake hints only. `CAM_*` is not
camera truth, `SYN_*` is not generator provenance, and `HN_*` is not an explicit
hard-negative type until the owner confirms lineage and permissions.

## Rights status

Rights are recorded independently in `benchmark-rights.json`.

| Source slice | Code rights | Weight rights | Source-media/data rights | Internal research | Commercial product evaluation | Redistribution | Status |
|---|---|---|---|---|---|---|---|
| camera seed | `NOT_APPLICABLE` | `NOT_APPLICABLE` | `UNRESOLVED` | `UNRESOLVED` | `UNRESOLVED` | `UNRESOLVED` | owner confirmation required |
| synthetic seed | `NOT_APPLICABLE` | `NOT_APPLICABLE` | `UNRESOLVED` | `UNRESOLVED` | `UNRESOLVED` | `UNRESOLVED` | owner confirmation required |
| hard-negative seed | `NOT_APPLICABLE` | `NOT_APPLICABLE` | `UNRESOLVED` | `UNRESOLVED` | `UNRESOLVED` | `UNRESOLVED` | owner confirmation required |
| partial-edit slice | `NOT_APPLICABLE` | `NOT_APPLICABLE` | not available | not available | not available | not available | no samples |

`CAMERA_RIGHTS_STATUS = OWNER_CONFIRMATION_REQUIRED`

`SYNTHETIC_RIGHTS_STATUS = OWNER_CONFIRMATION_REQUIRED`

`HARD_NEGATIVE_RIGHTS_STATUS = OWNER_CONFIRMATION_REQUIRED`

`PARTIAL_EDIT_RIGHTS_STATUS = INSUFFICIENT_DATA`

No one-field `LICENSE_OK` conclusion is used. `MIXED_OR_UNCLEAR` is the
current sample rights class, `REVIEW_REQUIRED` is the evaluation gate,
`DO_NOT_TRAIN` is the training gate, and `DO_NOT_DISTILL` is the distillation
gate.

## Synthetic-generation gate

`CLOUDFLARE_SYNTHETIC_GENERATION = UNRESOLVED`

No generation was performed. The rights assessment is recorded in
[`synthetic-generation-rights.md`](./synthetic-generation-rights.md).

The current official Cloudflare data-usage documentation says Workers AI
inputs and outputs are Customer Content, while model providers remain
third-party services whose terms apply. The current pricing documentation
lists a 10,000-neuron daily free allocation and paid overage pricing. These
facts do not, by themselves, authorize Lythaus to retain or commercially
evaluate generated outputs. A future generation run needs explicit model,
upstream-license, account-access, output-use, retention, provenance, and cost
approval.

## Split and leakage status

`SOURCE_FAMILY_LEAKAGE = PASS`

All current samples have one source family and one reserved split. Exact
duplicates would be co-located in one family; none were observed.

`DEVICE_HOLDOUT_LEAKAGE = NOT_READY`

No owner-confirmed device family exists, so no device holdout is asserted.

`GENERATOR_HOLDOUT_LEAKAGE = NOT_READY`

No owner-confirmed generator family exists, so no unseen-generator holdout is
asserted.

`PARENT_EDIT_LINKAGE = NOT_READY`

No partial-edit source exists and therefore no parent/mask pair can yet be
validated. The contract rejects a future edited child without a same-family
parent and exact mask linkage.

The predeclared split policy requires source-family boundaries, device-family
boundaries, generator-family holdouts, descendants staying with their parent,
and provenance/rights closure before scoring. Transformations are registered
but deferred; no JPEG, resize, crop, blur, sharpen, metadata-strip, or
screenshot descendant was created.

`GENERATOR_DIVERSITY_STATUS = INSUFFICIENT`

`UNSEEN_GENERATOR_HOLDOUT = NOT_READY`

`AI_INPAINTING_SLICE_NOT_READY`

## Required owner actions

The generated [`owner-confirmation-template.json`](./owner-confirmation-template.json)
contains only human-answerable questions. Hashes, dimensions, MIME, and
metadata were derived automatically and are not requested from the owner.

1. Confirm whether any supplied files are exports, recompressions, crops,
   screenshots, or other descendants of another supplied file; list only the
   logical IDs if so.
2. For `CAM_001`–`CAM_008`, confirm physical camera capture, native/original
   versus export, device family (model family only), known edit class, screen
   recapture, synthetic depicted content, owner/authorized-contributor status,
   internal/commercial-evaluation permission, and redistribution permission.
3. For `SYN_001`–`SYN_006`, confirm owner/authorized-contributor status,
   synthetic content, any camera or screen recapture, post-processing, known
   provider/generator/model/version/prompt/seed/date, and
   internal/commercial-evaluation and redistribution permissions. Unknown
   fields must remain `UNKNOWN`.
4. For `HN_001`–`HN_004`, confirm the explicit type (for example screenshot,
   CGI, digital illustration, scan, composite, or edited genuine photo),
   independent truth axes, lineage, internal/commercial-evaluation permission,
   and redistribution permission.
5. If a CSAFE copy exists, provide its location only within an already
   registered/safe project data root. No download is requested.

No API key, credential, GPS coordinate, camera serial number, identity label,
or private filename is requested.

## Benchmark artifacts

- [`seed-inventory.json`](./seed-inventory.json) — sanitized WIC/hash inventory;
  no raw media or raw metadata.
- [`benchmark-manifest.json`](./benchmark-manifest.json) — independent axes,
  candidate lineage, rights gates, and deferred transformations.
- [`benchmark-manifest.schema.json`](./benchmark-manifest.schema.json) — strict
  manifest shape with no final-verdict fields.
- [`benchmark-rights.json`](./benchmark-rights.json) — separate code, weight,
  source, data, evaluation, research, commercial-evaluation, and redistribution
  rights.
- [`benchmark-splits.json`](./benchmark-splits.json) — source-family split
  policy and ineligible reservations.
- [`benchmark-fingerprint.json`](./benchmark-fingerprint.json) — deterministic
  fingerprint of manifest version, sample/family hashes, truth axes, rights,
  and splits.
- [`benchmark-gap.json`](./benchmark-gap.json) — threshold shortfall.
- [`owner-confirmation-template.json`](./owner-confirmation-template.json) —
  minimal owner-only response questions.
- [`synthetic-generation-rights.md`](./synthetic-generation-rights.md) — no-go
  gate for unapproved generation.

`BENCHMARK_FINGERPRINT_SHA256 = be97f0818ecece2509588dbc228e5da885985d4e5c2a075e947289041734c8ac`

## Resource report

- New persistent benchmark media: `0 bytes`.
- New model/checkpoint downloads: `0 bytes`.
- New persistent manifest/report artifacts: small repository text artifacts;
  well below the 500 MB media ceiling.
- Largest referenced source: approximately `19.85 MB`.
- Final free disk snapshot: approximately `53.10 GB`.
- Final free RAM snapshot: approximately `4.32 GB` of `15.34 GB` total.
- CUDA: unavailable.
- Specialist installs/runtimes: none attempted.
- Failed installs: none.
- Resource-heavy candidates rejected: none were considered because model
  runtime is explicitly deferred in WP006B.

## Scientific gaps

`END_TO_END_AUTHENTICITY_ACCURACY = UNRESOLVED`

`HUMAN_FPR_TARGET = HUMAN_FPR_TARGET_NOT_YET_PROVEN`

`UNSEEN_GENERATOR_GENERALIZATION = UNRESOLVED`

`EF2_DIRECTIONAL_VALIDATION = UNRESOLVED`

`EF3_DIRECTIONAL_VALIDATION = UNRESOLVED`

`EF5_DIRECTIONAL_VALIDATION = UNRESOLVED`

The seed is a data foundation only. It supports no detector accuracy,
generalization, commercial-readiness, or human-false-positive claim.

## Next work package

Because truth is not yet adequate, the next priority remains data closure and
targeted materialisation rather than specialist calibration:

`NEXT_EXPERIMENT = WP006C — Close owner provenance/rights for the 18 seed families and materialize only the minimum benchmark gap: 4 camera, 2 synthetic, 2 hard-negative, and 6 exact-mask partial-edit families with a predeclared holdout.`

WP006C should first ingest owner responses, classify confirmed source families,
then add only rights-clean missing families. It must not score specialists
against unconfirmed seed data. If the owner-confirmed set reaches the minimum
thresholds, the first specialist experiment should be chosen then from EF2,
EF3, and EF5 using the resulting device/generator/edit coverage.

## Final classification

`WP006B_OWNER_CONFIRMATION_REQUIRED`

The benchmark foundation is implemented and reproducible, but the scientific
calibration gate correctly remains closed until owner provenance/rights and
the targeted source-family gaps are resolved.
