# 0021 candidate execution consent proposal

> **Status update, 2026-10-18:** The consent-gate proposal merged in #1050 at
> `be75bb4c354bbf576b93a9b26f38716379075d1b`. The owner later approved keeping
> the existing PS-5 single-node topology only for `0021-only` maintenance, as
> recorded in the [cutover runbook](../runbooks/planetscale-0021-cutover-preparation.md).
> This resolves only the migration-specific HA wording; it is not general HA
> acceptance or execution consent. The evidence and blocker list below remain
> a historical readiness snapshot and do not prove protection, restore, role,
> cost, or final-candidate approval.

The owner approved a maintenance gap and beginning preparation now. At the
parent's 05:57 UTC verification, main
`116812fdc51d9aef7dae4c36354c75b097fc7533` had terminal green candidate checks:
CI `39100426688`, all eight jobs and five ancillary push workflows. That
evidence is recorded in the [dated packet](../evidence/production-cutover/2026-10-18-0021-maintenance-readiness.json).
It does not cover the new commit that would result from merging this proposal.

## Proposed consent gate

The old plan always adds `0021_cutover_owner_decision_pending`, so no amount of
completed evidence can make execution reachable. This proposal replaces that
unconditional blocker with consent for one exact candidate, while keeping all
other checks and the separate production environment review.

Configure these non-secret variables in the protected `production` environment
only after the owner specifically approves the hosted 0021 action and the
parent coordinates the final merged candidate:

| Variable | Required value |
| --- | --- |
| `PLANETSCALE_0021_EXECUTION_APPROVED_SHA` | The exact lowercase 40-character current-main release SHA |
| `PLANETSCALE_0021_EXECUTION_APPROVAL_REFERENCE` | A reference identifying the specific hosted execution approval |

Both read-only plan steps consume these variables, and the executor independently
validates them before creating a database client. They are not workflow-dispatch
inputs. Missing/malformed/stale SHA or an empty reference blocks execution,
including when `ready=true` is supplied. A later main SHA requires a new
candidate-specific decision. The approval is scoped to the pinned 0021 path;
it authorizes no grant, credential, purchase, restore or release operation.

The maintenance statement does not set these variables. This proposal does
not write protected configuration or authorize its own future merge SHA.
A matching consent only removes the consent blocker: protected backup and
reviewed restore-evidence record, canonical registry, exact provider/SQL
identity, role/Hyperdrive binding, operator estimate and positive cost-ceiling
checks still determine readiness. The source branch's
`restore_checklist_completed_at` marker is informational and does not establish
source recoverability.
No output or plan artifact may be edited to manufacture `ready=true`.

## Freshly verified safeguards

Metadata-only reads confirm the same sole ready PostgreSQL production target:
`lythaus/lythaus-core/main`, database ID `hzhe0cbn6rxi`, branch ID
`vqa2g2xc9wsl`. The `postgres.media` schema export includes
`media.upload_sessions` without `quarantine_deleted_at`, consistent with the
parent-reported live release 128 at schema 0020. The export does not prove the
registry checksums, index-progress visibility or connected SQL role.

The source comparison confirms the exact migration bytes, staged recovery
primitives and local PG17 recovery test from reviewed #1040 are unchanged.
That rehearsal establishes local retry/recovery behavior; it provides no hosted
backup restore evidence. Existing successful CI was not rerun or polled.

The current invoice metadata still reports the PS-5 ARM `main` line-item
subtotal US$5.00 through Cloudflare. This existing charge is not an estimate of
additional migration storage, WAL, backup retention or egress, and is not a
spending ceiling. Actual disk/index/WAL measurements and an approved positive
ceiling are still missing. Do not substitute a zero estimate for missing data.

## Proof still blocked

- The supplied PlanetScale environment value still fails the supported
  `ID:Token` validator before networking. No direct role or backup GET was sent;
  no PlanetScale HTTP permission denial has been inferred from that failure.
- Prior Cloudflare Hyperdrive GET HTTP 401 and GitHub production-variable GET
  HTTP 403 were not retried. Existing local schema-read/admin URL, SQL-role
  mapping, backup ID and usage ceiling inputs are unavailable. The MCP SQL-read
  tool creates credentials, so it remains outside this authorization.
- Actual current runtime/application-admin/migration-executor binding,
  ownership/effective privileges, complete registry and active-index visibility
  are unverified. No historical role candidate has been accepted as a grantee.
- A fresh successful protected unexpired backup ID and actual restore evidence
  have not been retrieved. `restore_checklist_completed_at=null` records only
  the missing checklist marker; it does not establish that backups are absent.
- Live database/branch deletion protection is off and replicas remain zero.
  The documented HA precondition is therefore unsatisfied. No protection,
  topology, grant or policy exception has been silently applied.

## Smallest next owner action

Have an operator with existing authorized access supply one sanitized readiness
packet for the exact target: actual provider-role/Hyperdrive-user mapping and
SQL session/ownership/effective privileges; canonical registry/catalog state;
the selected backup's ID, source branch, successful timestamps, expiry and
protection plus existing restore/independent-recovery evidence; and current
disk/index/WAL/egress measurements. Supply no passwords or connection strings.
This obtains missing proof without issuing agent credentials or expanding grants.

Resolve protection and recovery evidence separately through their specific
approvals. The `0021-only` single-node decision removes only the topology
conflict; it grants no topology change and establishes no general HA acceptance.
Establish the measured additional-usage estimate and exact approved positive
ceiling;
maintenance consent supplies neither spending nor configuration permission.
Only after those proofs and decisions are complete should the parent coordinate
the final merged candidate and record its specific execution approval SHA and
reference. The immediate next step is that evidence packet, not activating
maintenance or dispatching execution.
