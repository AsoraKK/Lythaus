# Standard image review integration — 23 October 2026

This slice prepares source-bound private evidence. It does not execute image
classification, qualify a detector, attach an image to a post, or authorize
publication. Media, authenticity enforcement and publishing gates are unchanged.

## Baseline and scope

Fresh `git ls-remote origin refs/heads/main` confirmed
`868be4ee163ba5f7968212230d731682ff005e45` before implementation. The supplied
live release remains `3880a8be4c89459dd7ef831c9385817a887511ef`; this task did not
independently certify that deployment. Root `AGENTS.md` and current policy
authority were read. The available workspace `.agents` directory was empty;
there were no additional repository skills or nested AGENTS files.

No older image branch was copied. Public API `src/index.ts`, verification,
Flutter auth/settings, monthly policy, reputation, comments, counters,
notifications, homepage, deployment configuration, grants and migrations are
unchanged. No API-index integration patch is needed for this slice.

## Executable path

| Stage | Existing behavior and this change | Authority limit |
| --- | --- | --- |
| Ordinary upload | Authenticated owner uploads bounded, checksummed bytes into private quarantine; finalisation commits the standard outbox event | Upload is not detection |
| Queue/job | Jobs locks the standard session and now requires exactly one canonical outbox event with matching event ID, owner, session, purpose and object key | Forged, ambiguous and mismatched jobs retry without reading image bytes or settling media |
| Original provenance | Before source deletion, the existing local container inspector observes only EXIF/XMP/C2PA marker presence | Markers are unverified; missing metadata and apparent C2PA never certify human or camera origin |
| Specialist evidence | The packet explicitly records safety NOT_RUN and authorship ABSTAIN, with specialist NOT_RUN and no qualified threshold | No provider or classifier was called |
| Reasoning/policy | Reasoning stays NOT_RUN because specialist evidence is unavailable; deterministic policy is review_required | Publication, reputation and enforcement authority are false |
| Persistence | `media.moderation_results.signal.imageReview` commits with the private review object, ownership, variant, ledger and session transition | Existing outer `not-executed` evaluation remains compatible; no schema change |
| Owner feedback | Existing owner-only, no-store status remains `review`, safety/authenticity `not_run`, publication false; activity says review pending | The new private packet is not exposed through public status |
| Privacy | Owner passport media includes its versioned packets; existing deletion and media retention transactions remove the new `imageReview` subtree | Other owners and legacy moderation fields are preserved; existing legal-hold routing remains authoritative |

The packet binds owner, upload session, canonical finalisation event, media
object, exact original checksum/MIME/size, derivative checksum/size/dimensions
and actual transform version. New media records still use application UUIDv7.
`verifyImageReviewEvidence` requires an independently supplied current binding;
changing any binding component invalidates reuse. Its deterministic SHA-256 is
an integrity checksum, not a signature or provider attestation. No raw EXIF,
GPS, camera name, filename, key, URL, pixels or provider response enters the
packet or user activity.

After a SQL failure, a verified cached derivative is reused without another
transform. If the original remains, it is reverified before observing markers;
a changed original cannot reuse old provenance. If the original is absent,
the packet explicitly records UNAVAILABLE provenance and UNKNOWN origin rather
than inferring metadata absence from the stripped derivative. Legacy v1 cached
derivatives keep `standard-webp-v1` identity and revalidated dimensions. Packet,
media and quota writes roll back together; cleanup retry cannot duplicate them.

## Actual adapters and dependencies

These are source inventory findings, not fresh provider-access acceptance:

- `openai-moderation.ts` implements the existing OpenAI
  `omni-moderation-latest` image safety adapter. It supplies safety evidence,
  never authorship authority. The separate private beta calls it only inside
  that beta's admission, consent and budget path.
- `authenticity-beta.ts` calls the existing SAFE-A container protocol, pins
  checkpoint/runtime/preprocessing/input/case/revision/run identity, and feeds
  `compileBetaResult`. SAFE-A is an uncalibrated positive-only specialist.
  Its supported interpretation requires the documented lossless source history;
  JPEG, transformed inputs and unknown history withdraw interpretation. A low
  score is not human evidence. Current deployment and authorization are unproven.
- The beta adviser uses existing Cloudflare Workers AI
  `@cf/openai/gpt-oss-20b`, with evidence references and abstention constraints.
  The research observer adapter defaults to
  `@cf/moondream/moondream3.1-9B-A2B`. Neither is a calibrated authorship detector.
- The ordinary `evaluateAuthenticity` string-prompt adapter is reviewer-only
  evidence and is deliberately not used to pretend that upload metadata is
  pixel classification. No verified C2PA trust-chain adapter was found in the
  ordinary path.

Private beta approvals/consent cannot be silently reused for ordinary uploads.
The previous finite inference authorization expired; this task supplies no new
evaluation envelope, credentials, provider calls or source-history approval.

## Validation

Node 24.19.0; local Workerd/private R2; existing `sharp` synthetic image fixture;
new loopback-only disposable PostgreSQL 17 container. External requests are
denied by the Workerd fixture and its outbound-request collection remains empty.

| Command / scope | Result |
| --- | --- |
| `node --experimental-strip-types --test --test-concurrency=1 packages/media/tests/standard-upload.test.mjs packages/media/tests/standard-upload.workerd.mjs` | 44 passed; zero failed/skipped, including the Workerd parent test |
| `PLANETSCALE_PG17_TEST_DATABASE_URL=<owned-loopback-control> node --experimental-strip-types --test --test-concurrency=1 packages/media/tests/standard-upload.postgres.mjs` | 30 passed; zero failed/skipped, including the PG parent test |
| Jobs runtime policy and product integrity runtime invariant tests | 36 passed; zero failed/skipped |
| Beta, beta cache fence and text review evidence tests | 52 passed; zero failed/skipped |
| `npm run typecheck:native`; `git diff --check` | Passed |

The PG suite loads the unchanged canonical baseline into a new synthetic
database. Its existing negative cases still observe the canonical Jobs
`media.ownership` INSERT permission denial. Existing explicitly scoped fixture
grant cases test later settlement then revoke that local grant; this is not
hosted privilege acceptance. New export/purge tests require no additional grant.
No production database write or migration ran.

An additional exploratory `product-integrity-admin-jobs.test.mjs` run has two
failures, reproduced unchanged on pristine `868be4ee`: a removed
`const MAX_IMAGE_PIXELS` source delimiter and an obsolete nested-transaction
regular expression. They are not waived or repaired by this slice. The required
product integrity runtime suite passes. Initial test-fixture errors (one stale
outbox count, duplicate local variable and nonexistent foreign-key actor) were
corrected before the final passing runs.

## Smallest legitimate acceptance path

1. Parent independently reviews the exact draft head and required CI, then
   coordinates any merge/deployment. Do not enable any flag from these tests.
2. Reconcile actual hosted schema/least-privilege permissions through the
   existing separately approved path. Authorize bounded owner-controlled
   synthetic upload, Images/R2/Queue/Hyperdrive, retry, cleanup and privacy/hold
   acceptance against the exact deployed candidate and existing resources.
3. Approve a finite existing-provider evaluation envelope: exact adapter,
   checkpoint/runtime/preprocessing, source rights/history, permitted data
   transmission, independent safety, private retention, calls/retries, window
   and cost. Resolve original retention first: standard processing currently
   deletes the original, and a WebP derivative cannot stand in for SAFE-A's
   supported original lossless input. This packet preserves identity, not pixels.
4. Connect an authorized image analysis job to the existing safety/specialist/
   adviser contracts with exact revision fences. Validate labelled, rights-cleared,
   family-separated calibration/holdout evidence and accepted error/coverage
   limits before any authorship interpretation or enforcement.
5. Complete the separately gated attachment, serving/cache, declaration,
   review/appeal and publication journey, then seek owner acceptance/activation.
   Private upload success and a positive specialist alone cannot satisfy it.

Cloudflare Workers and PlanetScale remain the architecture. No resource,
credential, enrollment, security activation or external backup project changed.
