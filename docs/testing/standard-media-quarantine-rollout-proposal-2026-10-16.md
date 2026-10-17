# Standard-media quarantine cleanup staged rollout

**Status (2026-10-17):** The staged 0021 helper remains validated on disposable
PostgreSQL 17. A separate read-only production plan and protected 0021-only
executor are now implemented. Hosted execution remains blocked until the exact
0020/0021 identity allowlist reaches all four Worker configs and the release
probes, the dual-identity compatibility release is deployed, and provider
evidence is available. This document authorizes no hosted schema change, role
grant, feature activation, merge, or deployment.

## Staged runner behavior

The production runner preserves the canonical
`0021_media_quarantine_cleanup.sql` bytes and pinned checksum. It recognizes
only that exact payload and applies it in three stages:

1. Add nullable `media.upload_sessions.quarantine_deleted_at` in a short
   transaction with a 10-second lock timeout. The transaction commits before
   any index operation.
2. Create `media.media_upload_quarantine_cleanup_idx` with
   `CREATE INDEX CONCURRENTLY` outside a transaction. Verification checks the
   complete deparsed index definition, exact predicate, target relation,
   btree method, two ordered key columns, non-unique shape, and `valid`/`ready`
   catalog state.
3. Recheck all migration postconditions, then write the migration registry row
   in its own transaction. A session advisory lock covers the staged DDL,
   verification, and registry write. No failure path records completion early.

The index predicate is pinned as:

```sql
((purpose = 'standard'::text) AND (status = ANY (ARRAY['pending'::text, 'queued'::text, 'approved'::text, 'rejected'::text, 'expired'::text, 'cancelled'::text])) AND (quarantine_deleted_at IS NULL))
```

## Retry and drift boundary

If a concurrent build fails, 0021 remains unrecorded. A later run may remove an
invalid index concurrently and retry only when the existing index has the exact
canonical definition, no matching build is active, and the migration identity
can see all index-build progress (superuser or effective `pg_read_all_stats`
privileges, verified with `pg_has_role(..., 'USAGE')`). Membership through a
`NOINHERIT` grant does not prove visibility. If activity
is hidden or visibility is unavailable, the runner stops for owner review. A valid, ready exact
index is reused. An active build, unexpected index object, column mismatch, or
predicate/definition drift stops the runner without dropping the object or
recording the migration. The new column is not an automatic rollback target.

Recorded and unrecorded migrations both require a regular table and the complete
nullable marker shape: timestamptz, no default, no generated expression, and no
identity. A valid index cannot compensate for marker drift.

Reconciliation reports partial states without treating predicate fragments as
proof. A column-only state and an exact inactive invalid index are the only
partial states eligible for resume. Other partially applied migrations retain
their existing fail-closed behavior.

## Production scope and identity sequencing

The all-migrations workflow remains the default. The separate `0021-only`
scope first creates a read-only plan from provider GETs, the existing
Cloudflare Hyperdrive verifier, and a read-only PlanetScale registry/catalog
session. The optional execution job has its own `production` environment gate,
uses a pre-provisioned admin connection, rechecks the exact registry prefix
under the staged helper's advisory lock, and does not create roles or apply
grants. A completed exact 0021 state is a verified no-op.

The plan refuses to proceed until the exact 0020 and 0021 schema identity
tuples are installed in all four Worker configs and accepted by the release
probe tooling. It also requires a successful compatibility release SHA and run
URL for protected environment review. Preserve the dual tuple until no active
or retained rollback worker expects 0020. Then a later release can narrow to
the exact 0021 tuple. No zero-downtime claim is made.

The supplied sanitized 3880 production deploy log for job 117332044313 reports
the 0020 tuple `d60ce56eda3165e4c21e880e594700b92425b75b0e6eec963caf75fc72d8c1e0`
with relation count 103. The committed contract test reproduces that exact
tuple. This proves the historical tuple matches the source contract; it does
not prove the live production schema. The committed 0021 tuple is
`7fdff3474c152317336d2201626b3b69aac79387264e6481576e103f82e8342d`, also with
relation count 103.

## Local evidence

- `npm run test:planetscale-production-migrations`: 40/40 tests pass, including
  staged ordering, failed-build retry, invalid-index handling, drift refusal,
  active-build refusal, migration-byte pinning, read-only plan blockers,
  protected executor gates, exact 0020/0021 identity matching, and the captured
  3880 tuple comparison against the committed contract.
- `node --test scripts/tests/planetscale-media-quarantine.postgres.mjs`:
  7/7 pass on disposable PostgreSQL 17.11. Separate login connections prove
  `MEMBER = true` with `USAGE = false` hides a real concurrent build's progress
  and refuses cleanup. Effective visibility refuses the active build, then
  recovers its cancelled invalid index. Recorded and unrecorded default and
  generated marker drift, and a partitioned relation, refuse verification
  without attempted DDL or registry mutation. Native PG17 CI runs this suite.
- `npm run validate:planetscale-postgres17` on a fresh local PostgreSQL 17.11
  database: all 22 approved migrations and postconditions pass; 0021 records its
  exact pinned checksum after the concurrent index succeeds.
- The standard media unit, Workerd/local-R2, and PG17 suite passes 53/53. It
  verifies the canonical runtime `bytes_rejected` update and Jobs ownership
  insert are denied before fixture-only grants. Those exact column grants are
  applied only to the uniquely named disposable test database and revoked
  before teardown.

These are local synthetic checks. They do not prove PlanetScale-hosted DDL or
role acceptance, Cloudflare R2/Images/Queue behavior, detector qualification,
or production readiness.

## Remaining release gates

- The proposed least-privilege grants remain unapplied:
  `GRANT UPDATE (bytes_rejected) ON media.storage_ledger TO lythaus_runtime;`
  and `GRANT INSERT (object_id, owner_id) ON media.ownership TO lythaus_jobs;`.
- Production-role grant reconciliation and hosted PlanetScale migration
  review/acceptance remain pending. Do not execute migration 0021 on `main`
  until the canonical baseline, provider DDL behavior, data classification,
  and explicit migration gates pass.
- Image-pixel detection is not qualified. Preserve unavailable/review evidence
  (`modelId: not-executed`, `reviewRequired: true`) and keep media flags false.
  MIME, checksum, dimensions, and signature checks are not image-pixel
  detection or human-authorship evidence.
- Hosted Cloudflare R2/Images/Queue and Hyperdrive transaction/deletion
  acceptance, decoder/EXIF/GPS behavior, and physical aggregate-storage quota
  bounds remain unaccepted.

PR #1022 owns the shared database transaction wrapper; this staged migration
does not change those files or alter media-handler transaction semantics.
