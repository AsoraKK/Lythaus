# Post composer incident: 10 October 2026

This slice repairs the routed composer and adds reproducible synthetic tests of
the existing post/moderation integration. It does not activate a feature, change
moderation policy, migrate a live database, or certify production detection.
Owner hands-on acceptance remains scheduled for Sunday 11 October.

## Baseline and deployment evidence

- Fetched [the canonical Lythaus repository](https://github.com/AsoraKK/Lythaus/)
  main: `dba135ca3720b1311c5ec3d1d9e00ab7a67a568d`.
  PRs #975–#978 are already present; their fixes are unchanged.
- Follow-up review refreshed main once to
  `f40c5b6b9840ff8e96ac03f9aa4c6320b931aa5e` (#979). A normal merge produced
  `e8848145e996ee3311c8dfc4e898ccbe7ba8a3e8` with no conflicts. Its two admin UI
  changes remain owned by that merged PR; this slice's production composer
  change is unchanged. That initial refresh retained the same six scoped changed paths.
- The final approved refresh includes main
  `88ffc079d95797485bce33617e2a7e3545ef7e0b` (Profile Comments #983), merged
  normally at `eac3fa78eb915ea5c0d0e05cc027e5212698f8d6` without conflicts.
  Its parents are incident head `049eb28ca5fcb9065474b390dc9652c58d2ee4e0`
  and that main SHA. Profile/contracts/dispatcher changes are inherited from main
  and are absent from this slice's scoped diff. Parent explicitly allocated the
  narrow shared `scripts/tests/local-auth-browser-server.mjs` abort fix as the
  seventh path; production composer code is unchanged.
- Reviewed open PRs before editing. Profile own-content collections/contracts
  belong to the separate profile lane. PR #983 owns Comments dispatcher work.
  This slice changes neither those files nor routing, contracts, migrations,
  feature flags, Worker configuration, resource registration or workflows.
- The latest successful `production-release` workflow found was
  [run 38032738217](https://github.com/AsoraKK/Lythaus/actions/runs/38032738217),
  for `d3b52ccd43d71493549d01b81c494a2d1c9647b5`. Its web, Workers/Jobs,
  admin, verification and manifest jobs succeeded. Authenticated browser smoke
  was skipped. A workflow SHA is evidence of a release attempt, not independent
  proof of every currently served component.
- Public API health returned production/ok. Public web `version.json` reported
  version 1.0/build 1 without a commit SHA.
- In that repository, `gh run download 38032738217 --name
  lythaus-release-manifest-d3b52ccd43d71493549d01b81c494a2d1c9647b5`
  failed with GitHub artifact-storage HTTP 403. The operation was stopped.
- Read-only Cloudflare GET of
  `/accounts/e5b7ae46e04698f507b7e4b3d4ef1af0/workers/scripts/lythaus-public-api-development/deployments`
  failed with HTTP 401. No subsequent versions/bindings requests or alternate
  route were attempted. Actual live Worker version, bindings, queues and Kyle's
  moderation case remain unverified. No live credentials or content were read.
- Read-only PlanetScale branch/schema inspection found only production `main`;
  no development branch was created. Tests instead use a disposable loopback
  PostgreSQL 17 database, `lythaus_auth_test_post_incident`, with canonical
  migrations through 0019 and real runtime/Jobs/privacy database roles.

## Root cause and repair

`AdaptiveShell` retains `CreateScreen` → `CreatePostScreen` inside its root
`IndexedStack`. A successful `POST /api/posts` previously called
`Navigator.pop(result.post)` unconditionally. From the Create tab this removed
the last GoRouter page: debug builds assert that the configuration is nonempty;
the release build rendered an entirely white screen after the post had already
been persisted as `under_review`. Close and confirmed discard used the same
unsafe exit. Existing pushed-composer tests did not cover this routed root.

`create_post_screen.dart` now uses one exit helper. A pushed composer still
returns its result to its caller. At the routed root, the helper selects Discover
while preserving query parameters. It removes the policy tooltip on receipts and
exit; a retained inactive composer's paused animation previously left that
overlay covering the destination or validation feedback.
A late receipt cannot pop a page above the composer or navigate from an inactive
tab. Existing durable drafts, actor fencing, idempotency keys, server receipts
and pending-publication wording remain authoritative.

The release-browser fixture reproduced the white screen before the repair with
one real native-Worker/PG persisted post. The fixture intercepts production-shaped
hostnames through a loopback-only TLS proxy; it never contacts those live APIs.
Authentication and failure injection are synthetic. Product requests execute
the actual public Worker and PostgreSQL queries. The baseline reproduction used
the same main entrypoint with API/auth base URLs lacking `/api`; the repaired
artifact uses canonical `/api` URLs. Actual post writes in both use `/api/posts`.

Follow-up regressions directly cover a pending receipt after switching to the
Profile tab, native Back at a dirty deep-linked root composer (Keep editing and
confirmed discard), and native Back while that root submission is in flight.
Browser Back/Forward is separately exercised from the real Create tab: an unsent
draft retains its text/disclosure without a write, and an unconfirmed submission
retains its frozen rendering and replays the identical body/key once explicitly
retried. The editable restored value is checked after focus; the disabled frozen
field is compared pixel-for-pixel and through the replay payload. These tests do
not certify an unfocused web accessibility input's value, physical native-device
gestures, or every possible dirty-composer tab-history combination.

## Shared loopback fixture abort regression

Two full release-browser runs at `049eb28` each completed the dirty-Back product
assertions and screenshot but failed with uncaught `read ECONNRESET`. The shared
HTTPS fixture read request bodies outside its error boundary. Aborting a request
while that read was active rejected the async server callback.

The parent-approved seventh-path fix handles only an incoming request that is
already aborted and has `ECONNRESET` while its body is being read. Other read errors
are rethrown; unexpected product handler errors remain fatal. Host allowlisting,
body-size limits, API response assertions and browser console checks are unchanged.
It creates no successful receipt and does not route an incomplete body to the API.

Two regressions live in the existing
`scripts/tests/post-composer-navigation.browser.mjs`: `local loopback fixture
handles an aborted request reset` and `local loopback fixture keeps unexpected
handler failures fatal`. Each runs an isolated child process against the real
fixture. The first asserts zero handler invocations and a clean exit; the second
requires exit 1 with the exact synthetic unexpected-handler error. Both passed.
The full command now has seven browser scenarios plus these two fixture tests.

## Existing moderation path and its limits

1. `post_creation_providers.dart` freezes the body/disclosure and saves the
   account-bound request before submission. `post_repository_impl.dart` sends
   the canonical body/declaration and idempotency key.
2. Public API `createPost` validates identity and content server-side, then
   transactionally inserts the UUIDv7 post, declaration, distinct source event,
   pending activity signal and `content.post.created` outbox event. Accepted 201
   means persisted/pending publication checks, not published or detector-approved.
3. Jobs `relayOutbox` claims events with `SKIP LOCKED`, sends `MODERATION_QUEUE`
   and records dispatch. Queue errors preserve retryable outbox work. Consumer
   inbox claims prevent completed duplicate messages from reevaluating content.
4. `processPostModeration` checks source event, current body/revision and existing
   terminal decisions before evaluating. Repository configuration specifies
   Workers AI `@cf/openai/gpt-oss-20b` through gateway `lythaus-ai`, cost admission,
   no gateway cache and no content collection. Live bindings were not verified.
5. This ordinary post path is `lythaus-authenticity-ai` / `evaluation-only-v1`.
   It records detector evidence and a review case, with recommendation `review`.
   It is not a qualified authorship detector and does not invoke the separate
   OpenAI Omni safety provider used by private authenticity-alpha code.
6. Disabled/unavailable evaluation produces manual-review evidence and keeps the
   post withheld. That event is acknowledged; it is not an automatic retry when
   the provider later recovers. No explicit ordinary `AI.run` timeout was found.
   Queue/DB exceptions do retry. Recovery rescan/timeout behavior is a remaining
   integration decision; this repair adds no enforcement or bypass.
7. Existing admin decisions/current-revision authority determine publication.
   The new fixture's final allowed state is explicitly synthetic SQL setup,
   followed by a real public GET. It does **not** test the admin decision handler,
   a live callback, a live provider, or a live final decision. Independent blocked
   decisions and stale revisions are protected in the new Jobs tests. Existing
   tests cover appeal/safety invariants; this slice does not activate appeals.
8. Public reads require allowed/publishable content and an active, eligible
   author. Known-ID owner reads return allowed/under-review content privately
   with `no-store`, and deny another account. Detail refresh reloads server state;
   there is no new polling interval, publication promise or fabricated success.

## Requirements → code → tests

Owner evidence was recovered by the parent, not independently inferred from
historical assistant suggestions. IDs below distinguish owner instructions from
proposal details. **Covered** means synthetic tests/source inspection, not live
owner acceptance. **Gap/gate** means this slice does not implement or approve it.

| Requirement/evidence | Current code/contract | Verification and result / remaining gate |
| --- | --- | --- |
| Accepted pending submission must retain a functional app; incident instruction | Composer exit helper, actual `AdaptiveShell` route | New widget root tests for pending and allowed; actual release browser before/after, mobile and desktop. Repaired. |
| Draft preservation, retry, repeated clicks, Back/Close, discard; D1 owner UI standardization plus incident instruction (D2 implementation package is supporting detail) | `post_creation_providers.dart`, `content_mutation.dart`, `content_recovery_storage.dart`, composer | Existing recovery/mutation suites; new slow double-click/Close, uncertain close/reopen, discard and pushed-page tests; browser acknowledgement-loss same key/body and server-validation draft. |
| Account switching and late responses; privacy/integrity constraints | Actor/session epoch in creation/recovery/detail readers; exit guard | Existing account-fencing tests; new late receipt after account switch and above another page. Real pending owner-view rejects other/guest. Browser account-switch path not exercised by this new script. |
| Human text and images; video later for GA (A1 owner, later GA owner) | `CreatePostRequest` and public API currently text; `MEDIA_UPLOADS_ENABLED=false`, `MEDIA_PROCESSING_ENABLED=false` | Text positive path covered. No supported publishing-media positive path is claimed. Image/video activation/provider/media acceptance remains gated; video is later scope under GA instruction. |
| Explicit honest human/assisted disclosure; AI-assisted text ≤249 normalized user-perceived characters; generated public content blocked (A1/A3) | `packages/contracts/src/content-policy.ts`, composer validation, public API | Existing product-policy/runtime tests plus native text fixture. No client-only publication decision. Existing 5,000-character UI cap differs from server 100,000; any change needs confirmed product limits. |
| AI-assisted images/video and generated public publication prohibited; private feedback allowed only under existing gates (A1/A3) | Content policy; private authenticity-alpha; media disabled | Policy tests; private-alpha/provider fixtures are synthetic. No activation or certified live detector/media acceptance. |
| Per-post Public/Followers/Close Friends/Only Me (P1/P2 owner approval) | DB visibility has public/followers/private; composer request has no audience field; create currently uses existing public default | Gap: complete four-audience composition/enforcement is absent. Preserve default; membership/default/retroactivity remain unapproved. No contract/default invented here. Private row guards remain authoritative. |
| Optional evidence/sources, corrections and no false proof claim (S1 owner implementation context; specific S2/D2 UI details are supporting proposals) | Composer proof tiles; `CreatePostRequest.toJson` sends only body/declaration/geoScope; detail trust timeline | Gap: tile values are not submitted/persisted by this contract. No source attestation success is claimed. Existing edit→new revision/source event and stale evidence tests covered. Source/correction schema and policy need owner/contract coordination. |
| Detail, comments, one-level replies and edit/delete under current policy (S1; canonical contracts) | `post_detail_screen.dart`, `comment_thread_screen.dart`, public content handlers/OpenAPI | Existing post/comment journey/widget tests and PG suite cover owner edits/deletes, pending exclusion, reply policy, tombstones and retry. Comments dispatcher and own-comment collection are inherited from merged PR #983. Combined profile/browser/CI checks cover that integration; this slice does not redo those shared files. |
| Existing reaction semantics; historical like/dislike proposal R2; later hide public totals/no per-click earnings M1 | Existing `features/reactions`, `post_actions`, server reaction uniqueness/activity policy | Existing reaction and action tests passed. Gap: current UI still exposes reaction totals; vocabulary differs from historical like/dislike. No new reaction or popularity algorithm introduced; public-total reconciliation belongs to a separate approved slice. |
| Correct author-profile links (S1/canonical) | UUID author ID → public profile route, active/private profile guards | #976 is already merged; existing profile/route code inspected, not redone. Profile collections/contracts remain profile-lane owned. |
| Own edits/deletes and public privacy after edits | Content revision/outbox handler, owner-view, client mutation journal | Existing PG journey covers edit/delete/idempotency; new native stale event test does not call detector after revision change. Real public GET excludes pending and other users cannot use owner-view. |
| Reports, moderation, appeals and honest pending/allowed/retained/failed status (M1/M3; incident) | Detail trust panel, reports/appeal screens, admin decisions; Jobs evidence | Existing Flutter/status and native invariant tests passed. New provider failure remains `under_review`, not guilt/allow. Gap: blocked owner-view is 404, so a fully private blocked-content detail/edit/appeal journey is not established. Retained/failed live cases not inspected. |
| Outage unknown/pending; idempotent eventual evidence; never override scoped peer overturn or safety hold | Outbox/inbox, current source/body hash, terminal state and appeal predicates in Jobs | New dispatch failure→retry, concurrent duplicate, repeated delivery, unavailable provider and stale/blocked decision tests. Existing admin/Jobs integrity tests. No broad claim that every overturn/hold combination was exercised in workerd. |
| Guest read-only, blocked/under-review/private author isolation | Server active-user/profile checks, publishable public readers, owner-view, client capability providers | New real JWT/PG guest write 401, public pending 404, private owner-read 200/no-store and cross-user denial. Existing profile/content policy tests. No live user mutations or token/content logs. |
| October monthly rewards, distinct event IDs and evidence-linked eligibility (M3 plus latest Oct 7 corrections) | Existing activity events and gated monthly policies | No rewards changes/client awards. Main retains October v1; pending v2 work must incorporate quarter-end expiry/no retroactivity and approved 150 suggestions/+1000 email correction. Do not restore old rolling expiry/popularity weights. Full rewards-engine testing is outside this slice. |
| Equal-weight timed peers under new appeal policy (M3 plus current corrections) | `monthly-peer-appeal-policy.ts`; gated activation | Policy/integrity inspection only here; no activation, enrollment, ballot/vote product defaults or enforcement changes. Parent coordinates integration with rewards/appeal owners. |
| Calm Discover default, distinct News, no Wrap (F1/F2) | `AdaptiveShell` Discover destination and current feed providers | Repair returns to current Discover behavior. No feed-ranking/filter/news implementation or default change. |
| Notification quiet hours/timezone/categories/privacy (N1/N2/N3) | Existing notifications/preferences lanes | Out of this post slice; numeric rate examples remain proposals. No notifications sent or new rate default chosen. |
| Profile settings order/swipe/handedness (latest Oct 6–7 corrections) | Profile/preferences lanes | Out of this slice; no overlapping collection/contracts or preferences edits. |

### Recovered source references

- P1/P2: [owner approval](https://chatgpt.com/c/68889e8d-bda4-8320-8f0a-6eeea1ec5266?messageId=6cf86f5c-7936-40bb-ba94-a9a564f2867d),
  [approved four-audience explanation](https://chatgpt.com/c/68889e8d-bda4-8320-8f0a-6eeea1ec5266?messageId=3e92103f-83d1-4478-a01c-2e64cc39057a).
- GA: [owner text/images, video later](https://chatgpt.com/c/697f4f6c-c500-8329-8380-fd5df50acd47?messageId=12c9d9a0-f2a3-4479-8a25-eb359191927e).
- A1/A3: [owner content/authorship rule](https://chatgpt.com/c/6a70270d-6314-83ea-b04a-293960950b86?messageId=65f7aa14-9bac-4d5d-a919-6d9ba535451f),
  [owner provider direction](https://chatgpt.com/c/6a70270d-6314-83ea-b04a-293960950b86?messageId=3540668a-4bee-427d-9d17-e8702811de8b).
- S1: [owner implementation/private audit context](https://chatgpt.com/c/6a798bbe-b7d0-83ea-b904-e9fa3b29ac71?messageId=bbb21150-0ec3-4445-a0f3-3da3c54aa9ef).
- M1/M3: [owner public totals/earnings/safety direction](https://chatgpt.com/c/6ab66d02-f4e4-83ea-bbd2-d5b2a1bd2154?messageId=5c41303a-475a-44a7-8235-afc78c92c3fb),
  [owner monthly/appeal direction](https://chatgpt.com/c/6ab66d02-f4e4-83ea-bbd2-d5b2a1bd2154?messageId=6fa960a5-76b6-49a0-93fa-0ddf36dad637).
  Latest October 7 corrections supplied by the parent supersede older conflicting
  quarterly/reward details. The parent retains that current conversation evidence.
- D1: [owner UI standardization](https://chatgpt.com/c/6ab77005-6ae4-83ea-ab99-6f10542c5df2?messageId=bbb2132b-d4c5-401b-85b8-7d4a125c2140).
- R2: [historical reaction proposal](https://chatgpt.com/c/68dd838d-f4b4-832c-9807-7c7dcf09bbf0?messageId=abacea85-0ab1-4cb5-b671-5668237b81dd).
- F1/F2: [owner Discover/filter direction](https://chatgpt.com/c/693455a1-6ee4-832d-879e-1e97640b2010?messageId=4d05e76b-b2cb-4d24-987f-869929bbc3e7),
  [owner no-Wrap/News direction](https://chatgpt.com/c/693455a1-6ee4-832d-879e-1e97640b2010?messageId=d14057d5-b330-4ed2-9f86-8302059c12a0).
- N1/N2/N3: [owner notification direction](https://chatgpt.com/c/691dfa70-cfe4-832e-acd3-28b150c83484?messageId=564caadb-3dd2-4456-a26a-e5ed600893d6),
  [follow-up](https://chatgpt.com/c/691dfa70-cfe4-832e-acd3-28b150c83484?messageId=171a5bed-d9cd-42ce-ba53-5b21ad5a0919),
  [clarification](https://chatgpt.com/c/691dfa70-cfe4-832e-acd3-28b150c83484?messageId=053af88e-576d-4dfb-9998-523a2d67d949).

## Reproduction and validation

Activate the saved toolchain before commands:

```sh
source /workspace/.lythaus-tools/activate.sh
export PLANETSCALE_PG17_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/lythaus_auth_test_post_incident
node --experimental-strip-types --test --test-concurrency=1 apps/lythaus-jobs/tests/post-moderation.workerd.mjs
flutter build web --release --no-pub --no-wasm-dry-run --no-tree-shake-icons --no-web-resources-cdn --dart-define=ENVIRONMENT=production --dart-define=API_BASE_URL=https://api.lythaus.co/api --dart-define=AUTH_URL=https://api.lythaus.co/api --output=build/post-incident-after
QA_COMMIT=$(git rev-parse HEAD) PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 node --experimental-strip-types --test scripts/tests/post-composer-navigation.browser.mjs
```

The native fixture refuses non-loopback databases and database names without
`lythaus_auth_test_post_`. It runs the actual API/Jobs bundles in workerd, replacing
only the PostgreSQL transport with a local service bridge. Model replies are
explicitly synthetic; external Worker fetches are rejected. It uses runtime,
Jobs and privacy roles, not unrestricted product queries. Synthetic final-decision
SQL setup is labeled in the test. No credentials, JWT values or private live data
are written to logs. Browser artifacts are local `/tmp/lythaus-post-browser` PNG
and JSON files; reports include the supplied `QA_COMMIT` and synthetic marker.

Local checks before PR creation:

| Check | Result |
| --- | --- |
| Local canonical PG17 bootstrap / role / integrity / rollback validation | Passed; migrations through 0019, 103 relations / 102 tables. |
| `flutter test --no-pub test/features/feed/application test/features/feed/presentation test/ui/screens/adaptive_shell_test.dart test/widgets/post_actions_test.dart test/features/reactions --reporter expanded` | 503 passed on the refreshed main baseline, including new navigation tests. |
| New navigation file rerun after follow-up review | 13 passed, including direct inactive-tab and native Back tests. |
| `flutter analyze --no-pub`; format check of changed Dart files | Passed, no issues; two files already formatted. |
| `npm run typecheck:native` | Passed. |
| Runtime/product policy, admin/Jobs invariants, authenticity evaluation/Omni synthetic regression files | 42 passed. |
| Existing `content-journey.postgres.mjs` | 4 passed. |
| New `post-moderation.workerd.mjs` | 5 passed. |
| `npm run openapi:lint`; `npm run openapi:test:contract` | Lint passed; 69 tests passed, 17 skipped in one standard skipped suite. |
| Native Worker configuration and resource registry validators | Passed: 4 configs/3 generated type files, 33 registered resources. |
| Main-entrypoint release build and baseline browser reproduction | Built; one expected-broken reproduction passed with persisted pending post and white screen. |
| Repaired main-entrypoint release browser | All 7 cases passed on the refreshed main baseline, including inactive-tab receipt and unsent/frozen Back/Forward recovery. Final-head rerun and SHA metadata are recorded in the PR evidence. Only injected 400/503 and initial synthetic refresh 401 are expected API errors. |
| JavaScript syntax, `git diff --check`, repository hygiene, active branding, documentation secret hygiene, retired-provider dependency validation | Passed. |

Failed exploratory runs are retained in `/tmp`: the old-source widget run fails
on root navigation as expected; initial browser runs failed on test locator
strictness/feedback lookup and a local connection reset; an initial native queue
test had an incorrect relay-error expectation/untargeted injected failure. Those
test harness errors were corrected without weakening product or policy gates.
The first PR head also failed the CI naming guard because this report used the
bare repository owner/name. The report now uses the canonical repository link;
the existing guard remains unchanged.
Follow-up browser attempts initially sampled the URL before the sign-in redirect
completed and a restored accessibility input before focus; these harness
assumptions were corrected. Retained draft rendering, disclosure, zero unintended
writes, exact frozen replay and route preservation are asserted directly.

Unrun: live provider/callback/queue inspection after denied access, live user
submissions, live DDL, a complete real admin-decision browser journey, a positive
media publishing journey while disabled, owner acceptance, and full release
deployment. The new browser/backend commands are explicit local tests; no shared
workflow was edited to imply CI executes them. Existing Flutter CI discovers the
new widget file. Exact-head CI results belong to the draft PR evidence.

## Release gates and rollback

The parent coordinates serialized review, merge and any authorized deployment.
Required checks must match the final remote PR head. Fix scoped failures without
weakening checks. No merge or deployment is performed by this slice.

Before a live detection claim: an authorized owner/provider read must establish
the deployed web and all three Worker SHAs, current bindings/gates, queue and
provider health, and Kyle's actual source event/case state without exposing
content or secrets. Trained Omni safety versus ordinary evaluation-only evidence,
provider recovery/timeout, media launch, complete audiences and blocked-owner
feedback need their respective owner/contract/provider gates.

Rollback is a reviewed revert of this slice's composer helper and tests. There
are no contract, schema, resource, feature-activation or persisted-state changes
to undo. Pending posts/events created before or after a release remain governed
by existing server policy; rollback must never relabel, republish or delete them.

## Next safe detector coding slice

Prepare a disabled normal-post **trained safety evidence adapter** around the
existing `packages/authenticity/src/openai-moderation.ts` factory. Ordinary posts
currently use the generic evaluation-only path; the trained safety adapter is
used separately by private authenticity-alpha code. Safety evidence must remain
distinct from authorship qualification and earnings eligibility.

Suggested isolated files are `apps/lythaus-jobs/src/post-safety-evidence.ts` and
`apps/lythaus-jobs/tests/post-safety-evidence.workerd.mjs`, using the existing local
PG/workerd fixture. Inject the provider and explicit configuration; absent or
disabled selection performs no provider call. Correlate evidence with the source
event, content revision and body hash, and use existing detector evidence storage
after confirming its unique constraints. No new schema or public contract is
required for a preparation slice.

Synthetic acceptance should cover safe/flagged evidence, timeout, unavailable or
malformed responses, duplicate/concurrent delivery, stale revisions, and existing
safety holds/scoped peer decisions. A safety `ALLOW` result must leave pending
authorship/publication unchanged. Unknown provider outcomes must not become guilt
or publication. Existing alpha, media, appeal and reward gates remain disabled.

Before a production hook in `apps/lythaus-jobs/src/index.ts`, the parent must
allocate that integration ownership and approve provider selection/binding,
budget admission and configuration. Timeout/retry cadence and enforcement-policy
defaults remain explicitly pending; preparation must not choose them implicitly.
Use injected synthetic responses for all development checks, with no new key,
paid resource, live provider read or activation. Separate authorized provider and
deployment verification remains a release gate; do not retry the previously
denied artifact/deployment endpoints. Qualified authorship detection and proof
attestation are separate follow-on decisions, rather than inferred from trained
safety scores.

## Detailed post safety evidence adapter plan

This complete plan is committed for parent allocation after incident integration.
Provider/storage facts were inspected at `049eb28` and remain unchanged in the
final combined tree with main `88ffc079`. The adapter is a separate implementation;
none of its code, hooks, configuration or activation is part of this incident PR.

### Intended result and boundaries

Prepare a server-side adapter that can evaluate a canonical post revision using
the existing supported OpenAI moderation provider and return explicitly typed
safety evidence. The adapter is disabled unless explicitly selected by injected
configuration. Its preparation tests use synthetic inputs and an outbound-blocked
native Workerd runtime with disposable PostgreSQL.

Safety evidence answers whether the provider flagged supported safety categories.
It does not establish human authorship, authentic origin, source accuracy, proof
attestation, moderation clearance, public eligibility or rewards eligibility.
An unflagged provider `ALLOW` is evidence only. It must not publish a post, clear
`review_required`, relabel an author, remove a hold or emit an earnings event.
Flagged evidence must not automatically create guilt or a new blocking policy.
Unknown means no usable provider finding, with existing publication state retained.

Preserve the ordinary post path's `evaluation-only-v1` status and existing server
authority. Existing private authenticity-alpha, beta, media, reward and appeal
activation gates remain as configured. A private-alpha provider implementation
does not authorize sending ordinary public-post text to that provider.

### Verified source foundation

| Source at the combined incident head | Existing behavior relevant to this plan |
| --- | --- |
| `packages/authenticity/src/openai-moderation.ts` | `createOpenAIModerationProvider` supports text/image/frame calls, injected `fetchImpl`, timeout and sanitized failure evidence. It returns `ALLOW`, configured flagged handling, or `PROVIDER_FAILURE`. Redirects are manual. |
| `packages/authenticity/src/research-config.ts` | Existing supported model is `omni-moderation-latest`. No replacement model, endpoint or new service is proposed. |
| `packages/authenticity/src/moderation.ts` | Typed provider evidence distinguishes `SUCCESS` and `PROVIDER_FAILURE`, with nullable flags and explicit failure categories. `isLive: true` on the factory is a type marker, not proof of live configuration or execution. |
| `apps/lythaus-jobs/src/authenticity-alpha.ts` | Private alpha already uses this provider with explicit `REVIEW` handling. Its authorization/gate does not transfer to ordinary posts. |
| `apps/lythaus-jobs/src/index.ts` | `processPostModeration` currently uses generic Workers AI evaluation, checks current revision before and after the call, and records evaluation-only review evidence. An existing provider/source-event row prevents repeated evaluation. |
| `apps/lythaus-jobs/src/runtime-policy.ts` | `parseContentModerationRevision` requires the queue source event, declaration and SHA-256 body hash; `isCurrentContentModerationRevision` requires matching current content, revision, declaration, hash, live row and `under_review`. |
| `database/planetscale/migrations/0002_core_tables.sql` and `0012_product_integrity_v2.sql` | Detector rows require a non-null model version and JSON signal. A partial unique index enforces `(provider, source_event_id)`; cases have separate content/source and one-open-content constraints. |
| `packages/db/src/community-appeal-access.ts` | `communityClassifierEvidence` currently includes all detector rows for a content revision in its evidence fingerprint. A new safety row would alter that fingerprint. |
| `packages/db/src/community-appeal-closure.ts` | `identicalCommunityAppealOverride` matches revision/content/evidence fingerprints. Restoration separately checks independent `block`/`queue` decisions and publication rules. |
| `packages/db/src/monthly-earning.ts` | Eligibility uses canonical revision and authoritative moderation decisions. The adapter must not fabricate a qualifying decision or publication event. |
| `packages/authenticity/tests/openai-moderation.workerd.mjs` | Existing native provider fixture verifies redirect refusal with a synthetic credential and endpoint. Reuse this pattern, without allowing live outbound traffic. |
| `apps/lythaus-jobs/tests/post-moderation-fixture.mjs` | Existing native API/Jobs fixture restricts database host/name and roles, blocks external fetches and supplies synthetic model replies. Reuse through an isolated new test harness where possible. |

These are repository facts. Production bindings, provider health and actual
served SHAs remain unverified. Previously denied release-artifact and Cloudflare
deployment reads must not be retried or bypassed.

### Proposed ownership and files

First implementation allocation should be limited to new
`apps/lythaus-jobs/src/post-safety-evidence.ts` and
`apps/lythaus-jobs/tests/post-safety-evidence.workerd.mjs`. If the harness needs a
separate helper, allocate a new `post-safety-evidence-fixture.mjs` rather than
changing the incident fixture without coordination.

No production import/call from `apps/lythaus-jobs/src/index.ts` is part of the
preparation slice. Parent owns allocation of that later hook. No OpenAPI/public
contract, generated bindings, resource registry, workflow or migration edits are
needed for pure adapter preparation. Any persistence/consumer adjustment that
cannot stay in the new module requires a separate parent file-ownership decision.

The existing provider module is reused unchanged. Its normal-post timeout,
flagged-result policy and provider selection remain explicit configuration
decisions; its existing 15-second factory default is not silently approved as a
new normal-post product default. No feature-flag name or live binding is invented.
Provider payload/admission limits and budget handling need explicit approval;
the factory's zero cost estimate is not evidence of free production usage.

### Adapter shape and revision flow

1. Accept typed dependencies: canonical revision loader, current authoritative
   decision/hold reader, injected provider, explicit disabled-by-default selection,
   clock/hash implementation, and an optional evidence commit dependency that is
   unavailable until persistence semantics are allocated.
2. Validate the event through the existing revision parser. The original source
   event identifies the content revision; retry delivery IDs do not replace it.
   Load content server-side using Jobs authority. Never accept client-provided
   body, author, moderation state or hash as authoritative.
3. Hash the exact canonical body using existing SHA-256 semantics, and match
   content ID, source event, declaration and body hash. Missing/deleted/edited
   content or terminal state returns an explicit skipped/stale outcome before a
   provider call. A revision hash is an integrity correlate, not authorship proof.
4. Check identical scoped peer overrides and independent safety/publication holds.
   Protected state returns an explicit protected outcome; it does not suppress or
   remove a hold. Avoid writing evidence that invalidates an existing override.
5. Disabled/absent selection returns disabled and performs zero provider calls
   and zero evidence writes. Enabled test configuration still uses only the
   injected synthetic provider/fetch. Missing/unusable dependencies return unknown,
   never a mock success.
6. Invoke `analyseText` once for that adapter attempt. Preserve the existing
   provider's strict model/schema validation and sanitized error categories. No
   raw response body, JWT, API key, text or exception containing text is logged.
7. Normalize into an internal result union such as disabled, stale, protected,
   duplicate, evidence or unknown. Keep delivery state separate from provider
   status; these are proposed internal values, not new public API/moderation states.
   Successful evidence retains provider/model, flagged boolean, category metadata,
   source-event/content/body-hash correlation and evaluation-only applicability.
8. Reload and rehash under a short DB transaction before any allocated commit.
   Recheck deletion, revision, declaration, authoritative decisions and protected
   scope after the asynchronous provider call. Late results for edited/deleted or
   newly held content return stale/protected and cannot affect current content.
   Do not hold a DB transaction/row lock open during a network provider call.
9. A permissible commit can only persist correlated evidence; it cannot update
   publication state, declarations, cases/decisions, appeal overrides, reputation,
   activity rewards or outbox publication events. Pure preparation can return
   evidence without persistence if the shared-consumer constraints are unresolved.

### Persistence, duplication and recovery gates

The existing detector table can technically store another provider's JSON evidence,
but reusing it is not automatically safe. Parent must allocate and approve a
purpose namespace plus consumer behavior before any production persistence.
Do not reuse `lythaus-authenticity-ai`, overwrite its signal, or place safety data
in the canonical authorship declaration fields. Model provenance must be real;
missing model information is unknown, not a fabricated model version.

The appeal fingerprint reader is unfiltered. Adding a row—even an evaluation-only
safety row—changes its digest. Required preparation tests must demonstrate this
interaction. Until an approved persistence design preserves scoped overrides,
return protected/no-write for relevant scope and leave production storage unhooked.
If a consumer filter or separate store is necessary, parent coordinates that
follow-on allocation; preparation must not invent a schema/migration to evade it.

The provider/source-event unique constraint can ensure one durable evidence row,
using a distinct approved safety-purpose namespace and atomic conflict handling.
It cannot alone guarantee only one external provider call: concurrent attempts can
call the provider before either commits. Tests must distinguish those guarantees.
Existing queue-inbox ownership and cost admission need a deliberate later hook;
the ordinary evaluation's early duplicate return must not silently prevent safety
evaluation or pretend that safety evaluation ran. No long-lived DB lock or new
lease schema is introduced in preparation.

Unknown provider results must not become terminal success or consume the only
success evidence slot in a way that makes recovery impossible. Return typed
unknown and preserve pending state; diagnostic persistence, attempt identity,
lease recovery, retryability, maximum attempts, deadline and rescan cadence remain
explicit owner/configuration gates. Today the ordinary evaluation can acknowledge
manual-review evidence after an outage; this plan does not claim that it already
performs recovery retries. Synthetic unknown→success attempts can verify adapter
semantics without activating an automatic retry loop.

### Proposed synthetic acceptance matrix

| Scenario | Required assertions |
| --- | --- |
| Absent/disabled selection | No factory/network invocation, DB evidence write or state/event change. |
| Valid unflagged text response | Correlated safety evidence returned; no claim of human authorship, publication or rewards; existing post remains pending. |
| Valid flagged response | Flag metadata retained as evidence; no automatic block/guilt or new threshold. |
| Missing credential/dependency | Explicit unknown with safe category; no external call or fabricated decision. |
| Timeout, rejection, network failure | Explicit unknown; abort observed where supported; pending state retained; sanitized diagnostics only. |
| 401/403/429/5xx, redirect | Correct failure category; redirect target is never requested; no credential forwarding. |
| Malformed JSON/schema/model mismatch | Unknown rather than unflagged success; no partial unsafe commit. |
| Malformed event/hash/declaration | Validation rejects before provider; canonical content remains unchanged. |
| Stale event before call | Zero provider calls; explicit stale; no evidence for current revision. |
| Edit/delete/account status or terminal decision during call | Revalidation fences late response; current state and evidence remain unchanged. |
| Completed duplicate delivery | Existing correlated receipt returned/duplicate outcome; no new durable row or authoritative state change. |
| Concurrent delivery | One durable evidence commit; loser handled explicitly. Provider-call count recorded truthfully, not falsely asserted exactly-once without a lease. |
| Unknown then successful explicit retry | Same original revision correlation; unknown does not impersonate success or permanently exclude usable evidence. No automatic retry policy assumed. |
| Identical scoped peer overturn | Existing override/fingerprint preserved; protected/no-write until approved store semantics; no reopen/republish. |
| Independent safety hold | Hold remains effective for safe, flagged, unknown and late responses; no authoritative decision/declaration mutation. |
| Private, cross-user and guest paths | Provider input is server-authorized synthetic content; no new client endpoint or cross-user read; existing public-read isolation remains unchanged. |
| Existing ordinary evaluation | Its provider row, `evaluation-only-v1`, declaration and pending publication status remain intact; safety cannot masquerade as that completed evaluation. |
| Sensitive-data logging | No synthetic token/key/body in emitted logs; only allowed metadata/error categories. |

Run the new native Workerd tests against disposable local PG with runtime/Jobs
roles, bounded SQL timeouts and hard outbound denial. Also rerun the existing
OpenAI native redirect fixture, ordinary post-moderation workerd tests, runtime
revision tests, scoped community-appeal tests and relevant admin/Jobs integrity
tests. Run native typecheck, lint/architecture/resource/config validators and
exact-head CI. Record pass/fail/skip/unrun precisely; no live-provider claim is
derived from injected responses.

### Sequence and release decisions

1. Parent reviews/allocates the two-file preparation slice and confirms its
   evaluation-only boundary. Confirm supported text scope, future persistence
   ownership and required safety-versus-authorship consumer separation.
2. Implement the isolated adapter with disabled selection and injected dependencies;
   add the synthetic acceptance cases. Keep production Jobs imports/hooks unchanged.
3. Review persistence feasibility and its explicit fingerprint/unknown-recovery
   constraints. If unresolved, ship only preparation code/tests and report the
   blocked production integration plainly.
4. Create a separately reviewed draft PR after local validation; verify remote
   head and monitor exact-head CI. No merge/deploy/activation by that lane.
5. Parent separately approves hook ownership, ordinary-post provider/data-sharing
   authorization, binding/credential handling, budget admission, timeout/retry
   configuration, evidence retention and any enforcement-policy change. No new
   paid resource or credential is introduced by preparation.
6. Authorized owner/provider verification must establish actual deployed SHAs,
   gates, bindings, queue/provider health and final-state handling before a live
   posting/detection claim. Previously denied operations remain stopped. Owner
   hands-on acceptance is separate from synthetic developer validation.

Rollback of preparation is a reviewed revert of its new adapter/tests. A later
allocated hook needs its own reviewed disable/revert procedure, preserving
existing pending posts, evidence, safety holds and appeal decisions. No rollback
may delete/relabel live content or silently publish pending posts.
