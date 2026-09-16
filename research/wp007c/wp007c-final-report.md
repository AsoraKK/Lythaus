# WP007C EF3 Candidate Selection

## Decision

`WP007C_FINAL_DECISION = REJECT_CURRENT_EF3_CANDIDATES`

No candidate survived the predeclared development-only Stage A gates. The
scientific boundary is therefore before transformation stress, calibration
freeze, and any FLUX.1 pixel access.

## Immutable baseline

- `WP007C_BASE_SHA = e53e16685684aeee6198be54e1df17b805003183`
- `WP007C_DEVELOPMENT_SPLIT_SHA256 = 3a30dab63ace8b26f2684d1f658420f0f0fa66ad181cd94d8633aad86d64e721`
- `WP007AHR4_HOLDOUT_FREEZE_SHA256 = b1be6115a6ed3cb5d72c5ad3e90575ededbb4c969bd2bb248ec2806da32885c4`
- `FLUX2_RESERVE_FREEZE_SHA256 = 56ae0bd15b8bc21d77b28c9e6faea8149440aab8a9d101db523a43aedb98e054`
- `SPAI_CHECKPOINT_SHA256 = 24159f27d7c8c2cd0cb6c4019189eb89ad0874a0d9d15f8dc9afd39ca9648a55`
- `SPAI_UPSTREAM_COMMIT = 8ff7b3b6779b4fcb43cf313471d9cb1c62d129a4`
- `SPAI_RUNTIME_LOCK_SHA256 = ba8b2d04be17415c099e945cde8875d9f97a0cefe75687f242fc917a80044160`

The common split contained 64 DiffusionDB synthetic, 36 camera-negative, and
28 digital non-AI development families. Candidate membership was frozen before
scoring. Owner unknown-generator samples were not used.

## Candidate outcomes

| Candidate | Runtime | Synthetic recall | Camera FPR | Digital FPR | Overall negative FPR | Confounding | Shortcut | Stage A |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| `SPAI_NATIVE_CPU_OPT` | NOT_PRACTICAL | not run | not run | not run | not run | not run | not run | FAIL |
| `SPAI_C512` | FAST | 0.937500 | 0.111111 | 0.000000 | 0.062500 | HIGH | HIGH | FAIL |
| `PATCHCRAFT_OFFICIAL` | not run | not run | not run | not run | not run | not run | not run | RIGHTS BLOCKED |
| `LYTHAUS_SPECTRAL_LITE_V0` | FAST | 0.000000 | 0.027778 | 0.107143 | 0.062500 | MODERATE | HIGH | FAIL |

`SPAI_C512` had a strong synthetic recall of 0.937500 and acceptable negative
FPRs, but failed both the HIGH non-camera-confounding gate and the HIGH
overall-shortcut gate. `LYTHAUS_SPECTRAL_LITE_V0` was fast and had acceptable
negative FPRs, but synthetic recall was 0.000000 and the overall shortcut gate
was HIGH. The native-resolution optimization preserved the original scores
exactly in the four-sample smoke, but the three predeclared high-resolution
camera profiles took `166.842609, 73.954116, 81.716771` seconds, all over the 60-second stop
rule. PatchCraft was not retrieved or run because its code/checkpoint research
rights remained unconfirmed.

## Boundary and seals

- `TRANSFORMATION_STRESS = NOT_RUN_NO_STAGE_A_PASS`
- `WP007C_SELECTED_SPECIALIST = NONE`
- `WP007C_CALIBRATION_FREEZE_SHA256 = NOT_CREATED_NO_STAGE_A_PASS`
- `FLUX1_HOLDOUT_UNBLIND = NOT_PERFORMED`
- `FLUX2_PROVIDER_CALLS = 0`
- `FLUX2_FUTURE_RESERVE_STATUS = SEALED`
- `WP007B_REOPENED = FALSE`

No FLUX.1 or FLUX.2 pixels were accessed by candidate development. No
candidate saw holdout scores. No threshold was applied to FLUX.1.

## Evidence artifacts

- Runtime evidence SHA-256: `72d76d8bdedca587638597e154ecd5b6a7b74a8419e846d1d18f8219b5701118`
- Development evidence SHA-256: `8515ae877e5450603ef6145e6244b2229721bb0cccb438c6fdabb2f2187180cc`
- Selection blocker SHA-256: `bead878f2a2663d5846ea8841255c9433a33119d1b6ded5cfa367e20ce2e9b83`

The PatchCraft rights record is retained in
`research/wp007c/patchcraft-rights-audit.json`; no substitute detector was
introduced. This is a research-only result with no production, Safety, Judge,
EF2, or upload changes.

The following remain unresolved: end-to-end authenticity accuracy, human false
positive rate, broad generator/camera/digital-negative generalization,
mixed-origin detection, region localization, and EF3 directional validation.
