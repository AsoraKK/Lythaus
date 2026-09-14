# WP007A-HR — GitHub Actions Auth Recovery & Frozen Holdout Execution

WP007A-HR is currently stopped at the required workflow-PR stage. The
manual-only trusted workflow and its fail-closed preflight are prepared, but
no workflow dispatch or Cloudflare generation was attempted from this
unmerged branch.

WP007AHR_STAGE = WORKFLOW_PR_READY
WP007AHR_STATUS = WP007AHR_WORKFLOW_PR_READY

WP007AHR_BASE_SHA = 71fc02ff9eaefc1be3d30940b2efe5c5496ba6ee
WP007AHR_HISTORICAL_WP007A_FINGERPRINT = 210000b7b0d93960b23e090e396d60f97bb46d2816ee9ee7d345aae364ade3c5
WP007AH_GENERATION_FREEZE_SHA256 = 87982112412059bd1615bd2d36ee9cf8ad72828b4042cb93839d725b6b533514

WORKFLOW_PATH = .github/workflows/wp007ah-cloudflare-holdout.yml
WORKFLOW_TRIGGER = workflow_dispatch_ONLY
TRUSTED_REF = refs/heads/main
REQUIRED_SECRETS = CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
MINIMUM_PERMISSIONS = contents:read
PRIVATE_ARTIFACT_RETENTION_DAYS = 1

FLUX1_ROLE = SEALED_GENERATOR_HOLDOUT
FLUX2_ROLE = FUTURE_RESERVE
FLUX1_TRAINING_ELIGIBILITY = EVALUATION_ONLY
FLUX2_TRAINING_ELIGIBILITY = EVALUATION_ONLY

AUTH_STATUS = NOT_RUN
COST_STATUS = FREE_ALLOCATION_UNVERIFIED
RIGHTS_STATUS = FROZEN_ARTIFACT_REVALIDATION_IMPLEMENTED
FLUX1_REQUESTED = 40
FLUX2_REQUESTED = 40
FLUX1_VALID = NOT_RUN
FLUX2_VALID = NOT_RUN
INCREMENTAL_PAID_COST_USD = 0

GENERATION_DISPATCHED = FALSE
GENERATION_CALLS = 0
DETECTOR_INFERENCE_RUN = FALSE
MODEL_TRAINING_RUN = FALSE
TRANSFORMATIONS_RUN = FALSE
MEDIA_COMMITTED = FALSE
PRODUCTION_CHANGED = FALSE

The workflow cannot authorize generation until a read-only authenticated
Cloudflare model-catalog check succeeds and the complete frozen run is shown
to fit within a verified no-incremental-cost Workers AI allocation. The
preflight does not treat an unverified quota, a secret's presence, or a model
catalog response as cost authorization.

The historical `research/wp007ah/` artifacts remain unchanged. No generator
pixels were opened, no detector or specialist inference ran, and no secrets
were printed, persisted, or transferred.
