# WP007A-HR4 / WP007B Research Boundary

## Classification

`WP007B = RUNTIME_BLOCKED`

The authorized HR4 materialisation completed successfully, but the required
CPU-only SPAI development pass was stopped under the explicit
`consistently >60 seconds/image` rule. No Stage A claim or FLUX.1 forensic
claim was made.

## HR4 provenance

- `WP007AHR4_BASE_SHA = 6bc3e09212fdd0784eea3e708491d763b854e418`
- `HR4_EXECUTION_RUN = 35000395251`
- `FLUX1_REQUESTED = 40`
- `FLUX1_VALID = 40`
- `FLUX1_FAILED_UNIQUE = 0`
- `FLUX1_PROVIDER_ATTEMPTS = 40`
- `HR4_INCREMENTAL_ATTEMPTED_COST_USD = 0.02536`
- `FLUX2_PROVIDER_CALLS = 0`
- `FLUX2_REGENERATION = FALSE`
- `FLUX1_LOCAL_HASH_VERIFICATION = PASS`
- `WP007AHR4_HOLDOUT_FREEZE_SHA256 = b1be6115a6ed3cb5d72c5ad3e90575ededbb4c969bd2bb248ec2806da32885c4`
- `WP007AHR4_FLUX2_RESERVE_FREEZE_SHA256 = 56ae0bd15b8bc21d77b28c9e6faea8149440aab8a9d101db523a43aedb98e054`
- `FLUX1 = SEALED_FOR_WP007B`
- `FLUX2 = SEALED_FUTURE_RESERVE`

## SPAI provenance

- `SPAI_UPSTREAM_COMMIT = 8ff7b3b6779b4fcb43cf313471d9cb1c62d129a4`
- `SPAI_CHECKPOINT_SHA256 = 24159f27d7c8c2cd0cb6c4019189eb89ad0874a0d9d15f8dc9afd39ca9648a55`
- `SPAI_CHECKPOINT_BYTES = 934865338`
- `SPAI_RESEARCH_EVALUATION_RIGHTS = CONFIRMED`
- `SPAI_CODE_RIGHTS = CONFIRMED_FOR_RESEARCH_USE`
- `SPAI_CHECKPOINT_RIGHTS = CONFIRMED_FOR_RESEARCH_EVALUATION`
- `SPAI_COMMERCIAL_DEPLOYMENT_RIGHTS = NOT_USED; UPSTREAM_AND_DEPENDENCY_REVIEW_REQUIRED`

The checkpoint was kept outside Git. The official upstream describes the
method as spectral reconstruction similarity for AI-generated out-of-
distribution samples and applies sigmoid output to the classification score.
The run used the upstream `configs/spai.yaml` preprocessing with original
resolution and a CPU-only compatibility shim for the upstream CUDA method
calls; weights and model code were not changed.

## Runtime evidence

The four-sample smoke completed with per-image times `109.431, 3.765, 2.151,
23.933` seconds, giving p50 `13.849` seconds and an initial MODERATE tier.
The first three required development images were high-resolution camera
negatives and took `86.032, 80.801, 175.386` seconds. This is a consistent
over-60-second stratum, so the run stopped as `NOT_PRACTICAL` before a score
CSV was produced.

## WP007B boundary

- `WP007B_STARTED = FALSE`
- `STAGE_A = NOT_RUN`
- `WP007B_CALIBRATION_FREEZE_SHA256 = NOT_CREATED`
- `FLUX1_HOLDOUT_UNBLIND = NOT_PERFORMED`
- `FINAL_CAMERA_METRICS = NOT_AVAILABLE`
- `FINAL_DIGITAL_METRICS = NOT_AVAILABLE`
- `UNKNOWN_GENERATOR_DIAGNOSTIC = NOT_PERFORMED`
- `FLUX2_FUTURE_RESERVE_STATUS = SEALED`

The score-blind split freeze remains recorded at
`e3a2d819e7fd4f74c27710d7eafaba0ec4af85b3680dbf5cae576b2581438977`, but it
was not used to set a threshold. The combined holdout freeze remains valid;
its pixel-access guard was not breached.

The following claims remain unresolved: end-to-end authenticity accuracy,
human false-positive rate, broad generator/camera/digital-negative
generalization, mixed-origin detection, region localization, and EF3
directional validation.
