# Post composer incident: 10 October 2026

This slice repairs the routed composer and adds reproducible synthetic tests of
the existing post/moderation integration. It does not activate a feature, change
moderation policy, migrate a live database, or certify production detection.
Owner hands-on acceptance remains scheduled for Sunday 11 October.

## Baseline and deployment evidence

- Fetched [the canonical Lythaus repository](https://github.com/AsoraKK/Lythaus/)
  main: `dba135ca3720b1311c5ec3d1d9e00ab7a67a568d`.
  PRs #975–#978 are already present; their fixes are unchanged.
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
| Detail, comments, one-level replies and edit/delete under current policy (S1; canonical contracts) | `post_detail_screen.dart`, `comment_thread_screen.dart`, public content handlers/OpenAPI | Existing post/comment journey/widget tests and PG suite cover owner edits/deletes, pending exclusion, reply policy, tombstones and retry. Comments dispatcher availability is PR #983's separate gate; this slice does not fix that shared file. |
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
| `flutter test --no-pub test/features/feed/application test/features/feed/presentation test/ui/screens/adaptive_shell_test.dart test/widgets/post_actions_test.dart test/features/reactions --reporter expanded` | 500 passed on final source, including new navigation tests. |
| New navigation file rerun after final exit-helper change | 10 passed, including tooltip/error feedback. |
| `flutter analyze --no-pub`; format check of changed Dart files | Passed, no issues; two files already formatted. |
| `npm run typecheck:native` | Passed. |
| Runtime/product policy, admin/Jobs invariants, authenticity evaluation/Omni synthetic regression files | 42 passed. |
| Existing `content-journey.postgres.mjs` | 4 passed. |
| New `post-moderation.workerd.mjs` | 5 passed. |
| `npm run openapi:lint`; `npm run openapi:test:contract` | Lint passed; 69 tests passed, 17 skipped in one standard skipped suite. |
| Native Worker configuration and resource registry validators | Passed: 4 configs/3 generated type files, 33 registered resources. |
| Main-entrypoint release build and baseline browser reproduction | Built; one expected-broken reproduction passed with persisted pending post and white screen. |
| Repaired main-entrypoint release browser | 4 passed: mobile pending, desktop slow repeated click/Close, mobile lost acknowledgement/retry, mobile validation error. All synthetic product API responses were checked; only injected 400/503 and initial synthetic refresh 401 were expected errors. |
| JavaScript syntax, `git diff --check`, repository hygiene, active branding, documentation secret hygiene, retired-provider dependency validation | Passed. |

Failed exploratory runs are retained in `/tmp`: the old-source widget run fails
on root navigation as expected; initial browser runs failed on test locator
strictness/feedback lookup and a local connection reset; an initial native queue
test had an incorrect relay-error expectation/untargeted injected failure. Those
test harness errors were corrected without weakening product or policy gates.
The first PR head also failed the CI naming guard because this report used the
bare repository owner/name. The report now uses the canonical repository link;
the existing guard remains unchanged.

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
