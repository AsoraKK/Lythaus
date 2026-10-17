# Inactive posting feedback runtime adapter acceptance

Base: `a64697181d242426da65cea66ad68a937ac408ca` (#997 current main at branch cut).
The #994 collector and #997 schema/ledger are reused without a new corpus,
provider, publishing path, or shared CI job. This code is an optional callable
module, unimported by `apps/lythaus-jobs/src/index.ts`. The live `collect` method
has a private hard-false source gate. `simulate` requires an injected transport;
it records `SYNTHETIC_TRANSPORT_TEST_ONLY`, zero actual provider requests and
withheld public posting. No production DDL, grants, credentials, schema inspection,
retention action, provider request, deployment or activation was performed.

## Acceptance matrix

All runnable cases are in `database-ledger.test.mjs`. The PG cases create their
own loopback-only disposable `postgres:17` containers. Synthetic Hyperdrive DNS
maps only the fixture hostname to loopback. PostgreSQL clients, protocol parsing,
transaction status, triggers and socket disconnects are real. Node ambient fetch
is denied; all provider responses are injected. Local fixture grants and expiry
deletion are evidence about the proposal, not production grants or retention.

| Requirement | Code | Assertion/evidence |
| --- | --- | --- |
| Dedicated client ownership, no ambient transaction | `packages/db/src/autocommit.ts` factory, Jobs ledger factory | Concurrent statements use distinct backend PIDs; an ambient `ROLLBACK` does not undo a dedicated committed write; caller `query` is never used |
| One acknowledged implicit transaction | Named extended query plus public `pg.Client.getTransactionStatus() === 'I'` checks | Transaction-control commands are refused; even zero-parameter multi-statement SQL fails with SQLSTATE `42601`; an independent observer sees each claim before mocked transport |
| Connection lifecycle | Dedicated client with error listener and finally-close; 15-second server statement/connection limits and 16-second client guard | Success, SQL error, failed startup, server termination and dropped acknowledgement paths leave no backend for the fixture application name; actual server deadline cancels with SQLSTATE `57014` |
| DSN timeout precedence | Reject conflicting parsed timeout fields and timeout selectors in startup `options` after existing TLS verification | Zero/relaxed/malformed/duplicate/encoded timeout fields and escaped/hyphenated options are rejected before connection; accepted canonical 15000/16000 fields retain the real 15-second PG cancellation and non-timeout startup options |
| Stalled post-acknowledgement close | One-second graceful deadline, forced socket destroy and at most 250 ms close-event wait | A proxy forwards ReadyForQuery but holds its half-closed socket open. The durable write remains, cleanup returns `outcome: acknowledged`, the ledger stops before any provider request and cannot replay; unknown-acknowledgement errors remain primary |
| Delayed Workerd transport errors | Scoped Client error sink until terminal Connection end/native socket closure; retirement of exclusively owned emitters after terminal proof | Real pg-cloudflare read and closed rejections occur after the 250 ms fallback. All three delayed/destroy-throws cases retain one no-op Client error sink for late errors, have zero active native sockets, produce zero unhandled rejections, and finish with one Client sink, zero Connection/Stream listeners, and no timers |
| Uncertain commit fails closed | `DatabaseAutocommitUncertainError`, poisoned ledger after failed statement | Drop before execution yields zero writes; drop after server ReadyForQuery yields one write; both return `outcome: unknown`. Run/sample/result acknowledgement loss sends 0/0/1 mocked requests, then no further request/replay |
| Race and caller mutation | Pre-await probe/sample reservation; copied scalar bindings; callable input snapshot | A ledger cannot acquire a second context; mutated binding/parameter/gate/content inputs retain their entry snapshots; two collector invocations produce one accepted run and 20 rather than 40 mocked requests |
| Claim before transport, receipt before next transport | Existing collector awaits dedicated ledger operations | Independent connection sees `STARTED_NO_REPLAY` and exactly the prior receipt count before each of 20 mocked requests; all dedicated sessions have closed |
| Atomic sanitized receipt persistence | Existing single-statement claim/result/category CTE | Forced category insert error leaves the original attempt claim and zero results; category allowlist, empty observed modality and no raw body/authority persistence remain covered |
| Interruption and restart | Existing collector with durable run/sample keys | Abort before start makes no claim or request; interruption during delivery stores one unknown receipt and stops; restarting the same selection/source/collector/model run makes zero requests |
| Disabled live integration | Jobs `createInactivePostingFeedbackCollector` | `collect` rejects before PostgreSQL/provider work; factory is frozen; no purge method is exposed; production entrypoint does not import the module |
| Actual Worker socket integration | Workerd bundle with `workerd` package condition and Miniflare Hyperdrive | The real factory/collector/ledger writes through PostgreSQL sockets, an independent observer sees each claim before the internal provider fixture's 20 responses, HTTP outbound is denied, and replay makes no further request |
| Existing privilege/storage contract | Comment-only proposal and local role fixtures | Exact writer/reader/retention grants allow only their intended statements; expiry removes result/category rows while claims continue to prevent replay |

## Validation

```sh
RUN_POSTING_FEEDBACK_PG_TESTS=1 node --experimental-strip-types --test packages/authenticity/evaluation/posting-feedback/database-ledger.test.mjs
npm run typecheck:native
node --experimental-strip-types --test scripts/tests/db-connection-contract.test.mjs
node --experimental-strip-types scripts/ci/validate-posting-feedback-evaluation.mjs
npm run validate:planetscale-migrations
```

The adapter has 22 tests including eleven dedicated-client subtests, stalled
claim cleanup, real Workerd/Hyperdrive integration and delayed Cloudflare transport
subtests. Native typing and six unchanged TLS guard
tests passed. All fifteen existing direct transaction regressions also passed on
a separate disposable PG17 database after the unchanged 20-migration/grant baseline
was applied, confirming that the generalized fault proxy preserves COMMIT tests.

During implementation, a duplicate artificial fingerprint made the new interruption
case conflict with the rollback case; its identity was corrected. The added deadline
test then exposed a real client-only timeout issue: closing the client socket did
not cancel an executing PostgreSQL sleep. A 15-second server statement timeout now
precedes the 16-second client guard, and that test passes with `57014` and no retained
backend. The Workerd fixture initially lacked its required synthetic password and
selected pg-cloudflare's empty Node export; adding the fixture-only password and
`workerd` bundle condition corrected both. Final whole-suite results and the exact
committed source SHA are recorded in the PR receipt. None of these runs accessed
a provider or production database.

Independent PR review identified two security defects in the initial adapter:
pg parsed DSN fields could replace its configured deadlines, and graceful close
could wait indefinitely after ReadyForQuery. The correction rejects conflicting
DSN values (including duplicate and startup-option forms) without rewriting binding
identity or weakening TLS. It also bounds close, forces the owned socket to shut
down and clears both timers. Error protection is retained until terminal closure;
owned emitters are then retired and all their listeners removed. The real
stalled-close fixture confirms acknowledged cleanup failure rather than successful
transport or an unknown commit. Final corrections remain disabled and unimported.

The installed `pg-cloudflare` is 1.4.0; its `dist/index.js` SHA-256 is
`f55f0e164976d5172e85537b1382c0d2e622c99a1adefa24c3d37e333a1af6b8`.
The initial helper reproduced one/two unhandled rejections from delayed read/closed
errors after bounded return. The new fixture uses the unchanged installed driver
class over actual Workerd Hyperdrive/PostgreSQL sockets, delaying only native
socket API notifications (2.0/2.1 seconds after closure). It also injects a driver
`destroy()` failure; the helper directly closes the owned native socket using the
1.4 implementation's `_cfSocket` handle. It retains one no-op Client error sink
for late errors and removes Connection/Stream listeners and timers after closure.
This is specific evidence for the pinned implementation, not qualification of an
unreviewed driver upgrade or production transport.

Passing delayed-error evidence, including source hashes, source head/dirty state,
active socket counts, sink/listener/timer counts and unhandled-rejection counts, is
written to `.artifacts/posting-feedback/late-cloudflare-transport.json`. The fixture
has no provider or external HTTP requests. The initial destroy-failure fixture
also suppressed its first native close; that extra fault was removed so the case
isolates driver destroy failure with the native shutdown capability available.

CI run `38210993077` on `85ed3fbece2b7ce5bfa8aff3479ae9e19331c5d9`
failed the homepage freeze guard because the adapter added a DB package export.
Its dependency scans passed; the audit job failed only in the launch-blocker
summary because Web frontends failed. The same frontend failure appeared on
`fdc6ea15c76e30cfba8f2ad0b0840faf51846153`. The adapter now imports its dedicated
module directly, as it already does for the evaluation modules, and restores the
frozen DB package manifest. The homepage guard and shared CI remain unchanged.
Local verification passes all 73 marketing tests (including the 19 homepage
guards), the marketing build and its 19-route output contract, native typing,
six TLS guards and all 22 adapter tests. Initial local dependency installation
and the default Astro build failed on unwritable home cache/config paths;
using a temporary npm cache and disabling Astro telemetry resolved those local
environment failures without changing dependencies or frontend source.

## Production gates and rollback

The production evaluation schema is absent according to owner-supplied metadata;
this task does not certify that observation. The SQL remains fully commented
outside the canonical 20-file migration manifest ending at `0020`. Its candidate
`0021` ordinal requires reconciliation at migration approval. The baseline set
checksum is `1d5c137e85941a109db09249a56c6e95d24673803db5147fa54fc803933fe09c`.

Before any live execution, independently verify the exact Jobs Hyperdrive
username-to-role mapping and restricted writer grants, approve the schema and
data classification, and resolve the longer-lived no-replay claim-tombstone
retention separately from approved seven-day result retention. No role identifier
is inserted into the grant placeholders. The non-secret role inspection packet
is preparation only.

The existing OpenAI binding, project/model scope, included execution/storage cost
and finite twenty-request/zero-retry authorization remain unverified. A subsequent
review must authorize those facts and a change to the hard-false callable gate.
Scores remain uncalibrated; the mutable model alias does not certify a snapshot,
human authorship, production authentication or publishing. Current-head required
checks/requiredness and release evidence remain distinct from these local tests;
previously denied endpoints are not retried.

Rollback is a normal revert of this adapter commit through review. There are no
production schema, provider, credential, retention, deployment or feature changes
to reverse. Historical run/sample claims must not be deleted to enable replay.
