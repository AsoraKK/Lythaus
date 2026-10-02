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

A unit-verified row establishes only the named calculation. A partial row still
requires the remaining application, privacy, provider or release work. No new
policy is activated, no production migration is applied, and no desktop/mobile
screenshot is claimed: the Flutter/API reporting slices are pending.

## Requirements to implementation and tests

| ID | Required acceptance case | Code / test evidence | Status and limits |
| --- | --- | --- | --- |
| CAL-01 | Exactly four eligible weekly results sum normally; no missing-month carry. | M / MT | Unit verified; live earning not integrated |
| CAL-02 | Five results select the highest four complete totals; the fifth remains reported. | M / MT | Unit verified; live earning not integrated |
| CAL-03 | Selection never combines best values from different weeks per action. | M / MT | Unit verified; live earning not integrated |
| CAL-04 | Every month over at least a 40-year calendar range has four or five closing Sundays under D01. | D / MT | Candidate D01 unit verified; approval pending |
| CAL-05 | A cross-month week has one owner; edge-day events never earn in two months. | D / MT | Candidate D01 unit verified; approval pending |
| CAL-06 | August 2026 has closes on 2, 9, 16, 23 and 30; 31 August belongs to the next closing week under D01. | D / MT | Candidate D01 unit verified; approval pending |
| CAL-07 | Leap February, year boundaries, local daylight-saving changes and UTC cutoffs remain correct. | D / MT | Candidate D01 unit verified; approval pending |
| CAL-08 | Tied scores have deterministic selected-week ordering. | M / MT | Unit verified; live earning not integrated |
| CAL-09 | New/partial source months do not fabricate missing weeks. | M / MT | Unit verified; live earning not integrated |
| CAL-10 | The 11,700 best-four example produces L5 only in the next month. | M, P, J, SQL / MT, PT | Partial: shadow persistence verified; full product flow pending |
| CAL-11 | Month A 8,900 produces month B L4; month B 12,150 produces month C L5. | M, P, J, SQL / MT, PT | Partial: shadow persistence verified; full product flow pending |
| CAL-12 | Current-month progress cannot upgrade/downgrade the already-confirmed current-month level. | M, P, J, SQL / MT, PT | Partial: shadow persistence verified; full product flow pending |
| CAL-13 | Maximum allowed components total 13,500; out-of-range components are rejected. | M / MT | Unit verified; live earning not integrated |
| CAL-14 | Every threshold neighbour 999/1,000, 2,999/3,000, 5,999/6,000 and 9,999/10,000 maps correctly. | M / MT | Unit verified; live earning not integrated |
| CAL-15 | No age, plan, World or old pillar gate changes the new score-derived level. | M / MT | Unit verified; live earning not integrated |
| CAL-16 | Email proof expiry at the exact cutoff and a new proof after cutoff are handled correctly. | D / MT | Candidate D08 unit verified; authentication integration pending |
| CAL-17 | Calendar-month addition handles 29/30/31-day dates without unapproved 90-day substitution. | D / MT | Candidate D08 unit verified; authentication integration pending |
| CAL-18 | A weekly correction reselects all candidates; the previous fifth can enter the chosen four. | M, P, J, SQL / MT, PT | Partial: shadow persistence verified; full product flow pending |
| CAL-19 | On-time evidence approved late retains its performance period and audited correction path. | M, P, J, SQL / MT, PT | Partial: shadow persistence verified; full product flow pending |
| CAL-20 | End-of-month job replay, overlap and restart cannot publish duplicate entitlements. | M, P, J, SQL / MT, PT | Partial: shadow persistence verified; full product flow pending |
| PTS-01 | Three accepted human posts award 250 once; two do not; six do not award 500. | T02/T04 | Planned; no test execution claimed |
| PTS-02 | Duplicate, generated, disallowed or self-manufactured content cannot satisfy a contribution milestone. | T02/T04 | Planned; no test execution claimed |
| PTS-03 | A short meaningful comment can qualify without a word-count or formal-language gate. | T02/T04 | Planned; no test execution claimed |
| PTS-04 | Own and other discussion classification cannot double-count the same actor/thread context. | T02/T04 | Planned; no test execution claimed |
| PTS-05 | A member with no replies has the approved meaningful-follow-up route, not invented peer activity. | T02/T04 | Planned; no test execution claimed |
| PTS-06 | Source and correction share 300; splitting UI rows cannot raise the family cap. | T02/T04 | Planned; no test execution claimed |
| PTS-07 | Help and accessibility share 250, with the same concurrency protection. | T02/T04; ticket proposal F01 | Planned; include all origins in one shared cap; no test execution claimed |
| PTS-08 | Self-acceptance, repeated trivial corrections and reciprocal task farming are held/rejected with evidence. | T02/T04; ticket proposal F01 | Planned; include independent ticket acceptance; no test execution claimed |
| PTS-09 | Four distinct approved families award breadth 150 once; five/six do not stack it. | T02/T04 | Planned; no test execution claimed |
| PTS-10 | Two alternatives in one family count as one breadth family; reactions/security are not families. | T02/T04 | Planned; no test execution claimed |
| PTS-11 | Reversing a supporting contribution recalculates breadth and other dependent components. | T02/T04; ticket proposal F01 | Planned; include accepted-ticket reversals; no test execution claimed |
| PTS-12 | No posts does not count as 100% human authorship. | T02/T04 | Planned; no test execution claimed |
| PTS-13 | Permitted AI-assisted participation can earn compliance but no primary human-authorship award. | T02/T04 | Planned; no test execution claimed |
| PTS-14 | Honest permitted assistance does not erase unrelated human-authored evidence. | T02/T04 | Planned; no test execution claimed |
| PTS-15 | Normalised grapheme counts at 249/250, combining marks, emoji and segmentation evasion are tested. | T02/T04 | Planned; no test execution claimed |
| PTS-16 | Generative media and material generative edits remain blocked; genuine media remains feature￾gated. | T02/T04 | Planned; no test execution claimed |
| PTS-17 | Emoji emotions are not blindly interpreted as author approval or disapproval. | T02/T04 | Planned; no test execution claimed |
| PTS-18 | Small/no feedback samples are insufficient evidence, not guilt or automatic negative points. | T02/T04 | Planned; no test execution claimed |
| PTS-19 | One actor, related-identity abuse and coordinated voting cannot inflate reception; shared IP alone is insufficient for exclusion. | T02/T04 | Planned; no test execution claimed |
| PTS-20 | Zero reception still leaves a mathematically valid 10,500 maximum through other families. | M / MT | Arithmetic verified; real opportunity/access validation pending |
| SEC-01 | Forged client award, local-unlock flag and manipulated device clock never credit points. | M, P, J, SQL / MT, PT | Partial: shadow persistence verified; full product flow pending |
| SEC-02 | Turnstile token replay, wrong action/hostname, expiry and cross-account reuse fail safely. | T05 | Planned; no test execution claimed |
| SEC-03 | An already validated normal challenge event may satisfy the monthly award without replaying its token. | T05 | Planned; no test execution claimed |
| SEC-04 | Challenge/provider failure becomes retry/pending rather than clearance or misconduct. | T05 | Planned; no test execution claimed |
| SEC-05 | Native WebView challenge works with controlled origins, accessibility and supported session persistence. | T05 | Planned; no test execution claimed |
| SEC-06 | Passkey origin/RP, challenge, signature, verification and replay checks are enforced. | T05 | Planned; no test execution claimed |
| SEC-07 | TOTP seed handling, rate limits, replay protection and recovery paths are tested. | T05 | Planned; no test execution claimed |
| SEC-08 | Full-month protection history is checked; last-day enrolment is not full-month maintenance. | T05 | Planned; no test execution claimed |
| SEC-09 | Credential removal/readdition, app reinstall and changed email cannot double credit. | T05 | Planned; no test execution claimed |
| SEC-10 | Multiple biometric/PIN methods do not generate separate 1,000-point awards. | T05 | Planned; no test execution claimed |
| SEC-11 | A valid multi-factor credential may satisfy both policy conditions without claiming two personhood proofs. | T05 | Planned; no test execution claimed |
| SEC-12 | A dormant/unobserved account is not automatically integrity-cleared. | T05 | Planned; no test execution claimed |
| SEC-13 | Missing Enterprise bot capabilities are explicit; no fabricated bot-score field. | T05 | Planned; no test execution claimed |
| SEC-14 | A VPN, shared household IP, assistive tool or one challenge failure cannot independently ban a member. | T05 | Planned; no test execution claimed |
| SEC-15 | Proportionate holds expire or escalate through audited states and have a recovery path. | T05 | Planned; no test execution claimed |
| SEC-16 | No raw biometric, device PIN, secret, email or content body enters operational logs. | T05 | Planned; no test execution claimed |
| APP-01 | A Level 1 Free member and Level 5 Black member each cast weight exactly 1. | A / AT | Partial: candidate policy verified; T06 route/database cutover pending |
| APP-02 | Editorial status adds neither another ballot nor a routine confirmation requirement. | A / AT | Partial: candidate policy verified; T06 route/database cutover pending |
| APP-03 | More than five eligible peers can vote; quorum is not a fixed panel size. | A / AT | Partial: candidate policy verified; T06 route/database cutover pending |
| APP-04 | Guest, author self-vote, proven controlled duplicates and relevant conflicts are handled correctly. | A / AT | Partial: candidate policy verified; T06 route/database cutover pending |
| APP-05 | Eligible low-reputation users are not excluded by old trained-panel or reputation gates. | A / AT | Partial: candidate policy verified; T06 route/database cutover pending |
| APP-06 | Ballot retries/concurrent writes obey one logical voter/case key; edits do not multiply votes or awards. | A / AT | Partial: candidate policy verified; T06 route/database cutover pending |
| APP-07 | Live totals and voter identities are hidden; only authorised safe case evidence is served. | A / AT | Partial: candidate policy verified; T06 route/database cutover pending |
| APP-08 | Votes before/at/after close follow one boundary convention under simultaneous close jobs. | A / AT | Partial: candidate policy verified; T06 route/database cutover pending |
| APP-09 | Quorum, strict majority, ties and no-quorum extension use the approved default version. | A / AT | Partial: candidate policy verified; T06 route/database cutover pending |
| APP-10 | A majority in a standard case resolves without an invisible Editorial veto. | A / AT | Partial: candidate policy verified; T06 route/database cutover pending |
| APP-11 | Unresolved after extension is not automatic author guilt or automatic publication. | A / AT | Partial: candidate policy verified; T06 route/database cutover pending |
| APP-12 | Sensitive/illegal material follows restricted review and cannot leak through peer preview/media endpoints. | A / AT | Partial: candidate policy verified; T06 route/database cutover pending |
| APP-13 | A valid minority ballot earns the same participation award as a valid majority ballot. | T06 | Planned; no test execution claimed |
| APP-14 | A changed ballot is one contribution; skip/recusal does not cause a penalty. | A / AT | Partial: candidate policy verified; T06 route/database cutover pending |
| APP-15 | No available cases is a neutral opportunity status; no fake production practice awards. | T06 | Planned; no test execution claimed |
| APP-16 | Overturning a decision reverses only linked consequences and is idempotent. | T06 | Planned; no test execution claimed |
| APP-17 | The same model output cannot immediately undo a scoped peer overturn on unchanged evidence. | T06 | Planned; no test execution claimed |
| APP-18 | Allow does not override a separate lawful safety hold, content deletion, unrelated sanction or media launch gate. | T06 | Planned; no test execution claimed |
| APP-19 | Old-policy cases never mix weight-two ballots into the new equal-vote evaluator. | A / AT | Partial: candidate policy verified; T06 route/database cutover pending |
| APP-20 | Moderation/author decisions and ballot histories remain auditable after allowed redaction/retention handling. | T06 | Planned; no test execution claimed |
| PAR-01 | Free L5 remains profile L5 but has at most L3 access for its one selected reward family. | T07 | Planned; no test execution claimed |
| PAR-02 | Premium cannot obtain five L5 slots; plan/level changes preserve dormant selections correctly. | T07 | Planned; no test execution claimed |
| PAR-03 | Simultaneous claims/selections cannot exceed slot, inventory or usage limits. | T07 | Planned; no test execution claimed |
| PAR-04 | Month B entitlement comes from month A, not month B projection. | T07 | Planned; no test execution claimed |
| PAR-05 | An authorised linked-email lookup works; unknown, unlinked and other-partner addresses cannot enumerate members. | T07 | Planned; no test execution claimed |
| PAR-06 | Response contains no points, security method, case history or private content. | T07 | Planned; no test execution claimed |
| PAR-07 | Email change, consent revocation, recovery and recycled addresses cannot inherit the wrong link. | T07 | Planned; no test execution claimed |
| PAR-08 | Recurring invoice retries fulfil once; five-minute QR claims are online-validated and single use. | T07 | Planned; no test execution claimed |
| PAR-09 | An outage returns unknown/pending, not a silently removed discount or full-price charge. | T07 | Planned; no test execution claimed |
| PAR-10 | Proposed or paused offers cannot be redeemed; aspirational partners are never seeded as signed offers. | T07 | Planned; no test execution claimed |
| UI-01 | Existing sidebar is extended once, beneath Profile; mobile and deep-link equivalents work. | T08 | Planned; no test execution claimed |
| UI-02 | Profile distinguishes confirmed current-month level from projected next-month progress. | T08 | Planned; no test execution claimed |
| UI-03 | Weekly/monthly/quarterly rows, shared caps, selected weeks and boundary dates are visible and consistent. | T08 | Planned; no test execution claimed |
| UI-04 | Each action CTA reaches a real authenticated workflow; no client-only point mutation or fake success. | T08 | Planned; no test execution claimed |
| UI-05 | Guest cannot earn/vote/redeem; account switching clears all private cached state. | T08 | Planned; no test execution claimed |
| UI-06 | Keyboard, screen reader, large text, reduced motion and narrow viewports are verified. | T08 | Planned; no test execution claimed |
| RPT-01 | Own report reproduces the exact stored calculation and lists the omitted fifth week. | M, P, J, SQL / MT, PT | Partial: shadow persistence verified; full product flow pending |
| RPT-02 | Public policy is inspectable, but another member's private report and ballot identity are inaccessible. | T09 | Planned; no test execution claimed |
| RPT-03 | JSON/CSV/report links obey authorisation, expiry, CSV injection protection and data minimisation. | T09 | Planned; no test execution claimed |
| RPT-04 | DSR export/delete, proof revocation, content purge and retained-audit redaction work end to end. | M, P, J, SQL / MT, PT | Partial: shadow persistence verified; full product flow pending |
| REL-01 | Cached consent/standing cannot approve a stale vote or redemption; fresh Hyperdrive reads are used. | M, P, J, SQL / MT, PT | Partial: shadow persistence verified; full product flow pending |
| REL-02 | Queue duplicate/out-of-order delivery and worker crash do not duplicate awards or miss corrections. | M, P, J, SQL / MT, PT | Partial: shadow persistence plus actual queue/scheduled pause-resume recovery verified; earning producers and full product flow pending |
| REL-03 | Migration dry run, rollback, policy activation and exact reviewed SHA are separately evidenced. | SQL / PT | Partial: local baseline and proposed schema only; release pending |
| REL-04 | Critical P1/P2 coverage is at least 80%; feed p95 <200 ms target, load/failure testing, API validation and personalised-cache isolation are verified or explicitly reported unverified. | MT, AT, PT | Partial: new-module coverage only; load/feed/browser checks unverified |

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

Local evidence on 2 October 2026:

| Check | Result |
| --- | --- |
| Node 22.23.3 policy suite | 22 passed; 100% lines, 98.76% branches across the three new policy modules |
| Node 22.23.3 PostgreSQL 17 suite | 9 passed; 100% lines, 98.44% branches across the persistence service and invoked Jobs adapter; actual Jobs queue and scheduled entrypoints exercise durable pause/resume |
| Complete approved PostgreSQL baseline | Applied and verified locally through 0020; proposed schema separately applied and removed by tests |
| Native typecheck | Passed |
| Native Worker config/generated types | Passed using writable temporary npm cache and Wrangler log path; no generated files changed |
| Existing native architecture suite | 270 passed |
| Existing product contract and integrity suites | 10 and 21 passed |
| Existing marketing suite | 47 passed after preserving the frozen root package manifest; homepage guards unchanged |
| Remote CI at foundation SHA `1c90d6ffe80623b45cf88f5754bad8f9bb8fd572` | All checks passed, including Flutter and rendered journeys; later commits require their own current-head checks |
| Existing critical coverage gate | Passed across 41 modules / 13 domain categories |
| OpenAPI lint and contract tests | Lint passed with two existing warnings; 38 tests passed, 17 pre-existing skips |
| Provider verification | Read-only database/branch/schema/ledger inspection only; earning, credentials, appeals, partner and release operation unverified |
| Flutter/UI, performance and deployment | Not run for this backend foundation; no new UI or HTTP contract, production migration, deployment or activation |

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
  packages/contracts/tests/monthly-peer-appeal.test.mjs
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
The database tests apply and remove only the proposed shadow schema and synthetic
fixtures. Neither command accesses a provider, deploys a Worker or changes activation.
