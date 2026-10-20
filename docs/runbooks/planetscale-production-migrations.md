# PlanetScale production migrations

The existing all-migrations production workflow remains the default and keeps
its current execution path. A separate `0021-only` scope in
`.github/workflows/planetscale-production-migrations.yml` provides a read-only
plan and a separately protected execution job for migration 0021.

## Preconditions

- The release SHA has passed native validation, migration validation, secret
  scanning, and product acceptance gates.
- PlanetScale `main` is the approved production branch.
- `PLANETSCALE_ADMIN_DATABASE_URL` targets the production administrative role
  and includes `sslmode=verify-full`.
- The protected environment secret
  `PLANETSCALE_PRODUCTION_MIGRATIONS_APPROVED` is exactly `approved`.
- Required PlanetScale extensions, backups, and role grants must pass their
  acceptance gates for the migration path.
- General `all-migrations` releases also require an approved HA topology.
- The explicit `0021-only` path has a narrowly approved maintenance-policy
  exception: retain the existing PS-5 single-node topology, with no HA upgrade
  or other topology change. This resolves the HA wording only for this pinned
  maintenance migration; it does not certify single-node as generally
  HA-compliant or change the general production requirement.
- The exception waives no other 0021 gate: required PlanetScale extensions,
  protected main and backup, verified recovery evidence, exact role and
  Hyperdrive bindings, measured usage and a positive ceiling, exact-candidate
  consent, concurrent-index safety, and protected production review remain
  required.
- `PSCALE_ROLE_IDENTIFIERS` is a reviewed JSON map from each repository role
  label to its generated `pscale_api_*` SQL identifier. The production runner
  validates and substitutes these identifiers before applying grants; display
  labels are not assumed to be SQL-visible.

## Execution

The deployment workflow runs:

```text
PSCALE_BRANCH_NAME=main
npm run apply:planetscale-production-migrations
```

The runner:

1. refuses any branch other than `main`;
2. refuses missing approval or non-`verify-full` connections;
3. applies only migration files under `database/planetscale/migrations`;
4. records SHA-256 checksums in `system.schema_migrations`;
5. refuses changed checksums on later deployments;
6. applies role grants after migrations; and
7. never applies the synthetic development feature-flag seed.

## Scoped 0021 plan

This path may retain the existing single-node topology under the exception
above. Every other readiness and execution condition below remains in force.

Dispatch the production migration workflow with `migration_scope=0021-only` and
leave `execute_0021=false` to build evidence only. The plan job makes GET
requests for PlanetScale `main` and the named backup, runs the existing
Cloudflare Hyperdrive origin verifier, and reads the migration registry and
staged 0021 catalog state through `PLANETSCALE_SCHEMA_READ_DATABASE_URL` with
`sslmode=verify-full` and a read-only database session. It does not receive the
administrative database URL or the service-token role-creation credentials.

The PlanetScale API token must already have read access to branches and
backups. The plan requires `main` to be PostgreSQL, ready, production-marked,
not deleted, and deletion-protected. The branch API's
`restore_checklist_completed_at` is informational: it records when a user
marked the restore checklist complete, and is not proof that source `main` is
recoverable. PlanetScale describes that checklist as a guide on branches
restored from backups ([changelog](https://planetscale.com/changelog/backup-restore-checklist),
[branch API](https://planetscale.com/docs/api/reference/get_branch)).

The selected backup must match the requested ID, be successful and
deletion-protected, belong to `main`, be undeleted, and remain unexpired. The
plan also requires a reviewed restore-evidence record at
`docs/evidence/production-cutover/0021-restore-evidence/<backup-id>.json`.
Its source branch ID and selected backup ID must match the live provider reads;
the restored branch ID is retained as historical identity even after that test
branch is deleted. The record includes a verification timestamp, the SHA-256
of the underlying evidence artifact, its own content hash, reviewer and review
reference, verified scope, and unresolved gates. A hash mismatch, stale or
future timestamp, missing required scope, or any unresolved gate blocks the
plan. Required scope covers independent backup-to-restore binding, restore
completion, extensions/indexes, canonical migration registry, effective
runtime privileges, application smoke, accepted RPO/RTO, and the independent
recovery destination. It does not require full-data parity. See the
[restore runbook](planetscale-restore.md) for how to gather the operational
evidence; the record is reviewed and committed append-only before use.

These checks also use the [PlanetScale backup API](https://planetscale.com/docs/api/reference/get_backup).

The target identity carries the PlanetScale database slug and branch ID
separately from the physical PostgreSQL database name and origin fingerprint.
The executor checks its branch-qualified admin URL and the connected session
against both identities. The URL accepts only the literal
`sslmode=verify-full` and optional `sslrootcert=system` query parameters; host,
user, port, database routing overrides, encoded parameters, and duplicate
parameters fail closed before the admin connection is created.

Supply an operator cost estimate, its reference, and the existing positive
`PLANETSCALE_MIGRATION_USAGE_MAX_USD` ceiling. This is a review comparison;
the ceiling does not enforce or cap actual provider spend. The plan requires
an exact migration registry prefix through 0020 with staged state
`NOT_APPLIED`, `COLUMN_ONLY`, or `INVALID_INDEX_RETRYABLE`. It accepts an
already recorded 0021 only when the exact staged schema and migration
postconditions verify. If the exact 0021 schema is fully applied while the
registry remains exact through 0020, it classifies the state as
`RECOVERY_REQUIRED`. Under the existing session advisory lock, the executor
rechecks those postconditions and may insert only the canonical 0021 registry
marker; it does not rerun DDL in this recovery path. Active builds, hidden
index progress, drift, any checksum mismatch, and provider unavailability
block execution.

The plan requires candidate-specific execution consent from
`PLANETSCALE_0021_EXECUTION_APPROVED_SHA` and
`PLANETSCALE_0021_EXECUTION_APPROVAL_REFERENCE`, configured in the protected
`production` environment after the specific hosted 0021 action is approved.
The first must be the exact lowercase 40-character `release_sha`; the second
must identify that approval. Neither is a dispatch input. Missing, malformed
or stale approval keeps the plan blocked. A new main SHA needs its own approval.
The executor independently checks the same consent before connecting, even
when a caller supplies `PLANETSCALE_0021_PLAN_READY=true`.

Maintenance-gap consent resolves downtime choice only. It does not populate
execution consent, authorize spending or credential/configuration changes,
or establish any backup, restore, role or target evidence. A matching approval
removes only the consent blocker; every other plan blocker still applies.
Keep the existing production environment review and exact-main checks.

## Scoped 0021 execution

Set `execute_0021=true` only after the read-only plan is ready and consent is
recorded for that exact candidate. GitHub evaluates
the `production` environment again for the separate execution job. That job
rechecks the current main SHA, rebuilds the read-only plan, and uses only the
pre-provisioned `PLANETSCALE_ADMIN_DATABASE_URL`; it creates no PlanetScale
role and does not reconcile grants. It applies only the existing pinned 0021
payload through the staged migration helper. Under the helper's session
advisory lock, it rechecks the exact 0020 registry prefix and staged state.
Retryable states proceed through DDL. If the exact schema is already fully
applied with the registry only through 0020, it verifies the exact
postconditions and writes the canonical 0021 registry marker without DDL. An
already recorded and verified 0021 is an idempotent no-op. All other prefixes
or states stop before DDL.

## Failure and rollback

Ordinary migrations run in a transaction. Staged 0021 commits its nullable
column before building its index concurrently; an index failure can leave the
column and an invalid index behind without a registry marker. A failed run
stops before Worker deployment. Preserve the additive state and use the
[0021 contingency and cutover sequence](planetscale-0021-cutover-preparation.md)
to distinguish safe roll-forward states from drift. Do not edit an applied
migration or delete registry history. A different repair requires a reviewed
new numbered migration. Recovery restores require the separately approved
target, cost and recovery decision in the
[restore runbook](planetscale-restore.md).
