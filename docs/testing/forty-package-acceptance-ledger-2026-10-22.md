# Forty-package acceptance ledger — 22 October 2026

Status: **40 OPEN; no whole package COMPLETE or accepted.** This is a source
audit and acceptance register. Implemented pieces, existing automated test
source, executed checks, rendered candidate checks and deployed acceptance are
different evidence classes. A disabled capability remains an explicit exclusion
with its own server gate; it does not make its whole package complete.

## Identity and original scope

- Audited source: main `f92458a56f9ed37bbc61dad747805727c83b7738`.
  The ledger branch starts at that exact commit. Concurrent UI work is outside
  this frozen audit until its final reviewed SHA and evidence are added.
- Original: **Lythaus Real World Test and Fix Plan**, 12 October 2026,
  16 pages / 771 extracted lines; Library file
  `libfile_c739e80137688191ba85c00a400627d6`. Local recovered extraction SHA256:
  `e9d7e4d441e4ce2ebed50a0e81c718c1a65c7e6b44c0e3bd5130730bee27d324`,
  verified in this lane. Every original **Pass evidence** paragraph appears
  below with whitespace normalized only; original identifiers and titles are
  retained. The original test-and-fix scope remains in the recovered plan.
- Exact identifiers: UX-01–UX-10 (10), SEC-01–SEC-12 (12),
  PUB-01–PUB-14 (14), ADM-01–ADM-04 (4): **40 unique packages**.
  Original classification/dependencies below are historical plan text, not a
  current result or authority to activate a capability.
  Source numbers inside the preserved quotations refer to the original plan's
  source register, not this ledger's evidence references.
- Latest verified live identity supplied by the parent: **release128**,
  `3880a8be4c89459dd7ef831c9385817a887511ef`. No deployment of the audited
  main commit was supplied. Release113 references in the original plan describe
  its historical baseline.
- PRs [1029](https://github.com/AsoraKK/Lythaus/pull/1029) and
  [1056](https://github.com/AsoraKK/Lythaus/pull/1056) are already merged per the
  parent handoff. Dated draft/source descriptions do not establish current
  absence and must not trigger duplicate implementations.

## Evidence classes and update rules

| Reference | Evidence recorded here | Limit |
| --- | --- | --- |
| S0 | Files and relevant routing/policy/handler branches inspected at the audited source | Source implementation only; no provider or deployed-state observation |
| T0 | Test files linked in each package exist at the audited source; no application suite was newly executed in this documentation lane | Existing test source is not an observed PASS and is not a complete coverage map |
| E1 | Parent supplied verified exact-main CI [39587474807](https://github.com/AsoraKK/Lythaus/actions/runs/39587474807): all eight jobs and five ancillary workflows passed | Execution evidence for that SHA's required checks; this lane did not retrieve per-case logs and assigns no whole-package acceptance from the aggregate |
| E2 | Earlier [21 October acceptance record](public-launch-acceptance-2026-10-21.md), with its own exact harness/product baselines, synthetic execution counts and limited public read-only observations | Earlier local fixtures, public page rendering and guest feed reads do not establish current authenticated acceptance; that public runner did not establish its deployed app SHA |
| E3 | Completed protected read-only privilege preflight [39588144680](https://github.com/AsoraKK/Lythaus/actions/runs/39588144680) at the audited main SHA, supplied by the parent and recorded here on 22 October: NEEDS_APPROVAL; all 12 prerequisite objects pass; 17 missing checks correspond to the four proposed grants | Bounded mapped-role/effective-rights observation; runtimeSessionObserved=false, execution grantor unproven, no grants executed and no product-route or login acceptance |
| V0 | Candidate rendered acceptance: **PENDING INTEGRATION**; parent owns baseline and final integrated desktop/mobile evidence | No new browser/device/visual run was performed here; no screenshot count, accessibility pass or future UI result is inferred |
| V1 | Narrow 22 October integrated UI overlay below: executed local tests and compiled-release Chromium captures on synthetic API fixtures | Supersedes V0 only for the listed cases; all forty packages remain OPEN and deployed acceptance D0 is unchanged |
| D0 | Deployed package acceptance: **NOT ACCEPTED**; no full package has current exact-release proof | The parent's 21 October observations are reported observations, not new testing in this lane |

Every package below has current status **OPEN**, source evidence S0, automated
evidence T0 plus the limited shared E1 context, candidate visual status V0, and
deployed status D0 unless a narrower observation is stated. E2 is linked only
as historical evidence, never silently reassigned to the current source.

Before changing a package's acceptance, record: package/case ID, responsible
role, full source SHA, environment, deployment/artifact identity, policy/provider
and configuration versions, UTC time, authorized synthetic fixture manifest,
steps, expected/actual effects, outcome and sanitized evidence link. Label
mocked/local native integration, actual provider integration, browser emulation,
physical devices and real screen readers separately. Record independent review,
regression/exact-head check results, retained rollback and permitted cleanup.
Keep private content, credentials, account exports and production archives out
of this public repository and public Actions artifacts.

A new integrated commit requires affected-case and required aggregate reruns.
Preserve the original pass paragraph; append current policy reconciliation and
new evidence rather than rewriting historical criteria. Do not mark COMPLETE
from unit tests, aggregate CI, merge, smoke, a screenshot, submission success or
a disabled feature alone.

## Current policy reconciliation

- **P1 — rewards:** the original UX-09 test-and-fix prose broadly calls v1
  13,500 governing. Under [current policy authority](../policy/current-policy-authority.md),
  13,500 governs historical v1 only. The approved prospective v2 maximum is
  13,650, preserving existing awards and adding optional 150-point suggestion
  credit. [Prospective source](../../packages/contracts/src/monthly-reputation-prospective.ts)
  remains a nonactivating preview. All prospective quarterly awards expire at
  calendar-quarter end, remaining months only, without earlier back-credit.
  Do not restore rolling validity, amend signed v1 bytes or infer activation.
- **P2 — appeals:** equal-weight timed standard community review without routine
  Editorial confirmation is approved direction. Historical cases retain their
  recorded weighted/adjudicated version. D09 duration/quorum/extension and
  restricted/unresolved operational rules and activation remain separately gated;
  proposal defaults are not approved runtime values.
- **P3 — authentication/publication:** launch uses email/password and read-only
  guest browsing. AI-assisted text is at most 249 NFC-normalized, trimmed
  user-perceived graphemes; generated public content is blocked. Declaration,
  model evidence, harm safety, assessment and publication are separate.
  Public posting remains withheld until complete validation and its explicit
  activation decision. Owner-testing deployment does not certify authentication,
  detection, publishing, media, rewards or billing.
- **P4 — data and release:** seven-day test-ledger retention applies only to its
  approved fixtures/artifacts, never genuine posts or historical moderation
  records. Provider data transmission, new credentials, grants, production DDL,
  permanent deletion, paid services and live charges retain their specific gates.
  The approved narrow owner exception defers independent/off-provider recovery
  for one exact owner-testing release only. Fresh native backup/actual restore,
  all other recovery/cost gates and exact binding/consent remain required.
  `DEFERRED_BY_OWNER_EXCEPTION` is never verified and keeps non-owner public
  readiness blocked after 0021. Prior backup evidence is not presumed fresh today.

## Member experience
### UX-01 — Establish the real capability baseline

Original classification: P0 | Reviewer and lane leads | Untested full inventory | Depends on release receipt.

**Original pass criterion (preserved):**

> A source-linked matrix distinguishes implemented, disabled, absent and broken. Every visible action works or explains its current limit. No fabricated content, placeholder totals or client-side fixture filtering is presented as production evidence. Sources S1–S3.

- **Source implementation (S0):** PARTIAL: router, server route inventory and owner/public projections exist; these do not form a deployed role-by-role capability matrix. [lib/core/routing/app_router.dart](../../lib/core/routing/app_router.dart); [apps/lythaus-public-api/src/index.ts](../../apps/lythaus-public-api/src/index.ts); [apps/lythaus-admin-api/src/index.ts](../../apps/lythaus-admin-api/src/index.ts).
- **Automated evidence (T0/E1):** existing test source, not newly executed here: [test/features/feed/application/guest_contract_regression_test.dart](../../test/features/feed/application/guest_contract_regression_test.dart); [apps/lythaus-public-api/tests/owner-content-reader.test.mjs](../../apps/lythaus-public-api/tests/owner-content-reader.test.mjs).
- **Candidate visual acceptance:** V0 — PENDING INTEGRATION.
- **Deployed acceptance:** D0; parent reported one historical ADR fixture, a generic member label and sparse feed on 21 October. Existing public fixture content is not detector or publishing qualification.
- **Remaining gap / next acceptance:** Finish a source-to-deployed inventory for guest/member/owner/admin and denied/empty/unavailable states. Reconcile the historical fixture through approved read-only records; any quarantine needs its separate authorization. Do not fabricate feed activity.

### UX-02 — Repair feed navigation and discovery

Original classification: P1 | A Member experience | Observed failure | Depends on UX-01; feed contracts.

**Original pass criterion (preserved):**

> Selected feed, route and rendered content stay consistent; permitted destinations are reachable with keyboard and touch. No duplicate loads, stale cross-feed results or entitlement bypass. Search entry alone is not a results pass. Sources S1–S2.

- **Source implementation (S0):** PARTIAL: supported feed destinations, membership checks, Close and Escape sheet wiring exist; this supersedes the original purely circular feed-tools implementation. [lib/ui/screens/home/home_feed_navigator.dart](../../lib/ui/screens/home/home_feed_navigator.dart); [lib/ui/components/feed_control_panel.dart](../../lib/ui/components/feed_control_panel.dart); [apps/lythaus-public-api/src/feed-runtime-policy.ts](../../apps/lythaus-public-api/src/feed-runtime-policy.ts).
- **Automated evidence (T0/E1):** existing test source, not newly executed here: [test/ui_components/feed_control_panel_test.dart](../../test/ui_components/feed_control_panel_test.dart); [test/screens/home_feed_search_journey_test.dart](../../test/screens/home_feed_search_journey_test.dart); [test/ui/screens/home/news_feed_membership_status_test.dart](../../test/ui/screens/home/news_feed_membership_status_test.dart).
- **Candidate visual acceptance:** V0 — PENDING INTEGRATION.
- **Deployed acceptance:** D0; parent reported repeated Discover wording and a sparse feed on 21 October. The limited guest feed read in E2 is narrower than this criterion.
- **Remaining gap / next acceptance:** Capture integrated route/selection/content consistency, no/one/multiple feeds, entitlement denial, pagination, refresh, offline, direct URLs, Back/Forward, keyboard/touch dismissal and focus return. Treat sparse genuine content truthfully.

### UX-03 — Repair identity and profile content journeys

Original classification: P1 and P0 privacy negatives | A Member experience | Observed failures and limited passes | Depends on UX-01; owner-content APIs.

**Original pass criterion (preserved):**

> The owner reopens the test post from Posts; author links remain usable after repeated navigation. Other members and guests cannot read it. Valid public labels agree across surfaces; unavailable profiles have a deliberate explanation. Visitor collections and follower lists remain unavailable unless their missing contracts are separately implemented. Source S3.

- **Source implementation (S0):** PARTIAL: owner cards open owner-authorized detail; public-author labels and session-aware profile/owner timelines exist. Visitor collections remain explicitly unavailable. [lib/ui/screens/profile/profile_screen.dart](../../lib/ui/screens/profile/profile_screen.dart); [lib/ui/components/author_profile_link.dart](../../lib/ui/components/author_profile_link.dart); [apps/lythaus-public-api/src/owner-content-reader.ts](../../apps/lythaus-public-api/src/owner-content-reader.ts); [apps/lythaus-public-api/src/feed-author-projection.ts](../../apps/lythaus-public-api/src/feed-author-projection.ts).
- **Automated evidence (T0/E1):** existing test source, not newly executed here: [test/features/profile/presentation/profile_post_author_backstack_test.dart](../../test/features/profile/presentation/profile_post_author_backstack_test.dart); [test/features/profile/presentation/owner_post_card_keyboard_test.dart](../../test/features/profile/presentation/owner_post_card_keyboard_test.dart); [apps/lythaus-public-api/tests/owner-content-reader.test.mjs](../../apps/lythaus-public-api/tests/owner-content-reader.test.mjs).
- **Candidate visual acceptance:** V0 — PENDING INTEGRATION.
- **Deployed acceptance:** D0; parent still reported the historical fixture under a generic Lythaus member label. No fresh author/backstack or cross-account acceptance was supplied.
- **Remaining gap / next acceptance:** Prove repeated owner Posts/detail/author navigation and A/B privacy on the deployed candidate; distinguish a permitted hidden-profile fallback from an actual unavailable-author failure. Recheck pagination, late responses and account switch.

### UX-04 — Complete composer recovery and submission QA

Original classification: P1 and P0 integrity negatives | A Member experience | Limited live pass; copy defect | Depends on UX-03; submission contract.

**Original pass criterion (preserved):**

> Same-key retry creates at most one post. Success clears only the correct account draft; failure retains content and declaration. Closing cannot lose a saved draft or pop to a blank root. Owner detail and list agree. The observed refresh and clearing passes remain regression cases; 201 never means assessment/publication passed. Source S1.

- **Source implementation (S0):** PARTIAL: saved-draft close handling, durable recovery, frozen retry payload/key and account/session fencing are implemented; pending submission is distinct from publication. [lib/features/feed/presentation/create_post_screen.dart](../../lib/features/feed/presentation/create_post_screen.dart); [lib/features/feed/application/post_creation_providers.dart](../../lib/features/feed/application/post_creation_providers.dart); [lib/features/feed/application/content_recovery_storage.dart](../../lib/features/feed/application/content_recovery_storage.dart).
- **Automated evidence (T0/E1):** existing test source, not newly executed here: [test/features/feed/presentation/create_post_navigation_test.dart](../../test/features/feed/presentation/create_post_navigation_test.dart); [test/features/feed/application/content_recovery_test.dart](../../test/features/feed/application/content_recovery_test.dart); [test/features/feed/application/content_mutation_test.dart](../../test/features/feed/application/content_mutation_test.dart).
- **Candidate visual acceptance:** V0 — PENDING INTEGRATION.
- **Deployed acceptance:** D0; original 12 October refresh/draft-clearing observations remain historical regression cases, not current-release acceptance. E2 records earlier synthetic browser execution.
- **Remaining gap / next acceptance:** Exercise root and pushed composer, save/close/Back/reload, Unicode/declarations, offline/expiry/account switch, lost acknowledgement and late success on the exact candidate. Preserve drafts on failure and verify at-most-one server effect.

### UX-05 — Make trust and history truthful and dismissible

Original classification: P1 UX; phased reader | A UI; B reader contract | Known absent reader; observed UX failure | Depends on UX-08; approved reader contract.

**Original pass criterion (preserved):**

> No modal trap, raw author UUID, hash clutter, internal diagnostic or unsupported verification claim. Declaration, assessment and evidence remain distinct. Appeal controls stay within the existing eligible informational contract; no submission is invented. Functional history stays absent until real API-backed success is proven. Source S1.

- **Source implementation (S0):** PARTIAL / READER ABSENT: receipt sheet is bounded and has Close/Escape, but still requests /api/posts/{id}/receipt and exposes generic Retry; native Public API has no matching reader route. [lib/ui/components/receipt_drawer.dart](../../lib/ui/components/receipt_drawer.dart); [apps/lythaus-public-api/src/index.ts](../../apps/lythaus-public-api/src/index.ts).
- **Automated evidence (T0/E1):** existing test source, not newly executed here: [test/ui/components/receipt_drawer_test.dart](../../test/ui/components/receipt_drawer_test.dart); [test/features/feed/presentation/member_history_access_test.dart](../../test/features/feed/presentation/member_history_access_test.dart).
- **Candidate visual acceptance:** V0 — PENDING INTEGRATION.
- **Deployed acceptance:** D0; original oversized/uncloseable history was observed on 12 October. Current bounded-sheet source does not prove a functional deployed reader.
- **Remaining gap / next acceptance:** Make the absent-reader state deliberately unavailable rather than an endless recoverable-network suggestion; render compact/dismissible states and prove focus return. A real history reader requires a separate audience-safe API/OpenAPI contract before functional success is claimed.

### UX-06 — Verify profile privacy and saved preferences

Original classification: P1 and P0 isolation | A Member experience | Untested; storage gate to verify | Depends on UX-03; current schema authority.

**Original pass criterion (preserved):**

> Private fields never reach public projections. Reload reflects confirmed server truth; A never inherits B or guest values. All intended controls consume the saved preference. Failed persistence is not presented as a local success. Preference DDL and activation retain their separate release gates. Source S4.

- **Source implementation (S0):** PARTIAL / STORAGE GATED: owner/public profiles, explicit preference Save, guest/account separation, conflict/retry state and privacy workflow code exist; source cannot establish hosted preference columns. [lib/features/profile/presentation/presentation_preferences_section.dart](../../lib/features/profile/presentation/presentation_preferences_section.dart); [lib/features/profile/application/profile_service.dart](../../lib/features/profile/application/profile_service.dart); [apps/lythaus-public-api/src/profile-runtime-policy.ts](../../apps/lythaus-public-api/src/profile-runtime-policy.ts); [database/planetscale/proposals/profile-presentation-preferences.sql](../../database/planetscale/proposals/profile-presentation-preferences.sql).
- **Automated evidence (T0/E1):** existing test source, not newly executed here: [test/ui/screens/profile/presentation_preferences_lifecycle_test.dart](../../test/ui/screens/profile/presentation_preferences_lifecycle_test.dart); [apps/lythaus-public-api/tests/profile-workflows.postgres.mjs](../../apps/lythaus-public-api/tests/profile-workflows.postgres.mjs); [scripts/tests/optional-profile.browser.mjs](../../scripts/tests/optional-profile.browser.mjs).
- **Candidate visual acceptance:** V0 — PENDING INTEGRATION.
- **Deployed acceptance:** D0; parent reported a confusing profile notice below Settings on 21 October. No current production preference-save acceptance is supplied.
- **Remaining gap / next acceptance:** Refresh authorized production storage/effective-role evidence, then prove owner/visitor/private projection, two accounts, explicit save/reload/conflict and all consumers of saved navigation preferences. Keep schema and activation approvals separate.

### UX-07 — Verify social safety and notifications

Original classification: P1 and P0 authorization | A Member experience | Untested; capability inventory required | Depends on UX-01–03; current API contracts.

**Original pass criterion (preserved):**

> Supported safety actions persist and enforce access server-side across reads. Missing actions are explicitly unavailable. No private pending preview leaks; read/dismiss is idempotent and late results cannot navigate a newer session. Inbox UI success does not claim delivery transport, permissions or channel activation. Source S5.

- **Source implementation (S0):** PARTIAL: follow/block/mute/report routes and client follow service exist; inbox, read/dismiss, destination handling and exactly five notification preference booleans have contracts. [lib/features/profile/application/follow_service.dart](../../lib/features/profile/application/follow_service.dart); [lib/features/notifications/application/notification_api_service.dart](../../lib/features/notifications/application/notification_api_service.dart); [apps/lythaus-public-api/src/notification-policy.ts](../../apps/lythaus-public-api/src/notification-policy.ts); [apps/lythaus-public-api/src/index.ts](../../apps/lythaus-public-api/src/index.ts).
- **Automated evidence (T0/E1):** existing test source, not newly executed here: [test/features/notifications/presentation/notifications_lifecycle_test.dart](../../test/features/notifications/presentation/notifications_lifecycle_test.dart); [test/features/notifications/application/notification_rapid_reentry_test.dart](../../test/features/notifications/application/notification_rapid_reentry_test.dart); [apps/lythaus-public-api/tests/critical-notification-policy.test.mjs](../../apps/lythaus-public-api/tests/critical-notification-policy.test.mjs).
- **Candidate visual acceptance:** V0 — PENDING INTEGRATION.
- **Deployed acceptance:** D0; no deployed social-safety or notification-transport acceptance was supplied.
- **Remaining gap / next acceptance:** Map which actions have reachable UI; test persisted enforcement across feed/profile/search/comments, revoked actors and account changes. Prove inbox paging/late-response navigation separately from real delivery transport, device permission and channel activation.

### UX-08 — Verify responsive and accessible consistency

Original classification: P1 cross-cutting | A components; reviewer acceptance | Untested full acceptance; observed risks | Depends on integrated member and admin changes.

**Original pass criterion (preserved):**

> No horizontal overflow or obscured essential control. Supported journeys work with touch and keyboard; dismissal restores focus; errors name the action/field. Record exact commit, viewport/theme and evidence. Separate real-device/screen-reader results from simulation or semantics inspection; no WCAG- compliance claim from this audit. Sources S1–S6.

- **Source implementation (S0):** PARTIAL: responsive reading/layout components and brand assets exist; owner status uses static Semantics rather than a checkbox. Existing keyboard/browser harnesses support further inspection. [lib/features/profile/presentation/profile_content_status.dart](../../lib/features/profile/presentation/profile_content_status.dart); [lib/ui/components/reading_pane.dart](../../lib/ui/components/reading_pane.dart); [scripts/tests/member-accessibility.browser.mjs](../../scripts/tests/member-accessibility.browser.mjs).
- **Automated evidence (T0/E1):** existing test source, not newly executed here: [test/features/auth/presentation/brand_login_navigation_contract_test.dart](../../test/features/auth/presentation/brand_login_navigation_contract_test.dart); [test/ui/screens/profile/profile_accessibility_test.dart](../../test/ui/screens/profile/profile_accessibility_test.dart); [scripts/tests/profile-tabs-keyboard.browser.mjs](../../scripts/tests/profile-tabs-keyboard.browser.mjs).
- **Candidate visual acceptance:** V0 — PENDING INTEGRATION.
- **Deployed acceptance:** D0; parent reported tiny text branding and a brown square on 21 October. E2's marketing wordmark loading result is a separate surface and does not close app branding.
- **Remaining gap / next acceptance:** Parent must attach exact-candidate desktop/mobile renders, 320/390/tablet/desktop, themes, 2× text, focus/contrast/overflow/touch checks. Actual screen-reader and physical-device results remain distinct from emulation and widget semantics.

### UX-09 — Reconcile membership private reputation and rewards

Original classification: P0 truth and privacy; P1 UI | B Policy and data | Untested; activation held | Depends on approved rewards ledger and policy.

**Original pass criterion (preserved):**

> No invented balance, score, entitlement or reward availability; no v1 rewrite or duplicate redemption. Account switching cannot leak ledgers or exports. Current progress and next-month authority are distinct. Missing-authority and disabled-v2 negatives pass. Policy approval alone does not enable scoring, redemption or live grants. Sources S8–S9.

- **Source implementation (S0):** PARTIAL / PERMISSIONS AND ACTIVATION GATED: private reward/history responses, persisted redemption timestamps, replay keys and membership states exist; prospective v2 stays a nonactivating preview. Payments remain disabled. [lib/ui/screens/rewards/rewards_dashboard.dart](../../lib/ui/screens/rewards/rewards_dashboard.dart); [apps/lythaus-public-api/src/index.ts](../../apps/lythaus-public-api/src/index.ts); [packages/contracts/src/monthly-reputation-prospective.ts](../../packages/contracts/src/monthly-reputation-prospective.ts); [lib/services/subscription/subscription_service.dart](../../lib/services/subscription/subscription_service.dart).
- **Automated evidence (T0/E1):** existing test source, not newly executed here: [apps/lythaus-public-api/tests/rewards-acceptance.postgres.mjs](../../apps/lythaus-public-api/tests/rewards-acceptance.postgres.mjs); [test/ui/screens/rewards/rewards_dashboard_test.dart](../../test/ui/screens/rewards/rewards_dashboard_test.dart); [test/ui/screens/home/home_feed_navigator_membership_status_test.dart](../../test/ui/screens/home/home_feed_navigator_membership_status_test.dart).
- **Candidate visual acceptance:** V0 — PENDING INTEGRATION.
- **Deployed acceptance:** D0; parent observed Rewards still erroring after Retry on 21 October. Completed preflight E3 establishes the bounded missing mapped-role rights; runtime session/login and actual route acceptance remain unproven. No grants were executed.
- **Remaining gap / next acceptance:** Use completed E3 rather than repeat the same preflight; refresh mapping, privileges and freshness only as needed before action. Obtain explicit approval for the exact four grants and verify an authorized grantor; then accept existing authorized tiers and private reward states without live redemption/entitlement mutation. Reconcile v1/v2 using P1 above. Paid provider, commercial terms, event/entitlement schema and sandbox acceptance remain separate requirements.

### UX-10 — Prepare the complete photo journey

Original classification: P2 separate activation project | B media contract; A client afterward | Known disabled and incomplete | Depends on owned attachments; safety contract; owner gates.

**Original pass criterion (preserved):**

> A permitted image traverses real client/API/storage/review/post/feed stages. Rejected, unreviewed or foreign objects cannot publish. Interrupted operations are bounded and duplicate-safe. Approved formats/quotas and provider/storage costs are verified or decided by the owner. Exact pipeline evidence and separate activation approval precede enabling flags or detector calls. Sources S1 and S12.

- **Source implementation (S0):** PREPARATION / DISABLED: standard hosted-media backend and disabled attachment/version preparation exist; ordinary composer retains photos-unavailable guidance rather than a production picker or arbitrary-URL pseudo-upload. [lib/features/feed/presentation/create_post_screen.dart](../../lib/features/feed/presentation/create_post_screen.dart); [packages/db/src/post-attachment-preparation.ts](../../packages/db/src/post-attachment-preparation.ts); [packages/db/src/post-attachment-byte-boundary.ts](../../packages/db/src/post-attachment-byte-boundary.ts); [packages/media/src/standard-upload.ts](../../packages/media/src/standard-upload.ts).
- **Automated evidence (T0/E1):** existing test source, not newly executed here: [packages/db/tests/post-attachment-preparation.test.mjs](../../packages/db/tests/post-attachment-preparation.test.mjs); [packages/db/tests/post-attachment-byte-boundary.test.mjs](../../packages/db/tests/post-attachment-byte-boundary.test.mjs); [packages/media/tests/standard-upload.workerd.mjs](../../packages/media/tests/standard-upload.workerd.mjs).
- **Candidate visual acceptance:** V0 — PENDING INTEGRATION.
- **Deployed acceptance:** D0 / KNOWN DISABLED scope; no permitted end-to-end client/API/storage/review/feed media acceptance exists in this ledger.
- **Remaining gap / next acceptance:** Consume PUB-12–14's owned attachment, real inspection, approved format/quota/retention/cost and publication contracts, then implement and accept the client journey. Keep media flags false until complete separate evidence and activation approval.

## Security and runtime

### SEC-01 — Establish reproducible acceptance fixtures

Original classification: P0 | C Security and runtime | Planned and unverified | Depends on UX-01; authorized test environment.

**Original pass criterion (preserved):**

> Every protected operation and shipped feature has an owner, authorization expectation and executable case. Fixtures cannot access customer data. Record secret-free configuration fingerprints, binding names, and mock versus real integrations. Agree contract-based timing/expiry thresholds before execution, rather than inventing them.

- **Source implementation (S0):** PARTIAL: local authenticated acceptance target guards, canonical-schema runner and fixture manifests exist; these are reusable test foundations, not an authorized production fixture cohort. [scripts/ci/run-adr003-authenticated-acceptance.mjs](../../scripts/ci/run-adr003-authenticated-acceptance.mjs); [scripts/ci/acceptance-content-target.mjs](../../scripts/ci/acceptance-content-target.mjs); [scripts/ci/run-adr003-with-canonical-schema.mjs](../../scripts/ci/run-adr003-with-canonical-schema.mjs).
- **Automated evidence (T0/E1):** existing test source, not newly executed here: [scripts/tests/acceptance-content-target.test.mjs](../../scripts/tests/acceptance-content-target.test.mjs); [apps/lythaus-public-api/tests/auth-journey.postgres.mjs](../../apps/lythaus-public-api/tests/auth-journey.postgres.mjs).
- **Candidate visual acceptance:** V0 — PENDING INTEGRATION.
- **Deployed acceptance:** D0; existing owner sessions and public read-only observations cannot substitute for clean synthetic A/B/unverified fixtures.
- **Remaining gap / next acceptance:** Complete the route/role/async/storage matrix, record exact bindings/config fingerprints and permitted fixture ownership/retention, and obtain any missing account/email/write scope. Use isolated native-runtime fixtures; no customer-data seeding or production fault injection.

### SEC-02 — Certify fresh signup and verification

Original classification: P0 | C Security and runtime | Auth PENDING and NO-GO | Depends on SEC-01; approved delivery path.

**Original pass criterion (preserved):**

> One signup creates one identity and intended account state. Unverified users cannot enter verified-only routes; replay/expiry gives no access. Resends cannot duplicate accounts or create mail storms. Real-runtime traces and sanitized delivery timestamps meet pre-recorded product thresholds. Rerun on the deployed candidate under SEC-11; an existing session cannot satisfy this gate.

- **Source implementation (S0):** PARTIAL: email/password intake, verification, resend/recovery policy and transactional dispatch have native Worker implementations; email/acceptance evidence tooling fails closed. [apps/lythaus-public-api/src/auth-intake-runtime.ts](../../apps/lythaus-public-api/src/auth-intake-runtime.ts); [apps/lythaus-public-api/src/auth-recovery-policy.ts](../../apps/lythaus-public-api/src/auth-recovery-policy.ts); [apps/lythaus-jobs/src/transactional-email-runtime.ts](../../apps/lythaus-jobs/src/transactional-email-runtime.ts).
- **Automated evidence (T0/E1):** existing test source, not newly executed here: [apps/lythaus-public-api/tests/auth-failure-paths.workerd.mjs](../../apps/lythaus-public-api/tests/auth-failure-paths.workerd.mjs); [apps/marketing-site/tests/auth-journey.browser.mjs](../../apps/marketing-site/tests/auth-journey.browser.mjs); [scripts/tests/real-email-acceptance-evidence.test.mjs](../../scripts/tests/real-email-acceptance-evidence.test.mjs).
- **Candidate visual acceptance:** V0 — PENDING INTEGRATION.
- **Deployed acceptance:** D0 / AUTH PENDING / NO-GO; E2 only rendered empty signup/token pages and used synthetic local auth fixtures.
- **Remaining gap / next acceptance:** With an approved fresh synthetic identity and mailbox destination, prove real challenge, actual delivery, verification and app entry with timestamps; cover resend, double-click, expiry/replay, stale tokens and native compatibility on the deployed exact SHA.

### SEC-03 — Certify recovery and session revocation

Original classification: P0 | C Security and runtime | Auth PENDING and NO-GO | Depends on SEC-01–02; SEC-12 telemetry.

**Original pass criterion (preserved):**

> Revoked sessions and superseded credentials fail the documented contract through direct APIs, refresh, caches and queued requests. Recovery works without duplicate identity or manual repair. Never change or revoke the owner’s live credentials for evidence. Credential entry/change and unsupported security actions require the appropriate owner handoff or approval.

- **Source implementation (S0):** PARTIAL: reset and revocable/rotating session paths, cookie transport and Flutter session revisions exist; source does not certify recovery or all optional security actions. [apps/lythaus-public-api/src/auth-session-runtime.ts](../../apps/lythaus-public-api/src/auth-session-runtime.ts); [apps/lythaus-public-api/src/auth-session-transport.ts](../../apps/lythaus-public-api/src/auth-session-transport.ts); [lib/features/auth/application/auth_session_revision.dart](../../lib/features/auth/application/auth_session_revision.dart); [lib/features/auth/application/auth_service.dart](../../lib/features/auth/application/auth_service.dart).
- **Automated evidence (T0/E1):** existing test source, not newly executed here: [apps/lythaus-public-api/tests/auth-session-runtime.test.mjs](../../apps/lythaus-public-api/tests/auth-session-runtime.test.mjs); [apps/lythaus-public-api/tests/auth-recovery-policy.test.mjs](../../apps/lythaus-public-api/tests/auth-recovery-policy.test.mjs); [scripts/tests/flutter-auth.browser.mjs](../../scripts/tests/flutter-auth.browser.mjs).
- **Candidate visual acceptance:** V0 — PENDING INTEGRATION.
- **Deployed acceptance:** D0 / AUTH PENDING / NO-GO; no fresh permitted live recovery/revocation proof is supplied.
- **Remaining gap / next acceptance:** Use only an authorized disposable identity for two-session recovery, expiry/replay, logout/refresh and direct-API revocation checks, including cache/history/queued requests. Inventory logout-all support first. Credential changes and owner credential entry retain explicit handoff boundaries.

### SEC-04 — Prove account and role isolation

Original classification: P0 | C Security and runtime | Untested cross-account acceptance | Depends on SEC-01; SEC-03.

**Original pass criterion (preserved):**

> No cross-account record, metadata, count, file or mutation. Denial shape and existence disclosure match the product contract. Client ownership and role claims never override server authority. Share these cases with UX-03/06/07, ADM-01/02 and PUB-01 instead of maintaining divergent privacy suites.

- **Source implementation (S0):** PARTIAL: trusted principal, owner-content reader, scoped profile/privacy routes and DB transaction identity helpers enforce application-level ownership; route existence is not complete cross-account proof. [apps/lythaus-public-api/src/auth-runtime-policy.ts](../../apps/lythaus-public-api/src/auth-runtime-policy.ts); [apps/lythaus-public-api/src/owner-content-reader.ts](../../apps/lythaus-public-api/src/owner-content-reader.ts); [packages/db/src/identity.ts](../../packages/db/src/identity.ts); [apps/lythaus-public-api/src/index.ts](../../apps/lythaus-public-api/src/index.ts).
- **Automated evidence (T0/E1):** existing test source, not newly executed here: [apps/lythaus-public-api/tests/owner-content-reader.test.mjs](../../apps/lythaus-public-api/tests/owner-content-reader.test.mjs); [apps/lythaus-public-api/tests/privacy-native-runtime.postgres.mjs](../../apps/lythaus-public-api/tests/privacy-native-runtime.postgres.mjs); [test/state/providers/feed_session_isolation_test.dart](../../test/state/providers/feed_session_isolation_test.dart).
- **Candidate visual acceptance:** V0 — PENDING INTEGRATION.
- **Deployed acceptance:** D0; no full deployed A/B role-reduction or async effect matrix is supplied.
- **Remaining gap / next acceptance:** Enumerate all protected operations and replay foreign identifiers in every accepted location; inspect permitted DB/R2 effects and metadata/count disclosure. Share one case inventory with UX, ADM and PUB rather than equating separate unit suites with full isolation.

### SEC-05 — Eliminate browser and cache leakage

Original classification: P0 | C Security and runtime | Untested | Depends on SEC-03–04.

**Original pass criterion (preserved):**

> B and signed-out visitors cannot see A’s private material. Authenticated payloads never enter public/offline caches. Expired links fail; intentionally bearer-accessible links have explicit scope/lifetime and tests. Evidence contains neither tokens nor private payloads. Include pending post/media serving paths from PUB-01/14.

- **Source implementation (S0):** PARTIAL: authenticated feed responses use private,no-store, guest public caching is bounded, and viewer/session-scoped client reads exist; this does not inspect actual CDN/service-worker/offline state. [apps/lythaus-public-api/src/feed-runtime-policy.ts](../../apps/lythaus-public-api/src/feed-runtime-policy.ts); [lib/features/feed/application/feed_read_session.dart](../../lib/features/feed/application/feed_read_session.dart); [lib/core/network/dio_client.dart](../../lib/core/network/dio_client.dart); [apps/lythaus-jobs/src/privacy-export-storage.ts](../../apps/lythaus-jobs/src/privacy-export-storage.ts).
- **Automated evidence (T0/E1):** existing test source, not newly executed here: [apps/lythaus-public-api/tests/feed-runtime-policy.test.mjs](../../apps/lythaus-public-api/tests/feed-runtime-policy.test.mjs); [test/state/providers/feed_session_isolation_test.dart](../../test/state/providers/feed_session_isolation_test.dart); [scripts/tests/privacy-requests.browser.mjs](../../scripts/tests/privacy-requests.browser.mjs).
- **Candidate visual acceptance:** V0 — PENDING INTEGRATION.
- **Deployed acceptance:** D0; the E2 public runner disabled service workers and blocked authenticated requests, so it cannot close this gate.
- **Remaining gap / next acceptance:** On the deployed candidate, inspect A→logout→B/signed-out history, storage, caches, conditional/offline responses and CDN paths. Test expired/foreign media and export links with approved fixtures; retain explicit bearer-link scope/lifetime.

### SEC-06 — Harden direct API request boundaries

Original classification: P0 forgery; P1 enabled-route controls | C Security and runtime | Planned and unverified | Depends on SEC-01; SEC-03–04.

**Original pass criterion (preserved):**

> Unauthorized or forged requests cannot mutate. Rejected input has no partial side effect. Contract-based limits return recoverable behavior and resist trivial header bypass. Unknown accounts are not exposed beyond policy; no stack trace or secret configuration leaks. Bounded tests must not stress production customers.

- **Source implementation (S0):** PARTIAL: bounded JSON readers, request classification, auth rate-limit/origin transport checks and admin CORS/mutation guards exist. [apps/lythaus-public-api/src/request-body-runtime.ts](../../apps/lythaus-public-api/src/request-body-runtime.ts); [apps/lythaus-public-api/src/auth-runtime-policy.ts](../../apps/lythaus-public-api/src/auth-runtime-policy.ts); [apps/lythaus-admin-api/src/request-body-policy.ts](../../apps/lythaus-admin-api/src/request-body-policy.ts); [apps/lythaus-admin-api/src/admin-cors-policy.ts](../../apps/lythaus-admin-api/src/admin-cors-policy.ts).
- **Automated evidence (T0/E1):** existing test source, not newly executed here: [apps/lythaus-public-api/tests/request-body-runtime.test.mjs](../../apps/lythaus-public-api/tests/request-body-runtime.test.mjs); [apps/lythaus-admin-api/tests/request-body-handler.test.mjs](../../apps/lythaus-admin-api/tests/request-body-handler.test.mjs); [apps/lythaus-admin-api/tests/admin-cors-policy.test.mjs](../../apps/lythaus-admin-api/tests/admin-cors-policy.test.mjs).
- **Candidate visual acceptance:** V0 — PENDING INTEGRATION.
- **Deployed acceptance:** D0; no bounded deployed forgery/abuse matrix is supplied.
- **Remaining gap / next acceptance:** Map enabled routes to malformed/oversized/unknown-field/method/content-type cases, actual cookie/origin/CSRF rules and redirect rules. Prove no partial effect, trivial header bypass, enumeration or sensitive errors using isolated fixtures and contract-based bounds.

### SEC-07 — Prove idempotency and concurrency

Original classification: P0 integrity; otherwise P1 | C shared reliability contracts | Untested adverse paths | Depends on SEC-04; SEC-06.

**Original pass criterion (preserved):**

> One logical action produces one durable effect. Retry returns the correct prior result or documented conflict; keys/results never cross accounts. Database, queue and external-effect counts reconcile after each interruption. The single live submission observed once is useful baseline evidence, not proof of retry safety.

- **Source implementation (S0):** PARTIAL: claimed idempotency work, quarantine of uncertain outcomes, account-bound content keys and transactional outbox writes exist. [apps/lythaus-public-api/src/idempotency-runtime.ts](../../apps/lythaus-public-api/src/idempotency-runtime.ts); [apps/lythaus-public-api/src/index.ts](../../apps/lythaus-public-api/src/index.ts); [lib/features/feed/application/content_mutation.dart](../../lib/features/feed/application/content_mutation.dart).
- **Automated evidence (T0/E1):** existing test source, not newly executed here: [apps/lythaus-public-api/tests/idempotency-runtime.test.mjs](../../apps/lythaus-public-api/tests/idempotency-runtime.test.mjs); [apps/lythaus-public-api/tests/content-journey.postgres.mjs](../../apps/lythaus-public-api/tests/content-journey.postgres.mjs); [test/features/feed/application/content_mutation_test.dart](../../test/features/feed/application/content_mutation_test.dart).
- **Candidate visual acceptance:** V0 — PENDING INTEGRATION.
- **Deployed acceptance:** D0; observing a submission once does not establish retry/concurrency safety.
- **Remaining gap / next acceptance:** Bind simultaneous same/different payload/account keys, pre/post-commit interruption and dispatch-loss cases to actual effect counts across database/queue/external boundaries. Integrate PUB-08 and UX-04 cases and retain documented unknown/conflict states.

### SEC-08 — Certify queues retries and provider failure

Original classification: P0 unauthorized effects; otherwise P1 | C runtime; B pipeline adapters | Planned and unverified | Depends on SEC-04; SEC-07; SEC-12.

**Original pass criterion (preserved):**

> No unauthorized execution, duplicate external effect, infinite loop or silently lost job. Each job reaches observable success, cancellation or actionable failure. Recovery cannot repeat completed effects. Accepted for processing remains distinct from completed. Fault injection never targets customer work; provider tests retain PUB-02/05 transmission approvals.

- **Source implementation (S0):** PARTIAL: Jobs dispatch/workflows, text-review evidence, transactional email and standard-media consumers have retry/idempotency/terminal handling. Synthetic native/runtime harnesses exist. [apps/lythaus-jobs/src/index.ts](../../apps/lythaus-jobs/src/index.ts); [apps/lythaus-jobs/src/text-review-runtime.ts](../../apps/lythaus-jobs/src/text-review-runtime.ts); [apps/lythaus-jobs/src/transactional-email-runtime.ts](../../apps/lythaus-jobs/src/transactional-email-runtime.ts); [packages/media/src/standard-upload.ts](../../packages/media/src/standard-upload.ts).
- **Automated evidence (T0/E1):** existing test source, not newly executed here: [apps/lythaus-jobs/tests/text-review-queue.workerd.mjs](../../apps/lythaus-jobs/tests/text-review-queue.workerd.mjs); [apps/lythaus-jobs/tests/transactional-email-dispatch.test.mjs](../../apps/lythaus-jobs/tests/transactional-email-dispatch.test.mjs); [packages/media/tests/standard-upload.workerd.mjs](../../packages/media/tests/standard-upload.workerd.mjs).
- **Candidate visual acceptance:** V0 — PENDING INTEGRATION.
- **Deployed acceptance:** D0; hosted Queue redelivery, exhaustion and operator recovery have not been accepted here.
- **Remaining gap / next acceptance:** Prove bounded retry/exhaustion and recovery under duplicates, ordering, resumed workflows, invalid provider output and actor revocation, with reconciled effects and no private-data transmission beyond the approved evaluation scope.

### SEC-09 — Verify data lifecycle and storage privacy

Original classification: P0 disclosure or destruction; otherwise P1 | C Security and runtime | Planned and unverified | Depends on SEC-04–05; SEC-08; PUB-02.

**Original pass criterion (preserved):**

> Exports are owner-scoped; deleted fixtures become inaccessible under the declared lifecycle with accurate retention exceptions. Cleanup identifies only this run’s objects. Apply the approved seven-day test- ledger rule to its actual scope; no accidental deletion of real posts or historical cases. Test permanent purge in disposable isolated storage; production irreversible deletion is not authorized.

- **Source implementation (S0):** PARTIAL: owner-scoped privacy requests/exports, retained holds, Jobs cleanup/tombstones and standard-media cleanup reservation retention exist. [apps/lythaus-public-api/src/privacy-runtime-policy.ts](../../apps/lythaus-public-api/src/privacy-runtime-policy.ts); [apps/lythaus-jobs/src/privacy-export-storage.ts](../../apps/lythaus-jobs/src/privacy-export-storage.ts); [apps/lythaus-jobs/src/index.ts](../../apps/lythaus-jobs/src/index.ts); [packages/media/src/standard-upload.ts](../../packages/media/src/standard-upload.ts).
- **Automated evidence (T0/E1):** existing test source, not newly executed here: [apps/lythaus-public-api/tests/privacy-export-workflow.postgres.mjs](../../apps/lythaus-public-api/tests/privacy-export-workflow.postgres.mjs); [apps/lythaus-public-api/tests/profile-workflows.postgres.mjs](../../apps/lythaus-public-api/tests/profile-workflows.postgres.mjs); [packages/media/tests/standard-upload.postgres.mjs](../../packages/media/tests/standard-upload.postgres.mjs).
- **Candidate visual acceptance:** V0 — PENDING INTEGRATION.
- **Deployed acceptance:** D0; no production deletion, fixture upload/cleanup or private export was performed by this audit.
- **Remaining gap / next acceptance:** Trace permitted synthetic records and derivatives through export/deletion/holds, delayed jobs and inaccessible links; reconcile retention and cleanup manifests. Apply seven-day retention only to its approved test scope. Irreversible production purge remains separately unauthorized.

### SEC-10 — Guard migrations database access and rollback

Original classification: P0 for database changes | C Security and runtime | Planned and unverified | Depends on SEC-01; SEC-04; SEC-07.

**Original pass criterion (preserved):**

> Runtime privileges are sufficient without unexpected administrator rights; reused connections cannot leak account context. Interrupted migrations have a recoverable state. Rollback preserves data and remains schema-compatible, otherwise block release. Live grants/security changes, persistent credentials and destructive migration steps retain separate approval; a prepared migration is not deployed DDL.

- **Source implementation (S0):** PARTIAL / RELEASE BLOCKED: exact 0021-only planning/execution, target/registry checks, native recovery gates and persistent public recovery readiness are implemented; role/grant source is not observed hosted access. [scripts/ci/planetscale-0021-only-contract.mjs](../../scripts/ci/planetscale-0021-only-contract.mjs); [scripts/ci/verify-production-recovery-readiness.mjs](../../scripts/ci/verify-production-recovery-readiness.mjs); [scripts/ci/owner-recovery-exception.mjs](../../scripts/ci/owner-recovery-exception.mjs); [database/planetscale/grants/roles.sql](../../database/planetscale/grants/roles.sql).
- **Automated evidence (T0/E1):** existing test source, not newly executed here: [scripts/tests/planetscale-0021-roll-forward.postgres.mjs](../../scripts/tests/planetscale-0021-roll-forward.postgres.mjs); [scripts/tests/planetscale-0021-only-contract.test.mjs](../../scripts/tests/planetscale-0021-only-contract.test.mjs); [scripts/tests/owner-recovery-exception.test.mjs](../../scripts/tests/owner-recovery-exception.test.mjs).
- **Candidate visual acceptance:** V0 — PENDING INTEGRATION.
- **Deployed acceptance:** D0; last confirmed production schema is 0020. 0021 plan success is report generation, not executed DDL. Prior native backup/restore evidence must be refreshed at action time.
- **Remaining gap / next acceptance:** Complete fresh protected native backup, actual full restore/rehearsal, schema/registry/effective privileges/app smoke, accepted RPO/RTO, hash/review and cost/exact-candidate consent. The one-release owner exception may defer only independent/off-provider recovery as DEFERRED_BY_OWNER_EXCEPTION; it never verifies it and remains a public-release blocker after 0021.

### SEC-11 — Verify exact commit deployment and runtime parity

Original classification: P0 | C Release and runtime | Release 113 deployed; auth acceptance pending | Depends on SEC-02–10; SEC-12; independent review.

**Original pass criterion (preserved):**

> Checks, merge, artifact/deployment and smoke evidence name one full SHA. No incompatible mixed version, stale frontend, unsupported option or missing binding. Each repair creates a new candidate with affected and required checks rerun. Use ordinary GitHub approvals already authorized for requested fixes; do not bypass gates. Auth stays NO-GO until real acceptance passes.

- **Source implementation (S0):** PARTIAL / DEPLOYMENT PENDING: exact-SHA release resolution, manifest, component identity and compatible rollback gates exist and retain independent recovery readiness after schema changes. [.github/workflows/production-release.yml](../../.github/workflows/production-release.yml); [scripts/ci/build-release-manifest.mjs](../../scripts/ci/build-release-manifest.mjs); [scripts/ci/prepare-acceptance-rollback-snapshot.mjs](../../scripts/ci/prepare-acceptance-rollback-snapshot.mjs); [scripts/ci/verify-production-recovery-readiness.mjs](../../scripts/ci/verify-production-recovery-readiness.mjs).
- **Automated evidence (T0/E1):** existing test source, not newly executed here: [scripts/tests/exact-release-evidence.test.mjs](../../scripts/tests/exact-release-evidence.test.mjs); [scripts/tests/release-manifest.test.mjs](../../scripts/tests/release-manifest.test.mjs); [scripts/tests/acceptance-rollback-snapshot.test.mjs](../../scripts/tests/acceptance-rollback-snapshot.test.mjs).
- **Candidate visual acceptance:** V0 — PENDING INTEGRATION.
- **Deployed acceptance:** D0; latest verified release128 is 3880a8be4c89459dd7ef831c9385817a887511ef, distinct from source f92458a56f9ed37bbc61dad747805727c83b7738.
- **Remaining gap / next acceptance:** After genuine recovery/0021/cost/consent gates pass, deploy the exact merged candidate through normal approvals; verify all components/config/schema, perform real auth acceptance and rehearse compatible rollback. Aggregate CI success alone cannot satisfy deployment parity.

### SEC-12 — Make failures observable and keep posting held

Original classification: P0 secrets and gates; P1 failure visibility | C Observability | Planned and unverified | Depends on SEC-01; PUB-01–11 for detection.

**Original pass criterion (preserved):**

> Testers identify the failure and exact release without secrets. Required signals arrive within contract-based thresholds. Uncertain/error detection remains private and cannot activate public posting. PUB owns accuracy/policy evidence; SEC verifies observability, leakage and fail-closed behavior. Rich trend dashboards can follow required failure visibility.

- **Source implementation (S0):** PARTIAL: sanitized public error classification, correlation/audit records and digest-bound text-review evidence distinguish pending/unavailable from publication. Complete secret-marker telemetry checks remain unmapped. [apps/lythaus-public-api/src/auth-runtime-policy.ts](../../apps/lythaus-public-api/src/auth-runtime-policy.ts); [apps/lythaus-jobs/src/text-review-evidence.ts](../../apps/lythaus-jobs/src/text-review-evidence.ts); [packages/authenticity/src/text-review-evidence.ts](../../packages/authenticity/src/text-review-evidence.ts); [apps/lythaus-admin-api/src/index.ts](../../apps/lythaus-admin-api/src/index.ts).
- **Automated evidence (T0/E1):** existing test source, not newly executed here: [apps/lythaus-public-api/tests/auth-failure-paths.workerd.mjs](../../apps/lythaus-public-api/tests/auth-failure-paths.workerd.mjs); [apps/lythaus-jobs/tests/text-review-evidence.test.mjs](../../apps/lythaus-jobs/tests/text-review-evidence.test.mjs); [scripts/tests/auth-acceptance-provenance.test.mjs](../../scripts/tests/auth-acceptance-provenance.test.mjs).
- **Candidate visual acceptance:** V0 — PENDING INTEGRATION.
- **Deployed acceptance:** D0; no controlled deployed failure/arrival-time/redaction matrix is supplied.
- **Remaining gap / next acceptance:** Correlate permitted browser/API/queue/provider/database failures on one exact release, prove contract-based signal arrival and secret/private-payload exclusion across logs/screenshots/artifacts, and retain fail-closed publication. Consume PUB's evaluation cases without treating telemetry as accuracy evidence.

## Publication and media

### PUB-01 — Lock new publication and map every reader

Original classification: P0 | B Publication and policy | Hold in place; full negatives untested | Depends on SEC-01; UX-01; release receipt.

**Original pass criterion (preserved):**

> Pending, rejected, errored and unreviewed revisions cannot leak through any reader. Client status, direct calls and administrator UI cannot bypass eligibility. The existing historical fixture is not evidence that new posting is enabled. Share the access matrix with SEC-04/05 and the capability baseline with UX-01.

- **Source implementation (S0):** PARTIAL / HOLD REQUIRED: member intake enters review, Jobs ordinarily queues, and public readers apply moderation/declaration/visibility/relationship eligibility. Admin decision and editorial publication are separate publishing transitions that must remain in the matrix. [apps/lythaus-public-api/src/feed-runtime-policy.ts](../../apps/lythaus-public-api/src/feed-runtime-policy.ts); [apps/lythaus-public-api/src/index.ts](../../apps/lythaus-public-api/src/index.ts); [apps/lythaus-jobs/src/index.ts](../../apps/lythaus-jobs/src/index.ts); [apps/lythaus-admin-api/src/index.ts](../../apps/lythaus-admin-api/src/index.ts).
- **Automated evidence (T0/E1):** existing test source, not newly executed here: [apps/lythaus-public-api/tests/publication-admission.workerd.mjs](../../apps/lythaus-public-api/tests/publication-admission.workerd.mjs); [apps/lythaus-public-api/tests/content-journey.postgres.mjs](../../apps/lythaus-public-api/tests/content-journey.postgres.mjs); [apps/lythaus-jobs/tests/post-moderation.workerd.mjs](../../apps/lythaus-jobs/tests/post-moderation.workerd.mjs).
- **Candidate visual acceptance:** V0 — PENDING INTEGRATION.
- **Deployed acceptance:** D0; parent reported the historical fixture publicly visible on 21 October. That observation establishes existing content, not safe activation of new publication.
- **Remaining gap / next acceptance:** Complete all-role reader/transition negatives for pending/rejected/error/stale revisions through URL/feed/search/comments/notifications/previews/export/cache. Explicitly inspect admin allow/editorial paths against the current complete-pipeline hold; no fixture publication or status override during UAT.

### PUB-02 — Confirm policy permissions and test data rules

Original classification: P0 | B policy; C authority verification | Pending explicit contract decisions | Depends on PUB-01; owner decisions page.

**Original pass criterion (preserved):**

> Ambiguities are owner decisions, never invented policy. Approved seven-day test-ledger retention covers its raw content, provider responses, logs, exports and CI artifacts with deletion evidence, without deleting genuine posts or historical cases. No live provider request or production DDL before its applicable approval. This plan grants neither policy nor activation approval.

- **Source implementation (S0):** PARTIAL / AUTHORITY GATED: disclosure/counting policy, independent evidence contracts, versioned appeals and data/permission gates exist. Dated plan wording does not settle missing runtime defaults, thresholds or provider consent. [docs/policy/current-policy-authority.md](../../docs/policy/current-policy-authority.md); [packages/contracts/src/content-policy.ts](../../packages/contracts/src/content-policy.ts); [packages/contracts/src/monthly-peer-appeal-policy.ts](../../packages/contracts/src/monthly-peer-appeal-policy.ts); [packages/authenticity/src/dataset-provenance.ts](../../packages/authenticity/src/dataset-provenance.ts).
- **Automated evidence (T0/E1):** existing test source, not newly executed here: [packages/contracts/tests/critical-content-policy.test.mjs](../../packages/contracts/tests/critical-content-policy.test.mjs); [packages/contracts/tests/monthly-peer-appeal.test.mjs](../../packages/contracts/tests/monthly-peer-appeal.test.mjs); [scripts/tests/private-evaluation-receipt.test.mjs](../../scripts/tests/private-evaluation-receipt.test.mjs).
- **Candidate visual acceptance:** V0 — PENDING INTEGRATION.
- **Deployed acceptance:** D0; no new provider requests, DDL, grants, credential creation or activation were performed or authorized by this ledger.
- **Remaining gap / next acceptance:** Resolve only genuinely missing threshold/quality/harm/uncertainty and D09 operational decisions; verify exact service identities, provider/destination/fields/retention and lawful dataset purpose. Record deletion evidence for authorized test artifacts without touching genuine historical content.

### PUB-03 — Implement the complete decision pipeline

Original classification: P0 | B Publication and policy | Incomplete and unverified | Depends on PUB-01–02.

**Original pass criterion (preserved):**

> Incomplete or uncertain evidence leaves content private. Safe AI-generated material follows the provenance rejection rule; eligible AI-assisted text still passes all other checks. A model response cannot publish independently. Traces contain stage, input digest, result, policy/model/provider versions and final server decision, with private data redacted under SEC-12.

- **Source implementation (S0):** PARTIAL / UNQUALIFIED: intake/outbox/revision-bound text review, independent safety-evidence preparation and guarded reader states exist. Current evaluation abstains on unqualified safety/authorship; model output has no publication authority. [apps/lythaus-jobs/src/text-review-runtime.ts](../../apps/lythaus-jobs/src/text-review-runtime.ts); [apps/lythaus-jobs/src/post-safety-evidence.ts](../../apps/lythaus-jobs/src/post-safety-evidence.ts); [packages/authenticity/src/evaluation.ts](../../packages/authenticity/src/evaluation.ts); [packages/authenticity/src/text-review-evidence.ts](../../packages/authenticity/src/text-review-evidence.ts).
- **Automated evidence (T0/E1):** existing test source, not newly executed here: [apps/lythaus-jobs/tests/text-review-runtime.test.mjs](../../apps/lythaus-jobs/tests/text-review-runtime.test.mjs); [apps/lythaus-jobs/tests/text-review-queue.workerd.mjs](../../apps/lythaus-jobs/tests/text-review-queue.workerd.mjs); [packages/authenticity/tests/evaluation.test.mjs](../../packages/authenticity/tests/evaluation.test.mjs).
- **Candidate visual acceptance:** V0 — PENDING INTEGRATION.
- **Deployed acceptance:** D0; no complete hosted text decision pipeline or qualified text-authorship result is established.
- **Remaining gap / next acceptance:** Finish and evidence every required authenticity/safety/quality/uncertainty/review stage on immutable inputs, with real approved providers and all missing/malformed/unsupported/outage states. Keep content private when any required stage is unavailable; preserve digest/versioned stage traces.

### PUB-04 — Enforce write path and Unicode parity

Original classification: P0 | B shared write contracts; A client consumer | Planned and unverified | Depends on PUB-02–03.

**Original pass criterion (preserved):**

> Client/server expected counts and decisions agree for every operation, content class and role. Direct API and cumulative-edit regressions pass. No unrelated cross-post quota is invented. An unreviewed edit cannot inherit approval. UX-04 uses these shared fixtures instead of creating a second incompatible limit implementation.

- **Source implementation (S0):** PARTIAL: shared NFC-trimmed grapheme policy enforces 249 AI-assisted characters and generated-content rejection; Public write paths and Admin allow consume that contract. Disclosure checks do not certify safety. [packages/contracts/src/content-policy.ts](../../packages/contracts/src/content-policy.ts); [apps/lythaus-public-api/src/content-runtime-policy.ts](../../apps/lythaus-public-api/src/content-runtime-policy.ts); [apps/lythaus-admin-api/src/index.ts](../../apps/lythaus-admin-api/src/index.ts); [lib/features/feed/application/post_creation_providers.dart](../../lib/features/feed/application/post_creation_providers.dart).
- **Automated evidence (T0/E1):** existing test source, not newly executed here: [packages/contracts/tests/critical-content-policy.test.mjs](../../packages/contracts/tests/critical-content-policy.test.mjs); [apps/lythaus-public-api/tests/publication-admission.workerd.mjs](../../apps/lythaus-public-api/tests/publication-admission.workerd.mjs); [test/features/feed/presentation/create_post_screen_test.dart](../../test/features/feed/presentation/create_post_screen_test.dart).
- **Candidate visual acceptance:** V0 — PENDING INTEGRATION.
- **Deployed acceptance:** D0; no exact deployed create/edit/comment/reply/admin Unicode parity matrix is supplied.
- **Remaining gap / next acceptance:** Map 248/249/250, combining/emoji/bidi/invisible/line-ending/language cases to client and all direct write paths, including cumulative edits/context and stale decisions. Keep one shared counting authority; do not invent cross-post quotas.

### PUB-05 — Validate evidence and hostile provider behavior

Original classification: P0 | B provider adapters | Planned; live access approval pending | Depends on PUB-02–03; SEC-06/08/12.

**Original pass criterion (preserved):**

> Declaration, style, absent metadata or classifier confidence alone never proves human authorship. Injection cannot change policy, call tools, publish or obtain secrets. Results match the immutable content and approved contract. Reviewers see evidence limitations; denied or unapproved provider/data transmission remains blocked, not simulated as a real pass.

- **Source implementation (S0):** PARTIAL: provider-neutral evidence validation separates declared/observed/unavailable results, schema/digest/version checks and advisory-only output; malformed evaluation output is unavailable. [packages/authenticity/src/evaluation.ts](../../packages/authenticity/src/evaluation.ts); [packages/authenticity/src/text-review-evidence.ts](../../packages/authenticity/src/text-review-evidence.ts); [packages/authenticity/src/private-alpha.ts](../../packages/authenticity/src/private-alpha.ts); [packages/authenticity/src/beta.ts](../../packages/authenticity/src/beta.ts).
- **Automated evidence (T0/E1):** existing test source, not newly executed here: [packages/authenticity/tests/evaluation.test.mjs](../../packages/authenticity/tests/evaluation.test.mjs); [apps/lythaus-jobs/tests/text-review-evidence.test.mjs](../../apps/lythaus-jobs/tests/text-review-evidence.test.mjs); [scripts/tests/private-evaluation-receipt.test.mjs](../../scripts/tests/private-evaluation-receipt.test.mjs).
- **Candidate visual acceptance:** V0 — PENDING INTEGRATION.
- **Deployed acceptance:** D0; no approved real-provider input-processing/hostile-output qualification is supplied.
- **Remaining gap / next acceptance:** Bind actual approved transmitted input/digest to real provider traces; challenge injection, spoofed/stale callbacks, impossible values, oversized/invalid responses and retry/destination limits. Keep provider access or data-transfer denials BLOCKED and scores/declarations insufficient for human-origin proof.

### PUB-06 — Separate harm safety from provenance

Original classification: P0 | B Publication and policy | Planned and unverified | Depends on PUB-02–03.

**Original pass criterion (preserved):**

> Human provenance, reputation or popularity never overrides harmful-content blocking; benign AI-generated content still follows provenance policy. Uncertain authenticity is not automatically severe harm, and uncertain safety is never silently safe. Independently adjudicated cases and severity-specific false-positive/negative review demonstrate contextual policy behavior.

- **Source implementation (S0):** PARTIAL / CALIBRATION MISSING: separate safety preparation and evidence fields exist; evaluation-only text/media results cannot collapse provenance and safety or grant publication. [apps/lythaus-jobs/src/post-safety-evidence.ts](../../apps/lythaus-jobs/src/post-safety-evidence.ts); [packages/authenticity/src/evaluation.ts](../../packages/authenticity/src/evaluation.ts); [packages/authenticity/src/openai-moderation.ts](../../packages/authenticity/src/openai-moderation.ts); [packages/authenticity/src/beta.ts](../../packages/authenticity/src/beta.ts).
- **Automated evidence (T0/E1):** existing test source, not newly executed here: [apps/lythaus-jobs/tests/post-safety-evidence.workerd.mjs](../../apps/lythaus-jobs/tests/post-safety-evidence.workerd.mjs); [packages/authenticity/tests/openai-moderation.workerd.mjs](../../packages/authenticity/tests/openai-moderation.workerd.mjs); [packages/authenticity/tests/evaluation.test.mjs](../../packages/authenticity/tests/evaluation.test.mjs).
- **Candidate visual acceptance:** V0 — PENDING INTEGRATION.
- **Deployed acceptance:** D0; no independently adjudicated contextual real-provider safety/error report is supplied.
- **Remaining gap / next acceptance:** Run rights-cleared, approved safety/provenance cross-product cases with category/severity/language/context labels, independent adjudication and severity-specific error analysis. Harmful human content must remain blocked and uncertain safety cannot become silently safe.

### PUB-07 — Calibrate decisions and protect legitimate contributors

Original classification: P0 | B evaluation; reviewer independent challenge | Planned; thresholds require approval | Depends on PUB-02; PUB-05–06.

**Original pass criterion (preserved):**

> Meet precommitted owner-approved criteria; sparse or failing groups remain unsupported or routed to review. Identical text is not judged differently solely for popularity. Deliver dataset documentation, confusion matrices, calibration/subgroup reports and error inventory. Explicitly state limits of inferring authorship from text; no universal or 110 percent reliability guarantee.

- **Source implementation (S0):** PREPARATION / UNQUALIFIED: evaluation metrics, dataset lineage/manifests and research runners exist. Existing image specialist/proxy research is limited evidence; no current general text-authorship qualification follows. [packages/authenticity/src/evaluation.ts](../../packages/authenticity/src/evaluation.ts); [packages/authenticity/src/dataset-provenance.ts](../../packages/authenticity/src/dataset-provenance.ts); [packages/authenticity/src/research-manifests.ts](../../packages/authenticity/src/research-manifests.ts); [packages/authenticity/src/research-runner.ts](../../packages/authenticity/src/research-runner.ts).
- **Automated evidence (T0/E1):** existing test source, not newly executed here: [packages/authenticity/tests/evaluation.test.mjs](../../packages/authenticity/tests/evaluation.test.mjs); [scripts/tests/private-evaluation-receipt.test.mjs](../../scripts/tests/private-evaluation-receipt.test.mjs).
- **Candidate visual acceptance:** V0 — PENDING INTEGRATION.
- **Deployed acceptance:** D0; no owner-approved launch calibration/held-out acceptance packet is established. Historical CPU-evaluation authorization expired; it is not current access approval.
- **Remaining gap / next acceptance:** Freeze consent/licensing, ground truth, independent holdout/family splits, model/preprocessing/runtime identities and precommitted error/coverage budgets. Obtain current bounded provider/data/cost access; report real confusion/calibration/subgroup uncertainty and errors. Synthetic tests cannot qualify a detector.

### PUB-08 — Make decisions and publication race safe

Original classification: P0 | B publication state; C shared reliability | Planned and unverified | Depends on PUB-03–06; SEC-07–08.

**Original pass criterion (preserved):**

> One logical contribution cannot duplicate or publish prematurely. A stale allow, model result or appeal cannot approve a replacement revision. Public readers receive only the approved snapshot; unreviewed edits stay private. State-machine/concurrency traces prove recoverable terminal states and no split-brain decision across queues, database and caches.

- **Source implementation (S0):** PARTIAL: source-event/digest/declaration fences, locked moderation/review cycles, idempotent outbox and version-bound community restoration exist. [apps/lythaus-jobs/src/text-review-runtime.ts](../../apps/lythaus-jobs/src/text-review-runtime.ts); [apps/lythaus-admin-api/src/moderation-rereview-runtime.ts](../../apps/lythaus-admin-api/src/moderation-rereview-runtime.ts); [packages/db/src/community-appeal-closure.ts](../../packages/db/src/community-appeal-closure.ts); [apps/lythaus-public-api/src/idempotency-runtime.ts](../../apps/lythaus-public-api/src/idempotency-runtime.ts).
- **Automated evidence (T0/E1):** existing test source, not newly executed here: [apps/lythaus-admin-api/tests/moderation-rereview.postgres.mjs](../../apps/lythaus-admin-api/tests/moderation-rereview.postgres.mjs); [apps/lythaus-public-api/tests/content-journey.postgres.mjs](../../apps/lythaus-public-api/tests/content-journey.postgres.mjs); [apps/lythaus-jobs/tests/text-review-queue.workerd.mjs](../../apps/lythaus-jobs/tests/text-review-queue.workerd.mjs).
- **Candidate visual acceptance:** V0 — PENDING INTEGRATION.
- **Deployed acceptance:** D0; no permitted hosted multi-component concurrency/interruption acceptance is supplied.
- **Remaining gap / next acceptance:** Reconcile duplicate/out-of-order delivery, edits/deletes, stale allow/appeal results, crashes and deployment interruption across actual DB/queues/caches. Prove only the approved snapshot is readable and every interruption reaches a recoverable state without manual production overrides.

### PUB-09 — Implement versioned equal vote timed appeals

Original classification: P0 | B Publication and policy | Planned; exact mechanics pending | Depends on PUB-02; PUB-08.

**Original pass criterion (preserved):**

> One eligible voter has one effective equal-weight ballot; reputation, popularity, provider score and administrator status cannot secretly add weight. Close once; bind outcome to the appealed version. Substantive edits cannot inherit the result. Controlled-clock and historical preservation tests pass, and non- overridable safety rules remain enforced.

- **Source implementation (S0):** PARTIAL / RULES AND ACTIVATION GATED: equal-weight timed candidate evaluator, versioned ballot access/mutations and frozen-revision closure exist. Historical weighted/adjudicated cases retain their own policy. [packages/contracts/src/monthly-peer-appeal-policy.ts](../../packages/contracts/src/monthly-peer-appeal-policy.ts); [packages/db/src/community-appeal-access.ts](../../packages/db/src/community-appeal-access.ts); [packages/db/src/community-appeal-mutations.ts](../../packages/db/src/community-appeal-mutations.ts); [packages/db/src/community-appeal-closure.ts](../../packages/db/src/community-appeal-closure.ts).
- **Automated evidence (T0/E1):** existing test source, not newly executed here: [packages/contracts/tests/monthly-peer-appeal.test.mjs](../../packages/contracts/tests/monthly-peer-appeal.test.mjs); [apps/lythaus-public-api/tests/community-appeals.postgres.mjs](../../apps/lythaus-public-api/tests/community-appeals.postgres.mjs).
- **Candidate visual acceptance:** V0 — PENDING INTEGRATION.
- **Deployed acceptance:** D0 / KNOWN GATED scope; no new standard-appeal activation or complete deployed ballot/closure acceptance is supplied.
- **Remaining gap / next acceptance:** Obtain missing D09 duration/quorum/extension/tie/eligibility/ballot conventions and restricted/unresolved accountability, then run controlled-clock boundaries, concurrency, historical preservation and stale safety/edit tests. Equal votes and no routine Editorial confirmation are settled direction, not reopened decisions.

### PUB-10 — Complete review tools and reconcile pending work

Original classification: P0 | B backend/admin; A author states | Pending posts observed; workflow unverified | Depends on PUB-03; PUB-08–09; ADM-02.

**Original pass criterion (preserved):**

> No user reads another person’s private content or case evidence. Administrator allow cannot skip safety/version checks. Review and audit tests, author-state captures and recovery runbook pass. Remaining pending is not proof the complete pipeline ran. Resolve the pending-comment invitation copy without enabling replies before publication.

- **Source implementation (S0):** PARTIAL: review queues, reason/audit handling, stale-cycle checks and truthful under-review author states exist; pending detail explicitly says comments are unavailable. Admin allow currently calls disclosure validation, so complete safety-stage gating still needs explicit proof. [apps/lythaus-admin-api/src/index.ts](../../apps/lythaus-admin-api/src/index.ts); [apps/lythaus-admin-api/src/moderation-rereview-runtime.ts](../../apps/lythaus-admin-api/src/moderation-rereview-runtime.ts); [lib/features/feed/presentation/post_detail_screen.dart](../../lib/features/feed/presentation/post_detail_screen.dart); [lib/features/profile/presentation/profile_content_status.dart](../../lib/features/profile/presentation/profile_content_status.dart).
- **Automated evidence (T0/E1):** existing test source, not newly executed here: [apps/lythaus-admin-api/tests/moderation-rereview-handler.test.mjs](../../apps/lythaus-admin-api/tests/moderation-rereview-handler.test.mjs); [apps/lythaus-admin-api/tests/moderation-rereview.postgres.mjs](../../apps/lythaus-admin-api/tests/moderation-rereview.postgres.mjs); [test/features/feed/presentation/post_detail_screen_test.dart](../../test/features/feed/presentation/post_detail_screen_test.dart).
- **Candidate visual acceptance:** V0 — PENDING INTEGRATION.
- **Deployed acceptance:** D0; historic pending records are not completion evidence. No current authorized record reconciliation was performed in this lane.
- **Remaining gap / next acceptance:** Reconcile named original pending records read-only without resubmission; prove reviewer identity, audit atomicity, stale/double-submit failures and author recovery copy. Establish that admin allow cannot bypass missing safety/version eligibility; retain unavailable replies.

### PUB-11 — Run the text publication gate on the exact release

Original classification: P0 | Reviewer and C release | Blocked pending PUB-01–10 | Depends on PUB-01–10; SEC-11; owner activation decision.

**Original pass criterion (preserved):**

> No unresolved bypass, security failure, critical safety defect or missing calibration criterion. All required checks pass and deployment equals the exact merged commit. Owner-testing deployment remains private while validation is unfinished. Merge, deployment and detection success do not activate public posting; activation retains its explicit owner gate. No weakened checks or blanket administrator approval.

- **Source implementation (S0):** PREPARATION / PUBLIC TEXT BLOCKED: release manifest and aggregate publication runner exist; no complete PUB-01–10 calibration/runtime acceptance dossier or activation approval follows. [scripts/ci/run-publication-pg17.mjs](../../scripts/ci/run-publication-pg17.mjs); [.github/workflows/production-release.yml](../../.github/workflows/production-release.yml); [scripts/ci/build-release-manifest.mjs](../../scripts/ci/build-release-manifest.mjs).
- **Automated evidence (T0/E1):** existing test source, not newly executed here: [scripts/tests/publication-pg17-runner.test.mjs](../../scripts/tests/publication-pg17-runner.test.mjs); [scripts/tests/exact-release-evidence.test.mjs](../../scripts/tests/exact-release-evidence.test.mjs); [scripts/tests/release-manifest.test.mjs](../../scripts/tests/release-manifest.test.mjs).
- **Candidate visual acceptance:** V0 — PENDING INTEGRATION.
- **Deployed acceptance:** D0; exact-main CI E1 passed, but f92458a5 has no supplied deployment or owner acceptance and the complete public text gate remains open.
- **Remaining gap / next acceptance:** Close applicable PUB/SEC gaps, attach independent review, exact merged SHA/checks/artifacts/config/policy/provider versions and rollback to SEC-11's single dossier. Keep owner-testing content private; explicit public-posting activation remains separate.

### PUB-12 — Establish private attachment ownership and lifecycle

Original classification: P1 media gate; phased | B Media and data | Known incomplete; media disabled | Depends on PUB-01–02; PUB-08; SEC-10.

**Original pass criterion (preserved):**

> Upload creates no public object/URL. Foreign assets cannot be linked; inspected bytes cannot be substituted. Real storage/database/service roles are least-privilege. Approved schema, migration/recovery, private-access and ownership tests are recorded; media flags remain false. UX-10 is the client umbrella, not a duplicate backend project. Source S12.

- **Source implementation (S0):** PARTIAL / DISABLED: private standard uploads, exact byte/digest binding, versioned attachment preparation and cleanup exist. Admission retains terminal original-byte reservations until confirmed source/orphan-derivative cleanup. [packages/media/src/standard-upload.ts](../../packages/media/src/standard-upload.ts); [packages/db/src/post-attachment-preparation.ts](../../packages/db/src/post-attachment-preparation.ts); [packages/db/src/post-attachment-byte-boundary.ts](../../packages/db/src/post-attachment-byte-boundary.ts); [apps/lythaus-public-api/src/index.ts](../../apps/lythaus-public-api/src/index.ts).
- **Automated evidence (T0/E1):** existing test source, not newly executed here: [packages/media/tests/standard-upload.workerd.mjs](../../packages/media/tests/standard-upload.workerd.mjs); [packages/media/tests/standard-upload.postgres.mjs](../../packages/media/tests/standard-upload.postgres.mjs); [packages/db/tests/post-attachment-preparation.postgres.mjs](../../packages/db/tests/post-attachment-preparation.postgres.mjs).
- **Candidate visual acceptance:** V0 — PENDING INTEGRATION.
- **Deployed acceptance:** D0 / KNOWN DISABLED scope; synthetic R2/PostgreSQL tests do not prove actual hosted roles/storage or authorize uploads/deletion.
- **Remaining gap / next acceptance:** Finish approved post/asset relationship and retention/format/quota contracts, real mapped roles, recovery/migration and hosted ownership tests. Existing per-owner retention bounds cleanup churn; source plus derivative can temporarily reach twice that quota and no global physical/billing cap is established.

### PUB-13 — Validate real media inspection

Original classification: P1 media gate; phased | B Media and data | Known incomplete; provider approval pending | Depends on PUB-05–07; PUB-12.

**Original pass criterion (preserved):**

> Digest-linked traces prove approved providers inspected the relevant input. Unsupported/inconclusive assets remain private. Media calibration, false positives and coverage limitations are documented against approved criteria. Do not collect unlawful material or send user media to unapproved providers. Source preparation is not live detector readiness.

- **Source implementation (S0):** PREPARATION / UNQUALIFIED: MIME/checksum and decoded-image integrity processing plus image research/evidence structures exist; standard processing records not-executed detector evidence and review required. [packages/media/src/standard-upload.ts](../../packages/media/src/standard-upload.ts); [apps/lythaus-jobs/src/index.ts](../../apps/lythaus-jobs/src/index.ts); [packages/authenticity/src/research-image.ts](../../packages/authenticity/src/research-image.ts); [packages/authenticity/src/media-intake.ts](../../packages/authenticity/src/media-intake.ts).
- **Automated evidence (T0/E1):** existing test source, not newly executed here: [packages/media/tests/standard-upload.test.mjs](../../packages/media/tests/standard-upload.test.mjs); [packages/media/tests/standard-upload.workerd.mjs](../../packages/media/tests/standard-upload.workerd.mjs); [packages/authenticity/tests/evaluation.test.mjs](../../packages/authenticity/tests/evaluation.test.mjs).
- **Candidate visual acceptance:** V0 — PENDING INTEGRATION.
- **Deployed acceptance:** D0 / KNOWN DISABLED scope; no real approved pixel/frame/audio provenance-and-harm qualification is established.
- **Remaining gap / next acceptance:** Agree supported coverage and lawful assets, then obtain approved provider/data/cost envelope and real digest-linked inspection/calibration evidence. Test corruption, MIME/decompression hazards, frames/transforms/metadata/injection and caption disagreement. Unsupported or inconclusive media stays private.

### PUB-14 — Validate media serving and staged release

Original classification: P1 media gate; phased | B serving; A client after contract | Blocked on complete media chain | Depends on PUB-04; PUB-08–13; UX-10; SEC-05.

**Original pass criterion (preserved):**

> Asset changes invalidate applicable decisions; pending assets never leak. Browser/API evidence covers version races, serving authorization, accessibility, exact merged commit and rollback. Text-only service remains safe during media outage. Media flags stay false until this separate evidence gate and owner activation approval pass; text approval does not activate media.

- **Source implementation (S0):** PARTIAL / DISABLED: private quarantine/approved buckets, retryable integrity derivatives and owner-serving boundaries exist. The full approved attachment→inspection→publication→client chain is not complete. [packages/media/src/standard-upload.ts](../../packages/media/src/standard-upload.ts); [apps/lythaus-jobs/src/index.ts](../../apps/lythaus-jobs/src/index.ts); [lib/ui/components/feed_card.dart](../../lib/ui/components/feed_card.dart); [apps/lythaus-public-api/wrangler.jsonc](../../apps/lythaus-public-api/wrangler.jsonc); [apps/lythaus-jobs/wrangler.jsonc](../../apps/lythaus-jobs/wrangler.jsonc).
- **Automated evidence (T0/E1):** existing test source, not newly executed here: [packages/media/tests/standard-upload.workerd.mjs](../../packages/media/tests/standard-upload.workerd.mjs); [packages/media/tests/standard-upload.postgres.mjs](../../packages/media/tests/standard-upload.postgres.mjs); [packages/db/tests/post-attachment-byte-boundary.test.mjs](../../packages/db/tests/post-attachment-byte-boundary.test.mjs).
- **Candidate visual acceptance:** V0 — PENDING INTEGRATION.
- **Deployed acceptance:** D0 / KNOWN DISABLED scope; MEDIA_UPLOADS_ENABLED and MEDIA_PROCESSING_ENABLED are false in source configuration. Source configuration is not a fresh deployed configuration observation.
- **Remaining gap / next acceptance:** After PUB-12/13 and UX-10, prove real client replacement/cancel/retry races, serving/signed URL/cache isolation, accessible rendering, exact-deployment identity and rollback with approved fixtures. Approve media activation separately; text approval never enables media.

## Administration

### ADM-01 — Verify accounts and waitlist operations

Original classification: P1 and P0 privacy | B Admin and data | Untested real records | Depends on UX-01; canonical admin access.

**Original pass criterion (preserved):**

> Known records are found by supported keys with real status, no false identity merge, omissions/duplicates under the defined snapshot contract or unexpected invitation. Sensitive records remain owner-scoped. Signup visibility must be paired with independent real authentication acceptance. Sources S6–S7.

- **Source implementation (S0):** PARTIAL: Access-scoped account/support and separate waitlist handlers, bounded exact lookup, filters and canonical account statuses exist. [apps/lythaus-admin-api/src/index.ts](../../apps/lythaus-admin-api/src/index.ts); [apps/lythaus-admin-api/src/waitlist-runtime-policy.ts](../../apps/lythaus-admin-api/src/waitlist-runtime-policy.ts); [apps/lythaus-admin-api/src/account-support-runtime.ts](../../apps/lythaus-admin-api/src/account-support-runtime.ts); [apps/control-panel/src/pages/Accounts.jsx](../../apps/control-panel/src/pages/Accounts.jsx).
- **Automated evidence (T0/E1):** existing test source, not newly executed here: [apps/lythaus-admin-api/tests/contact-lists.postgres.mjs](../../apps/lythaus-admin-api/tests/contact-lists.postgres.mjs); [apps/lythaus-admin-api/tests/account-support.postgres.mjs](../../apps/lythaus-admin-api/tests/account-support.postgres.mjs); [apps/control-panel/src/pages/Accounts.test.jsx](../../apps/control-panel/src/pages/Accounts.test.jsx).
- **Candidate visual acceptance:** V0 — PENDING INTEGRATION.
- **Deployed acceptance:** D0; E2 only observed the unauthenticated admin redirect to Access, not authenticated records or permissions.
- **Remaining gap / next acceptance:** Using an existing authorized owner/admin session, reconcile selected genuine records read-only and prove supported search/cursor/status/denial behavior, preserving the 1,000-contact bound. Pair genuine signup visibility with SEC-02; invitations/linking/purge require disposable scope or separate approval.

### ADM-02 — Verify moderation permissions and audit

Original classification: P0 | B Admin and data | Untested production acceptance | Depends on RBAC; audit; publication hold.

**Original pass criterion (preserved):**

> Denied roles cannot mutate; decision and audit commit together or fail safely; retries cannot duplicate decisions. Public/member responses never disclose private case evidence. Publishing and assessment holds remain effective even when moderation UI exists. Do not publish fixture content during UAT or broaden RBAC to repair UI. Source S6.

- **Source implementation (S0):** PARTIAL: Access/JWT membership checks, request guards, transactional decisions/audit and revision-safe rereview exist; profile editing is deliberately unavailable where canonical grants lack capability. [apps/lythaus-admin-api/src/admin-access-runtime-policy.ts](../../apps/lythaus-admin-api/src/admin-access-runtime-policy.ts); [apps/lythaus-admin-api/src/index.ts](../../apps/lythaus-admin-api/src/index.ts); [apps/lythaus-admin-api/src/moderation-rereview-runtime.ts](../../apps/lythaus-admin-api/src/moderation-rereview-runtime.ts); [database/planetscale/grants/roles.sql](../../database/planetscale/grants/roles.sql).
- **Automated evidence (T0/E1):** existing test source, not newly executed here: [apps/lythaus-admin-api/tests/admin-access-runtime-policy.test.mjs](../../apps/lythaus-admin-api/tests/admin-access-runtime-policy.test.mjs); [apps/lythaus-admin-api/tests/moderation-rereview.postgres.mjs](../../apps/lythaus-admin-api/tests/moderation-rereview.postgres.mjs); [apps/lythaus-admin-api/tests/appeal-adjudication-handler.test.mjs](../../apps/lythaus-admin-api/tests/appeal-adjudication-handler.test.mjs).
- **Candidate visual acceptance:** V0 — PENDING INTEGRATION.
- **Deployed acceptance:** D0; no owner/admin/revoked/member deployed mutation/audit acceptance was supplied.
- **Remaining gap / next acceptance:** Prove direct-API denials and atomic reason/decision/audit handling, including stale/double-submit/audit failure/cache visibility. Include full safety/publication hold checks from PUB-01/10; do not expand RBAC or publish fixtures to repair/test UI.

### ADM-03 — Complete separate problem and suggestion flows

Original classification: P2 while disabled; P0 before activation | B Admin and data | Known disabled or gated | Depends on ADM-02; UX-09; privacy/schema gates.

**Original pass criterion (preserved):**

> Members see only their own allowed conversation; owner-private evidence stays private. Disabled UI/server return the contract’s unavailable state. Submission, acceptance or closure cannot mint rewards without the separately approved active award contract. Resolve retention, contributor privacy, notification, grants and schema gates before activation. Source S8.

- **Source implementation (S0):** PARTIAL / DISABLED: separate member/admin problem and suggestion surfaces, versioned support data/privacy/limits and owner-private note contracts exist; member support flag defaults false. [lib/features/support/support_feedback_config.dart](../../lib/features/support/support_feedback_config.dart); [lib/features/support/presentation/support_feedback_screen.dart](../../lib/features/support/presentation/support_feedback_screen.dart); [packages/db/src/support-feedback-runtime.ts](../../packages/db/src/support-feedback-runtime.ts); [packages/db/src/support-feedback-contributor-privacy.ts](../../packages/db/src/support-feedback-contributor-privacy.ts); [apps/control-panel/src/pages/SupportFeedback.jsx](../../apps/control-panel/src/pages/SupportFeedback.jsx).
- **Automated evidence (T0/E1):** existing test source, not newly executed here: [packages/db/tests/support-feedback-lifecycle.postgres.mjs](../../packages/db/tests/support-feedback-lifecycle.postgres.mjs); [packages/db/tests/support-feedback-contributors.postgres.mjs](../../packages/db/tests/support-feedback-contributors.postgres.mjs); [apps/control-panel/src/pages/SupportFeedback.test.jsx](../../apps/control-panel/src/pages/SupportFeedback.test.jsx).
- **Candidate visual acceptance:** V0 — PENDING INTEGRATION.
- **Deployed acceptance:** D0 / KNOWN GATED scope; no live support submission, notification, award or activation acceptance was supplied.
- **Remaining gap / next acceptance:** Resolve exact schema/grants/retention/contributor privacy/notification gates, then prove own-conversation history, owner-only evidence, duplicate/quota/paging/interrupted-send and approved export/deletion/hold paths. Acceptance/closure must not mint rewards; unknown attachments/diagnostics remain unavailable.

### ADM-04 — Make analytics source backed and privacy safe

Original classification: P1 Overview; P2 opt-in activity | B Admin and data | Untested reconciliation; activation held | Depends on ADM-01–02; approved definitions.

**Original pass criterion (preserved):**

> Each metric has source, definition, population, UTC window and timestamp. Missing is not zero; expired/capped/denied samples clear misleading values. No mock numbers; authoritative fixture metadata excludes acceptance content. Consent withdrawal, deletion/holds and bounded approved retention pass before activity activation; no extrapolation from opt-in users. Sources S7 and S10.

- **Source implementation (S0):** PARTIAL / ACTIVITY GATED: Overview SQL-backed metric definitions, UTC windows, fixture exclusion, lower-bound semantics and separately gated opt-in activity/privacy exist. [apps/lythaus-admin-api/src/overview-runtime.ts](../../apps/lythaus-admin-api/src/overview-runtime.ts); [apps/lythaus-admin-api/src/overview-policy.ts](../../apps/lythaus-admin-api/src/overview-policy.ts); [packages/db/src/activity-measurement.ts](../../packages/db/src/activity-measurement.ts); [apps/control-panel/src/pages/overview-activity.js](../../apps/control-panel/src/pages/overview-activity.js).
- **Automated evidence (T0/E1):** existing test source, not newly executed here: [apps/lythaus-admin-api/tests/overview.postgres.mjs](../../apps/lythaus-admin-api/tests/overview.postgres.mjs); [apps/lythaus-admin-api/tests/activity-measurement-handler.test.mjs](../../apps/lythaus-admin-api/tests/activity-measurement-handler.test.mjs); [packages/db/tests/activity-measurement.postgres.mjs](../../packages/db/tests/activity-measurement.postgres.mjs).
- **Candidate visual acceptance:** V0 — PENDING INTEGRATION.
- **Deployed acceptance:** D0; no current selected-production-sample reconciliation or consent/retention acceptance was supplied.
- **Remaining gap / next acceptance:** Reconcile tiny disposable datasets and authorized read-only samples against metric definitions, UTC cutoffs, sample caps/denials and fixture metadata. Missing values stay unknown. Obtain approved consent/withdrawal/deletion/hold/retention evidence before opt-in activity activation; do not infer global engagement or provider cost.

## 22 October integrated UI evidence overlay (V1)

This update records the parent's integrated UI product snapshot
`06572a4c154c45b00941f1336c458e8f72e166ab`. Subsequent commits in that
integration sequence change tests only. The S0 source rows above remain the
frozen `f92458a56f9ed37bbc61dad747805727c83b7738` audit; this overlay adds
narrower new evidence rather than rewriting the original criteria or assigning
old-head results to an untested final merge.

PR [1056](https://github.com/AsoraKK/Lythaus/pull/1056), merged as
`dc5f0a9752113ea65b78a385bbb62f89337c09a8`, changed web metadata,
documentation and tests, with **no `lib/` changes**. Its social-preview work
does not establish an in-app header repair. PR
[1029](https://github.com/AsoraKK/Lythaus/pull/1029), merged as
`7dda013b740a3f62baf3f9886f46a8e2273c5627`, already supplied profile/settings
source changes. Both are existing merged baseline work, not new pending fixes.

### Executed automated checks

The ledger lane inspected the supplied log summaries; it did not rerun these
application suites. These are integrated-worktree results, including test-only
follow-ups, rather than a claim that final merged-head CI has completed.

| Check | Observed result | Evidence and limit |
| --- | --- | --- |
| Focused Flutter UI tests | 110 passed | `lythaus-ui-focused-tests-final.log`; local fixture/widget coverage, not deployed acceptance |
| Discover presentation tests | 39 passed | `lythaus-discover-presentation-tests.log`; includes the updated old empty-copy assertion, responsive states, refresh/retry and paging cases |
| Approved-brand/onboarding contracts | 22 passed, zero failures/skips | `lythaus-ui-brand-contracts.log`; contract checks do not establish all rendered artwork, native branding or onboarding acceptance |
| Flutter analysis | No issues found | `lythaus-ui-analyze.log`; static analysis, not runtime acceptance |

### Compiled-release rendered checks

Quick Chromium receipt `quick-candidate/results.json` is source-bound to
`06572a4c154c45b00941f1336c458e8f72e166ab`, captured at
**2026-10-22T04:22:32.632Z**, with compiled SHA256
`adfbc4a5d20831d616645418478d60c7131c9815237880315775139dbbf1b7d9`.
The receipt bytes have SHA256
`a0caf584739211f2e2e3b5a03f91e8209a573df799eeed33db53e0100b1a7081`.
All six configurations are recorded as captured: **320, 390 and 1440 CSS-pixel
widths, each in light and dark mode**, with **30 captures** total. Every
configuration records `syntheticFixture: true` and `errors: []`. Chromium
WebGL/ReadPixels performance warnings were recorded; empty error arrays do not
mean warning-free execution.

The application is an actual compiled Flutter release rendered in Chromium
against synthetic local API responses. Browser URLs and fixture login calls do
not establish real authentication or a live production route. The parent and
independent reviewer inspected actual captures. Raw receipt/captures remain
outside Git in the `lythaus-ui-evidence-20261022/quick-candidate` bundle; this
portable record contains identities, hashes and the sanitized scope, with no
links pretending that uncommitted PNGs are repository artifacts.

| Package | V1 evidence now available | Remaining acceptance |
| --- | --- | --- |
| UX-02 | Single-item and empty Discover states rendered across all six configurations; the integrated header/feed wording can be inspected in the captures | Full route/selection, multi-feed, entitlement, search/paging, direct URL/history and adverse-response matrix remains open |
| UX-06 | Owner profile review notice rendered in its integrated profile context across all six configurations | Saved preference persistence, private projection, account separation and actual production storage/permissions are not established by this notice capture |
| UX-08 | Actual compiled app header/branding and the scoped feed/profile/Rewards layouts rendered at all three widths in both themes | Full accessibility, measured contrast, text scaling, all member/admin journeys, actual screen readers and physical/native devices remain open |
| UX-09 | Rewards service-error state and Retry rendered; each configuration records two reward reads and the repeated failure remains an error | No successful live rewards load/recovery, mapped runtime login, grant execution, entitlement/redemption, payment or billing acceptance follows |

V1 supersedes **PENDING INTEGRATION** only for these precise rendered cases.
All other V0 cases and all D0 deployed acceptance remain pending; every package
stays **OPEN**. Complete authentication, actual detector qualification and
whole-package acceptance are not established. **Full coverage and the durable
browser harness are IN PROGRESS**; their results and required final-head CI are
not predicted here. No deployment, provider mutation or feature activation is
recorded by this overlay.

## Consolidated next gates

1. Attach the parent's baseline and final integrated rendered evidence to UX-01–08
   and applicable admin surfaces, including the reported branding, repeated
   Discover, profile notice and Rewards failure. Keep the sparse feed and
   historical fixture truthful; do not create public activity to improve a test.
2. Obtain only the missing scoped account/mailbox/action permissions and run the
   exact-candidate SEC-01–09 authentication, isolation and recovery matrix.
   Existing sessions and page rendering do not close signup/reset acceptance.
3. Complete current native recovery, 0021-only, effective-role, positive cost
   ceiling, exact-candidate consent and release gates before deployment. Refresh
   all time-sensitive evidence. No provider operation is authorized by this ledger.
4. Keep PUB-01–11 open until real text/safety qualification, full pipeline and
   admin-path hold checks, policy decisions and exact-release acceptance exist.
   Obtain lawful datasets, approved thresholds and current bounded provider access;
   synthetic tests do not establish detector qualification.
5. Keep PUB-12–14 and UX-10 disabled pending approved attachment/retention/format/
   quota contracts, real pixel/safety evidence and hosted storage/Queue/retry/
   cleanup/privacy acceptance. Existing per-owner reservation retention is not a
   global physical-storage or billing ceiling.
6. Use completed preflight E3 and the reviewed
   [read-only preflight contract](product-privilege-preflight-2026-10-21.md) to
   resolve the precise [permission package](rewards-membership-permissions-approval-2026-10-21.md).
   Refresh mapped-role/privilege evidence only as needed for freshness or changed
   state; obtain exact four-grant approval and verify the authorized grantor.
   Runtime-session and route acceptance remain separate from catalog evidence.
   Billing still requires provider/commercial/legal choices, approved existing
   access, customer/event/entitlement lifecycle contracts and sandbox acceptance;
   manual tier assignment is not payment evidence.
7. Preserve all forty entries through final review, exact-commit owner-testing
   deployment and post-deploy acceptance. Retain unavailable/disabled exclusions
   explicitly and record each package's complete proof before changing OPEN.

This lane changes only this ledger. It performed no live test, provider
operation, communication, production content mutation, credential or permission
change, deletion, deployment or activation.
