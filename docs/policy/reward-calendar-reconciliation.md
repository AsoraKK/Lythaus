# Reputation and calendar rewards — reconciliation and proposal

Status: **design for review; monthly reward policy is not activated**. Prepared 2 October 2026 from verified main `115da92f0918ac4a19fdeb45889c00ff4db65687`, the final September specification/catalogue, accessible Codex memory summaries, and Kyle's latest instructions relayed by the coordinating parent. Source: [final September ChatGPT discussion](https://chatgpt.com/g/g-p-68e4a6f7bd6c8191a837bc6a87c95a4a-lythaus-app/c/6ab66d02-f4e4-83ea-bbd2-d5b2a1bd2154?src=history_search).

## Decisions and conflicts

| Topic | Final September baseline | Latest settled decision | Implementation or review consequence |
| --- | --- | --- | --- |
| Cumulative reputation | Settled points accumulate; no decay, reset, spending, transfer, or hidden overflow. Ceiling 12,500. | Retained. L2 stays **1,000**, not 100. | Calendar changes must not reset cumulative reputation. |
| Reputation levels | L1–L5: 0 / 1,000 / 3,000 / 6,000 / 10,000; ages immediate / 7 days / 1 / 3 / 6 calendar months. Points and age only. | No approved change. | Do not convert these lifetime thresholds into monthly targets or restore old pillar/promotion gates. |
| Monthly reward qualification | Historically current earned reputation determined reward eligibility. | Previous **calendar** month's activity determines current month's reward level; current activity qualifies next month. | Separate reward qualification from lifetime level. Monthly thresholds are undecided. |
| Quarterly task validity | Historical three-month account periods. | All four fixed quarters each year: Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec. Completion stays valid until that quarter ends. | No anniversary periods, retroactive validity, or extra monthly award merely because a check stays valid. |
| Quarterly point bundle | Only email-control maintenance was quarterly: 100 points. | Kyle wants meaningful task units around 100 and a quarterly bundle totaling 1,000 toward L2. | The bundle's actual tasks, weights, and whether 1,000 is an aggregate target or additional award require design review. Email verification at 250 was exploratory. |
| Weekly settlement | Account-week close plus 72 hours, after authoritative checks; late acceptance belongs to its original source period. | No approved change to this rule. | A month boundary must not silently change settlement or move delayed work into a later activity month. |
| Timezone / first partial month | Historical defaults used UTC and an immutable account anchor. | Global platform timezone and first partial month remain undecided. | Helpers require explicit server-selected timezone. No activation default is supplied. |
| Commercial access | Tier, selected benefit, merchant approval, consent, standing, and security are separate. | Discounts remain conceptual examples. | No invented Coursera/ChatGPT offer, merchant integration, or actual discount. |

Merged main still contains `reputation-v2.0.0`, whose multi-pillar levels and 5/10-point events predate the final September points-and-age policy. The preserved `codex/reputation-rewards` worktree has a much larger, uncommitted implementation of `lythaus-rewards-beta-v1`; it is evidence, not a safe integration base. Its `0017_reputation_rewards.sql` conflicts with main's `0017_authenticity_beta.sql`. A reviewed successor must reconcile the canonical policy, migration sequence, ledger, source events, contracts, and consumers together. This branch does not switch earning engines.

## Recommended design for review

Keep three visible concepts: lifetime reputation, last month's reward qualification, and this month's progress toward next month. Display the activity months explicitly. A technical failure or missing policy returns unknown/pending, not zero eligibility. Lifetime points stay private, non-spendable, and bounded by the existing 12,500 ceiling.

Preserve points-and-age reputation gates. There is no additional promotion panel, pillar threshold, World check, subscription gate, or reward purchase. All subscription plans can reach L5. If monthly reward access should also be capped by the earned lifetime level, make that a separately reviewed reward-access rule; Kyle's timing decision alone does not establish it.

Historical offer access remains separate: Free selects one reward family, capped at effective offer level 3; Premium selects one reward per earned level up to 5, not five L5 offers; Black accesses eligible families subject to merchant restrictions. A selected recurring benefit persists across invoices, without an automatic monthly selection reset. The monthly qualification revision must deliberately reconcile this access contract; it does not create an actual merchant offer.

The historical six-month freeze starts at explicit earning-policy activation and freezes rules, not points. Revised weights would need a successor policy version, explicit activation, and treatment of prior awards. Do not reprice already credited events or infer that the uncommitted prototype was activated.

Use larger units for substantive, independently accepted work, rather than making routine security checks disproportionately valuable. Recommended candidate weights below are **proposals, not new constants or activated awards**. Retain the weekly shared direct cap of 200 and the one highest diversity bonus of 50/100/200, keeping a 400 weekly maximum.

| Action | Historical points | Proposed points | Reason and retained protection |
| --- | ---: | ---: | --- |
| Accepted human-authored post | 15 | 50 | Useful participation; retain 2/day and 6/week limits and content-quality acceptance. |
| Accepted top-level comment / reply | 10 | 25 each | Discussion requires less work than a substantive task; keep the combined 5/day, 10/week cap. |
| Assigned, trained, quality-accepted appeal review | 25 | 100 | Accountable specialist work; at most 2/week, conflict-free assignment and human acceptance. |
| Accepted source / correction | 25 | 100 each | Meaningful evidence work; shared maximum 2/week and one category per root contribution. |
| Accepted help / accessibility contribution | 25 | 100 each | Meaningful accepted work; shared maximum 2/week. Do not invent chores to reach a target. |
| Validated reactions | 0 direct | 0 direct | One diversity family only; no per-click points and no required positive vote. |
| Passkey / authenticator monthly maintenance | 50 shared | 50 shared | Alternative proofs of the same action, not two bonuses. Use an already sufficient routine proof. |
| Quarterly email-control check | 100 | 100 pending bundle review | Keep the settled weight while designing the actual bundle. Do not silently adopt the exploratory 250. |

Keep the six diversity families and their qualification: 2 posts; 3 comments/replies across 2 other authors; 1 accepted assigned review; 1 source/correction; 1 help/accessibility; reactions on 5 items across 3 other authors and 2 UTC days. At least 2 substantive families are required. Distinct rows are not distinct families. Extra accepted work cannot reopen capped awards or create a future reserve.

For monthly reward targets, the proposed weights and weekly maximum create a feasible range of a few hundred to roughly 1,600–2,000 activity points per calendar month before maintenance. Recommend calibrating targets against that genuine activity budget after resolving the quarterly-validity interaction, baseline/no-activity treatment, and any lifetime-level cap. Kyle has not settled the numerical monthly targets, so this proposal leaves them open rather than repurposing lifetime thresholds. Reputation L2 remains 1,000.

### Quarterly bundle: recommended interpretation

Recommend a **1,000-point quarterly earning plan**, assembled from actual approved actions and their normal awards, rather than a separate 1,000-point maintenance windfall. The current catalogue has one quarterly security action, not ten meaningful quarterly chores. Repeating onboarding, installing an app, removing/re-adding a credential, or re-verifying identical evidence must not be used to manufacture a bundle.

For example, within one quarter, 100 quarterly email-control points plus nine distinct accepted 100-point substantive tasks yields 1,000. Those tasks remain under weekly/shared caps and existing acceptance rules. They are examples of workload, not mandatory invented tasks or a promise that every member qualifies as an appeal reviewer. Their credited points count once in lifetime reputation and in the relevant activity month; reaching the quarterly plan creates no extra 1,000-point ledger event. Weekly diversity and monthly maintenance remain additional only when genuinely earned and not already included in the plan total.

If Kyle instead wants **a distinct recurring quarterly bundle awarding 1,000**, that is a separate new policy. It needs a defined set of meaningful accepted tasks and genuinely independent award opportunities. Do not split a single existing task across weekly and quarterly categories or give a 1,000-point bonus for a 100-point verification. The progression comparison below shows the effect of this alternative without implementing it.

Recommend quarterly validity as evidence that a task is current, separate from the point award. It should not create a monthly L2 floor automatically. Whether valid quarterly tasks contribute an ongoing monthly qualification floor is still a genuine policy interaction; it must be explicitly selected rather than inferred from “valid through March.”

### Calendar and settlement proposals

- Propose one global UTC boundary, shown in local time with the timezone stated. Device timezone changes never change qualification, caps, or expiry. UTC is a proposal, not the helper's default.
- Propose counting genuine activity after verified-account/new-policy activation in the first partial month, with ordinary caps and no invented historical credit or automatic threshold proration. First reward qualification is the following calendar month. Guest access does not manufacture an earned account.
- Propose validity from successful authoritative completion through the end of its fixed quarter. A January completion is valid in February/March; a March 31 completion is not retroactive to January and expires at the April boundary. A fresh April completion is required.
- Propose once-only quarterly point credit when the eligible task/bundle is completed and accepted, attributed to that source month. This differs from historical settlement at the end of a complete account-quarter and needs approval. Validity alone remains zero new points in subsequent months.
- Preserve account-week close +72h. Attribute accepted direct actions to their original source month. Weekly diversity needs an explicit single-month attribution rule for a week crossing a month boundary; propose the month in which the qualifying account-week closes. Do not split or duplicate the bonus.
- Month-end finalization cannot simply be “close +72h”: a source month can contain actions in an account-week that closes up to almost seven days later, then settles +72h. Define a bounded pending/grace and late-correction policy before commercial use. The largest delay can approach ten days. Do not promise fixed eligibility at midnight while counting unsettled activity as final.
- A later reversal should adjust the original source month and retain its explanation. Review whether already-consumed benefits require recovery, whether current eligibility changes mid-month, and the merchant grace policy. This branch does not auto-upgrade or revoke benefits.

Late-quarter interaction: a March 31 task may supply an award attributable to March and thus evidence for April qualification, while its validity expires as April begins. Decide whether that historical award can support April's reward level while a new-quarter proof is separately required for sensitive benefit use. Do not erase earned lifetime points merely because a proof expires, and do not assume the March proof is current in April.

## Progression pace

These are illustrative upper-bound earning scenarios, not guaranteed eligibility. “Weekly total” includes any earned diversity bonus. Assume all 1,000 non-World setup points are legitimately earned, monthly maintenance is 50, and two/four quarter completions fall within the six-/twelve-month windows. Actual completion and calendar alignment change the dates. L5 also needs six calendar months of age.

| Weekly total | Six months with existing 100/quarter | Twelve months with existing 100/quarter | Six months if a distinct 1,000/quarter award is approved | Twelve months with distinct 1,000/quarter |
| ---: | ---: | ---: | ---: | ---: |
| 100 | 4,100 (L3) | 7,200 (L4) | 5,900 (L3) | 10,800 (L5) |
| 200 | 6,700 (L4) | 12,400 (L5) | 8,500 (L4) | 12,500 ceiling (L5) |
| 400 maximum | 11,900 (L5) | 12,500 ceiling (L5) | 12,500 ceiling (L5) | 12,500 ceiling (L5) |

Six-month formula: 26 × weekly total + 1,000 setup + 6 × 50 monthly + 2 × quarterly award. Twelve months uses 52 weeks, 12 monthly awards, and 4 quarterly awards. A separate 1,000 quarterly award contributes 4,000/year instead of the old 400/year; adding that to weekly earnings is correct only if it is genuinely a distinct approved award. Under the recommended aggregate earning-plan interpretation, its 4,000/year target is already contained in credited activity and cannot be added a second time.

With normal setup and activity, L2 can be reached as soon as the 1,000-point and seven-day gates are both satisfied. L3 still requires 3,000 and one month; L4 requires 6,000 and three months; L5 requires 10,000 and six months. Subscription spend does not accelerate any of these gates.

## Example ledger and validity

This example uses existing weights, proposed UTC display, and synthetic dates. It demonstrates accounting and timing, not actual monthly thresholds or available benefits.

| Source / event | Point effect once accepted | Calendar activity attribution | Validity or next-month implication |
| --- | ---: | --- | --- |
| Jan 15 quarterly email-control proof | +100 once in Q1, under the proposed completion-time award rule | January | Proof valid from Jan 15 through Mar 31. Earliest following reward month is February; no January reward upgrade. |
| February/March still-valid Q1 proof | 0 additional | No fresh activity award | Continued validity does not create +100 every month. |
| Sep 30 accepted human post, recorded/settled Oct 2 | +15 under historical policy | September | May support October qualification after settlement; not November just because processing was delayed. |
| Oct 2 fresh monthly passkey proof | +50 shared monthly entitlement | October | Supports November activity qualification; authenticator alternative cannot add another +50. |
| Oct 5 appeal reverses Sep 30 award | Undo its actual credited effect | Correct September | No inverse grant/deduction masquerading as new October activity. Benefit adjustment remains a review decision. |
| Oct 15 quarterly email-control proof | +100 once in Q4 under proposed completion-time rule | October | Proof valid through Dec 31; a fresh Q1 proof is needed after Jan 1. |

Ceiling invariant: 12,490 plus a nominal 15 awards only 10; a later 100-point deduction leaves 12,400. The refused 5 never becomes a reserve. Reversing a deduction that applied zero must not create a nominal refund. A proof expiry changes proof validity, not lifetime point balance.

## Implementation and test mapping

| Settled behavior | Focused implementation | Validation |
| --- | --- | --- |
| Previous calendar month → current rewards; current activity → following month | `packages/contracts/src/reward-calendar.ts` produces separate month identities using an explicit timezone. | Exact month boundaries, year rollover, leap day, offset-equivalent timestamps, DST, missing/invalid timezone. |
| Four fixed quarters; no retroactive validity | Same module produces quarter identity/expiry month and validity from completion timestamp. It awards no points. | All 12 months across four years including leap year, each quarter expiry, Q4 year rollover, late completion, non-UTC expiry. |
| Reuse the existing ledger without resetting reputation | `packages/db/src/reward-monthly-activity.ts` performs one owner-scoped, parameterized SELECT with explicit timezone. | Read-only SQL/parameter checks, database error propagation, ownership, replay, and no lifetime-profile mutation. |
| Record processing is not a new source event | `packages/contracts/src/reward-monthly-activity.ts` projects existing original source time and already-authoritative impact. | Idempotent replay, contradictory duplicate rejection, delayed recording, future evidence exclusion, reversals, diminished/withheld/expired activity. |
| No invented monthly level or paid reputation | Projection returns `monthly_policy_pending`, null current/next reward levels, and observed positive/negative impact separately. | Unknown purchase signals and positive reaction farming fail closed; missing policy never becomes a fallback level. |

Important limit: the read-only projection supports main's **existing** `reputation-v2.0.0` ledger. Its impact totals are evidence, not final September action points or calibrated monthly qualification totals. It does not port the uncommitted replacement engine, install commercial policy, select a timezone, choose monthly targets, consume passkey proofs, issue levels, or serve a new route/UI. Unsupported policy versions fail closed. The adapter tests use synthetic query fixtures; they are not deployed acceptance or PostgreSQL execution evidence.

## Integration and passkey coordination

Passkey lane should preserve `setup_device_credential` (200), `setup_strong_authentication` (400), and `monthly_passkey_check` / `monthly_authenticator_check` (one shared 50). Server verification must independently establish each distinct setup requirement. A setup proof cannot claim maintenance again. Removal/re-addition or new installation cannot regenerate setup entitlements. Zero-point security reverification does not imply an extra award.

The inspected preserved implementation exports `recordRewardSource(client, RewardSourceInput, now)` from `packages/db/src/rewards-ledger.ts`; its outbox consumer recognizes `identity.verification.completed`. Source input contains stable subject/source/root IDs, action ID, original timestamp, state, evidence/decision references, version, setup-proof consumption, and independently verified strong-authentication/email-control indicators. That seam is not present on main. Coordinate its reviewed integration with the parent; do not race shared auth or posts files or blindly call historical account-anchored period creation.

One persisted, versioned, auditable ledger must enforce source uniqueness, root-contribution primary category, shared maintenance/bonus entitlements, per-user database serialization, replay-safe outbox consumption, proof consumption, and causal reversals. Unknown/failed proofs are not negative points. Purchases, referrals, views, time online, received reactions, follows, raw shares, and ad clicks do not earn points or diversity. Downvotes alone cannot deduct points, remove content, or shadowban.

This lane changes no central auth/profile/public-user fields, post events, database schema, credentials, provider resources, paid AI settings, or production data. Parent owns serialized merges/releases. Monthly targets, global timezone, first partial month, quarterly bundle semantics, cross-month bonus/finalization, and late reversal/benefit effects require explicit policy review before activation. The existing real owner email/signup acceptance remains pending Kyle.
