# WP08 version-aware reputation integration proposal

Status: engineering proposal for parent serialization and independent review.
No migration, shared API, dispatcher, flag, queue or production resource is
changed by this document. No scoring policy is activated.

Verified proposal base: `f47c11b099171d9c8173182b711b66b7e18c762f`,
including coordinator-merged PR949. Branch:
`codex/wp08-versioned-integration-proposal`. Implementation dependency:
[draft PR953](https://github.com/AsoraKK/Lythaus/pull/953), fixed head
`861bc645152234e57d81dc204fc4bbb830e7e0cd`; it is not merged into this branch.

## Confirmed policy and remaining decisions

The owner confirmed all-quarterly calendar timing at 20:00:03 UTC on 7 October
2026 and accepted the additive allocation at 20:12:31 UTC. These authorities
approve prospective email 1,000 plus optional accepted suggestion 150, quarterly
maximum 1,150 and source-month maximum 13,650. They do not authorize activation.
Weekly maximum 2,500, top four complete weeks, monthly maximum 2,500 and all
lower level thresholds are unchanged. L5 begins at 10,000 and extends through
13,650 prospectively. Every membership plan may earn L5; paid membership changes
reward selection only. No carry, spending or account-age gate is introduced.

| Identity | Immutable meaning |
| --- | --- |
| `lythaus-monthly-rewards-2026-10-v1` | Original 22 actions; quarterly 0/1,000; source maximum 13,500; existing rolling-email functions and historical proofs/reports |
| V1 catalogue SHA-256 | `bc8be9d8f4cae4b0f3ec327e09f308069dd3e6b07e8ff57ccc6a6cc62435f5a2` |
| `lythaus-monthly-rewards-2026-10-v2` | Prospective inherited 22 actions plus one optional suggestion action; quarterly 0/150/1,000/1,150; source maximum 13,650 |
| V2 catalogue delta SHA-256 | `26213abccce99ee51be6c0623406c28aaa7d39ed3ea3b4ac630b7cffd859db67` |
| Timing/allocation amendments | `all-quarterly-scoring-calendar-quarter-2026-10-07-v3`; `quarterly-suggestion-additive-allocation-2026-10-07-v4` |

For every quarterly component, completion in quarter month one/two/three
qualifies three/two/one remaining source months, once per component per source
month. Quarter end is exclusive; a new quarter needs a new completion. Source
month A fixes effective month B. Expiry does not withdraw that earned B
snapshot. Authentication freshness remains separate from rewards completion.

D01–D13 operational defaults remain pending wherever not explicitly superseded
by these confirmations. Production timezone, collection cutover, first v2 source
month, rubric, reviewer authority, suggestion selection/replacement/correction
timing, retention and activation are unset. UTC and dates in PR953 tests are
fixtures, not operational choices. Qualified support acceptance is support-owned;
`support.workflow.changed` is not an earning acceptance contract.

## Observed integration gap

These are source observations at the verified base, not allegations of a v1
defect. PR953 directly invokes the old calculator and proves that its v1 validator
rejects quarterly 1,150 and scores above 13,500; the new preview applies zero.

| Existing file | Version boundary that prevents a direct v2 hookup |
| --- | --- |
| `database/planetscale/proposals/monthly_reputation_shadow.sql` | Sources admit only v1. Assessments have no policy column, quarterly is 0/1,000, and score is at most 13,500. Source revision/supersedes keys already include policy. |
| `database/planetscale/proposals/monthly_reputation_maintenance.sql` | Assembly policy is fixed/defaulted to v1; subject/assessment guard functions name v1. Evidence observations and existing account/DSR guards must be retained. |
| `database/planetscale/proposals/monthly_reward_snapshots.sql` | Rule sets/snapshots admit only v1 and score at most 13,500. Snapshot revision uniqueness is member/effective month/mode, and the supersedes foreign key omits policy. Guard functions name v1. |
| `packages/db/src/monthly-reputation.ts` | V1 calculator, canonical input/digest and exact-policy flag gate; existing CAS and outbox receipt behavior are reusable. |
| `packages/db/src/monthly-assembly.ts` | V1 source/week/receipt selection, rolling maintenance projection and assembly output. Existing drained-ingestion, settlement, account and period locks are required. |
| `packages/db/src/monthly-reputation-report.ts` | V1 source/hash checks and 13,500 denominator. `quarterlyEmail.points` currently holds the entire quarterly amount; it cannot become 1,150 while its email allowance stays 1,000. |
| `packages/db/src/monthly-reward-snapshots.ts` | V1 flag/rules/hash/source predicates and event payloads; latest snapshot query does not select by policy. |
| `api/openapi/monthly-reputation.yaml` | Report level-authority and rewards source-score limits are 13,500. Score-bearing authority/correction schemas do not define their own policy identity. |
| `apps/lythaus-jobs/src/monthly-reputation-dsr.ts` | Passport iterates distinct source months and passes one configured rule-set version. A versioned reader must preserve historical periods; no privacy reconciler edit is proposed here. |

The public report reader currently asks for the snapshot for the requested
report's effective month. Preserve that pairing. Do not assume its authority is
the current wall-clock month's snapshot. The existing Rewards routes predate
this work; no global OFF state has been verified or asserted.

## Smallest next implementation slice

Recommend one disabled, synthetic-only source/assessment admission slice after
parent reserves the shared files. Reuse the existing tables, CAS transaction,
outbox and calculator. Do not add an earning ledger, alternate report exporter
or parallel policy engine. This recommendation is not a new owner policy.

1. Admit the two exact source policy/hash pairs, retain current source revision
   uniqueness and same-policy supersedes foreign key, and pin input policy/month.
   Unknown policies/hashes fail closed. Existing v1 input/digest bytes are untouched.
2. Add an assessment `policy_version` column with legacy default v1. Existing
   writers remain v1; v2 writes must explicitly specify v2. Add a source
   `(id, policy_version)` unique key and assessment `(source_id, policy_version)`
   foreign key. Retain assessment source uniqueness, shadow-only mode, immutable
   update rejection, component sum and level-threshold checks.
3. Replace constant assessment cap checks with named, row-local version checks.
   Preserve the original v1 bounds. V2 requires explicit email/suggestion
   components in the canonical calculation and the exact component sum.
4. Give the existing source admission/assessment adapter a private discriminated
   input. Server-loaded canonical evidence, verified configuration and a settled
   calculation are mandatory; no client points or raw `proposal_preview` output
   may be persisted. PR953 remains zero-applied and unmodified. A future staged
   adapter must validate its settled proposal before constructing an assessment.
5. Keep v2 admission disabled when schema capability, approved configuration,
   private-evidence authority or first source month is missing. Test with
   disposable PG17 fixtures only. No live flag value or policy pointer changes.

Proposed assessment predicate fragment, not an executable migration:

```sql
CHECK (COALESCE(
  (policy_version = 'lythaus-monthly-rewards-2026-10-v1'
    AND quarterly_points IN (0, 1000)
    AND source_score BETWEEN 0 AND 13500)
  OR
  (policy_version = 'lythaus-monthly-rewards-2026-10-v2'
    AND quarterly_points IN (0, 150, 1000, 1150)
    AND source_score BETWEEN 0 AND 13650
    AND calculation -> 'emailPoints' IN ('0'::jsonb, '1000'::jsonb)
    AND calculation -> 'suggestionPoints' IN ('0'::jsonb, '150'::jsonb)
    AND quarterly_points = (calculation ->> 'emailPoints')::integer
      + (calculation ->> 'suggestionPoints')::integer), false))
```

Also require calculation policy to equal the assessment policy; existing
column/JSON amount, level and sum checks still apply. `COALESCE(..., false)`
rejects missing component fields instead of admitting SQL null. Derive source
policy through a foreign key, not a cross-table `CHECK`: PostgreSQL recommends
foreign keys/unique constraints for such relationships. [PG17 constraints](https://www.postgresql.org/docs/17/ddl-constraints.html).

Do not guess names of existing generated constraints. A later migration must
inventory `pg_constraint` on the disposable baseline, introduce/validate stronger
versioned checks before removing the superseded constant checks, and show every
legacy row remains valid. No update of historic calculation/input JSON, policy,
digest or revision is permitted. Production migration sequencing is a separate
explicit gate; this document does not add a production migration file.

## Assembly, snapshots and dependent awards

The next slice must not silently treat existing component policy v1 as aggregate
policy v2. Propose an explicit server-owned inheritance manifest: aggregate v2
with pinned existing v1 weekly/monthly component rules and new quarterly rules.
Weekly contribution/week revision tables stay unchanged. Read their existing
settled revisions and reuse existing monthly maintenance calculation for the
unchanged monthly allowance; disregard its legacy rolling quarterly projection
only in the new aggregate adapter. Preserve the v1 assembly path byte-for-byte.
Add the aggregate version to assembly input, digest, output and stored policy;
use existing observation/revocation IDs and the support-owned qualified revision
references. Shared assembly checks need parent serialization before edits.

Keep the existing member/effective-month/mode revision uniqueness and period
lock. Recommend one authorized aggregate policy per source month, resolved from
the approved period manifest. If a conflicting policy chain already occupies a
target period, return a policy-review state; never relabel, delete, backdate or
supersede it with another policy. Add a policy-inclusive snapshot identity key
and stronger same-policy supersedes foreign key without removing existing
uniqueness. Correction approval must bind base snapshot, target source,
assessment and rule set to the same member/source month/policy. Review receipt,
outbox and dependent selection/partner/claim guards together. Keep existing lock
ordering and retry semantics; test concurrent correction versus assembly and
account deletion. [PG17 locking](https://www.postgresql.org/docs/17/explicit-locking.html).

Rule-set validation must identify the aggregate policy/hash and inherited
component rules independently. A single feature-flag row currently has one
policy version; replacing its pointer would strand hard-coded v1 readers.
Propose separating enabled feature scope from the server-validated historical
period/rule identity for reads, while writers still require their exact approved
policy and collection gates. Parent/privacy/API review must settle this before
changing any gate. Disabled/unavailable gates retain explicit pending responses.

## API/report proposal for canonical owner coordination

Retain the existing authenticated routes, principal-bound subject, private
`no-store` responses and formula-safe export. No request parameter can select a
higher-cap policy or manufacture an entitlement. The server resolves the policy
from stored period authority and immutable source/rules identity.

Propose a discriminated v1/v2 report contract in the canonical monthly fragment.
V1 scores remain bounded by 13,500. V2 scores are bounded by 13,650. Every
score-bearing snapshot/level-authority/correction object carries its own policy
identity and validated cap; do not infer it solely from an unrelated wrapper.
For the existing report route, authority still targets source month plus one.
The separate current Rewards view may use a different month/policy.

V2 adds `quarterlyTotal { points, maximumPoints: 1150 }`, distinct email
`{ points, maximumPoints: 1000 }` and optional suggestion
`{ points, maximumPoints: 150 }`, and total `maximumSourceMonth: 13650`.
Retain v1 JSON and CSV column meanings and denominators. Recommend a documented
v2 CSV variant with explicit version/component columns; never emit aggregate
1,150 under the legacy email-maximum column. Old CSV fixture bytes must match.
Canonical API owner decides the additive schema/discriminator/generated-client
compatibility and any required API semver before code changes. Analytics must
use per-policy denominators, not a new global constant. Preview results are
excluded from live metrics and level authority.

## Exact parent serialization register

Only this new document is authored in this proposal branch. No reservations for
the following implementation files are claimed; parent must assign them first.

| Slice | Exact existing paths to reserve | Owner coordination |
| --- | --- | --- |
| Source/assessment admission | `database/planetscale/proposals/monthly_reputation_shadow.sql`; `packages/db/src/monthly-reputation.ts`; `apps/lythaus-jobs/src/monthly-reputation.ts`; `apps/lythaus-jobs/tests/monthly-reputation.postgres.mjs` | Parent/schema serialization; reputation adapter |
| Assembly inheritance/guards | `database/planetscale/proposals/monthly_reputation_maintenance.sql`; `packages/db/src/monthly-assembly.ts`; `apps/lythaus-jobs/src/monthly-assembly.ts`; `apps/lythaus-jobs/tests/monthly-assembly.postgres.mjs` | Parent plus privacy/profile and qualified-support evidence owners |
| Snapshot/corrections | `database/planetscale/proposals/monthly_reward_snapshots.sql`; `packages/db/src/monthly-reward-snapshots.ts`; `apps/lythaus-jobs/src/monthly-reward-snapshots.ts`; `apps/lythaus-jobs/tests/monthly-reward-snapshots.postgres.mjs` | Parent; dependent awards/retries/corrections review |
| Private reports/exports | `packages/db/src/monthly-reputation-report.ts`; `apps/lythaus-public-api/src/monthly-reputation-routes.ts`; `apps/lythaus-public-api/src/monthly-reputation-report-export.ts`; `apps/lythaus-public-api/tests/monthly-reputation-routes.test.mjs`; `apps/lythaus-jobs/tests/monthly-reputation-report.cases.mjs` | Canonical API/analytics owner first |
| Canonical contract/client | `api/openapi/monthly-reputation.yaml`; `api/openapi/openapi.yaml`; `lib/generated/api_client/`; `lib/features/rewards/domain/reward_models.dart`; `lib/features/rewards/application/reward_providers.dart`; `lib/ui/screens/rewards/monthly_reputation_widgets.dart`; `lib/ui/screens/rewards/rewards_dashboard.dart` | Canonical API/generated-client/UI owners; parent assigns generated subtree |
| Dependent awards audit | `database/planetscale/proposals/monthly_reward_selections.sql`; `monthly_reward_partner_links.sql` and `monthly_reward_claims.sql` in that directory; `packages/db/src/monthly-reward-selections.ts`; `monthly-reward-partner-links.ts` and `monthly-reward-claims.ts` in that directory | Reuse existing synthetic partner/report/correction tests; no partner promises |
| Protected integration boundaries | `packages/contracts/src/index.ts`; `apps/lythaus-jobs/src/index.ts`; `apps/lythaus-public-api/src/index.ts`; `apps/lythaus-jobs/src/monthly-reputation-dsr.ts`; schema manifests, migration/role files and CI | Separate parent reservation; no privacy reconciler edit while profile lane owns it |

## Required regression matrix

All rows below are proposed future tests, not executed integration claims.

| ID | Actual service/fixture exercise | Required result |
| --- | --- | --- |
| I01 | Existing v1 source/assessment/snapshot rows and legacy writer after staged migration | Same policy/hash/input/digest/CSV bytes and limits; 150/1,150 and 13,501 still rejected for v1 |
| I02 | V2 source admission and assessment with each quarterly combination | 0/150/1,000/1,150 accepted only with matching component evidence/policy/hash; 13,650 valid, 13,651 invalid |
| I03 | Direct SQL wrong-policy foreign key, missing/null/client component fields, unknown/mixed hash | Rejected independently of adapter; missing/deleted/wrong-account subjects rejected; existing account-status semantics preserved |
| I04 | Invoked source/assembly service duplicate, retry, reordered evidence, concurrent CAS and rollback | One canonical source/assessment/event; conflicting retry rejected; digest stable; no double award |
| I05 | Existing canonical email consume service, concurrent/retry receipt, late renewal and quarter boundary | One proof; remaining months only; no old-credential renewal/backdate; earned following-month snapshot unchanged |
| I06 | Support-owned qualified acceptance revisions, duplicate/competing/self acceptance, causal reversal | No generic workflow points or stacking; unresolved replacement/correction stays pending; approved reversal appends correction |
| I07 | Fifth-week correction plus snapshot/dependent selection/claim replay, concurrent correction | Reselect whole fifth week; one same-policy successor; dependent awards reconcile once; cross-policy supersession rejected |
| I08 | Conflicting source-period manifest/first-source month, missing schema/rules, disabled/mismatched flags | Explicit pending/failure; zero writes/awards; no invented cutover or current-policy reinterpretation of history |
| I09 | Public/private JSON and CSV, v1 historical period and v2 current Rewards view | Exact per-object policy/cap; authority remains requested effective month; 1,000 email/1,150 aggregate separated; old CSV unchanged |
| I10 | Authenticated own account, guest/other member/admin denied paths; free/premium/black | Private no-store, no evidence IDs/ballots leaked; same earning/L5 ability; membership affects reward choices only |
| I11 | Passport/deletion fixtures across both versions and concurrency with capture/correction | All authorized history included; existing redaction/deletion invariants preserved; no privacy reconciler bypass |
| I12 | Quiesce v2 writers after synthetic activation and retry existing v1 readers/events | Keep all immutable v2 history readable; no destructive downgrade, flag mutation or legacy recalculation |

Use the existing disposable local PG17 baseline and existing invoked service
test suites. No provider branch, production DDL, provider integration, real
email/member award, credentials or paid resources are needed for preparation.
Add the future cases to the listed suites and existing private route tests;
retain workerd boundary checks and full required CI. Do not claim an integration
test passed when its database environment caused it to skip.

## Candidate evidence and gates

PR953 head `861bc645` has 56 policy tests and 20 local PostgreSQL 17.11
maintenance/assembly/renewal tests passing with zero failures/skips, plus native
typecheck and hygiene. Its current CI PG17 run passed 169 monthly tests with zero
failures/skips; native policy passed 56, OpenAPI contract passed 66 with 17 skips.
CI checked merge `2a1990400ced7cccde1d01d2b3022883a9eb81d0`, combining that
head with `cd782790d9518939065feaa723c257e0fd299e23`, before PR949 advanced
main to this proposal base. It is not validation of a final f47 merge. Final CI
status belongs in PR953; earlier-head runs are not reused as current evidence.
Exact local commands and the requirements/code/test matrix are in
[the fixed-head evidence note](https://github.com/AsoraKK/Lythaus/blob/861bc645152234e57d81dc204fc4bbb830e7e0cd/docs/testing/wp08-quarterly-suggestion-2026-10-07.md).

This proposal has no executable change; whitespace, path/ownership review and
repository documentation hygiene are its appropriate checks. Proposed I01–I12
remain unimplemented/unrun. Parent independent review, exact-file serialization,
canonical API/analytics coordination and final-base full CI precede any merge.
Production migration authorization, operational approvals, privacy/collection,
provider and owner UI/release acceptance remain separate gates. No self-merge,
deployment, live awards or active policy change is authorized here.
