# Intended migration role audit and separate catalog probe

This lane does not install, restore, deploy, activate a feature, or change an
administrator binding. The working `PLANETSCALE_ADMIN_DATABASE_URL` and
`PSCALE_ROLE_IDENTIFIERS` remain unchanged. A new probe is **not eligible for
the existing installer**, even after successful connectivity/isolation checks.
Never reset an existing role password to obtain a second connection: PlanetScale
Postgres roles have one password at a time.

## Read-only audit

Use the existing **PlanetScale cutover identity preflight** workflow on exact
protected current main, first attempt, started by the repository owner. Select
`migration-role-audit`, set `release_sha` to the full reviewed main SHA, leave
`migration_probe_approval` blank, and complete normal production review.
Code-only approval does not dispatch this protected workflow.

The audit reads the complete provider roles inventory and canonical five-role
map. Through the unchanged existing connection it uses READ ONLY catalog queries
to check the intended migration login, its SET path to postgres, the function
owner's policy-parameter authority, application isolation, and an absent or
exactly disabled rebind function. The canonical map and committed grants are
the purpose evidence; provider display labels are insufficient. Catalog/permission
errors remain blocked. No SET ROLE, grants or application-row reads are used.

PUBLIC checks include implicit ACL defaults, database CREATE, schema access,
relations/sequences/views, column ACLs, reachable application functions and
explicit default grants. The proposed profile allows CONNECT, ordinary PostgreSQL
catalog visibility, public-schema USAGE and existing TEMP defaults; it promises
no persistent/application DDL authority, rather than zero SQL permissions.
Any unsafe shared ACL blocks the probe; this lane never repairs shared ACLs.
System-schema grants are compared with PostgreSQL 17 initdb privileges and
implicit defaults for built-in object IDs. Information-schema built-ins permit
ordinary SELECT/USAGE. Added catalog functions/objects, protected catalog grants
and new grant options fail closed; neither a `pg_` name nor catalog location
turns additional authority into an allowed default.

The existing migration advisory lock coordinates cooperative schema runners.
The quiet-window check covers the seven current credential consumers. Neither
mechanism prevents an arbitrary database/provider administrator from acting.
The receipt contains fixed status/booleans and source/configuration hashes only.
An audit pass is neither installation approval nor current-email login proof.

### Reading a blocked audit

`canonical_login_valid` is a compound gate, including LOGIN, SQL validity,
NOSUPERUSER, NOREPLICATION and NOBYPASSRLS. Its false value alone does not prove
an inactive login. `roleDetails` reports each flag separately, plus existing
executor SET paths and parameter grant-option/ACL-presence booleans. A comparison
with the pinned recovery setup profile requires the exact configured identity
and every profile flag to match; labels or a whole-map digest mismatch do not
establish an individual role identity. These observations do not change any
authority, installer, activation or minimal-probe acceptance gate. Do not alter
a production role merely to make the compound gate pass.

`publicFunctionCategories` counts PUBLIC-callable noncatalog functions owned by
the three reviewed extensions (pg_trgm, unaccent, pgcrypto), other functions,
and SECURITY DEFINER functions. It contains no function names or bodies. An
extension count is classification only: the existing no-callable-function probe
gate remains blocked until its actual profile is separately reviewed. Presence
alone does not establish application-data exposure.

The policy parameter's catalog SET permission is needed for function-owned
configuration. A successful ordinary transaction-local SET does not prove that
CREATE/ALTER FUNCTION SET is permitted. Local PostgreSQL17 reproduces ordinary
SET success with function-definition denial under a non-superuser. Preserve the
function configuration capacity guards; do not grant privileges, issue another
credential, or substitute a session SET test to overcome this audit result.

## Dormant credential probe: separate approval required

Select `migration-probe` only after independently reviewing a fresh successful
audit, exact source and a concrete approval packet. Code-only approval does not
authorize any POST or credential creation. No new persistent opt-in or GitHub
secret is introduced. The production job rejects a blank or malformed consent
before protected inputs are passed to its runtime.

The consent validator in `scripts/ci/planetscale-migration-probe.mjs` requires
exactly its listed fields and schema `lythaus-migration-probe-approval-v1`, scope
`one_catalog_only_probe`. Prepare concrete values, never placeholders:

- Exact merged `sourceSha`, `profileSha256` exported by that source, and the next
  workflow `expectedRunNumber`. The owner's production approval applies to the
  actual run ID. All previous run numbers, attempts and jobs must remain
  available. A missing/deleted run, later dispatch, rerun or previously started
  probe fails closed. There is no automatic retry or replay exception.
- Owner `operator`, distinct named `reviewer`, explicit credential-creation
  `approvalReference`, canonical UTC millisecond `approvedAt`, `windowStart`,
  `windowEnd` (maximum 30 minutes). Creation requires at least 20 minutes left.
- Unique `name` matching `lythaus-migration-probe-YYYYMMDD-NN`, exact `auditRunId`,
  `auditArtifactId`, `auditArchiveSha256`, `auditReportSha256`. The original ZIP,
  CRC, member bytes, successful owner job/run/source and report freshness
  (maximum one hour) must all verify. Audit and probe use the same source.
- Reviewed existing creation **and containment** authority evidence, token expiry
  through five minutes after the window, a named operator/reviewer containment
  commitment and `existingAuthorityVerified:true`. These references require human
  verification; text fields do not discover permissions or prove provider billing.
- Itemized all-in `costEvidence`, positive `maximumAllInUsd` and verified
  `remainingApprovedUsd`. Include prior attributable spend, usage, taxes/fees and
  retention where applicable. Unknown costs are not zero. The old cap suspension
  and old disabled-install consent confer no new authority on this source.

Before creation, verify/update the existing resource registry and live inventory
with this exact role as PROPOSED/NOT_CREATED, reconcile equivalent resources and
receipts, and verify the authority/cost/window packet. The role name in this
runbook is a format, not a reserved resource. Do not mint credentials to discover
permissions. Missing existing authority stops the operation.

The only provider mutation is one POST to the existing main branch's roles
endpoint with `{name,ttl:900,inherited_roles:[],with_replication:false}`. No
branch, compute, disk, backup, reset, renewal, DELETE or grant is requested.
A fresh catalog audit and source/quiet-window checks precede the sole POST.
The initial UNKNOWN checkpoint is saved first; uncertainty stays UNKNOWN and
requires GET-only reconciliation, never another creation. The returned role ID
is checkpointed without its credential before validation. The role's actual
metadata, direct TLS endpoint, expiry and effective SQL profile must verify.

The password stays in the same protected process only; no arguments, environment
files, artifacts, caches, settings, logs or chat contain it. The candidate never
falls back to the working connection. Query budgets are eight per SQL session,
with fixed connection/statement/query/lock/idle timeouts. At most two candidate
connections are attempted: initial positive READ ONLY catalog validation and
one post-expiry login rejection. Normal pg catalog and TEMP defaults are not a
claim of migration authority. No mutation is attempted to prove denial.

Initial close and full-visibility observer session absence are separate checks.
After expiry, require provider disabled/expired metadata and a PostgreSQL 28P01
authentication rejection for the same credential that succeeded initially,
plus another observer session-absence check. Transport/TLS failure is not expiry
proof. Unexpected authentication success is closed immediately and requires
containment. TTL does not terminate an existing session by itself.

## Stop, rollback and continuation

No working secret, role map, password or consumer switches, so no old connection
value needs restoration. On any uncertainty, close and stop. The new-role ID
checkpoint and actual GitHub run identify the containment target. Interrupted,
cancelled or timed-out probes are unverified; the named operator must reconcile
them, including existing sessions, before any later proposal. No automatic
termination/reset/deletion is authorized. Any explicit revocation needs its
specific security approval; permanent deletion needs action-time confirmation.
Expired metadata may remain pending approved cleanup. Never cascade or touch
another role, database or branch.

An eventual installer design/credential change needs its own review and exact
approval. Preserve the exact-role installer guard, original-principal checks,
fresh rollback backup, baseline/cost gates and fresh native restore qualification.
The disabled-install consent for `70df67ed` does not transfer. Current-address
owner sign-in remains unverified until a fresh session opens the panel and an
authorized safe read succeeds on the intended serving version.

Local checks:

```sh
node --test scripts/tests/planetscale-migration-role-probe.test.mjs
# SYNTHETIC_PG_URL must reference a disposable local PostgreSQL 17 instance.
node --test scripts/tests/planetscale-migration-role-probe-pg17.test.mjs
```
