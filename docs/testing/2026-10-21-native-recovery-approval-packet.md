# Native recovery preparation, 21 October 2026

Status: **PREPARATION ONLY; NOT APPROVED OR EXECUTED**. This packet preserves
the owner's deferral of off-provider exports, extra R2 exports and a separate
encryption key. It does not request or grant permission to use that route.

## Observed state

- Repository main: `360aae649b58d4692e0332086c0d2fef6e0e4da6` when refreshed.
  PRs 1065/1066 are integrated. The bounded verifier grant and passing identity
  preflight were not repeated or expanded.
- Fresh PlanetScale metadata: only `lythaus/lythaus-core/main`, branch
  `vqa2g2xc9wsl`, PS-5 ARM, AWS Frankfurt, zero replicas, ready and production.
  Branch deletion protection is enabled; database-level deletion protection is
  false. No protection setting was changed.
- Fresh schema GET for `postgres.media`: `upload_sessions` exists, but the
  0021 cleanup column/index are absent. A schema GET is not registry proof.
- The latest completed canonical release remains run
  [39010370047](https://github.com/AsoraKK/Lythaus/actions/runs/39010370047),
  SHA `3880a8be4c89459dd7ef831c9385817a887511ef` (release 128). No later
  canonical release or migration execution was found.
- The sanitized plan from
  [39426853542](https://github.com/AsoraKK/Lythaus/actions/runs/39426853542)
  reports the exact canonical registry through 0020, staged state
  `NOT_APPLIED`, and passing five-binding Hyperdrive/SQL target identity.
  Execution was disabled. This is dated 20 October evidence, not a new SQL
  observation made by this preparation.
- That plan selected protected successful backup `wufjl9ejjqgj`, created
  14 August 2026 and expiring 14 August 2027. It has no complete reviewed restore
  packet. Protection and expiry alone do not establish fresh recoverability.
  Historical `pa4t6j6s07b7` proves only its recorded partial schema scope.

## Smallest native restore cost

The current authenticated SKU inventory quotes PS-5 ARM single-instance compute
at **US$5/month**. That is the smallest observed native configuration matching
the source. Do not provision PS-DEV or HA as a substitute. A restore creates a
separate billable branch in the source region. The provider documents
millisecond proration, included storage/egress, and usage charges in its
[Postgres pricing](https://planetscale.com/docs/postgres/pricing).

For October's 744 hours, compute alone is approximately:

| Duration | Compute estimate |
| --- | ---: |
| 1 hour | US$0.00672 |
| 2 hours | US$0.01344 |
| 24 hours | US$0.16129 |

The existing invoice's prior deleted restore branch has net compute US$0.13
and net storage US$0.04 after its displayed prorated discounts. This is
historical evidence of billed usage, not a quote for the next restore. The
invoice total of zero does not establish that restoration is free.

The public region endpoint
[`storage-rates?region=eu-central`](https://api.planetscale.com/www/storage-rates?region=eu-central)
returns US$0.149/GB/month; the corresponding
[`egress-rates`](https://api.planetscale.com/www/egress-rates?region=eu-central)
returns US$0.06/GB. Assuming an additional billed 10 GB conservatively gives
US$6.49/month, about US$0.01745 for two hours or US$0.20935 for 24 hours,
before other usage. This assumption deliberately does not claim an unmeasured
allowance. Actual allocated disk, backup/WAL usage and runtime must be checked.

No all-in positive ceiling is approved. A proposed two-hour window does not
stop billing automatically. Branch deletion also needs explicit authorization;
without it, the continuing monthly rate must remain visible. The operator must
obtain the final restore preview, measured sizes/allowances and an accepted
total ceiling before provisioning. Migration storage/WAL cost approval is a
separate gate; these estimates do not populate either protected approval.

## Temporary credential scope

Restored role passwords are reset; source credentials cannot simply be reused.
See [restored branch roles](https://planetscale.com/docs/postgres/backups#roles-on-a-restored-branch).
The MCP SQL-read tool creates an ephemeral `pg_read_all_data` credential. It
cannot set a caller-specified TTL or custom inheritance through its exposed
arguments. It was not invoked. Such a credential reads all non-RLS-hidden data,
not merely catalogs, and is insufficient by itself to prove each application's
effective role or authenticated smoke.

The smallest catalog-only step is reuse of an existing approved read-only
connection qualified to the new restore branch, if one exists. Otherwise a new
branch-qualified verifier credential needs explicit approval, a named TTL and
verified effective privileges; no main credential changes are needed. The
[role API](https://planetscale.com/docs/api/reference/create_role) exposes TTL
in seconds. A proposed upper bound is one hour, with no renewal.

Complete native evidence additionally needs read-only representative queries
under the restored Public API, Admin, Jobs and Privacy identities. Prefer
existing approved restored-target credentials. If unavailable, approve those
specific restored-target credentials or a narrowly reviewed impersonation
mechanism separately, after inspecting their restored SQL role identifiers
and privileges. A generic all-data reader, source-role password reset or
all-data writer must not be substituted. Record the minimum identity count
after that inspection, rather than pretending one reader closes all scopes.

Do not create application rows, issue auth emails, reset source passwords,
grant new production permissions, change Hyperdrives, or route production
traffic to the restore. Any missing extension installation or privilege repair
on the restored target must be individually scoped before execution.

## Consolidated recovery decision still needed

1. Select a fresh successful `main` backup and approve any required protection
   or retention change with its measured backup/WAL cost.
2. Approve one specifically named native restore branch, selected backup ID,
   PS-5 ARM single-instance configuration, source region, maximum duration,
   all-in incremental spending ceiling, data handling and branch cleanup.
3. Approve only the restored-target credential/impersonation scope above that
   is actually needed; retain source identities and the previous stats grant.
4. Supply accepted RPO/RTO, complete native restore/schema/registry/effective
   privilege/application smoke evidence, sanitized artifact bytes/hash and
   independent evidence review. No production archive belongs in Git or public
   Actions artifacts.
5. After the final reviewed code is merged, bind the one-release owner-testing
   exception and the distinct 0021 execution consent to that full exact main
   SHA and protected run references. Configure genuine cost evidence and a
   positive migration usage ceiling. Execute only `0021-only` when the fresh
   protected plan passes, then deploy that exact merged commit through the
   canonical owner-testing release.

The owner approved deferring independent/off-provider recovery for one owner
test release only. That deferral is `DEFERRED_BY_OWNER_EXCEPTION`, never
verified. It does not close native recovery, cost, credentials or exact-candidate
consent. Independent recovery continues to block non-owner public readiness
after 0021.
