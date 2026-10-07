# WP05: authoritative Overview sample freshness

Evidence cutoff: 7 October 2026, 05:36 UTC. Lane C implements one existing-contract freshness seam, with no new metric family or collection. Actual main/base was refreshed twice and remains `8f9293fd7ee1bb54382101c04955dff4be7d5499`. The source/test candidate is `1faab049a2d95317156ab29d3316526f20e24eda`; the draft PR also carries this report in a documentation-only follow-up. The PR records its final head and current checks.

## Finding and resulting behavior

Before the fix, a sample cached at database time 12:00:00 was returned as HTTP 200 when the next owner transaction sampled 12:01:01 but the Worker cache clock had advanced only one second. The reproducer returned one aggregate scan and a database-authoritative sample age of 61,000 ms, despite `cacheTtlSeconds: 60`.

The cache now requires both the existing Worker elapsed-time checks and a fresh database sample age in `[0, 60000)` milliseconds. Exactly 60 seconds expires the sample. A database timestamp earlier than the cached sample forces recomputation. The existing period-start check still applies. Each response retains current owner/account authorization and an audit committed before disclosure. Recompute, cancellation, audit, or commit failure returns unavailable; there is no stale fallback.

This repairs existing `overview-v1` behavior on the invoked `GET /api/admin/overview` route. No dispatcher, OpenAPI fragment/root/bundle, generated client, Dashboard, navigation, package manifest/lock, CI, schema, provider binding, or feature flag changes are needed. The aggregate SQL is unchanged.

## Exact ownership

| Changed file | Purpose |
| --- | --- |
| `apps/lythaus-admin-api/src/overview-runtime.ts` | Validate cached sample age against the current owner transaction's database timestamp |
| `apps/lythaus-admin-api/tests/overview-runtime.test.mjs` | TTL boundary in Today/MTD/YTD, backward database clock, failed refresh, owner switching, separate binding isolation |
| `apps/lythaus-admin-api/tests/overview-handler.test.mjs` | Actual admin dispatcher refresh/failure and rate-denial regressions |
| `apps/lythaus-admin-api/tests/overview.postgres.mjs` | Real restricted-role timestamp-offset and cancellation transactions; bounded EXPLAIN diagnostics |
| This report | Retained source inventory, evidence, decisions, and review handoff |

Lane B's Public/profile/contracts/generated-client/router files, Lane A's support files, and Lane D's security fix remain outside this delta. No shared-file integration request is required. Four coding lanes are authorized by Kyle's 7 October instructions; their authorization supersedes only the Library documents' two-lane maximum. Independent review and merging remain serialized with the parent.

## Retained source inventory before editing

PR903 is merged at `627ae30b36cd995c4f117bf3c44789c986b5d46b`. PR926 is merged at `a5619dba50bd88cac567a9b42d8cc48064f979ee`. Their implementations were inspected and reused, not rebuilt. Current Overview definitions and query live in `overview-policy.ts` and `overview-runtime.ts`; the existing rendering is `apps/control-panel/src/pages/Dashboard.jsx`, and the canonical contract is `api/openapi/overview.yaml`. Accounts/waitlist remain PR926's real keyset-paginated routes.

| Existing metric | Grain and source | Population and interpretation |
| --- | --- | --- |
| Posts | One retained `content.posts` row, by `created_at` | Public visibility, allowed moderation, nondeleted post and author, excluding production-acceptance authors. Includes locked/suspended authors; not feed delivery or publication eligibility |
| Comments | One retained `content.comments` row, by `created_at` | Allowed, nondeleted comment and author on an eligible retained post; includes replies to older posts; excludes acceptance/deleted accounts |
| Comments per new post | Same-window eligible comments on same-window eligible posts / eligible posts | This new-post cohort ratio differs from all comments divided by new posts. No post denominator means unavailable |
| Unanswered posts | One eligible same-window post | No eligible other-author comment before the window end; self-comments do not answer |
| Unique contributors | Distinct eligible post/comment author UUID | Posting/commenting participation in the selected window; not all active users |
| New registered account records | One retained `identity.users` row, by `created_at` | All nondeleted statuses, excluding acceptance accounts; can include invitations/relink-required accounts; not completed or first-verified signup; waitlist and guests separate |
| Free/Premium/Black | Current retained account entitlement | `identity.user_entitlements.subscription_tier`, missing row means Free under the existing runtime contract. Includes nondeleted nonactive accounts. No historical tier comparison or payment inference |
| Operational account/queue figures | Existing source response or loaded page | Account active **status** is not engagement. Loaded moderation/appeal/audit page counts are not whole backlogs or final outcomes |

All community event windows are UTC, half-open `[start, end)`: Today, month to date, and year to date. Previous windows match elapsed time; a shorter prior month/year has no comparison. Current retained visibility/moderation/deletion state applies to both windows; deletion can revise historical values. Admin accounts are not independently excluded by the retained contract unless marked production acceptance. This slice does not change any population definition.

Freshness uses the current database transaction timestamp, a 60-second internal cache, current owner membership/account checks on every read, and private/no-store responses varying by Origin, Authorization, and Access assertion. Dashboard already suppresses stale numbers and period-boundary samples. A measured empty count is zero; malformed/missing data, failed queries, exceeded capacity, empty ratio denominators, and unavailable sources remain unknown. Change percentage is absent with a zero prior denominator.

## Owner decisions: proposals, not approvals

No new A01/A02/A03 decision was approved in this task. Approver, approval time, policy version, and expiry remain unset. Existing shipped definitions continue; no new tracking or retention rule is introduced.

| Decision | Small coherent proposed default | Minimum gate and owner |
| --- | --- | --- |
| A01: new/active/quiet/returning/retention | Keep the shipped labels **New registered account records** and **Unique contributors** as the available growth/participation indicators. For a future engagement family, propose a complete 30 UTC day observation window ending at today's midnight, one eligible post/comment event per account sufficient for participation, quiet = eligible established account with no event, returning = participation in both adjacent 30-day windows. Guests, acceptance/deleted accounts, admin accounts, and precreated invitations would be excluded under an explicitly approved eligibility contract. No traffic/login proxy | Kyle must approve exact account eligibility, event timestamps, admin exclusions, windows, cohort denominator, deletion/survivor bias, and a certified complete-history start. Proposed retention = the approved prior new-account cohort participating in the observation window / that same cohort. Empty/incomplete cohort remains unavailable. No complete-history certificate or first-ever verification ledger exists in the inspected Overview contract; active/quiet/returning/retention remain unavailable pending that evidence |
| A02: AI taxonomy | Distinguish member suspicion events, automated evidence runs, pending cases, final policy decisions, and appeal reversals. Count events and distinct content separately; declaration is separate from suspicion or a decision | Kyle/moderation owner must approve reason taxonomy, decision provenance/finality, policy-version dispatch, reversal accounting, retention, and disclosure. `moderation.content_flags.reason_code` is not a certified AI taxonomy; `detector_runs.signal` and private alpha evidence do not establish confirmed labels. `cases.state` is a queue state; `decisions` allow/block/queue and nullable actor fields alone do not certify human/final AI judgments. This slice queries none of these sources |
| A03: subscriptions/revenue/provider telemetry | Keep current entitlement counts separate from paid subscriptions. Show provider usage/health/storage/cost as unavailable until an authorized backend adapter has attributable, fresh, unit-validated provider evidence | Revenue needs verified payment transition/ledger/refund/currency/recognition records. Cloudflare needs registry-scoped requests/errors/latency/queues and separate billing evidence; CPU time is not end-to-end latency. PlanetScale needs used storage versus provisioned capacity, connections/query health, and separately attributed billing. Each adapter needs scope, sample time, observation/billing period, freshness budget, query/poll budget, API authorization, and privacy/retention review. Accrued estimate and finalized invoice stay separate; shared-account totals and cross-provider billed lines must not be double counted |

The available Library plan and master/WP05 prompts were read through the current Library skill (`libfile_4d87cee02a3481918e9caadda3cac02c`, `libfile_d8b3bc8a258c81918d12af5251a6a840`). Repository AGENTS guidance was read. Authorized PlanetScale branch and `postgres.social` schema metadata reads succeeded; the branch listing showed only main. No production data query, ephemeral query credential, provider telemetry/billing query, write, DDL, branch creation, or provider configuration was performed. Connected read capabilities do not establish runtime adapter authorization, currency, billing attribution, measured storage, or operational health. Runtime provider adapters remain disabled/unavailable with null values.

## Requirement → source → evidence

| Requirement | Code/contract | Tests/evidence | Result |
| --- | --- | --- | --- |
| Authoritative source freshness | `handleOverview`, existing database sampledAt and TTL | Runtime 59,999/60,000 ms tests for all three periods; dispatcher; restricted PG timestamp offsets | Pass; the before-fix reproducer returned a 61-second sample |
| Negative/backward clock and failure handling | Cache sample age and existing safe error mapping | Runtime backward-clock/recompute failure; PG cancellation at 1 ms; invoked dispatcher 503 | Pass; no stale response or success audit |
| Authorization, rate, cross-account isolation | Current membership/account query; current dispatcher Access and rate guards; binding WeakMap | Runtime owner A/B and binding tests; dispatcher 401/403/429; real PG membership/status revocation and audit denial | Pass; cache cannot bypass authorization or disclose identity |
| Query budget and accurate unavailable state | Unchanged aggregate, repeatable read, 1,500 ms statement timeout, 5,001-row bounded samples | Existing PG retained/exclusion/deletion/cap cases and EXPLAIN diagnostics; policy zero/empty/malformed cases | Pass; capacity excess is unavailable, not a partial zero |
| UTC boundaries and comparisons | Existing `overviewScope` and snapshot mapping | Offset/midnight/month/year/leap/unequal-elapsed policy tests; browser Today/MTD/YTD switch | Pass; no calendar-policy change |
| Real retained records and subscriber plans | Existing aggregate population/tier SQL and Dashboard | Full admin PG suite including Overview and account/list routes; existing Dashboard tests | Pass; no duplicate metric/route or paid-subscriber claim |
| Responsive/a11y and truthful freshness | Unchanged Dashboard | Chromium 390×900 light and 1440×900 dark, 200% root text, reduced motion, keyboard definition details, period switch, 66-second browser expiry, query cancellation | Pass for tested Chromium cases; synthetic labels visible on screenshots; native/screen-reader/WebKit unexecuted |
| Contract parity/privacy | Unchanged overview-v1 and error allowlist | 44 contract tests; local PG-handler/browser response contains no author IDs or private fixture body; safe dispatcher logs | Pass; no canonical/generated change required |
| Unresolved metrics/providers | Existing `OVERVIEW_GAPS`, provider null adapters | Existing policy/Dashboard tests; source inventory and decision table above | Preserved explicit unavailable states; owner/provider acceptance remains open |

## Checks and cost evidence

Tools: Node `24.19.0`, npm `11.9.0`, PostgreSQL `17.11` (server version `170011`), TypeScript `5.5.4`, Vitest `4.1.11`, Vite `7.3.6`, Playwright `1.62.0`. Native config freshness and admin dry-run used repository-pinned Wrangler `4.123.0`. Both root and control-panel dependencies were installed from committed locks in the isolated worktree; no lock changed. Earlier preinstalled dependencies were not used for the final receipts.

| Check | Command/scope | Result |
| --- | --- | --- |
| Overview policy/runtime/dispatcher | `node --experimental-strip-types --experimental-test-module-mocks --test apps/lythaus-admin-api/tests/overview-{policy,runtime,handler}.test.mjs` | 21 passed, zero skipped |
| Admin API suite | Same Node flags, `--test apps/lythaus-admin-api/tests/*.test.mjs` | 110 passed, zero skipped |
| Critical coverage | `npm run test:critical-coverage` | All 44 modules / 13 categories pass unchanged 80% line/branch gates |
| Overview measured coverage | Existing policy/runtime entry, plus a temporary reporter for denominators | Policy 68/68 lines, 32/32 branches; runtime 151/151 lines, 68/68 branches; total 219/219 lines, 100/100 branches. Node's measured denominator includes source/type/declaration lines; this is scoped coverage, not whole-app coverage |
| Local canonical database | `npm run validate:planetscale-postgres17` on a disposable loopback container | Approved 0000–0020 migrations/checks/grants pass; 103 application relations; fixture tests run on a local `lythaus_auth_test` database. The test guard correctly rejected the initial `/postgres` test target; no guard was bypassed |
| Real Overview PG | Node flags plus `--test --test-concurrency=1 apps/lythaus-admin-api/tests/overview.postgres.mjs` | 7 passed, zero skipped, restricted `lythaus_admin` role |
| All admin PG | Same flags, `apps/lythaus-admin-api/tests/*.postgres.mjs` | 13 passed, zero skipped |
| Control panel | `npm test`, `npm run build` in `apps/control-panel` | 83 tests / 12 files pass; production build passes. Existing React act warnings occur in unrelated tests |
| Contract/source | `npm run typecheck:native`, `npm run openapi:test:contract` | Typecheck passes; 44 contract tests pass, 17 existing opt-in live tests skipped |
| Native architecture | `npm run test:native-architecture` | 286 passed, zero skipped, including existing workerd moderation seam |
| Config/registry/package | `npm run validate:native-workers`, `npm run validate:lythaus-resource-registry`; pinned `wrangler deploy --dry-run --env ''` for admin | 4 configs/3 generated Worker type files and 33 registered resources pass; dry-run bundle passes. Initial cache/config-directory errors were resolved using workspace cache paths; no provider deploy occurred |
| Browser | Temporary domain-specific Playwright script outside repository | 11 real Overview responses: 10 HTTP 200 with 10 committed view audits, one HTTP 503 after actual PG cancellation. Zero page/unexplained console errors; intentionally unavailable operational routes yield expected 503 console messages. Five aggregate scans; no horizontal overflow at tested widths/200% text |

Local restricted-role EXPLAIN `(ANALYZE, BUFFERS, FORMAT JSON)` on synthetic fixtures measured 0.450 ms / 23 shared-hit blocks / zero shared-read blocks for the small population, with six keyed/sample Limit nodes returning `[9, 11, 7, 1, 1, 0]` rows. With 5,001 additional rows in **each** source, it measured 12.276 ms / 225 shared-hit blocks / zero shared-read blocks. A subsequent full-admin run measured 11.647 ms / 226 shared-hit blocks for the cap fixture. These are warm local measurements, not production p95, service capacity, or bill estimates. No query or data collection was added; cache validation adds only timestamp arithmetic and can cause a fresh aggregate when the two clocks disagree.

Browser data came from synthetic UUIDv7 records in the canonical disposable PG17 schema, with a real restricted-role transaction adapter and actual Worker dispatcher. Access verification used a local synthetic signed assertion and JWKS; it does not prove live Cloudflare Access. Other operational routes were explicitly unavailable. Google Fonts responses were isolated for deterministic local fallback-font rendering; production typography remains unverified. Screenshots and the reproducible temporary harness/receipts/logs are delivered in `lythaus-lane-c-overview-evidence-2026-10-07.zip`; their confirmed Library identity is recorded in the PR handoff.

WebKit was attempted but its host dependency check cannot find `libGLESv2.so.2`. A workspace-cached copy resolves locally via `ldd`, but the standard browser check still rejects the launch. No dependency-check bypass or system installation was performed. WebKit, actual screen readers, native iOS/Android, live owner workflows, production clock behavior, production provider metrics, and payment/provider/inbox acceptance remain not run. The admin dispatcher browser exercise runs in Node; the native architecture suite includes an existing workerd seam, and the admin Worker is bundled for workerd, but authenticated Overview in workerd was not run separately.

## Independent review and completion gates

| State | This candidate |
| --- | --- |
| Implemented | One known-contract freshness defect fixed; retained metrics preserved |
| Tested | Local checks above pass with explicitly named skips/not-run cases; exact source/test SHA recorded |
| Merged | No; draft review candidate only |
| Deployed | No; Release102 at `f757d35a3263f86f817ea09fd76368bd1f6a8e01` remains the coordinator-supplied deployed baseline |
| Activated | No provider/new-family/privacy/security activation or existing-feature flag change |
| Owner accepted | No; live acceptance belongs to Kyle/coordinator |

Parent: assign independent read-only review at the draft's exact final SHA before any serialized integration/merge decision. This lane does not self-review as the independent reviewer, mark ready, merge, close issues, deploy, run release workflows, or change release/queue/provider/credentials/DDL. CI checks belong to the published exact head and must be reviewed separately from local receipts.

Review focus: both clocks and equality at TTL, safe recompute/cancellation, per-read owner authorization/rate/audit, unchanged bounded query and contract, fixture provenance, and truthful A01–A03 unavailable states. Remaining owner gates are A01/A02/A03 as specified above; no new source work is needed to make this freshness fix reviewable. Reassign the implementation lane after the candidate handoff. Later metrics need a bounded approved family contract before coding, not an assumed active/quiet/retention definition or new tracking.

Coordinator handoff: use the exact integrated candidate and normal required checks after independent review. There is no migration, binding, or provider activation prerequisite for this fix. Standard exact-version release/rollback remains coordinator-owned; this task performs neither. Release102 remains deployed, owner-uncertified/NO-GO pending its separate owner UAT, as supplied by the parent. October's monthly 13,500 model and all support/search/passkey/private-alpha distinctions are untouched; no global Rewards-OFF claim is made.
