# Standard image upload integrity and posting handoff

Inspected base: `489aef297ff0b1a40744504594122c9ebc43930d` on `main`.
This is source preparation for independent review, not a posting release.
Public image posting remains blocked. No provider calls, deployment, merge,
feature activation, database schema/grant change, credential change or new
resource is part of this work. Model output does not prove human authorship.

## Ownership and existing work

Open PRs were inspected before editing. #989 owns the ordinary post-review
transaction/fence and publication PG17 runner; #886 owns private alpha hardening;
#1000 updates moderation evaluation evidence; #1023 touches composer-adjacent
Flutter release gates. Their implementation sections remain untouched.

This lane owns `packages/media/src/standard-upload.ts`, its four test/fixture
files, the standard upload functions in Public API `src/index.ts`, and the
ordinary `processMediaUpload` function in Jobs `src/index.ts`. The only shared
test maintenance is the existing byte-boundary assertion in
`scripts/tests/product-integrity-runtime-invariants.test.mjs` and one additive
CI step in `.github/workflows/ci.yml`. No Flutter or generated SDK files change.

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
Jobs `AUTHENTICITY_AI_ENABLED` is true in source, so enabling media processing
would also make the existing generic evaluator reachable. This work does not
change any of those values. Live configuration and grants were not inspected;
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
- Check pending-session expiry with database time both before reading and in
  the final state transition. Revalidate owner, standard purpose and recorded
  source metadata in that transition.
- Recheck checksum after queue delay, isolate standard uploads from private
  alpha/beta purposes, bound transformed output, and reject invalid dimensions
  or non-WebP output before storing a derivative.
- Lock/revalidate the upload session inside the review persistence transaction.
  A session already expired/rejected at that lock cannot create new review
  records or settle the ledger. A concurrent completed upload adds no repeated
  database effects.
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
baseline/roles, runs real SQL as `lythaus_runtime` / `lythaus_jobs`, and drops its
database. It adds no grants, proposal schema or privileged runtime fallback.
Its transport shim uses explicit local transactions; it does not certify the
production pg/Hyperdrive connection/cleanup wrapper, real R2, Images or Queues.

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
is absent or unsafe. CI registers the same three suites. Local unit/Workerd
coverage includes 20 tests; PG17 includes seven scenario groups plus their
parent test. Passing expected-denial tests is **not** a successful image journey.

Local results on the review source: combined dedicated suites **28/28** pass;
existing attachment byte-boundary/preparation and product-policy suites **55/55**;
product-integrity checks **21/21**; native architecture/runtime **376/376**.
Typechecking, workflow action pins, provider/naming hygiene, canonical migration
manifest validation and whitespace checks pass. The first native run had one
npm default-cache filesystem failure (375/376); a writable `/tmp` npm-cache
rerun passed all 376 with no source/test weakening. Hosted CI and independent
review remain separate from these local results.

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
   applicable acceptance/approval remain missing. Generic metadata evaluation
   cannot fill that gap. No new threshold, provider request or spend is added.
3. **Byte/privacy acceptance:** source signature alone is incomplete. Full
   decoder behavior, orientation and GPS/EXIF removal, presigned PUT ingress
   bounds/replay, original retention, rejected/abandoned cleanup and bounded
   storage/decoder waits still need validation and approved contracts.
4. **Deletion/concurrency:** the new session lock rejects a committed expired
   state but is not an account/deletion fence. A private derivative is written
   before the DB transaction and can remain orphaned after failure or deletion.
   It is not automatically deleted on uncertain commit because another attempt
   may have committed it. Canonical queue-source event binding, current-account
   fencing, full account-delete/hold/retention races, cleanup
   reconciliation and attachment tombstones remain blocked.
5. **Publication integration:** unresolved attachment policy, unapplied relation,
   authoritative evidence binding, transaction/revision locks, moderator/appeal
   authority, private reads, feed projection and complete global publishing
   acceptance must be completed before a separately approved activation.

No public image posting, production authentication, detector accuracy, hosted
service acceptance, manifest certification or release readiness is claimed.
