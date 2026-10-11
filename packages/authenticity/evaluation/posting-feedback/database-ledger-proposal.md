# Moderation feedback database ledger proposal

**Status: inactive proposal.** This module is not imported by Jobs, does not call
the provider, and has no scheduler or activation switch. The SQL is a disabled
comment-only proposal outside the canonical migration directory. Local tests use
disposable PostgreSQL 17 only.

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

The local POSIX ledger remains local-only; this adapter assumes a durable SQL
client supplied by a later integration and contains no Jobs bindings or shared
transaction helpers. Its database contract requires a dedicated autocommit
client: before every statement the client must reject ambient transactions, and
`query()` must resolve only after the top-level statement has committed. The
adapter rejects a client without that contract. A transaction-bound client,
shared connection that can issue `BEGIN`, or acknowledgement that precedes
commit cannot be used because it would invalidate the no-replay guarantee.

It uses a single atomic database statement for each claim and result commit.
The result commit changes the attempt state and inserts the allowlisted
result/category rows in one statement. An insert or constraint error rolls the
statement back, leaving the pre-call claim intact. Local PostgreSQL tests use
independent connections for duplicate claim races, exercise writer, reader, and
retention roles from the grant template, reject an ambient transaction, and
simulate acknowledgement loss after committed run, attempt, and result
statements. A category insert trigger also verifies atomic rollback.

Provider responses can explicitly report an empty applied-modality array. The
category ledger stores that observation with `input_types_observed = true` and
an empty modality list; an absent modality field remains unobserved. Empty rows
with no flag, score, or modality observation are omitted, so malformed partial
responses remain recordable without fabricating an observation.

The writer, reader, and retention grant templates each include `USAGE ON SCHEMA
evaluation`. Role tests apply those exact commented grants independently and
verify both expected access and denied access. The placeholders remain
unresolved for any real deployment.

The current migration baseline ends at `0020_auth_recovery_delivery.sql`.
The proposed `evaluation` schema is absent from the canonical baseline, so the
proposal is not assigned a migration number and must not be applied directly.
The current Jobs Hyperdrive configuration targets `lythaus-core/main`; physical
`-development` and `-dev` resources are production-promoted. No disposable
hosted database target is assumed or created. Existing authenticity activation
flags remain disabled.

Review-fix validation on the current worktree uses
`RUN_POSTING_FEEDBACK_PG_TESTS=1 node --experimental-strip-types --test
packages/authenticity/evaluation/posting-feedback/database-ledger.test.mjs`.
The opt-in suite passes against a disposable local PostgreSQL 17 container with
synthetic responses only. It covers the exact commented role grants, denied
least-privilege operations, separate connections for duplicate run/sample
claims, empty observed modality arrays, statement rollback on category failure,
and lost acknowledgements after each durable write. It does not measure live
provider behavior or certify any production role, database, or transaction
wrapper.

## Next approval packet

1. Review the SQL proposal and approve the separate retention of minimal
   no-replay claim tombstones after seven-day result deletion.
2. Before any production DDL, verify the exact current migration baseline,
   PlanetScale role IDs, grant scope, table classification, and rollback plan
   through the normal owner-authorized process. The SQL contains unresolved
   `__APPROVED_*_ROLE__` placeholders and grants no guessed role.
3. Have the Jobs owner review a separate manual-only adapter integration and
   exact-SHA deployment plan. No Jobs entrypoint, provider secret, grant, or
   production database was changed for this proposal.
4. Only after those reviews, separately authorize a one-time run against the
   existing provider binding. The run remains limited to 20 artificial text
   fixtures, one request each, zero retries, a ten-minute window, 15-second
   request timeout, and 262,144-byte response cap. No user content, feature
   activation, enforcement, or public posting is included.

The OpenAI model name is a mutable alias; a response model string is captured,
but provider snapshot/version immutability is not established. Synthetic
PostgreSQL tests verify persistence and replay behavior, not provider accuracy,
production roles, deployed binding presence, or production storage durability.
