# Owner-controlled initial role setup for new-core

Status: **PROPOSAL ONLY. No provider connection, credential creation, setting
change or SQL execution is authorized by this document.** An existing restricted
provisioner is **UNVERIFIED**, not a prerequisite the owner must locate.

## Current selected interface: PlanetScale SQL console

The owner explicitly selected the PlanetScale SQL web console. Use
[new-core-console-logins.sql](../../database/planetscale/provisioning/new-core-console-logins.sql)
for the already-approved three-login creation scope. The terminal/CLI-managed
route below is retained as an alternative, not a prerequisite.

The owner has now supplied a transcript whose final complete attempt matches
the reviewed login SQL after removal of comments/whitespace. It includes DO
completion, three correctly labeled credential rows with distinct generated
passwords and branch-qualified usernames, and COMMIT. An earlier incomplete
paste caused an unterminated-dollar-quote error; it is not the final outcome.
Record **OWNER_REPORTED_THREE_SQL_LOGINS_COMMITTED** and do not rerun or reset
the roles. Password values were omitted from assistant output and receipts.
The owner must save them privately. Cleanup after this new console session
has not yet been confirmed.

The next separately approved transaction is
[new-core-console-initial-grants.sql](../../database/planetscale/provisioning/new-core-console-initial-grants.sql).
It accepts the three existing SQL logins and their three ADMIN-only creator
memberships, creates runtime/jobs/privacy as NOLOGIN PASSWORD NULL, grants
CONNECT to the three logins and plain database CREATE to migrations only.
It then requires six safe roles and exactly six ADMIN-only, INHERIT-false,
SET-false creator memberships to durable `postgres` before COMMIT. All SQL
identifiers are fixed canonical names; it needs no private map or passwords.
It runs no migrations, installs no application schema and alters no Lythaus
admin state. This privilege-changing transaction has not been approved or
executed live. It passed a disposable PG17 rehearsal with the three preexisting
SQL-created logins, a synthetic extension catalog, rollback after a deliberately
failed final postcondition, a successful run and refusal of a repeat.

The SQL block creates `lythaus_migrations`, `lythaus_admin`, and
`lythaus_verifier` directly as PostgreSQL LOGIN roles. PlanetScale supports
SQL-created roles and routes their connections using `.xwkb9quljkzd` usernames,
but does not display them in the managed Roles list. Do not run this block if
the three purpose-equivalent roles were already created using the UI/API/CLI.
The guard refuses existing canonical SQL names without resetting credentials.

Temporarily enable console access for this new database only, connect to
`main`, Primary, `postgres`, and run the whole SQL block. It verifies the
durable creator, PostgreSQL 17, absent ledger, empty application catalog and
the exact provider-extension baseline before creating roles. It grants no
database or application privileges, installs no extension/schema and creates
no runtime/jobs/privacy credential. Automatic creator ADMIN-only memberships
are checked; none of the logins inherits or can SET another role.

PostgreSQL generates three distinct 64-character passwords using core random
UUID generation, sets SCRAM encryption and returns the new credentials only
in the owner's private console result. No password literal appears in the
prepared script. Save all three rows directly to the owner's password manager;
do not paste the result into chat or export it into a receipt. The temporary
delivery table is dropped at COMMIT. Require COMMIT, not ROLLBACK; on any error
run ROLLBACK and stop. Never rerun after success. Disconnect and restore the
console toggle to off afterward.

Only a sanitized success report is needed: three roles committed and passwords
saved. Connection usernames are `lythaus_migrations.xwkb9quljkzd`,
`lythaus_admin.xwkb9quljkzd`, and `lythaus_verifier.xwkb9quljkzd`. No connection
string or password is needed by the assistant. Existing broad roles and all
old-database resources remain untouched by this command.

This selects SQL-managed login lifecycle instead of the earlier API-managed
identifier contract. Before the separately approved initial-grant/schema
steps, adapt the role-map, provider inspector and creator-membership contract
to explicit SQL-console mode and validate them locally. Existing API-managed
checks intentionally remain blocked for these SQL identifiers; no generic
fallback or pretending the roles exist in API inventory is allowed. The
initial-grant and schema steps are not authorized by this three-login command.

The generated SQL was exercised on disposable PostgreSQL 17 with a synthetic
HypoPG catalog fixture: three unique SCRAM passwords, successful password
authentication for all three logins, wrong-password refusal, unexpected-object
refusal, repeat refusal and removal of the temporary password table. No live
PlanetScale execution has been performed by the assistant.

Exact destination: organization `lythaus`, database `lythaus-new-core`
(`87dbkhprjh30`), branch `main` (`xwkb9quljkzd`), logical database `postgres`,
AWS Frankfurt. This is the existing single-node rehearsal cluster. Original
`lythaus-core`, its credentials and Cloudflare resources are excluded.

## Compare supported paths first

| Path | Temporary authority and custody | Removal and limits | Recommendation |
| --- | --- | --- | --- |
| Owner uses PlanetScale web console on the new branch | Existing organization/database Administrator signs in; PlanetScale creates a short-lived connection role. Primary console grants administrative access. No administrator password or provisioner token enters GitHub. | Disconnect, verify its session ended and the temporary role is removed or no longer usable. Production-console access may be disabled; enabling it is a separate database-setting decision. | Smallest path if console is already enabled and its stable-role checks pass. |
| Owner uses a new managed setup role locally, TTL 30 minutes, inheriting `postgres` | A new broad, branch-specific login and password exist on the owner's machine only. Needs explicit credential-creation approval. | Close sessions; remove only this newly created role through provider lifecycle controls once zero ownership/dependencies are proven. TTL is a backstop, not proof that existing sessions ended. | Supported alternative if console is unavailable or enabling it is undesirable. |
| Create a restricted provisioner for Actions | An owner must first grant `CREATEROLE` and database grant options, issue another credential, store it in GitHub, then retire it. Needs an independent dispatcher and owner review. | Revoke its grant authority, disable authentication, reconcile automatic role-management memberships; more steps and another credential. | Unnecessary for a one-time owner setup. No existing provisioner is assumed. |

PlanetScale documents the [web console](https://planetscale.com/docs/postgres/web-console)
and its temporary roles, production access and Administrator permissions.
[Role management](https://planetscale.com/docs/postgres/connecting/roles) supports
dashboard/API-managed logins and SQL-created roles. The
[CLI role reference](https://planetscale.com/docs/cli/role) supports role TTLs
and inheritance from `postgres`; `pscale connect` is not supported for Postgres.
These are documented capabilities, not proof of this branch's current settings.

### Owner-reported diagnostic evidence

The owner supplied console results for the approved read-only diagnostic:
PostgreSQL major 17, database `postgres`, durable creator/switch/grant authority
all true, migration ledger absent, no canonical SQL-label collisions and no
PUBLIC database CREATE. The first query counted one additional namespace and
two relations. The follow-up identified exactly:

| Namespace | Relation | Kind | Extension |
| --- | --- | --- | --- |
| `pscale_extensions` | `hypopg_hidden_indexes` | View | `hypopg` |
| `pscale_extensions` | `hypopg_list_indexes` | View | `hypopg` |

Both relation and schema owner-is-`postgres` flags were false. The catalog
dependency query establishes extension membership; do not infer the actual
owner identifier from those booleans. PlanetScale documents that
[HypoPG is installed by default](https://planetscale.com/docs/postgres/monitoring/schema-recommendations#caveats).
These views explain the observed counts and are extension baseline objects,
not evidence of Lythaus application relations. Preserve them and the extension.
Both transcripts include completed ROLLBACK results. This is owner-supplied
evidence, not an independent assistant connection or complete schema fingerprint.

Local guards now recognize only an empty catalog or the exact two-view HypoPG
baseline. They check extension membership, namespace/extension/view ownership
consistency and unexpected namespace dependencies. Extra schemas, relations,
unowned functions/types or detached extension views cause rejection. The
owner-reported query did not check all those ownership/dependency conditions;
the stronger live guard must still pass before writes. There is no general
`pscale_*` exclusion and no extension removal to force a pass.

The owner has confirmed console disconnection. Restoration of the access toggle
to off and cleanup of the temporary provider login remain unverified. No
role/grant or schema writes were authorized by these diagnostics.

The temporary primary Administrator session is broad: the documented `postgres`
role has CREATEDB, CREATEROLE, replication, BYPASSRLS and inherited data/admin
permissions, while remaining NOSUPERUSER. The session can do more than the
reviewed statements. Owner custody, exact branch selection and short duration
bound its use; this proposal does not mislabel it as a narrowly privileged SQL
operator. The six application roles never receive that administrative authority.

## What the owner would do

Each stage below needs its own explicit execution scope. Nothing in this plan
asks for the owner's password, OTP, provider session, or database password in chat.

1. **Inspect the dashboard only.** Sign into PlanetScale yourself; select
   `lythaus` → `lythaus-new-core` → `main`. Confirm database and branch IDs above,
   and inspect whether Console is available. Do not click **Connect**, create
   roles or toggle settings during this availability check. The console
   setting is at database scope; never open the old database to change it.
2. **Choose a connection path.** If Console is enabled, request only a temporary
   owner console session for the exact new branch, Primary, logical database
   `postgres`. Opening it creates a provider-managed temporary role, so even
   a catalog-only session is a distinct credential/session authorization.
   If disabled, stop: compare temporarily enabling console on this database
   (then restoring its original setting) with the 30-minute owner-local role.
   No default-password reset or existing broad-role credential is required.
3. **Verify authority before creating application roles.** In a read-only
   transaction, check PostgreSQL major 17, `postgres` database, empty application
   catalog, absent migration ledger and no six-role label collisions. Inspect
   the console session's ability to `SET ROLE postgres`, the `postgres` role's
   `CREATEROLE`, and its database ownership or `CONNECT`/`CREATE` grant authority.
   Verify the exact dashboard/provider branch identity. After stage 4, resolve
   the three managed SQL identifiers from that branch's metadata before any SQL
   writes. SQL database name alone cannot prove the branch; pair
   the dashboard/provider identity with the private role map. Record only
   booleans, counts and identifier hashes. Roll back the read-only transaction.
   The prepared [catalog diagnostic](../../database/planetscale/verification/new-core-owner-setup-preflight.sql)
   returns only booleans/counts and performs no persistent writes. The owner
   has supplied its results above; it must not be appended to a migration or
   used to auto-continue into role creation.
4. **Create only three managed logins, after separate approval.** In the new
   branch's Settings → Roles, create `lythaus_migrations`, `lythaus_admin` and
   `lythaus_verifier`. Clear default data-role selections: inherited roles must
   be empty; replication off; no expiry. The exact API equivalent is
   `{"name":"<label>","inherited_roles":[],"ttl":0,"with_replication":false}`.
   If dashboard cannot express that exact profile, stop and choose an owner-local
   API/CLI operation for that profile; do not accept broader defaults. Store
   each unique provider-generated password directly in the owner's private
   password manager. Keep a private six-label map of SQL identifiers (managed
   base usernames, without `.xwkb9quljkzd`; deferred names remain literal).
   No provisioner or GitHub writer credential is needed for this path.
5. **Apply only initial roles/grants, after separate approval.** Resolve the
   three placeholders below from the privately checked managed-role records.
   Use the same connection and one transaction. `SET LOCAL ROLE postgres`
   makes the durable administrator the grantor/role creator; never issue lasting
   grants as the console's temporary login. First prove `SET ROLE` is allowed;
   if it is not, stop instead of inventing a membership grant or running as a
   temporary grantor. Validate all postconditions before committing.

### One-command managed-login batch in the owner's terminal

The owner has approved the three managed LOGIN creations and confirmed that
console access is off. Instead of three dashboard forms, the supported CLI
batch is [create-new-core-managed-logins.sh](../../scripts/planetscale/create-new-core-managed-logins.sh).
Download/save that script on the owner's machine. It requires Bash, Python 3,
and the PlanetScale CLI authenticated as the owner (`pscale auth login` if not
already signed in). Run it in a private interactive terminal:

```sh
bash ./create-new-core-managed-logins.sh
```

This command is for the computer terminal, not the SQL web console. It checks
the exact database/branch IDs and cluster profile, requires the one preserved
original API role and no existing scoped labels, then creates only the three
approved managed roles. Each password appears directly in the owner's terminal;
save it to the private password manager and type SAVED before the next role is
created. The script does not store passwords in files or print them to its
redirectable stdout. Do not run it in CI, a recording, or a logged terminal.
It performs final read-only inventory checks after the three creations.

A failure or partial state causes a stop; it never retries a creation, resets
credentials or deletes a role. Preserve saved credentials and reconcile before
continuing. The batch does not run SQL, issue grants, create schemas or change
console settings. It needs no database administrator password or GitHub token.

SQL-created roles are a different supported provider path: they are absent
from PlanetScale's managed Roles list and have separate credential lifecycle
handling. They are not a silent substitute for the approved three managed
logins. Once the generated identifiers are resolved, the initial SQL role/grant
step can also be one guarded transaction, under its separate reviewed scope.
No request for “more” automatically includes schema installation, production
data, deployment or cutover.

The exact SQL shape for stage 5 is below. It is a review template, **not a
ready-to-run script**: generated identifiers and the live preflight evidence
must be resolved and reviewed first.

The guarded implementation is `scripts/ci/lythaus-new-core-owner-grants.mjs`.
It only generates SQL; it has no SQL execution or provider API capability.
With a private six-label role map outside the repo, the owner can later use:

```sh
node scripts/ci/lythaus-new-core-owner-grants.mjs --write-private-sql /private/path/roles.json /private/path/owner-grants.sql
```

The map must be a regular file with mode 0600. Both paths must resolve outside
the repo; the output is new mode-0600 SQL and is never overwritten. This is
not an execution command and is not needed before the three managed roles
exist. No password goes into this map or script. A guarded DO block checks the
catalog and managed roles before CREATE/GRANT, rechecks all six roles and the
durable grantor before COMMIT, and refuses a repeat. Any exception aborts the
transaction; run ROLLBACK and stop. It has been exercised on disposable PG17.11
with a synthetic extension-membership fixture, including six catalog mutations,
failed guards, preserved provider views and a non-superuser stable grantor.
This is local SQL evidence, not a live PlanetScale execution claim.

```sql
BEGIN;
SET LOCAL ROLE postgres;
-- Abort unless current_user = 'postgres', current_database() = 'postgres',
-- PG major = 17, target empty, managed identifiers/profile verified,
-- and the three deferred roles are absent.
CREATE ROLE lythaus_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD NULL;
CREATE ROLE lythaus_jobs NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD NULL;
CREATE ROLE lythaus_privacy NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD NULL;
GRANT CONNECT ON DATABASE postgres TO
  "<migration_sql_role>", "<admin_sql_role>", "<verifier_sql_role>";
GRANT CREATE ON DATABASE postgres TO "<migration_sql_role>";
-- Verify all postconditions below in this transaction; ROLLBACK on failure.
COMMIT;
```

This keeps all six required roles. Runtime/jobs/privacy receive no password,
no login and no explicit database grant. Migration gets plain `CREATE`, with
no grant option; admin/verifier get `CONNECT`. No role is made database owner.
No schemas, tables, functions, seeds or bootstrap state are created.

PostgreSQL's non-superuser `CREATEROLE` behavior automatically grants the
creator ADMIN-only membership in each SQL-created role. Under this plan the
creator is durable `postgres`, not a temporary console role. Verify exactly
three such management memberships: ADMIN true, INHERIT false, SET false, and
no other memberships involving a scoped role. Pin the actual creator identifier
hash in the later schema candidate; the existing verifier supports this exact
management-only boundary. Provider-specific behavior that differs is a stop,
not an automatically accepted exception.

## Verification and removal of temporary authority

Before COMMIT, require six distinct scoped roles, three LOGIN/three NOLOGIN,
no SUPERUSER/CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS attributes on those six,
only the three allowed creator management edges, migration-only database
`CREATE`, no scoped database ownership and no grant options on scoped database
privileges. After COMMIT, check the three LOGINs can connect through owner-local
clients restricted to catalog reads. Deferred roles cannot authenticate.
`PASSWORD NULL` comes from the explicit reviewed DDL; independently verify only
boolean password-null results if the provider permits this catalog check.
Do not extract password hashes or claim a denied check passed.

Inspect database ACL grantors: the new `CONNECT` and `CREATE` grants must be
recorded under the durable grantor, with no dependency on the temporary session
role. Verify zero application schemas/relations and absent migration ledger.
Retain the original broad managed role's identity/profile. Store only sanitized
counts, hashes and outcomes; keep raw role identifiers and passwords private.

For the console route, `SET LOCAL ROLE` ends with the transaction; disconnect
the console explicitly and sign out of the owner dashboard session when done.
Through the scoped verifier connection, check the recorded temporary login has
zero sessions and is absent or cannot log in after provider cleanup. The docs
say it is short-lived but do not specify an exact lifetime or promise that
closing a tab immediately removes it. If cleanup cannot be confirmed, report
`TEMP_AUTHORITY_CLEANUP_PENDING`; do not certify complete removal. If console
access was separately enabled for this task, restore its original disabled
setting and verify it. Existing owner/admin privileges and `postgres` are
durable provider administration; this plan does not remove them or claim they
have expired. Only the additional setup session is temporary.

For an approved owner-local alternative, create one managed role named
`lythaus_owner_setup_once` with `inherited_roles:["postgres"]`, `ttl:1800`,
`with_replication:false`. No API service token is necessary if the dashboard
can express these settings. Use an owner-local TLS `verify-full` connection,
password prompt/private credential manager, username suffixed `.xwkb9quljkzd`,
and the approved origin fingerprint. Run the same durable-grantor transaction;
the temporary login must own nothing and must not be an ACL grantor. Close the
connection; prove zero sessions/owned objects/grant dependencies, then remove
**only that new temporary role** using the provider's exact role ID, under an
explicit cleanup approval. Do not request a successor or move application
ownership to make deletion succeed. A dependency causes a stop. Verify its
API/catalog absence and that a new login fails. Erase only its private local
credential entry after verification. Expiry alone is not session-termination
evidence. Never delete or reset an existing role or default credential.

Later, after separately approved schema installation, the durable grantor can
`REVOKE CREATE ON DATABASE postgres FROM "<migration_sql_role>" RESTRICT` and
verify it is no longer effective. Migration object ownership remains intact.
No `CREATE WITH GRANT OPTION` is granted to migration and none needs removal.

If a stage fails, preserve confirmed roles and private credentials, roll back
the open SQL transaction, and record uncertain outcomes. Never retry an
ambiguous credential-creation request, reset a password or mark a migration
applied. Partial managed-role creation is not undone by SQL rollback. Return
for a scoped reconciliation decision. A failed operation must not postpone
cleanup of an approved temporary session; use the approved cleanup procedure
and report anything that remains unknown.

## Optional Actions path and its identities

The revised local workflow has **only `workflow_dispatch`**. Publishing cannot
trigger this workflow; there is no push, PR, schedule, reusable-workflow or
repository-dispatch event. Dispatch requires the exact candidate SHA, the only
allowed target and an explicit roles-only confirmation defaulting false.
Both jobs pin `codex/new-core-provisioning`, repository ID and approved source.
The runner rejects pushes, reruns and changes in triggering actor before secrets.

GitHub permits users with write access to dispatch. This workflow further
requires one independently verified human dispatcher whose numeric ID is pinned
as `LYTHAUS_NEW_CORE_DISPATCHER_ID` at repository and environment scope, matching
the actual actor ID and a current write/maintain/admin repository permission.
The dispatcher must differ from `AsoraKK`, the sole required owner reviewer.
**Prevent self-review stays true.** Disable administrator bypass in the owner UI;
the documented REST environment schema cannot attest that setting. If it cannot
be disabled/verified, do not activate this workflow.

Only `AsoraKK` is verified in this task. A second eligible identity is
**UNVERIFIED**, so this automated path cannot presently execute. A second token
belonging to the same account is not a second identity. Do not create a bot or
relax the gate to work around this. The owner-console procedure is an explicit
owner-operated path outside Actions, not a claim of two-person approval.

GitHub also requires the workflow to exist on the default branch before an
initial manual dispatch. Publishing a feature branch alone does not register
that capability. Any later default-branch addition needs its normal separate
review; no merge or publication is authorized here. Execution remains limited
to the named feature branch and the separately pinned candidate SHA.

The optional Actions helper still accepts only an independently approved
restricted provisioner; it rejects the broad default administrator. This
document does not propose creating that provisioner for the recommended route.
No administrator connection or provider owner session goes into Actions.

For a later publishing/configuration operation only, a fine-grained GitHub
token would be scoped to `AsoraKK/Lythaus`: Contents write + Workflows write
for publication; Administration write for the environment and its deployment branch policy;
Variables write for repository pins; Environments write for environment pins;
Actions read for gate verification. Use an existing one-hour installation
token if suitable, otherwise a PAT expiring within 24 hours, revoked at finish
or abort. This token is not needed for owner-console setup and is not created
or stored now. No Actions write or repository Secrets write is needed for
publish/configuration alone. A future environment-writer credential is a
separate decision and cannot be restricted by GitHub to just one environment.

## Exact next decision

The owner-console route and read-only diagnostics have been completed through
owner-reported results and disconnection. **The next approval is only stage 4:
create three managed LOGIN roles on `lythaus-new-core/main`**, with the exact
empty-inheritance/no-replication/no-expiry profile, keeping their three unique
passwords in the owner's private password manager. First inspect the exact
branch's Roles list; any existing matching label causes a stop for reconciliation,
not a duplicate or reset. Leave the original broad role unchanged.

This credential-creation approval would authorize no SQL, role grants, GitHub
secret storage, publication, schema, Hyperdrive, Access, Worker, import or spend.
After creation, resolve and privately verify only the three generated base
SQL identifiers, then generate/review the guarded SQL and seek a separate
initial-grants approval. No password, connection string or provider session
needs to be pasted into chat. Keep console access off until that SQL session
is explicitly authorized. No unknown provisioner credential must be located.

Role setup is not owner acceptance. Later acceptance still requires the
privately specified owner to sign in freshly to the isolated test build, open
the normal protected `/flags` page, and prove exactly one admin, consumed
latch, one completion event, no non-admin elevation and refusal of a second
bootstrap. Production cutover and a fresh `admin.lythaus.co` sign-in are
separate gates. Schema, Hyperdrive, Access, deployment, import and spend are
not authorized by this proposal.

GitHub references: [manual workflow dispatch](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow),
[deployment review](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/review-deployments).
