# Current policy authority

Status: active documentation authority as of 11 October 2026; implementation,
deployment, certification and activation require separate evidence.

## Sources and precedence

This reconciliation starts from the [Lythaus repository](https://github.com/AsoraKK/Lythaus/) commit
`49cca9caa34b34c7ded7f4842792f698be9bd41f`. The owner decisions below were
provided in the delegated task from parent thread
`01a0f327-a7ab-771d-a745-2172db8580e6`. They are supplied authority, not a claim
that this lane retrieved the original conversations or verified live providers.
The parent retains the original decision evidence and independently reviews
merges and releases.

Later explicit owner decisions govern prospective policy. Dated implementation
checkpoints describe their named versions and evidence only. A file name such as
“v1” does not establish the runtime policy identifier. Historical cases, events,
ballots, reports and signed obligations retain their recorded policy version;
documentation reconciliation cannot migrate or relabel them.

This technical authority record does not amend public terms or community
guidelines. Public/legal wording stays at the reviewed baseline in this PR;
user-facing policy changes require separate deliberate legal review. Internal
task provenance and authority links belong in technical review records only.

## Version authority table

| Subject / version | Authority and scope | Implementation evidence at the baseline | Remaining gate |
| --- | --- | --- | --- |
| Historical reputation `reputation-v2.0.0` | Retained policy for records issued under this version; cumulative Level 0–5 and pillar gates | [Reputation Policy v1](reputation-policy-v1.md), [historical evaluator](../../packages/contracts/src/reputation-policy.ts) and [event catalogue](../contracts/reputation-event-catalogue-v2.json) | Preserve historical meaning; do not apply these gates to new monthly assessments by inference |
| Historical appeals `appeals-v1.0.0` | Five trained reviewers, weighted majority and required adjudication belong to this version | [Historical appeal contract](../../packages/contracts/src/appeal-policy.ts); historical operations in [admin runbook](../runbooks/admin-ops.md) | Historical cases stay on this version; no automatic cutover |
| Pinned historical monthly candidate `lythaus-monthly-rewards-2026-10-v1` | Dated v1 checkpoint, with a 13,500 source-month ceiling for this version only; operational defaults and activation remain separate | [Monthly implementation record](../architecture/monthly-reputation-2026-10.md), [calculator](../../packages/contracts/src/monthly-reputation-policy.ts), immutable [received catalogue](../../packages/contracts/policies/Lythaus_Monthly_Rewards_Action_Catalogue_v2.json) | Its rolling quarterly validity is superseded prospectively by the 7 October decision; this v1 record does not establish a prospective version's budget or current-quarter acceptance |
| New standard community appeals | Owner 2 October: timed community review, one equal vote per eligible member, no fixed trained panel, no Level 5 weight and no routine Editorial confirmation | [Candidate evaluator](../../packages/contracts/src/monthly-peer-appeal-policy.ts), [versioned access](../../packages/db/src/community-appeal-access.ts), [closure](../../packages/db/src/community-appeal-closure.ts) and canonical [OpenAPI fragment](../../api/openapi/community-appeals.yaml) already exist | D09 duration, quorum, extension and ballot conventions require separate approval; restricted/unresolved operations and activation remain gated |
| All prospective quarterly awards | Owner 7 October: calendar-quarter-end expiry, remaining months only, no earlier retroactive credit | Baseline [maintenance calculator](../../packages/contracts/src/monthly-maintenance-policy.ts) still contains the earlier rolling candidate; prospective v2 work is reported by the parent | Coordinate with the existing policy lane; do not duplicate it, rewrite signed v1, or claim the new expiry is implemented here |
| Pinned v1 accepted useful suggestion amendment | 150 points for one independently accepted useful suggestion per quarter; participation remains optional | [Pinned v1 suggestion amendment](../../packages/contracts/policies/Lythaus_Monthly_Rewards_Suggestion_Amendment_v1.json) leaves budget placement pending and retains the historical v1 ceiling of 13,500 | This is v1 evidence only. The parent is retrieving the later prospective owner authority; an unavailable decision is an evidence gap, not grounds to reject an approved v2 ceiling |
| Launch authentication | Owner 11 October: retain email/password; guest browsing remains read-only | [Authentication ADR](../architecture/email-guest-authentication-adr.md), [password policy](../../packages/contracts/src/password-policy.ts), canonical [OpenAPI](../../api/openapi/openapi.yaml) | Exact-candidate authentication acceptance remains separate from the product decision |
| Public publishing | Owner 11 October: withhold public posting until the complete publishing pipeline is validated | Existing submission, moderation, Jobs, disclosure and appeal contracts are implementation evidence | Validation and an explicit activation decision are required; deployment or successful submission does not grant public visibility |

## New cases and historical cases

Dispatch by the server-recorded policy version, never by reputation level,
subscription, client preference or a document's latest date. For new standard
cases, the approved direction is timed community review with equal votes and
no routine Editorial confirmation. Timing and quorum defaults are not settled
by that direction. Community review is an authenticated, private workflow;
equal voting does not make ballots, identities or raw evidence public.

Restricted legal and safety cases and unresolved outcomes require accountable
handling. The candidate routes restricted cases to restricted review and leaves
ties or insufficient quorum unresolved after the configured extension limit.
Do not invent a majority, use an administrator override, bypass safety, or infer
publication from a timer firing. The detailed restricted/unresolved route is an
operational approval question, not permission to impose Editorial confirmation
on every new standard case.

Historical `appeals-v1.0.0` cases retain their assigned reviewers, weights,
immutable votes and adjudication requirements. The candidate new-policy service
must not accept historical weighted ballots or silently replace an open old
case. Unknown or unsupported policy versions remain unresolved. Inspect the
case policy and supported contract before choosing any route.

## Quarterly validity and budget

The settled rule applies to **all quarterly awards**: expiry at the end of the
calendar quarter (31 March, 30 June, 30 September or 31 December), eligibility
only in its remaining months, and no earlier retroactive credit. An award earned
in November cannot credit October or continue into January. This is not rolling
three-month validity. Boundary timezone and source-month accounting details
must be explicit in the approved prospective contract; this document does not
invent them or change already signed historical records.

The pinned historical v1 signed catalogue and suggestion amendment remain
unchanged. Their 13,500 ceiling and unplaced 150-point field describe v1 only.
They do not set a ceiling for a prospective version. A later explicitly approved
v2 budget governs that version; missing evidence in this lane is not authority
to reject it. The parent is retrieving the exact later owner decision so the
prospective policy and its tests can be reconciled by their owning lane. Do not
infer a new budget from arithmetic or silently alter historical v1 records.
Never award points or entitlements from a client, ticket status, popularity or
unverified evidence. No monthly or quarterly feature is activated by this doc.

## Launch, identity and privacy

Email/password is the launch credential path, including verification, reset and
session revocation; guest access is read-only. Preserve application-generated
UUIDv7 IDs and fresh server identity derived from `JWT.sub`. Registration,
delivery acceptance, mailbox receipt and authenticated runtime acceptance are
distinct evidence. Keep existing secrets, privacy controls and auth boundaries.

Human/AI disclosure rules remain unchanged: human-authored contributions may
qualify; honestly disclosed AI-assisted text is limited to 249 normalized,
trimmed user-perceived Unicode characters and earns no authorship reputation;
AI-generated public content is blocked. Model output alone cannot publish,
enforce, grant reputation or resolve appeals. Private evidence, scores, ballots,
names, contact data and raw content must stay out of public surfaces and logs.

Public posting stays withheld until the complete pipeline is validated. The
validation packet must cover authenticated intake and identity binding,
declaration and media handling, moderation and review, durable Jobs/outbox
processing, permitted final visibility and cache isolation, notifications,
policy-versioned appeal effects, privacy/export/deletion, and rollback. Include
positive, rejected, stale, replay, retry/concurrent and interrupted paths on
synthetic fixtures. This document defines a review boundary and changes no flag,
runtime policy or provider resource.

The delegated evidence reports release 108 deployed six components at the known
reviewed source and passed production smoke. It also reports that final manifest
verification was blocked by GitHub authentication and a supplied external audit
reported an uncertified manifest. This lane did not retrieve that manifest or
audit. Owner-test deployment and smoke are not production-authentication,
detection or complete publishing certification; certification remains unverified.

## Resources and local validation

Use existing Workers Paid and the approved resources in the
[resource registry](../../infrastructure/lythaus-resource-registry.json), with
no additional paid resources. Logical production targets and physical `-dev` /
`-development` names are distinct; those suffixes do not authorize test writes.
Wrangler and target isolation belong to the separate configuration lane.

PlanetScale `lythaus/lythaus-core/main` is the production-only database baseline.
Use disposable local PostgreSQL 17 and synthetic fixtures for database tests.
The dated registry relation count is a snapshot, not today's schema contract;
use the approved [migration manifest](../../scripts/ci/planetscale-migration-manifest.mjs)
and authorized read-only evidence. Do not recreate hosted development branches,
apply proposals to `main`, run production DDL/grants, alter access or credentials,
rename/delete resources, weaken security, deploy or activate features in this lane.

Firebase Core, Messaging and Crashlytics are inventoried separately in the
[mobile provider scope record](../security/firebase-mobile-purpose-inventory.md).
Their dependencies and retained build credential purpose do not establish a
fully approved Cloudflare-first exception or provider retention/privacy terms.
An unspecified plaintext credential attachment is unverified evidence; do not
retrieve, reproduce or treat it as authorization for new access.

## Parent / owner-only unresolved evidence

- Exact later prospective budget authority, including the reported 13,650 v2
  decision, is being retrieved by the parent. Its absence here does not reject
  that decision or apply historical v1's ceiling to v2. Reconcile version-specific
  placement, source-month effect and acceptance rubric with that evidence.
- Exact reviewed prospective quarterly implementation/PR and policy identifier;
  no such v2 ref was present in the authorized local refs. Existing merged PR896
  (`6599418923d39088af836bff08785d7f3ff5a15a`) supplies the earlier candidate.
- D09 operational defaults, restricted/unresolved accountability, historical open
  case handling and all activation dates/flags remain separate approval work.
- Firebase exception scope, privacy terms, data retention and deletion evidence.
- Current remote source/check identity, release manifest, auth/detection and
  complete publishing acceptance. Known GitHub 401/403 boundaries remain blocked;
  do not retry denied operations or use alternate credentials/routes.

The appeal direction, email/password launch decision and calendar-quarter-end
rule are settled and do not require another owner decision.
