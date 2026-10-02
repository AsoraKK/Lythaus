# WP007F — Modular EF3 Alpha Research Report

## Decision

`WP007F_SCIENTIFIC_DECISION = KEEP_MEASUREMENT_ONLY`

`ALPHA_GO_NO_GO = NO_GO_LIVE_RIGHTS_AND_AUTH_BLOCKED`

The qualification run produced useful, bounded detector evidence, but no detector or frozen fusion rule met the high-confidence product bar on the one-time FLUX.1 exam. The alpha service contract is implemented in default `SHADOW` mode and was not deployed because current checkpoint/product rights and authenticated Cloudflare pricing/access were not confirmed. No production behavior changed.

This report does not claim universal AI detection, end-to-end authenticity accuracy, human false-positive rate, or directional validation.

## Provenance and seals

- `WP007F_BASE_SHA = 611b0b006a5ea66ef1f7369255a6e3f19951a6e7`
- WP007E research PR #843 was merged from reviewed head `608b4d2e0a1a89e020be9110ff6c8df8d51fb5de`.
- `WP007AHR4_HOLDOUT_FREEZE_SHA256 = b1be6115a6ed3cb5d72c5ad3e90575ededbb4c969bd2bb248ec2806da32885c4`
- `FLUX2_RESERVE_FREEZE_SHA256 = 56ae0bd15b8bc21d77b28c9e6faea8149440aab8a9d101db523a43aedb98e054`
- `WP007F_ALPHA_CALIBRATION_FREEZE_SHA256 = 5b321d7797fdfe0b8507f0aa7bef29a17acdb3a6d9298d0075dabf01e5b9592f`
- The alpha calibration freeze preceded all FLUX.1 pixel access. The final exam was performed once after that freeze, with no post-exam tuning and no second candidate evaluation.
- FLUX.2 remained completely untouched: zero provider calls, zero pixel access, zero inference, zero feature extraction, zero transforms, and zero manual forensic inspection.

## Storage cleanup

The non-destructive inventory identified only known Lythaus research roots. Exact disposable WP007E media and decoder-weight roots were removed after preserving their manifests and reports.

| Measure | Bytes |
|---|---:|
| `STORAGE_BYTES_BEFORE` | 7,827,964,149 |
| `STORAGE_BYTES_DELETED` | 974,188,771 |
| `STORAGE_BYTES_PRESERVED` | 6,853,775,378 |
| unresolved | 0 |

Sealed FLUX.1 and FLUX.2 material, DiffusionDB, camera/negative data, SPAI, active environments, and reproducibility records were preserved. No broad cache purge or unrelated personal-data inspection was performed.

## Qualification corpus

The role freeze was score-blind and family-controlled. The available rights-clean digital pool was smaller than the requested target, so the run used all available independent digital controls without fabricating replacements.

| Role | Count |
|---|---:|
| `DDB_DETECTOR_DEV` | 200 |
| `DDB_DETECTOR_CONFIRM` | 100 |
| `CAMERA_DEV` | 100 |
| `CAMERA_CONFIRM` | 50 |
| `DIGITAL_DEV` | 48 |
| `DIGITAL_CONFIRM` | 23 |

The digital shortfall is a breadth limitation, not a hidden reuse of final controls. DDB confirmation families were not used for head training or threshold selection. Owner challenge data remained pending and was not used for qualification.

## Rights and detectors

- `SPAI_C512`: checkpoint `24159f27d7c8c2cd0cb6c4019189eb89ad0874a0d9d15f8dc9afd39ca9648a55`; research evaluation rights recorded; product deployment rights not confirmed.
- `UNIVERSAL_FAKE_DETECT`: checkpoint `477100745713bcc957beb2b40859536859b6483fd6301b3b9293151b194c7847`; MIT repository; research evaluation is conditional on checkpoint/provenance review; product deployment is not confirmed because it uses OpenAI CLIP ViT-L/14.
- `RINE`: checkpoint `13986ffc86e1bd9d57fd640f891358c4f14c0f8aea8e590e52c598541f69fdc1`; Apache-2.0 repository; research evaluation is conditional on checkpoint/provenance review; product deployment is not confirmed because it uses OpenAI CLIP ViT-L/14.

The shared CLIP source and model-card boundary are recorded in `detector-rights-audit.json`. The official sources are [OpenAI CLIP](https://github.com/openai/CLIP), [UniversalFakeDetect](https://github.com/WisconsinAIVision/UniversalFakeDetect), and [RINE](https://github.com/mever-team/rine). The CLIP model card describes research intent and places deployment use cases outside its scope without a task-specific study.

## Frozen qualification results

All scores below use development-derived thresholds targeting approximately 1% pooled negative FPR. Rates are shown as numerator/denominator, followed by the point estimate and Wilson 95% interval.

| Detector | Dev synthetic recall | Dev camera FPR | Dev digital FPR | Dev overall FPR | Confirm synthetic recall | Confirm overall FPR | Local p50 / p95 seconds |
|---|---:|---:|---:|---:|---:|---:|---:|
| `SPAI_C512` | 154/200 = 0.770 `[0.706917, 0.822907]` | 6/100 = 0.060 `[0.027786, 0.124768]` | 0/48 = 0 `[0, 0.074100]` | 6/148 = 0.041 `[0.018710, 0.085619]` | 81/100 = 0.810 `[0.722212, 0.874852]` | 2/73 = 0.027 `[0.007546, 0.094501]` | 2.567469 / 4.728308 |
| `UNIVERSAL_FAKE_DETECT` | 19/200 = 0.095 `[0.061663, 0.143602]` | 2/100 = 0.020 `[0.005502, 0.070012]` | 0/48 = 0 `[0, 0.074100]` | 2/148 = 0.014 `[0.003714, 0.047929]` | 10/100 = 0.100 `[0.055229, 0.174366]` | 1/73 = 0.014 `[0.002422, 0.073597]` | 1.625119 / 2.777529 |
| `RINE` | 102/200 = 0.510 `[0.441186, 0.578437]` | 2/100 = 0.020 `[0.005502, 0.070012]` | 0/48 = 0 `[0, 0.074100]` | 2/148 = 0.014 `[0.003714, 0.047929]` | 56/100 = 0.560 `[0.462281, 0.653280]` | 2/73 = 0.027 `[0.007546, 0.094501]` | 1.678271 / 3.436892 |

Qualification classes:

- `QUALIFIED_HIGH_CONFIDENCE = []`
- `QUALIFIED_SUPPORT_ONLY = [SPAI_C512, RINE]`
- `SHADOW_ONLY = [UNIVERSAL_FAKE_DETECT]`
- `RETAINED_DETECTOR_COUNT = 2` for bounded support evidence; UFD remains registered for shadow/research comparison.

SPAI and the CLIP-derived group are separate evidence groups. UFD and RINE share `CLIP_GENERATIVE` and are never counted as two independent votes. The compiler is `lythaus-synthetic-evidence-compiler-v1`, with a 35-point cap for each group and a bounded corroboration bonus inside the correlated CLIP group.

## Robustness and audits

- Transformation testing was `MIXED_SMALL_N_FIXED_AUDIT`. SPAI retained synthetic recall under most fixed transformations but showed a camera FPR increase under the 50% resize case. UFD had no useful transformed positive recall in this slice. RINE had no transformed positive recall at the frozen action threshold.
- SPAI had `NON_CAMERA_CONFOUNDING = HIGH` and `SOURCE_DATASET_SHORTCUT_RISK = HIGH`.
- RINE had moderate camera/digital separation (`symmetric AUC = 0.776667`), `SOURCE_DATASET_SHORTCUT_RISK = MODERATE`, but `negativeSubtypeShortcutRisk = HIGH` and `OVERALL_SHORTCUT_RISK = HIGH`.
- UFD had low camera/digital separation (`symmetric AUC = 0.560625`) and low source-dataset separation, but `negativeSubtypeShortcutRisk = HIGH` and `OVERALL_SHORTCUT_RISK = HIGH`.
- Correlations were retained for audit: SPAI/RINE Pearson `0.586114`, Spearman `0.596764`; UFD/RINE Pearson `0.136974`, Spearman `0.322751`; SPAI/UFD Pearson `0.188151`, Spearman `0.298639`.

These audits prevent a high-looking synthetic score from being treated as proof of generator-origin.

## One-time FLUX.1 exam

The final exam used all 40 frozen FLUX.1 families and the same-stage sealed final controls: 32 camera and 32 digital. The input manifest used for execution is intentionally not committed because it contains local filesystem paths; `flux1-final-result.json` is the sanitized committed result.

| Frozen detector/rule | FLUX.1 recall | Final camera FPR | Final digital FPR | Final overall FPR |
|---|---:|---:|---:|---:|
| `SPAI_C512` | 11/40 = 0.275 `[0.161080, 0.428350]` | 3/32 = 0.094 `[0.032402, 0.242182]` | 0/32 = 0 `[0, 0.107179]` | 3/64 = 0.047 `[0.016069, 0.128997]` |
| `UNIVERSAL_FAKE_DETECT` | 1/40 = 0.025 `[0.004427, 0.128814]` | 6/32 = 0.188 `[0.088895, 0.353092]` | 1/32 = 0.031 `[0.005538, 0.157443]` | 7/64 = 0.109 `[0.054001, 0.208986]` |
| `RINE` | 1/40 = 0.025 `[0.004427, 0.128814]` | 0/32 = 0 `[0, 0.107179]` | 0/32 = 0 `[0, 0.107179]` | 0/64 = 0 `[0, 0.056624]` |
| `SPAI_C512 AND ANY CLIP_GENERATIVE` | 0/40 = 0 `[0, 0.087622]` | 0/32 = 0 `[0, 0.107179]` | 0/32 = 0 `[0, 0.107179]` | 0/64 = 0 `[0, 0.056624]` |

The selected frozen alpha rule therefore has `FLUX1_COMBINED_SYNTHETIC_RECALL = 0/40`. This is a genuine negative transfer result at the predeclared action thresholds, not a tuning failure. No FLUX.1 detector was run again.

## Alpha implementation and deployment boundary

The research branch adds:

- a versioned detector contract and hot-swappable registry;
- deterministic evidence compilation with correlated-group caps;
- partial/timeout/error handling that preserves successful detector evidence;
- decision snapshots carrying exact model/version/hash/calibration provenance;
- conservative `OFF`/`SHADOW`/`ALPHA` modes, defaulting to `SHADOW`;
- a bounded internal-authenticated CPU container contract with `/health`, `/version`, and `/score` endpoints;
- tests that keep Safety moderation separate from authenticity, prevent LLMs from changing the numerical score, and keep missing evidence as missing rather than negative evidence.

Existing OpenAI moderation, Moondream observation, GPT-OSS advisory, Evidence Packet, and appeals contracts remain separate and reusable. Moderation is never an authenticity input. Moondream and GPT-OSS are not present in the deterministic score path. No enforcement authority is granted by the alpha service.

The container is not deployed. `npx wrangler whoami` could not refresh the expired local Cloudflare authentication, so live container availability, warm/cold latency, and pricing could not be verified. The container image deliberately mounts no research checkpoints and returns `Under review` with `UNAVAILABLE` detector evidence until rights and authenticated deployment configuration are separately resolved. Estimated monthly cost is therefore not invented or reported as measured.

`SHADOW_MODE_STATUS = CONTRACT_READY_NOT_DEPLOYED`.

## Preserved boundaries

- No production router, Safety policy, Judge behavior, upload enforcement, moderation policy, public label ontology, or PlanetScale production schema was changed.
- No generated image bytes, model checkpoints, camera media, private input paths, secrets, bulk tensors, or virtual environments are committed.
- `FLUX2_PROVIDER_CALLS = 0`; `FLUX2_FUTURE_RESERVE_STATUS = SEALED`.
- `END_TO_END_AUTHENTICITY_ACCURACY`, `HUMAN_FALSE_POSITIVE_RATE`, broad generator/camera/digital generalization, mixed-origin detection, regional localization, and `EF3_DIRECTIONAL_VALIDATION` remain unresolved.

## Artifacts

The committed WP007F record includes storage inventory/cleanup evidence, rights and qualification freezes, raw detector results, operating curves, calibration profiles, correlation/fusion results, transformation and nuisance audits, the detector registry, alpha compiler specification, cost boundary, and sanitized one-time final result. The local final-input manifest is excluded from the PR because it contains absolute paths.

`FINAL_RESEARCH_PR = opened separately and left unmerged for review.`
