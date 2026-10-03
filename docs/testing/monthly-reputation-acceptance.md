# Monthly reputation acceptance matrix

Historical source baseline: `8c4261402dd370b4c57e082cf0fc16b41927f7db`. Policy:
`lythaus-monthly-rewards-2026-10-v1`. This is the complete set of 100 required
acceptance cases from the October task sheet, not a claim that 100 tests pass.
Owner decisions D01–D13 and runtime activation remain pending. The catalogue's
embedded reference-validation counts are not execution evidence for this branch.

## Rebased verification snapshot — 3 October 2026

Live remote main at the 3 October read-only check is
`42d1f26ba9852cdabb8f7f90b4d0223c0344a3e6`; local `origin/main` remains at cached
`ae5cb81b62334c7fea7f0770cea0316aa11063bb`. The comparison adds eight release-gate
files only; package manifests and the lockfile are unchanged. This local candidate is
based on cached `ae5cb81` pending Friday's integration coordination. Published
PR896 head is still `9a98d462082529c1b08216ae666ac7534120dbd4`; it shares only the
`8c426140` base with this rebased local candidate and is not an ancestor of
`ca210051`. No force-push or merge was made. The local candidate contains
security release 89
(`6d1d52a4fa3f51ae041fbf38b5724578a8596b61`), PR908's dependency repair
(`8d91bcb434c4960a0f51ee2e4c7563c4f6e88a6c`) and the app-flow PR899/901/902/904/905
changes. Latest local implementation commit is `7cdd6e33682e3370bc67ab292805298a3e38d37f`;
the shared contract fragment/assertion remain uncommitted. The committed
contract follow-up is `ca210051dbaa36be5b0725c54b391fff446f0d9a`.
The full backend PostgreSQL run below was executed at its code parent
`1136c226bffefcd6b963cd7f403efb8d7b5b265c`; `ca210051` adds only the contextual
review OpenAPI fragment/bundle and contract assertions, not earning, privacy or
reward transaction code.

| Check | Exact evidence |
| --- | --- |
| Disposable PostgreSQL 17.11 | Baseline 154 passed, zero skipped across shadow 9, earning 10, contextual acceptance 20, appeals/participation 25, maintenance/assembly 13, snapshots/corrections 19 and selections/partner/claims/report 58 at `1136c226`. On the current worktree, maintenance/assembly then passed 18/18, zero skipped, including five disabled renewal/lifecycle cases; combined coverage is 99.20%/87.34%, and renewal-module coverage is 100%/81.63% (lines/branches). These are separate revisions, not one combined run. Synthetic source rows, approvals and providers only. |
| OpenAPI and native contracts | At committed `ca210051`, `openapi:lint`, `openapi:bundle`, `openapi:check:bundle`, `openapi:validate:examples`, `openapi:test:contract`, and `typecheck:native` passed; Contract Jest had 40 passed, 17 skipped, 4 suites passed and 1 suite skipped. The current worktree has a separate unbundled response-description edit in `api/openapi/monthly-reputation.yaml`; its new parity assertion currently fails because `api/openapi/dist/openapi.json` has not been regenerated. App-flow/Friday coordination is pending before that shared bundle update. Lint has two inherited warnings: `EmailAuthRequest`'s `mode` schema and the single-schema `PrivacyRequestAccepted` `allOf`. |
| Dependency audit | A fresh `npm audit --audit-level=low` on the current candidate worktree reports zero vulnerabilities. `package.json` and `package-lock.json` match cached main; the live-main delta is release-governance only. The dependency tree resolves Spectral's `fast-glob` import to the private local adapter and does not include the reported `micromatch`/`braces` chain. No suppression or duplicate security task was added; Dependabot alert #330 remains unclassified. |
| Spectral regression | `node --test scripts/tests/spectral-glob.test.mjs` passed 2/2 with local subprocess execution enabled. `npm run openapi:lint` passed with the two inherited warnings above. |
| Bounded independent review | Read-only reviews of claims, report projection, contextual-review contract and the disabled renewal seam found no remaining P1/P2. Reviewers did not rerun tests. |
| Not established | No exact-head remote CI result is claimed here; no live mailbox/provider acceptance, complete 100-case workflow run, Flutter/report/export/DSR integration, load test, migration, deployment, configuration or activation is claimed. |

The earlier synthetic auth-journey run `37044669047` failed when the test relay did
not observe its synthetic password-change notice; dependent coordinator/alpha
checks were skipped. The later PostgreSQL run `37118705848` passed at its own
revision, resolving that synthetic outbox issue only there. Neither result proves a
live email failure or live mailbox acceptance, and neither provides evidence of a
rewards regression.

All 100 original IDs below remain mapped to executable evidence or an explicit
gate. Do not describe that matrix as 100 acceptance workflows passed.

## Evidence paths

- M: [monthly calculation](../../packages/contracts/src/monthly-reputation-policy.ts).
- CP / CPT: [content declaration and normalized grapheme policy](../../packages/contracts/src/content-policy.ts) / [boundary and Unicode tests](../../packages/contracts/tests/critical-content-policy.test.mjs).
- D: [pending decisions and proposed calendar/email rules](../../packages/contracts/src/monthly-reputation-decisions.ts).
- A: [candidate equal-vote evaluator](../../packages/contracts/src/monthly-peer-appeal-policy.ts).
- P: [shadow persistence](../../packages/db/src/monthly-reputation.ts).
- J: [invoked Jobs adapter](../../apps/lythaus-jobs/src/monthly-reputation.ts), dispatched from the existing Jobs queue handler.
- SQL: [proposed shadow schema](../../database/planetscale/proposals/monthly_reputation_shadow.sql), outside the approved production manifest.
- MT: [monthly policy tests](../../packages/contracts/tests/monthly-reputation.test.mjs).
- AT: [candidate appeal tests](../../packages/contracts/tests/monthly-peer-appeal.test.mjs).
- PT: [PostgreSQL 17 integration tests](../../apps/lythaus-jobs/tests/monthly-reputation.postgres.mjs).
- W: [candidate weekly action calculation](../../packages/contracts/src/monthly-earning-policy.ts); WT: [weekly policy tests](../../packages/contracts/tests/monthly-earning.test.mjs).
- E: [canonical source persistence](../../packages/db/src/monthly-earning.ts) and [Jobs producer/reconciler](../../apps/lythaus-jobs/src/monthly-earning.ts); ET: [real-source PostgreSQL tests](../../apps/lythaus-jobs/tests/monthly-earning.postgres.mjs).
- ES: [proposed earning schema](../../database/planetscale/proposals/monthly_reputation_earning.sql), outside the production manifest.
- C: [private appeal access](../../packages/db/src/community-appeal-access.ts), [mutations](../../packages/db/src/community-appeal-mutations.ts), [closure](../../packages/db/src/community-appeal-closure.ts), invoked by the existing public/admin/Jobs Workers.
- CT: [real PostgreSQL and authenticated route tests](../../apps/lythaus-public-api/tests/community-appeals.postgres.mjs); CS: [proposed appeal schema](../../database/planetscale/proposals/community_appeals.sql).
- DT: [generated-client serialization tests](../../tests/contract/dart/community_appeal_serialization_test.dart.fixture), copied into the generated package by its validation script; the fixture suffix keeps generated-package dependencies out of the product Flutter analyzer.
- H / HT: [maintenance calculation](../../packages/contracts/src/monthly-maintenance-policy.ts) / [maintenance tests](../../packages/contracts/tests/monthly-maintenance.test.mjs).
- B / BT: [canonical proof capture](../../packages/db/src/monthly-maintenance.ts), [monthly assembly](../../packages/db/src/monthly-assembly.ts), [scheduled reconciler](../../apps/lythaus-jobs/src/monthly-assembly.ts) / [real PostgreSQL tests](../../apps/lythaus-jobs/tests/monthly-assembly.postgres.mjs).
- BR: [disabled email-renewal proof seam](../../packages/db/src/monthly-email-renewal.ts), [separate renewal proposal](../../database/planetscale/proposals/monthly_email_renewal.sql), and five renewal/lifecycle cases in BT. Proposal remains outside the production manifest; no public delivery or scoring consumer is connected.
- BS: [maintenance, assembly and lifecycle proposal](../../database/planetscale/proposals/monthly_reputation_maintenance.sql), outside the approved production manifest. Collection privacy prerequisite is unset until export/locator integration review.
- V / VS: [final peer participation consumer](../../packages/db/src/monthly-peer-participation.ts), [invoked queue/scheduled adapter](../../apps/lythaus-jobs/src/monthly-peer-participation.ts) / [separately gated proposal](../../database/planetscale/proposals/monthly_reputation_peer_participation.sql); CT verifies the real closure-to-weekly-result path.
- X / XT / XS: [scoped contextual review](../../packages/db/src/monthly-context-review.ts), [dependency reconciliation](../../packages/db/src/monthly-context-dependencies.ts), [authenticated admin mutation](../../apps/lythaus-admin-api/src/monthly-context-review.ts) / [20 real PostgreSQL cases](../../apps/lythaus-jobs/tests/monthly-context.postgres.mjs) / [separately gated proposal](../../database/planetscale/proposals/monthly_reputation_context.sql). CT additionally verifies actual equal-vote restoration through the admin route and retained publication proof.
- S / ST / SS: [fixed snapshot and correction transactions](../../packages/db/src/monthly-reward-snapshots.ts), [invoked queue/reconciler](../../apps/lythaus-jobs/src/monthly-reward-snapshots.ts) / [19 real PostgreSQL cases](../../apps/lythaus-jobs/tests/monthly-reward-snapshots.postgres.mjs) / [separately gated proposal](../../database/planetscale/proposals/monthly_reward_snapshots.sql). Confirmed fixtures require explicit synthetic approvals; deployed configuration remains absent.
- R / RT / RS: [persistent selections and own reader](../../packages/db/src/monthly-reward-selections.ts) / [16 real PostgreSQL cases](../../apps/lythaus-jobs/tests/monthly-reward-selections.postgres.mjs) / [separate selection and signed-offer proposal](../../database/planetscale/proposals/monthly_reward_selections.sql). Higher-tier sources are labelled settled-total fixtures consumed by the actual assembly/assessment/snapshot pipeline; missing earning providers are not proved.
- L / LT / LS: [private partner linkage and scoped eligibility](../../packages/db/src/monthly-reward-partner-links.ts) / [18 additional real PostgreSQL cases](../../apps/lythaus-jobs/tests/monthly-reward-partner-links.cases.mjs), registered in RT / [disabled/synthetic-only partner proposal](../../database/planetscale/proposals/monthly_reward_partner_links.sql). Public merchant routes, QR/invoice fulfilment and full privacy lifecycle remain pending.
- Q / QT / QS: [synthetic QR/invoice claim consumer](../../packages/db/src/monthly-reward-claims.ts) / [19 additional PostgreSQL cases](../../apps/lythaus-jobs/tests/monthly-reward-claims.cases.mjs), registered in RT / [unseeded claims proposal](../../database/planetscale/proposals/monthly_reward_claims.sql). No merchant route or live invoice provider is connected.
- RP / RPT: [isolated stored-report reader](../../packages/db/src/monthly-reputation-report.ts), [CSV serializer](../../apps/lythaus-public-api/src/monthly-reputation-report-export.ts) / [six PostgreSQL report cases](../../apps/lythaus-jobs/tests/monthly-reputation-report.cases.mjs), registered in [the combined selection/partner/claim/report suite](../../apps/lythaus-jobs/tests/monthly-reward-selections.postgres.mjs). Owner-bound HTTP routes, public methodology, CSV download wiring and DSR lifecycle remain unimplemented pending app-flow coordination and privacy approval.

A unit-verified row establishes only the named calculation. A partial row still
requires the remaining application, privacy, provider or release work. No new
policy is activated, no production migration is applied, and no desktop/mobile
screenshot is claimed: the Flutter/API reporting slices are pending.

## Requirements to implementation and tests

| ID | Required acceptance case | Code / test evidence | Status and limits |
| --- | --- | --- | --- |
| CAL-01 | Exactly four eligible weekly results sum normally; no missing-month carry. | M, B, S / MT, BT, ST | Authoritative assembly and separate fixed snapshot verified; UTC settlement also tested in positive/negative database timezones; activation pending |
| CAL-02 | Five results select the highest four complete totals; the fifth remains reported. | M, E, B / MT, ET, BT | Real publication + email assembly and stored omitted week verified; product report pending |
| CAL-03 | Selection never combines best values from different weeks per action. | M, B / MT, BT | Whole server week totals assembled and assessed; activation pending |
| CAL-04 | Every month over at least a 40-year calendar range has four or five closing Sundays under D01. | D / MT | Candidate D01 unit verified; approval pending |
| CAL-05 | A cross-month week has one owner; edge-day events never earn in two months. | D, V / MT, CT | Candidate D01 plus late final ballot revision across Sunday/Monday verified in PostgreSQL; approval pending |
| CAL-06 | August 2026 has closes on 2, 9, 16, 23 and 30; 31 August belongs to the next closing week under D01. | D / MT | Candidate D01 unit verified; approval pending |
| CAL-07 | Leap February, year boundaries, local daylight-saving changes and UTC cutoffs remain correct. | D / MT | Candidate D01 unit verified; approval pending |
| CAL-08 | Tied scores have deterministic selected-week ordering. | M / MT | Unit verified; live earning not integrated |
| CAL-09 | New/partial source months do not fabricate missing weeks. | M, B / MT, BT | Account/collection cutoffs, explicit absent weeks and >50-event drain verified; activation pending |
| CAL-10 | The 11,700 best-four example produces L5 only in the next month. | M, P, J, S / MT, PT, ST | Exact arithmetic example unit-tested; separate server snapshot verifies next-month assignment from real publication; full example product journey pending |
| CAL-11 | Month A 8,900 produces month B L4; month B 12,150 produces month C L5. | M, P, J, S / MT, PT, ST | Exact examples unit-tested; snapshot scope and future-month refusal verified; full two-month product journey pending |
| CAL-12 | Current-month progress cannot upgrade/downgrade the already-confirmed current-month level. | M, P, J, S / MT, PT, ST | Server snapshot remains fixed through later activity/source correction; only independently approved correction appends history; unassessed/future/cutover states tested; UI pending |
| CAL-13 | Maximum allowed components total 13,500; out-of-range components are rejected. | M / MT | Unit verified; live earning not integrated |
| CAL-14 | Every threshold neighbour 999/1,000, 2,999/3,000, 5,999/6,000 and 9,999/10,000 maps correctly. | M / MT | Unit verified; live earning not integrated |
| CAL-15 | No age, plan, World or old pillar gate changes the new score-derived level. | M / MT | Unit verified; live earning not integrated |
| CAL-16 | Email proof expiry at the exact cutoff and a new proof after cutoff are handled correctly. | D, H, B / MT, HT, BT, BR | Actual initial verification/paused capture/revocation and historical cutoff verified; disabled renewal transaction covers one-use, replay, expiry, binding change, pause and erasure. Public API/delivery and D08 approval remain pending |
| CAL-17 | Calendar-month addition handles 29/30/31-day dates without unapproved 90-day substitution. | D, H / MT, HT | Calendar validity candidate verified; D08 activation pending |
| CAL-18 | A weekly correction reselects all candidates; the previous fifth can enter the chosen four. | M, E, B, S / MT, ET, BT, ST | Real independent invalidation reassembles and reselects the fifth; approved scoped snapshot correction retains old reports/levels; obsolete approval drains durably |
| CAL-19 | On-time evidence approved late retains its performance period and audited correction path. | M, E, B, X / MT, ET, BT, XT | Late scoped acceptance retains original week; actual assembly refuses undrained/mismatched contextual configuration and drains the stored version; specialist acceptance pending |
| CAL-20 | End-of-month job replay, overlap and restart cannot publish duplicate entitlements. | P, J, B, S / PT, BT, ST | Atomic assembly and separate snapshot queue/reconciliation replay, concurrent publication and outbox rollback verified; partner claim consumer and activation pending |
| PTS-01 | Three accepted human posts award 250 once; two do not; six do not award 500. | W, E, ES / WT, ET | Shadow producer and concurrent real-source transactions verified; activation pending |
| PTS-02 | Duplicate, generated, disallowed or self-manufactured content cannot satisfy a contribution milestone. | W, E / WT, ET | Exact duplicate, generated/disallowed publication and self-approval checks verified; broader manipulation adjudication pending |
| PTS-03 | A short meaningful comment can qualify without a word-count or formal-language gate. | W, E, X / WT, XT, CT | Actual short stored comment independently accepted and credited, including peer-restored publication and deletion before Jobs; D05 rubric approval and product form pending |
| PTS-04 | Own and other discussion classification cannot double-count the same actor/thread context. | W, E, X / WT, ET, XT | Stored ownership, one primary work and shared contextual allowance verified under concurrent retries; D05 activation pending |
| PTS-05 | A member with no replies has the approved meaningful-follow-up route, not invented peer activity. | W, X / WT, XT | Actual own-thread follow-up accepted through server review without fabricated replies; D05 rubric approval and product form pending |
| PTS-06 | Source and correction share 300; splitting UI rows cannot raise the family cap. | W / WT | Candidate calculation and shared cap verified; canonical specialist task intake, independent acceptance and dependent correction producer remain pending D04 and their task-source contract |
| PTS-07 | Help and accessibility share 250, with the same concurrency protection. | W / WT; ticket amendment F01 | Candidate shared-cap calculation verified; task acceptance/concurrency producer remains pending D04 and a canonical task source. F01's separate suggestion award remains unscored with budget/source placement unresolved |
| PTS-08 | Self-acceptance, repeated trivial corrections and reciprocal task farming are held/rejected with evidence. | X / XT, CT; ticket proposal F01 | Context self-acceptance/fresh revoked staff/forged points refused; immutable bounded evidence and reversal verified; specialist task moderation and reciprocal-farming safeguards need the task service/reviewer contract; ticket acceptance remains owned by its separate workstream |
| PTS-09 | Four distinct approved families award breadth 150 once; five/six do not stack it. | W / WT | Configurable D03 candidate verified; source integration and activation pending |
| PTS-10 | Two alternatives in one family count as one breadth family; reactions/security are not families. | W / WT | Candidate calculation verified; full product flow pending |
| PTS-11 | Reversing a supporting contribution recalculates breadth and other dependent components. | W, E / WT, ET; ticket amendment F01 | Candidate dependent recalculation and publication corrections verified; specialist/ticket integration pending |
| PTS-12 | No posts does not count as 100% human authorship. | W / WT | Empty evidence earns zero; candidate calculation verified |
| PTS-13 | Permitted AI-assisted participation can earn compliance but no primary human-authorship award. | W, E / WT, ET | Real publication source and candidate calculation verified; broader workflows pending |
| PTS-14 | Honest permitted assistance does not erase unrelated human-authored evidence. | W, E / WT, ET | Real publication source and candidate calculation verified; broader workflows pending |
| PTS-15 | Normalised grapheme counts at 249/250, combining marks, emoji and segmentation evasion are tested. | CP / CPT | NFC normalization, combining sequences, ZWJ emoji, the 249/250 assisted-content boundary and conservative no-Segmenter fallback are tested; this is character policy evidence, not an earning award |
| PTS-16 | Generative media and material generative edits remain blocked; genuine media remains feature-gated. | T02/T04 | Text `ai_generated` publication is blocked by CP/CPT; generated-media/material-edit classification and genuine-media provider path are absent and remain feature-gated pending provider and privacy approval |
| PTS-17 | Emoji emotions are not blindly interpreted as author approval or disapproval. | T02/T04 | Unicode counting treats emoji as graphemes, but no reception classifier consumes emoji sentiment; reaction/reception source and this semantic regression test remain pending D06/privacy approval |
| PTS-18 | Small/no feedback samples are insufficient evidence, not guilt or automatic negative points. | W / WT | D06 candidate calculation verified; helpfulness collection/fairness validation pending |
| PTS-19 | One actor, related-identity abuse and coordinated voting cannot inflate reception; shared IP alone is insufficient for exclusion. | T02/T04 | No reception-rating source or approved related-identity evidence contract is connected; coordinated-abuse controls remain pending D06/privacy review, and shared IP alone is not used as an exclusion rule |
| PTS-20 | Zero reception still leaves a mathematically valid 10,500 maximum through other families. | M / MT | Arithmetic verified; real opportunity/access validation pending |
| SEC-01 | Forged client award, local-unlock flag and manipulated device clock never credit points. | M, P, J, SQL / MT, PT | Partial: shadow persistence verified; full product flow pending |
| SEC-02 | Turnstile token replay, wrong action/hostname, expiry and cross-account reuse fail safely. | T05 | Planned; no test execution claimed |
| SEC-03 | An already validated normal challenge event may satisfy the monthly award without replaying its token. | T05, B / BT, BR | Ordinary email-verification evidence capture and the disabled DB-only renewal transaction are tested; no renewal delivery or scoring consumer is connected, and other auth-provider flows remain pending |
| SEC-04 | Challenge/provider failure becomes retry/pending rather than clearance or misconduct. | T05 | Planned; no test execution claimed |
| SEC-05 | Native WebView challenge works with controlled origins, accessibility and supported session persistence. | T05 | Planned; no test execution claimed |
| SEC-06 | Passkey origin/RP, challenge, signature, verification and replay checks are enforced. | T05 | Planned; no test execution claimed |
| SEC-07 | TOTP seed handling, rate limits, replay protection and recovery paths are tested. | T05 | Planned; no test execution claimed |
| SEC-08 | Full-month protection history is checked; last-day enrolment is not full-month maintenance. | H / HT | Coverage, gaps, expiry and credential-matched authentication calculated; actual protected-auth provider remains disabled |
| SEC-09 | Credential removal/readdition, app reinstall and changed email cannot double credit. | H, B, BS / HT, BT, BR | Email change/removal/revoke/duplicate capture and renewal token/owner binding verified; renewal never mutates credential state. Protected-auth and reinstall flows pending |
| SEC-10 | Multiple biometric/PIN methods do not generate separate 1,000-point awards. | H / HT | Fixed non-stacking coverage calculation verified; no raw biometric/PIN capture or active provider |
| SEC-11 | A valid multi-factor credential may satisfy both policy conditions without claiming two personhood proofs. | H / HT | One server-evidence fixture satisfies 250 + 1,000 conditions; real provider assertions pending |
| SEC-12 | A dormant/unobserved account is not automatically integrity-cleared. | H / HT | Distinct eligible/pending/insufficient/ineligible states verified; rubric/provider approval pending |
| SEC-13 | Missing Enterprise bot capabilities are explicit; no fabricated bot-score field. | H, B / HT, BT | Default unavailable capabilities appear in assembled report; live provider verification pending |
| SEC-14 | A VPN, shared household IP, assistive tool or one challenge failure cannot independently ban a member. | T05 | Planned; no test execution claimed |
| SEC-15 | Proportionate holds expire or escalate through audited states and have a recovery path. | T05 | Planned; no test execution claimed |
| SEC-16 | No raw biometric, device PIN, secret, email or content body enters operational logs. | T05 | Planned; no test execution claimed |
| APP-01 | A Level 1 Free member and Level 5 Black member each cast weight exactly 1. | A, C, CS / AT, CT | Backend verified: weight-one constraint and no plan/level inputs; activation and UI pending |
| APP-02 | Editorial status adds neither another ballot nor a routine confirmation requirement. | A, C / AT, CT | Backend verified: direct community closure, no Editorial confirmation |
| APP-03 | More than five eligible peers can vote; quorum is not a fixed panel size. | A, C / AT, CT | Backend verified: twelve real eligible voters, no assignment ceiling |
| APP-04 | Guest, author self-vote, proven controlled duplicates and relevant conflicts are handled correctly. | A, C / AT, CT | Backend verified: JWT, verified email, ownership/conflicts, stored scoped restrictions and fresh closure checks; restriction administration remains |
| APP-05 | Eligible low-reputation users are not excluded by old trained-panel or reputation gates. | A, C / AT, CT | Backend verified using newly registered voters without reputation/training records |
| APP-06 | Ballot retries/concurrent writes obey one logical voter/case key; edits do not multiply votes or awards. | C, V, CS, VS / CT | Logical ballot uniqueness, concurrent CAS, final-revision earning, receipt replay and one weekly allowance verified; D10 activation pending |
| APP-07 | Live totals and voter identities are hidden; only authorised safe case evidence is served. | C / CT, DT | Real public/admin routes, private cache headers, redaction, own-only ballot and paused access verified; Flutter pending |
| APP-08 | Votes before/at/after close follow one boundary convention under simultaneous close jobs. | A, C / AT, CT | Exact policy boundaries, final database clock predicate and concurrent closure retries verified |
| APP-09 | Quorum, strict majority, ties and no-quorum extension use the approved default version. | A, C, CS / AT, CT | Configured rules and missing-approval denial verified with synthetic approvals only; D09 remains pending |
| APP-10 | A majority in a standard case resolves without an invisible Editorial veto. | C / CT | Actual scheduled Worker resolves and applies allow/retain atomically without confirmation |
| APP-11 | Unresolved after extension is not automatic author guilt or automatic publication. | C / CT | One configured extension, private notices and unresolved result verified; D11 accountable follow-up remains |
| APP-12 | Sensitive/illegal material follows restricted review and cannot leak through peer preview/media endpoints. | C / CT | Restricted cases denied peer evidence/votes/queue and ordinary staff evidence; specialist/media handling needs D11 |
| APP-13 | A valid minority ballot earns the same participation award as a valid majority ballot. | C, V / CT | Canonical closure awards both sides 250 under the gated D10 candidate; no choices/reasons enter weekly reports; activation pending |
| APP-14 | A changed ballot is one contribution; skip/recusal does not cause a penalty. | A, C, V / AT, CT | Final revision earns once in its original week; recusal/cannot-assess earn zero without penalty; D10 activation pending |
| APP-15 | No available cases is a neutral opportunity status; no fake production practice awards. | C / CT | Real empty queue returns no_case_available; no practice award producer |
| APP-16 | Overturning a decision reverses only linked consequences and is idempotent. | C, E, X / CT, XT | Scoped restoration and monthly earning correction verified, including failure rollback and retained context proof after purge; historical consequence reconciliation remains D13 |
| APP-17 | The same model output cannot immediately undo a scoped peer overturn on unchanged evidence. | C / CT | Stored source/content/classifier scope and actual Jobs replay guard verified; changed evidence does not match the override |
| APP-18 | Allow does not override a separate lawful safety hold, content deletion, unrelated sanction or media launch gate. | C / CT | Independent decision, changed/deleted text, parent-post block and generated-content prohibition verified; media route unactivated |
| APP-19 | Old-policy cases never mix weight-two ballots into the new equal-vote evaluator. | A, C / AT, CT, DT | Historical reads/serialization preserved; old open cases refused new-policy replacement pending D13 |
| APP-20 | Moderation/author decisions and ballot histories remain auditable after allowed redaction/retention handling. | C, CS / CT | Immutable history and frozen packet verified; full DSR/retention workflow integration pending |
| PAR-01 | Free L5 remains profile L5 but has at most L3 access for its one selected reward family. | R, Q / RT | Confirmed current snapshot and selection limit fixture claims to L3 while profile remains L5; product/provider flows pending |
| PAR-02 | Premium cannot obtain five L5 slots; plan/level changes preserve dormant selections correctly. | R, S / RT, ST | One exact variant-level slot/family, retained downgrade choices, Black independent of old selection policy and approved level-drop dormancy verified; D12 switching/grace and product journey pending |
| PAR-03 | Simultaneous claims/selections cannot exceed slot, inventory or usage limits. | R, Q / RT | Concurrent selection CAS, two-operator last-stock race, atomic decrement and shared QR/invoice cap verified |
| PAR-04 | Month B entitlement comes from month A, not month B projection. | S, R, Q / ST, RT | Selection and synthetic claims require confirmed current-month snapshot; level correction invalidates an L3 QR |
| PAR-05 | An authorised linked-email lookup works; unknown, unlinked and other-partner addresses cannot enumerate members. | L / LT | Scoped authorised lookup, generic unknown, canonical recipient guards, keyed email/customer isolation and persisted rate allowance verified; merchant JWT/POST journey pending |
| PAR-06 | Response contains no points, security method, case history or private content. | L / LT | Exact minimal response fields verified; public merchant API wiring pending |
| PAR-07 | Email change, consent revocation, recovery and recycled addresses cannot inherit the wrong link. | L / LT | Email/recovery/microsecond changes, audit purge, pause-safe withdrawal, wrong recipient and revocation race with missing assessment verified; alternate merchant-email proof and full historical privacy lifecycle pending |
| PAR-08 | Recurring invoice retries fulfil once; five-minute QR claims are online-validated and single use. | Q / QT | Encrypted opaque online QR, single consume, configured short expiry, natural-period invoice retry, atomic stock/usage, expiry after inventory wait and rollback verified with synthetic adapters; five-minute policy remains pending D12 |
| PAR-09 | An outage returns unknown/pending, not a silently removed discount or full-price charge. | L / LT | Missing adapter/keys and valid unsettled authority return pending; invalidated consent stays generic unknown; real fulfilment/outage/price protection pending |
| PAR-10 | Proposed or paused offers cannot be redeemed; aspirational partners are never seeded as signed offers. | R, L / RT, LT | Selection/eligibility refuse paused or unavailable approved offers; runtime cannot activate offers; disabled/synthetic-only adapter, signed synthetic fixtures only; actual redemption pending |
| UI-01 | Existing sidebar is extended once, beneath Profile; mobile and deep-link equivalents work. | T08 | Planned; no test execution claimed |
| UI-02 | Profile distinguishes confirmed current-month level from projected next-month progress. | T08 | Planned; no test execution claimed |
| UI-03 | Weekly/monthly/quarterly rows, shared caps, selected weeks and boundary dates are visible and consistent. | T08 | Planned; no test execution claimed |
| UI-04 | Each action CTA reaches a real authenticated workflow; no client-only point mutation or fake success. | T08 | Planned; no test execution claimed |
| UI-05 | Guest cannot earn/vote/redeem; account switching clears all private cached state. | T08 | Planned; no test execution claimed |
| UI-06 | Keyboard, screen reader, large text, reduced motion and narrow viewports are verified. | T08 | Planned; no test execution claimed |
| RPT-01 | Own report reproduces the exact stored calculation and lists the omitted fifth week. | M, P, B, RP / MT, PT, BT, RPT | Stored selected/omitted/missing weeks, action allowances, monthly and quarterly-email status, correction history and separately fixed level authority are projected and tested; the source assessment remains labelled shadow. HTTP/Flutter report remains pending coordination |
| RPT-02 | Public policy is inspectable, but another member's private report and ballot identity are inaccessible. | RP / RPT | Reader query is constrained to the supplied subject and omits evidence identifiers; tests compare distinct subject projections. Authenticated caller-to-owner binding, public methodology route and ballot privacy route remain pending |
| RPT-03 | JSON/CSV/report links obey authorisation, expiry, CSV injection protection and data minimisation. | RP / RPT | Projection strips raw evidence identifiers and retains only an evidence count; authenticated export, cache headers/expiry, CSV escaping and report-link lifecycle remain pending |
| RPT-04 | DSR export/delete, proof revocation, content purge and retained-audit redaction work end to end. | E, B, BS, X, XS, S, SS / ET, BT, XT, CT, ST | Isolated soft-delete erasure, assembly/assessment/snapshot races, corrected-chain staff notices, ordinary purge versus independent invalidation, and formula-safe CSV serialization are verified; direct owner download and Data Passport/locator/reviewer retention remain gated before collection |
| REL-01 | Cached consent/standing cannot approve a stale vote or redemption; fresh Hyperdrive reads are used. | C, S, R, L, Q / CT, ST, RT, LT, QT | Fresh vote/correction/selection/claim authority and consent/offer locks verified, including revoke during wait, inventory-blocked expiry and queued deletion; live Hyperdrive acceptance pending |
| REL-02 | Queue duplicate/out-of-order delivery and worker crash do not duplicate awards or miss corrections. | P, J, E, B, V, X, S, R, Q / PT, ET, BT, CT, XT, ST, RT, QT | Snapshot/correction CAS, atomic command/source receipts, conflict-skip safety, stock/usage serialization, interrupted rollback and outbox dedupe verified; specialist/reception, export and release cases remain |
| REL-03 | Migration dry run, rollback, policy activation and exact reviewed SHA are separately evidenced. | SQL / PT | Partial: local baseline and proposed schema only; release pending |
| REL-04 | Critical P1/P2 coverage is at least 80%; feed p95 <200 ms target, load/failure testing, API validation and personalised-cache isolation are verified or explicitly reported unverified. | MT, AT, HT, PT, ET, BT, CT, XT, ST, RT, QT | Scoped coverage gates pass: selection100/99.05, partner97.98/86.81, claims100/91.53, snapshot99.35/90.00, policy100/98.87, assembly98.76/89.91, earning92.07/80.45, appeals100/94.64, context98.94/90.26 (line/branch); load/feed/merchant/API/browser remain unverified |

## Additional ticket interface cases

These cases support [F01 in the decision record](../architecture/monthly-reputation-2026-10.md#ticket-feedback-interface-proposal).
The owner confirmed 150 points for one accepted, useful suggestion per quarter;
budget placement and the source-month effect remain unresolved. MT verifies the
versioned amendment and that an unplaced suggestion field cannot add 150 to the
existing score or exceed 13,500. The integration cases below are additional to the
original 100 and are not executable tests yet. Activation remains prohibited.
The control-panel workstream owns the ticket backend.

| Proposed case | Required evidence before integration |
| --- | --- |
| Submission, acknowledgement, closure, rejection and duplicate report | No award event or client-side points; private case state remains usable |
| Meaningful independent acceptance under an approved rubric | One 150-point award under the approved placement; reviewer authority and conflicts verified server-side |
| Optional participation and approved quarter boundaries | At most one awarded suggestion per quarter; continued reporting without points; no assumed reuse of D08 email validity |
| Retry, reopen, dual classification and concurrent acceptance | One stable contribution and effective revision; no concurrent second award or double credit as accepted help/accessibility |
| Budget and source-month placement | Original 13,500 maximum and fixed next-month level respected; no extra component or repeated monthly use without approval |
| Self-acceptance, spam, duplicate underlying work and reciprocal farming | Hold/rejection evidence; no points based solely on status, popularity or a shared IP |
| Reversal before/after delivery and out-of-order revision | No resurrection or duplicate allowance; only linked points, caps and stored period revisions reconcile under the approved placement |
| Wrong subject, unsupported rubric and missing activation approval | Reject or remain pending; no submitted points or forged event can award reputation |
| Case history, export, redaction and erasure | Authorised private access only; no ticket body, attachments, contact details or staff notes leak through the ledger or public profile |

## Reproduction

Local snapshot increment evidence on 3 October 2026:

| Check | Result |
| --- | --- |
| Fixed snapshot/correction PostgreSQL suite | 19 passed, zero skipped; 99.35% lines, 90.00% branches; real canonical pipeline, fixed month, explicit correction history, concurrency, failure rollback, positive/negative session timezones, fresh authorization and erasure races |
| Shadow and maintenance/assembly regressions | 9 shadow cases passed, 100% lines / 98.44% branches; 13 assembly cases passed, 98.76% / 89.91% |
| Native typecheck, workflow YAML, matrix and independent review | Passed; 100 unique original IDs retained; both bounded read-only reviewers clear the final receipt/UTC fixes |
| Settlement boundary fixture | Uses the nearest legal whole-hour cutoff around the actual server clock; explicitly skips only during the first UTC hour or after hour 720 of a month, when no such legal fixture exists; it executed without skips on 3 October |
| Migration and activation | Proposal applied/removed in disposable PostgreSQL 17 only; no production migration, configuration or activation |
| Remote snapshot revision | PostgreSQL run `37132704520` succeeds at `8574f4b8e167f1a3ab0ca22b9aa8976eb7e4ddd6`, including downstream synthetic workflows |

Local selection increment evidence on 3 October 2026:

| Check | Result |
| --- | --- |
| Persistent selection PostgreSQL suite | 16 passed, zero skipped; 100% lines / 96.15% branches; canonical current snapshot/tier, Free/Premium/Black, lower-level/downgrade dormancy, Black legacy-policy separation, concurrency, failure rollback and fresh authorization races |
| Fixture scope | Synthetic signed offers and settled weekly totals only; actual assembly/assessment/snapshot/selection code executes; no merchant or missing earning-provider acceptance claimed |
| Native typecheck and independent review | Passed; both bounded source reviewers clear final narrow offer-lock and Black-history fixes; reviews did not rerun tests |

Local partner-link increment evidence on 3 October 2026:

| Check | Result |
| --- | --- |
| Combined selection/partner PostgreSQL suite | 34 passed, zero skipped; 16 selection and 18 partner cases; selection 100%/99.05%, partner links 97.98%/86.81% line/branch coverage |
| Real transaction negatives | Concurrent durable invitation/consent receipts, private canonical recipient guards, email/recovery invalidation after audit purge, revoke race without current assessment, interruption rollback, expiry after lock wait, ordered-lock deletion, scoped rate allowance and partial subject erasure |
| Limits | Disabled/explicit synthetic adapter only; no merchant JWT route, QR/invoice fulfilment, alternate email proof, full historical locator/export/retention, live provider or collection activation claimed |
| Native typecheck and bounded review | Pass; both reviewers clear final recipient, pending-order and unused-invitation erasure fixes; reviews were read-only |
| Prior selection remote evidence | Exact-head PostgreSQL run `37133922366` succeeds at `fc0cb2819b7a0ff3d571f78d1a80a61e65577656`; this does not establish partner-draft remote results |

Local claim transaction increment evidence on 3 October 2026:

| Check | Result |
| --- | --- |
| Combined selection, partner, claim and report PostgreSQL suite | 59 passed, zero skipped; 16 selection, 18 partner, 19 claim and 6 report cases; report reader coverage is 100%/92.71% and CSV exporter coverage is 100%/97.78% (line/branch) |
| Claim transaction evidence | Same-partner wrong-source command/digest rejected while valid retry succeeds; QR expiry after a real inventory lock wait, last stock unit under two operators, invoice-period natural replay and shared-fingerprint cross-member isolation, current UTC period checks, atomic stock/usage cap, conflict-skipped insert, level correction, interruption rollback, revoked/superseded/recovery-invalid consent rejection, missing authority, paused offer and absent-marker erasure verified |
| Native typecheck, CI YAML and matrix identity | Pass; all 100 original case IDs remain unique. Two bounded read-only reviews found no remaining P1/P2; they did not rerun the test suite |
| Scope gates | Disabled/explicit synthetic adapter only; five-minute QR remains pending D12. Merchant JWT/API, external invoice verification, funding/territory, live commercial terms, privacy collection, migration, deployment and activation acceptance not claimed |

Local report-reader increment evidence on 3 October 2026:

| Check | Result |
| --- | --- |
| Combined PostgreSQL report/claim/partner/selection suite | 59 passed, zero skipped; report reader 100% lines / 92.71% branches and CSV exporter 100% / 97.78%; the run covers pending correction rows, fixed L5 authority versus L2 recalculation, cap/source metadata, and formula escaping |
| Report semantics | Stored best-four selection and omitted fifth, missing and unassessed weeks, monthly/quarterly email validity, separate current-level authority and correction history verified. CSV preserves source revision/reason/time, cap metadata, breakdown and correction history when detail is pending, ends with CRLF and escapes formula-leading values. A confirmed level snapshot does not relabel the original shadow assessment as confirmed |
| Privacy and integrity | Raw evidence identifiers are excluded, distinct subjects return distinct stored projections, deleted owners are refused, and mismatched catalogue/assessment lineage fails closed |
| Native typecheck and independent review | Native typecheck passes; a focused read-only re-review found no remaining P1/P2 in the exporter slice; reviewers did not run tests |
| Remaining T09 gates | No authenticated HTTP route/caller-to-owner binding, public policy endpoint, JSON/CSV download wiring, cache expiry, DSR export/locator/reviewer retention or privacy collection approval is claimed |

Local contextual increment evidence on 3 October 2026:

| Check | Result |
| --- | --- |
| Scoped contextual PostgreSQL suite | 20 passed; 98.94% lines, 90.26% branches; original-period acceptance, concurrent retries, true source dependency fanout, >50 absent/version-switched backlog, reapproval before deletion, isolated erasure and actual assembly drain |
| Appeals/participation PostgreSQL suite | 25 passed; 100% lines, 94.64% branches; actual five-vote restoration and authenticated admin review route preserve legitimate credit before soft/purge delivery |
| Earning PostgreSQL regression | 10 passed; 92.07% lines, 80.45% branches |
| Maintenance/assembly PostgreSQL regression | 13 passed; 98.76% lines, 89.91% branches |
| Native typecheck, workflow YAML and matrix identities | Passed; exactly 100 unique original IDs, not 100 passed workflows |
| Shared dependency integration | PR908 merged separately as main `8d91bcb434c4960a0f51ee2e4c7563c4f6e88a6c`; PR896 reconciliation remains coordinated with app-flow |

Local evidence on 2 October 2026:

| Check | Result |
| --- | --- |
| Node 22.23.3 policy suite | 30 passed; 100% lines, 98.66% branches across four new policy modules |
| Node 22.23.3 PostgreSQL 17 suite | 9 passed; 100% lines, 98.44% branches across the persistence service and invoked Jobs adapter; actual Jobs queue and scheduled entrypoints exercise durable pause/resume |
| Node 22.23.3 earning PostgreSQL 17 suite | 10 passed; 96.09% lines, 94.81% branches across real-source persistence and the Jobs producer/reconciler; appeal provenance branch is additionally exercised by the appeal suite |
| Node 22.23.3 appeal PostgreSQL 17 suite | 16 passed; 100% lines, 94.93% branches across appeal persistence/access/mutations/closure and the Jobs reconciler; invokes actual JWT/Access routes and Jobs queue/scheduled entrypoints |
| Complete approved PostgreSQL baseline | Applied and verified locally through 0020; proposed schema separately applied and removed by tests |
| Native typecheck | Passed |
| Native Worker config/generated types | Passed using writable temporary npm cache and Wrangler log path; no generated files changed |
| Existing native architecture suite | 270 passed |
| Existing product contract and integrity suites | 10 and 21 passed |
| Existing marketing suite | 47 passed after preserving the frozen root package manifest; homepage guards unchanged |
| Remote CI through earning SHA `5de6578e9b1e8d965486efd4fe10162320d2b5e2` | All checks passed, including Flutter and rendered journeys; appeal changes require their own current-head checks |
| Existing critical coverage gate | Passed across 41 modules / 13 domain categories |
| OpenAPI lint and contract tests | Lint passed with two existing warnings; 38 tests passed, 17 pre-existing skips |
| Generated OpenAPI v9 Dart client | Pinned generator 7.7.0; compilation and analysis passed with generated-code warnings; four added serialization tests pass alongside generated test scaffolding |
| Provider verification | Read-only database/branch/schema/ledger inspection only; earning, credentials, appeals, partner and release operation unverified |
| Flutter/UI, performance and deployment | New HTTP contract and generated client validated; product UI, performance and live operation unverified; no production migration, deployment or activation |

The proposal has no approved migration ID. Production baseline remains
`0020_auth_recovery_delivery.sql`; the candidate SQL does not enter the pinned
production migration manifest. No merged SHA exists for this work at preparation
time. The review PR/commit records the working SHA and complete changed paths.

Use Node 22 for the policy suite:

```sh
node --experimental-strip-types --experimental-test-coverage \
  '--test-coverage-include=packages/contracts/src/monthly-*.ts' \
  --test-coverage-lines=80 --test-coverage-branches=80 \
  --test packages/contracts/tests/monthly-reputation.test.mjs \
  packages/contracts/tests/monthly-peer-appeal.test.mjs \
  packages/contracts/tests/monthly-earning.test.mjs
```

Set `PLANETSCALE_PG17_TEST_DATABASE_URL` to an explicitly disposable local
PostgreSQL 17 database named `lythaus_monthly_test`, with the canonical migration
baseline already applied, then run:

```sh
node --experimental-strip-types --experimental-test-module-mocks \
  --experimental-test-coverage \
  '--test-coverage-include=packages/db/src/monthly-reputation.ts' \
  '--test-coverage-include=apps/lythaus-jobs/src/monthly-reputation.ts' \
  --test-coverage-lines=80 --test-coverage-branches=80 \
  --test apps/lythaus-jobs/tests/monthly-reputation.postgres.mjs
```

CI uses its disposable PostgreSQL service. These exact commands live in the
workflows because the existing homepage guard freezes the root package manifest.
The earning suite uses the same database with `--test apps/lythaus-jobs/tests/monthly-earning.postgres.mjs`
and coverage includes for `packages/db/src/monthly-earning.ts` and
`apps/lythaus-jobs/src/monthly-earning.ts`. Run the database files sequentially:
each owns and removes its synthetic rule/flag fixtures.
The appeal suite is `apps/lythaus-public-api/tests/community-appeals.postgres.mjs`,
with coverage includes `packages/db/src/community-appeal-*.ts` and
`apps/lythaus-jobs/src/community-appeals.ts`; CI runs it sequentially as well.
The database tests apply and remove only the proposed schemas and synthetic
fixtures. Neither command accesses a provider, deploys a Worker or changes activation.
