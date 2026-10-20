# PlanetScale restore runbook

This is a recovery procedure requiring a named recovery target, selected
protected backup/PITR point, approved RPO/RTO, retention and data handling,
additional-cost ceiling, and explicit permission for each consequential action.
The normal validation target is disposable local PostgreSQL 17 with synthetic
data. There is only one approved hosted branch, `main`; this runbook alone
authorizes no temporary hosted branch, restore, credential reset, export,
configuration change or deletion.

For a failed additive 0021 migration, first classify the exact registry and
catalog state using the [tested roll-forward contingency](planetscale-0021-cutover-preparation.md).
Preserving the column/index and safely completing the migration can avoid a
data-loss recovery operation. Do not infer successful restore evidence from
the provider's checklist marker.

After specific recovery authorization:

1. Verify the backup/PITR source, branch ID, timestamps, protection and expiry.
   Record the approved destination, expected data-loss window and rollback
   binding before any restore. Production data may not enter local synthetic
   fixtures.
2. Restore only into that approved recovery target. PlanetScale's
   [restore documentation](https://planetscale.com/docs/postgres/backups)
   describes an independent branch and reset role passwords; source credentials
   do not authenticate there. Credential provisioning/reset and binding changes
   therefore require their own approval. Never recover credentials from an old
   artifact or attachment.
3. Inspect extensions and ownership before making changes. The launch-required
   extensions are `pg_trgm`, `unaccent`, and `pgcrypto`; PostGIS is not a launch
   dependency. Reconcile the canonical role/grant contract using actual SQL
   identifiers, not display labels. Apply only separately approved corrections.
4. Reconcile every recorded checksum and exact migration postcondition before
   selecting missing migrations. Do not blindly replay an already-applied
   baseline. Preserve immutable migration bytes and registry history.
5. Run `database/planetscale/verification/restore-check.sql` and the
   assertion-only `database/planetscale/recovery/restore-verify.sql`. These basic
   checks do not replace the exact canonical migration/schema verifier.
6. Verify constraints, indexes, effective runtime/admin/Jobs/privacy
   permissions and representative queries without publishing restored data.
   Run the approved native acceptance/smoke path and retain sanitized hashes,
   statuses, measured recovery duration and observed recovery point.
7. Export an encrypted logical copy only to a specifically approved independent
   destination with data handling, cost and retention controls. An R2 object in
   the same account is not by itself proof of independent disaster recovery.
8. Cut over or change bindings only after separate approval and normal release
   gates. Retain the evidence packet. Delete a recovery resource only after its
   own dependency, retention and deletion approval; there is no automatic
   create/delete fallback.

For 0021 readiness, preserve a reviewed record under
`docs/evidence/production-cutover/0021-restore-evidence/<backup-id>.json` before
deleting a temporary restored branch. Bind it to the source branch ID, exact
selected backup ID and restored branch ID; record when verification completed,
the evidence artifact SHA-256, verified scope, unresolved gates, and reviewer,
review time and review reference. The planner also checks a SHA-256 over the
record fields, source/backup identity and backup freshness. Record the scope
that was actually verified; do not infer backup binding from the UI selection
or mark unresolved checks as passed. The 0021 gate requires verified backup
binding and restore completion, extensions/indexes, the canonical migration
registry, effective runtime privileges, approved application smoke, RPO/RTO
acceptance, and the independent recovery destination. Full-data parity is not
a required scope. An unresolved gate keeps the plan blocked.

The jobs Worker `BackupValidationWorkflow` performs the database capability and
schema-object checks, then calls the configured provider-independent backup
health endpoint. It fails closed when the endpoint is absent, a required
extension is unavailable, or the restored schema is incomplete.

If the independent destination is unavailable, the recovery gate remains
blocked. Do not claim provider-independent disaster recovery.
