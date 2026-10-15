# Transaction cleanup revision 3: source preparation only

Continues draft PR #1022 from
`da612c489b99ad540bbb7abca8d0d8b348c17e16`. All SQL remains inert, all runtime
patches remain unapplied, and no database execution, grants, credentials, security
settings, provider diagnostic, feature activation, merge or deployment is authorized.

## Confirmed blocker and preserved evidence

The actual `packages/db/src/index.ts` transaction wrapper catches callback failure,
suppresses rejection from `client.query('ROLLBACK')`, and rethrows the callback
error. Its `finally` awaits `client.end()`, which may also reject or stall.
The historical v2 Queue helper treats a genuine deleted-subject error alone as
terminal. Consequently a rejected ROLLBACK can lead to false terminal handling.
The old mock's hand-written rollback/release sequence did not test this wrapper.

The new defect control executes the actual full DB module with a fake `pg` driver
and the retained v2 helper: failed rollback still yields `deleted`. That is a
known unsafe control, never acceptance. Original runtime source, v1/v2 SQL,
guarded rollback, typed caller patch, privacy patch and old Queue proposal bytes
remain unchanged. Their exact historical hashes/lengths are recorded and tested
in `packages/db/tests/fixtures/reputation-transaction-v3-baseline.json` against
the baseline head above. All strict role/audience/fingerprint protections remain.

## Inert repair

`reputation_subject_lock.transaction.v3.patch.proposal` adds an opt-in
`transactionWithVerifiedFailureCleanup` entry point that calls the same actual
`transaction` wrapper with a module-private token. It does not duplicate the
transaction protocol. Default legacy callers retain existing behavior; the new
Queue proposal uses only the opt-in entry point. This is preparation for the
reputation path, not an activated global transaction fix.

The opt-in mode issues a fresh private receipt only when all conditions hold:

1. BEGIN completed with its expected command tag and the callback failed.
2. No COMMIT was attempted.
3. ROLLBACK fulfilled with one result whose command is exactly `ROLLBACK`.
4. `client.end()` fulfilled.
5. No client connection error was observed through cleanup completion.

The receipt is a new generic Error registered in a private WeakMap, with a frozen
record referring to the original callback error. It is not a marker attached to
the callback error. `verifiedTransactionFailureCause` recognizes only receipts
created by this invocation path. Plain/forged objects, re-used deleted errors and
replayed old receipts cannot supply proof for a new failed cleanup attempt.
Original errors are not copied into public cause/message fields on the receipt.

`reputation_subject_lock.queue.v3.patch.proposal` replaces the unsafe v2 helper.
The helper owns the binding/work transaction invocation; it no longer accepts an
arbitrary promise-producing closure that could bypass verified mode. It returns
`deleted` only for a private verified-failure receipt whose cause is the genuine
`ReputationSubjectDeletedError`. Ordinary callback errors continue as failures.
Other consumer stages and the existing outer inbox/ack path are unchanged in
the proposal. There is no independent early ack and no blanket error catch.

| Observed outcome | Proposed result |
| --- | --- |
| Deleted callback + exact rollback tag + fulfilled close + healthy connection | Private receipt; helper may return `deleted` |
| ROLLBACK rejects or has missing/incorrect/array result | Cleanup outcome unknown; failure propagates |
| Connection error during connect, callback, rollback or close | No terminal receipt; failure propagates |
| Close rejects, including with a genuine deleted error | No terminal receipt; cleanup outcome unknown |
| Rollback or close remains unresolved | Operation remains pending; no terminal result or receipt |
| COMMIT rejects or reports an unexpected result/tag | No rollback receipt; outcome unknown; reconcile before retry |
| Existing `DatabaseCommitUncertainError` plus close failure | Existing commit uncertainty type is retained |
| Confirmed COMMIT plus close failure | Neither processed nor deleted success is returned |
| Confirmed COMMIT and fulfilled close without observed connection fault | `processed` |

No new cleanup deadline, timer, security setting or production threshold is
invented. The stall tests hold and release controlled fake promises. This closes
false terminal classification while stalled; it does **not** establish bounded
progress or recovery after a Worker execution limit. Dispatcher claim recovery,
Queue retry/ack cancellation and lifecycle restart behavior remain gates.
The receipt attests driver-observed tags/close completion, not independently
observed backend termination or production rollback effects.

## Tests run

```sh
node --experimental-strip-types --test --test-concurrency=1 \
  packages/db/tests/reputation-lock-candidate.test.mjs \
  packages/db/tests/reputation-lock-identity.test.mjs \
  packages/db/tests/reputation-transaction-cleanup.test.mjs \
  packages/db/tests/reputation-persistence.test.mjs \
  scripts/tests/reputation-lock-proposal-runner.test.mjs
```

**103/103 native tests pass.** The new cleanup file has 42 tests: 41 actual-wrapper
fake-driver cases and one byte-preservation check. The other 61 tests include
static fingerprint mutation controls, mocks/boundaries and explicitly labeled
historical defect controls. None is PostgreSQL/provider acceptance evidence.

The fixture bundles the complete actual DB entry module with esbuild, applies
proposed patches only in memory, and replaces only `pg` with a virtual driver.
It does not extract or reimplement a transaction wrapper. The fake Client records
BEGIN/ROLLBACK/COMMIT/end and emits controlled errors; it has no socket or actual
pg Client. Its connection placeholder has no credentials and uses `.invalid`.
Both baseline and proposed modes execute their actual wrapper code paths.

Cases cover rollback rejection, unexpected rollback results, connection errors at
four phases, unverified BEGIN results, ordinary/deleted-shaped close rejection, close stalls with later
success or rejection, rollback stalls, startup failure, uncertain commit and
unexpected commit tags/results, commit uncertainty combined with close failure,
forged causes/receipts, same-error replay and old-receipt replay. Successful
rollback and commit controls are included. Driver failure receipts remain private.

All four intended integration patches pass a combined dry run:

```sh
git apply --check \
  database/planetscale/proposals/reputation_subject_lock.transaction.v3.patch.proposal \
  database/planetscale/proposals/reputation_subject_lock.v2.patch.proposal \
  database/planetscale/proposals/reputation_subject_lock.queue.v3.patch.proposal \
  database/planetscale/proposals/reputation_subject_lock.privacy.patch.proposal
```

The retained v2 Queue patch is evidence only and must not be combined with v3.
JavaScript syntax and whitespace checks pass. No socket connection, PostgreSQL
query, Docker operation, credential access or live provider action was performed.

## New proposal hashes

| File | Bytes | SHA256 |
| --- | ---: | --- |
| `reputation_subject_lock.transaction.v3.patch.proposal` | 4496 | `bc521d9612042d29be83945f06a8bef4273ca9fd7a2cdbf13cca6afb17c57133` |
| `reputation_subject_lock.queue.v3.patch.proposal` | 2812 | `e757e15d7b140a35e40f242d35dc1db56f7d70a00825cc22568066e0d35eea29` |

The prior [revision 2 packet](reputation-lock-v2-source-preparation-20261014.md)
retains SQL/effective-role/expected function fingerprint hashes and the privacy
matrix. This revision does not approve new SQL bytes, roles or installation.

## Remaining verification and approval gates

- **PostgreSQL suite remains NOT RUN**, including helper body/signature/language/
  owner/ACL/grantor fingerprint normalization, drift refusal, guarded DROP,
  delegated-owner conflict, both real deadlock victims and privacy serialization.
- Verify actual node-postgres/Hyperdrive behavior, rollback tags, error ordering,
  close semantics and backend cleanup through separately approved real-runtime
  acceptance. Fake-driver success does not establish those facts.
- Exercise the complete Jobs dispatcher, consumer inbox, ack/retry/DLQ, uncertain
  cleanup reconciliation, execution cancellation and stalled-close restart paths.
  The new tests invoke the actual transaction wrapper and proposed helper, not
  the full deployed dispatcher. No early-ack behavior is certified.
- Exercise the full privacy Workflow including restart after the tombstone and
  before/after final Jobs balance cleanup, idempotent resume, incomplete historical
  workflows and final completion ordering. Retained ledger events must remain
  untouched. The unsafe recreated-balance characterization is not acceptance.
- Protected narrow installer, administrative-writer coordination, migration/
  registry reconciliation, actual Jobs-session/effective privileges and exact
  owner confirmation remain absent. The delegated-owner LOGIN conflict remains
  fail closed. No grants, credential fallback or app-role exception is added.
- Obtain independent exact-head review, relevant CI, authorized acceptance
  evidence and final exact action approval before integration or activation.
  PR #1019 remains outside this work; no merge/deploy action is requested.
