# Transaction cleanup revision 3: implementation and isolated acceptance

This records the PR1022 runtime implementation and local acceptance on the
scoped branch. Production data, provider DDL/grants, feature activation, merge,
and deployment were not touched.

## Runtime behavior

- `transactionWithVerifiedFailureCleanup` opts only the reputation Jobs paths
  into a private cleanup receipt. The existing `transaction` default stays
  compatible for other callers.
- A deleted result requires the same invocation to observe a successful BEGIN,
  callback failure before COMMIT, exact successful ROLLBACK response, fulfilled
  `Client.end()`, and no observed connection error. The private WeakMap receipt
  carries the original cause without exposing it as a public error cause.
- Missing lock capability, unexpected transaction tags, rollback/close failure,
  or unresolved cleanup cannot produce a deleted result. A COMMIT uncertainty
  remains uncertain. `recordReputationSignal` and profile refresh use the
  subject lock and stop on deleted/missing identities before further access.
- The account deletion workflow locks the identity row while committing the
  deleted status, then deletes only the terminal reputation balance in a
  separate Jobs step before tombstone/request completion. Reputation events
  remain retained. A failed balance purge leaves the workflow incomplete and
  restartable.

The v2 SQL, verification, and rollback proposal packets remain inert. The
acceptance runner installs the candidate only in its owned disposable local
fixture; this does not authorize or establish a production installation.

## Local evidence

`npm run test:reputation:pg17` passed using a loopback-only disposable
PostgreSQL 17.11 cluster and temporary database. The runner applied the
canonical baseline, prepared synthetic target-role ACL state, and removed the
owned database/container on exit.

- Existing real PG17 lock/identity/concurrency suite: **39/39 passed**. This
includes role/fingerprint refusal, same-subject serialization, status-writer
ordering, deadlock victim recovery, and missing-capability behavior.
- New actual Jobs/Workflow lifecycle suite: **4/4 passed**. It invokes the
Jobs dispatcher with actual PostgreSQL transactions, drops a ROLLBACK response,
holds a completed ROLLBACK close open while a duplicate delivery arrives,
injects a final balance-delete fault, then replays both cleanup and completion.
  It asserts no premature acknowledgement/completion, no false deleted success,
  backend cleanup, balance removal, and ledger retention.
- Focused unit and runner checks: **104/104 passed**, including rollback/close
  rejection, stall and replay controls against the actual transaction wrapper.
- Native support workflow PostgreSQL fixture: **12/12 passed** on a separate
  disposable PostgreSQL 17 database. The fixture installs only the reviewed
  lock function into its owned database and grants its synthetic `lythaus_jobs`
  role; it asserts the installer is running as the fixture owner. No hosted
  role or database was changed.
- Combined disabled activity pilot, privacy-export, and profile Workflow
  PostgreSQL 17 suites: **40/40 passed**. The shared disposable Workflow
  fixture installs the lock function for synthetic `lythaus_jobs` execution;
  the profile test also asserts the terminal balance purge occurs after
  content redaction and before preference reset. No activity runtime handler
  was changed.
- `npx tsc -p tsconfig.native.json --noEmit`, JavaScript syntax checks, and
  `git diff --check` passed.

The workflow test calls the actual `AccountDeleteWorkflow.run` with a test
step journal to simulate persisted-step replay. Its PostgreSQL work is real;
Cloudflare's deployed Workflow runtime and hosted Hyperdrive behavior are not
claimed by this local run.

## Integration contract and remaining gates

PR1026-owned media handlers were not edited. If that lane changes shared Jobs
dispatch or account deletion code, preserve these contracts: only the two
reputation handlers use `runReputationTransaction`; terminal deletion requires
its verified receipt; final balance cleanup runs before tombstone/request
completion; and reputation event rows are not purged. The lock function must
be installed with the reviewed exact identity and executable by the effective
Jobs database role before this path can run in a hosted environment.

Hosted role identity/effective privileges, proposal migration reconciliation,
real Hyperdrive connection/close semantics, Cloudflare Workflow cancellation
and restart, exact-head CI, and coordinated release remain separate gates. No
production grant, credential, activation, or deployment action is included.
