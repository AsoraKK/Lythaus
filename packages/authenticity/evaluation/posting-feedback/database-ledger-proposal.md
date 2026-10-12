# Moderation feedback database ledger proposal

**Status: merged ledger source; proposed runtime adapter remains inactive.** The ledger
source was cleared and merged as PR #997; current main base is
`a64697181d242426da65cea66ad68a937ac408ca`. This follow-up adds an unimported
Jobs database adapter. Source clearance does not authorize a provider run,
production schema change, grant, or feature activation. The adapter is not
imported by the Jobs entrypoint and has no scheduler or activation switch. SQL
remains a disabled comment-only proposal outside the canonical migration
directory. Local tests use disposable PostgreSQL 17 only.

The adapter reuses the #994 frozen first-20 selection, source and collector
hashes, `omni-moderation-latest`, and the receipt contract. A run fingerprint
binds those immutable values. The run claim is inserted once; each of the 20
UUIDv7 fixture IDs has one unique attempt claim written before transport. A
comment-only SQL manifest pins those 20 sample IDs, body hashes, and revisions;
both adapter validation and database foreign keys reject any other sample or
stale body. A conflict fails closed. If the process stops after claiming, a
later invocation of the same frozen run is rejected, including when the
provider delivery was uncertain. No recovery or automatic replay path exists.

Only fixed receipt fields are persisted: response/model hashes and versions,
status/schema state, typed failure, latency, delivery state, provider flags and
scores, and applied input modalities. The source text, response bytes, arbitrary
provider messages, credentials, authored-content labels, declarations, and
publication authority are not stored. The category rows contain only the
existing moderation category allowlist. The adapter records no authorship or
publication decision; provider scores remain explicitly uncalibrated. Existing
posting thresholds remain `UNEVALUATED`, and public posting remains withheld.

Result rows expire exactly seven days after capture. A future cleanup statement
deletes results and their category rows only. Small run/sample claim tombstones
remain without expiry so result deletion cannot enable replay of the same
selection/source/collector/model combination. The approved seven-day result
retention does not itself approve indefinite tombstone retention; resolve that
policy before any deployment. Claims contain hashes, UUIDv7 synthetic sample
IDs, revisions, and timestamps, not content.

The local POSIX ledger remains local-only. The inactive
`apps/lythaus-jobs/src/posting-feedback-runtime.ts` factory adapts the existing
`DB_JOBS_FRESH` Hyperdrive binding to
`packages/db/src/autocommit.ts`'s `createDedicatedAutocommitClient()`. That factory captures
the verified connection string and scalar parameters, owns a new `pg.Client` for
each statement, and accepts no caller client. It requires idle transaction status
at startup and after the named extended-protocol query. The named query forces
PostgreSQL to accept only one statement, including when no parameters are supplied;
transaction-control commands are rejected before connection. Success settles only
after the implicit transaction acknowledgement and client cleanup. Connection and
server statement deadlines are 15 seconds; the client guard is 16 seconds. A missing statement acknowledgement produces a
sanitized `DatabaseAutocommitUncertainError`; explicit SQL failures retain their
SQLSTATE. A cleanup failure after acknowledgement fails closed separately. A
failed statement prevents further use of that ledger instance.

Probe and sample reservations occur before the first await, and primitive claim
bindings are copied before hashing or connecting. Independent factories still
compete through the database unique keys. The runtime ledger exposes receipt
claims and persistence only; it hides result purging. The callable collector
combines the existing #994 collector with this #997 ledger. Its `simulate` method
requires an injected transport and records synthetic evidence. Its `collect`
method is hard-disabled before database or provider work, with no environment
activation switch. Neither factory is imported by the Jobs entrypoint. The shared
database `query`/`transaction` implementation and other Jobs lanes are unchanged.

It uses a single atomic database statement for each claim and result commit.
The result commit changes the attempt state and inserts the allowlisted
result/category rows in one statement. An insert or constraint error rolls the
statement back, leaving the pre-call claim intact. Local PostgreSQL tests
exercise the Jobs factory and its real `@lythaus/db` client lifecycle, force
duplicate run/sample races through independent fresh clients, apply the writer,
reader, and retention grants, and drop PostgreSQL responses after commit for
run, attempt, and result writes. An independent observer verifies durable
outcomes, no replay, and closed connections. A category insert trigger verifies
atomic rollback.

Provider responses can explicitly report an empty applied-modality array. The
category ledger stores that observation with `input_types_observed = true` and
an empty modality list; an absent modality field remains unobserved. Empty rows
with no flag, score, or modality observation are omitted, so malformed partial
responses remain recordable without fabricating an observation.

The writer, reader, and retention grant templates each include `USAGE ON SCHEMA
evaluation`. Role tests apply those exact commented grants independently and
verify both expected access and denied access. The placeholders remain
unresolved for any real deployment.

The approved migration baseline contains 20 files and ends at
`0020_auth_recovery_delivery.sql`; its repository-set checksum is
`1d5c137e85941a109db09249a56c6e95d24673803db5147fa54fc803933fe09c`. Current
read-only production metadata supplied by the owner reports that `evaluation`
is absent. The proposal therefore names
`0021_posting_feedback_ledger.sql` as its candidate path but remains in the
comment-only proposal directory and is absent from the canonical migration
manifest. Release 110 evidence maps `DB_JOBS_FRESH` to Hyperdrive
`442bb04b99004cb38c6974ec031d65ee` and resource `lythaus-db-jobs-dev` with
`main/postgres` origin; its database username is redacted and remains
unverified. No disposable hosted database target is assumed or created. No
authenticity configuration or activation flag is changed by this adapter.

Review-fix validation on the current worktree uses
`RUN_POSTING_FEEDBACK_PG_TESTS=1 node --experimental-strip-types --test
packages/authenticity/evaluation/posting-feedback/database-ledger.test.mjs`.
The opt-in suite passes against a disposable local PostgreSQL 17 container with
synthetic responses only. It covers the exact commented role grants, denied
least-privilege operations, the Jobs/`@lythaus/db` adapter, closed per-query
connections, duplicate claims, empty observed modality arrays, category-insert
rollback, and lost server responses after committed run, attempt, and result
writes. See [the runtime acceptance matrix](runtime-adapter-acceptance.md) for
dedicated client and callable integration evidence. It does not measure live provider behavior or certify production role
mapping, Hyperdrive credentials, schema, or grants.

## Next approval packet

1. Review the SQL proposal and approve the separate retention of minimal
   no-replay claim tombstones after seven-day result deletion.
2. Before any production DDL, verify the exact current migration baseline,
   PlanetScale role IDs and mapping to `DB_JOBS_FRESH`, grant scope, table
   classification, and rollback plan through the normal owner-authorized
   process. The SQL contains unresolved `__APPROVED_*_ROLE__` placeholders and
   grants no guessed role. See the non-secret role inspection packet.
3. Have the Jobs owner review this disabled adapter and exact-SHA integration
   plan. The Jobs entrypoint remains unchanged; no provider secret, grant, or
   production database was changed.
4. Only after those reviews, separately authorize a one-time run against the
   existing provider binding. The run remains limited to 20 artificial text
   fixtures, one request each, zero retries, a ten-minute window, 15-second
   request timeout, and 262,144-byte response cap. No user content, feature
   activation, enforcement, or public posting is included.

The OpenAI model name is a mutable alias; a response model string is captured,
but provider snapshot/version immutability is not established. Synthetic
PostgreSQL tests verify persistence and replay behavior, not provider accuracy,
verified database username-to-role mapping, production grants, or production
storage durability.
