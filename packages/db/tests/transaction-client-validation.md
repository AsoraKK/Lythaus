# Direct production transaction client validation

This narrow change handles pg.Client idle errors and requires actual COMMIT
confirmation. It adds a same-client health round trip immediately before email
provider send and private-export R2 PUT. It contains no ordinary publishing
orchestration/account fence, grant, migration, role/binding, provider selection,
retention or flag change. Direct-client tests are wired
once into the existing isolated PG17 CI runner. It does not qualify
production authentication, detectors, release manifest or publication pipeline.

The test imports the production `transaction` directly. It does not replace pg,
Client, query or transaction, and it attaches no fixture error listener to the
production Client. A synthetic Hyperdrive hostname resolves exclusively to
loopback; a plaintext local TCP proxy injects packet loss. All PostgreSQL parsing,
socket events, production listener, commit classification and cleanup are real.
No provider hostname or production binding is routed to the fixture. The email
regression runs the actual relay, pauses actual envelope decryption, and uses a
synthetic send binding. The private-export regression exercises the storage
helper used at the actual workflow PUT site, with a synthetic bucket only.

The existing publication runner creates a separate random local PostgreSQL 17
database for each suite, applies the unchanged canonical migration/grant baseline,
then removes only its own databases. This direct-client suite runs once, after
the three existing Workerd suites, and accepts only its transaction database
name with no target override options. Statements use existing Jobs or, only for
the export fixture, privacy privileges via local startup options. No new
permission or login role is introduced. Synthetic UUIDv7 records never
leave that database; no broker or public handler is invoked by the direct-client
suite. The three unchanged publication suites retain their own Workerd evidence.

```sh
PLANETSCALE_PG17_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55439/lythaus_auth_test_post_control \
  npm run test:publication:pg17
PLANETSCALE_PG17_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55439/lythaus_auth_test_post_control \
  node --test --test-concurrency=1 scripts/tests/publication-pg17-runner.test.mjs \
  scripts/tests/publication-pg17-runner.postgres.mjs
npm run typecheck:native
npm run test:native-db-connection
npm run test:database-identity
```

The direct regressions cover confirmed commit, original callback-error rollback,
failed startup cleanup, actual aborted COMMIT returning ROLLBACK, idle disconnect
during non-SQL work, callback failure after disconnect, and lost commit responses
both before submission and after the server confirms COMMIT. The proxy verifies
fault execution; a separate observer checks durable effects and backend cleanup.

`DatabaseCommitUncertainError` has `outcome: 'unknown'` and a fixed message with no
raw connection error/cause, binding or token. A lost COMMIT response can accompany
one committed durable effect or none; best-effort ROLLBACK cannot distinguish
those states. Callers must reconcile an existing durable operation key and its
immutable input binding before idempotent retry. They must not blindly replay
callbacks or mint new operation IDs. Tests verify both outcomes and one durable
effect after retry with the same key. This helper never retries a callback.

The callback remains responsible for its own non-SQL work and must not issue
transaction-control commands. The listener prevents unhandled idle errors; it
does not cancel arbitrary callback work. Cleanup closes the client and removes
only the helper's listener after end. Existing callback errors are preserved.

`checkTransactionHealth` performs SELECT 1 on the same client immediately before
an external side effect and rejects an unavailable or aborted transaction with
a fixed message. It is a fresh queryability check, not an instantaneous
cancellation or publication/identity authority guarantee. Email checks after
decryption and outside provider-failure classification; export checks immediately
before PUT with the existing key, bytes and metadata. Callback signatures and
existing test database adapters remain unchanged.

The prior caller structure had no pre-provider health check. Suppressing an idle
Client error in the initial transport candidate allowed that latent issue to
reach send after decryption; the new direct regression reproduced one synthetic
send and now requires zero. Tests also retain explicit in-flight failures: once
send or PUT starts, a disconnect can release database locks while the external
effect completes. Database rollback cannot undo it. Email's existing processing
outbox ID prevents immediate automatic replay, but it is not provider-side
exactly-once delivery; the existing unknown-acceptance/lease policy is unchanged.
Export's deterministic object key and package hash remain the reconciliation
identity, but an external object may exist without its committed manifest. No
new retry, cancellation, orphan-cleanup or retention policy is selected here.

Baseline direct tests at 49cca9caa34b34c7ded7f4842792f698be9bd41f reproduced four
failures among six original cases: false aborted-COMMIT success, missing unknown
outcome classifications and unhandled idle disconnect. Their log is preserved in
the handoff. Current exact pass/fail/skip counts and supporting checks are reported
there, with no capability-skipped test relabeled as a pass.

Remaining limits: real Cloudflare Hyperdrive idle/transport behavior and live
provider failure are unrun. Standalone `query` lifecycle, caller-specific unknown
commit reconciliation, account fencing and complete publishing acceptance are
outside this narrow transaction change. Parent must review the candidate and
verify required exact-head checks before approving merge/release. No deployment
or activation occurs here. Rollback is a normal source revert, with no database,
resource or flag rollback.

Approved main `67c9538ee51ccb887496484f23a55999c384b2aa` and merged publication
PR990 at `fba5131f3c6e3585f547ffab302ede76bd4f70ba` are integrated by normal merges.
The existing CI job, PostgreSQL service, commands, permissions, action pins and
three publication suite invocations are preserved. No separate service/job or
duplicate test invocation is introduced. Blocked PR989 runtime and the disabled
author-lock proposal/grants are absent. Publication Workerd fixtures replace
database transport and remain distinct from these actual production-client
regressions. Combined counts and current-head checks are recorded in the handoff.

Combined local PG17 results are 5 moderation, 27 admission, 93 safety and 15
direct-client cases: 140 passed, zero failures/skips. Runner target/interruption
acceptance is four passing cases, executed sequentially after the full runner.
No proposal-only author-lock grant or blocked orchestration test is included.
