# WP007E final research record

## Outcome

WP007E terminates without a FLUX.1 unblind. The three eligible local decoder
lineages produced an auditable 300-proxy corpus and the four predeclared
frozen-backbone candidates were evaluated on the frozen family split. No
candidate passed Stage A, and neither predeclared recovery phase met its
activation criteria. The scientific decision is
`REJECT_LOCAL_DECODER_PROXY_EF3`.

This is a development-only negative result. It does not reopen WP007B, alter
the historical freeze, or change the FLUX.1/FLUX.2 roles.

## Provenance and integrity

- `WP007E_BASE_SHA`: `9b7c375bd030475e25c0058c58909a3a56dcdcc6`
- `WP007C_PR835_MERGED_SHA`: `33066d594ccb5345594eed537e3d80064df226a7`
- historical WP007A benchmark fingerprint:
  `210000b7b0d93960b23e090e396d60f97bb46d2816ee9ee7d345aae364ade3c5`
- historical generation freeze:
  `87982112412059bd1615bd2d36ee9cf8ad72828b4042cb93839d725b6b533514`
- WP007A-HR4 combined holdout freeze:
  `b1be6115a6ed3cb5d72c5ad3e90575ededbb4c969bd2bb248ec2806da32885c4`
- FLUX.2 reserve freeze:
  `56ae0bd15b8bc21d77b28c9e6faea8149440aab8a9d101db523a43aedb98e054`
- data-role freeze:
  `52ec72579a1e82d97cd598ba62af69e6de46f68060f962ab6b646470b2ae91ba`
- canonicalizer:
  `231ae791e9a0e7d31d51c3c7911e31440ec0d8670c73f84a36603d82e1dedc5c`
- runtime lock:
  `7797234398d5131965711ae4accb50aedcd8680d70bbc79d1e26673b3199c6fd`

All decoder and feature media, weights, and feature tensors remained outside
Git. The local proxy and feature manifests verified their recorded SHA-256
values. FLUX.1 and FLUX.2 were metadata-only throughout this work package.

## Rights and decoder construction

The predeclared local research paths passed the rights audit. The official
Stability VAEs and pinned MIT TAESD-family code/weights were used only for
local decoder roundtrips. Official OpenAI CLIP ViT-B/32 and standard Meta
DINOv2 ViT-S/14 were used as frozen representations.

Materialized decoder lineages and variants:

| Lineage | Variant | Result |
| --- | --- | --- |
| SD1X | full SD VAE, TAESD | eligible; both passed fidelity |
| SDXL | full SDXL VAE, TAESDXL | eligible; both passed fidelity |
| SD3 | TAESD3 | eligible; passed fidelity |
| SANA | TAESANA | excluded as `LOW_FIDELITY_PROXY_VARIANT`; smoke catastrophic rate 25% |

The decoder plan froze three lineages and five eligible variants. It contains
no FLUX-specific proxy, and local proxy construction made zero Cloudflare
generation calls.

## Corpus

- paired base families: 60 (42 train, 18 validation)
- decoder proxies: 300 valid, 0 failed
- paired benign negative proxies: 180 valid
- independent negative benign controls: 288 valid
- proxy local hash verification: `PASS`
- paired corpus freeze:
  `bd7a5085703d96e3dc15cb5706c8b26b1740626844e2b8e8c1e4fa9a5503c372`
- decoder proxy plan:
  `9a5c342f5c4f462ed8753e6655a4cd8b440bab4f6027fdf9dc17001020396c17`

The paired positives remain explicitly decoder-derived development proxies;
they are not asserted to be fully synthetic benchmark ground truth.

## Frozen representations

- CLIP ViT-B/32: rights/runtime `PASS`, FAST; official weight SHA-256
  `40d365715913c9da98579312b702a82c18be219cc2a73407c4526f58eba950af`;
  feature-cache smoke p50/p95 `0.032545/0.056742` seconds per batched image.
- DINOv2 ViT-S/14: rights/runtime `PASS`, FAST; official weight SHA-256
  `b938bf1bc15cd2ec0feacfe3a1bb553fe8ea9ca46a7e1d8d00217f29aef60cd9`;
  feature-cache smoke p50/p95 `0.048976/0.124425` seconds per batched image.

Both representations were frozen, CPU-only, and excluded metadata, filenames,
paths, dimensions as classifier features, provider IDs, and dataset labels.

## Stage A bakeoff

Thresholds were computed from `NEGATIVE_CALIBRATION` canonical plus benign
controls only. The reported rates are exact numerator/denominator rates; the
full Wilson intervals and fold records are in
`candidate-stage-a-results.json`.

| Candidate | Min/median/max held-out-lineage recall | DDB DEV recall | Camera FPR | Digital FPR | Overall FPR | Benign FPR | Confounding | Shortcut | Stage A |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| C1 CLIP standard | 0.0556 / 0.0556 / 0.1111 | 100/128 = 0.7813 | 4/32 = 0.1250 | 0/24 = 0 | 4/56 = 0.0714 | 5/84 = 0.0595 | HIGH | HIGH | FAIL |
| C2 CLIP pair-delta | 0.0278 / 0.0556 / 0.0556 | 40/128 = 0.3125 | 4/32 = 0.1250 | 0/24 = 0 | 4/56 = 0.0714 | 6/84 = 0.0714 | HIGH | HIGH | FAIL |
| C3 DINO standard | 0.2778 / 0.2778 / 0.3333 | 46/128 = 0.3594 | 6/32 = 0.1875 | 0/24 = 0 | 6/56 = 0.1071 | 9/84 = 0.1071 | HIGH | HIGH | FAIL |
| C4 DINO pair-delta | 0 / 0.1667 / 0.2222 | 20/128 = 0.1563 | 6/32 = 0.1875 | 0/24 = 0 | 6/56 = 0.1071 | 9/84 = 0.1071 | HIGH | HIGH | FAIL |

The best minimum held-out-lineage recall was `0.2778` (C3), the best DDB DEV
recall was `0.7813` (C1), and the best camera FPR was `0.1250` (C1/C2).
Those isolated best values do not satisfy the joint gates. Camera-versus-
digital symmetric AUC was HIGH for every candidate; maximum negative subtype
separation was 1.0 for every candidate. Several candidate nuisance
associations were also HIGH, including native aspect ratio/pixel count and,
for some candidates, luminance/entropy.

## Recovery decision

Phase B was not triggered. Its required pair-delta evidence was
`MIN_HELDOUT_LINEAGE_RECALL >= 0.55` and `DDB_DEV_RECALL >= 0.50`:

- C2: `0.0278` minimum lineage recall and `0.3125` DDB DEV recall.
- C4: `0.0000` minimum lineage recall and `0.1563` DDB DEV recall.

Because no pair-delta candidate met both thresholds, Phase B nuisance
orthogonalisation was not authorized. Phase C was consequently not eligible;
no unpredeclared recovery was attempted. No candidate was selected, no
Stage-B confirmation was opened, no transformation stress was run, and no
calibration freeze was created.

## Holdout and production boundaries

- `FLUX1_UNBLIND_PERFORMED`: `FALSE`
- `FLUX1_COUNT`: `NOT_RUN`
- final camera/digital controls: `NOT_RUN`
- `FLUX2_FUTURE_RESERVE_STATUS`: `SEALED`
- `FLUX2_PROVIDER_CALLS`: `0`
- FLUX.2 pixel access, feature extraction, inference, transforms, and manual
  forensic inspection: `FALSE`
- Cloudflare generation calls in WP007E: `0`
- production, Safety, EF2, Judge, upload, enforcement, and public-label
  changes: `FALSE`

The unresolved claims remain end-to-end authenticity accuracy, human and
broad negative/generalization rates, mixed-origin detection, localization,
and EF3 directional validation.

## Final classification

`WP007E_FINAL_DECISION = REJECT_LOCAL_DECODER_PROXY_EF3`

The result is a valid bounded scientific termination: the local decoder
roundtrip corpus was integrity-clean and diverse enough for the predeclared
three-lineage gate, but none of the frozen candidate heads demonstrated the
required cross-lineage and nuisance-controlled transfer. FLUX.1 was correctly
not spent, and FLUX.2 remains sealed for a later independent benchmark
version/replication decision.
