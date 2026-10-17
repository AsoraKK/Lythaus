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
- Required PlanetScale extensions, HA topology, backups, and role grants have
  already passed their acceptance gates.
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

Dispatch the production migration workflow with `migration_scope=0021-only` and
leave `execute_0021=false` to build evidence only. The plan job makes GET
requests for PlanetScale `main` and the named backup, runs the existing
Cloudflare Hyperdrive origin verifier, and reads the migration registry and
staged 0021 catalog state through `PLANETSCALE_SCHEMA_READ_DATABASE_URL` with
`sslmode=verify-full` and a read-only database session. It does not receive the
administrative database URL or the service-token role-creation credentials.

The PlanetScale API token must already have read access to branches and
backups. The plan requires `main` to be PostgreSQL, ready, production-marked,
not deleted, and deletion-protected. It also requires the provider's
`restore_checklist_completed_at` marker. PlanetScale defines that marker as
the time a user last marked the backup restore checklist complete; it does not
prove that a restore was tested. The selected backup must match the requested
ID, be successful and deletion-protected, belong to `main`, be undeleted, and
remain unexpired. These checks use the [PlanetScale branch API](https://planetscale.com/docs/api/reference/get_branch)
and [backup API](https://planetscale.com/docs/api/reference/get_backup).

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

An unconditional `0021_cutover_owner_decision_pending` blocker keeps the plan
from becoming ready. Completing read-only evidence does not authorize a
migration or release action.

## Scoped 0021 execution

Set `execute_0021=true` only after the read-only plan is ready. GitHub evaluates
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
