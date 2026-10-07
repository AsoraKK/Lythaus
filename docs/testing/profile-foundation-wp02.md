# WP00/WP02 profile foundation review packet

Scope: Lane B profile/settings foundation, 2026-10-07. Current main `f757d35a3263f86f817ea09fd76368bd1f6a8e01`; starting draft921 head `cc464bd9f2ae0f7866094cb14dc625f05c3b86e0`; clean reconciliation merge `eb0142ca100be7837e2bb43ac86284b144954c3c`. Final source/check identities and rendered artifact links are reported in PR921's exact-head handoff. PR921 remains **draft, unmerged, undeployed and owner unaccepted**. The prior ready/merge denial remains; no readiness/merge/deployment action was attempted.

## Ownership and reused work

Parent reserved existing PR921 shared paths to this reconciliation. Normal main merge preserves PR936 public-reputation minimization and PR941 CI/toolchain fixes. This follow-up changes only profile/settings presentation, the presentation-settings default source, associated Flutter/rendered tests, and these product/evidence docs. It makes no manual auth/session/dispatcher/schema/OpenAPI/generated-client/CI/coverage-manifest edits. The draft's existing owner-post endpoint/client/native tests remain in the PR delta and are revalidated. Four primary destinations and the calm feed remain unchanged.

Both supplied Library execution documents were read in full: `libfile_4d87cee02a3481918e9caadda3cac02c` and `libfile_d8b3bc8a258c81918d12af5251a6a840`. AGENTS/README and current source/contracts/tests govern implementation. No repository-local `.agents/skills` or additional applicable AGENTS was found. The executor exposes no operation for switching its active model; this lane cannot independently confirm or set the requested Sol6.1 Extra High selection.

## Invoked paths and acceptance

| Requirement | Actual implementation/contract | Evidence and remaining gate |
| --- | --- | --- |
| Own/other routes | `/?tab=profile` invokes `ProfileScreen()`; `/user/:userId` invokes the same screen with an explicit target. Owner identity comes from authenticated `/api/users/me`; visitors use `/api/users/:id`. | Profile provider/screen and runtime privacy tests. Visitor tier/tools/tracker/private timeline are absent; guests have no follow mutation. |
| Saved identity/edit | Existing `OwnerProfile`, `ownerProfileProvider`, `EditProfileScreen` and canonical partial PATCH `/api/users/me`. | Existing save/unchanged/error/retry/discard/idempotency/cancel/reentry tests and optional-profile PG/browser journeys reused. Server-saved fields reopen after refresh; unsaved drafts are intentionally not persisted. Setup remains skippable and session restoration does not reopen it. |
| Profile tabs | `ProfileTabView` supplies visible Overview/Posts/Comments, Material tab semantics, keyboard controls, optional swipe, reduced-motion duration, `profileTab` query restoration and per-tab scroll keys. Screen state is keyed by member ID/session revision. | Five new widget regressions plus actual rendered route/tab/refresh/back checks. Physical screen readers and native platforms remain not run. |
| Own posts | Existing draft GET `/api/users/me/posts` through Public `handleOwnerContentRead`, `ownerPostsQuery`, `OwnerPostsService` and session-bound `OwnerPostsController`. Limit8, max20, created-at/UUID cursor, authenticated author binding, allowed/under-review only; deleted/blocked/ai-generated rows excluded. | Policy/workerd and actual Public entrypoint+local PG17 tests; empty/pending/private/published/page2/error/retry rendered fixtures. Request concurrency tests cover initial versus refresh, repeated refresh, older page result/error and disposal. Empty copy describes available list scope, not whether the owner has ever posted. No visitor private endpoint or fake timeline content. |
| Follow | Existing authorized GET/POST/DELETE `/api/users/:id/follow`; provider/mutation cancellation and fresh-session checks retained. | Existing service/provider/screen/native relationship tests. Follower/following collections have no current authorized contract and remain unavailable. |
| Important settings first | Settings begins with account security, notifications and privacy. The alpha link remains later under Experimental and retains its existing service access checks. Overview settings/edit precede private monthly tracker. | Rendered account hierarchy, settings/widget/responsive tests. No auth/security implementation change or feature activation. |
| Saved Passport visibility | Existing `ProfilePreferencesService` uses PATCH `/api/users/me`; owner projection supplies saved state, failures do not adopt local guesses, session changes cancel saves. | Owner-state/reentry tests plus rendered synthetic save→reload/checked-state assertions. No privacy default change. |
| Presentation persistence | Existing in-memory defaults preserved. Handedness and profile swipe have actual consumers; UI explicitly states restart behavior. Haptics has no consumer, so its inert switch is replaced by an unavailable explanation. Production provider uses `SettingsState` rather than a mock module. | Toggles/refresh/unavailable behavior tested. **P01 pending**; [recommended two-preference minimum](../product/profile-preference-authority-decision.md) needs no server/schema change. No durable presentation-preference completion claim. |
| Comments/visitor post lists | Visible tabs explain unavailable services. No profile comment query is issued, and known-ID owner comments are not treated as a list. | Rendered unavailable states; no fabricated empty content. Functional collections remain P04/API/privacy/cost gates, including parent visibility. |
| Avatar/handle | Current schema/owner projections inspected; no new management actions advertised. | P02/P03 reservation/rename/media/serving/retention/DSR/resource policy remains incomplete. |

## Verification provenance

Local runtime uses Node22.23.3, Flutter3.41.1/Dart3.11.0, pinned local Java17/generator tooling, and a new disposable PostgreSQL17 container `lythaus-wp02-pg17`. Canonical migrations/grants are applied only there; fixture database is `lythaus_auth_test_wp02`, cloned from the locally validated `/postgres` baseline. Synthetic JWTs, profile rows, post pages and TLS browser API fixtures never reach production. Worker entrypoint tests use actual Public dispatch/auth/profile/content code with the local PostgreSQL adapter; workerd separately invokes the owner-post runtime boundary.

Relevant invocations:

```sh
flutter analyze --no-pub lib/features/profile lib/ui/screens/profile lib/state/providers/settings_providers.dart test/features/profile/presentation/profile_tab_view_test.dart
flutter test --no-pub test/features/profile test/ui/screens/profile test/screens/profile_screen_test.dart test/state/providers/settings_providers_test.dart test/core/routing/app_router_test.dart test/ui/screens/adaptive_shell_test.dart test/ui/responsive_product_test.dart
node --experimental-strip-types --experimental-test-module-mocks --test apps/lythaus-public-api/tests/profile-runtime-policy.test.mjs apps/lythaus-public-api/tests/owner-content-reader.test.mjs apps/lythaus-public-api/tests/owner-content-reader.workerd.mjs
# Local disposable PG17 URL supplied through PLANETSCALE_PG17_TEST_DATABASE_URL:
node --experimental-strip-types --experimental-test-module-mocks --test apps/lythaus-public-api/tests/optional-profile.postgres.mjs apps/lythaus-public-api/tests/content-journey.postgres.mjs apps/lythaus-public-api/tests/reputation-visibility.postgres.mjs
npm run typecheck:native
npm run openapi:lint
npm run openapi:check:bundle
npm run openapi:check:dart
npm run openapi:test:contract
npm run openapi:validate:examples
npm run openapi:test:dart
npm run test:product-integrity-runtime
npm run test:critical-coverage
```

Build uses canonical `cloudflare/pages-release.sh` public values and existing release flags. Browser script `scripts/tests/profile-visual-qa.browser.mjs` runs Chromium by default and accepts `PROFILE_VISUAL_ENGINE=webkit`; it records source SHA/browser/version/viewport/theme/network error classification and synthetic screenshot manifest. Settings save uses the actual rendered client service against first-party local fixtures, not live account writes. `optional-profile.browser.mjs` retains its four Chromium/WebKit phone/desktop journeys.

Local WebKit launch is blocked by Playwright's system `libGLESv2.so.2` dependency guard. A workspace copy exists, but the guard checks the system linker cache. Installing the distro library was allowed by automatic review, then failed because `sudo` is unavailable in this executor. The dependency guard was not bypassed. Hosted CI/browser results are separate evidence and must be reported at the final exact head. Native iOS/Android, physical screen-reader interaction and owner UAT are not certified by browser zoom or widget semantics.

Full-app/critical coverage and generated-client warnings must be reported from their current results, with module scope and skips; historical percentages are not reused. Preliminary local results or earlier PR checks are not completion evidence for an untested later head.

## Gates and handoff

Independent review belongs to the parent's existing reviewer; a request names the exact draft source head and this ownership scope. Any new finding requires an explicit disposition before the candidate is called reviewed. Passing checks never lift PR921's manual readiness/merge boundary.

P01 is the smallest owner choice for dependent persistence work. P02/P03/P04 belong to later profile extensions. All unaffected foundation work is delivered without inventing their rules. [Broader goal checklist](../product/gap-goal-checklist.md) keeps profile/discovery/rewards/support/passkeys/navigation states distinct.

No provider resource, paid resource, hosted database, production DDL/grant/write, credential, queue, release, real account, email, reward/support/passkey/alpha activation or irreversible deletion is changed. The attempted system test dependency install did not modify the host. Release coordinator receives the reviewed Flutter/Public draft candidate, compatible current-main contract/runtime changes, outstanding owner/device/privacy gates and exact-head evidence. Rollback/serving versions remain coordinator-owned; no deployment is authorized by this packet.
