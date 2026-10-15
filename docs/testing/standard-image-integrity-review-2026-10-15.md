# Standard image integrity: revision 3 review packet

Parent independent review of PR #1026 at
`fecdd6f6b19ad5ea9dd17afa70e420e6deb147b8` identified three blockers: the homepage
guard pins both changed Worker blobs; a derivative can exceed its intake byte
reservation; and concurrent/reclaimed Jobs deliveries can perform external work
and overwrite derivatives before the old final session lock. This revision
reconciles exact-source pins to proposed Worker bytes on current main, adds
expiry/quota settlement and deletion cleanup coverage, and exercises the success
path only under temporary candidate grants in a disposable local PG17 database.
Public image posting remains disabled and unaccepted; canonical role denials
remain deliberately visible.

## Exact-source freeze reconciliation

The parent explicitly requested reconciliation using the existing exact-source
protocol documented in
[Jobs proposal independent-review follow-up](jobs-reputation-session-proposal-20261013.md#independent-review-follow-up)
and [homepage protection](../design-system/homepage-protection.md#protected-dependency-graph).
This revision retains the two baseline revision IDs, ten-path diagnostic
allocation, exact package-command suffix, unrelated source/dependency freezes,
homepage bytes, screenshot baselines and tolerances. Only these two literal
allocation pins change:

| File | Previous allocated blob | Proposed source blob |
| --- | --- | --- |
| `apps/lythaus-jobs/src/index.ts` | `8a6487ab099287f151fc8594b3b9ff846a9226b7` | `822d5167d27e942077d064802617d6cca0ab006c` |
| `apps/lythaus-public-api/src/index.ts` | `7a941be1765e82b5cbf00294b114952ab6ea27a1` | `bda1a55ca86df93196aa00c64a32677f682cd603` |

The Public API source is unchanged from the first PR head. Jobs edits remain
confined to media processing, its imports and former local image validators;
diagnostic routes, authentication, service bindings and post-review dispatch are
unchanged. The other eight diagnostic source/test blobs are unchanged.
Both Worker entrypoint suffixes, from `export default` through EOF, are
byte-identical to main `53ac0f4ece621605762cde8d9a42f7dde8362ca9`. Their SHA-256
values are `f614c1d1709999f3092feff7abd66abce99e85eb29bd668a787dbee8dece941f`
(Jobs) and `759a2080deb91ba7f78dc1287899a121cf785fce2ea4879584d9a8251041721d`
(Public API).

The existing mutated/historical/unrelated-path and malformed-command negative
controls are retained. Added controls reject both main Worker blobs and the
superseded first-PR Jobs blob, and reject adding the new media helper or homepage
to the diagnostic allocation. Expected pins are literal reviewed-source
candidates, not hashes inferred from current HEAD at assertion time. Before
reconciliation, the unchanged guard reproduced its pin failures; independent
review of this proposed allocation is still required before merge.

## Quota accounting

The derivative reader is capped at the session's existing reserved input bytes.
Output growth yields `MEDIA_DERIVATIVE_EXCEEDS_RESERVATION`, commits a rejection
and releases that reservation once, then attempts quarantine cleanup. It never
stores the oversized derivative or invokes inference. This can reject a valid
small compressed image whose WebP output is larger; accepting growth would need
an approved additional-reservation contract, not an inferred higher quota.

Successful settlement uses an UPDATE requiring enough existing reserved bytes,
in the same transaction as review persistence and session completion. Missing
ledger/reservation fails and rolls back instead of creating free capacity.
Canonical runtime `bytes_rejected` update and Jobs `media.ownership` insert are
denied. The PG17 suite preserves both `42501` assertions, then applies the two
narrow candidate grants only inside its uniquely named disposable database to
exercise the successful private-review path. A `finally` block revokes them
before database teardown. This is not canonical-role or hosted acceptance. The
exact unapplied patch proposal is
`database/planetscale/proposals/media_standard_upload_privileges.patch.proposal`.

## Processing and immutable derivatives

Jobs acquires `FOR UPDATE NOWAIT` on the standard upload session before private
R2 reads or Images calls. Competing or reclaimed consumers retry on lock conflict
without decoding. Source reads, transformation, final ledger settlement and
review persistence use that one transaction. Rejection cleanup happens only
after its transaction commits. This changes no schema, grant or queue policy.

A derivative is written using conditional R2 creation (`etagDoesNotMatch: '*'`).
Its private metadata binds transformation version, source digest, source size,
source MIME, output digest and dimensions. A retry verifies the exact stored
bytes and metadata before reusing them. A conditional-write loser reads and
verifies the winner rather than overwriting it or recording its own different
digest. Unknown legacy or mismatched objects fail closed. These receipts contain
no detection, safety, publication or human-authorship verdict.

Ordinary media no longer sends metadata to the generic image evaluator. Its
existing review contract now records `modelId: not-executed` and explicit
unavailable evidence. Even an enabled AI flag causes no ordinary-image model or
cost-budget call. Other content/evaluation adapters and flags remain unchanged.

## Expiry, quota and deletion boundaries

Cleanup ownership is coordinated with PR #1022: that lane owns the generic
database transaction cleanup wrapper and reputation subject locks. This media
lane leaves `packages/db/src/index.ts` unchanged, uses the existing Jobs
transaction call plus the upload-session row lock, and deletes quarantine or
derivative bytes only after a durable terminal result. An ambiguous DB outcome
retains the private derivative for queue retry/reuse; it does not guess that a
commit failed and delete a potentially committed object. The media session fence
and purge are separate named steps in `AccountDeleteWorkflow`, and the CI tests
are separate additive registrations.

Public API finalization settles an already-expired pending session to `expired`
and releases its existing reservation in the same transaction. Rejection and
expiry updates require sufficient reserved bytes; drift returns a retryable
failure rather than underflowing. Cleanup occurs only after the terminal state
commits. Jobs checks expiry with database time before byte work, after source
validation, after transformation, and in the final approved-state update. Queue
expiry settles the session and reservation before post-commit cleanup of both
private buckets. Inactive or deleted accounts are checked before external work.

Account deletion marks the user deleted, fences pending/queued standard sessions
before media purge, and removes quarantine plus each deterministic possible
approved derivative key. The worker holds the session lock through its DB
transaction, so deletion waits for a current attempt before purge. Local tests
cover expired-finalization reservation release, expiry at finalization, queue
expiry cleanup retries in both buckets, inactive-account rejection before
Images, and deletion fence ordering. Full hosted Workflow restart, retention
and cleanup reconciliation remain unaccepted.

## Controlled real PostgreSQL concurrency evidence

Tests use actual handler/Queue code in Workerd, local R2, the unchanged canonical
PG17 baseline and roles, and deterministic effect barriers. No timing sleep is
used to assume that a race occurred. Images is a protocol fixture, never a live
provider. The local database transport remains a shim; production Hyperdrive
cleanup and hosted service behavior are not certified.

| Race/failure | Verified result |
| --- | --- |
| Different event IDs for one upload; first paused in Images | Second gets actual PG17 `55P03` on the session and retries with zero Images calls; first transforms once and settles rejection once. |
| Same event reclaimed by aging its inbox claim while first is paused | Reclaimed delivery reaches the session lock, gets `55P03`, and cannot repeat Images work; redelivery after rejection is idempotent. |
| DB ownership permission failure after private derivative storage | Canonical `42501` rolls back review persistence. Retry reuses verified stored bytes with zero repeated Images/PUT calls. |
| Backend terminated after health check while first PUT is paused; second worker proceeds | Overlap is real. One conditional PUT stores the winner, stale PUT returns conflict, bytes remain the winner's exact bytes, and neither failed transaction creates review rows. |
| Output exceeds the input reservation | Under the candidate role grant, rejection commits once, no derivative is stored, reserved/approved bytes remain bounded, no model call occurs. Under canonical roles, the expected `bytes_rejected` denial rolls that transaction back. |
| Legacy object without bound metadata | Retry fails closed before decoding or overwrite. |

The successful handler path runs with only the two exact candidate grants inside
a disposable PostgreSQL database. Canonical denial tests run first and remain
the production-role evidence. The lost-transaction control intentionally shows
that Images can execute twice
when its DB lock is lost before a durable derivative exists. No row lock can
guarantee exactly-once external work after connection/process loss. That requires
an approved durable attempt/ambiguity design and provider acceptance; it is not
invented in existing fields here. The current fix prevents overlap while the
lock is held, reuses persisted output and prevents overwrites, not all possible
duplicate decoder spend. A lost transaction or concurrent deletion may also
leave a private orphan. This is not an aggregate physical R2 quota guarantee.

Holding a DB transaction across Images introduces a connection-lifetime and
timeout acceptance requirement. `checkTransactionHealth` probes before further
effects and persistence, but cannot make R2 and PostgreSQL atomic. Canonical
grants, hosted account-delete/retention workflow restarts, artifact cleanup,
qualified pixel-bound safety/authenticity evidence, post attachments and
publication acceptance remain blockers. No live diagnostic, provider call,
credentials/security setting or persistent database grant/schema, activation,
merge or deployment changed. Candidate grants were temporary, local to the
throwaway database, and revoked before database teardown.

## Validation result

- Dedicated unit/Workerd-local-R2 and PG17 suites: **46/46** pass, including
  canonical denial cases and the temporary candidate-grant success path.
- Product-integrity checks: **22/22**, including the account-deletion fence
  ordering guard. Homepage protection: **30/30**; marketing: **84/84**;
  attachment/preparation/product-policy: **55/55**; native architecture/runtime:
  **376/376**. Native typecheck, workflow action pins, canonical migration
  manifest and whitespace checks pass for this proposed head. The native suite
  required a writable `/tmp` npm cache, and the marketing app dependencies were
  restored from its unchanged lockfile before its full-suite pass.

These are local results for the exact proposed Worker blobs above. The original
PR head's checks cannot certify the updated branch. Hosted CI for the pushed
exact SHA and independent review of the exact-source allocation remain required
before any coordinated merge/deployment.

## Remaining acceptance gaps

- No qualified pixel-based safety/authenticity detector or detector calibration
  exists for this path. Stored evidence remains unavailable/manual review;
  metadata and checksums are not image-pixel detection. Media flags stay false.
- Canonical roles still deny the two required writes. No canonical grant was
  changed; the patch proposal is an inert candidate for separate security review.
- Presigned PUT ingress-size and replay acceptance, full decoder resource/time
  bounds, orientation normalization, EXIF/GPS removal, and abandoned pending
  upload sweeping are not established. Without finalization or a cleanup event,
  an abandoned reservation can remain until policy-approved cleanup.
- Hosted Cloudflare Images, R2, Queues, production Hyperdrive transaction-loss
  behavior, account-deletion/retention Workflow restarts, publication attachment
  rules and end-to-end visibility policy remain unaccepted. R2 and PostgreSQL
  are not atomic; duplicate Images work after loss before durable derivative and
  orphaned private bytes remain possible. Physical aggregate R2 quota is not
  certified.
- No public posting, detector inference, activation, merge or deployment is
  claimed. Review remains unavailable and the ordinary media flags remain
  disabled.
