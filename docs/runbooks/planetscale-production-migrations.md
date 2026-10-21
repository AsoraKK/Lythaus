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
- Required PlanetScale extensions, backups, and role grants must pass their
  acceptance gates for the migration path.
- General `all-migrations` releases also require an approved HA topology.
- The explicit `0021-only` path has a narrowly approved maintenance-policy
  exception: retain the existing PS-5 single-node topology, with no HA upgrade
  or other topology change. This resolves the HA wording only for this pinned
  maintenance migration; it does not certify single-node as generally
  HA-compliant or change the general production requirement.
- The exception waives no other 0021 gate: required PlanetScale extensions,
  protected main and backup, verified recovery evidence, exact role and
  Hyperdrive bindings, measured usage and a positive ceiling, exact-candidate
  consent, concurrent-index safety, and protected production review remain
  required.
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

This path may retain the existing single-node topology under the exception
above. Every other readiness and execution condition below remains in force.

Dispatch the production migration workflow with `migration_scope=0021-only` and
leave `execute_0021=false` to build evidence only. The plan job makes GET
requests for PlanetScale `main` and the named backup, runs the existing
Cloudflare Hyperdrive origin verifier, and reads the migration registry and
staged 0021 catalog state through `PLANETSCALE_SCHEMA_READ_DATABASE_URL` with
`sslmode=verify-full` and a read-only database session. It does not receive the
administrative database URL or the service-token role-creation credentials.

The PlanetScale API token must already have read access to branches and
backups. The plan requires `main` to be PostgreSQL, ready, production-marked,
not deleted, and deletion-protected. The branch API's
`restore_checklist_completed_at` is informational: it records when a user
marked the restore checklist complete, and is not proof that source `main` is
recoverable. PlanetScale describes that checklist as a guide on branches
restored from backups ([changelog](https://planetscale.com/changelog/backup-restore-checklist),
[branch API](https://planetscale.com/docs/api/reference/get_branch)).

The selected backup must match the requested ID, be successful and
deletion-protected, belong to `main`, be undeleted, and remain unexpired. The
plan also requires a reviewed restore-evidence record at
`docs/evidence/production-cutover/0021-restore-evidence/<backup-id>.json`.
Its source branch ID and selected backup ID must match the live provider reads;
the restored branch ID is retained as historical identity even after that test
branch is deleted. The record includes a verification timestamp, the SHA-256
of the underlying evidence artifact, reviewer and review reference, verified
scope, and unresolved gates. Retain the artifact itself as a tracked regular
file under
`docs/evidence/production-cutover/0021-restore-evidence/artifacts/`; the
planner reads its bytes and verifies the SHA-256. It rejects missing,
untracked, symlinked, out-of-allowlist, empty or tampered artifacts. If the
historical bytes are unavailable, retain the supplied digest with no artifact
path and leave it unverified; that record remains blocked. The record's own
SHA-256 over canonical JSON with `recordSha256` omitted detects inconsistent
edits; it is not evidence provenance or a substitute for review. A stale or
future timestamp, incorrect chronological order, missing required scope, or
any unresolved gate blocks the strict plan. Backup completion and actual
restore verification must each be no more than 24 hours old at assessment;
long retention or an unexpired backup does not establish freshness.
Required scope covers independent
backup-to-restore binding, restore completion, extensions/indexes, canonical
migration registry, effective runtime privileges, application smoke, accepted
RPO/RTO, and the independent recovery destination. It does not require
full-data parity. See the
[restore runbook](planetscale-restore.md) for how to gather the operational
evidence; the record is reviewed and committed append-only before use.

### One-release owner-testing recovery exception

On 2026-10-21 at 08:45:55 UTC the owner approved implementing a one-release,
owner-testing-only deferral of independent/off-provider recovery. This policy
approval does not supply a native restore receipt, exact-candidate execution
consent, cost evidence, spending, credentials, deletion or a new recovery target.
Extra R2 export and a separate encryption key remain deferred.

The migration workflow defaults `owner_testing_recovery_exception=false`; the
canonical release defaults `release_mode=automatic`. The strict scope above
remains the default. Request the canonical exception explicitly with
`release_mode=owner_testing_native_recovery_exception`, an owner-testing mode
that preserves the existing ten-input dispatch contract, and the protected production variable
`PLANETSCALE_OWNER_RECOVERY_EXCEPTION_JSON`. Its reviewed JSON has these fields:

```json
{
  "schemaVersion": "lythaus-owner-recovery-exception-v1",
  "scope": "independent_recovery_destination",
  "ownerTestingOnly": true,
  "releaseSha": "<exact lowercase 40-character merged main SHA>",
  "migrationRunId": "<the single execution-requested 0021 workflow run ID>",
  "releaseRunId": "<the single canonical owner-testing release workflow run ID>",
  "approvalReference": "<sanitized reference to the explicit bound owner approval>",
  "approvedAt": "<ISO-8601 UTC timestamp>",
  "expiresAt": "<ISO-8601 UTC timestamp, at most 24 hours after approval>"
}
```

These are placeholders, not an active approval record. The two run IDs must be
distinct positive decimal strings. Only their first attempts are eligible;
different commits, run IDs, attempts and expired windows fail closed. The
exception cannot be supplied as dispatch JSON. The executor independently
validates the protected binding before connecting, in addition to the rebuilt
plan and the separate exact-candidate 0021 execution-consent variables.

The binding defers only `independent_recovery_destination`. The reviewed native
receipt must omit that item from `verifiedScope` and retain it in
`unresolvedGates`. Every other unresolved gate still blocks. Fresh successful
protected native backup, proven backup-to-restore binding, completed native
restore, exact schema/extensions/indexes and canonical registry, effective
runtime privileges, approved application smoke, accepted RPO/RTO, actual
sanitized artifact bytes/hash and independent review remain mandatory. Cost,
target/role/Hyperdrive, concurrency, exact-candidate consent and protected
environment review gates are unchanged. The October 18 `pa4t6j6s07b7` receipt
proves only schema/extensions/indexes and the registry through 0020; the
exception cannot promote it to a complete native restore receipt.

Record the result as `DEFERRED_BY_OWNER_EXCEPTION`, never as verified independent
recovery. Preserve the original unresolved gate. Every canonical release now
checks recovery in preflight and again before Worker or production Pages
activation, even after 0021 is applied. The release manifest retains
`recovery.independentRecoveryStatus`, `publicReleaseBlockers` and
`requiredAfter0021=true`. A deferred requirement keeps public readiness
`NO-GO`; an ordinary/public release cannot request this exception or inherit it
from an owner-testing deployment. Completing 0021 cannot erase the requirement.

To obtain the run IDs without approving an unbound action:

1. Complete/review the fresh native receipt, operator estimate and cost ceiling,
   exact-candidate 0021 execution consent and remaining read-only evidence first.
   An earlier `execute_0021=false` diagnostic plan performs no mutation and
   consumes no approval; leave its blockers visible. Do not rerun a completed
   successful workflow merely to poll it.
2. Dispatch the exact-SHA `0021-only` workflow with `execute_0021=true` and
   `owner_testing_recovery_exception=true`. Leave its first plan job awaiting
   protected production approval. Dispatch the exact same SHA canonical release
   with `release_mode=owner_testing_native_recovery_exception`; leave preflight
   awaiting its production approval. Capture the two actual run IDs.
3. Configure the reviewed protected JSON for those exact IDs and candidate,
   within its bounded window. A missing configuration or inaccessible protected
   variables API is a concrete configuration blocker; do not fabricate values
   or bypass the environment review. These configuration steps remain subject
   to their existing authorization.
4. Approve the migration plan, inspect its sanitized evidence, then approve the
   separate execution job only if all gates pass. Its fresh plan and executor
   must agree. Approve canonical preflight only after verified 0021 completion;
   activation rechecks both fresh native evidence and the exception window.
5. A failed/cancelled attempt does not authorize a rerun or another release under
   this binding. Preserve evidence and obtain a newly reviewed explicit binding
   if a replacement attempt is approved. After the named release, remove/expire
   the protected binding through the authorized configuration process. The
   immutable run/attempt restriction also prevents reuse if cleanup is delayed.

No step provisions a restore branch, creates credentials, expands permissions,
orders a paid service, exports production data or deletes a resource. Those
operations retain their separate specific approvals.

These checks also use the [PlanetScale backup API](https://planetscale.com/docs/api/reference/get_backup).

The target identity carries the PlanetScale database slug and branch ID
separately from the physical PostgreSQL database name and origin fingerprint.
The executor checks its branch-qualified admin URL and the connected session
against both identities. The URL accepts only the literal
`sslmode=verify-full` and optional `sslrootcert=system` query parameters; host,
user, port, database routing overrides, encoded parameters, and duplicate
parameters fail closed before the admin connection is created.

Supply an operator cost estimate, its reference, and the existing positive
`PLANETSCALE_MIGRATION_USAGE_MAX_USD` ceiling. This is a review comparison;
the ceiling does not enforce or cap actual provider spend. The plan requires
an exact migration registry prefix through 0020 with staged state
`NOT_APPLIED`, `COLUMN_ONLY`, or `INVALID_INDEX_RETRYABLE`. It accepts an
already recorded 0021 only when the exact staged schema and migration
postconditions verify. If the exact 0021 schema is fully applied while the
registry remains exact through 0020, it classifies the state as
`RECOVERY_REQUIRED`. Under the existing session advisory lock, the executor
rechecks those postconditions and may insert only the canonical 0021 registry
marker; it does not rerun DDL in this recovery path. Active builds, hidden
index progress, drift, any checksum mismatch, and provider unavailability
block execution.

The plan requires candidate-specific execution consent from
`PLANETSCALE_0021_EXECUTION_APPROVED_SHA` and
`PLANETSCALE_0021_EXECUTION_APPROVAL_REFERENCE`, configured in the protected
`production` environment after the specific hosted 0021 action is approved.
The first must be the exact lowercase 40-character `release_sha`; the second
must identify that approval. Neither is a dispatch input. Missing, malformed
or stale approval keeps the plan blocked. A new main SHA needs its own approval.
The executor independently checks the same consent before connecting, even
when a caller supplies `PLANETSCALE_0021_PLAN_READY=true`.

Maintenance-gap consent resolves downtime choice only. It does not populate
execution consent, authorize spending or credential/configuration changes,
or establish any backup, restore, role or target evidence. A matching approval
removes only the consent blocker; every other plan blocker still applies.
Keep the existing production environment review and exact-main checks.

## Scoped 0021 execution

Set `execute_0021=true` only after the read-only plan is ready and consent is
recorded for that exact candidate. GitHub evaluates
the `production` environment again for the separate execution job. That job
rechecks the current main SHA, rebuilds the read-only plan, and uses only the
pre-provisioned `PLANETSCALE_ADMIN_DATABASE_URL`; it creates no PlanetScale
role and does not reconcile grants. It applies only the existing pinned 0021
payload through the staged migration helper. Under the helper's session
advisory lock, it rechecks the exact 0020 registry prefix and staged state.
Retryable states proceed through DDL. If the exact schema is already fully
applied with the registry only through 0020, it verifies the exact
postconditions and writes the canonical 0021 registry marker without DDL. An
already recorded and verified 0021 is an idempotent no-op. All other prefixes
or states stop before DDL.

## Failure and rollback

Ordinary migrations run in a transaction. Staged 0021 commits its nullable
column before building its index concurrently; an index failure can leave the
column and an invalid index behind without a registry marker. A failed run
stops before Worker deployment. Preserve the additive state and use the
[0021 contingency and cutover sequence](planetscale-0021-cutover-preparation.md)
to distinguish safe roll-forward states from drift. Do not edit an applied
migration or delete registry history. A different repair requires a reviewed
new numbered migration. Recovery restores require the separately approved
target, cost and recovery decision in the
[restore runbook](planetscale-restore.md).
