# Product Integrity Abuse Test Matrix — August 2026

**Status:** Partial. This matrix distinguishes repository-policy tests from authoritative runtime, database, queue, and live-environment proof. It does not certify a launch.

## Evidence scale

| Status | Meaning |
| --- | --- |
| **Policy-covered** | A shared policy or static source test exists. This proves neither migrated schema nor end-to-end Worker behaviour. |
| **Partial** | Repository controls are present, but source detection, transaction, retry, or adversarial integration evidence is incomplete. |
| **Planned** | Required behaviour or test has not been evidenced in the current repository/runtime boundary. |

## Matrix

| Attack / failure mode | Intended control | Repository evidence | Status / required result |
| --- | --- | --- | --- |
| 100 low-effort comments | Daily comment ceiling plus diminishing returns for qualifying contributions; raw volume is not trust. | `PLATFORM_SAFETY_LIMITS.dailyComments = 50`; contribution event policy caps after the sixth daily qualifying event. | **Partial** — cap and scoring policy exist; qualitative low-value classification and end-to-end enforcement need adversarial integration tests. |
| Duplicate posts | A duplicate cannot earn positive reputation. | `duplicate_content` is withheld in the reputation catalogue. | **Planned** — duplicate detection/emission wiring is not proven; test exact duplicate and rejection/withholding idempotency. |
| Slightly modified copy/paste | Near duplicates should not farm reputation. | Same withheld event policy. | **Planned** — no accepted near-duplicate threshold or runtime test evidence. |
| Follow/unfollow cycling | Follow transitions do not create reputation; more than two state changes for one relationship in a day return `429`. | `raw_follow_received` is withheld; the implemented per-relationship limit is two/day. | **Partial** — verify atomic transition counting, self-follow denial, block severing, concurrency, and retry behaviour. |
| Like/reaction rings | Reactions never directly create reputation. | `raw_reaction_received` is withheld; policy tests assert zero impact. | **Policy-covered** — ring/coordinated-account detection remains **Planned**. |
| Self-interaction | A user cannot create reputation through their own interaction. | `self_interaction` is withheld in the catalogue. | **Planned** — add relation-aware Worker/database tests and verify no positive event is emitted. |
| Coordinated accounts / account farming | Promotion requires account age, multiple active weeks, human contribution, pillar gates, and anti-gaming eligibility. | L5 requires 105 days, 40 active days, 11 active weeks, 35 qualifying human contributions, multi-pillar thresholds, and no manipulation investigation. | **Partial** — no accepted account-cluster or device/identity-correlations test evidence. |
| Rapid account creation | Registered/verified account and maturity gates prevent instant promotion. | Levels 1–5 require verified registration; higher levels require 14–105 days. | **Policy-covered** — prove registration/guest conversion and status data used by the Worker. |
| Posting burst | Posting and commenting are rate limited; contribution has diminishing returns. | Safety limits include five daily posts; shared impact policy has daily contribution diminishing returns. | **Partial** — run concurrency/idempotency tests against the actual rate-limit tables. |
| Mass reporting | Reports are evidence, not guilt; more than 20 flags/day return `429` and require a separate authoritative decision. | Implemented flag daily limit is 20; negative events require `confirmed_*` signals. | **Partial** — add reporter-coordination and false-report tests; do not award/reduce reputation from raw report count. |
| Media upload-session burst | More than 20 media-upload sessions/day return `429`; this prevents upload-session flooding without assigning reputation. | Implemented media upload-session daily limit is 20. | **Partial** — verify quota atomicity, abandoned-session handling, retry behaviour, and disabled-queue no-cost approval before live enablement. |
| Appeal flooding | Appeal request rate is constrained and final decisions require independent governance. | `dailyAppeals = 1`; appeal policy requires five trained reviewers, quorum, and adjudication. | **Partial** — test duplicate idempotency keys, expiry/retry, and concurrent submits. |
| Reviewer collusion | Randomised assignment excludes appellant/excluded/conflict/related accounts; only trained reviewers vote; one Level 5 weight-two cap. | `selectAppealReviewers` and `evaluateAppeal` unit tests cover exclusion, duplicate voting, recusal, invalid weights, and cap. | **Policy-covered** — live reviewer-pool sufficiency, relationship graph quality, and assignment persistence remain **Partial**. |
| One Level 5 dominates | Level 5 is not reviewer qualification; at most one trained selected L5 reviewer can have weight two. | `APPEAL_POLICY.maximumWeightedLevel5Reviewers = 1`; tests assert the cap. | **Policy-covered** — prove database constraint and runtime rejection under concurrent votes. |
| Incorrect 60% majority | Require all five valid reviewers and a weighted winner at or above 60%, plus adjudication. | Appeal tests cover quorum, no consensus, standard and high-risk adjudication. | **Policy-covered** — add transaction-level tally and replay tests after migration. |
| Appeal reversal loses reputation correction | An upheld/overturned outcome must retain an auditable reputation reversal. | Migration models `reputation_reversal` outcome effects; jobs/admin source tests assert outcome records. | **Partial** — execute end-to-end case → appeal → reversal → activity/notification/DSR path. |
| Deliberate AI declaration evasion | Generated public content is blocked; AI-assisted text is limited to 249 normalised-and-trimmed graphemes; evasion may be penalised only after authoritative decision. | Content policy tests cover NFC, grapheme counting, 249 allowed, 250 blocked, and generated blocked. | **Policy-covered** — segmented/screenshot/text-in-image evasion detection is **Planned** and must not rely on a public confidence score. |
| Paid trust purchase | Entitlements cannot change reputation, appeal vote weight, moderation treatment, or Editorial standing. | Tier policy only changes custom-feed count and Black News Board access; domain tests assert tier values. | **Partial** — add runtime contract tests covering entitlement changes while reputation/reviewer values remain unchanged. |
| Reward farming | Rewards use authoritative reputation/maturity outcomes, not raw engagement. | Public Worker repository code checks maturity and reputation level before redemption. | **Partial** — test concurrent redemption, fraud/manual review, and no reputation side effect. |
| Sensitive audit metadata | Metadata is allowlisted scalar data; secret-like keys are rejected. | Activity policy unit tests reject token, raw text, nested data, and long values. | **Policy-covered** — test every Worker logger and DSR payload against prohibited PII/secret fixtures. |
| Another user reads private activity | Subject-only read is the default; privileged privacy scope is explicit. | Activity policy test checks subject/privileged/other access; public route uses authenticated principal. | **Partial** — exercise cross-user access controls against migrated/deployed API. |
| Duplicate activity delivery | Unique `(user_id, source_event_id, event_type)` records a single user-visible event. | Migration and `recordUserActivity` use the same identity. | **Partial** — run concurrent Worker/outbox retries and assert exactly one ledger row/notification. |
| Queue/database partial failure | Outbox work must claim safely and retry without duplicating effects. | Jobs source test checks `FOR UPDATE SKIP LOCKED`, retry threshold, and error code handling. | **Partial** — run database-unavailable, rollback, queue retry, and notification-failure integration tests. |
| Privacy-export flooding | A second export request within 30 days returns `429`; the cooldown protects export capacity without altering data-rights eligibility. | Implemented privacy export cooldown is 30 days. | **Partial** — verify legitimate retry/status behaviour, concurrent requests, and DSR support escalation on migrated infrastructure. |
| DSR omission, unsafe deletion, or immutable-record over-retention | Repository remediation locates accountability signals and notification preferences/devices; deletion removes those, private profile fields, retention rules, and prior export objects/manifests; it redacts appeal statements and marks retained governance rows pseudonymized. Passport v3 includes notification/accountability data and conditionally decrypts the private accountability name with `PII_ENCRYPTION_KEY_V1`. | Authenticated private no-store export records `privacy.export_accessed`. | **Partial** — prove live migration, Jobs PII-key provisioning, legal-hold behaviour, and end-to-end export/delete/pseudonymization without logs leaking PII. |

## Existing repository tests to run on the exact release SHA

- `packages/contracts/tests/critical-content-policy.test.mjs`
- `packages/contracts/tests/critical-domain-policy.test.mjs`
- `apps/lythaus-public-api/tests/critical-product-policy.test.mjs`
- `apps/lythaus-public-api/tests/critical-notification-policy.test.mjs`
- `scripts/tests/product-integrity-admin-jobs.test.mjs`
- `npm run test:critical-coverage` — **passed in the current worktree**; this is policy-module coverage, not runtime-orchestration coverage.

The first two are policy-level checks; the jobs test is largely static source verification. They are useful regression controls, but do not substitute for Worker/Hyperdrive transaction, migrated schema, DSR, queue, and Flutter contract tests.

## Required next test additions

1. Run the complete `0009`–`0012` chain in a disposable PostgreSQL 17 container with synthetic data.
2. Add per-mutation authoritative event assertions, including duplicate idempotency and rollback.
3. Add repository contract tests that compare Worker routes, canonical OpenAPI, generated Dart clients, and reachable Flutter screens.
4. Add adversarial database tests for self-interaction, follow cycling, duplicate/near-duplicate content, concurrent reviewer votes, collusion, and account clustering.
5. Add privacy integration tests for cross-user activity access, passport-v3 export streaming/no-store/access recording, source-by-source delete/pseudonymized-retention/legal-hold precedence, Jobs PII-key-missing failure handling, and log/metadata redaction.
