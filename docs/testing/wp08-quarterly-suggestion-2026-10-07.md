# WP08 prospective quarterly scoring qualification

Base: `789e4a6e90f9b6af440f0fa68192fbfed420f0fd`. Branch:
`codex/wp08-calendar-quarter`. PR949 is a separate coordinator-owned draft;
this branch does not include or amend it.

This is a prospective all-quarterly sidecar and pure preview. It applies zero points,
publishes no level, changes no feature flag, and adds no earning engine,
database schema, route, queue consumer, or production configuration.

## Authority and exact scope

Kyle's item 2 clarification at `2026-10-07T18:15:47.000Z` says quarterly points
completed in the first month qualify for three months, completion in the second
month for two, and completion in the third month for one. The parent instruction
interprets this as fixed Jan/Apr/Jul/Oct quarters, no earlier-month credit, and
no carry after quarter end. A source month continues to fix the following
month's level; quarter expiry does not withdraw that fixed snapshot.

Kyle resolved the scope at `2026-10-07T20:00:03.000Z`: the fixed quarter rule
applies to all quarterly points, explicitly including email and suggestions.
V3 therefore replaces rolling email rewards validity prospectively. Existing
v1 D08 functions, security proof freshness, sensitive-action authorization,
historical 1,000-point email scoring, stored proofs and reports are unchanged.
UTC is only the executable preview basis; production timezone/cutover are unset.

At `2026-10-07T20:12:31.000Z`, Kyle accepted the contextual recommendation to
retain all existing awards, add optional suggestion 150, and permit 13,650.
Prospective scoring v2 therefore has quarterly 1,150 (email 1,000 + suggestion
150), source maximum 13,650, unchanged lower thresholds and L5 upper 13,650.
This is explicit numerical approval, distinct from the preceding design goal;
it is not activation, a production cutover, or empirical proof of optimality.

New amendment: `all-quarterly-scoring-calendar-quarter-2026-10-07-v3`.
The earlier v2 suggestion-only sidecar is preserved as the prior checkpoint.
Allocation amendment: `quarterly-suggestion-additive-allocation-2026-10-07-v4`.
Prospective scoring: `lythaus-monthly-rewards-2026-10-v2`. Its catalogue is an
explicit delta inheriting all 22 old actions unchanged and adding one optional
action. Delta SHA-256:
`26213abccce99ee51be6c0623406c28aaa7d39ed3ea3b4ac630b7cffd859db67`.
Base policy: `lythaus-monthly-rewards-2026-10-v1`. Original catalogue SHA-256:
`bc8be9d8f4cae4b0f3ec327e09f308069dd3e6b07e8ff57ccc6a6cc62435f5a2`.
The original 22 actions, original 100 acceptance IDs, v1 sidecar, and historical
v1 pending-decision register are preserved. V3's owner-approved calendar timing
does not approve the remaining operational defaults or activation. V4 resolves
the additive budget; the v3 timing-only checkpoint remains unmodified history.

Reserved files, with no shared dispatcher, export barrel, OpenAPI, role,
migration, CI, lockfile, profile/privacy, or support backend changes:

- `packages/contracts/policies/Lythaus_Monthly_Rewards_Suggestion_Amendment_v2.json`
- `packages/contracts/policies/Lythaus_Monthly_Rewards_Quarterly_Amendment_v3.json`
- `packages/contracts/policies/Lythaus_Monthly_Rewards_Allocation_Amendment_v4.json`
- `packages/contracts/policies/Lythaus_Monthly_Rewards_Action_Catalogue_v3.json`
- `packages/contracts/src/monthly-quarterly-policy.ts`
- `packages/contracts/src/monthly-reputation-prospective.ts`
- `packages/contracts/src/monthly-suggestion-policy.ts`
- Additive tests in `packages/contracts/tests/monthly-reputation.test.mjs`
- Real-receipt assertions in `apps/lythaus-jobs/tests/monthly-assembly.postgres.mjs`
- This evidence note.

## Inventory and reproduced gap

| Layer | Observed evidence at this base | Limit |
| --- | --- | --- |
| Implemented and merged | PR896 (`65994189`) supplies monthly policy, shadow earning, append-only corrections, assembly, snapshots, claims and private reports. PR930 (`10d6e7fc`) repairs reward authentication. Both are ancestors of this base. | Existing services are reused as the eventual accounting/report integration boundary. No second ledger or engine is added. |
| Existing accounting | `monthly-reputation-policy.ts` permits quarterly points only 0 or 1,000. Its maximum remains 13,500, with top-four whole weeks and next-month level projection. | F01 budget placement is absent. The existing F01 regression invokes the calculator with a suggestion field: it is ignored and contributes zero. |
| Prospective accounting | `previewProspectiveMonthlyReputation` invokes that calculator with quarterly zero, retaining validation, whole-week selection/ties/reselection and month allowance. It then adds at most 1,000 email and 150 suggestion for eligible sources. | Output is versioned `proposal_preview`, applies zero points, and has no persistence/consumer. Default cutover, first source month, rubric and authority are null. |
| Persistence boundary | Existing shadow SQL checks policy v1, quarterly points in (0, 1,000) and source score at most 13,500. | V2 cannot be written there. A serialized version-aware schema/adapter/report integration is required; no schema/API/dispatcher edits occur here. |
| Existing evidence producer | `packages/db/src/support-feedback.ts` writes `support.workflow.changed` through the existing private support transaction/outbox. | Workflow closure/status is not a useful independently accepted earning event. No earning rubric or qualified acceptance producer/consumer exists. |
| Existing private email producer | Canonical verification capture and separately gated renewal produce `email_control` observations. `readMonthlyMaintenanceEvidence` normalizes these private server rows. | V3 consumes this shape without another proof store or authentication change. An old verified credential is not a new scoring-quarter receipt. |
| Existing gates | `monthlyReputationShadowEnabled` requires `trust.monthly_reputation_shadow = true` and the exact v1 policy. Earning also requires a matching shadow rule set. | This change does not read or change live flag values and does not establish a global Rewards OFF state. Existing Rewards routes predate this change. |
| Tested here | Direct calls cover F01-Q01–Q07 and QALL-01–QALL-05. The existing PostgreSQL concurrent-renewal test supplies a committed private receipt to the new adapter. | Pure tests do not authenticate subjects. The PostgreSQL extension proves the canonical receipt bridge, concurrent retry behavior and unchanged security credential, without live awards/provider delivery. |
| Deployment/activation/owner acceptance | No deployment, DDL, flag, queue, real-member award, offer, email, or provider mutation is performed by this lane. | Approved calendar intent is not acceptance of this implementation or authorization to activate F01. Release hold and parent independent review remain. |

The bounded missing behavior is shared fixed-quarter scoring projection. The
old F01 regression reproduces absent suggestion scoring. QALL-03 reproduces the
newly superseded email timing: a March 31 proof earns 1,000 under rolling-v1 for
April, while v3 reports scoring expiry at April 1 and requires a new rewards
completion. No defect in the historical v1 calculation is alleged.

The new scoring contract exposes `reportLimits.maximumSourceMonth = 13650` and
`quarterlyMaximumPoints = 1150`, with separate email/suggestion allowances. The
existing Public report/export remains v1 and retains 13,500/1,000 denominators.
Analytics hooks must inspect policy version and `mode` before using this staged
contract. Their shared API/export wiring requires parent coordination; this
module is not added to the shared export barrel or a live route.

## Preview behavior and future adapter boundary

`previewUtcQuarterlyWindow` is the common calendar function for all quarterly
components. The suggestion window delegates to it; both adapters use
`previewQuarterlyCompletion` for source-cutoff eligibility.
The suggestion adapter assigns completion to the authoritative independent
acceptance month, retaining performance time separately. Late acceptance is not
backdated to submission/performance; late processing uses the stored decision
time. Quarter end is exclusive. Completion exactly at the next quarter boundary
starts that quarter. Leap day and December-to-January projection are covered.

The email adapter accepts existing private `MonthlyMaintenanceEvidence` and
selects the latest canonical completion before source cutoff, with stable
time/ID ties, exact retry dedupe and conflicting-ID rejection. It cannot derive
a completion from a valid security credential. Revocation before cutoff
withholds qualification; revocation at/after cutoff leaves that closing-month
qualification. A later-quarter receipt cannot backdate an earlier snapshot.
`validUntil` is the exclusive quarter boundary and `renewalRequired` reports
missing/expired/revoked scoring proof without invalidating authentication.

`previewSuggestionQualification` requires a prospective fixture configuration
and private server-normalized revision history. The default configuration has
no cutover, rubric, or authority and returns `configuration_pending`. Configs
cannot enable runtime activation, change the base hash/version, or choose a
cutover before the all-quarterly confirmation at 20:00:03 UTC. Fixture selections are not
owner-approved operational settings.

The envelope is a local preview shape, not a serialized ticket/outbox contract.
An eventual adapter must resolve the authenticated active subject, private
evidence ownership, reviewer authority and independence, stable contribution
identity, approved rubric, manipulation findings and competing awards from
server records. Boolean assertions in a pure fixture are not authentication.
The helper rejects extra client point/body fields, wrong subjects, self review,
unsupported versions, malformed IDs and impossible timestamps. Results omit
case text, evidence IDs, reviewer IDs and contribution IDs. No public endpoint
or export includes this preview; private HTTP access enforcement stays with the
existing report/support services.

Exact event retries are idempotent, independent of property/input order.
Conflicting event IDs or revision numbers fail. Complete out-of-order histories
are sorted by revision and must have causal predecessor links; incomplete
histories withhold qualification. Reversal cannot resurrect an old acceptance.
Reacceptance does not reset the original completion quarter. New work in a new
quarter can qualify; unchanged work cannot renew by replay.

Multiple contributions in the same qualifying quarter, or replacement after
reversal, return a pending selection decision instead of choosing a rubric or
winner. Reversal before source cutoff withholds current candidacy. A reversal
at/after cutoff reports `correction_timing_pending`; the helper does not rewrite
historical sources or fixed snapshots. Pending-state precedence is deterministic
under reordered histories. Every result has `appliedPoints: 0` and
`runtimeActivationAllowed: false`, including otherwise qualifying candidates.

Durable event receipts, transaction locks, correction/reselection, reports and
dependent snapshots must use the existing services when placement, rubric,
cutover and integration are approved. This draft creates no alternate storage.

## Requirements, code and test matrix

Tests below are additional F01 amendment cases, not replacements or a claim that
the original 100 acceptance workflows were executed.

| Requirement | Code | Executed regression |
| --- | --- | --- |
| Versioned all-quarterly amendment; unchanged v1 and previous sidecars/cap/catalogue | v3 sidecar; shared configuration pins | QALL-01, F01-Q01, original catalogue/F01 and CAL-16/17 |
| Common fixed quarters, completion month onward, leap day, exact quarter end | Shared window and both adapters | F01-Q02/QALL-02: all starts/positions, leap/year boundaries |
| Late acceptance/performance ownership; each source fixes next month; expiry leaves fixed snapshot | Both previews and unchanged monthly calculator | F01-Q03: all relevant source months and later evaluation |
| Disabled default, no retroactive cutover or activation | `SUGGESTION_PREVIEW_CONFIGURATION`; configuration validation | F01-Q04 |
| Duplicate/retry/out-of-order/conflicting revisions; concurrent choices withhold | Pure append-only history projection | F01-Q05; no claim of durable database concurrency |
| Reversal/reacceptance and new-quarter renewal | History projection; original completion window | F01-Q05/Q06 |
| Wrong subject, self review, client point/body injection, causal reversal, competing awards, private result shape | Envelope validation | F01-Q07; no claim of a new private API |
| Old security proof does not renew scoring quarter; late renewal does not backdate | Private receipt adapter and unchanged v1 email function | QALL-03 |
| Closing cutoff, prospective cutover, causal revocation and truthful expiry | Common qualification calculator | QALL-04 |
| Receipt retries/order/ownership and private results | Email evidence adapter | QALL-05 and extended PostgreSQL concurrent-renewal service test |
| Approved caps/catalogue delta; preserve v1/hash and old reports | V4 sidecar, hashed delta and prospective bands/denominators | V2-01/V2-02 |
| Once per component/source month, no multiple-feedback stacking, optionality | Reused qualification adapters plus additive proposal calculation | V2-03 |
| Whole-week deterministic selection and fifth-week correction; causal reversals | Invoke original calculator; pending lifecycle gates | V2-04 |
| Disabled configuration, explicit first source month/cutover, no historical relabeling | Prospective configuration/period gate | V2-05 |
| L1–L5 lower thresholds unchanged; L5 extends through 13,650 only prospectively | Prospective level validator; old validator untouched | V2-06: every integer 0–13,650 |

## Validation and remaining gates

Run the existing CI command with Node 22:

```sh
node --experimental-strip-types --experimental-test-coverage \
  '--test-coverage-include=packages/contracts/src/monthly-*.ts' \
  --test-coverage-lines=80 --test-coverage-branches=80 \
  --test packages/contracts/tests/monthly-reputation.test.mjs \
  packages/contracts/tests/monthly-peer-appeal.test.mjs \
  packages/contracts/tests/monthly-earning.test.mjs \
  packages/contracts/tests/monthly-maintenance.test.mjs
npm run typecheck:native
git diff --check
```

Local policy result: 56 tests pass, 0 fail, 0 skip. Common quarterly helper:
100% lines/functions, 98.59% branches. Suggestion helper: 100% lines/branches/
functions. Prospective monthly calculator: 100% lines/branches/functions.
Native typecheck and whitespace validation pass.
Disposable local PostgreSQL 17.11: 20 maintenance/assembly/renewal tests pass,
0 fail, 0 skip; new canonical receipt bridge assertions included. Existing
service coverage remains 99.22% lines/87.58% branches. This is synthetic data,
including separately gated renewal fixtures, with no real mailbox or award.

After the repository's existing local PG17 baseline setup, its integration
command is:

```sh
node --experimental-strip-types --experimental-test-module-mocks \
  --experimental-test-coverage \
  '--test-coverage-include=packages/db/src/monthly-maintenance.ts' \
  '--test-coverage-include=packages/db/src/monthly-email-renewal.ts' \
  '--test-coverage-include=packages/db/src/monthly-assembly.ts' \
  '--test-coverage-include=apps/lythaus-jobs/src/monthly-assembly.ts' \
  --test-coverage-lines=80 --test-coverage-branches=80 \
  --test apps/lythaus-jobs/tests/monthly-assembly.postgres.mjs
```

`PLANETSCALE_PG17_TEST_DATABASE_URL` must identify the explicit disposable
loopback database, never a provider branch. Proposal DDL exists only there.
Required full exact-head CI evidence belongs in the draft PR; it is not replaced
by this focused local result. Existing CI automatically includes the new
`monthly-*.ts` module and additive cases; no workflow change is needed.

| Owner/review gate | Status and decision packet |
| --- | --- |
| Quarterly 150 allocation (F01) | Confirmed at 20:12:31 UTC: preserve email 1,000 and all other awards; add optional 150, quarterly cap 1,150/source cap 13,650 and L5 upper 13,650 in prospective scoring v2. The old v1 maximum remains 13,500. |
| Alternatives considered | 850 email + 150 would have reduced email 15%; keeping email/source cap would have required another named reduction. Neither is implemented. Accepted additive allocation raises the prospective maximum 1.11%, without lowering existing awards. |
| Current recommendation | Retain confirmed once-per-quarter/remaining-month schedule and approved additive budget. Keep integration disabled until operational/integration/owner gates pass. The design goal alone was not numerical approval; the later contextual acceptance was. |
| Email calendar scope | Confirmed for every quarterly scoring component at 20:00:03 UTC. V1 history and security-proof/auth semantics remain unchanged. |
| Operational defaults | V3 timing is confirmed; UTC preview, cutover, rubric, reviewer authority, eligibility and retention remain unset. Historical v1 D01–D13 register is not rewritten. |
| Reversal/selection | Correction timing, concurrent selection and replacement policy remain pending; helper withholds rather than inventing them. |
| Support integration | Support lane owns qualified producer, private records and existing outbox. Shared serialized contract and durable adapter require parent coordination. Generic workflow events cannot earn points. |
| V2 persistence/API/analytics | Parent must serialize policy-aware source/snapshot/correction/report storage and analytics/API denominator integration. Existing v1-only constraints are not weakened here. No mixed-version snapshot, old-proof rewrite or legacy denominator override is allowed. |
| Independent review and merge | Parent independent review and full exact-head required CI precede any serialized merge. This remains draft; no self-merge or deployment. |
| Release freeze | Existing owner UI/deployment hold remains in force. This draft does not alter its release manifest, live flags, queues, schema or approval state. |

## Bounded incentive assessment

Kyle's 20:08:42 UTC principle sets a healthy, pro-human thriving-platform goal;
it did not itself approve a cap/rubric/implementation. The later 20:12:31 reply
approved the additive numerical amendment, while rubrics remain unset. Retain the confirmed
schedule: at most one independently useful accepted suggestion per quarter,
qualification only from actual acceptance month through quarter end, optional
participation, no points for submitting/reopening/ticket counts, and no renewal
by recycling work. This avoids monthly resubmission, but optimality is unproven.

| Goal | Concrete tradeoff and bounded proposal |
| --- | --- |
| Usefulness over volume/popularity/time online | Reward useful independently accepted improvement, not likes, agreement, queue closure, message length or hours. Rubric remains unset; this draft cannot establish actual quality. |
| Constructive disagreement | Propose evidence-based usefulness criteria permitting reasoned criticism of Lythaus. Acceptance must not require praise or agreement with a reviewer; specific rubric needs approval. |
| Accessible participation | One completion per quarter reduces repeated pressure. Propose equivalent accessible submission/review paths without a new challenge or time-online requirement. Existing authentication stays unchanged. |
| Optional feedback/opportunity scarcity | Weekly 10,000 plus monthly 2,500 already permit L5 without quarterly components. Suggestions must not become necessary for status; finite genuine improvements/staff attention should not penalize members without suitable suggestions. |
| Early-quarter advantage | Nominal 150 affects 3/2/1 source calculations: illustrative influence 450/300/150 across them, not a carried/spendable balance. Review delays can reduce opportunity. Do not backdate contrary to owner timing; propose assessing delay/consistency before activation, without inventing an SLA. |
| Farming/low quality | Independence, stable work identity, one-per-quarter qualification, no self review, manipulation screening and competing-award exclusion reduce replay incentives. Ticket splitting, reciprocal approval and self-manufactured problems remain risks until qualified producer/rubric exist. Do not manufacture tasks to offer everyone a bonus. |
| Budget tradeoff | Accepted 13,650 preserves both allowances and increases the maximum 1.11%; alternative redistribution would devalue an action. Approval does not prove better wellbeing. Assess quality, reversals and review access using approved evidence, without new tracking/retention defaults. |

Research warns that external rewards can alter motivations; it does not
validate this Lythaus design or predict its effect size. See
[Gneezy, Meier and Rey-Biel, JEP 2011](https://www.aeaweb.org/articles?id=10.1257/jep.25.4.191).
W3C describes assistance/alternatives that reduce cognitive authentication
barriers; applying that concern to optional rewards is an inference, not a
conformance claim. See
[W3C Accessible Authentication](https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html).
These references support caution and accessible participation, not a new
provider/auth integration or proven optimality.
