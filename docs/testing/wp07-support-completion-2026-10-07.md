# WP07 support completion and activation handoff

Evidence date: 7 October 2026 UTC. Lane A, one bounded support runtime/test seam.
Base/main: `8f9293fd7ee1bb54382101c04955dff4be7d5499` (refreshed from origin).
Candidate branch: `codex/wp07-support-completion`. The final exact candidate SHA
and draft PR are recorded in the parent handoff; this document travels with that
candidate. Independent review is requested through parent and remains pending.

## Result and authority

The existing private engine already implements both problem reports and
suggestions. No runtime implementation defect was reproduced in this bounded
review. The concrete remaining test defect was the runtime's absent-schema test:
it passed a policy object rather than serialized configuration, omitted its
terminal states and required evidence, and never asserted readiness was reached.
The test therefore returned `null` before its schema callback. WP07 supplies a
valid serialized policy, requires the callback, and checks both positive runtime
channels, malformed policy and readiness failures.

The PG17 suite now invokes the actual Public/Admin Worker fetch methods, runtime
factory, capability SQL, HTTP adapter and existing support service. The tests
exercise both destinations with signed member and Access subjects, current role
checks and restricted PG roles. They also exercise explicit retained-audit policy.
Only the test's `pg.Client` maps an explicitly named synthetic Hyperdrive binding
to disposable loopback PostgreSQL. A local JWKS server supplies ephemeral fixture
keys. The factory, authentication, dispatcher and SQL are not replaced with stub
success. This proves source invocation and PG transactions, not workerd,
Cloudflare Access configuration, Hyperdrive origin TLS or deployed bindings.

Authority is Kyle's 7 October 03:47:39 UTC completion instruction, the bounded
WP07 delegation, and 05:09 push-one-at-a-time reconfirmation relayed by parent.
It authorizes this source/test/document draft, not S01/F01 decisions or any
production action. No new policy approval/version/expiry is inferred.
The current Library skill successfully read both supplied records in full:
`libfile_4d87cee02a3481918e9caadda3cac02c` and
`libfile_d8b3bc8a258c81918d12af5251a6a840`; neither returned a version ID.
Root `AGENTS.md` applies; no nested guide or repository `.agents/skills` was found.

## Ownership and source inventory

Changed files are exactly the two support DB test files, this packet,
`docs/runbooks/support-feedback-roadmap.md`, and
`docs/testing/support-feedback-local-services.md`. No Lane B reserved file,
dispatcher, barrel, OpenAPI root/bundle, generated Dart, manifest/lock, CI,
profile/settings/shell/router or shared browser-auth test changes are required.
No serial integration patch is requested for this candidate. Parent owns any
later canonical migration, privacy locator and shared integration work.

| Requirement | Existing source/contract | Evidence and remaining boundary |
| --- | --- | --- |
| Separate text-only problem and suggestion destinations | `packages/contracts/src/support-feedback.ts`; `packages/db/src/support-feedback-http.ts`; `lib/features/support/**`; `apps/control-panel/src/pages/SupportFeedback.jsx` | Contracts and invoked PG-backed member histories/owner queues; kind mismatch rejected. No attachments, logs, public board, SLA or points. |
| Real invoked APIs | Public `/api/support/{options,problems,suggestions}` and per-kind detail/messages; Admin `/api/admin/support/...` adds private notes/evidence/decision | Dispatcher routing and newly invoked PG-backed factory/HTTP/service. Source no-store headers verified; deployed cache/bindings remain unverified. |
| Identity/object/owner boundaries | `support-feedback-auth.ts`; service `run`, `load`, `mutate`; SQL `support.lock_owner` and scoped idempotency functions | Signed JWT + current token/account, cross-member/wrong-kind 404, administrator denied owner role, revoked owner denied, actual locks held through audit/commit. No browser role grants authority. |
| Submission/limits/rate/retry | Strict supplied policy; discriminated DTOs; bounded HTTP JSON; `system.rate_limit_windows`, `system.idempotency_keys` | Unknown/attachment/mixed input rejected; 201/200 replay; 409 revision; 429 quota; audit rollback and same-key retry. Original PG suite checks concurrent keys/revisions, target-bound replay, outbox/deferred COMMIT failure. |
| Histories, decisions, private data | Service keyset list/watermark and revision pages; same-request typed evidence and decision ledger | Scoped complete pagination, request lookahead/index plans, public/private projection isolation, audited owner disclosure. No suggestion award or acceptance event transport added. |
| Export/delete/retention/holds | `support-feedback-privacy.ts`, `support-feedback-privacy-runtime.ts`; Jobs export/deletion/retention adapters | Real PG paginated public-only export; scrub rollback; active/racing holds; purge/replay ordering; held-heavy retention; explicit synthetic audit retention. Partial schema/privacy grant failures retry; all six support tables absent is optional. Full Jobs Workflow execution remains untested here. |
| Canonical locators | `privacy.reconcile_subject_data_locations(uuid)` in canonical migrations 0004/0012; Jobs `recordDeletedSupportLocation` | Canonical locator does not register support. Jobs records retained `support.requests` on deletion only. Approved additive locator reconciliation and integrated passport/deletion-completion evidence remain gates. |
| Account switching | `support_feedback_providers.dart` binds cancellation/current session to auth revision; member client rechecks after response | Existing widget scenarios cover cancellation and switching; Flutter execution on this candidate is not run locally. Server stale-token denial passed. |
| Notifications | `loadSupportNotificationCandidate` reloads current public revision, active subject and pending deletion | PG stale/private-only/inactive/deletion/malformed eligibility tests; zero sends. Eligibility is not preferences, dispatch-time atomicity, dedupe or delivery acceptance. |
| Owner rendered states | Existing owner console and support configuration | Pinned component/router tests; desktop/mobile synthetic Chromium checks, keyboard interactions and role-loss clearing. Native/member UI and real screen reader remain unverified. |

PR metadata refreshed on 7 October:

- [PR909](https://github.com/AsoraKK/Lythaus/pull/909): merged 4 October
  15:29:40 UTC; head `3f7345e9e277c023b4b09306c5b9ac681c6e89e5`,
  merge `95fd4c67e1a0a2fc5496cf74efc81b8be25b4790`.
- [PR910](https://github.com/AsoraKK/Lythaus/pull/910): merged 4 October
  16:04:30 UTC; head `582059ef902b9cb87519ca8b9816fc9f3c1e1ddd`,
  merge `28eb5803872bb053a728c6ce31213f59b81f02ad`. Exact-head check-runs
  report 18/18 completed/success, including [support validation](https://github.com/AsoraKK/Lythaus/actions/runs/37214977755).
  The legacy status endpoint returned no statuses; it is not the check-run ledger.
  These historical results do not certify the WP07 candidate.

PR903 Accounts/Overview, PR926 account/waitlist lists, and reviewed merged PR942
auth evidence are retained. Owner account lookup/history is a distinct workflow.

## Configuration, schema and grants

Public and Admin consume `SUPPORT_FEEDBACK_ENABLED === 'true'` and serialized
`SUPPORT_FEEDBACK_POLICY`. Jobs consumes policy for existing support privacy data
even when intake is disabled. Flutter's `LYTHAUS_SUPPORT_FEEDBACK_ENABLED`
defaults false; console `VITE_SUPPORT_FEEDBACK_ENABLED` requires literal `true`.
No production flag/configuration was set. Local synthetic Worker fixtures and a
local console process enable their test surfaces only. The coordinator's
release102 support-OFF statement is supplied evidence, not a new live flag read.

Authorized metadata-only PlanetScale reads found `lythaus/lythaus-core` ready,
one branch (`main`), no development branch, and an empty schema response for
namespace `postgres.support`. Metadata's default table count is 102; that is not
an independent catalog/grant/fingerprint query. No database read-query tool was
used: its declared short-lived credential creation is outside this task's
no-new-credentials boundary. Production role privileges remain unknown.
The older AGENTS branch/table snapshot is historical and was not substituted.

Canonical validation reports 20 migration files and 102 launch tables through
0020. The existing local proposal is outside the automatic manifest and refuses
databases not named `lythaus_support_test%`. It contains six support tables,
nine explicit indexes and three SECURITY DEFINER functions. UUIDs are supplied
by the application, with no new database UUID default/function.

| Role/capability | Existing local proposal and canonical foundation | Production prerequisite |
| --- | --- | --- |
| Member runtime | Support schema USAGE; SELECT/INSERT/UPDATE requests; SELECT/INSERT messages; INSERT operation_refs; canonical identity/privacy checks and rate/audit/outbox/idempotency grants | Resolve real provider role labels and test exact narrow grants; runtime has no private-table/helper access. |
| Owner admin | Requests/messages, private notes/evidence/decisions, operation refs, three helper EXECUTEs; canonical membership/account and rate/audit/outbox grants | Verified Access plus active owner account/membership; no general idempotency-table grant. |
| Privacy | Requests SELECT/UPDATE/DELETE; history/private/ref SELECT/DELETE; identity lock, privacy request/hold reads and shared scrub-target grants | Exact role/grant, audit-retention decision and locator acceptance; privacy must remain usable after intake rollback. |
| Helper owner | Local suite transfers functions to NOLOGIN/non-superuser `lythaus_support_lock_fixture`, narrowly grants identity locks and scoped idempotency access, fixed `pg_catalog,pg_temp` search path | Production function owner/role mapping is an explicit reviewed choice. Do not copy the fixture owner or keep a migrations/superuser definer by default. Revoke PUBLIC and unrelated-role EXECUTE. |

Registry/source bindings are Public `DB_APP_FRESH` → existing
`lythaus-db-app-dev`, Admin `DB_ADMIN_FRESH` → `lythaus-db-admin-dev`, and
Jobs/Admin `DB_PRIVACY_FRESH` → `lythaus-db-privacy-dev`. Existing promoted
resources are reused. Live origin/role/fresh-cache identity evidence is
coordinator-owned and was not inspected or changed here.

## Ordered forward, rollback and acceptance packet

This is a gate packet, not an executable production migration. There is no
approved production DDL artifact to apply, and the local-only SQL refusal stays.

1. Parent arranges read-only independent review of the exact WP07 SHA and
   required hosted checks. Keep the candidate draft until that review resolves.
2. Kyle records **S01**: exact versioned per-kind categories/states/transitions,
   terminal reasons and evidence; every byte/page/window/quota bound; retention
   age, batch/timeouts, deletion request states and audit retention; hold placement
   and release/lock authority. Test values are not proposed production defaults.
3. Database/privacy owner prepares an additive canonical migration from the
   existing six-table/three-helper/nine-index design, real role mapping and
   restricted helper owner. Preserve migration checksums and the local proposal
   refusal. Capture production metadata/fingerprint and approved grants without
   exposing credentials. Review index/retention costs and validate on disposable
   PG17 before a separately authorized production DDL action.
4. Integrator serially adds canonical support subject locators for live requests,
   dependent public/private content and retained tombstone/audit handling, using
   approved S01 classification. Prove paginated export, deletion completion and
   retention with wholly absent schema, partial schema, missing grants, racing
   holds, interrupted batches and audit-retention choices through actual Jobs
   workflows. Do not change shared files concurrently with Lane B.
5. Coordinator verifies exact Public/Admin/Jobs serving versions, fresh binding
   identities/roles/cache behavior and real owner Access. Record positive-serving
   rollback version IDs at that time; none is invented here. Obtain current
   Flutter/generated-client/native and accessibility evidence on the integrated
   candidate. Required hosted CI/security stays unchanged.
6. Only after S01, reviewed schema/grants/locators, integration checks and explicit
   activation approval may the coordinator consider the independent API/build
   flags. Real acceptance covers sign-in/guest rejection, both submission/history/
   detail/reply paths, role revocation, account switch, kind/object isolation,
   Unicode/size/attachment rejection, 401/403/404/409/413/422/429/503 states,
   page boundaries, retry/duplicate/concurrent revisions, private disclosure,
   audit failures and DSR/holds/retention. Record owner outcome per scenario.
7. On rollback, coordinator disables new intake/UI exposure, uses captured
   compatible serving versions, and stops optional notification/award work.
   Retain additive schema, policy/grants and authorized export/delete/hold/retention
   paths. Do not drop support data/functions, rewrite applied migrations, erase
   audit by inference, detach queues or rerun release101. Restore/forward-correct
   only under the separate approved operational procedure.

Support notification purpose/template, destination consent/preferences,
idempotent dispatch, send-time privacy checks and receipts remain a separate
approval. No mail, push or provider request is sent by this package. The existing
`support.workflow.changed` intent is not an award event. The roadmap's proposed
accepted/reversed contribution envelope remains unimplemented pending **F01**;
it must contain IDs/version/time/minimal evidence references, never ticket prose
or private contacts. F01 must place 150 quarterly inside the frozen 13,500 budget
and resolve source month, boundaries, rubric, conflicts, duplicates and reversal.
No points from submission/closure, cap increase, monthly stacking or activation.

## Local validation and limits

Commands are run from the repository root unless marked console. Final runs
must use the committed exact candidate head reported to parent.

| Check | Result before final-head rerun | Toolchain/fixture |
| --- | --- | --- |
| Support contract/HTTP/runtime + Public/Admin routing | 33 passed, 0 failed/skipped | Node 22.23.3 and 24.19.0; existing contract tests include TypeScript validation. |
| Support PG17 service/runtime/Workers | 35 passed, 0 failed/skipped | Node 22.23.3; PG 17.11, loopback-only disposable database, exact canonical migration bytes + existing local proposal + restricted roles. |
| Owner support component/router/config | 10 passed in 3 files | Lock-pinned Vitest 4.1.11; console `npm ci --ignore-scripts --no-audit` with task-local npm cache. |
| Console build | PASS | Vite 7.3.6; production default-off build. |
| Native typecheck; migration baseline; retired-provider validation; whitespace | PASS | TypeScript 5.5.4; 20 migrations/102 launch tables; `git diff --check`. |
| Rendered owner console | PASS at 1440×900 and 390×844 | Playwright 1.62.0, system Chromium 151.0.7922.173, synthetic local intercepted APIs; Browser plugin unavailable. |
| Page identity/nonblank/framework/keyboard | PASS | Title/URL, meaningful queues/detail, no overlay, keyboard kind switching/reply, status update. |
| Private detail after role loss | PASS | Synthetic 403 clears queue/selection/private notes/reply controls. |
| Responsive/accessible labels | PASS with limits | No horizontal overflow; ARIA snapshot/labels checked. External fonts blocked before network; expected blocked-font/403 logs only. Actual screen reader, large text/reduced motion and native acceptance NOT RUN. |
| Flutter support/settings/router + generated Dart parity | NOT RUN locally | Flutter/Dart absent; official SDK catalog retrieval returned HTTP 404. Historical PR910 green jobs are not reassigned. Current hosted CI required. |
| Deployed workerd/Hyperdrive/cache/owner/provider | NOT RUN | Local Node fetch invocation and PG transactions are scoped synthetic evidence. Production schema/configuration and owner acceptance remain gates. |

Focused command: `node --experimental-strip-types --experimental-test-module-mocks
--test packages/contracts/tests/support-feedback.test.mjs
packages/db/tests/support-feedback-http.test.mjs
packages/db/tests/support-feedback-runtime.test.mjs
apps/lythaus-public-api/tests/support-feedback-routing.test.mjs
apps/lythaus-admin-api/tests/support-feedback-routing.test.mjs`.
PG command: set `SUPPORT_LOCAL_PG_URL` to an authorized loopback
`lythaus_support_test` database, then
`node --experimental-strip-types --experimental-test-module-mocks --test
packages/db/tests/support-feedback.postgres.mjs`.
Console: `npm test -- --silent=true src/pages/SupportFeedback.test.jsx
src/support-feedback-routing.test.jsx src/support-feedback-config.test.js` and
`npm run build`. Native: `npm run typecheck:native`,
`npm run validate:planetscale-migrations`,
`npm run validate:no-retired-provider-dependencies`.

The initial console dependency reinstall failed because its default cache path
was unavailable; the same pinned install succeeded with a writable task cache.
First new PG assertions were corrected for the existing admin correlation ID
and a test array bind. Browser's first attempt encountered stale Vite optimized
dependencies after reinstall; restarting the local server resolved it. None was
treated as a product defect or suppressed to obtain a pass. A read of
`/root/.cache/ms-playwright` was denied and stopped, with no retry/bypass;
system Chromium is a separate available executable. Screenshots/ARIA/fixture
script and final test logs remain execution-local evidence, not transferable
paths or live records. No current coverage percentage is claimed.

Fixture provenance: PostgreSQL image digest
`sha256:d74eeac9a635390a49bc21bd49fccd973de707e2a53a76ac49b552b8712ec46f`;
unchanged SQL proposal SHA-256
`244fe711264a90e9d1832c5a6a27c6672b5085c3bf4509f61aa79a1dafb2591d`;
contract `a529504793934088e6eb389e9240cd6ac61ec743b0a5cab20f7122c19b2e58a7`;
OpenAPI fragment `f345667ebb33f709a9dad1ed0c8fb7d74ce422d97232cc2533e3fea6b2297c0f`.

## Completion states and parent handoff

| Slice | Implemented | Tested | Merged | Deployed | Activated | Owner accepted |
| --- | --- | --- | --- | --- | --- | --- |
| PR909/910 foundation | Yes, reused | Historical exact-head checks plus scoped current local evidence | Yes | Release102 source inclusion, coordinator supplied | OFF per coordinator | Not established |
| WP07 runtime/test evidence + packet | Candidate complete | Local results above; final exact-head receipt in handoff; hosted checks pending | No | No | No flag change | No |
| Production schema/grants/locator/S01 | Local proposal and existing privacy adapters only | Disposable fixture evidence | Canonical production delta absent | No WP07 provider application | Gated | Missing S01 and operational acceptance |
| Notifications/F01 awards | Eligibility/proposed interface only | Eligibility fixtures, zero sends/awards | No new behavior | No new behavior | Gated | Missing separate decisions |

Minimum next action: parent requests an independent read-only review of this
exact draft and coordinates its hosted checks. Database/privacy owners and Kyle
then resolve S01 and the canonical schema/grant/locator packet before any
activation request. F01 and notification approvals are separate future packages.
Release102 remains deployed at `f757d35`, owner-uncertified/NO-GO pending owner
UAT on 10 October; main's PR942 evidence does not redeploy it. No credentials,
paid resources, hosted DB branches, production writes/DDL, provider configuration,
messages, rewards, merge or deployment were performed. Stop at this reviewable
candidate and explicit gates; no next package is started independently.
