# PlanetScale restore runbook

The [fixed-target runner](planetscale-native-restore-runner.md) prepares the
bounded October restore qualification. It defaults to metadata-only planning;
execution still requires the separate exact owner packet, protected review,
existing access and current recovery gates. It does not certify a live restore
from mocked or local synthetic tests.

This is a recovery procedure requiring a named recovery target, selected
protected backup/PITR point, approved RPO/RTO, retention and data handling,
additional-cost ceiling, and explicit permission for each consequential action.
The normal validation target is disposable local PostgreSQL 17 with synthetic
data. There is only one approved hosted branch, `main`; this runbook alone
authorizes no temporary hosted branch, restore, credential reset, export,
configuration change or deletion.

The manual `planetscale-cutover-identity-preflight.yml` workflow has a separate
`inspection=restore-inventory` mode. After exact-source review and normal
production approval, it uses the existing API secrets to list backups of the
fixed source `lythaus/lythaus-core/main` and resolve the four canonical
application role names from their existing Hyperdrive configurations. It opens
no SQL connection, creates no credentials and changes no provider state. The
default `identity` mode retains the existing SQL identity inspection.

Inventory evidence is sanitized and retained for seven days. Pagination is
bounded and must be complete; denied, malformed or inconsistent responses
block collection without retry or partial success. Numeric size fields need
unit/billing interpretation before costing. Start/completion comparisons with
grant run `39917326612` do not prove an exact recovery point or restored grants.
The inventory does not select/protect a backup or qualify a restore; copied
verifier/administrator roles and actual grants still need restored-target
verification. Keep access, extensions, spending and irreversible cleanup in
the separate, exact-target owner approval packet before billable creation.

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
review time and review reference. Retain the actual sanitized artifact as a
tracked regular file under
`docs/evidence/production-cutover/0021-restore-evidence/artifacts/`; the
planner hashes its bytes and blocks if it is absent, untracked, symlinked,
outside that directory, empty or mismatched. The planner also checks a
consistency SHA-256 over the record fields and separately checks source/backup
identity, timestamp order and backup freshness. The record hash does not
establish artifact provenance. Record the scope that was actually verified; do
not infer backup binding from the UI selection or mark unresolved checks as
passed. The 0021 gate requires verified binding and restore completion,
extensions/indexes, the canonical migration registry, effective runtime
privileges, approved application smoke, RPO/RTO acceptance, and the independent
recovery destination. Full-data parity is not a required scope. An unresolved
gate keeps the plan blocked.

The 2026-10-21 owner decision permits only the
[one-release owner-testing independent-recovery exception](planetscale-production-migrations.md#one-release-owner-testing-recovery-exception).
It retains every native scope, actual completed restore and protected backup,
24-hour backup/verification freshness, accepted RPO/RTO and artifact hash/review.
The receipt must keep `independent_recovery_destination` unresolved and omit it
from `verifiedScope`; report `DEFERRED_BY_OWNER_EXCEPTION`. It does not establish
provider/account-wide recovery, permit new recovery infrastructure or credentials,
or turn the historical `pa4t6j6s07b7` partial receipt into complete evidence.
Canonical public-release readiness continues to require verified independent
recovery after 0021; extra R2 export and a separate encryption key remain deferred.

The jobs Worker `BackupValidationWorkflow` performs the database capability and
schema-object checks, then calls the configured provider-independent backup
health endpoint. It fails closed when the endpoint is absent, a required
extension is unavailable, or the restored schema is incomplete.

If the independent destination is unavailable, the strict recovery gate remains
blocked; only the bound owner-testing exception above can defer that item. Do
not claim provider-independent disaster recovery.
