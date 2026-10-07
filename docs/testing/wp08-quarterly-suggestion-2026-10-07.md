# WP08 prospective suggestion calendar qualification

Base: `789e4a6e90f9b6af440f0fa68192fbfed420f0fd`. Branch:
`codex/wp08-calendar-quarter`. PR949 and its causal-evidence fix are a separate
unchanged draft; this branch does not include or amend that draft.

This is a prospective F01 sidecar and pure preview. It applies zero points,
publishes no level, changes no feature flag, and adds no earning engine,
database schema, route, queue consumer, or production configuration.

## Authority and exact scope

Kyle's item 2 clarification at `2026-10-07T18:15:47.000Z` says quarterly points
completed in the first month qualify for three months, completion in the second
month for two, and completion in the third month for one. The parent instruction
interprets this as fixed Jan/Apr/Jul/Oct quarters, no earlier-month credit, and
no carry after quarter end. A source month continues to fix the following
month's level; quarter expiry does not withdraw that fixed snapshot.

The discussion concerned accepted suggestion points. Application to email
scoring remains an explicit owner question. Existing D08 email proposals,
security proof freshness, sensitive-action authorization, and historical
1,000-point email scoring are unchanged. UTC is only the executable preview
basis; production boundary timezone and prospective cutover remain unset.

New amendment: `accepted-useful-suggestion-calendar-quarter-2026-10-07-v2`.
Base policy: `lythaus-monthly-rewards-2026-10-v1`. Original catalogue SHA-256:
`bc8be9d8f4cae4b0f3ec327e09f308069dd3e6b07e8ff57ccc6a6cc62435f5a2`.
The original 22 actions, original 100 acceptance IDs, v1 sidecar, and D01–D13
pending operational decisions are preserved, without reinterpretation.

Reserved files, with no shared dispatcher, export barrel, OpenAPI, role,
migration, CI, lockfile, profile/privacy, or support backend changes:

- `packages/contracts/policies/Lythaus_Monthly_Rewards_Suggestion_Amendment_v2.json`
- `packages/contracts/src/monthly-suggestion-policy.ts`
- Additive tests in `packages/contracts/tests/monthly-reputation.test.mjs`
- This evidence note.

## Inventory and reproduced gap

| Layer | Observed evidence at this base | Limit |
| --- | --- | --- |
| Implemented and merged | PR896 (`65994189`) supplies monthly policy, shadow earning, append-only corrections, assembly, snapshots, claims and private reports. PR930 (`10d6e7fc`) repairs reward authentication. Both are ancestors of this base. | Existing services are reused as the eventual accounting/report integration boundary. No second ledger or engine is added. |
| Existing accounting | `monthly-reputation-policy.ts` permits quarterly points only 0 or 1,000. Its maximum remains 13,500, with top-four whole weeks and next-month level projection. | F01 budget placement is absent. The existing F01 regression invokes the calculator with a suggestion field: it is ignored and contributes zero. |
| Existing evidence producer | `packages/db/src/support-feedback.ts` writes `support.workflow.changed` through the existing private support transaction/outbox. | Workflow closure/status is not a useful independently accepted earning event. No earning rubric or qualified acceptance producer/consumer exists. |
| Existing gates | `monthlyReputationShadowEnabled` requires `trust.monthly_reputation_shadow = true` and the exact v1 policy. Earning also requires a matching shadow rule set. | This change does not read or change live flag values and does not establish a global Rewards OFF state. Existing Rewards routes predate this change. |
| Tested here | Direct calls to the new pure preview and existing calculators pass the additive F01-Q01–Q07 cases and existing four-file policy suite. | Pure tests do not prove durable dedupe, concurrent database serialization, private HTTP authorization, or provider delivery. Those existing integration suites run in required CI. |
| Deployment/activation/owner acceptance | No deployment, DDL, flag, queue, real-member award, offer, email, or provider mutation is performed by this lane. | Approved calendar intent is not acceptance of this implementation or authorization to activate F01. Release hold and parent independent review remain. |

The bounded missing behavior is a versioned projection of qualified suggestion
completion into the remaining source months of its fixed quarter. Existing
services have no such F01 qualification path. The old F01 regression and the
support producer inspection reproduce the absence; no defect in the historical
v1 calculation is alleged.

## Preview behavior and future adapter boundary

`previewUtcSuggestionWindow` assigns completion to the authoritative independent
acceptance month, retaining performance time separately. Late acceptance is not
backdated to submission/performance; late processing uses the stored decision
time. Quarter end is exclusive. Completion exactly at the next quarter boundary
starts that quarter. Leap day and December-to-January projection are covered.

`previewSuggestionQualification` requires a prospective fixture configuration
and private server-normalized revision history. The default configuration has
no cutover, rubric, or authority and returns `configuration_pending`. Configs
cannot enable runtime activation, change the base hash/version, or choose a
cutover before the recorded owner clarification. Fixture selections are not
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
| Versioned prospective amendment; unchanged historical cap/catalogue/email | v2 sidecar; configuration pins | F01-Q01, original catalogue/F01 and CAL-16/17 |
| Fixed quarters, completion month onward, leap day, exact quarter end | `previewUtcSuggestionWindow` | F01-Q02: all four starts, each completion month, three years |
| Late acceptance/performance ownership; each source fixes next month; expiry leaves fixed snapshot | Both previews and unchanged monthly calculator | F01-Q03: all relevant source months and later evaluation |
| Disabled default, no retroactive cutover or activation | `SUGGESTION_PREVIEW_CONFIGURATION`; configuration validation | F01-Q04 |
| Duplicate/retry/out-of-order/conflicting revisions; concurrent choices withhold | Pure append-only history projection | F01-Q05; no claim of durable database concurrency |
| Reversal/reacceptance and new-quarter renewal | History projection; original completion window | F01-Q05/Q06 |
| Wrong subject, self review, client point/body injection, causal reversal, competing awards, private result shape | Envelope validation | F01-Q07; no claim of a new private API |

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

Local result: 45 tests pass, 0 fail, 0 skip. New helper coverage: 100% lines,
100% branches, 100% functions. Native typecheck and whitespace validation pass.
Required full exact-head CI evidence belongs in the draft PR; it is not replaced
by this focused local result. Existing CI automatically includes the new
`monthly-*.ts` module and additive cases; no workflow change is needed.

| Owner/review gate | Status and decision packet |
| --- | --- |
| Quarterly 150 allocation (F01) | Unapproved. Existing maximum is 10,000 weekly + 2,500 monthly + 1,000 email = 13,500. Adding 150 yields 13,650. No cap raise, implicit truncation or placement is implemented. |
| Compatible allocation proposal | Recommend an explicitly approved prospective quarterly allocation of 850 email + 150 suggestion within 1,000. This changes the confirmed email amount and requires owner approval; all historical email 1,000 meanings remain. If email must stay 1,000, the owner must identify another allowance to reduce by 150. |
| Email calendar scope | Pending owner clarification. Existing email scoring and security proof/auth semantics remain unchanged. |
| Operational defaults | D01–D13 remain pending; UTC preview, cutover, rubric, reviewer authority, eligibility and retention are not selected for production. |
| Reversal/selection | Correction timing, concurrent selection and replacement policy remain pending; helper withholds rather than inventing them. |
| Support integration | Support lane owns qualified producer, private records and existing outbox. Shared serialized contract and durable adapter require parent coordination. Generic workflow events cannot earn points. |
| Independent review and merge | Parent independent review and full exact-head required CI precede any serialized merge. This remains draft; no self-merge or deployment. |
| Release freeze | Existing owner UI/deployment hold remains in force. This draft does not alter its release manifest, live flags, queues, schema or approval state. |
