# Inactive image-detection orchestration

This candidate implements and locally exercises an exported consumer, SQL store
and evidence contract. It does **not** connect standard uploads to a real detector.
Only an explicitly selected `synthetic-local-only` harness and a `synthetic`
adapter can execute this path. No environment flag, existing dispatcher, provider,
retention policy, public API, Flutter screen or publication gate is changed.

## Source and concurrent ownership

`git ls-remote origin refs/heads/main` on 25 October 2026 returned
`c0963c36693476ecc49ab1fcba0572454926b4d3`, which is this branch's base.
This is a source pin, not a deployed-release identity. Root `AGENTS.md`, current
policy authority, approved migration manifest and the saved environment setup
instructions were read. No additional repository SKILL.md or nested AGENTS.md
was present. Cached Node 22.23.3, Flutter 3.41.1 and PostgreSQL 17.11 were found.

Pending work inspected before implementation:

- #1086, `3cdddaaaf7107d009bc89f5dd474a037f1168eec`: canonical upload-event binding,
  original/derivative provenance, private image-review evidence and privacy hooks.
  Its prior ready/merge hold remains unresolved. This candidate neither copies
  its patch nor changes its branch, readiness or merge status.
- #1087, `9c73ac3a39b3c2374071ad30b37f4deb5c854dbc`: private beta adapter tests and
  bounded real-evaluation proposal. Its source/raster lineage, authorization and
  real-provider limitations remain. No model, checkpoint or private fixture ran.
- #1101 owns shared comment hooks, regression CI and monthly state changes;
  #1102 owns release/database workflows and authority verification. All files in
  this candidate are new. Main merge order and deployment belong to the parent.

The existing `beta.ts` binding/result validation, source-version checks and
consumed-attempt semantics informed this design. `verifyStandardUploadBytes` is
reused directly. The SAFE-A model card records 155/160 and 79/120 detections on
different historical selected panels, and JPEG-Q95 stress of 0/40 detections and
8/60 negative false positives. These are measurements, not production
certification. Low SAFE scores, absent metadata and NOT_RUN do not prove human
authorship. The new adapter has no SAFE implementation and makes no quality claim.

## Exact pipeline and missing connections

| Stage | Current source | Current behavior / gap |
| --- | --- | --- |
| Authenticated intake | `apps/lythaus-public-api/src/index.ts`: `createUploadSession`, `uploadSessionBytes` | Owner-bound, bounded and checksummed private `quarantine/<owner>/<session>` upload; media feature gate remains |
| Finalisation | Same file: `finaliseUpload` | Re-verifies original, moves session to queued, atomically writes `media.upload.finalised` outbox event |
| Outbox/queue | `apps/lythaus-jobs/src/index.ts`: dispatcher and `processMediaUpload` | Locks session, verifies source and dimensions, reuses or generates a WebP derivative; standard path is not an evaluator |
| Private persistence | Same `processMediaUpload` | Writes `media.objects` in `review`, ownership, variant, ledger and generic `not-executed` moderation result; calls `quarantine.delete` after commit |
| Existing private evaluators | `apps/lythaus-jobs/src/authenticity-beta.ts`, `packages/authenticity/src/beta.ts` | Separate consent/budget/runtime-gated beta case, original version/hash, safety, SAFE and adviser contracts; not a standard-upload hook |
| New admission | `enqueueImageDetection`, `createImageDetectionStore.admit` | Requires canonical owner/session/event/processed-object identity, unique object, original version and hash; durable queued record; no automatic producer hook |
| New consumer | `apps/lythaus-jobs/src/image-detection.ts` | Validates delivery; claims a bounded lease; reads exactly the original; consumes dispatch before a synthetic evaluator call; atomically settles evidence |
| Owner status | `imageDetectionStatus` | Owner-scoped projection with queued/processing/completed/failed/inconclusive/cancelled/deleted handling; no route is installed |
| Publication/reputation | Existing authority remains separate | Every new evidence record says review_required, publicationEligible=false, reputationEligible=false, enforcementAuthority=false |

The standard upload's completed processing status is not detection completion.
Today its original is normally gone before this separate consumer could execute.
The new local acceptance deliberately seeds synthetic canonical records and
supplies a generated PNG in local R2. It does not pretend the missing producer,
retention, privacy or UI hooks are installed in the shared dispatcher.

## Durable contract and state machine

The review-only SQL proposal is
`database/planetscale/proposals/image_detection_jobs_v1.sql`. It is outside the
approved migration manifest and supplies no grants. It was applied only to a
new disposable local PostgreSQL database. Existing canonical roles remain
unchanged; the test explicitly verifies Jobs has no INSERT permission on the new
table. SQL semantics run as the disposable database owner, not as proof of hosted
role acceptance. No live migration or schema inspection was performed.

Each record binds owner, upload session, unique canonical finalisation event,
processed object and its SHA-256 content version; original key, R2 version, ETag,
SHA-256, size and MIME; evaluator, model, preprocessing and runtime versions;
and policy version. A canonical ordered representation supplies `binding_hash`.
The full identity is also compared on admission, preventing cross-owner reuse
and changed-model/source retries. One record per media object prevents a new
delivery from silently minting a fresh evaluation budget. A future explicit
model reevaluation/version protocol is a separate change.

Application UUIDv7 IDs identify jobs and attempts. Database time controls expiry
and leases. Evidence stores attempt and binding identity, timestamps, integrity,
safety, authorship observation and final policy separately. Synthetic successful
observations still have authorship state ABSTAIN. Unknown fields and result
identity drift are rejected; raw provider bodies, arbitrary metadata and scores
are not persisted. The database rejects missing policy/binding fields and any
authority-bearing policy object.

State transitions:

- Queued → processing after a durable claim. Duplicate deliveries observe the
  existing lease or terminal state and do not dispatch.
- Pre-dispatch transport failure or abandoned lease → queued, at most three
  attempts; exhaustion → failed. Integrity mismatch → failed without inference.
- Missing/replaced original → inconclusive. There is no derivative fallback.
- Dispatch is persisted before invoking the adapter. Unknown/failed/timeout
  outcome after that point → inconclusive, with the attempt consumed. A retry
  cannot repeat an ambiguous provider call. Lost settlement acknowledgements
  likewise do not create a new dispatch.
- Valid, bound synthetic output → completed only for ALLOW plus a usable
  synthetic observation; NOT_RUN, ABSTAIN and safety-review states remain
  inconclusive. Completed means orchestration completed, never model acceptance.
- Owner cancellation → cancelled; deletion → deleted with evidence and binding
  scrubbed. Cleanup or supersession invalidates evidence. Cancellation cannot be
  relabelled by later cleanup; deletion is terminal. Minimal IDs/hash/timestamps
  remain as a private tombstone pending the approved retention policy.

Before admission, dispatch, settlement and status reads, the SQL store rechecks
canonical account/session/media/event identity and cleanup markers. Parent rows
are locked before the job; no database transaction spans inference. Settlement
uses the current attempt and lifecycle under row locks and checks the deadline
again in its UPDATE. Timers cancel stalled streams; an adapter that ignores its
abort signal cannot save late success. A source version is checked before and
after evaluation. Owner projection rechecks source availability and withdraws
completed evidence after cleanup.

R2 and PostgreSQL do not share an atomic transaction. Activation requires every
original cleanup/delete path to invalidate the job **before** deleting bytes,
then record deletion completion. An R2 HEAD alone cannot close the final
HEAD-to-commit race. The new `invalidate` seam is tested, but existing cleanup
workflows do not call it. Similarly, account export/deletion, legal holds and
retention must integrate the new table before any real user data can enter it.
Lazy status invalidation is not a substitute for timely privacy deletion.

## Smallest retention decision

Choose whether standard-upload originals may remain available for evaluation
until a specifically bounded processing deadline, and approve that maximum
duration, private location/access, cancellation/account-deletion behavior and
legal-hold exception. The existing original deletion cannot simply be delayed by
this code. The proposal's expiry never exceeds the existing upload-session
expiry, but that limit is not permission to extend current retention.

The alternative is an explicitly approved evaluation step within the existing
original-processing lifetime, before deletion, with a reviewed timeout and
cleanup failure contract. Either approach needs a producer/lifecycle integration
patch. WebP must never substitute for SAFE-A's original PNG/JPEG. No additional
image copies, R2 resources, paid services or retention changes are introduced.

## UI/consumer handoff

Coordinate this plan with the separate mobile UX owner; no rendered UI changes
or screenshots belong to this candidate. Keep the existing integrity processing
status and specialist states separate. A future owner-only, no-store status
route can call `imageDetectionStatus` after authentication; never expose the raw
SQL row, keys, hashes, evaluator details or other owners' status.

| Consumer state | Suggested meaning |
| --- | --- |
| queued | Image analysis is queued; review is still required |
| processing | Image checks are in progress; no result yet |
| completed + synthetic_only | Test analysis finished; this is not a real detection result |
| failed | Image checks could not complete; review required |
| inconclusive | No usable authenticity conclusion; review required |
| cancelled | Analysis cancelled |
| deleted | Return no record |

Do not label NOT_RUN, ABSTAIN, low detector scores or missing originals as
authentic/human. Do not attach media, publish content or issue reputation based
on these states. Real-provider status wording requires separately validated
provider semantics; this candidate cannot produce real-provider status.

## Reproducible acceptance and limitations

Use the saved Node 22 runtime. Start only the saved disposable PG17 container,
and create its dedicated `lythaus_auth_test_post_control` database if absent.
The suite refuses a non-loopback host, another control database or connection
options. It creates a uniquely named database, applies the approved baseline
and proposal, runs synthetic cases and drops only its owned database.

```sh
node --experimental-strip-types --test packages/authenticity/tests/image-detection-contract.test.mjs
PLANETSCALE_PG17_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/lythaus_auth_test_post_control \
  node --experimental-strip-types --test --test-concurrency=1 packages/db/tests/image-detection.postgres.mjs
npm run typecheck:native
node --experimental-strip-types --test packages/media/tests/standard-upload.test.mjs packages/media/tests/standard-upload.workerd.mjs
git diff --check
```

The displayed database credentials are the synthetic local-container defaults.
Logs remain local. The PR contains source and sanitized summaries only, suitable
for this public repository; no private photos, account records, prompts, provider
receipts, raw scores or operational secrets are included.

| Regression family | Assertions |
| --- | --- |
| Identity | Canonical hashing, all source/model fields, owner isolation, wrong events, changed media hash, replaced R2 version, invalid bytes |
| Delivery | Concurrent duplicates, replay, stale attempt, lost worker before/after dispatch, pre-dispatch retry ceiling |
| Failure | Missing original, transient storage, invalid/extra/misbound output, NOT_RUN, provider exception, expiry |
| Deadline | Stalled stream cancellation, ignored evaluator abort, late success suppression |
| Lifecycle | Cancellation, deletion, supersession, cleanup retry, current account/media/cleanup checks, evidence withdrawal after completion |
| Authority | No human-authorship claim, no publication/reputation, schema rejection of incomplete or authority-bearing evidence |
| Runtime | Real new consumer/store modules bundled unchanged into Workerd; local R2 and real disposable PG17; test transport and evaluator are explicit |

The test wrapper imports exported candidate modules. It does not rewrite source
or inject missing upload/dispatcher hooks. The Workerd SQL bridge only transports
queries/transactions to disposable PostgreSQL; the remaining race matrix calls
the same consumer and store under Node. Generated PNGs and evaluator outputs are
synthetic and do not demonstrate detection quality, rights, false-positive rates,
provider availability or production acceptance.

The current shared CI has explicit test lists; these new suites need to be added
by the #1101 regression-CI owner. Exact-head hosted checks can validate the new
TypeScript and existing regression coverage, but must not be described as having
run these new suites until their commands appear in job logs. Independent review
and all required exact-head checks remain prerequisites for parent-coordinated
merge. No CI or release workflow is edited here.

## Activation checklist

1. Resolve the #1086 hold and sequence #1086/#1087 with this separate candidate;
   review a narrow canonical upload producer and queue-dispatch hook.
2. Approve original retention/lifetime and all privacy/export/delete/legal-hold
   integration; prove cleanup invalidation before pixel deletion, retryable
   cleanup and no stale result resurrection on the actual candidate.
3. Review proposal reconciliation, role boundaries and local PG17 tests; obtain
   explicit migration approval before live DDL. No automatic schema creation.
4. Bind real evaluator/model/preprocessing/runtime identities and independent
   harmful-content safety evidence; provide current rights, handling, cost and
   execution approvals. Synthetic mode is not a switch to a real provider.
5. Resolve #1087's frozen SVG/raster lineage before any SAFE parity run. Establish
   real runtime parity, input applicability, generator coverage, false-positive
   requirements, reviewer handling and population limitations. Historical SAFE
   success and synthetic orchestration are insufficient.
6. Integrate authenticated owner status with the UX owner; test actual upload →
   persisted evidence → private status, retries, account switching and deletion.
7. Add these regressions to required CI, pass the exact candidate checks and
   independent review, then follow parent merge/release sequencing. Publishing,
   reputation and enforcement require their separate complete-pipeline approval.

Implemented source, local tests, hosted CI, merge, deployment and activation
must be reported separately. This candidate authorizes none of the latter steps.
