# Monthly reputation implementation decision

Status: confirmed product direction; operational defaults and activation pending.
Policy: `lythaus-monthly-rewards-2026-10-v1`.
Reviewed base: `8c4261402dd370b4c57e082cf0fc16b41927f7db` (remote main verified 2 October 2026).
Main rechecked at `26dc226776f8acd3898954635c327db1ad898128`: intervening feed
presentation and Android packaging changes do not alter this backend/migration baseline.
Integration with those changes remains a separate parent-managed step.
Main rechecked on 3 October at `6d1d52a4` after the security tooling changes.
Security/Friday retains the main/release slot. Shared OpenAPI, generated client,
profile/navigation and privacy workflow changes require coordination with the
app-flow owner before overlapping edits; no main integration has occurred here.

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

The implementation uses shadow accounting in the existing contracts, PostgreSQL
and Jobs layers. The monthly calculator accepts settled whole-week inputs. A separate
earning producer consumes canonical post/comment lifecycle and moderation events,
records immutable evidence, and computes versioned weekly results. The D01 proposal must
be explicitly named and its complete week boundaries match; no other convention
is silently substituted. D08 is also tested as a proposed rule only. A separate
equal-vote service implements configurable D09 rules behind explicit activation
and approval records, with version dispatch preserving old-policy cases. Shadow assessments cannot update current levels, reward entitlements or
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
| T02 Canonical policy | Validated catalogue, cap groups, pure best-four/bands, candidate calendar, approved decision configuration | All 22 action calculations represented; weekly and maintenance candidate rules tested; operational approvals remain pending |
| T03 Persistence | Canonical events/outbox, immutable period revisions, assurance proofs, ballot uniqueness, selections/claims | Immutable monthly/weekly revisions, canonical email proofs, assembly reports, source receipts and Jobs transactions tested; selections/claims and migration pending |
| T04 Earning | Real post/discussion/specialist/reception/authorship events and dependency reversals | Canonical post/comment producers, publication milestone, declarations/authorship, duplicate withholding and corrections tested; contextual acceptance, specialist/reception producers and peer participation remain to integrate |
| T05 Security | Reuse normal validated auth events; capability-aware integrity, credential continuity, Turnstile/refresher | Actual email verification feeds bound evidence, including scoring pauses; full-month coverage/assessment calculations tested; other real providers, renewal workflow and D07/D08 activation remain gated |
| T06 Peer review | Private timed electorate, equal ballots/history, close transaction, scoped override, restricted route | Public/admin routes, transactional ballots/closure, scoped restoration, earning corrections and private notices tested; ballot earning, specialist/unresolved execution, D09/D11/D13 activation and Flutter remain |
| T07 Rewards/partners | Persistent Free/Premium/Black selections, proposals, consent/email linkage, QR/invoice idempotency | Commercial terms and approved offers pending; no fake merchants |
| T08 Flutter | Existing Rewards tabs, profile tracker, real contribution/review forms, complete states | Depends on authoritative API slices; no parallel route |
| T09 Reporting/privacy | Stored-calculation parity, full own report, public methodology, safe JSON/CSV, DSR/retention | Full report needs preceding evidence records and report/API/DSR integration |
| T10 Release | Shadow run, fairness/load/failure testing, approved cutover, exact-SHA release and rollback | No release or activation authorization |

The acceptance matrix in `docs/testing/monthly-reputation-acceptance.md` tracks
code and executable evidence separately. Passing arithmetic tests does not prove
provider operation, user workflows, migration or activation.

The monthly source writer accepts settled aggregate evidence from a trusted internal
caller. Scheduled monthly assembly joins settled weekly results and maintenance/email
evidence, then atomically writes the immutable source, private report and assessment
request. Real action evidence has stable contribution and week identities, with transactional
deduplication, revisions and scheduled settlement. Remaining proof provenance and DSR
workflow integration are required before production collection. A shadow result is
never a confirmed entitlement. Appeal eligibility now comes from fresh registered,
verified-account and scoped restriction checks, without reputation, subscription,
training or age gates. Peer participation is recorded as evidence at final closure;
the proposed weekly participation award is not yet connected to earning.

## Maintenance and monthly assembly

`monthly_reputation_maintenance.sql` remains a disposable schema proposal. Ordinary
email verification records the consumed canonical token reference and a private
digest of the keyed email binding in the same authentication transaction. No email
address, token, password or client-supplied point value becomes scoring evidence.
Duplicate proof delivery uses a transaction lock and returns the original receipt.
Renewals replace validity rather than accumulating a component. A dedicated
quarterly renewal workflow still needs implementation and shared contract coordination.

Collection requires the explicit environment rule version, matching policy flag
row and immutable `collection_privacy_version = monthly-privacy-v1` prerequisite.
That prerequisite must remain absent in deployed configuration until actual DSR
export/locator integration is complete and reviewed. Synthetic fixtures explicitly
set it; they do not approve collection. A disabled scoring flag pauses assembly
while configured canonical proof capture and revocation continue. Missing flags or
configuration stay inert. Capability defaults explicitly mark integrity, credential,
MFA, challenge and refresher unavailable rather than manufacturing observations.

Assembly requires settlement, each whole week's latest locked revision, and a
drained canonical source backlog for the actual author and original work period.
Unprocessed events, including late corrections and batches larger than 50, prevent
a false settled zero. Missing weeks carry explicit before-collection, before-account
or no-recorded-activity reasons. Source revisions preserve all selected and omitted
weeks; replay returns the stored report, and changed evidence appends a correction.

Narrow database functions lock and freshly check the subject. Insert guards and
soft-delete erasure cover observations, earning revisions, sources, assessments,
reports and their derived outbox/inbox events. Both an assembly waiting on the month
lock and an assessment interrupted before insertion fail to resurrect deleted data.
Lifecycle triggers check the existing feature row before reading proposal tables.
First writes lock that row, and removal/relabeling is refused while executable
configuration or evidence requires the erasure protocol. Pausing its enabled bit
remains available. Actual AccountExportWorkflow/locator integration is still pending.

Ordinary deletion preserves already accepted legitimate contribution evidence and
its original work identity, fingerprint, week and cap. Independent invalidation
still appends a correction, including a block delivered after physical content
purge. No raw content body is retained in the earning record.

Node 22.23.3 verifies 38 policy cases (100% lines, 98.87% branches), 13 real
maintenance/assembly PostgreSQL cases (99.10%, 95.35%) and 10 earning cases
(96.17%, 95.04%). Native typechecking passes. These are scoped tests, not proof that
all 100 application acceptance cases or real provider workflows pass.

The shared-database CI outbox race is fixed separately at
`76de6afdd65efd6269793bad070a67549f32da36`: suite files now run sequentially while
intentional in-test concurrency remains. An unrelated scheduled worker could claim
another fixture's password-change notice without encryption keys and defer it before
the auth fixture's relay. The exact historical claimant is unobserved. Dedicated
PostgreSQL run `37118705848` passes authentication, coordinator, beta and alpha;
this does not establish a live email failure or rewards regression.

## Private community appeal transactions

`community_appeals.sql` is a local schema proposal. `COMMUNITY_APPEAL_RULES_VERSION`
must be explicitly configured, the matching `moderation.community_appeals` database
flag enabled, and an immutable rule-set row must record approval before creation,
triage, peer evidence, ballots or scheduled closure can run. No configuration,
approval or flag is seeded. Synthetic test approvals do not approve production policy.
Owner reports remain readable during a pause. Existing open historical cases are
kept under their original policy; a new-policy replacement is refused pending D13.

Submission freezes the current challenged decision, content revision, declaration
and classifier evidence. Only active, conflict-free moderation staff can provide a
safe redacted text packet and rule context. The clock starts at that transaction.
Once opened, database triggers prevent replacing the packet under existing votes.
Restricted cases have no ordinary peer evidence or vote access; specialist resolution
and accountable unresolved-case actions remain gated on D11.

Public JWT and staff Access routes use fresh database bindings. Public reads contain
only the safe packet, own ballot and closed outcome. One unique voter/case ballot
retains immutable revisions, weight exactly one, structured reasons and an expected
revision. Ballots and closure lock the same session; the insert checks the database
clock again at the deadline. Closure rechecks current eligibility, allows more than
five voters, and records valid minority participation identically to the majority.
There is no ordinary Editorial confirmation or veto.

Closure, scoped override, publication eligibility checks, immutable outcome,
participation evidence, private preference-aware notifications and outbox events
commit together. Deleted or edited content, independent decisions and declaration
rules prevent inappropriate republication. An unchanged classifier evidence set
cannot immediately requeue an overturned revision. The real Jobs replay path is
tested. Restoration emits the existing publication event shape, invokes new earning
correction from authoritative outcome evidence, and does not award historical-policy
points. Earlier historical consequences remain a D13 reconciliation responsibility.

OpenAPI v9 documents policy-specific response and ballot shapes and adds the private
review/withdrawal and staff triage/evidence/queue operations. The pinned Dart generator
has been run, its package compiled/analyzed, and dedicated serialization tests cover
new and historical shapes. The product Flutter review screen and full DSR lifecycle
are subsequent work; these backend tests are not deployment or end-to-end UI evidence.

## Canonical earning producer

`packages/db/src/monthly-earning.ts` reads the stored outbox event and actual content,
author, current moderation revision and independent decision. Queue point totals,
claimed authors and client clocks cannot award points. Three distinct accepted human
posts complete one 250-point milestone. Accepted participation supports the separate
declaration/authorship components; honest assisted content does not erase unrelated
human work. Published comments/replies are classified from stored thread ownership
and remain pending contextual acceptance. Source performance time determines week
ownership even when review is late. A cross-period edit remains explicitly pending
review rather than silently backdating newly performed work.

The producer withholds repeated identical accepted work within a week and recomputes
dependent components on corrections. This is a deterministic duplicate check, not a
completed manipulation/ring detector. Independent account restrictions remain separate
from historical earning; erased subjects cannot be recreated by delayed source events.
Full risk adjudication and cross-period version review remain to integrate.

Collection requires an explicit `MONTHLY_REPUTATION_SHADOW_RULES` version, the matching
enabled database shadow flag, and an immutable rule-set row with a collection start
time and the exact catalogue digest. No configuration or flag is seeded/enabled by this
branch. The proposed SQL stays outside the approved migration manifest. Scheduled
reconciliation consumes unrecorded canonical sources, including events handled by the
old Jobs inbox during a pause, and advances weekly open/settling states without changing
current profiles or entitlements. Evidence, weekly revisions, receipts and result
events commit or roll back together.

## Ticket feedback interface proposal

The separate control-panel ticket workstream owns the user-app sidebar destinations
**Report a problem** and **Feedback and suggestions**, their ticket backend, private
case history and staff workflows. This reputation slice must not create competing
routes or ticket storage. Feedback earning is an owner-review proposal only:
submission, staff acknowledgement, ticket closure, duplicate reports, votes or
popularity do not themselves establish an accepted contribution.

The later owner amendment confirms **150 points for one accepted, useful suggestion
per quarter**, with optional participation and continued access to report bugs or
suggestions without points. Meaningful independent acceptance is required; this is
not a submission reward. The amount and cadence supersede the earlier possibility
of treating every accepted suggestion as an ordinary help task. They are recorded
in the versioned sidecar
`packages/contracts/policies/Lythaus_Monthly_Rewards_Suggestion_Amendment_v1.json`;
the original 22-action catalogue and its digest remain unchanged.

F01 is the remaining decision outside the original catalogue's D01–D13: where this
150 fits in the existing budget and which source-month assessment it affects.
The 13,500 source-month maximum is unchanged. No additional score component,
quarterly-email increase, recurring award in multiple months or allocation to a
weekly/monthly cap is inferred. The quarter boundary and detailed acceptance rubric
also remain to be specified. In particular, the earlier D08 email-validity proposal
does not define the suggestion allowance window.

The same contribution cannot also earn `weekly.accepted_help` or
`weekly.accepted_accessibility`. Those existing actions share the 250 weekly
`help_accessibility` cap, with their 125-per-task value still a D04 operational
proposal. Do not silently apply that value to the newly confirmed 150-point
suggestion award. Whether a bug report can qualify as a useful suggestion requires
the approved rubric; ordinary reports remain available without earning points.

The proposed producer/consumer boundary is a server-authored acceptance or
reversal event through the existing transactional outbox. The ticket workstream
would own the decision and its private evidence; T04 would consume it only after
the rubric, source-week assignment and scoring configuration are approved. Agree
the following interface with that workstream before either side wires a consumer:

| Proposed field or invariant | Owner and purpose |
| --- | --- |
| Event ID, stable contribution ID, decision revision and superseded revision | Ticket service generates UUIDv7 IDs and monotonic decision revisions; repeated delivery and reopening cannot award the same contribution again |
| Ticket reference, subject ID and contribution classification | Ticket service resolves the authenticated submitter server-side; scoring classification remains pending F01, never client-supplied points |
| Accepted/reversed decision, authoritative timestamp, rubric/policy version and private evidence reference | Ticket service records an auditable decision; consumer verifies supported policy and source identity rather than interpreting ticket status as acceptance |
| Independent reviewer provenance and duplicate/manipulation findings | Authorised ticket reviewers cannot accept their own work; spam, duplicate underlying work and reciprocal acceptance farming are held or rejected with evidence; shared IP alone is insufficient |
| Original accepted contribution reference on reversal | T04 reverses that source idempotently and recomputes only linked caps, allowances and dependent calculations under approved budget-placement and correction rules |
| Current decision revision for reconciliation | Out-of-order accept/reverse events cannot resurrect an invalidated award; duplicate delivery cannot consume a second allowance |

The event payload must not copy ticket text, attachments, email addresses or staff
notes into the points ledger, public profiles or general logs. Case history remains
private to the member and authorised staff. Export, redaction, deletion and retention
need a coordinated reference-handling contract across both workstreams. Public
methodology can explain approved eligibility without exposing private cases.

F01 must settle budget placement, source-month effect, quarter boundaries, acceptance
rubric, reviewer authority/conflicts, duplicate treatment, contribution time versus
acceptance time and correction timing. Privacy retention also needs agreement
across the two workstreams. There is no wired event consumer or ticket implementation
in this slice. `runtime_activation_allowed` remains `false`; the current calculator
cannot add the unplaced 150. Required interface tests are tracked separately from
the original 100 acceptance cases in the acceptance matrix.

## Rollback and isolation

The first slice writes only shadow records after an explicitly enabled matching
shadow flag and a canonical stored source event. Missing/disabled flags stop before
new schema access. Disable the shadow flag to stop future calculation; retain or
erase existing shadow evidence under the applicable approved privacy process. No
historical score or existing entitlement needs restoration because this slice never
updates them. The proposed schema has no production migration number or approved
manifest entry. Dropping production tables is not an authorized rollback.

A request committed before a shadow pause remains durable. Disabled delivery
records `monthly_reputation_shadow_paused` on the canonical outbox event and removes
the processing inbox claim before acknowledging transport. It does not mark the
assessment complete. The ordinary relay excludes these paused events, preserving
the marker even if an earlier send finishes concurrently. Re-enabling permits the
same queue event to run again; the scheduled Jobs entrypoint also reconciles up to
25 marked requests per run without requiring Queue redelivery. Successful assessment
clears the marker in the assessment transaction. One invalid request remains pending
and logged while other requests in the batch can proceed.
