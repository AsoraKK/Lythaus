# Standard image upload integrity and posting handoff

Inspected original base: `53ac0f4ece621605762cde8d9a42f7dde8362ca9` on `main`.
Integrated current `main` tip `c47ecdbf35d3dc3e7e8305f6a1c2acd49ff87dbb`, which
contains merged PR #1022.
This is source preparation for independent review, not a posting release.
Public image posting remains blocked. No provider calls, deployment, merge,
feature activation, hosted schema/grant change, credential change or new
resource is part of this work. Migration `0021_media_quarantine_cleanup.sql` is
pending review and has not been applied to a hosted database. The two narrow
grant candidates are exercised only in the uniquely named disposable PG17 test
database and revoked before teardown. Model output does not prove human authorship.

## Ownership and existing work

PR ownership was inspected before editing. #989 owns the ordinary post-review
transaction/fence and publication PG17 runner; #886 owns private alpha hardening;
#1000 updates moderation evaluation evidence; merged PR #1022 owns reputation transaction
cleanup/lock work, including the shared database transaction wrapper; #1023
touches composer-adjacent Flutter release gates. This lane leaves #1022's
transaction wrapper files unchanged. It adds a separate named standard-media
session fence and purge path in `AccountDeleteWorkflow`; the media queue holds
its existing per-session lock and deletes private bytes only after a terminal
DB result commits. The PRs have separate steps and SQL scopes in the shared Jobs
entrypoint and additive CI workflow registration.

PR #1022 merged to main as `c47ecdbf35d3dc3e7e8305f6a1c2acd49ff87dbb`. This
branch now includes that base update and preserves its Jobs lock/receipt logic,
account-deletion ordering, and exact-source protection checks. The merge
conflict was limited to the Jobs/Public API pin values; they were recomputed
from the combined source blobs and verified by the homepage protection suite.
This lane adds only the separate standard-session scheduled reconciler and its
migration for cleanup. The reconciler retries session-bound quarantine cleanup;
it does not replace account deletion or change its transaction semantics.
Apply migration `0021` before Worker code reads its marker, and rerun the
combined exact-head suite before any coordinated deployment. Media flags remain
disabled.

This lane owns `packages/media/src/standard-upload.ts`, its four test/fixture
files, the standard upload functions in Public API `src/index.ts`, and the
ordinary `processMediaUpload` function in Jobs `src/index.ts`. The only shared
test maintenance is the existing byte-boundary assertion and new media-session
fence ordering assertion in `scripts/tests/product-integrity-runtime-invariants.test.mjs`
and one additive CI step in `.github/workflows/ci.yml`. Revision 3 also reconciles the two exact
Worker blob pins in `apps/marketing-site/tests/homepage-protection.test.mjs`,
with all existing negative controls preserved. This contract change bumps the
OpenAPI major version to `v12` and regenerates only the Dart API client models
and media operations; no Flutter UI code changes. The [revision 3 review packet](standard-image-integrity-review-2026-10-15.md)
records the independent findings, exact blob identities and true race evidence.
This update also owns migration `0021`, its manifest and schema postconditions,
the new authenticated upload endpoint contract and bundled OpenAPI output, and
the lifecycle, retry and still-valid-URL replay assertions in the PG17/Workerd
fixtures.

## Verified original media path on the inspected base

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
- New sessions return an authenticated Worker upload route instead of a
  reusable R2 presigned PUT. The Worker reads at most the smaller of the
  reserved byte count and the 10 MiB engineering cap, verifies exact size,
  checksum and MIME before R2, and conditionally creates the quarantine object.
  A lost SQL transition can retry against the same immutable bytes. Metadata
  and signatures establish byte identity only; they do not inspect image
  pixels or produce detector evidence.
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
- Migration `0021` adds a bounded lookup index and a private-quarantine deletion
  marker. The existing 15-minute Jobs schedule expires pending sessions and
  releases each logical reservation once. Terminal sessions are swept only
  after expiry plus a 15-minute grace, covering legacy 10-minute R2 URLs that
  were issued before the Worker route. R2-delete failure and marker-transaction
  loss both retry idempotently. The maximum cleanup delay is one schedule
  interval beyond that grace.
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
| Upload-session `201` | Authenticated, session-bound Worker route only. It grants no object key or public URL; do not treat successful storage as a post/feed attachment. |
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

The canonical release schema identity now derives from the approved migration
manifest and requires `0021_media_quarantine_cleanup.sql`. Worker configs and
generated types, deploy materializers, read-only production schema verification,
runtime probes, and sanitized provider evidence use that same required version.
The readiness verifier requires the exact migration prefix and fingerprint;
Worker readiness remains blocked until the hosted schema matches. This only
updates source-side checks. It does not apply migration 0021 or alter hosted
schema, roles, grants, credentials or Worker state.

The dedicated suites invoke the actual Public API upload functions and Jobs
queue entrypoint. A test-only export exposes upload functions; the production
router is used for disabled/guest checks. Workerd runs against local Miniflare
R2. Images is a deterministic protocol fixture and all external requests are
denied. The signature fixtures deliberately are not detector accuracy samples.
New route tests verify byte limits before R2, MIME/checksum rejection, immutable
conditional create, transaction-loss retry, and replays through a still-valid
URL after account deletion and processing.

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

Commands verified on the merged tree:

```sh
node --experimental-strip-types --test --test-concurrency=1 packages/media/tests/standard-upload.test.mjs packages/media/tests/standard-upload.workerd.mjs
PLANETSCALE_PG17_TEST_DATABASE_URL=<loopback disposable PG17 control database> \
  node --experimental-strip-types --test --test-concurrency=1 packages/media/tests/standard-upload.postgres.mjs
npm run test:planetscale-production-migrations
npm run test:reputation:pg17
node --test apps/marketing-site/tests/homepage-protection.test.mjs
npm run test:database-identity
npm run validate:native-workers
npm run openapi:gen:dart
npm run openapi:test:contract
```

Local results on the merged tree: unit/Workerd **28/28**, disposable PG17 **24/24**
on PostgreSQL 17.11 with migrations `0000`–`0021`, migration/schema-verifier
tests **23/23**, product-integrity runtime **22/22**, and native architecture
**376/376**. Native typecheck passes. The merged #1022 synthetic managed-owner
PG17 cleanup/lifecycle runner passes, as does homepage protection **30/30**
with combined source pins. The release-schema identity contract passes **7/7**;
runtime probe scenarios pass **65/65**; combined production-release and provider
audit contracts pass **68/68**; public waitlist cutover checks pass **8/8**; and
the #1022 synthetic PG17 cleanup/receipt runner passes **104/104**. Native Worker
config validation checks four configs and three generated type files, and every
workflow action remains pinned to an immutable commit. The PostgreSQL media suite confirms the canonical
`42501` failures before temporarily applying the two proposed column grants in
its disposable database; it revokes both grants before teardown. The new schema
remains unapplied to any hosted database. Hosted exact-head CI and independent
review remain separate gates; the local results do not replace either gate.
The local OpenAPI Dart-client validator's unit checks pass, but its final
`dart pub get` step cannot run in this executor because the Dart executable is
not installed. Exact-head hosted OpenAPI CI includes Flutter setup and must
complete the generated-client validation.

## Remaining release blockers

1. **Verified canonical-role failures:** runtime rejection updates
   `media.storage_ledger.bytes_rejected`, which the canonical runtime grant does
   not permit; PostgreSQL returns `42501` and rolls the rejection back. Jobs
   cannot insert `media.ownership`; `42501` rolls review persistence back and
   queue delivery retries. The tests preserve and report these denials. Any
   separately authorized grant/capability repair and hosted reconciliation
   requires its own review; no grant is changed here. The exact narrow proposal
   is `GRANT UPDATE (bytes_rejected) ON media.storage_ledger TO lythaus_runtime;`
   and `GRANT INSERT (object_id, owner_id) ON media.ownership TO lythaus_jobs;`.
   Both statements have only been applied temporarily in the isolated PG17 test
   database and were revoked before teardown.
2. **Detection/safety:** pixel-bound qualified/calibrated evidence, separate
   safety and authenticity results, durable current-revision persistence and
   applicable acceptance/approval remain missing. The prior metadata-only image
   evaluation is now replaced by explicit unavailable evidence; it did not fill
   that gap. No new threshold, provider request or spend is added.
3. **Byte/privacy acceptance:** source signature alone is incomplete. Full
   decoder behavior, orientation and GPS/EXIF removal, original retention, and
   bounded storage/decoder waits still need validation and approved contracts.
   New sessions no longer use R2 presigned PUTs; already-issued 10-minute URLs
   cannot be revoked, so terminal quarantine deletion waits until 15 minutes
   after session expiry and the existing 15-minute sweep runs. This handles
   replay of legacy URLs but does not certify hosted R2 behavior or aggregate
   physical-storage bounds. Canonical `bytes_rejected` denial still blocks
   production-role rejection settlement.
4. **Deletion/concurrency:** standard-session expiry and account-deletion
   fencing are implemented and covered with local session-lock/race tests, but
   the full hosted account-delete/hold/retention workflow and restart acceptance
   remain open. It retains a DB transaction across external Images work; hosted
   timeout/connection behavior needs acceptance. A private derivative written
   before DB commit can remain orphaned after connection or process loss; the
   new janitor reconciles source quarantine only. Hosted account-delete/retention
   restart acceptance, derivative-orphan reconciliation, canonical queue-source
   event binding and attachment tombstones remain blocked. If the transaction is
   lost before a derivative is stored, Images work can repeat. Conditional PUT
   prevents overwrite but cannot supply exactly-once external execution. The
   tests demonstrate this boundary rather than hiding
   it. Physical orphan storage is not a certified aggregate-quota bound.
5. **Publication integration:** unresolved attachment policy, unapplied relation,
   authoritative evidence binding, transaction/revision locks, moderator/appeal
   authority, private reads, feed projection and complete global publishing
   acceptance must be completed before a separately approved activation.

No public image posting, production authentication, detector accuracy, hosted
service acceptance, manifest certification or release readiness is claimed.
