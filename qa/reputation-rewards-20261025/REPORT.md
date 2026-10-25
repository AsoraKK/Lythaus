# Result and evidence limits

**The exercised rules passed: 47/47 tests, no failures or skips. There is no
demonstrated correctness defect to assign a defect severity.** The strongest
evidence is for calendar/selection calculations and the pending 24-hour interval
calculator. Persistence and display claims are narrower because they use local
mocks and a server projection function.

M means main `c0963c36693476ecc49ab1fcba0572454926b4d3`; S means unmerged #1084
`ef288ef2819382afd571256d3f9e31e8bb8383bb`. Every source location below is pinned
to one of these commits. See [SOURCE_MAP.md](SOURCE_MAP.md) for full paths and
the distinction between implementation, tests and activation.

| Demonstrated behavior | Expected and actual result | Evidence / confidence |
| --- | --- | --- |
| Ordinary repeated delivery and reversals | One accepted event stays at 10 points after repeat delivery; reversal makes the total 0; replaying either event does not restore or subtract again. A reversal arriving first requires retry after the original arrives. All matched. | E01–E06; M `packages/db/src/reputation.ts:340`; high for control flow with the existing query fake, no claim about actual constraints or queue retry. |
| Weekly recomputation and mock failure recovery | Identical evidence produces one revision/outbox row. Accepted work later reversed changes 250 to 0 in a corrected revision. A downstream failure rolls back the fake transaction; a lost commit response remains unknown and ordinary replay sees one committed event. All matched. | W01–W03, T01–T03; M `packages/db/src/monthly-earning.ts:84`, `packages/db/src/index.ts:80`; high for exercised control flow, limited to mocks. |
| Calendar and best four weeks | Five weeks select 7,000 points; a corrected week changes selection to 8,500 without counting its old revision. Ties, unique month ownership, leap/month lengths and exact cutoff behave consistently. | C01–C08; M `packages/contracts/src/monthly-reputation-policy.ts:101`; high for the named UTC candidate, not approval of its calendar convention. |
| Pending versus confirmed projection | Pending, shadow and preparation values do not populate confirmed level/score fields. A confirmed level can coexist with pending reward selection. | D01–D05; M `apps/lythaus-public-api/src/monthly-reputation-projection.ts:6`; high for this function, not rendered/cache behavior. |
| Monthly interval arithmetic and equal benefit | 86,400,000 ms is allowed; 86,400,001 ms is not. Separate gaps accumulate; overlaps count once; a normal method change with continuous evidence consumes no grace. Calendar clipping and 28/29/30/31-day months match. Synthetic qualifying options receive one equal benefit under each tested existing action mapping. | I01–I14, I17–I19, I21–I22; S `packages/contracts/src/monthly-security-grace.ts:33`, `monthly-security-choice.ts:97`; high for the isolated candidate. No real method or benefit amount was approved by these fixtures. |

The following are **evidence or policy gaps, not confirmed defects**. Priorities
describe work needed before asserting complete business-rule acceptance.

| ID / priority | Expected acceptance evidence versus actual evidence | Affected users / status / next action |
| --- | --- | --- |
| G1 / P1: candidate is separate from main | A final implementation should apply the approved common benefit and grace rules through the assembled monthly source. S contains the interval/common-benefit functions and candidate assembly wiring. M still calls the historical maintenance calculation; this pack does not execute an integrated S+M assembly. | Prospective benefit recipients; integration status unverified, no demonstrated live impact. High confidence in source separation. Complete T2 after policy inputs T1. |
| G2 / P1: extra monthly observation requirement | The supplied policy establishes coverage, grace and equal treatment. With uninterrupted coverage but no within-month authentication observation, S returns `qualifying_authentication_missing` (I20). An observation exactly at next-month cutoff also does not satisfy it. Whether the additional monthly-use condition is intended is unresolved. | Covered members who do not perform the qualifying action during that month. Candidate behavior demonstrated; desired entitlement unresolved. Resolve P3 before changing code. |
| G3 / P1: recovery evidence stops at mocks | E04 only reaches the correct result after an explicit retry. T01–T03 prove wrapper behavior with a fake driver, and W01 proves a fake outbox row count. They do not show a worker scheduling the retry, committing real rows atomically, or correcting an already confirmed monthly snapshot. | Members whose deliveries are interrupted or contributions change after settlement. Production effect unverified. Add the bounded consumer/assembly replay specifications in T3; do not infer durable delivery from this pack. |
| G4 / P2: projection is not client acceptance | D01–D05 prove fresh server projection results. The Flutter card has pending/shadow/unavailable text in source, but rendering, refresh behavior and stale-cache replacement were not executed; Flutter is absent from PATH. | Members seeing a changing or unavailable monthly result. No displayed defect demonstrated. Execute the synthetic model/widget/provider cases in T4 using an existing Flutter environment. |
| G5 / P1: prospective operational inputs remain pending | Calculations use the current proposed UTC closing-Sunday convention and 72-hour settlement, plus an explicitly synthetic mapping. These tests cannot approve calendar ownership, qualifying methods, common action/budget, initial enrollment or correction finality. | All prospective monthly participants. Candidate arithmetic passed; product/version acceptance remains incomplete. Resolve only the specific questions in POLICY.md, retaining historical versions. |

For G1, compare M `packages/db/src/monthly-assembly.ts:116` with S
`packages/db/src/monthly-assembly.ts:118` and S
`packages/contracts/src/monthly-security-choice.ts:97`. M's historical
`packages/contracts/src/monthly-maintenance-policy.ts:127` has separate action
budgets. That historical version is not reclassified as a defect merely because
the later prospective owner decision requires a common benefit. For G2, the
decision is made at S `packages/contracts/src/monthly-security-grace.ts:80`
and `:93`. For G4, inspected-only rendering starts at M
`lib/ui/screens/rewards/monthly_reputation_widgets.dart:23`.

The [matrix](MATRIX.md) identifies every executed case, descriptive candidate
behavior and untested extension. [Results](results/summary.json) record the
actual command, environment and counts. Prior repository documents describing
PostgreSQL/Flutter tests are provenance only; their counts are not included in
this task. The supplied last-known live release
`3880a8be4c89459dd7ef831c9385817a887511ef` was not verified against production.
No current deployment or feature activation is inferred from main or a PR.

The scoped conclusion is **pass for the listed local calculation and mock
cases; incomplete for the integrated reputation/rewards business rules**.
Acceptance of the integrated rules needs these measurable additions:

1. A reviewed immutable combined source with the common-benefit calculation
   wired into assembly; retain all 47 assertions with equivalent versioned
   fixtures and preserve historical calculation results.
2. Versioned decisions for P1–P5 in POLICY.md. Each approved qualifying method
   must pass the same boundary/equality cases; unknown evidence must stay
   explicitly unresolved instead of acquiring an invented entitlement.
3. Ordinary consumer replay tests reaching receipts, weekly correction,
   monthly source and snapshot: one result after duplicate delivery, a retained
   retry for dependency ordering, and no confirmed result after failed local
   transaction commit. The ordinary settlement/finality policy must be explicit.
4. Client tests replacing a confirmed response with pending/unavailable data,
   rendering shadow separately and keeping the retry action accessible.

Database durability and deployment evidence remain outside this conclusion.
This is neither a security certification nor a production launch certification.
There is no remaining execution blocker for the requested local pack. Missing
Flutter and unverified integration/runtime evidence are recorded limitations;
no tool denial or uncertain external action arose in the replacement phase.
