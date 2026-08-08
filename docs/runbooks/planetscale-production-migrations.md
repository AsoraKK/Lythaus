# PlanetScale production migrations

Production schema changes are applied only by the manually dispatched native
Worker deployment workflow after the GitHub `production` environment approves
the release.

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

## Failure and rollback

Each migration runs in a transaction. A failed migration rolls back and stops
the deployment before any Worker is deployed. Do not edit an applied
migration; create a new numbered migration after reviewing the failed release.
Restore into an approved temporary recovery environment for validation, then
use the normal release rollback procedure. No retired-provider fallback exists.
