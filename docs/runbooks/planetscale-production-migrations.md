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

Supply an operator cost estimate, its reference, and the existing positive
`PLANETSCALE_MIGRATION_USAGE_MAX_USD` ceiling. This is a review comparison;
the ceiling does not enforce or cap actual provider spend. The plan requires
an exact migration registry prefix through 0020 with staged state
`NOT_APPLIED`, `COLUMN_ONLY`, or `INVALID_INDEX_RETRYABLE`. It accepts an
already recorded 0021 only when the exact staged schema and migration
postconditions verify. Active builds, hidden index progress, drift, an
unrecorded fully applied schema, any checksum mismatch, and provider
unavailability block execution.

The plan also fails closed until the 0020/0021 compatibility identity is wired
through all four Worker configurations and both release probes. The runtime
accepts a configured allowlist only as exact tuples with exact fingerprints,
counts, and schema versions; malformed lists and mixed tuple fields fail
closed. The required tuple set is:

```json
[
  {"schemaVersion":"0020_auth_recovery_delivery.sql","schemaFingerprint":"d60ce56eda3165e4c21e880e594700b92425b75b0e6eec963caf75fc72d8c1e0","relationCount":103},
  {"schemaVersion":"0021_media_quarantine_cleanup.sql","schemaFingerprint":"7fdff3474c152317336d2201626b3b69aac79387264e6481576e103f82e8342d","relationCount":103}
]
```

The 0020 tuple matches the sanitized identity captured in the successful
[3880 production deployment run, job 117332044313](https://github.com/AsoraKK/Lythaus/actions/runs/117332044313)
and the committed migration contract test. That historical deployment evidence
does not establish the current production database identity. The 0021 tuple is
generated from the committed migration manifest and checked by the same test.

Before a 0021 plan can be ready, deploy and verify a compatibility release
whose Worker config and readiness probes both accept exactly those two tuples.
Record its exact release SHA and successful deployment run URL for the
protected environment reviewer. Keep all active workers and rollback
candidates compatible with 0020 while the database may still be at 0020. After
0021 is applied and exact postconditions are verified, keep the dual tuple
allowlist until every active or retained rollback release has moved to the
0021 identity. Only then can a later release return to one exact 0021 tuple.
This sequence makes no zero-downtime claim.

## Scoped 0021 execution

Set `execute_0021=true` only after the read-only plan is ready. GitHub evaluates
the `production` environment again for the separate execution job. That job
rechecks the current main SHA, rebuilds the read-only plan, and uses only the
pre-provisioned `PLANETSCALE_ADMIN_DATABASE_URL`; it creates no PlanetScale
role and does not reconcile grants. It applies only the existing pinned 0021
payload through the staged migration helper. Under the helper's session
advisory lock, it rechecks the exact 0020 registry prefix and retryable staged
state immediately before DDL. It records the 0021 checksum only after exact
postconditions pass. An already recorded and verified 0021 is an idempotent
no-op. All other prefixes or states stop before DDL.

## Failure and rollback

Each migration runs in a transaction. A failed migration rolls back and stops
the deployment before any Worker is deployed. Do not edit an applied
migration; create a new numbered migration after reviewing the failed release.
Restore into an approved temporary recovery environment for validation, then
use the normal release rollback procedure. No retired-provider fallback exists.
