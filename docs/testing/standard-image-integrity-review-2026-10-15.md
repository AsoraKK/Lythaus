# Standard image integrity: revision 2 review packet

Parent independent review of PR #1026 at
`fecdd6f6b19ad5ea9dd17afa70e420e6deb147b8` identified three blockers: the homepage
guard pins both changed Worker blobs; a derivative can exceed its intake byte
reservation; and concurrent/reclaimed Jobs deliveries can perform external work
and overwrite derivatives before the old final session lock. This revision
addresses the bounded source fixes. Public image posting remains disabled and
unaccepted; canonical role denials remain deliberately visible.

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
| `apps/lythaus-jobs/src/index.ts` | `8a6487ab099287f151fc8594b3b9ff846a9226b7` | `79b96b2a830b4c0df3231a6c78d4ac4e59534db1` |
| `apps/lythaus-public-api/src/index.ts` | `7a941be1765e82b5cbf00294b114952ab6ea27a1` | `39b25edcffabf06d64caf12b5301cb515e9662d9` |

The Public API source is unchanged from the first PR head. Jobs edits remain
confined to media processing, its imports and former local image validators;
diagnostic routes, authentication, service bindings and post-review dispatch are
unchanged. The other eight diagnostic source/test blobs are unchanged.
Both Worker entrypoint suffixes, from `export default` through EOF, are
byte-identical to main `489aef297ff0b1a40744504594122c9ebc43930d`. Their SHA-256
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
The unchanged Jobs ownership grant currently blocks the successful PG17 path
before settlement; the complete success path is tested only with the database
protocol fixture and is not claimed accepted under canonical roles.

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
| Output exceeds the input reservation | Rejection commits once, no derivative is stored, reserved/approved bytes remain bounded, no model call occurs. |
| Legacy object without bound metadata | Retry fails closed before decoding or overwrite. |

The lost-transaction control intentionally shows that Images can execute twice
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
grants, account-delete/retention fences, artifact cleanup, qualified pixel-bound
safety/authenticity evidence, post attachments and publication acceptance remain
blockers. No live diagnostic, provider call, credentials/security setting,
database grant/schema, activation, merge or deployment changed.

## Validation result

- Dedicated unit, Workerd/local R2 and canonical PG17 suites: **36/36** pass,
  including the controlled races above. The final metadata-size unit assertion
  was sharpened and its seven-test unit suite rerun successfully.
- Homepage protection: **30/30** pass, including all retained negatives and the
  added superseded-source/scope negatives. The pre-reconciliation run reproduced
  three allocation failures in the unchanged 29-test guard.
- Marketing suite: **84/84** pass after a clean install from its unchanged
  lockfile. The initial nine cache-policy failures were a stale local dependency
  installation, not an accepted security-test exception.
- Existing attachment/preparation/product-policy tests: **55/55**;
  product-integrity checks: **21/21**; native architecture/runtime: **376/376**.
- Native typecheck, action pins, provider/naming hygiene, canonical migration
  manifest and whitespace checks pass.

These are local results for the exact proposed Worker blobs above. CI on the
superseded PR head cannot certify this revision. Hosted CI and independent
review of the exact-source allocation remain required before merge.
