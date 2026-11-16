# New-core schema installation approval

Status: **SCHEMA_INSTALLATION_APPROVAL_PENDING / CREDENTIAL_DELIVERY_BLOCKED**.
This is the next proposed write step. Preparation includes provider/catalog
reads and disposable local PostgreSQL only. No live schema installation is
authorized by this document. The original production workflow is not used.

## Candidate and exact destination

The local candidate's full commit, all 22 applied-payload checksums, grant
payload checksums and exact approval marker are emitted by:

```sh
node scripts/ci/lythaus-new-core-clean-install.mjs --schema-only-plan
```

The final handoff pins that full candidate SHA. A dirty worktree, changed
candidate or changed protected-main baseline stops execution. Protected
`AsoraKK/Lythaus/main` was independently read as
`ba10cfb16941cd163e345af3c00b9bd739884646`; the runner reads GitHub again before
opening database clients. Existing CI/bootstrap evidence is reused only for
unchanged source; this path does not dispatch any GitHub workflow.

| Field | Required value |
| --- | --- |
| Organization | `lythaus` |
| Database | `lythaus-new-core` / `87dbkhprjh30` |
| Branch | `main` / `xwkb9quljkzd` |
| Logical SQL database | `postgres` |
| Region | AWS `eu-central-1`, Frankfurt / `eu-central` |
| Existing cluster | `PS_5_AWS_ARM`, aarch64, zero replicas, Ready |
| PostgreSQL | major 17; latest read-only observation is 17.12 |
| Origin fingerprint | `30458dae9a257fc30c567ae95f44975fc766233fb11fc15d2542399bbdcd3558` |
| Migration manifest SHA-256 | `49e4497af7c2e8b1bfb4df5208774a68969211187f93ba4e1ef21c03067ab614` |

This is the existing single-node rehearsal target. No provider resource,
plan, cluster, storage setting or spend approval is included. Ordinary use
of the existing database is not a promise of zero metered usage.

## Before the first schema write

1. Require explicit approval matching the candidate, manifest, database ID,
   branch ID, origin fingerprint and six-role-map checksum. Do not infer
   schema approval from the earlier role/grant approval.
2. Read current protected main, PlanetScale database, branch and complete
   managed-role inventory. Require exact IDs, ready state, region, cluster,
   replicas, console access **off**, and no resize/configuration change or
   read-only/frozen transition. The only API-managed role must be the pinned
   original broad role, which remains unused and unchanged. SQL-created roles
   are absent from that API; this is not evidence they are absent in SQL.
3. Authenticate directly as `lythaus_migrations.xwkb9quljkzd`, using the
   pinned origin, database `postgres`, TLS `verify-full` with trusted system
   roots. Require both `session_user` and `current_user` to be the scoped
   migration role. An admin connection followed by `SET ROLE` is rejected.
   Take the installer session lock; refuse another active installer.
4. Require the exact empty PlanetScale catalog: extensions `hypopg` and
   `plpgsql`; one `pscale_extensions` namespace and exactly the views
   `hypopg_hidden_indexes` and `hypopg_list_indexes`. Verify direct HypoPG
   extension membership, consistent extension/schema/view owners, no foreign
   relation or namespace dependency, no public function/type, no application
   schema or relation and no `system.schema_migrations`. Preserve HypoPG.
   Require the three application extensions to be available and trusted:
   latest live observation is `pg_trgm` 1.6, `pgcrypto` 1.3 and `unaccent` 1.1.
5. Verify all six roles and the initial four durable database ACL entries.
   Require three LOGIN roles with nonexpiring validity, three NOLOGIN roles,
   safe attributes and NOINHERIT. Require exactly six creator memberships to
   durable `postgres`, each ADMIN true, INHERIT false and SET false; no other
   scoped memberships. Migration alone has database CREATE, without grant
   option or database ownership. No scoped role has CONNECT grant option.
6. Authenticate separately as `lythaus_verifier.xwkb9quljkzd` at the same
   exact origin, using a different password. Confirm a read-only session
   before starting migrations.

Every mismatch or missing credential stops before DDL. Metadata reads through
the PlanetScale connector do not establish that either scoped login works.
No Hyperdrive, Cloudflare Access or deployment readiness is needed for this
database-only path; their existing validators and later gates remain intact.

## Exact schema changes

Apply the unchanged, byte-pinned manifest in dependency order, 100,942 bytes:

```text
0000_preflight.sql
0001_extensions_and_schemas.sql
0002_core_tables.sql
0003_domain_extensions.sql
0004_launch_contract.sql
0005_auth_revocation.sql
0006_admin_role_expansion.sql
0007_contact_emails.sql
0008_legacy_relink_status.sql
0009_cost_budget_enforcement.sql
0010_native_runtime_parity.sql
0011_email_guest_auth_only.sql
0012_product_integrity_v2.sql
0013_marketing_waitlist.sql
0014_transactional_email_outbox.sql
0015_production_auth_acceptance_coordinator.sql
0016_transactional_email_envelope_boundary.sql
0017_authenticity_beta.sql
0018_authenticity_private_alpha.sql
0019_authenticity_alpha_hardening.sql
0020_auth_recovery_delivery.sql
0021_media_quarantine_cleanup.sql
```

Individual submitted-byte checksums are in
[the canonical manifest](../../scripts/ci/planetscale-migration-manifest.mjs)
and the generated approval plan. No dump, development seed, old-origin
migration helper, schema replay bypass, checksum rewrite or fabricated ledger
entry is allowed. Migration 0021 uses its reviewed transactional CREATE INDEX
on empty tables; the separately gated production maintenance helper is not used.

The outcome is 11 application schemas, 102 tables and 103 table/view relations,
plus `pg_trgm`, `unaccent` and `pgcrypto`. The guarded data-dependent files
0007, 0011 and 0012 must prove their exact affected data sets empty before
execution. An unexpected row stops that migration. There is no production
reference/data import: the only populated tables after installation must be
the 22-row migration ledger and the single false first-admin latch.

Install the canonical object grants/default privileges in
[roles.sql](../../database/planetscale/grants/roles.sql) and the isolated
[aggregate verifier](../../database/planetscale/grants/new-core-verifier.sql).
For this schema-only scope the reviewed adapter excludes exactly the two
database-ACL statements in roles.sql (GRANT CONNECT, REVOKE CREATE) and the
verifier's GRANT CONNECT. These are already-verified initial ACL preconditions,
not migrations. All object SQL is retained. A changed template or any further
database-ACL statement is refused. The generated plan hashes both resulting
payloads, and the complete database ACL/role state must remain identical.

| Existing role | Authorized schema result |
| --- | --- |
| `lythaus_migrations` LOGIN | Own canonical application objects; schema DDL and canonical object/default grants; retain existing plain database CREATE for this step |
| `lythaus_admin` LOGIN | Canonical admin object privileges; execute the one-shot bootstrap function; no direct INSERT on users or memberships; no DDL |
| `lythaus_verifier` LOGIN | CONNECT, schema USAGE and EXECUTE on the fixed aggregate state reader; no direct table/subject-digest read, bootstrap execution or DDL |
| `lythaus_runtime` NOLOGIN | Canonical application grants; no credential issued and no DDL |
| `lythaus_jobs` NOLOGIN | Canonical jobs grants; no credential issued and no DDL |
| `lythaus_privacy` NOLOGIN | Canonical privacy grants; no credential issued and no DDL |

Plain CREATE on `postgres` suffices for schemas and trusted extensions; object
ownership supplies authority for object grants. CREATE WITH GRANT OPTION and
database ownership are unnecessary and are rejected. The scoped migration
role cannot revoke the database CREATE granted by `postgres`. Its later
removal requires a separate owner-controlled grantor cleanup approval; this
step neither escalates to admin nor claims that cleanup has happened.

## Credential delivery and execution boundary

Use the existing scoped credentials from owner-controlled private custody,
delivered through private execution-environment credential settings into
`LYTHAUS_NEW_CORE_MIGRATION_DATABASE_URL` and
`LYTHAUS_NEW_CORE_VERIFIER_DATABASE_URL`. Never recover them from chat,
attachments, logs, a dump or the original database. No admin login is needed
or accepted. The admin credential is unused, and the three NOLOGIN roles stay
without passwords.

The runner also needs existing PlanetScale **read-only** API access as a valid
service-token ID/token pair in `PLANETSCALE_API_TOKEN` for database/branch/role
metadata, plus existing GitHub read access for protected main. Neither creates
SQL roles nor authorizes provider writes. No such new authority is created by
schema approval. If existing read authority cannot be delivered, stop and
resolve that prerequisite separately rather than use a broad database login.

The two scoped URLs and valid metadata token pair are currently unavailable to
the runner. Connected PlanetScale metadata/catalog reads already work, but
are a different credential route. **Approval alone does not remove this
execution blocker.** Keep secrets in owner custody and the private process
environment only; no GitHub secret, repository file, command argument,
receipt or workflow artifact. End the process and remove session-injected
variables after use; do not rotate/delete the persistent scoped credentials
under this schema-only approval. The dashboard SQL console is not the scoped
migration-login delivery path and stays off.

After approval, execute only the pinned clean checkout with the exact emitted
approval marker and source/origin/role pins:

```sh
node scripts/ci/lythaus-new-core-clean-install.mjs --apply-live-schema-only
```

Publishing cannot run this command: no workflow was added or dispatched for
schema installation. The existing production migration workflow and its
production secrets are excluded.

## Live verification and failure handling

Require all 22 filename/checksum ledger rows in order, release migration
postconditions, extensions, relation counts, object ownership and canonical
role boundaries. Compare these independently pinned local contracts:

| Contract | SHA-256 |
| --- | --- |
| Release relation inventory + ledger | `7fdff3474c152317336d2201626b3b69aac79387264e6481576e103f82e8342d` |
| Application definitions (1,943 catalog entries) | `69769fb59964a84355d5cc24e8f6c1a23595076a3d1d5f39e45add3e58dff90e` |
| Object/column/function/default grants (432 entries) | `65ae6c5e98cacafdd1de5fd58703bd5358a65b9f73781881ee35383debbb4513` |

Definitions cover relations, columns/defaults, constraints, indexes,
functions, views, triggers, enums and policies in the 11 application schemas.
Require migration ownership, no restricted-role CREATE, no extra catalog
objects, unchanged provider views, unchanged role/database ACL state, and no
data in any other application table. The verifier's normal login must return
zero memberships, one false latch and zero completion events without table
or raw subject access. Receipts contain only counts, hashes and safe status.

Each migration and its ledger writes are transactional; the final object-grant
bundle is a separate transaction. If anything fails, roll back the active
transaction, close both sessions and stop. Earlier committed migrations stay
on this isolated target. The earliest pre-ledger migrations may have committed
without a ledger if a later file fails before ledger creation. Do not infer
they are unapplied, rerun automatically, mark them applied, drop/reset the
database, delete roles or reverse committed grants. Inspect the partial state
read-only and request an exact repair decision. No traffic uses this schema,
and the original database/bindings remain the rollback destination unchanged.

## Separate acceptance gates

Schema verification is not administrator acceptance. A later separately
approved isolated Access/Worker setup must preserve all issuer, signature,
audience, hostname, owner allowlist and same-origin checks. The intended owner
signs in personally in a fresh browser session, uses the normal verified
subject mapping and one-shot bootstrap, then opens the normal protected
read-only `/flags` page on the exact isolated build at
`admin-new-core-test.lythaus.co`. A second bootstrap must refuse; one admin,
one consumed latch and one completion event must be proved, along with no
elevation for a non-admin in the approved test setup. No OTP, password, JWT,
raw subject or manual membership insertion is requested.

Until that human test passes, administrator acceptance remains pending.
Production cutover and a fresh sign-in at `admin.lythaus.co` are separate
approval/acceptance gates. This schema step includes no data import,
Hyperdrive/Access/binding change, deployment, traffic switch or new spend.
