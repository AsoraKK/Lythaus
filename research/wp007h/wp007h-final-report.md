# WP007H — SAFE specialist qualification, input-regime robustness, and FLUX.1 domain shift

## Result

WP007H qualifies SAFE as a strong research specialist for the bounded original/high-quality input regime, with materially limited applicability outside that regime:

`SAFE_SPECIALIST_QUALIFIED_WITH_LIMITED_APPLICABILITY`

This is not production authorization, a universal detector claim, or a <=1% population FPR demonstration.

## Provenance and controls

- Scientific parent: PR #847 head `fc9c1a65528a39da008fed12c1a601e32c226e09`.
- `origin/main` was audited at `8e3b3ebad2f846e61db2bfe819376723da7e9863`; the stacked research lineage was preserved without merging or rebasing prior open research PRs.
- Plan self-hash: `e085494e28c71809c7515d18105e485bb54853acaef4c3a4d63c930f162eee00`.
- SAFE upstream: `4e998724651b227def64f5be0cd60c0aa1552c35`.
- SAFE checkpoint SHA-256: `b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e`.
- Frozen preprocessing: RGB decode, official center crop 256, tensor normalization, SAFE DWT/model path, class-1 softmax.
- Frozen threshold: `0.5864923000335693`, from WP007G-R1 calibration negatives only.
- FLUX.1 was used only as a post-hoc diagnostic because it was already consumed by WP007F.
- FLUX.2 pixels were not accessed, transformed, scored, or viewed; provider calls remained zero.
- No new meta-calibrator, model training, fine-tuning, production routing, public label, Safety, Judge, or Moondream authority change was made.

The SAFE code repository is Apache-2.0, but the official checkpoint does not carry a separately stated deployment/redistribution grant in the audited upstream materials. The result is therefore research-evaluation eligible and deployment-review-required, not commercially cleared. See the [SAFE upstream repository](https://github.com/Ouxiang-Li/SAFE). The modern generated corpus came from the Apache-declared [T2I-CoReBench dataset card](https://huggingface.co/datasets/lioooox/T2I-CoReBench-Images), but per-family output-use rights were not treated as commercial clearance.

## Independent modern qualification

Eight generator families, 20 images each, were selected score-blind from pinned historical individual Git-LFS objects. No family overlapped the R1 development/confirmation roles. All 160 decoded images passed hash and image validation.

| Generator family | Recall at frozen threshold | Wilson 95% |
| --- | ---: | ---: |
| BLIP3o-8B | 20/20 (100%) | [0.8389, 1.0000] |
| FLUX.1-Krea-dev | 20/20 (100%) | [0.8389, 1.0000] |
| Infinity-8B | 20/20 (100%) | [0.8389, 1.0000] |
| Janus-Pro-7B | 20/20 (100%) | [0.8389, 1.0000] |
| LongCat-Image | 20/20 (100%) | [0.8389, 1.0000] |
| OmniGen2-7B | 20/20 (100%) | [0.8389, 1.0000] |
| PixArt-Alpha | 20/20 (100%) | [0.8389, 1.0000] |
| Qwen-Image-2512 | 15/20 (75%) | [0.5313, 0.8881] |

Aggregate: 155/160 synthetic recall, Wilson 95% `[0.92894, 0.98658]`; ROC-AUC `0.993359375`; PR-AUC `0.9958706409454495`; SAFE runtime p50 `28.411 ms`, p95 `93.165 ms`, zero inference failures.

## Expanded negatives

The H negative set contains 112 non-synthetic families: 87 camera and 25 digital non-AI. It is unseen to the frozen SAFE threshold but is not a fresh untouched benchmark: all eligible local negatives had prior WP006/WP007 role history, which is explicitly recorded in the negative freeze. No duplicates were added.

- Overall: 1/112 FPs, 0.893%, Wilson `[0.00158, 0.04885]`.
- Camera: 0/87, 0%, Wilson `[0, 0.04229]`.
- Digital non-AI: 1/25, 4%, Wilson `[0.00710, 0.19544]`.
- Auxiliary descriptive pool: 2/248 FPs; this is not an independent confirmation result.
- `FPR_TARGET_NOT_YET_DEMONSTRATED`: the bounded data and interval do not establish a population <=1% FPR.

The principal observed false positive was in the digital non-AI class. That subgroup remains too small for a strong population claim.

## Input-regime result

SAFE is not transformation-invariant. The predeclared matrix is `FRAGILE` because JPEG95 and JPEG85 reduced synthetic recall to 1/40 and 0/40 respectively; JPEG75 also produced 0/40 and 3/40 negative FPs. Resize75, metadata strip, mild crop, and screenshot-style resampling retained 95–100% bounded recall; resize50 retained 85%; mild sharpening retained 67.5%; mild blur retained 100% but had 3/40 negative FPs.

Input-regime evidence therefore must reduce or withdraw SAFE authority rather than become authenticity evidence. The current generic classifier correctly avoids metadata and screenshot shortcuts, but the observed JPEG95/JPEG85 collapse shows that a future JPEG-specific applicability rule is still required. WP007H does not retrofit that rule.

## Public-to-Cloudflare FLUX.1 diagnostic

This was post-hoc only and did not fit or retune SAFE. Public FLUX.1-dev/schnell examples scored 39/40 above the frozen threshold; median score `0.94868`, IQR `0.02344`. The 40 consumed Cloudflare FLUX.1 examples scored 0/40; median `0.04658`, IQR `0.04309`. Matching the public images to 512 dimensions moved the median to `0.82701` and threshold hits to 33/40, so resampling contributes a material shift. Matching format and stripping metadata produced no movement because both source groups were already PNGs without the relevant metadata. The measurable ladder did not approach the Cloudflare distribution; an unexplained generator/runtime/input-domain component remains. This result is not unseen-generator evidence and does not justify changing SAFE.

## Shadow supporters

SPAI_C512, RINE, and UFD were descriptive only. SPAI recalled 60/160, RINE 39/160, and UFD 3/160 at prior frozen thresholds. Their negative FPRs were 2/112, 1/112, and 3/112. SPAI supplied 3 SAFE false-negative rescues but introduced 98 supporter false negatives; RINE and UFD supplied no SAFE false-negative rescue. UFD did not demonstrate unique useful correction beyond RINE/SAFE. No supporter output entered SAFE qualification or a learned fusion.

## Answers to the research questions

- SAFE is strong on eight independent modern families at the frozen original-input operating point, but Qwen-Image-2512 is lower at 15/20.
- The expanded negative result is promising but does not establish the long-term <=1% population target.
- JPEG95/JPEG85/JPEG75 are materially damaging; resize75, metadata strip, mild crop, and screenshot-style resampling were comparatively stable in this bounded matrix.
- Current measurable input-regime evidence can identify some low-applicability regimes, but JPEG-specific applicability is not yet validated.
- The public-to-Cloudflare FLUX.1 gap is not explained by the measured format/metadata ladder; dimension matching explains only part of the shift.
- SPAI has limited descriptive rescue; RINE and UFD do not provide meaningful incremental correction at frozen thresholds.
- SAFE is justified as the lead research EF3 specialist only within explicitly scoped applicability regimes.
- A future SAFE-led deterministic corroboration/router study is scientifically justified as a separate package, but WP007H does not implement or optimize it.
- FLUX.2 should remain sealed. There is no frozen candidate deserving a final reserve unblind after the unresolved domain shift, fragile JPEG behaviour, and rights review.
- Production routing, enforcement, Safety changes, and public-label authority remain `NO`.

## Next package recommendation

If pursued, WP007I should test a SAFE-led deterministic contradiction router with SAFE as the primary specialist, SPAI/RINE as independent shadow support, UFD remaining shadow/replacement-candidate, explicit applicability gates, EF2 conflict preservation, and abstention. It must not begin as another generic learned meta-calibrator. A learned meta-calibrator receives a role only after material independent improvement over SAFE alone and deterministic corroboration survives hard negatives and transformations.

## Artifact references

- Corpus: `qualification-corpus-freeze.json` SHA-256 `e10b48f70b4d1ee4dde49507dea955c9ce6ecf8b55fb93b4583f3e4450d08a1c`.
- Negatives: `negative-data-freeze.json` SHA-256 `615150bc1128babe1cac3763d517811e23b358ebfa5c819021f58f75b992e38e`.
- SAFE scores/results: `safe-scores.json` SHA-256 `ce51fc98edbd07345f7de07d7718fa3db5447dfe2fdb3d8a77c4f0933fb18b1d`; `safe-qualification-results.json` SHA-256 `207cc63f965dd1391da98be8e208033da0cdf7cbe12cadf68b0b1bc738bb0ae4`.
- Transform results: `safe-transformation-results.json` SHA-256 `f5f499997dcfff12f377bd0532704027cd26b1648203cbe0ad8175c772f0cf6f`.
- FLUX.1 diagnostic result: `flux1-diagnostic-results.json` SHA-256 `fdcd36754b95986eed839406b97867c16582c218953288920991d50c4025c6a4`.
- Shadow supporters: `shadow-supporter-results.json` SHA-256 `39f977ec454e5c972974d41b257dccd569e349a0414c070b75f990907339a8e9`.
- Specialist profile: `safe-specialist-profile.json` SHA-256 `0895e2b8756736f7276b13fa633551f0eaab96a2b0dbdab46330e8064096e06d`.

## Storage

The selected 160-image modern corpus is retained outside Git. Generated transformation descendants, SPAI C512 derivatives, and post-hoc FLUX.1 diagnostic derivatives are also outside Git and are recorded as regenerable. A recursive destructive cleanup command was rejected by the local execution policy, so `bytesDeleted=0`; no sealed reserve or repository file was touched. The accounting is in `storage-accounting.json`.

## Final disposition

`SAFE_SPECIALIST_QUALIFIED_WITH_LIMITED_APPLICABILITY`

The qualification is research-only and scoped to the frozen original/high-quality regime. SAFE is not production-ready, not a universal AI detector, and not a substitute for EF1, EF2, EF4, Safety, Moondream, Judge, deterministic policy, or appeals.
