# WP007G-R1 — Selective Modern Data Recovery + Calibration Completion

## Decision

`KEEP_MODERN_EF3_MEASUREMENT_ONLY`

R1 resolved the original WP007G data-access blocker and completed the
predeclared G1/G2 calibration experiment on actual modern generated images.
G2 passed the development family-held-out gate, but independent confirmation
missed the predeclared very-high negative-FPR gate (`2/80 = 0.025` versus
`<=0.02`). Transformation stress was `FRAGILE`, so no deployable calibration
profile was earned, the reserve role was not opened, and FLUX.2 was not
eligible. The result is useful measurement evidence, not a production or
universal-detector claim.

The original WP007G report and its `MODERN_DATA_ACCESS_BLOCKED` conclusion
are preserved unchanged. This document records the recovery continuation.

## Baseline and integrity

- `WP007G_R1_PARENT_SHA = 5a6231c6f8ede3de5e117ed3692bcf493f0c1a1c`.
- PR #845 remained open and unmerged at that exact head; no merge or rewrite
  of the parent research history occurred.
- The R1 branch was a clean worktree with no unrelated user changes.
- No production routing, Safety policy, upload flow, database schema, labels,
  enforcement, or Cloudflare production Worker was changed.
- `FLUX1_STATUS = CONSUMED_MODERN_GENERATOR_POSTHOC_ONLY`.
- `FLUX2_FUTURE_RESERVE_STATUS = SEALED`; `FLUX2_PROVIDER_CALLS = 0`.
- No FLUX.2 benchmark image bytes were downloaded, decoded, scored,
  transformed, or inspected.

## Historical individual-file recovery

The official `lioooox/T2I-CoReBench-Images` Git history was inspected with
metadata-only Git/LFS operations. The pinned historical revision was
`6467902a01ab6b2d5ac3017c03719d11a11cfa61`; current multi-gigabyte archives
were not downloaded. Individual historical LFS paths were selected before
detector scoring using the frozen `SHA256("WP007G-R1" + family + path)` rule.

- Official historical individual-LFS access: `PASS`.
- Mirror access: `NOT_USED`; the official route was sufficient.
- Selected roles: 8 DEV families, 4 CONFIRM families, 2 RESERVE families.
- Retrieved files: `280`.
- Verified LFS bytes: `416,258,012`.
- Exact LFS hash/decode matches: `280/280`.
- Invalid decodes: `0`.
- FLUX.2-labelled records: `0`.

The catalog-level Apache-2.0 declaration was not treated as a commercial
license for every generated output. The per-family audit therefore marks all
selected material `RESEARCH_ONLY`; no deployable modern calibration corpus
was established. `FLUX.1-dev` is non-commercial, HunyuanImage-3.0 is
evaluation-only for this use, and proprietary/service-output families lack a
commercial calibration grant in the dataset provenance.

## Frozen data roles

DEV families:

`BAGEL`, `BLIP3o-4B`, `FLUX.1-dev`, `FLUX.1-schnell`, `HiDream-I1`,
`Janus-Pro-1B`, `PixArt-Sigma`, `Qwen-Image` — `160` images.

CONFIRM families:

`GPT-4o`, `HunyuanImage-3.0`, `SD-3.5-Medium`, `Z-Image` — `80` images.

RESERVE families:

`Gemini-2.5-Flash`, `GPT-Image-1.5` — `40` selected images. Their scores
were not opened after confirmation failed.

Negative roles were disjoint by source family:

- `NEGATIVE_CALIBRATION_G`: `148` (`100` camera, `48` digital), consumed
  calibration-eligible material.
- `NEGATIVE_DEV_G`: `100` (`77` camera, `23` digital), consumed prior-role
  material plus one fresh R1 training control.
- `NEGATIVE_CONFIRM_G`: `80` (`64` camera, `16` digital), untouched.
- `NEGATIVE_RESERVE_G`: `32` (`23` camera, `9` digital), untouched; eight
  below target because no additional independent rights-clean families were
  available without duplication.

The negative shortfall is recorded rather than hidden. Confirmation used the
full untouched 80-image role; reserve negative scores were not opened.

## Detector scoring

The exact frozen artifacts were reused:

- SPAI_C512: `24159f27d7c8c2cd0cb6c4019189eb89ad0874a0d9d15f8dc9afd39ca9648a55`.
- RINE head: `13986ffc86e1bd9d57fd640f891358c4f14c0f8aea8e590e52c598541f69fdc1`.
- UniversalFakeDetect head: `477100745713bcc957beb2b40859536859b6483fd6301b3b9293151b194c7847`.
- SAFE checkpoint: `b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e`.
- SAFE upstream: `4e998724651b227def64f5be0cd60c0aa1552c35`.

All 640 score rows were generated before calibration selection was opened:
`280` modern positives and `360` negatives. Compact modern-versus-negative
raw-score AUCs were approximately SPAI `0.776`, RINE `0.681`, UFD `0.551`,
and SAFE `0.989`. These are raw detector measurements, not probabilities.

SAFE’s raw 1%-calibration-FPR operating point was especially strong on DEV:
`154/160 = 0.9625` macro family recall; the same frozen raw threshold produced
`75/80 = 0.9375` CONFIRM recall and `0/80` CONFIRM negative false positives.
This does not override the predeclared G1/G2 calibrator result or establish
SAFE deployment rights; SAFE remains research-eligible and deployment-review-
required.

## Calibration

The initial CDF and thresholds used `NEGATIVE_CALIBRATION_G` only. Training
used `MODERN_SYNTH_DEV` positives and `NEGATIVE_DEV_G` negatives. RINE and UFD
were grouped as correlated CLIP evidence; SAFE remained a distinct ResNet
group; signed relationships and both tails were allowed.

`G1_SIGNED_LINEAR_V0` failed Stage A: very-high macro held-out family recall
`0.025`, minimum `0.0`; high-band macro recall `0.10`, minimum `0.0`.

`G2_TWO_TAIL_GROUPED_V0` passed the development gate:

- very-high macro/minimum held-out family recall: `0.65625 / 0.20`;
- high macro/minimum held-out family recall: `0.66875 / 0.20`;
- pooled very-high negative FPR: `0.010`;
- pooled high negative FPR: `0.01125`;
- all eight DEV families had nonzero high-band recall.

The selected G2 coefficient signs were stable across the eight outer folds:
SPAI high positive / low negative, CLIP high positive / low negative with
bounded corroboration, and SAFE high positive / low negative. The UFD low-tail
hypothesis was not promoted: low-tail support was positive in `0/8` folds,
with no macro-recall gain and no FPR benefit.

The v2 compiler now emits both diagnostic correlation-group tail names and
stable R1 detector-family aliases (`SPAI_*`, `CLIP_*`, `SAFE_*`). It also
supports the explicit `UNIVERSAL_FAKE_DETECT -> UFD` calibration-ID alias, so
the frozen research profile cannot silently lose UFD’s negative CDF.

## Independent confirmation

G2 was refit once on all DEV families and evaluated without retuning:

- very-high: `44/80 = 0.55`, Wilson 95% `[0.4412, 0.6542]`;
- very-high negative FPR: `2/80 = 0.025`, Wilson 95% `[0.0069, 0.0866]`;
- high: `45/80 = 0.5625`, Wilson 95% `[0.4534, 0.6659]`;
- high negative FPR: `3/80 = 0.0375`, Wilson 95% `[0.0128, 0.1045]`;
- confirmation ROC-AUC: `0.8973`;
- confirmation PR-AUC: `0.9152`.

Per-family very-high recall was GPT-4o `0.00`, HunyuanImage-3.0 `0.65`,
SD-3.5-Medium `0.95`, and Z-Image `0.60`. The predeclared very-high FPR
gate failed; the high-band rate also remains above the desired product target.
The reserve role therefore stayed sealed and no reserve result was fit or
scored.

## Transformation stress

The exact frozen G2 profile was applied without threshold retuning. JPEG95,
JPEG85, JPEG75, resize75, resize50, metadata stripping, and screenshot-like
resampling were tested. JPEG75 reduced very-high and high synthetic recall to
`0/40`; JPEG85 reduced them to `1/40`; resize50 retained only `17/40` at
very-high; several transforms also increased negative FPR by `0.05` or more.

The predeclared classification is `FRAGILE`. This blocks FLUX.2 and visible
alpha activation.

## FLUX.1 post-hoc diagnostic

After the research-only calibration freeze, the already-consumed FLUX.1 set
was scored exactly once as a post-hoc failure-mode diagnostic. No fitting or
threshold change used it.

- very-high: `0/40`;
- high-or-above: `0/40`;
- moderate: `4/40 = 0.10`, Wilson 95% `[0.0396, 0.2305]`;
- score median/IQR: `0.08598 / 0.16462`;
- score range: `-0.29871` to `0.24630`.

This did not rescue the failed confirmation or transformation gates. It is not
unseen-generator validation.

## Freeze and product boundary

`modern-calibration-freeze.json` is a research-only freeze recording the exact
G2 coefficients, negative CDF role, confirmation failure, transformation
failure, detector hashes, profile aliases, and holdout seal. It is not an
alpha activation profile.

- Research profile: reproducible measurement and post-hoc diagnostic only.
- Deployable profile: none.
- Shadow: contract-level readiness only; visible labels remain off.
- Limited visible alpha: blocked by rights, confirmation, and fragile
  transformation robustness.
- EF1, EF2, Safety, Moondream, GPT-OSS, and deterministic policy roles remain
  separate from the EF3 regression and score.
- Low EF3 is not Human-authored evidence; camera evidence and synthetic
  evidence remain independent axes.

## Storage

The selected 280 modern images remain outside Git. R1-derived transform media,
C512 staging copies, metadata-only history checkout, smoke duplicates, and
temporary score/run blobs were removed after their hashes and aggregate
results were committed. Total removed: `2,097,355,752` bytes. The selected
modern corpus retained outside Git is `416,258,012` bytes.

## Reproducibility hashes

- historical-file-index: `9dffdd40190e38a203d34662eb7b8f1dac7da267a793311122fb0f3ea5683762`.
- forbidden-generator-families: `329b2fdb3d8467d16a859338191ab96eb45e872c5d8508dac71a2fb0de3b16e8`.
- modern-generator-data-freeze: `15a528da08775390e48de24e1af5ce284185b2df79f4d65448b4cf562e18ccca`.
- negative-data-freeze: `11d9b2db8e4d9afe3647a9c264fe420a9762be822d6a71ac77cd3b36b0f6ca0b`.
- raw-modern-scores: `f6e43ed63a11c454e4fb86b9ff01e1a215105a09efacb8568ad8c0adf29bef53`.
- calibrator-fold-results: `d3c68795f7d410905bb22dd325d3db1b699dd571dacd6194340aae39b7bf14b2`.
- calibrator-selection: `4517202a0afbd486db4e62f8f9c3018f68093df3a41a946741451cd12cee2d45`.
- UFD inversion analysis: `0987bd5ad0c2bdd9d22c9253024d9513bb8c15b778821a8b8fbe1cb421765aa0`.
- modern-confirmation: `a6ba412c95760fdd9758c227a20b3eb6ed2a4a82df20d537a37575f9337e94e1`.
- transformation-results: `fc82c96c98a95afa40f5eed773e784df23d7e6c09a5be49cceec0895ef185c79`.
- compiler-profile-v2: `fc872eb14965e937126da82a1276a0794e8aad5d2226242256ced778fb4bf96e`.
- detector-registry-v2: `6430b291e227eb001531f35bd44f85cba202a78bc95fdd13cbe0ab963679a5e0`.
- runtime-lock: `f0e203856894fda196b3117d10484079275a7c6d17f27061217e5d47b6005636`.
- deployment-readiness: `14ab2bdc10b7c0762afb18f2fa025addca5d85074cf090acccf564cce4ab9507`.
- modern-calibration-freeze: `f545c2f72f31af914e8064fc36e443fd38cba8ddb45921980fcfe2677257ec64`.

The final freeze hash is recorded in the terminal status block after all
freeze-bound artifacts are verified.
