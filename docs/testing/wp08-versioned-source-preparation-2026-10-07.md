# WP08 disabled version-aware source/assessment preparation

Verified frozen main: `f47c11b099171d9c8173182b711b66b7e18c762f`.
Branch base: reviewed proposal PR956 head
`8dfef92c940bae704549400e3ba4500b2c53eed3`, which contains that main.
Reviewed PR953 commits `5bb69e7b` and `861bc645` are carried as dependencies
without changing either reviewed branch/head. Dependency checkpoint:
`966824e5f806a978416191560fa0df3577c1312e`. No branch merge or main mutation.

The parent reserved exactly these implementation paths:

- `database/planetscale/proposals/monthly_reputation_shadow.sql`
- `packages/db/src/monthly-reputation.ts`
- `apps/lythaus-jobs/src/monthly-reputation.ts`
- `apps/lythaus-jobs/tests/monthly-reputation.postgres.mjs`

This separate evidence note is the only additional authored document. Assembly,
snapshots, private report adapters/routes/exports, OpenAPI/generated clients,
barrels/dispatchers, DSR/reconciler, migration registry/roles/grants, CI and locks
are untouched. Support-qualified acceptance remains support-owned.

## Versions and exact gate scope

V1 remains `lythaus-monthly-rewards-2026-10-v1`, catalogue SHA-256
`bc8be9d8f4cae4b0f3ec327e09f308069dd3e6b07e8ff57ccc6a6cc62435f5a2`.
Its quarterly allowance is 0/1,000 and source maximum 13,500.
V2 remains the reviewed prospective `lythaus-monthly-rewards-2026-10-v2`, delta
SHA-256 `26213abccce99ee51be6c0623406c28aaa7d39ed3ea3b4ac630b7cffd859db67`.
The owner confirmed all-quarterly calendar timing at 20:00:03 UTC and additive
150 allocation/source cap 13,650 at 20:12:31 UTC on 7 October. Weekly top-four
whole-week selection, weekly/monthly budgets and lower level thresholds are
unchanged; L5 remains available to every membership plan.

The existing `trust.monthly_reputation_shadow` gate still requires enabled=true
and the exact **v1** policy. No flag value or live policy pointer is changed.
V2 preparation additionally requires an explicit `disposable_local_pg17`
context, the actual pg client's loopback connection and allowed fixture database,
matching server database and version 17, and the validated versioned constraints.
The allowed fixture database is `lythaus_monthly_test`; CI may use local
`postgres` only with `GITHUB_ACTIONS=true`. Missing context returns null before
any service query. No production configuration or environment flag enables it.

The separate direct Jobs preparation adapter is not wired into the dispatcher.
Ordinary Jobs processing defers a canonical v2 request and applies no points.
Prepared results are shadow-only, `preparationOnly:true`, `appliedPoints:0` and
`runtimeActivationAllowed:false`. They publish no level, snapshot or entitlement.
Existing Rewards routes predate this work; global OFF is not asserted.

## Reused services and upgrade proposal

Source admission invokes the exact reviewed `previewProspectiveMonthlyReputation`
with its private normalized evidence shapes. Unsettled/default configuration or
correction timing returns null. A wrong subject, self reviewer, extra points,
wrong rubric/authority or countercausal revision is refused. Only the canonical
week/month/component summary is stored; raw evidence, reviewer identifiers and
credentials are not copied into another proof store. Evidence binding through
the existing assembly digest is a later integration gate, not implemented here.

Assessment revalidates that immutable summary with the existing v1 week/month
calculator (quarterly zero), reviewed v2 component allowances and level validator.
The existing source CAS, period lock, outbox, assessment uniqueness and retry
transaction are reused. V1 canonical input/digest and result payload retain their
original shape. New assessments explicitly identify their policy; the adapter
falls back to the original insert on a genuinely old schema, and old writers on
the upgraded schema get the default v1 policy.

The original v1 SQL prefix is intact. The appended, separately marked
`WP08_SOURCE_ASSESSMENT_V2_PREPARATION_UPGRADE` is a genuine transactional upgrade
proposal exercised only on disposable PG17. It adds a source policy/hash pair
check, NULL-rejecting v2 component checks, assessment policy with legacy default,
source `(id,policy_version)` identity and composite assessment/source-policy FK.
Named versioned cap/FK constraints are validated before old constant-only checks
are dropped. Existing period/revision uniqueness, same-policy supersedes FK,
successor uniqueness, immutability, score sum and level checks remain.
No source/calculation JSON, digest or historical policy is rewritten. No new
grant or role change is included. It is not a registered/approved production
migration. Legacy unknown catalogue data fails validation and rolls the upgrade
back for review rather than being relabeled.

## Bounded reproduced path

The actual former deferred-event query selects 25 v2 preparation neighbors before
a valid v1 event. The invoked runtime path refuses v2, so that bounded batch
cannot reach the later v1 event. The new query keeps LIMIT 25 and selects legacy
missing-policy/v1 payloads only. The regression executes the former query against
26 canonical deferred v2 fixture events, then invokes the real reconciler: one
v1 assessment completes, its repeat completes zero, and all 26 v2 requests remain
deferred/unassessed. No queue/schema/flag change is needed outside local fixtures.

## Requirements, code and tests

I01–I12 come from PR956. Only their applicable source/assessment portions are
implemented; unreserved integrations remain explicitly pending.

| Requirement | Code/test evidence | Boundary |
| --- | --- | --- |
| I01: old rows/readers/writers | Before-hook creates/assesses v1 on the old SQL prefix; invalid legacy hash rolls upgrade back; I01 compares exact stored source/calculation and old default writer | Historical report implementation unchanged |
| I02: version caps and component sums | Versioned SQL checks + existing preview; 0/150/1,000/1,150 actual prepared assessments, maximum 13,650 and unchanged L5 | Zero applied; no entitlement |
| I03: invalid mixed versions and NULL/client components | Direct SQL mismatched/defaulted policy FK, hash/unknown policy/null/missing/string/boolean/oversized components; invoked actor/event-policy/digest refusal | Trusted server adapter only; no request/API point input |
| I04: duplicate/retry/order/concurrency/rollback | Concurrent source retries and six Jobs assessment calls commit one result; source CAS contenders, reordered/duplicate revisions and outbox failure rollback | Existing transaction/outbox retained |
| I05: fixed quarter, no backdate/carry | Actual preparation admits expiry/reversal states from the reviewed common helper; inherited PG renewal/assembly bridge and 56 pure policy tests pass | No security proof/auth freshness change; production timing unset |
| I06: independent evidence and reversal | Extra client points/wrong subject/reviewer/authority refuse; countercausal reversal refuses; closing-month unresolved correction returns null; duplicate/reordered February reversal agrees | Qualified producer/rubric/replacement/correction timing remain pending |
| I07: same-policy correction/reselection | Source supersedes FK rejects mixed policy; real v1 correction after v2; tied fifth-week correction reselects whole week with CAS | V2 snapshot/dependent-award integration unreserved; legacy snapshot/reward suites run |
| I08: disabled/missing schema/context/policy | Actual legacy schema, temporarily unavailable policy column, missing fixture context and disabled/v2 flags admit nothing | No operational activation setting |
| I09: private report/API/CSV | Existing legacy suites run unchanged; no new report/export contract is emitted | Canonical API/analytics-owned v2 wiring unimplemented |
| I10: privacy and membership | Runtime role cannot read either policy's source/assessment; admission omits private proof/reviewer fields; inherited all-plan earning tests pass | Public restrained level unchanged; no paid earning gate |
| I11: erasure/races | Missing/deleted/wrong account refusal; actual account-delete race leaves no source; privacy source deletion cascades both versions' assessments | Passport/privacy reconciler integration unreserved |
| I12: quiescence/history | Removing the fixture context prevents preparation; ordinary runtime retains v1 operation; prepared history and existing level profile remain unchanged | No destructive downgrade or active policy change |

## Validation

Use Node 22 and the explicit disposable loopback database. Initial baseline:

```sh
node scripts/ci/validate-planetscale-postgres17.mjs
node --experimental-strip-types --experimental-test-module-mocks \
  --experimental-test-coverage \
  '--test-coverage-include=packages/db/src/monthly-reputation.ts' \
  '--test-coverage-include=apps/lythaus-jobs/src/monthly-reputation.ts' \
  --test-coverage-lines=80 --test-coverage-branches=80 \
  --test apps/lythaus-jobs/tests/monthly-reputation.postgres.mjs
npm run typecheck:native
git diff --check
```

`PLANETSCALE_PG17_TEST_DATABASE_URL` points only at local
`lythaus_monthly_test`; never a provider branch. Original v1 schema plus upgrade
suffix are executed in fixture transactions. Baseline validates 103 relations,
102 launch tables and three existing extensions on PG17.11.
Focused suite: **19 passed, zero failed/skipped**. Jobs adapter coverage is
100% lines/branches/functions; database adapter exceeds 98% lines and 93%
branches, with 100% functions. Policy coverage suite: **56 passed, zero
failed/skipped**. Native typecheck and whitespace pass.

Broader existing PG17 coverage suites: earning 12, contextual 20, appeals 26,
renewal/assembly 20, snapshots 19 passed with zero failures/skips. Rewards/report
initial result is 63 passed / 1 failed / zero skipped: its deliberate catalogue
corruption fixture is now stopped by the new CHECK before the report assertion.
The report-owned fixture is outside the four-path reservation; authorization
for the following minimal accommodation is pending. No production code change
or weakened constraint is proposed to hide the failure.

Proposed fixture-only accommodation in
`apps/lythaus-jobs/tests/monthly-reputation-report.cases.mjs`: capture
`pg_get_constraintdef` for `monthly_reputation_source_policy_catalogue_v2`, drop
it alongside the fixture's already-disabled immutable trigger, and restore/
validate the exact constraint after restoring the correct catalogue hash in its
finally block. This deliberately manufactured corruption stays inside the
existing explicit disposable-database guard. The file is not edited here yet.

Required full exact-head CI and parent independent review precede serialized
merge. These local results do not substitute for them; current CI status belongs
in the draft PR. Reviewed #953/#956 commits are unchanged.

## Remaining gates

Parent serialization is still required for assembly inheritance/evidence digest,
snapshot/correction publication, dependent awards, historical period gate/read
compatibility, canonical API/analytics/report denominators and generated clients.
Qualified support producer and reviewer/rubric authority remain pending. D01–D13
operational settings, production timezone, cutover/first v2 source month,
retention, suggestion selection/replacement/correction timing, privacy/collection
and feature activation are not selected by this preparation slice.
No provider integration, production DDL, role/grant edit, flags/queues, mailing,
personhood grant, real-member award, merge or deployment is performed. Frozen
main/Release104 owner UI hold remains intact.
