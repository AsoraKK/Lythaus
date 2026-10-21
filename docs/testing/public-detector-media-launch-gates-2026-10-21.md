# Detector and hosted-media launch gates: 21 October 2026

This is a current-code inventory based on main
`360aae649b58d4692e0332086c0d2fef6e0e4da6` plus the focused accompanying fixes.
It is not live acceptance. Public posting, standard-media uploads/processing and
authenticity enforcement remain disabled. Migration 0021 and an owner-testing
deployment cannot qualify detection or activate publishing.

## Implemented and tested locally

- Standard uploads use an authenticated, session-checked Worker byte route,
  bounded reads, exact checksums and MIME signatures, conditional private R2
  writes, active-owner checks, expiry fences and per-owner logical reservations.
- Finalisation commits one outbox event. Owner retries return that event's
  private queued receipt, including after processing deletes the source. Missing,
  conflicting, cross-owner or changed-source events fail closed. The receipt
  certifies acceptance for processing only.
- Jobs retries conditional derivative writes and failed SQL settlement without
  repeating successful Images work. Session locks fence overlapping work and
  account deletion. Terminal cleanup retries exact keys and preserves referenced
  derivatives. EXIF/GPS/orientation fixtures verify the local transform boundary.
- Image processing records `modelId: not-executed`, `reviewRequired: true` and a
  private `review` object. Text review independently abstains on safety and
  authorship. Malformed model output records `model_response_invalid` and
  unavailable reasoning; it cannot become an observed qualified result.

These are synthetic Node, Workerd/private-R2 and disposable PostgreSQL 17 tests.
They do not measure real detector errors, hosted Images behavior or production
database/Queue acceptance. No live inference or hosted writes are added here.

Local validation on Node 24.19.0: the focused evaluator/evidence/media suite
passed 61 tests; canonical-role media acceptance passed 26 tests on fresh local
PostgreSQL 17.11; the required text-review runner passed 109 tests without skips;
native TypeScript and OpenAPI lint/bundle passed. OpenAPI retains its two existing
schema warnings. The broader authenticity-foundation run passed all 44 tests
but failed its aggregate 80% function-coverage threshold at 75.70%. Running the
untouched source baseline reproduced that gate failure at 75.52%; this is a
pre-existing local coverage limitation, not a successful coverage result.

## Actual detector requirements

1. Select a text-authorship candidate and define its supported languages,
   lengths, domains and assisted/generated cases. The current general Workers AI
   prompt is unqualified reviewer evidence. No qualified text-authorship model
   or empirically accepted public threshold exists in that path.
2. Freeze rights-cleared, purpose-approved labelled corpora and hashes, lineage
   and ground-truth provenance, family-separated calibration/holdout splits and
   relevant ordinary/adversarial/transformed slices. Unknown labels and abstention
   must remain explicit. Private media, text and weights stay outside public Git
   and public Actions artifacts.
3. Freeze exact source, model/checkpoint, preprocessing, runtime and threshold
   identities. Perform real inference with independently reviewed calibration and
   holdout error/coverage/uncertainty results against approved acceptance budgets.
   No public numeric budgets are approved by this document.
4. Preserve independent safety, authorship, disclosure and publication authority.
   The existing SAFE-A threshold is a private positive-specialist boundary;
   below-threshold scores, metadata, low camera evidence and the research
   decoder-proxy results do not certify human authorship. WP007E's recorded
   decision is `REJECT_LOCAL_DECODER_PROXY_EF3`, not a launch-qualified detector.
5. Approve a finite actual-provider evaluation envelope: existing provider/model
   access, allowed data transmission, private evidence destination/retention,
   exact candidate, calls including retries, execution window, fresh allowance
   and usage evidence, and maximum spend. Existing private CPU-evaluation
   authorization recorded in `authenticity-v0.1-readiness.json` expired on
   29 September; it does not authorize a new run. Missing access cannot be solved
   by creating credentials or buying a service under the present authorization.

The existing offline posting-feedback harness has no live mode or empirical
receipt importer. Its proposed 20-request text safety contract probe is not
text-authorship qualification. See
[the evaluation plan](../../packages/authenticity/evaluation/posting-feedback/evaluation-plan.json)
and [the earlier evidence assessment](moderation-authenticity-evaluation-2026-10-11.md).

## Actual hosted-media requirements

- Reconcile and accept production migration/role prerequisites through the
  separately gated 0021 path; local proposed-grant tests cannot prove hosted
  effective privileges. Do not use the all-migrations runner.
- Authorize a specific owner-controlled fixture account and exact synthetic
  assets, permitted creation/retention/deletion, existing R2/Images/Queue targets
  and bounded calls/cost before a hosted write acceptance run. Current permission
  does not authorize new test users, fixture uploads or physical deletion.
- Observe actual Hyperdrive transactions, Worker ingress, R2 conditionals,
  Images decode/orientation/metadata removal, Queue redelivery/retry exhaustion,
  janitor cleanup and deletion/export/hold races. Keep a sanitized receipt bound
  to the deployed commit and resource identities; retain no media or credentials
  in public artifacts.
- Resolve physical staging accounting/headroom before activation. Expired
  reservations can be released before R2 deletion succeeds; a queued transform
  can temporarily retain both source and derivative. The logical per-owner cap
  is not a hard aggregate stored-byte or billing cap. Repeated cleanup failure
  needs a bounded physical-accounting strategy and an approved storage envelope.
- Resolve image attachment capabilities and original/derivative retention policy
  before connecting the disabled attachment preparation to public posting.
  Its engineering limits and structural synthetic evidence are not product
  policy or detector authority.

The original launch gaps are therefore narrower than stale preparation notes
suggest, but remain open where actual provider evidence, qualified models,
physical-accounting policy or owner-approved test scope is missing. No feature
gate changes follow from passing the accompanying tests.
