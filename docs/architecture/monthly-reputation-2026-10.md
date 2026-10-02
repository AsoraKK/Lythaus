# Monthly reputation implementation decision

Status: confirmed product direction; operational defaults and activation pending.
Policy: `lythaus-monthly-rewards-2026-10-v1`.
Reviewed base: `8c4261402dd370b4c57e082cf0fc16b41927f7db` (remote main verified 2 October 2026).

The October monthly model replaces the earlier accumulating reputation model for
future approved assessments. Four highest whole weekly results belonging to source
month A contribute at most 10,000 points, monthly maintenance at most 2,500, and
valid quarterly email evidence exactly 0 or 1,000. The maximum is 13,500. The
assessment fixes month B's level; activity in B builds C. No account age,
subscription, pillar, World credential or carried balance changes the score bands:
L1 0–999, L2 1,000–2,999, L3 3,000–5,999, L4 6,000–9,999, L5 10,000–13,500.

Historical policies, events, ballots and reports keep their original identifiers
and meanings. New standard appeals require timed, private community review, one
equal vote per eligible member and no ordinary Editorial confirmation. Existing
weighted-panel cases cannot silently become new-policy cases.

## Source and scope

The entire 26-page October task sheet was reviewed, including all 100 acceptance
cases. The complete original 22-action companion catalogue was subsequently
supplied and preserved with whitespace-only formatting under
`packages/contracts/policies/Lythaus_Monthly_Rewards_Action_Catalogue_v2.json`.
The latest owner clarification makes this package supersede earlier discussions.
Its explicit prohibition on runtime activation remains in force. Its embedded
2,515 reference checks are source claims, not application tests executed here.
This document contains product requirements only, without personal source details.

The initial implementation is a shadow accounting foundation in the existing
contracts, PostgreSQL and Jobs layers. It accepts already-settled, preassigned
whole-week inputs; it does not infer how actions earn points. The D01 proposal must
be explicitly named and its complete week boundaries match; no other convention
is silently substituted. D08 is also tested as a proposed rule only. A separate
candidate equal-vote evaluator implements configurable D09 rules without invoking
or changing old-policy appeal routes. Shadow assessments cannot update current levels, reward entitlements or
the historical ledger. A proposed schema is validated locally outside the approved
production migration manifest. No new API, Flutter surface, offer or provider
resource is activated by this slice.

## Baseline and consumers

| Area | Existing source | Gap and required integration |
| --- | --- | --- |
| Policy | `packages/contracts/src/reputation-policy.ts` | `reputation-v2.0.0`, L0–L5, cumulative score, age/activity/pillar gates; retain labelled history, version new assessments explicitly |
| Persistence | `packages/db/src/reputation.ts` | Aggregates all effective history and rewrites profile/balance; new monthly revisions must never call this path |
| Appeals | `packages/contracts/src/appeal-policy.ts` | `appeals-v1.0.0`, five trained reviewers, L5 weight 2 and Editorial adjudication; new standard cases need separate version dispatch |
| Appeal runtime | public `index.ts` create/vote/recuse/assignments; Jobs `processAppealVoteLocked` and `AppealLifecycleWorkflow`; admin `adjudicateAppeal` and `runtime-policy.ts` | Assignment foreign keys, weighted outcomes and required adjudication span all three Workers; update together in T06 |
| Earning | Jobs `processReputationSource`, `processAppealReputationResolution`, `processAccountStandingRefresh` | Old point impacts and reversal semantics are invoked; T04 needs policy-versioned event collection and derived corrections |
| Rewards | public `rewardsSnapshot`, `redeemReward`; `packages/contracts/src/tier-policy.ts` | Reads current historical profile and enforces seven-day maturity; new access must use fixed monthly snapshots and persistent plan slots |
| Flutter | `lib/ui/screens/adaptive_shell.dart`, `rewards/rewards_dashboard.dart`, `profile/reputation_ledger_screen.dart`, reputation and reward providers/models | Rewards already appears below Profile on desktop/mobile; extend the existing destination and clear private caches on account change |
| Contract | `api/openapi/openapi.yaml` and referenced `product-integrity.yaml`; `lib/generated/api_client/` | Existing reputation, reward and appeal operations advertise old semantics; change canonical schemas and regenerate Dart during their vertical slices |
| Privacy | Jobs `AccountExportWorkflow`, `AccountDeleteWorkflow`; `privacy.reconcile_subject_data_locations` | Extend private report/export and erasure/retention handling before collecting new personal evidence |
| Database | `0000`–`0020` migrations; `0012_product_integrity_v2.sql`; `trust.policy_versions`, `trust.reputation_events`, `trust.reputation_profiles`, appeal assignments/votes/outcomes | Existing tables are authoritative; add period-specific revisions without relabelling old records |
| Resources | `infrastructure/lythaus-resource-registry.json` | Reuse existing three logical Workers, fresh Hyperdrives, outbox and queues; no new resource/cost approval is implied |

Read-only provider checks on 2 October found only `lythaus-core/main`, 102 tables,
and migration ledger through `0020_auth_recovery_delivery.sql`. The old
`development` reference is historical. The queried reputation/rewards/appeal flag
keys returned no rows, which is not proof of disabled runtime behavior. The source
seed contains disabled old flags but is explicitly synthetic-only. Current workers
and deployed policy behavior were not verified in this pass.

No nested `AGENTS.md` or repository `SKILL.md` was found. CI requires repository
hygiene, native typechecking, product/runtime/critical coverage tests, OpenAPI and
generated-client checks, Flutter analysis/tests/browser evidence, and a separate
PostgreSQL 17 workflow. The production migration manifest pins the exact approved
file set and bytes; a draft schema must not enter that set before review.

## Owner decision register

Every entry remains pending. Proposed values are test candidates, not live policy.

| ID | Pending decision |
| --- | --- |
| D01 | UTC Monday–Sunday weeks assigned to closing Sunday's month; cross-month ownership |
| D02 | 72-hour settlement; explicit provisional benefits and merchant pending/grace handling |
| D03 | Four of six substantive families for one 150-point breadth award |
| D04 | Source/correction 150 per item, shared 300; help/accessibility 125 per item, shared 250 |
| D05 | One accepted contextual own/other discussion contribution for each 150 milestone |
| D06 | Reception rubric, evidence sufficiency, fairness and shadow evaluation |
| D07 | Full-month credential/2FA continuity; new-user and protection-gap treatment |
| D08 | Rolling three calendar months from verification, clamped at target month end, scored immediately before cutoff; this proposal supersedes the older fixed-quarter discussion but still needs activation approval |
| D09 | 48-hour review, quorum five, strict majority, one 24-hour extension; ballot-edit convention |
| D10 | One valid ballot for the weekly 250; no-case handling, no invented substitute |
| D11 | Restricted safety route and accountable unresolved-case review |
| D12 | Merchant switching, downgrade, grace, recurring-price transition and QR validity |
| D13 | Open old-policy appeal cutover and existing signed reward obligations |

Also required before launch: approved catalogue/digest; purpose-based
snapshot/commercial retention; privacy/safety/minor review; provider capability and
authentication evidence; six-month earning freeze dates; first assessment and
effective months; separately approved migration, exact-SHA deployment and activation.

## Work packages

| Package | Implementation and test work | Initial status |
| --- | --- | --- |
| T01 Reconcile | Source/consumer map, this decision record, historical cutover plan | Inventory complete; cutover pending D13 |
| T02 Canonical policy | Validated catalogue, cap groups, pure best-four/bands, candidate calendar, approved decision configuration | Original catalogue hash and cap structure verified; calculation, candidate D01/D08 and equal-vote policy tested; action earning and remaining default configuration pending |
| T03 Persistence | Canonical events/outbox, immutable period revisions, assurance proofs, ballot uniqueness, selections/claims | Shadow source/assessment revisions and Jobs adapter locally tested; full ledger and migration pending |
| T04 Earning | Real post/discussion/specialist/reception/authorship events and dependency reversals | Catalogue available; D03–D06/D10 activation approvals required |
| T05 Security | Reuse normal validated auth events; capability-aware integrity, credential continuity, Turnstile/refresher | Coordinate with separate disabled passkey work; D07/D08/provider gates pending |
| T06 Peer review | Private timed electorate, equal ballots/history, close transaction, scoped override, restricted route | Candidate policy tests pass; invoked routes, atomic ballots, D09/D11/D13 and three-Worker cutover pending |
| T07 Rewards/partners | Persistent Free/Premium/Black selections, proposals, consent/email linkage, QR/invoice idempotency | Commercial terms and approved offers pending; no fake merchants |
| T08 Flutter | Existing Rewards tabs, profile tracker, real contribution/review forms, complete states | Depends on authoritative API slices; no parallel route |
| T09 Reporting/privacy | Stored-calculation parity, full own report, public methodology, safe JSON/CSV, DSR/retention | Full report needs catalogue and preceding evidence records |
| T10 Release | Shadow run, fairness/load/failure testing, approved cutover, exact-SHA release and rollback | No release or activation authorization |

The acceptance matrix in `docs/testing/monthly-reputation-acceptance.md` tracks
code and executable evidence separately. Passing arithmetic tests does not prove
provider operation, user workflows, migration or activation.

The source writer currently accepts pre-settled aggregate evidence from a trusted
internal caller; no production earning producer calls it yet. Real action evidence,
cap-group concurrency, weekly source identity across revisions, proof provenance,
scheduled settlement and DSR workflow integration are required before collecting
personal data. A shadow result is never a confirmed entitlement. The candidate
appeal evaluator is a policy primitive only; eligibility data must come from fresh
server checks and ballot/close transactions still need T06 implementation.

## Rollback and isolation

The first slice writes only shadow records after an explicitly enabled matching
shadow flag and a canonical stored source event. Missing/disabled flags stop before
new schema access. Disable the shadow flag to stop future calculation; retain or
erase existing shadow evidence under the applicable approved privacy process. No
historical score or existing entitlement needs restoration because this slice never
updates them. The proposed schema has no production migration number or approved
manifest entry. Dropping production tables is not an authorized rollback.
