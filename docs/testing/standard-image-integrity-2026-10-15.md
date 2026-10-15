# Standard image upload integrity and posting handoff

Inspected base: `53ac0f4ece621605762cde8d9a42f7dde8362ca9` on `main`.
This is source preparation for independent review, not a posting release.
Public image posting remains blocked. No provider calls, deployment, merge,
feature activation, persistent schema/grant change, credential change or new
resource is part of this work. An unapplied grant patch is included for review;
its two column grants are exercised only in the uniquely named disposable PG17
test database and revoked before teardown. Model output does not prove human
authorship.

## Ownership and existing work

Open PRs were inspected before editing. #989 owns the ordinary post-review
transaction/fence and publication PG17 runner; #886 owns private alpha hardening;
#1000 updates moderation evaluation evidence; #1022 owns reputation transaction
cleanup/lock work, including the shared database transaction wrapper; #1023
touches composer-adjacent Flutter release gates. This lane leaves #1022's
transaction wrapper files unchanged. It adds a separate named standard-media
session fence and purge path in `AccountDeleteWorkflow`; the media queue holds
its existing per-session lock and deletes private bytes only after a terminal
DB result commits. The PRs have separate steps and SQL scopes in the shared Jobs
entrypoint and additive CI workflow registration.

This lane owns `packages/media/src/standard-upload.ts`, its four test/fixture
files, the standard upload functions in Public API `src/index.ts`, and the
ordinary `processMediaUpload` function in Jobs `src/index.ts`. The only shared
test maintenance is the existing byte-boundary assertion and new media-session
fence ordering assertion in `scripts/tests/product-integrity-runtime-invariants.test.mjs`
and one additive CI step in `.github/workflows/ci.yml`. Revision 3 also reconciles the two exact
Worker blob pins in `apps/marketing-site/tests/homepage-protection.test.mjs`,
with all existing negative controls preserved. No Flutter or generated SDK
files change. The [revision 3 review packet](standard-image-integrity-review-2026-10-15.md)
records the independent findings, exact blob identities and true race evidence.

## Verified path on main

| Stage | Source owner | Behavior and missing acceptance |
| --- | --- | --- |
| Intake | `apps/lythaus-public-api/src/index.ts`: media routes, `createUploadSession`, `finaliseUpload` | Flag gate, authenticated current principal, per-owner idempotency, daily limit, private response. Reserves bytes in the database and issues a private-quarantine PUT capability. Finalization creates a durable `media.upload.finalised` outbox event. |
| R2 signing | `packages/media/src/index.ts` | Existing AWS4 signing, 600-second default expiry, canonical image MIME header. A PUT URL is a private bearer capability, not a public media URL. The returned `maxBytes` is not a demonstrated R2 ingress-size enforcement mechanism. |
| Queue | `apps/lythaus-jobs/src/index.ts`: outbox relay, `processMessage`, `processMediaUpload` | Durable outbox routes to the existing media queue; inbox handles delivery/retry. This PR makes disabled processing retry instead of acknowledging work as completed. Queue retry/DLQ capacity and replay still need operational acceptance. |
| Byte processing | `processMediaUpload`, existing Images binding | Checks source bytes, reads dimensions and requests WebP output. Writes derivative to the private approved bucket. That bucket name does not mean safety/authorship approval. |
| Detection and evidence | Jobs `runAuthenticityEvaluation`, `packages/authenticity/src/index.ts` | Ordinary image evaluation receives a JSON string containing digest, MIME, size and dimensions, **not image pixels**. It is generic `evaluation-only-v1` review evidence. Its risk score cannot certify image origin or safety. `media.moderation_results` is written with the review object; AI execution-audit failure is still caught separately. No durable, qualified pair of public-image safety/authenticity results is established. |
| Separate adapters | `packages/authenticity/src/moderation.ts`, `openai-moderation.ts`, private alpha/beta modules, Jobs `post-safety-evidence.ts` | Existing modality/provider contracts are available, but private-purpose evidence and text-safety preparation do not authorize ordinary public images. Post safety preparation is return-only, `persisted:false`. No adapter is newly activated here. |
| Post attachment | `packages/db/src/post-attachment-preparation.ts`, `post-attachment-byte-boundary.ts` | Uncalled, unexported preparation. Hard activation constant is false; capabilities are unresolved. The relation is an unapplied SQL proposal with outstanding mutation/deletion rules. No runtime post-to-media relation or public media projection exists in this path. |
| Publication | Public API create-post/feed readers, Jobs post moderation, moderation/appeal policy | Submission/review and publication are separate. This change creates no feed entries, public URLs, post attachments, moderator authority, reputation or rewards. Existing owner hold and publication guards remain. |
| Privacy | Jobs `AccountDeleteWorkflow` / `RetentionCleanupWorkflow` | Existing hold checks, private storage deletion and database tombstones remain. Rejected/abandoned upload cleanup, in-flight derivative writes, account fencing and future attachment locators still need complete acceptance. |

Checked-in `MEDIA_UPLOADS_ENABLED` and `MEDIA_PROCESSING_ENABLED` are both false.
Jobs `AUTHENTICITY_AI_ENABLED` is true in source. The original main path would
call its generic metadata evaluator if media processing were enabled. This
proposed path removes that call from ordinary image processing and records
explicit unavailable review evidence with `modelId: not-executed`, even when
the AI flag is true.
No flag value changes. Live configuration and grants were not inspected;
checked-in values are not a claim about deployment state.

## Implemented

- Enforce integer upload sizes within the existing 10 MiB engineering bound;
  preserve the existing MIME allowlist and checksum requirement.
- Create the per-owner ledger row before locking/checking quota, so concurrent
  first reservations serialize. No quota or entitlement value changes.
- Reuse the existing bounded reader, signature detector and SHA-256 helper for
  both finalization and queued processing. Check the actual GET body's length,
  digest and MIME; do not rely on a prior HEAD or declared MIME. Storage read
  failures stay retryable rather than becoming integrity decisions.
- Check session expiry with database time before work, between source validation
  and Images, after transformation, and in the final state transition. Pending
  finalization expiry atomically marks the session expired and releases its
  reservation; a queued expired session does the same under its session lock.
  Revalidate owner, standard purpose and source identity at settlement.
- Recheck checksum after queue delay, isolate standard uploads from private
  alpha/beta purposes, and reject invalid dimensions or non-WebP output. Bound
  transformed bytes to the existing intake reservation, rejecting growth rather
  than inventing an unapproved extra reservation. Final settlement must consume
  an existing sufficient reservation; it cannot create a missing ledger.
- Lock the upload session with `FOR UPDATE NOWAIT` before R2/Images work, keeping
  the same transaction through review persistence. A contender retries before
  decoding; terminal sessions perform only idempotent post-commit cleanup.
- Check current account status before external processing. Account deletion
  marks pending/queued standard sessions expired before purging media, so it
  waits for an in-flight session transaction; deletion cleanup also removes
  quarantine objects and each session's possible private derivative.
- Settle expiry/rejection only when the existing reservation is sufficient;
  otherwise the transaction fails instead of masking quota drift or underflow.
  Private bucket cleanup remains retryable after durable terminal state.
- Store derivatives conditionally with source-bound private metadata. Retry
  verifies and reuses existing bytes without another Images call. Unknown,
  mismatched or older unbound derivatives remain blocked, never overwritten.
- Do not call metadata-only image inference. Persist explicit unavailable/review
  evidence using the existing contract, without claiming a model was executed.
- Preserve retry on disabled processing and on failed quarantine deletion.
  Activity now says private review is pending; rejection activity no longer
  claims safety analysis or completed cleanup before deletion succeeds.

Signature matching is not complete file validation. Images decoding remains
necessary, and byte bounds do not establish decoder memory/CPU/time limits,
orientation normalization, metadata stripping or detector accuracy.

## Composer contract

There is no enabled public-image capability. Keep the attachment/posting control
unavailable. Do not derive eligibility from upload status, the approved bucket,
an evaluation score, a user's declaration or a private-alpha result. Continue
using the existing text-post contract independently.

| Existing response | Meaning for the UI |
| --- | --- |
| `404 feature_disabled`, feature `media_uploads` | Ordinary upload/finalization is unavailable; do not offer a working image-post path. |
| `401 authentication_required` | Authentication is required; no upload capability has been granted. |
| Upload-session `201` | Private PUT capability only. Keep its URL and object key private; do not use them in a post/feed. |
| Finalization `200`, `status: queued`, `uploadSessionId`, `eventId` | Integrity checks passed and durable review work was queued. This is neither a media-object ID nor publication approval. |
| `400 media_size_exceeded`, `unsupported_media_type`, `checksum_required` | Invalid metadata or unsupported bytes; preserve the draft and explain that upload did not succeed. |
| `400 upload_session_invalid` | Missing, wrong-owner/purpose, terminal or expired session. No public eligibility; do not loop finalization. |
| `400 upload_object_invalid` / `upload_checksum_invalid` | Missing or mismatched private bytes. A rejection write can instead fail with the generic error below under current grants. |
| `500 request_failed` / `503` dependency configuration errors | No successful finalization receipt. Use the existing idempotency contract; do not claim publication, rejection cleanup or successful moderation. |

There is no new status/read URL or media-ID response in this PR. Historic upload
status `approved` and activity event type `content.media_upload_approved` remain
for compatibility, while the associated object is `review`. The activity text,
result `pending` and metadata `under_review` make that distinction explicit.

## Validation and evidence limits

The dedicated suites invoke the actual Public API upload functions and Jobs
queue entrypoint. A test-only export exposes upload functions; the production
router is used for disabled/guest checks. Workerd runs against local Miniflare
R2. Images is a deterministic protocol fixture and all external requests are
denied. The signature fixtures deliberately are not detector accuracy samples.

The PostgreSQL suite creates a uniquely named database through the existing
loopback-only publication control target, applies the unchanged canonical PG17
baseline/roles, and first verifies both canonical `42501` denials. It then
applies only the two proposed column-level grants to that unique disposable
database, exercises actual handler SQL as `lythaus_runtime` / `lythaus_jobs`,
and revokes the grants before dropping the database. The proposal is not applied
to canonical files or a hosted database. This proves a local candidate-grant
path, not production acceptance. The transport shim uses explicit local
transactions; it does not certify the production pg/Hyperdrive connection or
cleanup wrapper, hosted R2, Images or Queues.

Commands:

```sh
node --experimental-strip-types --test --test-concurrency=1 \
  packages/media/tests/standard-upload.test.mjs \
  packages/media/tests/standard-upload.workerd.mjs \
  packages/media/tests/standard-upload.postgres.mjs
npm run typecheck:native
npm run test:product-integrity-runtime
```

Set `PLANETSCALE_PG17_TEST_DATABASE_URL` to the existing disposable loopback
`lythaus_auth_test_post_control` database. The dedicated test fails if the target
is absent or unsafe. CI registers the same three suites. Current unit/Workerd
coverage includes 25 tests; PG17 includes 21 tests. Canonical expected-denial
tests are reported separately from the candidate-grant handler journey; neither
constitutes hosted production acceptance.

Current local results on this branch: dedicated unit/Workerd and PG17 suites
**46/46**; product-integrity checks **22/22**; homepage protection **30/30**;
marketing **84/84**; attachment/preparation/product-policy **55/55**; native
architecture/runtime **376/376**. Native typecheck, workflow action pins,
canonical migration manifest and whitespace checks pass. The first native run
could not write npm's default cache; rerunning with a writable `/tmp` cache
passed the full suite. The marketing workspace was restored using its unchanged
lockfile before its full-suite pass. Hosted exact-head CI and independent review
remain separate gates.

## Remaining release blockers

1. **Verified canonical-role failures:** runtime rejection updates
   `media.storage_ledger.bytes_rejected`, which the canonical runtime grant does
   not permit; PostgreSQL returns `42501` and rolls the rejection back. Jobs
   cannot insert `media.ownership`; `42501` rolls review persistence back and
   queue delivery retries. The tests preserve and report these denials. Any
   separately authorized grant/capability repair and hosted reconciliation
   requires its own review; no grant is changed here.
2. **Detection/safety:** pixel-bound qualified/calibrated evidence, separate
   safety and authenticity results, durable current-revision persistence and
   applicable acceptance/approval remain missing. The prior metadata-only image
   evaluation is now replaced by explicit unavailable evidence; it did not fill
   that gap. No new threshold, provider request or spend is added.
3. **Byte/privacy acceptance:** source signature alone is incomplete. Full
   decoder behavior, orientation and GPS/EXIF removal, presigned PUT ingress
   bounds/replay, original retention, abandoned pending-session sweeping and
   bounded storage/decoder waits still need validation and approved contracts.
   Rejection cleanup retries after a durable terminal state locally; canonical
   `bytes_rejected` denial still blocks production-role rejection settlement.
4. **Deletion/concurrency:** standard-session expiry and account-deletion
   fencing are implemented and covered with local session-lock/race tests, but
   the full hosted account-delete/hold/retention workflow and restart acceptance
   remain open. It retains a DB transaction across external Images work; hosted
   timeout/connection behavior needs acceptance. A private derivative written
   before DB commit can remain orphaned after connection or process loss;
   terminal retry and account-deletion cleanup remove known quarantine/derivative
   keys, but no reconciliation sweep or aggregate physical R2 quota bound is
   certified. Hosted account-delete/retention restart acceptance, canonical
   queue-source event binding and attachment tombstones remain blocked.
   If the transaction is lost before a derivative is stored, Images work can
   repeat. Conditional PUT prevents overwrite but cannot supply exactly-once
   external execution. The tests demonstrate this boundary rather than hiding
   it. Physical orphan storage is not a certified aggregate-quota bound.
5. **Publication integration:** unresolved attachment policy, unapplied relation,
   authoritative evidence binding, transaction/revision locks, moderator/appeal
   authority, private reads, feed projection and complete global publishing
   acceptance must be completed before a separately approved activation.

No public image posting, production authentication, detector accuracy, hosted
service acceptance, manifest certification or release readiness is claimed.
