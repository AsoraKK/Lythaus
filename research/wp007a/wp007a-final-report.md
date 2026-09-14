# WP007A — Rights-clean synthetic corpus materialisation

WP007A is a benchmark/data package only. No SPAI, PatchCraft, detector inference, model training, model download, cloud image call, or production change occurred.

## Baseline

WP007A_BASE_SHA = 6c11fbf994bcf6e05e5e20238064237f9f90e574
FORENSIC_MODEL_CLASS = FORENSIC_CLASSIFIER_AND_EVIDENCE_MEASUREMENT_SYSTEM
GENERATIVE_CAPABILITY = NONE

## Materialisation

DIFFUSIONDB_RIGHTS = VERIFIED_CC0_WITH_DATASET_CONSTRAINTS
DIFFUSIONDB_DOWNLOADED_BYTES = 1213993166
DIFFUSIONDB_SELECTED_SOURCE_FAMILIES = 500
OWNER_SYNTHETIC_SOURCE_FAMILIES = 31
OWNER_KNOWN_GENERATOR_FAMILIES = 0
OWNER_UNKNOWN_GENERATOR_FAMILIES = 31
PROGRAMMATIC_HARD_NEGATIVE_FAMILIES = 48
CAMERA_NEGATIVE_FAMILIES_AVAILABLE = 96
DIGITAL_NON_AI_NEGATIVE_FAMILIES_AVAILABLE = 80
PROMPT_BANK_VERSION = LYTHAUS_EF3_PROMPT_BANK_V1
PROMPT_COUNT = 80
CLOUDFLARE_MODELS_AUDITED = @cf/black-forest-labs/flux-1-schnell, @cf/black-forest-labs/flux-2-klein-4b, @cf/stabilityai/stable-diffusion-xl-base-1.0, @cf/bytedance/stable-diffusion-xl-lightning

FLUX1_GENERATED = 0
FLUX2_GENERATED = 0
SDXL_BASE_GENERATED = 0
SDXL_LIGHTNING_GENERATED = 0
CLOUDFLARE_INCREMENTAL_COST_USD = 0
OPENAI_CHATGPT_TRAINING_ELIGIBILITY = REVIEW_REQUIRED
OPENAI_CHATGPT_EVALUATION_ELIGIBILITY = REVIEW_REQUIRED
CLOUDFLARE_FLUX_TRAINING_ELIGIBILITY = EVALUATION_ONLY
CLOUDFLARE_FLUX_EVALUATION_ELIGIBILITY = AUTHORIZED_FOR_BOUNDED_HOLDOUT_ONLY
XAI_GROK_TRAINING_ELIGIBILITY = REVIEW_REQUIRED
XAI_GROK_EVALUATION_ELIGIBILITY = REVIEW_REQUIRED
MODERN_SEALED_GENERATOR_FAMILIES = 0_MATERIALIZED; 4_AUDITED_AND_QUEUED
FUTURE_GENERATOR_RESERVE_FAMILIES = XAI_GROK_IMAGINE

## Gates

SOURCE_FAMILY_LEAKAGE = PASS
RIGHTS_GATE = PASS_FOR_DIFFUSIONDB_AND_OWNER_CONTROLLED_PRIVATE_USE; MODERN_ROUTES_REVIEW_REQUIRED
BENCHMARK_ROLE_GATE = PASS
WP007A_BENCHMARK_FINGERPRINT = 210000b7b0d93960b23e090e396d60f97bb46d2816ee9ee7d345aae364ade3c5
WP007A_DATA_FOUNDATION = PARTIAL

## Limitations and blocker

The bounded DiffusionDB development corpus is rights-audited and materialised from two official shards. The owner synthetic pool is retained as an unknown-generator diagnostic because generator/provider route provenance is not locally established. The owner hard-negative pool is screenshot-heavy, so WP007A adds 48 deterministic programmatic graphics across six subtypes. Modern Cloudflare outputs were not generated: BFL output-training restrictions, unresolved SDXL-Lightning upstream terms, and the absence of an authorized Cloudflare generation session require a later explicit gate. No ChatGPT or Grok outputs were imported.

The owner-controlled media remains outside Git. Public redistribution is not authorized. Prompt, provider, generator, seed, and rights metadata are provenance only and must not be passed to a future detector.

## Decision

FINAL_CLASSIFICATION = WP007A_EF3_CORPUS_PARTIAL
NEXT_WORK_PACKAGE = WP007B — SPAI EF3 Spectral Calibration & Staged Unseen-Generator Evaluation (only after a separate rights/auth gate for modern holdouts)
