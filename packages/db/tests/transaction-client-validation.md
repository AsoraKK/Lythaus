# Direct production transaction client validation

This narrow change handles pg.Client idle errors and requires actual COMMIT
confirmation. It contains no Jobs orchestration/account fence, grant, migration,
role/binding, publication, provider, flag or CI change. It does not qualify
production authentication, detectors, release manifest or publication pipeline.

The test imports the production `transaction` directly. It does not replace pg,
Client, query or transaction, and it attaches no fixture error listener to the
production Client. A synthetic Hyperdrive hostname resolves exclusively to
loopback; a plaintext local TCP proxy injects packet loss. All PostgreSQL parsing,
socket events, production listener, commit classification and cleanup are real.
No provider hostname or production binding is routed to the fixture.

The runner creates its own random local PostgreSQL 17 database, applies the
unchanged canonical migration/grant baseline, executes statements as the existing
Jobs role via local startup options, then removes only its own database. No new
permission or login role is introduced. Synthetic UUIDv7 outbox records never
leave that database; no broker or public handler is invoked.

```sh
PLANETSCALE_PG17_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55439/postgres \
  node --experimental-strip-types --test --test-concurrency=1 \
  --test-timeout=15000 packages/db/tests/transaction-client.postgres.mjs
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
