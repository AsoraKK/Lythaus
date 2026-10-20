# Bounded verifier statistics permission

The owner approved this narrow permission on 20 October 2026 after being told
that `pg_read_all_stats` provides cluster-wide statistics visibility, including
potentially sensitive SQL text, and persists until revoked. Approval covers
only the existing verifier `pscale_api_qodocjs6vgrb` on
`lythaus/lythaus-core/main` (`vqa2g2xc9wsl`, SQL database `postgres`). It does not
authorize migrations, table grants, `pg_monitor`, ownership, new credentials,
activation, paid recovery resources, or a release-gate exception.

Use **PlanetScale bounded verifier stats permission**
(`planetscale-verifier-stats.yml`) on `main`, with `release_sha` equal to the
exact current merged main SHA. Every operation uses the protected `production`
environment and the existing admin/verifier credentials. No temporary role or
credential provisioning fallback exists.

1. Run `operation=inspect`, leaving `grant_run_id` empty. The report must show
   the exact branch, both connected roles, PG17, owner separation, no direct
   verifier stats membership, and actual grantor authority. Effective stats
   USAGE or CREATEROLE alone is insufficient: the current migrator must hold a
   direct `ADMIN OPTION` on the stats role or already be a superuser. This path
   never grants either capability to the migrator.
2. Run `operation=grant`, again with no grant run ID. The sole persistent SQL
   change is `GRANT pg_read_all_stats TO "pscale_api_qodocjs6vgrb" WITH INHERIT
   TRUE`. PostgreSQL 17 defaults ADMIN to false and SET to true. Both options
   and the recorded grantor are checked, along with unchanged unrelated role
   attributes and direct memberships. Existing membership, including
   non-inherited or differently attributed grants, is a stop condition.
3. Download `planetscale-verifier-stats-<run_id>`. A successful result is
   `GRANTED_AND_RECONNECTED`, `mutationOutcome=COMMITTED`, with a new verifier
   connection confirming visibility and a fresh catalog connection confirming
   the exact direct membership. Evidence contains role/catalog metadata and
   booleans only; no URL, password, provider token, query text, or table rows.
4. Rerun the unchanged **PlanetScale cutover identity preflight** on the exact
   current merged main SHA. A pass still does not certify a cutover or release.

For rollback, use `operation=revoke` and the original `grant_run_id`. The
workflow fetches the receipt from a completed `main` run of this same workflow
and binds its SHA, run ID, target, SQL origin, empty original membership and
   introduced grant (including its catalog tuple and transaction identity) to
   the current catalog. Only that grantor's membership is
revoked with `RESTRICT`. Unexpected rows/options or dependencies stop the
operation; there is no CASCADE or general permission-repair path.

The workflow shares migration serialization and uses a bounded advisory lock
for its own permission operations. Coordinate any other manual role changes.
If COMMIT or ROLLBACK has an uncertain outcome, do not retry a write: preserve
the artifact and inspect current membership first. A failed reconnect after
an acknowledged COMMIT is reported as committed but unverified, with its
introduced-grant receipt retained for bounded rollback. Existing grants are
never adopted as introduced by a later run.

PostgreSQL 17 authority/options semantics:
[GRANT](https://www.postgresql.org/docs/17/sql-grant.html),
[membership catalog](https://www.postgresql.org/docs/17/catalog-pg-auth-members.html),
[REVOKE](https://www.postgresql.org/docs/17/sql-revoke.html).

The required PG17 test creates and drops its own local database and NOLOGIN
fixture roles, using session authorization to exercise real non-superuser
catalog authority, the exact grant, and attributed rollback. Its client
transport maps that owned disposable database name to `postgres` for the
production identity assertion; provider/main responses are synthetic. This
tests actual PG17 membership behavior, not a live provider target or grantor.
