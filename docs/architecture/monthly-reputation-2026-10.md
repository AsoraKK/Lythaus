# Monthly reputation implementation decision

Status: confirmed product direction; operational defaults and activation pending.
Policy: `lythaus-monthly-rewards-2026-10-v1`.
Reviewed baseline: `8c4261402dd370b4c57e082cf0fc16b41927f7db`. At the 4 October
verification checkpoint, GitHub `main` was
`627ae30b36cd995c4f117bf3c44789c986b5d46b`, containing security release 89
(`6d1d52a4fa3f51ae041fbf38b5724578a8596b61`, run `37118382512`) and PR908
dependency repair (`8d91bcb434c4960a0f51ee2e4c7563c4f6e88a6c`). PR896 was
open/draft at head `9d2e18702e7f22b4962a63433454f99a77f7d2ee`. Current exact-head
CI run `37168785854` completed successfully on retry; its seven-suite PostgreSQL
run `37168785849`, Dependency Review `37168785838`, CodeQL `37168785850`, Mobile
Security `37168785840`, Native secret scan `37168785870`, and Flutter retry
`111339203892` passed at that head. The 167/167 zero-skip count is recorded at the
earlier `ea4096dc` revision; the current run's pass is not assigned that count.

The generated-client normalizer, browser-fixture authorization case and scoped
scroll finder are committed at this head and covered by the exact OpenAPI/Flutter
checks. App-flow task `01a0fd57-01ef-7124-b7c7-bddfd59410dd` owns reconciliation of
the shared client/profile and privacy-status/export lifecycle. Remaining work is
listed below; this branch remains implementation-only. No migration, configuration,
deployment or activation occurred at this checkpoint.

### Shared-file coordination record

Coordinate any remaining overlap work across these paths: `apps/lythaus-public-api/src/index.ts`,
`apps/lythaus-public-api/src/monthly-reputation-routes.ts`,
`apps/lythaus-public-api/src/monthly-reputation-report-export.ts`,
`apps/lythaus-public-api/tests/monthly-reputation-routes.test.mjs`,
`api/openapi/monthly-reputation.yaml`, `api/openapi/openapi.yaml`,
`api/openapi/dist/openapi.json`, `lib/generated/api_client/`,
`apps/lythaus-jobs/src/monthly-reputation-dsr.ts`,
`apps/lythaus-jobs/tests/monthly-reputation-dsr.test.mjs`,
`apps/lythaus-jobs/src/index.ts`, `packages/db/src/monthly-reputation-report.ts`,
`database/planetscale/proposals/monthly_reward_claims.sql`,
`lib/features/rewards/application/reward_providers.dart`,
`lib/ui/screens/rewards/monthly_reputation_widgets.dart`,
`lib/ui/screens/rewards/rewards_dashboard.dart`, and
`lib/ui/screens/profile/profile_screen.dart`.

The candidate API contract is `GET /api/reputation/me/reports/monthly/{sourceMonth}`
(JSON), its `/export.csv` sibling, and `GET /api/rewards/me/monthly`. Each request
derives owner identity from fresh server authentication, ignores caller-supplied
subject IDs, returns private/no-store data and reuses the stored report projection;
CSV remains formula-safe and omits raw evidence and ballot identity. The Data
Passport adapter reads that same owner-bound projection only after approval
configuration preflight. Coordination must select one privacy status and
export cooldown/expiry lifecycle, bind generated/client requests to the auth
session revision, and prevent stale rewards/report data on account change without
adding a duplicate Rewards route or a second report projection. Ordinary deletion
preserves earned points; only independent invalidation evidence may append a
correction. DSR collection/retention approval remains pending.

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
| Flutter | `lib/ui/screens/adaptive_shell.dart`, `rewards/rewards_dashboard.dart`, `profile/reputation_ledger_screen.dart`, reputation and reward providers/models | The branch candidate extends the existing Rewards/Profile surfaces and private report tracker. Exact-head Flutter analysis and the 20-case rendered auth/profile journey passed at `9d2e187`; the earlier scroll-helper failures were fixed and rerun successfully. The older Rewards snapshot/redemption providers still need the auth-session revision lifecycle fix; coordinate remaining profile/client work with app-flow |
| Contract | `api/openapi/openapi.yaml` and referenced `monthly-reputation.yaml`; `lib/generated/api_client/` | A candidate contract/client exists in the worktree for authenticated monthly report, CSV, rewards read and contextual review. Generated-client regeneration stays with app-flow until integration; see the exact path and contract proposal above |
| Privacy | Jobs `AccountExportWorkflow`, `AccountDeleteWorkflow`; `privacy.reconcile_subject_data_locations` | A candidate Data Passport adapter and proposal-only locator function expose the private report and optional contextual/fulfillment locators. End-to-end export/delete, privacy status, export cooldown/expiry and auth-session lifecycle remain incomplete; collection and retention approval remain pending |
| Database | `0000`–`0020` migrations; `0012_product_integrity_v2.sql`; `trust.policy_versions`, `trust.reputation_events`, `trust.reputation_profiles`, appeal assignments/votes/outcomes | Existing tables are authoritative; add period-specific revisions without relabelling old records |
| Resources | `infrastructure/lythaus-resource-registry.json` | Reuse existing three logical Workers, fresh Hyperdrives, outbox and queues; no new resource/cost approval is implied |

Read-only PlanetScale checks on 4 October confirmed `lythaus-core/main` is the
production branch, its migration ledger ends at
`0020_auth_recovery_delivery.sql`, and no monthly-reputation, monthly-reward or
community-appeal proposal relations are present. `system.feature_flags` has row
security disabled and contains only the unrelated
`identity.first_admin_bootstrap_consumed` row; the five relevant reputation/reward/
appeal flags have no live rows. The separate release and deployment workflows are
manual `workflow_dispatch` workflows, so merging does not deploy. This environment
has no Cloudflare runtime-inspection connector; deployed Worker variables were not
read. Code and tests verify missing configuration/schema fail-closed behavior, but
that does not certify a live mailbox, provider, or deployed Worker runtime.

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
| T03 Persistence | Canonical events/outbox, immutable period revisions, assurance proofs, ballot uniqueness, selections/claims | Immutable period revisions, canonical proofs, assemblies, snapshots/corrections, selections, private consent and synthetic QR/invoice fulfilment tested; live routes, providers and migration pending |
| T04 Earning | Real post/discussion/specialist/reception/authorship events and dependency reversals | Canonical post/comment producers, scoped contextual acceptance and final peer-ballot consumer tested with weekly caps and immutable corrections. Specialist/help/accessibility have calculator rules but no canonical task-acceptance service/event; reception refresh has no approved rating source/rubric. Do not substitute ticket closure, moderation, reactions, or authenticity-tool feedback. |
| T05 Security | Reuse normal validated auth events; capability-aware integrity, credential continuity, Turnstile/refresher | Existing email evidence, monthly assembly and a separately gated database-only renewal challenge/proof seam are tested in synthetic PostgreSQL. Renewal stores a token hash and bound-email digest, writes one proof/outbox receipt atomically, and preserves credentials; no route, email delivery or score activation exists. Full-month protection coverage is calculated. Turnstile/passkey/TOTP collection, D07/D08 and privacy approval remain gated. |
| T06 Peer review | Private timed electorate, equal ballots/history, close transaction, scoped override, restricted route | Public/admin routes, ballots/closure, scoped restoration, equal participation earning and private notices tested. Restricted-case safeguards are tested; accountable unresolved/specialist handling and D09/D10/D11/D13 activation and Flutter remain. |
| T07 Rewards/partners | Persistent Free/Premium/Black selections, proposals, consent/email linkage, QR/invoice idempotency | Current-month selections, private consent, scoped eligibility and transactional synthetic QR/invoice fulfilment tested; merchant API, external evidence, live terms and product wiring remain |
| T08 Flutter | Existing Rewards tabs, profile tracker, real contribution/review forms, complete states | The candidate extends the existing Rewards destination and Profile tracker, with server-driven private status/report/CSV reads and no client-side point mutation or duplicate route. Exact-head Flutter analysis and the 20-case rendered auth/profile journey passed at `9d2e187`. Account-switch invalidation for the existing Rewards snapshot/redemption providers, real action CTAs, public methodology links, accessibility and device acceptance remain incomplete. |
| T09 Reporting/privacy | Stored-calculation parity, full own report, public methodology, safe JSON/CSV, DSR/retention | The candidate includes authenticated owner-bound `GET /api/reputation/me/reports/monthly/{sourceMonth}` JSON and `/export.csv` reads plus `GET /api/rewards/me/monthly`, using fresh principal identity and private no-store responses. JSON/CSV and Data Passport share one server report projection. DSR preflights approved configuration and handles absent proposal relations; proposal locators include contextual review, dependencies and claim-fulfilment commands. Route/DSR/config unit tests passed 16/16; the seven-suite PostgreSQL run passed at exact head `9d2e187` (run `37168785849`), with detailed 167/167 counts available for prior head `ea4096dc` only. OpenAPI Dart normalization and report/DSR lock/locator tests passed in exact-head CI. End-to-end export/delete, post-deletion independent invalidation, privacy status/export cooldown/expiry, public methodology, collection approval and retention remain pending. |
| T10 Release | Shadow run, fairness/load/failure testing, approved cutover, exact-SHA release and rollback | No release or activation authorization |

The acceptance matrix in `docs/testing/monthly-reputation-acceptance.md` tracks
code and executable evidence separately. Passing arithmetic tests does not prove
provider operation, user workflows, migration or activation.

## Fixed monthly snapshots

`monthly_reward_snapshots.sql` is a disposable proposal, outside the production
manifest. The existing Jobs queue and scheduled reconciler read canonical assembly
and assessment evidence. A separately configured publisher writes an immutable
snapshot for the following calendar month. Original assessment rows remain shadow;
no assessment is promoted or rewritten. Confirmed publication requires a distinct
approved configuration, every D01–D13 approval reference, explicit first source
month and reviewed collection privacy prerequisite. No configuration is seeded.

UTC settlement uses the actual server clock, including database sessions in other
timezones. Source-period locking and SQL guards bind the latest source, matching
weekly/maintenance rules, canonical event, author, score and exact next month.
Current activity and later source revisions cannot continuously change a published
month. A fresh independent staff approval names the current snapshot revision,
target assessment, reason and private evidence reference. Its canonical outbox event
can append one correction while retaining every prior snapshot. Self-review,
revoked authority, wrong subjects, stale predecessors and request-key reuse fail.
Obsolete approved corrections drain with durable superseded receipts.

The own-reader distinguishes unavailable, pending, shadow and confirmed authority.
Missing previous assessment displays L1 as an unassessed default with no snapshot
or score; it does not fabricate confirmed entitlement. Future months and periods
before cutover are explicit pending/unavailable states. It remains an isolated
server reader until shared API, product report and privacy wiring is coordinated.

Node 22.23.3/disposable PostgreSQL 17 verify 19 cases with 99.35% line and 90.00%
branch coverage, including real publication → assembly → assessment → snapshot,
concurrent publication/correction, interruption rollback, non-UTC settlement,
paused queue/backfill, stale receipt denials and deletion races. Isolated subject
erasure also removes staff-authored correction notices before source cascades.
This is not complete export, locator, reviewer-retention or DSR acceptance.

## Persistent reward selections

`monthly_reward_selections.sql` is separately gated and remains outside the
production manifest. It stores immutable member selection revisions across months,
with full prior choices and command digests. Transactions lock the current UTC
source period, canonical active/verified member and actual subscription row, then
require the separately confirmed current-month snapshot. Client fields cannot set
level, tier, family, points or slot. A versioned approved offer supplies its family,
level and signed terms. A narrow database helper locks current availability without
granting the runtime permission to activate or update offers.

Free retains its earned profile level while accessing one selected family up to
L3. Premium can add one family/variant per earned-level slot, and cannot put an L5
variant into lower slots or the same family into multiple slots. Black requires no
selection and keeps earlier selection history. Historical selection policy review
does not block Black's current eligibility. Lower levels retain higher choices as
dormant. A multi-choice downgrade to Free requires an explicit retention choice;
switching, variant movement and transition/grace rules stay blocked pending D12.
No automatic monthly reset, point spending or quiet price change is introduced.

The own reader reports current profile level, reward access, selected/dormant
variants, retained history review and explicit pending authority. It is not wired
into the shared API or Flutter destination until app-flow coordination permits it.
Merchant proposal/approval, inventory, QR and invoice consumption remain separate
work; no live merchant is fabricated. Private linkage is described below.

Node 22.23.3/disposable PostgreSQL 17 verify 16 cases, 100% line / 96.15% branch,
including Free L5/L3, five distinct Premium slots, Black with legacy history,
lower-level paid denial, independently corrected L5→L2 dormancy, command races,
rollback/retry, fresh tier/offer/configuration changes and deletion before authority
reads. Higher-tier fixtures seed explicitly synthetic settled weekly totals before
the actual assembler, assessment and snapshot publisher. This proves the selection
transactions, not missing earning providers or the full product journey. Both
bounded independent source reviews clear the final fixes; native typecheck passes.

## Private partner consent and eligibility

`monthly_reward_partner_links.sql` and `monthly-reward-partner-links.ts` remain
outside the production manifest and shared product routes. Configuration supports
only disabled or explicitly synthetic fixture adapters, with separate privacy and
owner approvals. No live provider, credential or offer is created. Scoped active
merchant operators have no ordinary administrative powers.

Merchant invitation and member consent are separate transactions. Invitations use
opaque encrypted tokens, partner-scoped keyed email/customer fingerprints and a
private canonical recipient fingerprint/key version. The producer never queries
whether an invited address belongs to a member. SQL guards compare the invitation
recipient to a freshly locked canonical verified credential. Immutable consent
revisions bind the subject, merchant/customer/family, offer terms, exact email
verification timestamp and durable recovery generation. Canonical password-reset
events increment that generation in the original transaction; retention cleanup
cannot revive an old consent.

Lookups require the specific authorised partner, linked email, customer and offer.
Only linked email and effective reward level are personal response fields. Unknown,
unlinked, wrong-partner, recycled-address and invalidated-consent results are
generic unknown; missing adapter or valid but unsettled authority is pending.
Ordered member/source locks, fresh consent/standing/plan/offer checks and durable
command receipts cover races and retries. Consent withdrawal remains available
while scoring is paused or optional encryption keys are absent.

Disposable PostgreSQL 17 verifies 34 combined cases: 16 selection and 18 partner
cases, zero skipped. Coverage is 100%/99.05% for selections and 97.98%/86.81% for
partner links (line/branch). Tests include independent recipient guards, recovery
after actual audit-event purge, microsecond verification change, revocation during
lock waits with missing monthly authority, interruption rollback, queued deletion
without deadlock and expiry after the preliminary check. Subject erasure removes
consumed invitations and unused invitations matching the current credential.
Historical-email locators, export, retention, alternate merchant-email proof,
merchant JWT/POST wiring and complete DSR remain required before collection.

## Gated claim transactions

`monthly_reward_claims.sql` adds only an unseeded proposal. Claim rules require an
explicit approved synthetic adapter, collection privacy reference, approved partner
rules and signed usage terms. No default five-minute policy, merchant, inventory or
provider is created.

QR issuance uses one-time opaque random tokens, an encrypted replay copy and a
keyed token fingerprint. Online fulfilment rechecks account, email, plan, consent,
recovery generation, offer and confirmed fixed-month snapshot behind ordered
member/period locks. It records immutable fulfilment and command-source receipts,
enforces configured entitlement-month usage, then locks inventory. Expiry, current
UTC month and offer validity are rechecked after inventory waits. Stock decrements
only after successful fulfilment insertion, so a conflict-skipping duplicate does
not spend a unit.

Recurring invoice evidence can be inserted only by Jobs, against a live canonical
identity, linked consent and approved synthetic configuration. The fixture contract
pins a UTC renewal month. Natural idempotency binds partner, customer, reward family
and keyed invoice period. Replays preserve the first fulfilment and benefit record;
QR and invoice claims share a usage cap. External payment evidence, approved live
commercial terms and retries across the merchant API remain separate gates.

Claims add no points and do not change a monthly snapshot. Fulfilment, stock debit,
command receipt and outbox notice commit together. Subject erasure checks the
persisted partner lifecycle marker, deletes private claim data while paused, and
leaves other members' inventory unchanged. This does not complete DSR, export or
retention integration.

The combined disposable PostgreSQL 17 selection/partner/claim suite verifies 53
cases with zero skips: 16 selection, 18 partner-link and 19 claim cases. Coverage
is 100%/99.05% for selections, 97.98%/86.81% for partner links and 100%/91.53%
for claims (line/branch). It includes a real two-member shared invoice-period
collision, rejection of revoked/superseded/recovery-invalid consent before Jobs
accepts invoice evidence, retry/stock/outbox rollback and deletion races. Native
typecheck passes. Two bounded read-only reviewers found no remaining P1/P2 in the
claim source/digest and invoice-consent guards; they did not rerun the tests.
These are disabled/synthetic fixture transactions, not a live merchant workflow.

## Own stored report projection

`packages/db/src/monthly-reputation-report.ts` projects the latest stored source,
assembly and assessment for the current monthly policy. It preserves selected,
omitted, missing and unassessed weeks; weekly allowances and statuses; monthly
maintenance actions; quarterly-email validity; and source/effective-snapshot
correction history. The fixed next-month level authority is read separately from
the original assessment. A confirmed entitlement snapshot therefore never changes
the source report's `shadow` status. Missing assembly/assessment remains pending,
and catalogue or assessment-lineage mismatches fail closed. The response omits raw
evidence, observation and revocation identifiers, retaining only an evidence count;
per-action evidence-reference and locator handling remains pending privacy review.

The database reader filters its report query to the supplied subject ID, but it is
not an authenticated route and does not bind the caller to that ID itself. The
existing public API must pass a freshly authenticated owner's subject. Public
methodology, HTTP authorization/cache behavior, JSON/CSV generation and escaping,
export expiry, locator, DSR workflows, historical-policy report aggregation and
the collection-privacy approval remain pending app-flow coordination. The proposed
SQL only adds runtime SELECT grants for the isolated reader; it remains outside the
production migration manifest.

On 3 October, the combined disposable PostgreSQL suite passed 58/58 cases with no
skips. The report reader has 100% line / 92.71% branch coverage. Tests include
selected/omitted and missing weeks, separate shadow and confirmed authority labels,
approved corrections, absent/unassessed/deleted subjects, evidence-ID exclusion,
and corrupted catalogue/assessment lineage. Native typechecking passes, and one
bounded independent read-only review found no remaining P1/P2 after the status-label
correction. This is backend projection evidence, not export, route or DSR acceptance.

The monthly source writer accepts settled aggregate evidence from a trusted internal
caller. Scheduled monthly assembly joins settled weekly results and maintenance/email
evidence, then atomically writes the immutable source, private report and assessment
request. Real action evidence has stable contribution and week identities, with transactional
deduplication, revisions and scheduled settlement. Remaining proof provenance and DSR
workflow integration are required before production collection. A shadow result is
never a confirmed entitlement. Appeal eligibility now comes from fresh registered,
verified-account and scoped restriction checks, without reputation, subscription,
training or age gates. Final peer participation now feeds the separately gated D10
weekly allowance through canonical closure evidence and durable reconciliation.

## Maintenance and monthly assembly

`monthly_reputation_maintenance.sql` remains a disposable schema proposal. Ordinary
email verification records the consumed canonical token reference and a private
digest of the keyed email binding in the same authentication transaction. No email
address, token, password or client-supplied point value becomes scoring evidence.
Duplicate proof delivery uses a transaction lock and returns the original receipt.
Renewals replace validity rather than accumulating a component. An isolated,
separately gated database seam now handles renewal challenge issuance and one-use
consumption without changing the credential, password, session or original
verification timestamp. It stores only a token hash and email-binding digest; the
consumption transaction atomically writes one private maintenance observation and an
outbox receipt, with replay, expiry, credential-change invalidation and deletion
coverage. The current disposable PostgreSQL 17 maintenance/assembly run passes
18/18 cases, including five renewal/lifecycle cases; combined coverage is
99.20% lines and 87.34% branches, and the renewal module is 100% lines and 81.63%
branches. No public route,
email template/provider, Jobs subscriber, UI or scoring consumer sends or grants
anything from this seam. D08, DSR/locator review, collection approval and external
delivery remain required before integration or activation.

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
and await independently approved contextual acceptance. Source performance time determines week
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

## Final peer participation consumer

The existing Jobs queue and scheduled handler consume canonical standard appeal
closures through `monthly-peer-participation.ts`. A separate explicit environment
version, matching feature flag and immutable approved configuration are required.
The proposed 250-point weekly allowance remains D10 pending owner approval; no
configuration, approval, provider or flag is seeded by this branch. An absent flag
is inert even before the proposal is installed. A narrow database helper locks
the flag and reads a concurrent pause freshly without granting Jobs feature edits.

Only canonical valid final allow/retain revisions qualify. Both ballot directions
earn identically; recusal, cannot-assess, restricted cases and deleted subjects do
not qualify. Contributions retain the final cast's original week, including a
late closure across a month boundary. Private ballot choices and reasons do not
enter the weekly calculation. Closure copies the original PostgreSQL timestamp
directly, preserving microsecond provenance rather than rounding it in JavaScript.

An appeal-scoped receipt, participant evidence, complete weekly recalculations and
outbox revisions commit atomically. Duplicate or interrupted delivery cannot
partially fan out points. Scheduled reconciliation resumes events whose older
transport inbox completed while this collector was unavailable. New peer collection
does not freeze unrelated corrections to source periods before its collection start.
Retrospective invalidation and its accountable administration remain separate work.

Disposable PostgreSQL tests cover concurrent duplicate delivery, minority parity,
one weekly allowance across cases, changed final ballots, recusal, atomic rollback,
deletion between participant selection and insertion, fresh pause reads and
original cross-month assignment. With the contextual restoration regression, the
25-test appeal/participation suite has 100% line and 94.64% branch coverage, including
the shared canonical publication proof. These are
synthetic transactions and authenticated routes, not live activation or UI evidence.

## Scoped contextual acceptance

The existing admin Worker exposes a disabled-by-default context-review mutation.
An authenticated independent staff member supplies exact comment, thread and parent
revision identities, an explicitly configured rubric, a bounded private evidence
reference, expected review revision and UUIDv7 idempotency key. Author, ownership,
performance time, family, points and publication acceptance are derived from stored
server state. Client point fields, self-acceptance, revoked membership, changed
scope and mismatched rubric are rejected. Fresh actor/configuration locks and review,
outbox and immutable history writes share one transaction.

`monthly_reputation_context.sql` is a disposable proposal. Its environment version,
matching enabled flag, recorded rubric approval and reviewed collection privacy
prerequisite are all required; none are seeded. D05 and actual export/locator/DSR
approval remain pending. Canonical OpenAPI/generated-client updates and the product
review form require app-flow coordination. Reviewer retention and full DSR handling
are not approved by these isolated erasure tests.

Jobs consume only the stored review/outbox pairing. Late acceptance uses the original
week and recomputes whole totals. Latest reversed reviews cannot be resurrected by
old delivery. Parent/thread edits and independent moderation changes fan out through
durable per-source/per-comment receipts, including after physical child purge.
Ordinary soft or physical deletion alone preserves valid accepted work, even before
first Jobs delivery. Scoped publication proof also accepts an actual equal-vote
restoration without adding historical-policy points. Changed context or an independent
block still invalidates the retained proof and appends a correction.

Paused optional contextual backlogs do not starve ordinary publication. Assembly
refuses relevant unprocessed review/dependency evidence, including a mismatched or
unavailable replacement configuration, and pins the stored context version. Removing
an optional producer environment value cannot silently erase earlier accepted credit.
Unsupported older-version review events remain unreceipted for explicit resume under
their original approved version; they cannot occupy the ordinary reconciliation batch.
A fresh valid acceptance can supersede a prior contextual withholding or reversal
despite ordinary deletion before delivery, with the latest review identity retained.

Node 22.23.3 and disposable PostgreSQL 17 verify 20 contextual cases (98.94% lines,
90.26% branches), 25 appeals/participation cases (100%, 94.64%), 10 earning regressions
(92.07%, 80.45%) and 13 assembly regressions (98.76%, 89.91%). The actual authenticated
admin route and real five-vote restoration are exercised. These are scoped backend
evidence, not all 100 application cases, provider acceptance, Flutter completion or
live activation.

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
