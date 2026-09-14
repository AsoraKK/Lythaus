# WP007A-H — Modern Cloudflare generator holdout materialisation

WP007A-H was executed as a fail-closed, generation-gated continuation of WP007A. No forensic detector, specialist, model inference, model training, transformation, or production change occurred.

## Baseline and frozen scope

WP007AH_BASE_SHA = 6543ec6496a4d4b006fb40b6f5de50cfd9e98009
WP007A_BENCHMARK_FINGERPRINT = 210000b7b0d93960b23e090e396d60f97bb46d2816ee9ee7d345aae364ade3c5
PROMPT_BANK_VERSION = LYTHAUS_EF3_PROMPT_BANK_V1
FROZEN_PROMPT_COUNT = 40
WP007AH_GENERATION_FREEZE_SHA256 = 87982112412059bd1615bd2d36ee9cf8ad72828b4042cb93839d725b6b533514
WP007AH_HOLDOUT_FINGERPRINT = 1efd1254953a3551ed4664eea5fe0dbec3cb21e674f468df04c079202077e495

The deterministic prompt subset contains five prompts from each of the eight existing WP007A regimes. Both authorized routes use the same prompt IDs. FLUX.1 Schnell is assigned `SEALED_GENERATOR_HOLDOUT`; FLUX.2 Klein 4B is assigned `FUTURE_RESERVE`.

## Rights and preflight

RIGHTS_REVALIDATION = PASS_FOR_BOUNDED_HOLDOUT_EVALUATION
AUTH_STATUS = AUTH_BLOCKED
CLOUDFLARE_INCREMENTAL_PAID_COST_USD = 0.00
ESTIMATED_PROVIDER_LIST_PRICE_USD = 0.080704

The current official Cloudflare model pages and pricing were rechecked, together with the current BFL terms. The route remains eligible for bounded private evaluation/holdout use, while training eligibility remains `EVALUATION_ONLY`; no training-rights upgrade was made. The local Wrangler check found no usable authorized CLI session, so generation stopped before the first request. No credentials were created, requested in chat, printed, or persisted.

Sources: [Cloudflare Workers AI data use](https://developers.cloudflare.com/workers-ai/platform/data-usage/), [FLUX.1 Schnell](https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/), [FLUX.2 Klein 4B](https://developers.cloudflare.com/workers-ai/models/flux-2-klein-4b/), [Cloudflare Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/), and [BFL terms](https://bfl.ai/legal/terms-of-service).

## Generation result

FLUX1_REQUESTED = 40
FLUX1_VALID = 0
FLUX1_FAILED = 0
FLUX1_ROLE = SEALED_GENERATOR_HOLDOUT
FLUX1_TRAINING_ELIGIBILITY = EVALUATION_ONLY

FLUX2_REQUESTED = 40
FLUX2_VALID = 0
FLUX2_FAILED = 0
FLUX2_ROLE = FUTURE_RESERVE
FLUX2_TRAINING_ELIGIBILITY = EVALUATION_ONLY

FLUX1_STATUS = NOT_MATERIALIZED_AUTH_BLOCKED
FLUX2_STATUS = NOT_MATERIALIZED_AUTH_BLOCKED
MEDIA_COMMITTED = FALSE
DETECTOR_INFERENCE_RUN = FALSE
MODEL_TRAINING_RUN = FALSE
TRANSFORMATIONS_RUN = FALSE
PRODUCTION_CHANGED = FALSE

The repository generation manifest intentionally contains zero output records. No generation results are fabricated. Because no output was materialized, the two families are sealed role assignments awaiting a later authorized run; there are no image hashes or source-family output records yet.

## Decision

WP007AH_STATUS = AUTH_BLOCKED
FINAL_CLASSIFICATION = WP007AH_AUTH_BLOCKED

The package is complete to the authentication stop condition: the deterministic plan, rights snapshot, prompt/freeze artifacts, empty result manifest, role guards, fingerprint structure, tests, report, commit, and PR preparation are present. A future authorized run may execute the frozen plan without changing the prompt subset, roles, cost cap, or training eligibility.

NEXT_STEP = WP007B — SPAI EF3 Spectral Calibration & Staged Unseen-Generator Evaluation, only after a separately authorized generation session materializes FLUX.1 and WP007B's own development/negative-control gates pass. FLUX.2 remains a future reserve.
