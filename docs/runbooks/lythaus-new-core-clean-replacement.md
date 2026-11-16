# New-core clean replacement preparation

## Current status

**PREPARATION / PROVIDER ACCESS BLOCKED.** The proposed test URL
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

## Provider evidence still required

The PlanetScale connector confirms the new database and branch metadata, but
does not expose the SQL server version, exact SQL origin, generated role
inventory, or role grants. The configured `PLANETSCALE_API_TOKEN` is not in the
service-token `id:token` format required for the roles endpoint. No retry,
token rotation, or credential creation was done. Generated role identities
remain **UNKNOWN**.

The Cloudflare read-only GET for the specified Hyperdrive ID returned HTTP 401
(error 10000). Its actual destination, origin user, TLS mode, CA certificate,
and effective caching setting remain **UNKNOWN**. No retry or credential
rotation was done. Do not proceed until an authorized read-only configuration
can verify that this exact new Hyperdrive points to the new branch's logical
`postgres` database, uses the new Admin role, has verified TLS, and has caching
disabled.

No one-time/monthly cost estimate or ceiling is recorded. Live execution
requires those values to be documented and separately approved.

## Prepared local path

The clean installer is `scripts/ci/lythaus-new-core-clean-install.mjs`.
`--plan` is read-only; `--rehearse-local-pg17` accepts only a credentialless
loopback PostgreSQL URL. `--apply-live` is implemented for review but fails
closed until the pinned target attestations, approved candidate SHA, role
inventory, origin fingerprint, cost ceiling, four scoped approvals, and
branch-qualified migration/verifier URLs are present. It has no generic
`DATABASE_URL` fallback, no production workflow path, and no deployment action.

The live runner re-reads PlanetScale database, branch, and role metadata and
the exact Hyperdrive configuration before creating SQL clients. It verifies
the branch-qualified URLs, origin fingerprint, database name, TLS mode, and
connected database/user. It checks the new target is empty, all six roles are
present and distinct, roles have no superuser/database/role-creation/BYPASSRLS
attributes, and no role memberships exist **before the first migration**.
It applies each committed migration file in its own transaction, records the
exact ledger checksum, and never calls the legacy `ci-*` generic URL runner or
the production 0021 cleanup helper. A partial install stops for review; there
is no automatic DROP, TRUNCATE, rollback cleanup, role deletion, or credential
revocation.

The planned role labels are `lythaus_migrations`, `lythaus_runtime`,
`lythaus_admin`, `lythaus_jobs`, `lythaus_privacy`, and `lythaus_verifier`.
PlanetScale generated `pscale_api_*` SQL identifiers must be mapped from live
provider metadata; labels are not SQL identifiers. The installer does not
create roles or credentials. Provisioning six distinct logins, assigning their
approved capabilities, and creating scoped migration/runtime/admin/verifier
credentials each need the required separate authorization. The Admin Worker
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
6. Separate exact approval for schema DDL, grant changes, credential use or
   provisioning, and spend. The runner binds approval values to the candidate
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
local asset bundle and makes no deployment. No source change was pushed and no
CI/workflow was dispatched.

## Owner-only acceptance after all live approvals

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
move requires its own approved source, field map, dependency order, privacy
review, and rehearsed rollback plan. Import dependencies in order and preserve
the new administrator membership, consumed bootstrap latch, and completion
audit row throughout. Never truncate or replace the audit table. Do not import
old admin bindings, old subject-HMAC state, passwords, tokens, or production
secrets. Any identity reconciliation must use a separately reviewed supported
mapping; this clean-schema setup does not authorize it.
