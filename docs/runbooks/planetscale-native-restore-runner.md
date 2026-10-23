# Fixed native restore runner

This is preparation, not permission to dispatch execution. The runner has not
restored a hosted backup, reset provider credentials or demonstrated that the
existing protected API key has the required access. Mock success and disposable
PG17 success are not operational restore evidence. Parent source review, normal
required CI, exact merged-source review and the separate owner action packet
remain required before dispatching `execute=true`.

## Fixed scope

`planetscale-native-restore-check.yml` defaults to a read-only metadata plan.
Execution is restricted to protected current main in repository ID 1010752912,
attempt 1, a named human's normal production approval, and an exact approval
record. A prior execute run at the same SHA blocks another execution, even if
that prior run failed. Never rerun an uncertain mutation.

Source is `lythaus/lythaus-core/main` (`vqa2g2xc9wsl`), backup `nxqskcldn8yk`.
The only target is `lythaus-0021-native-restore-check-20261022`: PS-5 ARM,
Frankfurt, zero replicas, minimum and maximum 21474836480 bytes. Any preexisting
target is refused. The runner creates no database, role, GitHub secret,
Hyperdrive, binding, traffic route or application deployment. Source passwords
are never reset. Migration 0021 is never applied.

The requested PITR timestamp is explicitly `2026-10-23T14:29:11.907Z`, the
recorded completion of this backup. This is a requested recovery point, not
proof of the actual replay point. Provider completion plus independent SQL
checks must establish what was restored; all 17 previously approved privileges
are tested directly. The API receipt does not expose an actual replay point,
so provider attestation and owner acceptance remain a reviewed evidence step.
Neither backup timestamps nor the provider checklist certify restored grants.

The whole two-hour window must fit before the backup reaches 24 hours old and
before expiry. For this backup, start before 2026-10-24 12:29:11.907 UTC.
No replacement is silently chosen. A two-hour test does not waive deletion
protection. If separately approved, only this named backup can be protected;
no backup protection is removed and no backup is deleted.

## Existing-access and bootstrap limitations

The runner uses the existing protected `PLANETSCALE_API_TOKEN` service-token
pair and the existing `PLANETSCALE_SCHEMA_READ_DATABASE_URL`. It first reads
database identity and that token's own permissions. Missing `read_service_tokens`
or database-level access blocks before spending. No new scope is granted.
The documented restore permission is `restore_production_branch_backup`
(the endpoint also documents the plural alias). Read/create/restore/backup
update permissions and connection/deletion authority are checked before paid
creation. Because the create contract does not let this caller set the new
branch's production classification, the conservative preflight requires the
existing connection/deletion permissions for both classifications. If these
are absent, report the exact missing existing permission; do not expand the
token or create a branch to discover whether cleanup will work.

Copied role IDs are discovered by exact base username and branch identity,
never guessed from SQL names. Metadata must match the source's inheritance:

| Purpose | Copied identity |
| --- | --- |
| Setup only | `pscale_api_47syed2xlt6p` |
| Public | `pscale_api_ysl604shosjg` |
| Admin | `pscale_api_3vzps7bu44vo` |
| Jobs | `pscale_api_9jfbtij9y4b2` |
| Privacy | `pscale_api_wv7rzyuejknl` |

Restored passwords are not usable until reset. It is therefore impossible to
prove target SQL authority before the first reset without another already
authorized target connection. The exact owner packet must authorize resetting
only the copied setup identity first, after API authority and all copied-role
metadata are checked. Its new password stays in process memory. A read-only SQL
probe then proves extension availability and effective CREATE authority before
any extension installation or remaining four resets. Insufficient authority
aborts and cleans the acknowledged owned target; no grant or new credential
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
function text are never retained. A seven-day artifact contains only
`summary.json`. Copy its verified bytes/hash into the existing tracked recovery
evidence process and obtain independent reviewer acceptance before using it
for release planning. `recoveryAcceptance=NOT_CERTIFIED` remains explicit;
the independent destination remains `DEFERRED_BY_OWNER_EXCEPTION`. No release
or recovery gate is automatically marked passed.

## Owner packet and execution

After exact merged-source review, prepare this wording with the actual SHA,
approval reference, approver GitHub login and expiry:

> Approve one restore qualification on the fixed PS-5 ARM Frankfurt target
> from backup nxqskcldn8yk, requesting 23 October 14:29:11.907 UTC, within US$5
> total including tax/fees. Protect only this fresh backup; its protection and
> backup/WAL retention continue after target deletion and need follow-up at
> release review. Reset only the five copied target identities listed above,
> setup first for the authority probe; never change source credentials. Install
> only the three named extensions if proven missing and authorized. Retain
> sanitized evidence. After verification or failure, irreversibly delete only
> the new target ID acknowledged by this run and verified against this backup.
> I will watch the run and handle failed cleanup/retention within the budget.

Known two-hour compute/storage plus a conservative 20-GiB additional backup/WAL
day and 10-MiB egress is about US$0.038604429 before tax/fees. The packet must
include a positive reviewed fee/uncertainty allowance; estimate plus allowance
must be at most US$5. This is a metered allowance, not a provider hard cap.
The observed US$10 email threshold is an alert. Previously denied Cloudflare
billing reads are not retried. Existing older protected backups already bound
the oldest WAL window; do not assume all incremental retention charges are zero
or promise indefinite protection fits this exercise budget. The manual operator
must review ongoing protection/charges separately; the runner never silently
unprotects a backup to stop billing.

`approval_json` fields (replace placeholders; arrays must preserve this order):

```json
{
  "releaseSha": "EXACT_REVIEWED_MERGED_SHA",
  "backupId": "nxqskcldn8yk",
  "target": "lythaus-0021-native-restore-check-20261022",
  "maximumUsd": 5,
  "estimatedSubtotalUsd": 0.04,
  "taxAndFeeAllowanceUsd": 1,
  "recoveryPointAcknowledged": true,
  "reference": "EXACT_OWNER_APPROVAL_REFERENCE",
  "manualOperator": "OWNER_GITHUB_LOGIN",
  "expiresAt": "UTC_EXPIRY_COVERING_THE_TWO_HOUR_WINDOW",
  "actions": ["protect_named_backup", "restore_fixed_target", "reset_five_copied_roles", "install_only_missing_named_extensions", "delete_only_created_target", "manual_cost_watch_on_failure"],
  "roles": ["pscale_api_47syed2xlt6p", "pscale_api_ysl604shosjg", "pscale_api_3vzps7bu44vo", "pscale_api_9jfbtij9y4b2", "pscale_api_wv7rzyuejknl"]
}
```

`estimatedSubtotalUsd` is the reviewed known estimate, with `taxAndFeeAllowanceUsd`
reserved on top for any remaining taxes/fees and uncertainty. Their sum is the
reviewed upper allowance. No secret belongs in this record. The approver's
actual GitHub review history must match `manualOperator`; supplying JSON does
not substitute for normal protected production review.

## Failure and cleanup

Every mutation is one attempt, preceded by a sanitized checkpoint and fresh
protected-main check. A create timeout/invalid acknowledgment leaves ownership
unproven: do not retry creation or delete a guessed branch. Read provider state
and reconcile the operation manually first. A reset or extension commit with
an uncertain outcome is never repeated. Cleanup may still delete the already
bound owned target under the explicit target-deletion approval.

Cleanup independently rechecks the acknowledged new ID, fixed name, source
branch and backup's restored-target list. It cannot delete main, a preexisting
target, a replacement ID, a protected target or a guessed resource. DELETE is
sent once, then read-only absence is checked even if acknowledgment was lost.
Only an explicit GET 404 or a valid UTC deletion timestamp for the exact owned
identity confirms cleanup. GET 204, omitted/malformed timestamps and changed
identities keep cleanup unresolved and potentially billable.
It never retries a denied/uncertain DELETE. Failed binding, failed cleanup,
cancelled jobs, runner crashes, API outages and artifact failures require the
named operator to inspect the provider and stop ongoing charges. A software
deadline cannot enforce a provider spending cap or guarantee cleanup after
machine loss. Keep the checkpoint's exact target ID; reconcile before manual
deletion, and never delete an unrelated resource. Preserve receipts before
cleanup, including partial/uncertain outcomes. Source backup protection is
deliberately not rolled back automatically.

## Contracts and tests

The implementation follows the official [service-token contract](https://planetscale.com/docs/api/reference/service-tokens),
[create branch](https://planetscale.com/docs/api/reference/create_branch),
[reset role](https://planetscale.com/docs/api/reference/reset_role),
[delete branch](https://planetscale.com/docs/api/reference/delete_branch),
[backup update](https://planetscale.com/docs/api/reference/update_backup),
[Postgres backups](https://planetscale.com/docs/postgres/backups), and
[GitHub review-history API](https://docs.github.com/en/rest/actions/workflow-runs#get-the-review-history-for-a-workflow-run).
These contracts do not prove the existing token has those rights.

Focused tests use mocks for denial, stale/budget failures, partial resets,
identity/binding mismatch, lost acknowledgments, no retries, and failed cleanup.
The registered disposable PG17 test applies only synthetic local fixtures,
checks the actual catalog SQL and all 17 privileges, exercises the real three
Worker handlers/five bindings/four roles, and rejects tampered grants/registry.
It never connects to PlanetScale.
