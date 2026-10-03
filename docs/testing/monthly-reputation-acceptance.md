# Monthly reputation acceptance matrix

Base: `8c4261402dd370b4c57e082cf0fc16b41927f7db`. Policy:
`lythaus-monthly-rewards-2026-10-v1`. This is the complete set of 100 required
acceptance cases from the October task sheet, not a claim that 100 tests pass.
Owner decisions D01–D13 and runtime activation remain pending. The catalogue's
embedded reference-validation counts are not execution evidence for this branch.

## Evidence paths

- M: [monthly calculation](../../packages/contracts/src/monthly-reputation-policy.ts).
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
- BS: [maintenance, assembly and lifecycle proposal](../../database/planetscale/proposals/monthly_reputation_maintenance.sql), outside the approved production manifest. Collection privacy prerequisite is unset until export/locator integration review.
- V / VS: [final peer participation consumer](../../packages/db/src/monthly-peer-participation.ts), [invoked queue/scheduled adapter](../../apps/lythaus-jobs/src/monthly-peer-participation.ts) / [separately gated proposal](../../database/planetscale/proposals/monthly_reputation_peer_participation.sql); CT verifies the real closure-to-weekly-result path.
- X / XT / XS: [scoped contextual review](../../packages/db/src/monthly-context-review.ts), [dependency reconciliation](../../packages/db/src/monthly-context-dependencies.ts), [authenticated admin mutation](../../apps/lythaus-admin-api/src/monthly-context-review.ts) / [20 real PostgreSQL cases](../../apps/lythaus-jobs/tests/monthly-context.postgres.mjs) / [separately gated proposal](../../database/planetscale/proposals/monthly_reputation_context.sql). CT additionally verifies actual equal-vote restoration through the admin route and retained publication proof.
- S / ST / SS: [fixed snapshot and correction transactions](../../packages/db/src/monthly-reward-snapshots.ts), [invoked queue/reconciler](../../apps/lythaus-jobs/src/monthly-reward-snapshots.ts) / [19 real PostgreSQL cases](../../apps/lythaus-jobs/tests/monthly-reward-snapshots.postgres.mjs) / [separately gated proposal](../../database/planetscale/proposals/monthly_reward_snapshots.sql). Confirmed fixtures require explicit synthetic approvals; deployed configuration remains absent.
- R / RT / RS: [persistent selections and own reader](../../packages/db/src/monthly-reward-selections.ts) / [16 real PostgreSQL cases](../../apps/lythaus-jobs/tests/monthly-reward-selections.postgres.mjs) / [separate selection and signed-offer proposal](../../database/planetscale/proposals/monthly_reward_selections.sql). Higher-tier sources are labelled settled-total fixtures consumed by the actual assembly/assessment/snapshot pipeline; missing earning providers are not proved.

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
| CAL-16 | Email proof expiry at the exact cutoff and a new proof after cutoff are handled correctly. | D, H, B / MT, HT, BT | Actual initial verification/paused capture/revocation and historical cutoff verified; renewal API and D08 approval pending |
| CAL-17 | Calendar-month addition handles 29/30/31-day dates without unapproved 90-day substitution. | D, H / MT, HT | Calendar validity candidate verified; D08 activation pending |
| CAL-18 | A weekly correction reselects all candidates; the previous fifth can enter the chosen four. | M, E, B, S / MT, ET, BT, ST | Real independent invalidation reassembles and reselects the fifth; approved scoped snapshot correction retains old reports/levels; obsolete approval drains durably |
| CAL-19 | On-time evidence approved late retains its performance period and audited correction path. | M, E, B, X / MT, ET, BT, XT | Late scoped acceptance retains original week; actual assembly refuses undrained/mismatched contextual configuration and drains the stored version; specialist acceptance pending |
| CAL-20 | End-of-month job replay, overlap and restart cannot publish duplicate entitlements. | P, J, B, S / PT, BT, ST | Atomic assembly and separate snapshot queue/reconciliation replay, concurrent publication and outbox rollback verified; partner claim consumer and activation pending |
| PTS-01 | Three accepted human posts award 250 once; two do not; six do not award 500. | W, E, ES / WT, ET | Shadow producer and concurrent real-source transactions verified; activation pending |
| PTS-02 | Duplicate, generated, disallowed or self-manufactured content cannot satisfy a contribution milestone. | W, E / WT, ET | Exact duplicate, generated/disallowed publication and self-approval checks verified; broader manipulation adjudication pending |
| PTS-03 | A short meaningful comment can qualify without a word-count or formal-language gate. | W, E, X / WT, XT, CT | Actual short stored comment independently accepted and credited, including peer-restored publication and deletion before Jobs; D05 rubric approval and product form pending |
| PTS-04 | Own and other discussion classification cannot double-count the same actor/thread context. | W, E, X / WT, ET, XT | Stored ownership, one primary work and shared contextual allowance verified under concurrent retries; D05 activation pending |
| PTS-05 | A member with no replies has the approved meaningful-follow-up route, not invented peer activity. | W, X / WT, XT | Actual own-thread follow-up accepted through server review without fabricated replies; D05 rubric approval and product form pending |
| PTS-06 | Source and correction share 300; splitting UI rows cannot raise the family cap. | W / WT | Candidate calculation verified; specialist submission/acceptance transactions pending |
| PTS-07 | Help and accessibility share 250, with the same concurrency protection. | W / WT; ticket amendment F01 | Candidate shared-cap calculation verified; acceptance/concurrency integration pending; F01 budget unresolved |
| PTS-08 | Self-acceptance, repeated trivial corrections and reciprocal task farming are held/rejected with evidence. | X / XT, CT; ticket proposal F01 | Context self-acceptance/fresh revoked staff/forged points refused; immutable bounded evidence and reversal verified; specialist triviality/farming and independent ticket acceptance remain |
| PTS-09 | Four distinct approved families award breadth 150 once; five/six do not stack it. | W / WT | Configurable D03 candidate verified; source integration and activation pending |
| PTS-10 | Two alternatives in one family count as one breadth family; reactions/security are not families. | W / WT | Candidate calculation verified; full product flow pending |
| PTS-11 | Reversing a supporting contribution recalculates breadth and other dependent components. | W, E / WT, ET; ticket amendment F01 | Candidate dependent recalculation and publication corrections verified; specialist/ticket integration pending |
| PTS-12 | No posts does not count as 100% human authorship. | W / WT | Empty evidence earns zero; candidate calculation verified |
| PTS-13 | Permitted AI-assisted participation can earn compliance but no primary human-authorship award. | W, E / WT, ET | Real publication source and candidate calculation verified; broader workflows pending |
| PTS-14 | Honest permitted assistance does not erase unrelated human-authored evidence. | W, E / WT, ET | Real publication source and candidate calculation verified; broader workflows pending |
| PTS-15 | Normalised grapheme counts at 249/250, combining marks, emoji and segmentation evasion are tested. | T02/T04 | Planned; no test execution claimed |
| PTS-16 | Generative media and material generative edits remain blocked; genuine media remains feature￾gated. | T02/T04 | Planned; no test execution claimed |
| PTS-17 | Emoji emotions are not blindly interpreted as author approval or disapproval. | T02/T04 | Planned; no test execution claimed |
| PTS-18 | Small/no feedback samples are insufficient evidence, not guilt or automatic negative points. | W / WT | D06 candidate calculation verified; helpfulness collection/fairness validation pending |
| PTS-19 | One actor, related-identity abuse and coordinated voting cannot inflate reception; shared IP alone is insufficient for exclusion. | T02/T04 | Planned; no test execution claimed |
| PTS-20 | Zero reception still leaves a mathematically valid 10,500 maximum through other families. | M / MT | Arithmetic verified; real opportunity/access validation pending |
| SEC-01 | Forged client award, local-unlock flag and manipulated device clock never credit points. | M, P, J, SQL / MT, PT | Partial: shadow persistence verified; full product flow pending |
| SEC-02 | Turnstile token replay, wrong action/hostname, expiry and cross-account reuse fail safely. | T05 | Planned; no test execution claimed |
| SEC-03 | An already validated normal challenge event may satisfy the monthly award without replaying its token. | T05 | Planned; no test execution claimed |
| SEC-04 | Challenge/provider failure becomes retry/pending rather than clearance or misconduct. | T05 | Planned; no test execution claimed |
| SEC-05 | Native WebView challenge works with controlled origins, accessibility and supported session persistence. | T05 | Planned; no test execution claimed |
| SEC-06 | Passkey origin/RP, challenge, signature, verification and replay checks are enforced. | T05 | Planned; no test execution claimed |
| SEC-07 | TOTP seed handling, rate limits, replay protection and recovery paths are tested. | T05 | Planned; no test execution claimed |
| SEC-08 | Full-month protection history is checked; last-day enrolment is not full-month maintenance. | H / HT | Coverage, gaps, expiry and credential-matched authentication calculated; actual protected-auth provider remains disabled |
| SEC-09 | Credential removal/readdition, app reinstall and changed email cannot double credit. | H, B, BS / HT, BT | Email change/removal/revoke/duplicate capture verified; protected-auth and reinstall flows pending |
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
| PAR-01 | Free L5 remains profile L5 but has at most L3 access for its one selected reward family. | R / RT | Server selection and own-reader L5/L3 split verified; actual claim consumer and Flutter pending |
| PAR-02 | Premium cannot obtain five L5 slots; plan/level changes preserve dormant selections correctly. | R, S / RT, ST | One exact variant-level slot/family, retained downgrade choices, Black independent of old selection policy and approved level-drop dormancy verified; D12 switching/grace and product journey pending |
| PAR-03 | Simultaneous claims/selections cannot exceed slot, inventory or usage limits. | R / RT | Concurrent selection CAS/idempotency and SQL shape/tier/source guards verified; claim inventory/usage consumers pending |
| PAR-04 | Month B entitlement comes from month A, not month B projection. | S, R / ST, RT | Selection requires actual confirmed current snapshot; other-member/old-month/no-history authority refused; actual partner redemption consumer pending |
| PAR-05 | An authorised linked-email lookup works; unknown, unlinked and other-partner addresses cannot enumerate members. | T07 | Planned; no test execution claimed |
| PAR-06 | Response contains no points, security method, case history or private content. | T07 | Planned; no test execution claimed |
| PAR-07 | Email change, consent revocation, recovery and recycled addresses cannot inherit the wrong link. | T07 | Planned; no test execution claimed |
| PAR-08 | Recurring invoice retries fulfil once; five-minute QR claims are online-validated and single use. | T07 | Planned; no test execution claimed |
| PAR-09 | An outage returns unknown/pending, not a silently removed discount or full-price charge. | T07 | Planned; no test execution claimed |
| PAR-10 | Proposed or paused offers cannot be redeemed; aspirational partners are never seeded as signed offers. | R / RT | New selection rejects proposed/paused/expired/future/unapproved-time/changed-terms versions; paused choices dormant, runtime cannot activate offers; signed synthetic fixtures only, redemption pending |
| UI-01 | Existing sidebar is extended once, beneath Profile; mobile and deep-link equivalents work. | T08 | Planned; no test execution claimed |
| UI-02 | Profile distinguishes confirmed current-month level from projected next-month progress. | T08 | Planned; no test execution claimed |
| UI-03 | Weekly/monthly/quarterly rows, shared caps, selected weeks and boundary dates are visible and consistent. | T08 | Planned; no test execution claimed |
| UI-04 | Each action CTA reaches a real authenticated workflow; no client-only point mutation or fake success. | T08 | Planned; no test execution claimed |
| UI-05 | Guest cannot earn/vote/redeem; account switching clears all private cached state. | T08 | Planned; no test execution claimed |
| UI-06 | Keyboard, screen reader, large text, reduced motion and narrow viewports are verified. | T08 | Planned; no test execution claimed |
| RPT-01 | Own report reproduces the exact stored calculation and lists the omitted fifth week. | M, P, B / MT, PT, BT | Immutable server assembly/report parity and omitted fifth verified; own API/Flutter report pending coordination |
| RPT-02 | Public policy is inspectable, but another member's private report and ballot identity are inaccessible. | T09 | Planned; no test execution claimed |
| RPT-03 | JSON/CSV/report links obey authorisation, expiry, CSV injection protection and data minimisation. | T09 | Planned; no test execution claimed |
| RPT-04 | DSR export/delete, proof revocation, content purge and retained-audit redaction work end to end. | E, B, BS, X, XS, S, SS / ET, BT, XT, CT, ST | Isolated soft-delete erasure, assembly/assessment/snapshot races, corrected-chain staff notices and ordinary purge versus independent invalidation verified; actual export/locator/reviewer retention workflow remains gated before collection |
| REL-01 | Cached consent/standing cannot approve a stale vote or redemption; fresh Hyperdrive reads are used. | C, S, R / CT, ST, RT | Fresh vote/correction authority and selection account/email/tier/offer/configuration locks and concurrent changes verified; partner consent/redemption checks pending |
| REL-02 | Queue duplicate/out-of-order delivery and worker crash do not duplicate awards or miss corrections. | P, J, E, B, V, X, S / PT, ET, BT, CT, XT, ST | Includes snapshot publication/correction CAS, receipt guards, rollback and paused queue/backfill plus context/peer/earning/assembly races; specialist/reception consumers remain |
| REL-03 | Migration dry run, rollback, policy activation and exact reviewed SHA are separately evidenced. | SQL / PT | Partial: local baseline and proposed schema only; release pending |
| REL-04 | Critical P1/P2 coverage is at least 80%; feed p95 <200 ms target, load/failure testing, API validation and personalised-cache isolation are verified or explicitly reported unverified. | MT, AT, HT, PT, ET, BT, CT, XT, ST, RT | Scoped coverage gates pass: selection 100/96.15, snapshot 99.35/90.00, policy 100/98.87, assembly 98.76/89.91, earning 92.07/80.45, appeal/participation 100/94.64, context 98.94/90.26 (line/branch); load/feed/new browser flows unverified |

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
