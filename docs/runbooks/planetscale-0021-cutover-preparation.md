# 0021 cutover preparation and roll-forward contingency

Prepared against main `da6515d13f2d46950a8211008f89909f23b64a80` on
2026-10-17 after #1038 merged. This packet completes local preparation while
the maintenance preference and consequential hosted actions remain pending.
The [sanitized evidence](../evidence/production-cutover/2026-10-17-0021-readiness.json)
records successful reads, unavailable evidence, exact checksums, and access
failures. Existing successful CI was inspected for locators, never rerun.

**2026-10-18 update:** The owner approved a maintenance gap and beginning
preparation immediately. That choice is resolved. The
[dated consent-gate proposal and readiness packet](../testing/planetscale-0021-candidate-consent-2026-10-18.md)
separately tracks candidate-specific hosted execution consent, access, recovery
evidence and cost. The observations below describe the dated 2026-10-17 snapshot.

**2026-10-18 21:17:41 UTC single-node decision:** The owner approved retaining
the existing PS-5 single-node topology for the bounded `0021-only` migration,
with no HA upgrade or other topology change. This reconciles the HA wording
only for this migration. It does not establish general HA acceptance, authorize
DDL execution, or waive protection, backup and recovery, role and Hyperdrive,
budget, concurrency, exact-candidate approval, or protected production gates.

**2026-10-21 bounded owner-testing decision:** The owner approved implementing
a one-release exact-commit exception for independent/off-provider recovery
only. The [protected binding and run staging procedure](planetscale-production-migrations.md#one-release-owner-testing-recovery-exception)
require an explicit request, exact candidate and named first-attempt migration
and canonical owner-testing runs, approval reference and at most 24-hour expiry.
The exception reports `DEFERRED_BY_OWNER_EXCEPTION`; independent recovery stays
unresolved and blocks non-owner public readiness after 0021. Fresh native backup
and completed native restore evidence (each at most 24 hours old), all native
verification scopes, artifact hash/review, accepted RPO/RTO, cost and separate
candidate consent remain required. The historical October 18 receipt remains
incomplete. Extra R2 export and a separate encryption key are deferred; no new
billable provisioning, credentials, permission expansion or deletion is granted.

## Observed state and missing evidence

PlanetScale metadata confirms the sole production PostgreSQL branch
`lythaus/lythaus-core/main`, ID `vqa2g2xc9wsl`, ready on PS-5 ARM in
`eu-central`. The dated snapshot reports zero replicas, deletion protection
disabled on both database and branch, and `restore_checklist_completed_at=null`.
That state does not meet the general HA precondition, and a production label
does not prove HA. The later owner decision permits retaining the existing
topology only for `0021-only`; it does not mark the general HA precondition
passed or satisfy the separate protection and recovery gates.
The provider's 102-table count and schema update timestamp do not establish
the exact migration registry or whether 0021 has run.

The retained [October 18 restore receipt](../evidence/production-cutover/0021-restore-evidence/pa4t6j6s07b7.json)
records source `main` ID `vqa2g2xc9wsl`, the UI-selected backup
`pa4t6j6s07b7`, restored branch `n3wdm03vwenu`, its creation time, and the
verification window. It establishes only schema/extensions/indexes and the
canonical registry through 0020. Independent backup binding, effective runtime
privileges, application smoke, accepted RPO/RTO and the independent recovery
destination remain unresolved; the receipt has no evidence review. Owner
approval to delete the test branch does not close these gates. The planner
retains the supplied artifact SHA-256 as unverified because the original bytes
were not available in this repository. It blocks on the missing artifact,
scope, review and unresolved gates. The record's own hash checks consistency;
it does not establish evidence provenance.

The available PlanetScale API-token value fails the existing `ID:token`
validator before any network request. No role/backup request was made with an
alternative authorization format. Cloudflare's GET for the first existing
Hyperdrive returned HTTP 401; authenticated enumeration stopped. The current
session has neither `PLANETSCALE_SCHEMA_READ_DATABASE_URL` nor
`PSCALE_ROLE_IDENTIFIERS`. No ephemeral SQL credential was created: the MCP
SQL-query tool documents that it provisions short-lived credentials, which is
outside this preparation's authorization.

The latest completed release's sanitized provider artifact is listed and
unexpired (run `39010370047`, artifact `12092003700`), but its download was
Forbidden. GitHub's production-environment variables endpoint returned HTTP
403. Neither inaccessible content nor historical role candidates were treated
as current proof. Consequently the actual SQL role mapping, selected backup,
restore-test evidence, live registry, and approved usage ceiling remain
`UNKNOWN/BLOCKED`.

## Role and configuration evidence required

### Read-only SQL identity preflight

The protected manual workflow
`.github/workflows/planetscale-cutover-identity-preflight.yml` accepts only
`release_sha`, which must equal the protected main workflow SHA, checkout and
freshly fetched `origin/main`, rechecked immediately before protected reads.
It reads the existing
`PLANETSCALE_ADMIN_DATABASE_URL`, `PLANETSCALE_SCHEMA_READ_DATABASE_URL`, and
`PLANETSCALE_API_TOKEN` references from the protected `production`
environment. Connection URLs are not workflow inputs.

The script performs a PlanetScale `GET` for `main`, checks each branch-qualified
SQL target against that live branch ID, then opens each SQL connection in a
read-only transaction with bounded timeouts. Its bounded catalog checks record
the connected identities and owners of `media.upload_sessions` and
`system.schema_migrations`, require separate migrator and verifier identities,
check the migrator's effective owner access, and verify effective visibility
of index progress for both identities before checking for an active build. It
reads no application rows. The sanitized artifact contains role names, owner
names, booleans, version, branch ID, and blockers; it contains no connection
URLs, passwords, or API token.

A blocked result leaves permission, credential, migration, and provider state
unchanged. Do not use a boolean override. Any grant or credential correction
requires its own reviewed approval and existing protected process. A passing
result covers only this identity preflight; it does not replace the complete
role/Hyperdrive mapping, registry reconciliation, backup/recovery, cost,
concurrency, candidate consent, or production review gates above. The workflow
is not dispatched as part of code validation.

The same existing migrator connection also checks the precise rewards/News
Board [additional privilege package](../testing/rewards-membership-permissions-approval-2026-10-21.md)
using `has_column_privilege` and `has_schema_privilege` with `WITH GRANT OPTION`
inside that read-only transaction. `productGrantAuthority` reports all sixteen
column checks and editorial schema USAGE separately from the cutover identity
status, including in the workflow summary. PostgreSQL documents these
[grant-option privilege predicates](https://www.postgresql.org/docs/17/functions-info.html#FUNCTIONS-INFO-ACCESS-TABLE).
Missing objects, ambiguous results, unavailable probes or any false
check keep that authority evidence `BLOCKED`. Identity/target failure suppresses
an otherwise positive authority result. Only the existing migrator connection
is inspected; the verifier is not a substitute grantor. No `SET ROLE`, security
grant, ACL repair or product-row query is executed.

`AUTHORITY_PRESENT_NOT_EXECUTED` proves only the connected identity's effective
grant option at the recorded time; it grants no execution authorization. It
does not identify which inherited ACL grantor a later statement would select,
capture rollback ACLs, prove the current runtime login or replace the existing
mapped-role packet. Reuse that packet, bind the separately authorized four
statements to the proven runtime grantee, and independently review the exact
pre-change ACLs/rollback before any future grant action. A blocked authority
result neither changes nor weakens the existing migration identity gates.

The repository manifest establishes the intended mapping below. It does not
establish the current usernames or SQL permissions.

| Intended class | Existing binding/configuration | Required observed evidence |
| --- | --- | --- |
| `lythaus_runtime` | Public API `DB_APP_FRESH`, `3e59f07db51345aa896333ca861d1adf` | Exact current origin user and matching PlanetScale role |
| `lythaus_admin` | Admin API `DB_ADMIN_FRESH`, `6bfbb0eab42642e8ad294dbf59294ed3` | Exact current origin user and matching PlanetScale role |
| `lythaus_jobs` | Jobs `DB_JOBS_FRESH`, `442bb04b99004cb38c6974ec031d65ee` | Exact current origin user and matching PlanetScale role |
| `lythaus_privacy` | Admin/Jobs `DB_PRIVACY_FRESH`, `bae909aa72e244bfa9b8ca8a948053b6` | Exact current origin user and matching PlanetScale role |
| `lythaus_migrations` | Pre-provisioned migration executor credential | Separately verified connected SQL role, ownership, and effective privileges |

The application admin role and migration executor are separate purposes.
Do not infer either from a display name, a historical identifier, or broad
membership. Using already authorized access, obtain GET-only
[PlanetScale role metadata](https://planetscale.com/docs/api/reference/list_roles)
and each existing Hyperdrive configuration. Compare provider `username` and
`base_username`, branch ID, physical database (`postgres`), and origin user;
discard passwords and connection URLs before retaining evidence. Confirm
cache-disabled, `verify-full`, CA presence, and the manifest's exact origin
fingerprint for all five bindings. Never repoint the unassigned legacy config.

Through an existing authorized SQL connection, use a read-only transaction to
capture `current_database()`, `current_user`, `session_user`, server version,
`transaction_read_only`, role attributes/memberships, and
`pg_get_userbyid(relowner)` for `media.upload_sessions` and
`system.schema_migrations`. Check effective `pg_has_role(..., 'USAGE')`
visibility for `pg_read_all_stats` or `pg_monitor`, not just `MEMBER`.
Reconcile every canonical registry checksum and the exact staged 0021 state.
Metadata visibility and RLS-filtered row counts must not be used as proof of
complete data absence. Keep the production executor's own session/target check
as a separate required check at execution time.

## Cost evidence

The current October invoice API reports total US$0.00, but its `main` line item
reports US$5.00 and `cloudflare_billed=true`. This is not evidence of free
usage. The current SKU response quotes PS-5 ARM HA at US$15/month and one
instance at US$5/month. These exclude any unmeasured usage and are not an
approved topology-change estimate.

[Official pricing](https://planetscale.com/docs/postgres/pricing) includes backup
storage equal to twice allocated disk and charges excess compressed backup/WAL
storage at US$0.023/GB/month. The index can increase database storage and WAL;
retention can increase backup usage. The actual disk allocation, index-size
estimate, retained WAL, allowances, and relevant egress are unavailable. The
provider's 10 GiB minimum is not a measurement of allocated or used disk.

Record a reviewed estimate as existing compute plus incremental disk, I/O,
backup/WAL retention and egress over the expected duration, less proven included
allowances. Do not substitute US$0 for missing measurements. The local
rehearsal created no provider resources. No paid restore branch, HA conversion,
resize, backup-retention change, or new destination has been ordered.

## Local contingency evidence

`scripts/tests/planetscale-0021-roll-forward.postgres.mjs` refuses hosted hosts,
query options and non-control database names before connecting. It creates a
uniquely named database in an explicitly supplied disposable loopback PG17
cluster, applies the exact approved baseline through 0020, and seeds three
synthetic upload sessions. It uses the production staged-migration and marker
primitives; it does not invoke the hosted executor or bypass its gates.

Run on an isolated local PostgreSQL 17 container, binding only loopback:

```sh
PLANETSCALE_PG17_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:LOCAL_PORT/postgres \
  node --experimental-strip-types --test scripts/tests/planetscale-0021-roll-forward.postgres.mjs
PLANETSCALE_PG17_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:LOCAL_PORT/postgres \
  node --experimental-strip-types --test scripts/tests/planetscale-media-quarantine.postgres.mjs
```

On PostgreSQL 17.11, the new rehearsal passed 6/6 checks; the existing real
progress-visibility/drift regression passed 7/7. Three unsafe target probes
failed before connection. The new test proves column-commit interruption,
actual `pg_cancel_backend` cancellation of a concurrent build blocked on an old
snapshot, exact invalid-index retry, rollback after registry insert failure,
marker-only recovery, retry without writes, drift refusal and preservation of
all synthetic rows. It also runs the assertion-only restore verifier locally.
Every owned database is dropped in `finally`; the local container is disposable.
This is neither a provider restore rehearsal nor production-scale timing/cost
evidence.

## Future cutover sequence

These are sequenced prerequisites and future actions, not authorization to
dispatch a workflow or mutate a provider.

1. Merge/review the preparation packet through normal review. Select the exact
   then-current main SHA and immutable migration set. 0021's SHA-256 remains
   `c2ba4708020de699604373ad0d5a6fff1d113de9d36c747adb731d4667a8f564`;
   the approved set remains
   `49e4497af7c2e8b1bfb4df5208774a68969211187f93ba4e1ef21c03067ab614`.
   Check existing successful CI evidence at that SHA; do not rerun it to poll.
2. Complete the read-only mapping/catalog packet above and identify the exact
   backup ID. Verify source branch ID, successful completion, creation/expiry,
   deletion protection, retention and restore evidence. Treat
   `restore_checklist_completed_at` as informational; it refers to the restore
   checklist on a restored replacement branch, not source `main` recoverability.
   Save the reviewed, backup-ID-keyed record described in the
   [production migration runbook](planetscale-production-migrations.md),
   including the independent destination and backup-health evidence. This
   cutover step authorizes no restore or export; recovery actions retain their
   separately scoped target, cost and approval requirements, and acceptance
   requires verified results.
3. Keep the existing PS-5 single-node topology for this `0021-only` maintenance
   path, with no HA upgrade or topology change, under the 2026-10-18 owner
   decision above. This is not general HA acceptance or execution approval.
   Complete and verify the separate protection, backup/recovery, role/target,
   cost and candidate-consent gates. Record the specific hosted 0021 permission
   and `AUTHORISE MIGRATION USAGE: maximum additional cost US$___`. Grants,
   credential/configuration changes, protection/retention changes and recovery
   restores retain their separate approvals; preparation continues until all
   required evidence and approvals are complete.
4. The scoped plan and executor require
   `PLANETSCALE_0021_EXECUTION_APPROVED_SHA` to match the final exact candidate
   and `PLANETSCALE_0021_EXECUTION_APPROVAL_REFERENCE` to identify its specific
   hosted execution approval. Configure these only after parent coordination
   and the named action is approved. The former unconditional
   `0021_cutover_owner_decision_pending` gate is recorded in the historical
   snapshot; matching maintenance consent alone cannot satisfy the replacement.
   Never bypass consent by editing `ready`, plan artifacts or environment output.
   After any separately approved protection, role, topology or credential
   correction, repeat only the affected read-only evidence and target checks.
5. Stage the reviewed protected configuration: existing schema-read/admin
   credential references, reviewed five-role `PSCALE_ROLE_IDENTIFIERS` map,
   selected `PLANETSCALE_PRODUCTION_BACKUP_ID`, candidate execution approval
   SHA/reference, and positive `PLANETSCALE_MIGRATION_USAGE_MAX_USD`.
   No secret value belongs in Git or an
   evidence packet. Configuration must be independently verified after any
   authorized write; its existence is not proof of correct contents.
6. Once specifically authorized, dispatch
   `planetscale-production-migrations.yml` at `main` with `release_sha` equal to
   the exact reviewed current main, `migration_scope=0021-only`,
   `execute_0021=false`, the selected `planetscale_0021_backup_id`, measured
   `planetscale_0021_operator_cost_estimate_usd`, and
   `planetscale_0021_cost_estimate_reference`. Inspect the protected read-only
   plan and require zero blockers, exact target identity and fresh backup.
   Do not use the default all-migrations path: it also has a grant path.
7. After the plan is reviewed and execution specifically approved, dispatch
   the same exact-SHA scoped inputs with `execute_0021=true`. The separate
   production environment review and freshly rebuilt plan must pass. Use only
   the existing pre-provisioned admin credential; scoped execution creates no
   role and reconciles no grants. The executor binds provider branch, origin,
   SQL database and connected session before registry work.
8. Read back the complete canonical registry through 0021, exact nullable
   column/index postconditions, data invariants and dedicated-verifier output.
   Retain sanitized plan/execution artifacts and reconcile measured usage.
   Any approved update to `PRODUCT_INTEGRITY_DATABASE_SCHEMA_FINGERPRINT` and
   `PRODUCT_INTEGRITY_DATABASE_RELATION_COUNT` must match reviewed canonical
   evidence; do not change expected values merely to make a failed gate pass.
9. Check the existing Hyperdrive bindings again. An in-place schema migration
   does not itself require rebinding. Propose only a proven mismatch for a
   separately approved configuration change, with exact before/after targets
   and rollback reference. Keep existing release, publishing, security and
   feature-activation gates; migration completion is not release acceptance.

## Failure decision table

Preserve successful additive DDL and existing data. The staged 0021 helper is
not one atomic transaction: its column commits before its concurrent index.

| Observed exact registry/schema state | Contingency after evidence and execution approval |
| --- | --- |
| Prefix through 0020; `NOT_APPLIED` | Run the scoped staged helper under its advisory lock |
| Prefix through 0020; `COLUMN_ONLY` | Keep the committed nullable column and resume the exact concurrent index |
| Prefix through 0020; `INVALID_INDEX_RETRYABLE` | Helper drops only the exact inactive invalid index concurrently and rebuilds it |
| Prefix through 0020; `FULLY_APPLIED` | Reverify under the lock and recover only the canonical marker in its transaction; no DDL |
| Exact prefix through 0021; `FULLY_APPLIED` | Verified idempotent retry; no writes |
| Active/hidden build, drift, missing ownership/visibility, changed checksum or unavailable provider | Stop; preserve evidence and state for review; no guessed cleanup or blind retry |

Do not kill production sessions based on the local cancellation test. Do not
drop the added column, edit an applied migration, delete ledger rows or apply a
down migration. A genuinely different schema repair requires a reviewed new
numbered migration and its own approval. Data-loss recovery follows the
[separately approved restore runbook](planetscale-restore.md), with its RPO,
RTO, destination and additional-cost decisions; it is not an automatic fallback.
