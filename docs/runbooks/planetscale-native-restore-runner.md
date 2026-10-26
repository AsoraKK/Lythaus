# Fixed native restore runner

This is preparation, not permission to dispatch execution. Read-only run
`40175663686` verified the dedicated restore token's nine target-database
actions and organization `read_service_tokens`. Later qualification run #9
`40212030891` created an isolated target, then failed copied-role REST metadata
validation before resetting any copied credentials. Its exact target was
manually deleted under a separately recorded incident decision; the original
failed qualification and distinct manual receipt remain preserved. Recovery is
not certified. Mock success and disposable PG17 success are not operational
restore evidence. Source review, normal required CI, exact merged-source review
and a fresh separate owner action packet remain required before execution.

## Fixed scope

`planetscale-native-restore-check.yml` defaults to a read-only metadata plan.
Execution is restricted to protected current main in repository ID 1010752912,
attempt 1, a named human's normal production approval, and an exact approval
record. Every prior execute run in the complete workflow history blocks another
execution, even across SHAs. The only reconciled prior executions are the three
exact pinned runs #7, #8 and #9; complete history must include all three and every other
non-plan execution blocks. Run #7 (`40184823787`, SHA
`43829abc3424a88a22826695bbfdc7be4a116e62`) must remain a terminal cancellation
with no production approval, one terminal job with no runner and an explicit
empty step list, and no artifacts. Run #8 (`40193991312`, SHA
`96ff66fa5c28c9780ce72ee23a40cd846372d6bd`) must remain the exact terminal
pre-create failure: its one job must fail at step 6 during copied-role metadata
validation, complete evidence finalization and upload, and retain the pinned
single artifact ID, size and digest whose inspected report records zero
provider mutations, no credential actions and no target. Run #9 must retain its
exact failed run/job/step sequence and immutable uploaded artifact identity,
size and digest. Its committed original qualification and separate manual
cleanup observation must match pinned byte hashes, proving one acknowledged
create, zero credential actions, the original target ID `gnbnmpsu7r5k` and the
recorded manual deletion. This does not convert manual cleanup to an automated
PASS or certify recovery. The restored-role REST representation remains
unresolved; this reconciliation does not change role matching or reset gates.
Any missing, changed, extra or uncertain evidence blocks. Before target creation, the runner also
requires an exact target GET 404, a complete branch inventory without the
target name or old acknowledged target ID, and backup restore history without
the target. These pinned reconciliations never permit retry after any other
runner or step sequence, or after an uncertain provider mutation.

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
setup role and all four application roles must remain login-enabled. The
provider's `with_replication` field is documented as the PostgreSQL
`REPLICATION` attribute, so it is true only for setup and false for the four
application roles ([Terraform provider schema](https://github.com/planetscale/terraform-provider-planetscale/blob/main/docs/data-sources/postgres_branch_role.md),
[official Go client](https://github.com/planetscale/planetscale-go/pull/323)).
The verifier continues to require exact copied role metadata, including branch,
lifecycle, and source-to-copy inheritance checks. Other REST fields remain
strictly validated without normalization. Other SQL role fields and membership
grant options are bound by exact source-to-copy catalog equality rather than
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

The protected production environment and queue can delay execution. Reserve
the actual queue and setup allowance before the full two-hour runner window;
approval at thirty minutes into a two-and-a-half-hour block is too late once
setup time is included. Checkout, the main guard and Node setup each have a
one-minute limit. The pre-dependency admission then reserves five further
minutes for itself and dependency installation, and checks the complete packet
and pinned backup freshness without provider access. The runner repeats live
admission and source catalog verification immediately before creation. These
checks cannot reserve GitHub queue capacity. Dispatch only with a named
available reviewer/operator and enough remaining time for the observed queue,
all setup limits and the original two hours. A runner-started failed preflight is not eligible for the
one pinned pre-runner cancellation. Only the exact pinned run #8 pre-create
failure and run #9's separately verified manual deletion described above can
be reconciled after a runner starts. No later failure is automatically eligible.

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
The US$5 ceiling is cumulative across this exercise, including run `40212030891`
and any continuing protected-backup liability. The packet must bind an explicit
owner-reviewed upper bound to private supporting evidence by SHA256 and reference.
The runner checks the arithmetic and human approval, not the underlying bill.
Unknown prior spend or unbounded retention cannot be represented as zero. A
completed prior retention end action may be recorded with its actual past end
time; a future action needs separate authority and an end within 24 hours.
The dedicated token's documented `expires_at` must cover the original cleanup
deadline (or explicitly be null). This does not renew a token or authorize its use.

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
  "cumulativeBudget": {
    "operator": "OWNER_GITHUB_LOGIN", "priorQualificationRunId": "40212030891",
    "evidenceSha256": "SHA256_OF_PRIVATE_REVIEWED_PRIOR_COST_AND_RETENTION_EVIDENCE",
    "reference": "OWNER_REVIEWED_UPPER_BOUND_REFERENCE",
    "priorSpendUpperBoundUsd": 0,
    "priorRetentionUpperBoundUsd": 0,
    "priorRetentionEndActionReference": "SEPARATE_PRIOR_RETENTION_END_ACTION_AUTHORITY_OR_RECEIPT",
    "priorRetentionEndsAt": "ACTUAL_OR_SEPARATELY_APPROVED_FINITE_END_TIME"
  },
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
new-attempt allowance; add both prior upper bounds for the cumulative ceiling.
The zero prior-spend placeholder is deliberately rejected. No secret belongs in this record. The approver's
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
qualification job has a 36-minute timeout. These leave reserve before escalation
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
dependency installation has four minutes, plus one minute for static admission.
All step budgets total 35 minutes, leaving one minute inside the 36-minute job for teardown; slow preparation fails
before provider access rather than consuming the finalization reserve.

Branch readiness does not prove role inventory readiness. The runner allows at
most twelve complete read-only role observations, ten seconds apart, within a
two-minute phase and the original qualification budget. Only absent or
not-yet-ready roles may converge. Malformed metadata, authority or identity
conflicts stop immediately. All five exact identities and connection metadata
must pass together before any reset; observed role IDs cannot change between
samples or before their single reset. Evidence retains sanitized counts and
outcomes, never credentials. This behavior does not establish the cause of a
past failure whose raw inventory was not retained.

Extension reconstruction captures source version, schema, owner and relocation
metadata. Only the three existing approved names in `public`, owned by `postgres`
or the approved setup role, are supported. Existing target metadata must match.
Every missing exact version and existing owner authority is checked before DDL
and again in the installation transaction. Installation uses explicit VERSION
and SCHEMA under the source owner through already-granted SET ROLE authority;
it creates no roles, grants or schemas and performs no upgrades. Unsupported
owners/schemas/versions or unavailable authority require a separately reviewed
scope decision. Final catalog equality remains mandatory. See PostgreSQL's
[CREATE EXTENSION](https://www.postgresql.org/docs/17/sql-createextension.html)
and [SET ROLE](https://www.postgresql.org/docs/17/sql-set-role.html) contracts.

Cleanup rechecks the acknowledged target after awaited checkpoint/GitHub work,
then checks consent and the original deadline immediately before DELETE. The
provider endpoint is name-addressed; the ID verification is not an atomic
conditional deletion. Exclusive target ownership remains required. After one
DELETE attempt, at most twelve GET observations may reconcile delayed absence
within the original deadline. A replacement or conflict stops reconciliation;
no uncertain mutation is repeated.

Reviewed containment permits the exact canonical two-file evidence PR to remain
unmerged while its immutable qualification bytes and human attestation are
verified. Cleanup executes the qualified code on unchanged protected main;
the evidence PR head is separate and its code is never executed. These are the
only cleanup policy substitutions. Canonical evidence merge, normal required
CI and every release-certification gate remain required for release acceptance.
Failed or UNKNOWN qualification remains uncertified after target deletion.

Qualification, evidence preparation and exact human attestation must still fit
the original 60-minute review limit. Cleanup must start by 105 minutes and end
within the original 120-minute window. Evidence CI may continue independently;
it no longer holds a paid target open while waiting for a build or merge.
This does not bound provider outages, GitHub queues or human response time.
The target ID and artifact hashes exist only after creation and upload, so the
initial qualification approval cannot substitute for later exact-byte review
and separate target-deletion consent.

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
   Commit it with the canonical `zw0so7f5jbpu.json` record in a same-repository
   evidence-only PR descended from the exact qualification source SHA. Keep
   protected main at that qualified SHA through cleanup; reserve exclusive
   ownership of the fixed target. The PR must remain open and unmerged at its
   reviewed head. Both files must be tracked regular files, unchanged in the
   checkout, and the comparison must contain exactly those two data files. The record
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
3. The reserved human reviews the two canonical data files at the pinned evidence
   PR head and posts the **exact unedited** text produced by
   `unmergedCleanupAttestation(evidenceSha, record, report)` in
   `scripts/ci/planetscale-native-restore-reviewed-cleanup-evidence.mjs`. It binds
   the PR head, record hash, qualification byte hash, target, reserved permit
   and actual qualification outcome. A generic approval,
   bot, edited comment, missing record, failed upload or hash mismatch cannot
   authorize cleanup. Reviewed failure evidence can authorize target deletion
   while every recovery gate remains unresolved.
4. Obtain separate owner approval for irreversible deletion of **only** the
   original acknowledged target ID, plus normal protected production review.
   Dispatch the cleanup workflow once with `mode=cleanup`, current protected
   main `release_sha` equal to the original qualification source SHA, the
   separate pinned PR-head `evidence_sha`, evidence PR/comment IDs and original
   qualification run ID. Cleanup code always comes from reviewed main; code
   from the evidence checkout is never executed. The uploaded artifact must
   match the committed qualification file exactly. Normal evidence PR checks
   may run in parallel; a pending or failed build cannot certify release and
   does not waive any cleanup identity, consent or timing gate.
5. Cleanup revalidates evidence/provenance and actual GitHub production review,
   downloads the immutable qualification archive and verifies its digest and
   exact extracted bytes. The production CLI runs `prepare`, `download`, then
   `stage`; staging exclusively records both pending data and the upload intent.
   The pinned artifact-upload action creates the immutable pending artifact
   without overwrite. `verify-pending` validates its returned ID and digest,
   downloads the raw ZIP and checks its exact pending bytes before `delete`.
   Upload uncertainty or any verification failure blocks destruction; do not
   repeat the upload stage, rerun the workflow or repeat DELETE. Preserve the
   separate `cleanup.json` receipt; never edit qualification bytes to insert a
   cleanup result. A missing receipt cannot be reported as verified cleanup.

Qualification SHA equals the cleanup executable SHA and current protected main
for deletion. The separate evidence SHA pins an open, unmerged data-only PR.
Main drift, a moved PR head, a third file, altered bytes or an edited attestation
blocks deletion. Keep the evidence PR open at its attested head until target
readback and any read-only continuation are resolved. Evidence merge then
follows containment and normal required checks; it is still mandatory for
release acceptance. The release loader and its successful-qualification
requirements are unchanged.

Separate cleanup approval JSON (all fields bind the reviewed record):

```json
{
  "action": "delete_only_original_acknowledged_target_once",
  "cleanupSha": "QUALIFIED_CURRENT_PROTECTED_MAIN_SHA", "evidenceSha": "PINNED_REVIEWED_EVIDENCE_PR_HEAD_SHA",
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
The staged read-only path runs `prepare`, `download`, then `reconcile`. It
retains the original exact human attestation and pinned unmerged PR data; the
evidence head need not be an ancestor of main. Current protected main may
advance only with the original qualification SHA in its history. It does not
renew deletion consent, the old deadline, the reserved run number or credential
authority, and creates no pending upload or DELETE attempt. Normal protected
production approval remains required. This permits observation after consent
expiry or main drift without authorizing another mutation. The pinned evidence
PR must still be open and unmerged; after it closes or merges, this route fails
closed and does not invent a substitute attestation or evidence history.
It uses immutable backup/source binding rather than
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
The cleanup adapter uses the documented
[artifact download endpoint](https://docs.github.com/en/rest/actions/artifacts#download-an-artifact)
to obtain the raw ZIP. It accepts one HTTPS redirect to GitHub's documented
artifact-storage domains, sends no token or cookies on that redirected request,
and bounds each response and read. It checks the raw archive SHA-256 and exact
extracted bytes; artifact-action success alone is insufficient. The pinned
[upload action](https://github.com/actions/upload-artifact/blob/ea165f8d65b6e75b540449e92b4886f43607fa02/src/shared/upload-artifact.ts)
provides the actual immutable archive ID and digest. No REST upload endpoint,
new artifact store or new credential is introduced.
Ordinary CodeQL CI also rehearses this transport with a tiny synthetic JSON
artifact and the same pinned upload action. Its existing `actions: read`
permission is unchanged. The production downloader must verify the real
uploaded archive's metadata, digest and extracted fixture bytes; failures fail
the check. The artifact lasts one day and contains only source/run identifiers
and explicit synthetic markers. This job receives no provider credentials and
never dispatches the reserved cleanup workflow. A green mocked test does not
substitute for this hosted artifact round trip, which establishes GitHub
transport behavior only and cannot certify a database restore.
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
