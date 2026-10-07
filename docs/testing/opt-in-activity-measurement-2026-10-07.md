# Account daily activity pilot

Kyle approved the explicit opt-in pilot at 2026-10-07 18:15:47 UTC. This source draft is separate from PR948, whose reviewed head and immutable evidence are preserved. No production schema, grants, provider, collection, cleanup or activation is authorized by this draft.

The approved grain is canonical authenticated account plus server UTC active date. A visible foreground app-render callback, including an empty feed, can create one row. Background refresh, timers, heartbeat and content browsing events cannot create activity. The browser signal is a client assertion; the server can validate authentication, purpose, revision, body shape, date and deduplication, but cannot attest physical human visibility.

The new purpose reuses identity.consent_records and the existing analytics/privacy UI paths. Existing anonymous local consent does not grant this account-linked purpose. The exact notice is version activity-account-day-v1. Consent decisions are existing account records; activity dates expire within 61 days. Withdrawal and privacy deletion remove dates. Export includes dates and consent state through the existing privacy workflow. No URLs, content, session history or per-render timestamps are retained for this purpose.

## Metric default

The opt-in collection approval is recorded above. The completed-day windows and quiet interpretation below are a proposed coherent default for owner review, not a change to moderation, ranking, reputation, retention policy or a whole-population activity definition. Activation requires the metric owner to accept these exact populations and the coverage method.

DAU is the last completed UTC day, WAU is the last seven completed UTC days, and rolling MAU is the last thirty completed UTC days. Each metric includes only retained active non-acceptance accounts continuously opted in since that metric's window start. Cohort sizes can differ and must be disclosed. Current-day collection is provisional and does not enter these sealed windows.

Quiet means active in the preceding thirty complete UTC days and no observed activity in the following thirty complete UTC days, among accounts continuously consenting for all sixty days. It is unavailable unless measurement coverage for both windows is verified. Missing coverage, missing pre-cutover history or a new consent episode cannot establish zero activity. Positive active observations may be shown as a lower bound under incomplete coverage; quiet observations cannot. Public contributors retain their separate existing source; no ratios mix the populations.

Coverage facts are operational metadata, not fabricated from requests or activity row presence. They start unknown. The source and method for verifying each complete UTC day remain an activation review gate; no automatic assumption of complete coverage is included.

## File ownership

Domain-owned source and tests planned for this draft:

- packages/contracts/src/activity-measurement.ts and packages/contracts/tests/activity-measurement.test.mjs
- packages/db/src/activity-measurement.ts and packages/db/src/activity-measurement-privacy.ts
- packages/db/tests/activity-measurement.postgres.mjs
- apps/lythaus-public-api/src/activity-measurement-handler.ts and apps/lythaus-public-api/tests/activity-measurement-handler.test.mjs
- apps/lythaus-admin-api/src/activity-measurement-handler.ts and apps/lythaus-admin-api/tests/activity-measurement-handler.test.mjs
- apps/lythaus-jobs/src/activity-measurement.ts and apps/lythaus-jobs/tests/activity-measurement.test.mjs
- api/openapi/activity-measurement.yaml
- database/planetscale/proposals/opt-in-activity-measurement.sql and database/planetscale/proposals/opt-in-activity-measurement.rollback.sql
- lib/core/analytics/activity_measurement_client.dart, activity_measurement_providers.dart and foreground_activity_observer.dart
- lib/features/privacy/widgets/activity_measurement_settings_card.dart and the existing analytics_settings_card.dart insertion
- test/core/analytics/activity_measurement_client_test.dart, activity_measurement_providers_test.dart, foreground_activity_observer_test.dart and activity_measurement_fixture.dart
- test/features/privacy/activity_measurement_settings_card_test.dart
- apps/control-panel/src/pages/ActivityPilotSummary.jsx, ActivityPilotSummary.test.jsx, activity-pilot.js, activity-pilot.test.js and activity-pilot.fixtures.js
- apps/control-panel/src/pages/Dashboard.jsx for the disabled pilot summary insertion; its existing tests verify no additional default request
- scripts/tests/activity-pilot.browser.mjs
- this evidence document

Shared integration requires coordination before edits: apps/lythaus-public-api/src/index.ts; apps/lythaus-jobs/src/index.ts; apps/lythaus-admin-api/src/index.ts; packages/contracts/src/index.ts; packages/db/src/index.ts; lib/main.dart; api/openapi/openapi.yaml; api/openapi/dist/openapi.json; lib/generated/api_client/lib/lythaus_api_client.dart; lib/generated/api_client/lib/src/serializers.dart; lib/generated/api_client/.openapi-generator/FILES; .github/workflows/ci.yml. Generated domain API/model/doc/test paths will be enumerated by the owner during regeneration, preserving PR921/PR950's unmerged generated changes. No global package lock edit is planned.

PR921 is at 21f014ee1a7095e495127e52b2198f4498d5906c; PR950 builds on it at 04b22c38c8f1e0ad6ec0d7a8f8c7d65c1d978c62. PR954's latest read-only head is 60fc094fdb469e92719e6ae9a178460caae9e2ab, extending PR950's contributor privacy export/deletion hooks. Preserve all three unmerged privacy chains. The pilot branch started at reviewed PR948 da99f7d8ca9c1bae10c2c58994ddb7e5db862e79, based on main 789e4a6e90f9b6af440f0fa68192fbfed420f0fd. The coordinator subsequently advanced PR948 to 9866ab19e2a3ed85ed71c1cd99612892c728317b on main b090c137cce5d8c45f63a86b0729aab33748d122. Its only tree change from da99 is the reviewed Flutter auth browser fixture repair. This pilot targets that separate dependency branch; it does not alter PR948's branch or evidence.

Read-only PlanetScale discovery succeeded. The currently listed database branch is main; no development branch was returned. All proposal writes and test fixtures will run only in a disposable local PostgreSQL17 database. No branch creation or live data scan is planned.

## Review and activation gates

- Independently review the exact proposal, function ownership, execute grants, actor isolation, expiry and rollback; no live DDL or security-permission change in this task.
- Apply shared integration alongside the current profile/support privacy workflow. Until then, domain tests do not claim an invoked Public/Admin dispatcher or complete DSR integration.
- Verify bounded physical cleanup in the existing retention workflow, with expiry filtering independent of cleanup success and an activation-time purge/lag check. PostgreSQL does not physically remove an expired row automatically.
- Approve operational coverage evidence and cutover. No backfill or whole-population active/quiet claim.
- Keep server and client activation disabled; migration proposal installs a disabled flag and an unset cutover.
- Resolve main auth fixture PR952/CI gates, independent review and parent serialized merge slot; no self-merge or deployment.

Implementation references: [PostgreSQL17 secure definer functions](https://www.postgresql.org/docs/17/sql-createfunction.html), [Flutter post-frame callbacks](https://api.flutter.dev/flutter/scheduler/SchedulerBinding/addPostFrameCallback.html), and [Flutter lifecycle states](https://api.flutter.dev/flutter/dart-ui/AppLifecycleState.html).

## Existing sources retained

Overview already supplies retained public post/comment counts, comments per new post, unique contributors, registrations and current Free/Premium/Black entitlements. Account/waitlist sources remain in their existing routes. This draft adds no duplicate source for those metrics. Contributor activity remains a labelled lower bound in its existing population. Provider billing/usage, reader-inclusive whole-population activity, unmatched contributor ratios and moderation decision-history gaps remain unavailable. No provider entitlement, paid upgrade, credential, new scheduler or billing estimate is introduced. Monthly 13500 and disabled feature distinctions are unchanged.

## Requirements, code and verification

| Requirement | Code | Evidence |
| --- | --- | --- |
| Explicit new account-linked purpose; anonymous consent cannot grant it | activity-measurement contract; Flutter client and settings card; consent definer function | Exact cross-language notice test, opt-in/out tests, legacy anonymous PG17 test |
| Authenticated foreground visible app render, including empty feed; no heartbeat/history | foreground_activity_observer.dart; minimal render input; existing JWT provider and secure Dio | Resumed/hidden/inactive/paused/frame tests, empty feed, disabled/no automatic request, strict body rejection and exact transport payload |
| Canonical account + server UTC day, one row | record_activity_measurement_day; HMAC account scope; consent revision and epoch | Six concurrent replays, UTC timezone boundary, no replay timestamp change, stale epoch/account-switch and withdrawal race tests |
| Expiry and withdrawal; safe export/delete | purpose-local privacy functions and Jobs adapters | Bounded expiry, expiry-filtered export, authoritative request/subject match, legal hold, preservation of other consent purposes and denied raw-role reads |
| Optional schema must not break unrelated privacy work | catalog readiness check and marker | Absent, incomplete and rollback fail-closed tests; ready check using restricted privacy role |
| Consenting-cohort sealed DAU/WAU/MAU/quiet | bounded aggregate; coverage facts; activityMetric | Complete window boundaries, differing cohorts, acceptance/suspended exclusions, missing/pre-cutover coverage, zero versus unavailable, capacity and revoked-owner PG17 cases |
| No identity/content in aggregate or logs | aggregate DTO; owner audit metadata only; sanitized handlers | Response identity checks, strict minimal request tests, role isolation and audit/source failure tests |
| Responsive, accessible and honest display | ActivityPilotSummary; existing Overview insertion; settings card | Existing admin tests plus pilot freshness/partial/zero/403 cases; Flutter 320px/200% actual light/dark; Chromium eight viewport/theme/text cases |

Initial native evidence is 22 passing tests with per-file V8 coverage, not a claim that the entire repository is covered. PostgreSQL17 has 12 passing tests; the final synthetic aggregate timing was 4.11 ms against the configured 1500 ms timeout. Candidate snapshots use at most 5001 consent candidates before any aggregate result, refuse counts over 5000 accounts, and probe the per-account primary key for bounded retained dates. This small fixture timing is not a production latency or scale guarantee. Physical expiry deletes at most 500 indexed rows per call, removes empty purpose-local location entries, and never scans production data.

Flutter has 26 passing relevant tests, including the five retained anonymous-consent tests, and analyzer validation. The admin suite has 124 passing tests and a production build. The domain OpenAPI fragment was assembled with an unchanged bundled root in an external evidence directory and lints successfully with two inherited root warnings; root/bundle/generated-client integration remains owned by Lane B. Chromium UI evidence uses captured, unchanged PostgreSQL synthetic aggregate output with a visible synthetic watermark and disclosed API interception. Its browser clock is fixed one second after that sample for deterministic freshness. This proves rendering/interaction only, not real dispatcher authentication or complete DSR integration. WebKit launch is blocked by the host's missing libGLESv2.so.2; the cached-library path did not resolve the dependency check. No dependency-check bypass or new browser install was used.

## Concrete serialized integration request

The following small shared hooks are requested from the coordinator and current owners. Domain work is ready independently; shared files have not been edited by Lane C.

1. **Public dispatcher / Lane B:** import isActivityMeasurementPath and handleActivityMeasurement from ./activity-measurement-handler.ts. After existing hostname/origin and rate-limit enforcement, match only the two domain paths, call the existing principal(request, env), invoke the handler, and wrap its response through existing privateResponse/CORS handling while preserving status and no-store. Do not copy bearer parsing, origin exceptions or rate limits into a new path. Verify real JWT token-version revocation, body cap, 401/409/429, preflight and forbidden origins on these actual routes.
2. **Admin dispatcher / coordinator:** import handleActivityMeasurementSummary from ./activity-measurement-handler.ts. Beside the existing Overview handler, after verified Access, live owner membership and administrator rate-limit enforcement, add GET /api/admin/activity-measurement using the existing actor, correlation ID and cors wrapper. Verify unauthorized/nonowner/revoked-owner/rate/audit/source failures on this invoked route.
3. **Jobs / Lane B + Support A:** import the four activityMeasurementPrivacy* / activityMeasurementRetentionBatch hooks from ./activity-measurement.ts. Reconcile pilot locations after existing subject/monthly reconciliation in both delete/export paths. Add a separate purge step after the authoritative legal-hold gate and before account/consent deletion. Attach the explicit activityMeasurement export component before storing and completing the passport; absence is status not_collected, partial installation throws. Drain bounded 500-row retention batches in the existing RetentionCleanupWorkflow with a reviewed run bound/backlog policy, not a new scheduler. Preserve PR954's support imports, contributor export, verify-support-deletion-locations and final reconciliation guards. The marker intentionally survives rollback; removing it requires proof that no purpose consent data remains.
4. **App root / Lane B:** import ForegroundActivityObserver and wrap the existing MaterialApp.router result with it, preserving the router, profile/content providers and authenticated revision source. ACTIVITY_MEASUREMENT_PILOT is false by default. The privacy settings insertion already exists in this draft. Verify an actual authenticated visible empty-feed render and withdrawal/regrant/account-switch through the integrated app; background frames must not count.
5. **OpenAPI/generated clients / Lane B:** add refs for the three paths and five schemas from activity-measurement.yaml, then regenerate the root bundle and domain clients against the current PR921/950/954 chain. Preserve their registries and generated models. Domain direct imports require no package barrel edits.
6. **CI / coordinator:** invoke the four native domain suites, disposable PG17 proposal suite, relevant Flutter tests, admin tests and rendering checks in existing appropriate jobs. No global package/lock changes or CI bypass. Normal required checks and independent review remain merge gates.

Activation is a later exact gate for proposed PostgreSQL objects and permissions, independent function-owner review, cutover and truthful coverage facts, physical retention/withdrawal/export/delete integration, and server/client flags. Client build flags do not grant consent or activate the server. Coverage facts remain unknown by default and are never inferred from the presence or absence of activity rows. Until complete coverage is verified, a missing or empty count remains unavailable. The user-facing notice cannot be activated until the promised expiry and all privacy hooks are operationally proved.

The exact repository command npm run format-check was run and fails on unchanged baseline lib/features/authenticity/alpha_api.dart and alpha_screen.dart in its first batch. Both are byte-identical to dependency base 9866ab19 and outside this lane. All ten pilot/retained-consent Dart files pass the same formatter's --output=none --set-exit-if-changed check. The global format gate needs its source owner; no unrelated formatting fix or CI bypass is included.
