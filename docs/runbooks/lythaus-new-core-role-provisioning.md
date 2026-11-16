# New-core first live step: roles and credential delivery

Status: **LOCAL PREPARATION ONLY — NOT APPROVED OR APPLIED**.

This proposal covers only PlanetScale organization `lythaus`, database
`lythaus-new-core` (`87dbkhprjh30`), branch `main` (`xwkb9quljkzd`), logical
database `postgres`, AWS Frankfurt, existing PS-5 ARM with zero replicas.
It does not authorize application-schema installation, Hyperdrive changes,
Access changes, deployment, production imports, traffic changes or new spend.
The existing broad role, old database, old credentials and all existing
Cloudflare bindings stay unchanged.

## Exact role and grant scope

| Role label | Creation method | Credential in this step | Initial database privilege |
| --- | --- | --- | --- |
| `lythaus_migrations` | PlanetScale roles API, generated SQL identifier | One unique provider-generated password | `CONNECT`, plain `CREATE`; no grant option or database ownership |
| `lythaus_admin` | PlanetScale roles API, generated SQL identifier | One unique provider-generated password | `CONNECT` only |
| `lythaus_verifier` | PlanetScale roles API, generated SQL identifier | One unique provider-generated password | `CONNECT` only |
| `lythaus_runtime` | SQL `CREATE ROLE` with literal name | None: `NOLOGIN PASSWORD NULL` | No new database grants |
| `lythaus_jobs` | SQL `CREATE ROLE` with literal name | None: `NOLOGIN PASSWORD NULL` | No new database grants |
| `lythaus_privacy` | SQL `CREATE ROLE` with literal name | None: `NOLOGIN PASSWORD NULL` | No new database grants |

Each managed-role request is exactly the following profile, with `name` set
to one of the three managed labels:

```json
{"name":"lythaus_migrations","inherited_roles":[],"ttl":0,"with_replication":false}
```

The provider API issues a password when it creates a managed role. Its API
does not expose a passwordless/NOLOGIN creation option. PostgreSQL SQL roles
are supported by PlanetScale and are not listed by the managed-role API, so
runtime/jobs/privacy are created through the existing administrative SQL
session without issuing passwords. Their later activation is out of scope.
`ttl: 0` avoids expiry of a future object-owning role; later credential
rotation must preserve the role and its owned objects.

The exact initial SQL is below. Managed identifiers are resolved privately
from the just-created provider records, validated and quoted by the helper;
they do not include the branch suffix used in connection usernames.

```sql
CREATE ROLE lythaus_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD NULL;
CREATE ROLE lythaus_jobs NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD NULL;
CREATE ROLE lythaus_privacy NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD NULL;
GRANT CONNECT ON DATABASE postgres TO
  "<migration_sql_role>", "<admin_sql_role>", "<verifier_sql_role>";
GRANT CREATE ON DATABASE postgres TO "<migration_sql_role>";
```

No application table, function, sequence, schema, seed, membership, bootstrap
latch or audit row is created in this step. The full canonical object grants
in `database/planetscale/grants/roles.sql` and the aggregate verifier grants
are reserved for the separately approved schema step.

## Why plain CREATE is sufficient

The earlier proposal required `CREATE WITH GRANT OPTION`. A focused disposable
PostgreSQL 17.11 experiment showed that plain `CREATE` creates application
schemas successfully. The grant option only suppresses a warning for a
redundant database `REVOKE`; it does not revoke a privilege granted by another
administrator. It is not required and will not be granted.

The provisioning administrator explicitly supplies `CONNECT` and verifies
that only the migration role has database `CREATE`. Later canonical grants
run as the migration role. Their redundant database-level statements may
produce PostgreSQL notices `01007` and `01006`; these are not evidence that a
privilege was changed. The installer checks effective privileges before any
schema DDL and again afterward. It rejects grant option, database ownership,
unexpected role memberships, unsafe role attributes, enabled deferred logins,
and database `CREATE` held by a non-migration scoped role.

After the separately approved schema work, the original provisioning grantor
can remove the temporary database privilege with a separately approved:

```sql
REVOKE CREATE ON DATABASE postgres FROM "<migration_sql_role>" RESTRICT;
```

Then verify effective database `CREATE` is false and no grant option remains.
This does not remove the migration role, its application-object ownership or
the admin/bootstrap state. There is no grant option to remove in this plan.
Credential rotation/retirement is a distinct later action, never role deletion.

## Protected credential delivery

Use a new GitHub Environment named `lythaus-new-core-rehearsal` in
`AsoraKK/Lythaus` (repository ID `1010752912`). Its exact approved source SHA
and only execution branch `codex/new-core-provisioning` are pinned. An owner
review is required before the job receives secrets. No existing environment
or production workflow is repointed. The dedicated workflow is
`.github/workflows/lythaus-new-core-role-provisioning.yml`.

The environment is currently absent (read-only GET returned 404). Its
creation, protection rules and dedicated branch rule are part of the proposed
first-step approval; nothing creates it during local preparation.

Private prerequisites must be entered through trusted secret settings, never
chat, source files, action inputs or artifacts:

| Input | Purpose and limit |
| --- | --- |
| `LYTHAUS_NEW_CORE_PROVISIONER_DATABASE_URL` | An existing authorized administrative connection to this exact new branch. No Hyperdrive-password extraction, old-database connection, default-password reset or new broad credential fallback. |
| `LYTHAUS_NEW_CORE_ENVIRONMENT_WRITER_TOKEN` | Short-lived fine-grained GitHub credential limited to this repository's Environments write permission, used only for the named environment secrets. `GITHUB_TOKEN` with contents-read cannot perform this delivery. |
| `PLANETSCALE_API_TOKEN` | Existing authorized service-token pair, consumed inside Actions for exact-target metadata and the three approved role creations. No token rotation or permission expansion is included. |

The provisioner URL is not presently available or live-verified. The executor
must verify its branch-qualified username, approved origin fingerprint,
`postgres` database, TLS `verify-full`, connected identity, PostgreSQL 17,
empty application target and sufficient existing administrative authority
before creating any managed role. Missing authority stops the operation;
local tests do not establish live SQL authority.

Only these five destination secrets are written to that environment:

- `LYTHAUS_NEW_CORE_DELIVERY_CANARY` — a noncredential random storage probe
- `LYTHAUS_NEW_CORE_MIGRATION_DATABASE_URL`
- `LYTHAUS_NEW_CORE_ADMIN_DATABASE_URL`
- `LYTHAUS_NEW_CORE_VERIFIER_DATABASE_URL`
- `LYTHAUS_NEW_CORE_ROLE_IDENTIFIERS`

Each newly returned password stays in process memory and is delivered through
encrypted GitHub secret storage. The helper rejects existing destination
secret names and does not intentionally overwrite them. A dedicated concurrency
group prevents overlapping runs of this workflow. There is no log/artifact
intermediary, password output, API response dump or generic database fallback.
Runtime/jobs/privacy passwords, an HMAC key and the owner identity are not
issued or stored in this first step. No Cloudflare secret is changed.

## Verification and partial completion

Before mutations, validate the environment protection, source pin, provider
target and existing broad-role identity, secret destinations and SQL grant
authority. Reuse the prior read-only target/caching/TLS evidence during
preparation; refresh mutation preconditions only when an approved run executes.
After those checks, deliver the noncredential canary through the same encrypted
secret-writing path before any PlanetScale role creation. A successful metadata
GET alone does not establish secret-write permission. If the canary write fails,
no role is created. It is retained, never used for authentication and never
overwritten automatically.

Managed-role creation and GitHub delivery occur sequentially. There is no
cross-provider transaction. The three SQL NOLOGIN creations and initial grants
are performed together in a database transaction. Verify six distinct scoped
roles, exactly three LOGIN/three NOLOGIN roles, no inherited roles or unsafe
attributes, no scoped role as database owner, migration-only plain `CREATE`,
and required `CONNECT`. Re-read provider metadata to prove the original broad
role was retained. Record only sanitized labels, counts, hashes and statuses.

The provider inspector accepts the three managed scoped logins alongside the
preserved broad role, but returns SQL verification pending for the three
deferred roles. A provider inventory alone never proves their existence or ACLs.

If any creation or delivery fails, stop immediately. Do not retry a potentially
successful POST, reset a password, overwrite a secret or create a duplicate
role. Preserve any roles and encrypted secrets already created. Emit the last
completed stage and affected role label; an ambiguous POST is an unknown
creation outcome requiring read-only reconciliation. A SQL failure rolls back
that SQL transaction, not earlier provider/API or GitHub changes. A fresh
reviewed recovery plan is required before continuing; no deletion or automatic
credential reset is included.

This step changes no cluster size, replica count, database/branch, subscription,
billing limit or traffic. It uses the public repository's standard hosted
runner and no uploaded artifacts. If execution requires a paid resource,
subscription change or new spend, stop: this proposal authorizes none.

## Acceptance remains separate

Provisioned roles do not establish application or owner acceptance. After
separately approved schema, Hyperdrive, Access and deployment work, the exact
owner identity supplied privately must sign in afresh and open the normal
protected `/flags` page on `admin-new-core-test.lythaus.co` at the isolated
approved build. Verify exactly one admin, consumed latch, one completion event,
no non-admin elevation, and refusal of a second bootstrap run.

Production cutover and a fresh sign-in at `admin.lythaus.co` are distinct later
gates. They are not implied by the isolated test or this first-step approval.

Provider references: [PlanetScale roles](https://planetscale.com/docs/postgres/connecting/roles),
[create-role API](https://planetscale.com/docs/api/reference/create_role), and
[GitHub environment secrets](https://docs.github.com/en/rest/actions/secrets#create-or-update-an-environment-secret).
