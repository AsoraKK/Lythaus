# New-core clean replacement preparation

## Current status

Current execution handoff:
[schema-only installation approval](lythaus-new-core-schema-installation.md).
The six initial SQL roles and grants are live-verified, PostgreSQL 17.12 and
the exact empty HypoPG baseline were confirmed read-only, and console access
is off. Schema installation remains unapproved; private scoped credential
delivery is still blocked. The observations below describe the earlier
preparation snapshot and the later deployment gates, not permission to run
the production workflow or to re-provision existing roles.

**PREPARATION / LIVE CONFIGURATION BLOCKED.** The proposed test URL
`https://admin-new-core-test.lythaus.co/flags` is **NOT DEPLOYED**. No live
SQL connection, DDL, role or grant change, credential creation, Access change,
Worker publication, data import, or cutover was performed for this preparation.

This setup is pinned to the new PlanetScale `lythaus-new-core` database and
`main` branch, logical database `postgres`, database ID `87dbkhprjh30`, branch
ID `xwkb9quljkzd`, AWS `eu-central-1` / Frankfurt (`eu-central`), and Hyperdrive
ID `7e39fc4a286147988ed12df7a6322616`. The dedicated test Worker is
`lythaus-admin-api-new-core-test` in Cloudflare account
`e5b7ae46e04698f507b7e4b3d4ef1af0`, at
`admin-new-core-test.lythaus.co`. Its normal admin page is `/flags`.

The provider reports cluster `PS-5 aarch64` with zero replicas. This is a
single-node rehearsal target; the metadata does not establish production
readiness or a production capacity recommendation.

The existing `lythaus-core/main` database and every existing Cloudflare Worker,
Pages project, and binding are out of scope. This runbook never uses their
database URLs, secrets, audit/recovery/rebind flows, data, or bindings.
This session made no live changes. A separate before/after snapshot comparison
of the existing production database/bindings was not available, so this is not
an independent unchanged-state attestation.

## Current provider evidence and remaining blockers

The sanitized, read-only GitHub Actions run [43835553248](https://github.com/AsoraKK/Lythaus/actions/runs/43835553248), from inspector source
`18c24397e8518c0eae76b650cd9862f9cbb8d4a3`, returned HTTP 200 from both
providers. Its local sanitized receipt is
`/workspace/scratch/lythaus-new-core-live-readonly/43835553248.json`. The
Hyperdrive ID, new branch ID `xwkb9quljkzd`, logical database `postgres`, and
origin fingerprint
`30458dae9a257fc30c567ae95f44975fc766233fb11fc15d2542399bbdcd3558` match;
caching is disabled. The raw origin and usernames are not stored here.
The target manifest marks this as a historical read-only snapshot; every live
apply attempt must re-read current provider metadata and match the current
candidate's approvals.

Hyperdrive reports an `mtls` object, but omits both `sslmode` and
`ca_certificate_id`. The required `verify-full` plus explicit CA verification
therefore remains **unverified**. Cloudflare documents encrypted `require`
mode as the default; the missing fields do not imply plaintext. PostgreSQL
major version is not exposed by these provider metadata endpoints and remains
**unknown**.

PlanetScale reports the exact database and branch, PostgreSQL kind, ready
state, AWS `eu-central-1` / Frankfurt region, `PS_5_AWS_ARM` cluster, and zero
replicas. Its role inventory contains one ready, nondeleted, unexpired role
whose username matches the Hyperdrive origin. It has no canonical role label
and inherits `pg_read_all_data`, `pg_write_all_data`, and one additional role.
This identity is unsuitable for the Admin Worker and must remain unused and
unchanged. The setup requires six distinct scoped roles: managed logins for
migrations, admin and verification, plus SQL `NOLOGIN PASSWORD NULL` roles for
runtime, jobs and privacy. SQL-created roles are not listed by the provider's
role API; the catalog check must prove all six. The updated local inspector
allows the preserved broad role without counting it as a scoped role. No
credentials were created by the read-only probe.

Published pricing is reference only, not spending approval. PlanetScale lists
the observed single-instance `PS-5` ARM compute at $5/month; storage and usage
are unknown. Cloudflare documents a $5/month Workers Paid base with 10 million
requests and 30 million CPU milliseconds included, with documented overages;
Hyperdrive is included with unlimited queries and no separate pooling, cache,
or egress charge. Current account plan/allowances and Access seat availability
are unverified. The target manifest records these rates; the source details are
in `/workspace/scratch/lythaus-new-core-live-readonly/pricing-reference.json`.
No plan or resource changes were made, and
one-time/monthly ceilings remain unapproved.

The live read-only evidence establishes destination identity and caching, but
not sufficient TLS, SQL version, or least-privilege role setup. Live DDL,
grants, credentials, Worker activation, Access configuration, and deployment
remain blocked pending their distinct approvals and the unresolved target
preconditions.

## Prepared local path

The clean installer is `scripts/ci/lythaus-new-core-clean-install.mjs`.
`--plan` is read-only; `--rehearse-local-pg17` accepts only a credentialless
loopback PostgreSQL URL. `--apply-live` is implemented for review but fails
closed until the pinned target attestations, approved candidate SHA, role
inventory, origin fingerprint, cost ceiling, four scoped approvals, and
branch-qualified migration/verifier URLs are present. It has no generic
`DATABASE_URL` fallback, no production workflow path, and no deployment action.

The [owner-controlled initial role setup](lythaus-new-core-owner-setup.md) is
the preferred one-time bootstrap proposal; an existing restricted provisioner
is unverified. The optional role-provisioning workflow is now dispatch-only,
requires a distinct eligible dispatcher and owner approval with self-review
prevention, and cannot start on publication. No second dispatcher is verified.

The live runner re-reads PlanetScale database, branch, and role metadata and
the exact Hyperdrive configuration before creating SQL clients. It verifies
the branch-qualified URLs, origin fingerprint, database name, TLS mode, and
connected database/user. It checks the new target is empty, all six roles are
present and distinct, roles have no superuser/database/role-creation/BYPASSRLS
attributes, and no runtime role memberships exist **before the first migration**.
The only allowed membership exception is the three PostgreSQL-created
`ADMIN TRUE, INHERIT FALSE, SET FALSE` grants for deferred NOLOGIN roles to the
provisioner whose identifier hash is explicitly pinned in the approved target
manifest. That hash must come from the separate provisioning receipt; without
it the installer rejects the memberships.
The migration login must arrive with plain `CREATE` on database `postgres`,
**without grant option**, provisioned by an explicitly authorized administrator
of this exact new branch. That administrator supplies the required `CONNECT`
grants and verifies other scoped roles have no database `CREATE` before any
migration. The migration login must not own the database
and must not have superuser, `CREATEDB`, `CREATEROLE`, replication, `BYPASSRLS`,
or inherited role privileges. The runner verifies these properties before
DDL, including the three required `NOLOGIN` roles, then confirms all application schemas, relations, and functions are owned
by the migration login and restricted logins have no database/schema `CREATE`.
The disposable rehearsal provisions only this narrow grant, runs migrations
and canonical grants under `SET ROLE lythaus_migrations`, and verifies the
application-object owners. Public extension objects are outside the
application schemas. A focused PostgreSQL 17 experiment proved plain `CREATE`
works. Canonical database-level `GRANT CONNECT` / `REVOKE CREATE` statements
from the migration session can emit notices `01007` / `01006`; the provisioner
has already established their required state. Grant option would only remove
a revoke notice and cannot revoke privileges issued by another grantor. It is
therefore not issued or needed. The installer independently checks the actual
database ACLs before DDL and after canonical grants; it does not rely on those
redundant revoke statements to remove privileges.
It applies each committed migration file in its own transaction, records the
exact ledger checksum, and never calls the legacy `ci-*` generic URL runner or
the production 0021 cleanup helper. A partial install stops for review; there
is no automatic DROP, TRUNCATE, rollback cleanup, role deletion, or credential
revocation.

The planned role labels are `lythaus_migrations`, `lythaus_runtime`,
`lythaus_admin`, `lythaus_jobs`, `lythaus_privacy`, and `lythaus_verifier`.
The three managed `pscale_api_*` SQL identifiers must be mapped from provider
metadata; their labels are not SQL identifiers. The deferred SQL roles use the
literal names `lythaus_runtime`, `lythaus_jobs`, and `lythaus_privacy`. The
installer does not create roles or credentials. Provisioning the six roles,
their initial database grants, and only the three required credentials needs
the separate approval described in [role provisioning](lythaus-new-core-role-provisioning.md).
The Admin Worker
must use only the new Hyperdrive Admin role. The verifier receives only a
fixed `SECURITY DEFINER` aggregate returning membership/latch/audit/control
plane counts; it cannot select the subject digest, memberships, user rows, or
audit records directly.

## Exact migration and data gates

The installer pins the 22 committed migrations, 100,942 bytes, and migration
set SHA-256
`49e4497af7c2e8b1bfb4df5208774a68969211187f93ba4e1ef21c03067ab614`. It
requires PostgreSQL 17 and the extensions `pgcrypto`, `pg_trgm`, and `unaccent`.
The development-only seed `database/planetscale/seeds/0001_feature_flags.sql`
is not part of this hosted setup. Only canonical reference rows explicitly in
the pinned migrations and the one-shot bootstrap latch are installed.

Three migrations contain data-changing or object replacement statements. They
are never silently skipped, altered, or checksum-spoofed:

| Migration | Potential operation | Required clean-target evidence |
| --- | --- | --- |
| `0007_contact_emails.sql` | Replaces the legacy `privacy.subject_data_locations` table when its old `id` column exists; drops the old retention-function signature before creating the canonical signature. | The legacy table has zero rows (or that old table layout is absent). |
| `0011_email_guest_auth_only.sql` | Deletes retired `auth.*` feature flags. | The exact deletion predicate returns zero rows. |
| `0012_product_integrity_v2.sql` | Updates reputation, post, comment, declaration, profile, case, and decision rows; deduplicates accountability signals and reactions. | All nine affected tables are empty: `trust.reputation_events`, `trust.accountability_signals`, `social.reactions`, `content.comments`, `moderation.cases`, `content.posts`, `content.content_declarations`, `social.profiles`, and `moderation.decisions`. |

The installer checks these predicates inside each migration transaction while
holding the migration lock. Any nonzero or unverified count stops before that
file. The clean PostgreSQL 17 rehearsal observed zero rows for every predicate.
This evidence applies only to that disposable local database.

`0021_media_quarantine_cleanup.sql` is applied as the exact canonical bytes
with its ordinary `CREATE INDEX` in a transaction on the verified empty
target. The legacy production helper rewrites it to `CREATE INDEX
CONCURRENTLY` and may drop an invalid index on retry; neither that helper nor
any cleanup behavior is used here.

## Approval gates before any live SQL change

Before `--apply-live`, independently verify and present the following exact
target, expected changes, and cost/credential boundary for user approval:

1. PlanetScale metadata for the new database and branch, including PostgreSQL
   17, AWS Frankfurt, the new origin, and the exact six role identities.
2. Cloudflare Hyperdrive metadata for ID
   `7e39fc4a286147988ed12df7a6322616`: exact new branch origin and database,
   Admin role username, `verify-full` TLS/CA, and caching disabled.
3. The six role capability mapping and scoped credentials, with no broad role
   membership, shared password, old-database reuse, or secret copied to files.
4. The exact migration SHA, source candidate SHA, 0007/0011/0012 zero-row
   guards, role grants, false latch insertion, and the no-cleanup behavior.
5. A reviewed cost estimate with one-time and monthly ceilings.
6. Separate exact approval for schema DDL, role/grant provisioning (including
   the migration login's plain database `CREATE`, without grant option), credential use
   or provisioning, and spend. The runner binds approval values to the candidate
   SHA, migration-set SHA, new database/branch IDs, origin fingerprint, and
   role-map fingerprint.

After these details are available, use the read-only modes from a clean,
approved candidate checkout with the exact branch-qualified verifier URL and
role map supplied through the dedicated `LYTHAUS_NEW_CORE_*` environment
variables:

```sh
node --experimental-strip-types scripts/ci/lythaus-new-core-clean-install.mjs --verify-live-bootstrap-state clean
node --experimental-strip-types scripts/ci/lythaus-new-core-clean-install.mjs --verify-test-access
```

The first checks only aggregate database state through the verifier login. The
second checks the exact new Access application, sole-human allow policy,
deny-all policy, audience hash, issuer, and JWKS binding. Both are read-only.
Supply `LYTHAUS_NEW_CORE_OWNER_EMAIL` only through the private runtime secret
store for that metadata check. The verifier compares it in memory to the single
email selector and never returns, hashes, logs, or writes the identity.
`--apply-live` is a separate write path and requires the individual approvals
above; it must not be run until that review is complete.

Applying SQL does not create or change Access policy, bindings, or Worker
versions. Those require a separate later approval. Before Worker publication,
verify a distinct Access application and policy for the test hostname, exactly
one intended human allow rule, no bypass, exact new application audience and
the team issuer. Keep the owner identity only in private provider policy
configuration. Record only application/policy IDs and sanitized
owner-only/count results; never hash or store the raw identity. The Worker
fails closed until the approved exact issuer, audience, and JWKS configuration
are supplied. Its Wrangler config pins the account, Worker name, test hostname,
new Hyperdrive, `workers_dev: false`, `preview_urls: false`, and the control
panel assets. It serves assets only after a valid Access signature/issuer/
audience check, serves the normal SPA page at `/flags`, allows only normal
health/moderation GETs and the one supported first-admin POST, and does not
route recovery, rebind, decision-write, or other admin endpoints.

## Local validation evidence

The isolated runner was rehearsed on disposable `postgres:17` image
`sha256:d74eeac9a635390a49bc21bd49fccd973de707e2a53a76ac49b552b8712ec46f`;
the server reported PostgreSQL 17.11 (`170011`). The resulting sanitized
receipt records all 22 migration checksums, three extensions, 102 tables, 103
relations, the canonical schema/ledger fingerprint, six role capability
booleans, exact bootstrap counters, and zero-row guards. The existing local
PostgreSQL 17 first-admin validator also passed rollback, concurrent one-shot,
credentialless control-plane, and durable-latch closure checks.

Unit tests use synthetic provider metadata and URLs only. They are not live
PlanetScale role/API or Cloudflare Access proofs. Worker dry-run reads the
local asset bundle and makes no deployment. The setup candidate remains local
and undeployed. The only workflow run was the separate read-only inspector
above; no production workflow was dispatched. The pricing receipt is at
`/workspace/scratch/lythaus-new-core-live-readonly/pricing-reference.json`.

## Owner-only acceptance after all live approvals

The designated owner's exact email remains a private Access-policy input.
Acceptance requires that owner's fresh Access session to open the normal
protected `/flags` page on `admin-new-core-test.lythaus.co` at the approved
build, followed by proof that a second bootstrap request is refused. A
successful isolated test does not authorize production cutover or establish
that a fresh sign-in at `admin.lythaus.co` succeeds: those are separate gates.

Do not use this sequence until the separate database, role/grant/credential,
cost, Access, binding, and deployment gates above are complete and the exact
candidate has been approved. The test URL is not deployed now.

1. Before sign-in, run the read-only verifier mode against the dedicated new
   verifier URL with expected state `clean`. Require zero total memberships,
   one unconsumed latch, zero completion events, zero control-plane actors, and
   zero consumer identity material. It must report the exact approved candidate
   SHA and new branch.
2. The owner signs in personally through the new owner-only Access application
   in a fresh private browser session and opens the exact test URL ending in
   `/flags`. The page's normal Admin membership check must deny access while
   the membership count is zero. Do not expect a successful Admin API response
   or build headers before bootstrap. Do not copy or share a password, OTP,
   JWT, raw Access subject, or cookie.
3. From that same origin and session, invoke only the supported bootstrap
   request and exact confirmation described in
   [first-admin-bootstrap.md](first-admin-bootstrap.md). The exact-origin
   browser-console request is:

   ```js
   if (location.origin !== 'https://admin-new-core-test.lythaus.co') {
     throw new Error('Wrong test origin');
   }
   const response = await fetch('/api/admin/bootstrap/first-administrator', {
     method: 'POST',
     headers: { 'content-type': 'application/json' },
     body: JSON.stringify({ confirmation: 'BOOTSTRAP FIRST ADMINISTRATOR' }),
     credentials: 'same-origin',
   });
   console.log(response.status); // Expect 201 on the first call.
   ```

   Do not create a membership directly, manually compute an HMAC, or use an
   email-as-admin shortcut.
4. End that session. Sign in again in a fresh private session, open `/flags`,
   and confirm the normal membership lookup authorizes the page. Only now check
   that normal health and moderation-case GETs succeed and return the exact
   source SHA and Worker version headers. Record response status and build
   identity only; do not retain moderation-case content.
5. Run the read-only verifier mode with expected state `accepted`. Require
   exactly one total membership,
   one active administrator, zero active non-admin memberships, exactly one
   consumed latch, exactly one bootstrap completion audit event, one locked
   control-plane actor, and zero attached credentials/provider links/handles/
   profiles. The verifier reads aggregate counts only.
6. Have a separately approved non-admin tester use a fresh session without
   changing the owner-only Access policy. Access must deny that session at the
   edge. Do not record the tester's identity or broaden the policy. Re-run the
   read-only aggregate verifier and confirm the accepted counters are
   unchanged.
7. In the owner's fresh session, repeat the supported bootstrap request; expect
   `bootstrap_closed`. Confirm an unauthenticated request is also denied at
   Access. Local API tests cover a verified but nonmember subject; do not
   present that as a live non-admin API test.

Do not remove or rotate `ACCESS_SUBJECT_HMAC_KEY`, delete the control-plane
administrator, reset the latch, delete or replace its audit event, or erase
the membership. Only bounded migration/verifier credential expiry or
revocation may be considered later under separate authorization.

## Proposed data plan, if separately requested

No production data is read or imported in this preparation. Any future data
move requires separate source-read, field-map, privacy, rehearsal, and cutover
approvals. A proposed order, subject to schema/FK review before any import, is:

1. Prepare an explicit old-to-new identity ID map in a separate protected
   process. Reserve and preserve the new control-plane actor and administrator;
   never map old administrator IDs onto them. Exclude admin membership,
   bootstrap latch/completion event, subject-HMAC state, passwords, tokens,
   provider credentials, and production secrets from the source import.
2. Load approved static dictionaries and place/category reference rows. For
   self-referencing place trees, insert parent rows first; use a reviewed
   two-phase insert/update only where the schema allows nullable parent links.
   Reject unresolved cycles and keep FK constraints enabled.
3. Map consumer identities, then approved noncredential profile/preferences
   fields. Do not import authentication material. Load media metadata and
   ownership only after their mapped users and referenced objects exist.
4. Load content after users and places, then comments after their posts. For
   nullable self-parent comment links, stage the mapped rows and resolve parent
   links in a second pass with constraints enabled; reject cycles the schema
   cannot represent.
5. Load social edges and reactions after their user/content endpoints. Load
   moderation cases after subjects and content, then decisions, appeals,
   reviewer references, and outcomes in FK order. Resolve any schema-supported
   nullable cycles with an explicit two-phase ID mapping, never by disabling
   constraints.
6. Load remaining trust, provenance, and privacy dependents after their user,
   content, and moderation references. Rebuild derived feeds/queues only under
   a separate idempotent plan; do not import old audit/recovery/rebind state.
7. Validate source-to-target aggregate counts, mapped-ID uniqueness, every FK
   (zero orphans), required uniqueness constraints, and the clean replacement's
   administrator/latch/completion-event state. Review discrepancies before a
   separately approved cutover.

Never truncate or replace the new audit table or overwrite/delete the new
administrator, consumed latch, or bootstrap completion event. This proposed
plan authorizes no source reads, import, or cutover.
