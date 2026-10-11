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
transaction helpers. It uses a single atomic database statement for each claim
and result commit. The result commit changes the attempt state and inserts the
allowlisted result/category rows in one statement. An insert or constraint error
rolls the statement back, leaving the pre-call claim intact.

The current migration baseline ends at `0020_auth_recovery_delivery.sql`.
The proposed `evaluation` schema is absent from the canonical baseline, so the
proposal is not assigned a migration number and must not be applied directly.
The current Jobs Hyperdrive configuration targets `lythaus-core/main`; physical
`-development` and `-dev` resources are production-promoted. No disposable
hosted database target is assumed or created. Existing authenticity activation
flags remain disabled.

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
