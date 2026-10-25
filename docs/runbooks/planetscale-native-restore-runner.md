# Fixed native restore runner

This is preparation, not permission to dispatch execution. Read-only run
`40175663686` verified the dedicated restore token's nine target-database
actions and organization `read_service_tokens`, then stopped because its pinned
backup was stale. No hosted backup was restored, no credentials were reset, and
no target was created. Mock success and disposable PG17 success are not
operational restore evidence. Parent source review, normal required CI, exact
merged-source review and the separate owner action packet remain required
before dispatching `execute=true`.

## Fixed scope

`planetscale-native-restore-check.yml` defaults to a read-only metadata plan.
Execution is restricted to protected current main in repository ID 1010752912,
attempt 1, a named human's normal production approval, and an exact approval
record. Every prior execute run in the complete workflow history blocks another
execution, even across SHAs. The only reconciled history item is pinned run
`40184823787` at `43829abc3424a88a22826695bbfdc7be4a116e62`; it is accepted only
when GitHub still proves the exact workflow and attempt, terminal cancellation,
no production approval, one terminal cancelled job with no assigned runner and
an explicit empty step list, and no artifacts. Any missing, changed, extra or
uncertain evidence blocks. Before target creation, the runner also requires an
exact target GET 404, a complete branch inventory without the target, and
backup restore history without the target. This one-run reconciliation never
permits retry after a runner or step starts, or after a provider mutation may
have occurred.

Source is `lythaus/lythaus-core/main` (`vqa2g2xc9wsl`), candidate backup
`zw0so7f5jbpu` (provisional until a fresh API read confirms its metadata).
The only target is `lythaus-0021-native-restore-check-20261022`: PS-5 ARM,
Frankfurt, zero replicas, minimum and maximum 21474836480 bytes. Any preexisting
target is refused. The runner creates no database, role, GitHub secret,
Hyperdrive, binding, traffic route or application deployment. Source passwords
are never reset. Migration 0021 is never applied.

This qualification restores the exact backup snapshot by sending its
`backup_id`; it does not request PITR. PlanetScale documents `backup_id` as
restoring that backup's schema and data. `restore_point` is a separate optional
PostgreSQL PITR request and is omitted from the fixed create body. The backup's
completion time is validated from API `completed_at` metadata; it is distinct
from the dashboard's snapshot label. The candidate's last displayed “Backup
time” was `2026-10-25T02:33:09.321Z`, while its snapshot label was
`2026-10-25T02:25:02.838Z`; re-read API `completed_at` before qualification.
Provider completion plus independent SQL checks must establish what was
restored; all 17 previously approved privileges are tested directly. Neither
backup timestamps nor the provider checklist certify restored grants.
References: [backup GET](https://planetscale.com/docs/api/reference/get_backup),
[branch creation](https://planetscale.com/docs/api/reference/create_branch).

The whole two-hour window must fit before the backup reaches 24 hours old and
before expiry. From the last observed completion, start before
`2026-10-26T00:33:09.321Z` and finish before
`2026-10-26T02:33:09.321Z`; the displayed expiry was
`2026-10-27T02:25:02.838Z`. Recompute these limits from a fresh API read.
Freshness and expiry are different gates. No replacement is silently chosen.
The backup must already be protected under a separately approved, finite
retention and end-action plan before qualification. Neither phase changes
protection or deletes a backup. The 08:37 UTC dashboard read had this candidate
**unprotected**; source integration does not close that prerequisite or extend
these dates.

## Existing-access and bootstrap limitations

Qualification and cleanup use only the separately approved production-environment
secret `PLANETSCALE_RESTORE_API_TOKEN`, containing the complete service-token
`ID:secret` pair with exactly one colon and no whitespace. No separate token-ID
variable is needed. Missing or malformed dedicated access fails closed, even if
the shared `PLANETSCALE_API_TOKEN` is available; there is no fallback. Other
workflows retain their existing shared credential. Token creation, explicit
database grants and protected-secret setup require separate owner approval;
these workflows perform none of that setup. The dedicated token needs the nine
database actions checked below and organization `read_service_tokens` for its
self-read. Secret presence alone does not prove those grants or authorize a
restore, copied-role reset, migration or deletion.

Qualification also uses the existing `PLANETSCALE_SCHEMA_READ_DATABASE_URL`. It first reads
database identity and that token's own permissions. Missing `read_service_tokens`
or database-level access blocks before spending. No new scope is granted.
The documented restore permission is `restore_production_branch_backup`
(the endpoint also documents the plural alias). Read/create/restore permissions
and connection/deletion authority are checked before paid
creation. Because the create contract does not let this caller set the new
branch's production classification, the conservative preflight requires the
existing connection/deletion permissions for both classifications. If these
are absent, report the exact missing existing permission; do not expand the
token or create a branch to discover whether cleanup will work.

Read-only plans preserve an `authorityDiagnostic` checkpoint before rejecting
missing database-specific permissions. Version 3 projects every access row up
to an explicit output bound, including unknown/unrelated representations,
instead of dropping rows that fail the target filter. It reports only the two
observed public token-ID match booleans, allowlisted type/permission enums and
resource-match/shape classifications. Unknown strings become `UNKNOWN_STRING`;
missing, null, wildcard and malformed shapes remain distinguishable. No token
material, names, unrelated IDs or arbitrary provider bodies are exported.

The same successful self GET documents an optional `oauth_accesses_by_resource`
object. Its organization/database/branch groups are projected with 64-resource
and 64-permission bounds per group, explicit counts/truncation, field shapes and
fixed-target match booleans. User data is omitted; only the user group's shape
and a count of unknown groups are retained. Documented organization/global
permission names are allowlisted observations, not accepted authority. Null,
missing, wildcard, cross-organization and malformed scopes do not imply access.
See the official [self-response contract](https://planetscale.com/docs/api/reference/get_service_token),
[service-token permissions](https://planetscale.com/docs/api/reference/service-tokens)
and [OAuth scope enums](https://planetscale.com/docs/api/reference/oauth-access-scopes).

Neither workflow mode requests the optional `/grants` route again. The prior
run 40129927762 recorded `provider_request_failed`, not a proven 401/403 denial;
its exact HTTP status was not captured. Existing optional-helper GET error
handling now preserves only a bounded numeric HTTP status, without provider
bodies or headers. This does not authorize a retry of that route. The evidence
checkpoint is awaited before the unchanged authority decision.

The public contract does not establish an authoritative all-database encoding.
`ALL_DATABASES_MARKER` is an observation label, never authority. Such grants
remain unaccepted until actual representation and binding are independently
reconciled. This change does not alter the existing database-specific matcher,
required permissions or release/credential/cleanup gates.

Copied role IDs are discovered by exact base username and branch identity,
never guessed from SQL names. Metadata must match the source's inheritance:

| Purpose | Copied identity |
| --- | --- |
| Setup only | `pscale_api_47syed2xlt6p` |
| Public | `pscale_api_ysl604shosjg` |
| Admin | `pscale_api_3vzps7bu44vo` |
| Jobs | `pscale_api_9jfbtij9y4b2` |
| Privacy | `pscale_api_wv7rzyuejknl` |

The approved restore-copy SQL baseline is role-specific. The setup-only role is pinned to
`NOSUPERUSER`, `BYPASSRLS`, `CREATEROLE`, `CREATEDB`, and `REPLICATION`, with
only its observed memberships in `postgres`, `pg_read_all_data`, and
`pg_write_all_data`. The four application roles remain `NOSUPERUSER`, without
`BYPASSRLS`, `CREATEROLE`, `CREATEDB`, `REPLICATION`, or memberships. The
verifier continues to require exact copied role metadata, including branch,
lifecycle, and source-to-copy inheritance checks; it does not normalize
unknown provider representations. Other SQL role fields and membership grant
options are bound by exact source-to-copy catalog equality rather than
invented static values. The source roles are never changed.

Restored passwords are not usable until reset. It is therefore impossible to
prove target SQL authority before the first reset without another already
authorized target connection. The exact owner packet must authorize resetting
only the copied setup identity first, after API authority and all copied-role
metadata are checked. Its new password stays in process memory. A read-only SQL
probe then proves extension availability and effective CREATE authority before
any extension installation or remaining four resets. Insufficient authority
aborts and retains the acknowledged owned target for review; no grant or new credential
fallback exists. The reset API has no TTL input: credentials are bounded by
deletion of the newly created target, not by a claimed credential expiry.

Only proven-missing `pg_trgm`, `unaccent`, `pgcrypto` can be installed, after
authority verification and explicit approval. No PostGIS, extension upgrade,
permission correction or migration replay is allowed. A mismatch requires
review, not repair against the restored data.

## Qualification and receipts

The existing source read connection is pinned to main, verifier identity and
reviewed origin fingerprint. Before spending, its read-only snapshot must have
the exact 21 registry checksums through 0020, canonical relation inventory,
0017–0020 postconditions, no partial 0021 objects, three extensions and all 17
approved privileges. After restoration the setup connection checks the same
catalog/constraint/index/function, ACL/grantor, RLS, membership and role hashes.
Source metadata is checked again after the exercise. No product rows are read;
only catalogs and the migration registry enter these snapshots.

The separate target verifier never labels the target `main` and leaves
`verify-planetscale-production-schema.mjs` unchanged. The application smoke
bundles the actual current Public, Admin and Jobs Workers with the `workerd`
condition. Local Miniflare Hyperdrive proxies point only at the four approved
restored identities, with verified upstream TLS. It calls only the private
read-only database-identity endpoints. Admin's private email binding receives
only its no-send `probe`; ephemeral synthetic keys satisfy presence checks.
External HTTP is denied. This verifies database readiness queries in the real
handlers, not mailbox delivery, account isolation journeys, provider detection,
publishing or production authentication. `AUTHENTICATED_ACCEPTANCE_PROVEN`
remains false.

Sanitized checkpoints contain IDs, times, status codes, counts and hashes.
Provider bodies, connection strings, passwords, product records and source
function text are never retained. Qualification closes SQL/Worker resources,
discards credential references and produces immutable `qualification.json` in
a seven-day GitHub artifact. It makes **zero DELETE calls on every path**.
An acknowledged target remains `TARGET_RETAINED_PENDING_REVIEW` after success,
failure or interruption. An unknown create acknowledgment cannot establish
ownership and requires manual read-only reconciliation. A fallback finalizer
can preserve an interrupted checkpoint as UNKNOWN; it cannot invent ownership.
Copy the unchanged artifact bytes into the canonical tracked evidence process
and review them before any deletion. `recoveryAcceptance=NOT_CERTIFIED` remains explicit;
the independent destination remains `DEFERRED_BY_OWNER_EXCEPTION`. No release
or recovery gate is automatically marked passed.

## Owner packet and execution

Before dispatch, bind the approval record to the exact merged SHA, freshly
verified backup API metadata, absent fixed target, reviewed all-in estimate,
finite retention plan, and an actually reserved operator/reviewer window. The
candidate uses specified-snapshot restore only; it does not use a PITR
timestamp. Never reuse an expired approval record or substitute the dashboard's
snapshot label for API `completed_at`.

The protected production environment can delay the runner until a human
approves it. Obtain a fresh UTC availability block of at least two hours and
thirty minutes, dispatch only when the named operator/reviewer can approve
promptly, and complete approval within the first thirty minutes. Set
`availableFrom` to the block start, `availableUntil` and `expiresAt` to its
end, and `decisionBy` to two hours after its start. This leaves the full
two-hour runner window after any start in the first thirty minutes. If the
approval margin is missed, do not approve a run that would start with less than
two hours remaining; a runner-started failed preflight is not eligible for the
one pinned pre-runner reconciliation.

Known two-hour compute/storage plus a conservative 20-GiB additional backup/WAL
day and 10-MiB egress is about US$0.038604429 before tax/fees. The packet must
include a positive reviewed fee/uncertainty allowance; estimate plus allowance
must be at most US$5. This is a metered allowance, not a provider hard cap.
The observed US$10 email threshold is an alert. Previously denied Cloudflare
billing reads are not retried. Existing older protected backups already bound
the oldest WAL window; do not assume all incremental retention charges are zero
or promise indefinite protection fits this exercise budget. Before creation,
the named operator needs a separately approved retention end action, decision
time within two hours, end time no later than 24 hours from start, and positive
incremental retention estimate included in the US$5 total. The runner validates
this finite plan but cannot enforce provider billing or perform its end action.
If retention must continue past that end time, obtain a separately bounded
retention/cost decision; the exercise does not approve indefinite protection.
No automatic unprotect, backup deletion or denied billing-read workaround exists.

`approval_json` fields (replace placeholders; arrays must preserve this order):

```json
{
  "releaseSha": "EXACT_REVIEWED_MERGED_SHA",
  "backupId": "zw0so7f5jbpu",
  "target": "lythaus-0021-native-restore-check-20261022",
  "maximumUsd": 5,
  "estimatedSubtotalUsd": 0.05,
  "taxAndFeeAllowanceUsd": 1,
  "backupSnapshotAcknowledged": true,
  "reference": "EXACT_OWNER_APPROVAL_REFERENCE",
  "manualOperator": "OWNER_GITHUB_LOGIN",
  "expiresAt": "UTC_EXPIRY_COVERING_THE_TWO_HOUR_WINDOW",
  "actions": ["restore_fixed_target", "reset_five_copied_roles", "install_only_missing_named_extensions", "retain_target_for_review", "reserved_review_and_cost_watch"],
  "roles": ["pscale_api_47syed2xlt6p", "pscale_api_ysl604shosjg", "pscale_api_3vzps7bu44vo", "pscale_api_9jfbtij9y4b2", "pscale_api_wv7rzyuejknl"],
  "cleanupPermit": {"workflowId": 0, "runNumber": 0},
  "reviewWindow": {
    "reviewer": "REVIEWER_GITHUB_LOGIN", "operator": "OWNER_GITHUB_LOGIN", "reserved": true,
    "availableFrom": "UTC_START", "availableUntil": "UTC_AT_LEAST_TWO_HOURS_LATER"
  },
  "retention": {
    "operator": "OWNER_GITHUB_LOGIN", "reference": "SEPARATE_FINITE_RETENTION_APPROVAL",
    "manualEndActionApprovalReference": "SEPARATE_MANUAL_END_ACTION_APPROVAL",
    "endAction": "separately_approved_manual_decision_no_automatic_unprotect",
    "decisionBy": "UTC_WITHIN_TWO_HOURS", "endsAt": "UTC_WITHIN_24_HOURS",
    "estimatedUsd": 0.015
  }
}
```

`estimatedSubtotalUsd` is the reviewed known estimate, with `taxAndFeeAllowanceUsd`
reserved on top for any remaining taxes/fees and uncertainty. Their sum is the
reviewed upper allowance. No secret belongs in this record. The approver's
actual GitHub review history must match `manualOperator`; supplying JSON does
not substitute for normal protected production review. Placeholder zero permit
values are rejected. Read the active cleanup workflow's numeric ID and next
`run_number` through the existing GitHub API before requesting approval. Keep
that workflow undispatched during qualification; any intervening dispatch
consumes the reservation and blocks further qualification mutations.

## Evidence boundary and separate cleanup

Reserve the reviewer/operator before spending. Qualification stops starting new
work at 20 minutes; its runner step has a 22-minute timeout, the always-run
checkpoint finalizer and artifact upload have two minutes each, and the whole
qualification job has a 35-minute timeout. These leave reserve before escalation
at 45 minutes and evidence review by 60 minutes. Cleanup must start before
105 minutes and retains the original overall 120-minute deadline. No phase
resets that clock. There is no automatic deletion
at a deadline. Human review and guaranteed deletion within two hours cannot both
be guaranteed during GitHub/provider outages. Escalate early; if an operator
window, durable evidence path or bounded cost/retention plan is unavailable,
defer creation. Outages may leave a billable target beyond the budget/window;
that is an incident requiring immediate owner/operator attention, not implicit
permission to skip review, extend spending or retry an uncertain DELETE.
The read-only checkout/main guard/Node setup have one minute each and locked
dependency installation has four minutes. All step budgets total 34 minutes,
leaving one minute inside the 35-minute job for teardown; slow preparation fails
before provider access rather than consuming the finalization reserve.

Long operations also have internal cancellation budgets: each catalog snapshot,
Worker build and application smoke is capped at two minutes; the extension
authority probe at 30 seconds and named extension installation at one minute.
Every phase is further clamped to the remaining 20-minute qualification budget.
Cancellation ends the active PostgreSQL connection, cancels/disposes the build
context, or disposes the Worker runtime before returning failure evidence.
An interrupted extension COMMIT remains UNKNOWN and is never retried. Fixed
provider/GitHub requests retain their individual 15-second timeouts and bounded
pagination. A hung cancellation still falls under the runner/job timeouts;
the always-run finalizer preserves a retained UNKNOWN checkpoint where possible.
No claim of durable evidence or successful recovery survives a failed upload.

Qualification and cleanup use separate fixed concurrency groups, each with
`cancel-in-progress: false`. A pending qualification environment approval cannot
hold cleanup's concurrency slot. Cleanup proves the original qualification run
has completed, including its immutable upload, before becoming eligible for
DELETE. Qualification refuses a preexisting fixed target, and every mutation
rechecks its reserved cleanup permit. The operator must reserve this window
without other qualification or cleanup dispatches: an intervening cleanup run
consumes the one-use permit, and unrelated target activity is not excluded by a
workflow lock. GitHub queue/environment-approval waits and outages are not bounded
by an executing job's timeout. A delayed cleanup still checks the original
105/120-minute cutoffs and blocks destruction if they are missed; it never
creates a fresh deadline. Escalation and operator cost containment remain
necessary when finalization, upload, CI, review or approval cannot complete.

After qualification completes, use this operator-controlled sequence:

1. Verify the successful immutable artifact upload and preserve its exact
   `qualification.json` bytes at
   `docs/evidence/production-cutover/0021-restore-evidence/artifacts/qualification-<run-id>.json`.
   Commit it with the canonical `zw0so7f5jbpu.json` record in an evidence-only PR
   and merge it into protected main after all normal required checks pass.
   Both must be tracked regular files, unchanged in the checkout. The record
   binds source, backup, acknowledged target ID/creation time, verification
   time, byte hash, actual verified scope and unresolved gates. For failed or
   UNKNOWN qualification, keep verified scope empty, every required scope
   unresolved and restored state `retained`; cleanup does not certify recovery.
2. Include `nativeRestoreCleanup` with schema
   `native-restore-cleanup-intent-v1`, state `DELETE_PENDING`, qualification SHA,
   run ID and workflow ID, target ID, the immutable reserved cleanup workflow ID
   and run number, qualification artifact ID/archive SHA-256 and exact evidence
   outcome. Compute the normal `recordSha256` over the complete record,
   including this intent. This committed pending intent precedes any DELETE.
3. The reserved human reviews the two canonical data files at the exact merged
   evidence commit on current protected main and posts the **exact unedited** text produced by
   `reviewAttestation(evidenceSha, record, report)` in
   `scripts/ci/planetscale-native-restore-evidence.mjs`. A generic approval,
   bot, edited comment, missing record, failed upload or hash mismatch cannot
   authorize cleanup. Reviewed failure evidence can authorize target deletion
   while every recovery gate remains unresolved.
4. Obtain separate owner approval for irreversible deletion of **only** the
   original acknowledged target ID, plus normal protected production review.
   Dispatch the cleanup workflow once with `mode=cleanup`, current protected
   main `release_sha`, identical `evidence_sha`, merged evidence PR/comment IDs and original
   qualification run ID. Cleanup code always comes from reviewed main; code
   from the evidence checkout is never executed. An uploaded artifact or
   unmerged PR cannot substitute for the canonical tracked record on protected
   main. Allow for the normal evidence PR checks/merge in the reserved window;
   delays can exhaust that window and require immediate operator escalation.
   Later release acceptance still requires every existing release gate.
5. Cleanup revalidates evidence/provenance and actual GitHub production review,
   downloads the immutable qualification artifact and compares its bytes, then
   uploads and downloads a separate immutable pending-attempt artifact before
   DELETE. Failure at either upload/download blocks destruction. Preserve the
   separate `cleanup.json` receipt; never edit qualification bytes to insert a
   cleanup result. A missing receipt cannot be reported as verified cleanup.

Qualification SHA is retained separately from the later evidence/cleanup SHA.
The evidence SHA must equal the current protected main cleanup SHA. Evidence
commits may advance main; cleanup permits only the two canonical data-file
changes since qualification, so such advancement does not deadlock deletion.
Any code change requires reconciliation; cleanup never accepts arbitrary new
code because an old qualification passed.

Separate cleanup approval JSON (all fields bind the reviewed record):

```json
{
  "action": "delete_only_original_acknowledged_target_once",
  "cleanupSha": "CURRENT_PROTECTED_MAIN_SHA", "evidenceSha": "SAME_REVIEWED_MERGED_EVIDENCE_SHA",
  "qualificationRunId": "ORIGINAL_RUN_ID", "targetId": "ACKNOWLEDGED_NEW_PROVIDER_ID",
  "recordSha256": "CANONICAL_RECORD_HASH", "operator": "OWNER_GITHUB_LOGIN",
  "maximumUsd": 5, "reference": "SEPARATE_OWNER_DELETION_APPROVAL",
  "expiresAt": "UTC_NO_LATER_THAN_ORIGINAL_TWO_HOUR_DEADLINE"
}
```

The cleanup workflow ID and reserved run number are bound into the immutable
qualification artifact and tracked intent. GitHub increments `run_number` for
every new dispatch; reruns retain the number but increase `run_attempt`.
Only the reserved number at attempt 1 may DELETE. A new dispatch, deleted
artifact, renamed/recreated workflow or rerun cannot reset this permission.
Persisting pending state before DELETE makes a lost acknowledgment fail closed
across dispatches, rather than allowing a new run ID to repeat the mutation.
An accidentally consumed reservation or definite pre-DELETE failure still has
no automatic retry path; report the exact known state for separate incident
review. An uncertain mutation permits read-only reconciliation only.

## Failure and reconciliation

Every mutation is one attempt, preceded by a sanitized checkpoint and fresh
protected-main check. A create timeout/invalid acknowledgment leaves ownership
unproven: do not retry creation or delete a guessed branch. Read provider state
and reconcile the operation manually first. A reset or extension commit with
an uncertain outcome is never repeated. Qualification always retains the bound
target; only the separate reviewed cleanup phase may delete it.

Cleanup independently rechecks the acknowledged new ID, fixed name, source
branch and backup's restored-target list. It cannot delete main, a preexisting
target, a replacement ID, a protected target or a guessed resource. DELETE is
sent once, then read-only absence is checked even if acknowledgment was lost.
Only an explicit GET 404 or a valid UTC deletion timestamp for the exact owned
identity, plus backup binding and a complete branch-inventory readback, confirms
cleanup. GET 204, omitted/malformed timestamps and changed
identities keep cleanup unresolved and potentially billable.
The backup's exact restored-target relationship and protection are checked
before DELETE. Post-delete checks preserve backup/source identity and verify
target absence; they do not assume the provider retains a deleted target in
its backup relationship list.
It never retries a denied/uncertain DELETE. Failed binding, failed cleanup,
cancelled jobs, runner crashes, API outages and artifact failures require the
named operator to inspect the provider and escalate ongoing charges. A software
deadline cannot enforce a provider spending cap or guarantee cleanup after
machine loss. Keep the checkpoint's exact target ID; reconcile before manual
deletion, and never delete an unrelated resource. `mode=reconcile` is GET-only:
it proves the original acknowledged create, tracked immutable qualification
bytes, original completed run/upload provenance and fresh artifact download.
It permits an older evidence commit in protected main's history and does not
require a timely cleanup review, unchanged qualification code or deletion
consent. Normal protected production approval remains required. This allows
responders to inspect a retained target after deadlines or code changes without
authorizing DELETE. It uses immutable backup/source binding rather than
requiring the old backup still to exist. A missing/expired qualification artifact,
changed identity or uncertain create remains blocked; it never discovers a new
owner by name. It can report target presence or observed absence but never invent
a DELETE acknowledgment or verified cleanup receipt. It cannot reset credentials, install extensions,
create resources or rerun qualification. Preserve receipts before
cleanup, including partial/uncertain outcomes. Source backup protection is
deliberately not rolled back automatically.

## Contracts and tests

The implementation follows the official [service-token contract](https://planetscale.com/docs/api/reference/service-tokens),
[create branch](https://planetscale.com/docs/api/reference/create_branch),
[reset role](https://planetscale.com/docs/api/reference/reset_role),
[delete branch](https://planetscale.com/docs/api/reference/delete_branch),
[Postgres backups](https://planetscale.com/docs/postgres/backups), and
[GitHub review-history API](https://docs.github.com/en/rest/actions/workflow-runs#get-the-review-history-for-a-workflow-run).
The one-use reservation follows GitHub's documented
[`GITHUB_RUN_NUMBER` and `GITHUB_RUN_ATTEMPT`](https://docs.github.com/en/actions/reference/workflows-and-actions/variables#default-environment-variables)
semantics. Evidence review reads the exact PR/comment through the existing
read-only GitHub token; neither workflow adds GitHub write permissions or creates
secrets. Only their provider-operation steps receive the dedicated restore secret.
Build cancellation uses esbuild's documented
[context cancellation/disposal](https://esbuild.github.io/api/#cancel); the
SQL and Worker cancellation adapters are verified with synthetic failure tests.
These contracts do not prove the existing token has those rights.

Focused tests use mocks for denial, stale/budget failures, partial resets,
identity/binding mismatch, lost acknowledgments, no retries, and failed cleanup.
The registered disposable PG17 test applies only synthetic local fixtures,
checks the actual catalog SQL and all 17 privileges, exercises the real three
Worker handlers/five bindings/four roles, and rejects tampered grants/registry.
It never connects to PlanetScale.
