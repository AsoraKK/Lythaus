# Contributor-backed activity evidence — 7 October 2026

## Review scope and proved gap

The existing Overview exposes a distinct contributor count but does not explain the owner-accepted relationship between contributors and reader-inclusive activity. Before this change, a Dashboard test for a known-active minimum failed because the card was absent. This slice adds that explanation and a source-backed minimum to the invoked Overview page. Complete active members, contributor share of active members, and quiet members remain explicitly unavailable.

The accepted decision is that contributors are active and readers can be active without contributing. Detailed DAU/WAU/rolling-30-day MAU definitions, eligibility, inactivity/returning windows and telemetry policy remain owner decisions. This change uses only the shipped Today, month-to-date and year-to-date UTC operational windows. It does not label them DAU, WAU or MAU.

Initial implementation base: `8b4058108da3ef519b801ae4dae60ed2e1f39909` (merged Overview freshness fix, PR #945). Review base refreshed to `a31f73d8534cd0fd52962873086cf0a666cc41fe` (merged admin admission, PR #946). The draft PR records its exact candidate head and hosted check provenance. No merge or deployment is authorized by this candidate handoff.

Owned metric files are `apps/control-panel/src/pages/overview-activity.js`, its test, `Dashboard.jsx`, `Dashboard.test.jsx`, and this document. The parent subsequently assigned Lane C the narrow-screen navigation rule in `apps/control-panel/src/styles.css` and its focused browser evidence. The bounded follow-up also owns the Overview-local wrapping rule in `pages/overview.css` and `apps/control-panel/tests/navigation-focus.browser.mjs`. No dispatcher, admin client, shared API schema, generated client, app shell/router, profile/DSR schema, support domain, CI or package lock changes are needed.

## Existing sources and measure contract

The retained Overview source is `GET /api/admin/overview?period=today|mtd|ytd`, dispatched by the real admin Worker. Its `overview-v1` response already provides posts, comments, comments per new post, unanswered posts, distinct contributors, retained new registrations and current Free/Premium/Black entitlements. Account-status and waitlist counts remain in the existing operational source. None is rebuilt. Provider usage/cost/storage and activity/retention gaps remain unavailable unless their respective existing authorized sources are verified.

The new pure presentation model consumes `metrics.uniqueContributors` only. It never sums post/comment events, derives activity from account status, uses registration counts as a denominator, or borrows a previous-period value. A valid current count C establishes **at least C known active members**, because every counted contributor supplies activity evidence in that same window. It cannot establish the complete active total or contributor percentage. A zero contributor count produces “At least 0” with an explicit reader-coverage explanation; active/quiet totals do not become zero.

| Property | Contract and limit |
| --- | --- |
| Grain and deduplication | One canonical author UUID counted once across the SQL `UNION` of eligible post and comment authors. This is retained contribution evidence, not sessions, requests, a complete event ledger or all contribution attempts. |
| Windows/timezone | Existing half-open `[start, sampledAt)` UTC Today/MTD/YTD windows. A comment can contribute in a window even if its eligible parent post was created earlier. No new rolling windows or local-time policy. |
| Inclusion | Existing public-visibility, allowed, nondeleted post population and allowed, nondeleted comments on that population; retained nondeleted accounts across nondeleted statuses. Genuine contributors with admin roles remain included. |
| Exclusion | Existing deleted accounts/content, blocked or nonpublic posts, ineligible parent posts, nonallowed comments and explicitly marked `is_production_acceptance` fixtures. No new role/eligibility filter. The existing stored current state can revise historical counts; private/deleted contributions and unmeasured readers may make complete activity larger. |
| Capacity | Existing scans cap each source at 5,000 plus one overflow sentinel before filtering. Overflow produces unavailable content totals. The union can contain up to 10,000 distinct authors across two 5,000-row sources; the model permits that bound and rejects larger/negative/fractional/noninteger counts. |
| Freshness | Existing Worker/database cache limit of 60 seconds and existing UI 65-second display allowance, five-second future skew allowance, and UTC calendar-boundary invalidation are preserved. The model requires the page's fresh flag, matching selected period, `overview-v1`, UTC, retained-current-state coverage, expected TTL/cap, valid ordered timestamps and window end equal to `sampledAt`. No polling or refreshed timestamp is introduced. |
| Availability | Missing, capped, malformed, incompatible, expired, loading, failed or denied samples withhold the minimum. An available count must have unit `count`, null reason and a nonnegative safe integer. Complete active/share/quiet figures remain unavailable even with positive contribution evidence. |
| Visibility/privacy | Existing current owner authorization and fresh owner recheck/audit remain the access boundary. The UI model emits counts/reasons only and does not emit identity or content fields. No new personal-content logs, collector, identity link, consent change, provider binding or data retention path. |

## Requirements → code → validation

| Requirement | Code/source | Evidence |
| --- | --- | --- |
| Every counted contributor is included in the same-window activity minimum; readers may add activity | `overview-activity.js`; existing restricted-role distinct-author SQL | 31 model cases; actual Worker + local PostgreSQL fixture deduplicates repeated author activity and retains a genuine administrator contributor |
| Never report incomplete reader-inclusive totals, a false 100% ratio, or contribution silence as quiet membership | Model's unavailable outputs and Dashboard card | Positive and zero model/UI fixtures; real zero retained-contribution response still displays active/share/quiet as unavailable |
| Preserve UTC period selection, sample boundaries, zero/unavailable and capacity distinction | Model guards and existing Dashboard freshness | UI tests cover selected periods, UTC rollover, expiry without polling, late response, incompatible contract, source cap and owner/authorization denial; local PG tests cover timestamp boundary, filtering and overflow |
| Real invoked route and existing owner/restricted-role protection | Existing Worker dispatcher/runtime; no changes | Browser uses local synthetic RSA Access JWT/JWKS and real `worker.fetch` for GET Overview/health; admin transaction adapter uses `SET ROLE lythaus_admin`. Revoked owner returns 403 and removes the minimum; query cancellation returns 503 without stale disclosure |
| No additional scan/request/denominator | Pure derivation during Dashboard render | Dashboard test still expects seven existing requests; SQL/route unchanged. Existing PG EXPLAIN validates bounded primary scans and keyed author lookups |
| Responsive and accessible retained evidence | Existing card/grid components; labelled synthetic fixtures | Chromium 390px light / 1440px dark, 200% text, reduced motion, keyboard definition expansion, no horizontal overflow, no page errors or unexplained console errors |
| Ordinary-viewport keyboard controls stay visible below stacked navigation | Existing 900px media query makes navigation static; desktop retains sticky navigation | Real-route browser regression checks eight navigation links, Reporting period, Refresh and definition controls with Tab/Shift+Tab, viewport geometry and five hit-test points per focused control |
| Small-screen large text stays within the Overview viewport | Overview-local `overflow-wrap: anywhere` | Frozen-main 320px/200% overflow reproduced; follow-up checks 320–1440px at 100%/200%, every activity-card text rectangle, scrolling and Flags/Overview round trip |
| No private content or cross-account identity disclosure | Aggregate-only response and model | PG aggregate/privacy assertions, owner downgrade tests, browser assertions that fixture identities/private bodies are absent from responses/logs; model leaves input unchanged and omits private fields |

## Verification and evidence

Local full control-panel suite: **116 tests in 13 files pass**; production Vite build passes. Focused model/Dashboard suite: **50 tests pass**. Native Overview policy/runtime/handler tests on the refreshed base: **21/21 pass**, including rate denial and cross-owner isolation. Model coverage runs the same 31 checked-in cases inside the existing Vitest worker using Node inspector precise coverage and locked `v8-to-istanbul`; no dependency/lock change. Source-mapped results: **35/35 lines, 2/2 functions, 37/38 V8 branches (97.36%)**. The sole uncovered mapped branch is the generated export getter's catch guard mapped to source line 1; both named source functions have every measured range executed. V8 block coverage is not a decision/MC/DC completeness guarantee.

Disposable local PostgreSQL **17.11** validation applies only the existing approved canonical migration manifest and verifies restricted roles, permissions and negative DDL checks. Existing Overview PG suite: **7/7 pass**. Small-fixture EXPLAIN: **0.493 ms**, 34 shared-hit blocks, zero shared-read blocks. The overflow fixture with 5,001 additional rows per source: **12.66 ms**, 225 shared-hit blocks, zero shared-read blocks. These are local synthetic measurements, not production latency/capacity estimates. The new UI adds zero SQL and zero requests.

Initial browser capture on base `8b405810` and repeated on refreshed base `a31f73d8`: **13 Overview responses, 11 committed successful-view audits, 6 aggregate scans** in each run. These historical captures include taller activity-card screenshots and do not establish ordinary-viewport keyboard clearance. The absence of `vite-error-overlay` also does not establish absence of sticky-header occlusion. The separate navigation follow-up below supplies that evidence. Other operational services explicitly respond unavailable in the local harness. WebKit's normal launch is blocked by the selected host's missing `libGLESv2.so.2`; no host-dependency validation bypass is used.

Evidence directory: `/workspace/lythaus-lane-c-activity-evidence` contains labelled positive, zero, stale and large-text screenshots, sanitized `overview-snapshot.json`, and `browser-receipt.json`. Companion logs/harness and coverage receipts in `/workspace/lythaus-lane-c-evidence/activity-*` are packaged separately from the immutable PR #945 evidence. The draft PR provides the archive hash and Library identifier.

## Navigation follow-up: ordinary viewport and source-backed fixtures

Independent review reproduced a baseline defect at **390×900, 200% text**: the ninth Tab focused the Reporting period selector at y=422–478 while sticky navigation occupied y=0–584. The selector's center hit `NAV`, so focused content was fully obscured. Exact frozen main `a31f73d8534cd0fd52962873086cf0a666cc41fe` and original candidate `be999d7618bcf239540ce56d7911706c0375b429` have identical affected global CSS blob `1af455761d63055aee7ff6e7bf23c6ce7ecc4f60`; both reproduce the geometry. A red run of the checked-in regression fails at that selector. A second exact-main reproduction at 320px/200% shows the Overview main grid extending to x=352.734375, establishing that the narrow overflow also predates this slice.

The fix adds only `position: static` to the existing stacked-navigation rule at widths ≤900px, allowing browser focus scrolling to move the visible navigation out of the way. Above 900px its existing sticky behavior is preserved. One Overview-local wrapping rule removes the intrinsic text minimum responsible for the 320px overflow. Navigation and controls are never hidden, and no focus-offset workaround is injected into the product.

The browser regression uses an ordinary **900px-high viewport** throughout at widths **320, 390, 600, 768, 900, 901 and 1440px**, each at **100% and 200% text**. It uses light/dark themes, reduced motion, real authenticated Worker Overview/health routes, a disposable canonical PostgreSQL17 database and the restricted `lythaus_admin` adapter. A genuine administrator contributor is included; acceptance accounts/content are excluded by the real query. Every scenario requires the fresh real aggregate **At least 2** before continuing. Unsupported operational sources respond 503 explicitly; no production counts are mocked.

Each independent viewport receives its own synthetic, current owner membership and verified local RSA Access JWT. The production rate limiter remains enabled: the receipt records all real-route response statuses and nonzero database rate counters, and requires counts below 120. Counters are never reset during a scenario; only disposable fixtures are removed in final cleanup. This prevents a multi-viewport sweep from sharing one account's request quota.

| Follow-up check | Result and evidence |
| --- | --- |
| All fourteen ordinary viewport/text-size combinations | Pass; `navigation-focus-receipt.json` records source HEAD plus both CSS SHA-256 fingerprints |
| Tab/Shift+Tab, period selection, Refresh, definition expansion | Pass; each focused control fits the viewport outside the 24px synthetic watermark and owns five hit-test points |
| All four activity cards | Pass; every heading, value and explanation text rectangle is scroll-reachable outside the navigation/watermark; no horizontal overflow |
| Visible navigation and menu round trip | Pass; all eight links remain present and keyboard reachable; Flags opens its real page and Overview returns to the fresh retained aggregate |
| Existing navigation behavior above 900px | Pass; 901px/1440px navigation remains sticky during scrolling at both text sizes |
| Runtime/privacy | No page errors or unexplained console errors; aggregate responses/logs exclude private fixture bodies and identities |
| Full control-panel suite/build | 116 tests in 13 files pass; production build passes with both CSS changes |
| WebKit | Blocked by host dependency `libGLESv2.so.2`; no launch validation bypass or dependency installation |

Run after the existing canonical local PostgreSQL17 validation with the locked repository dependencies and a running local control-panel Vite server:

```sh
PLANETSCALE_PG17_TEST_DATABASE_URL=<disposable-local-lythaus_auth_test-database> \
PLAYWRIGHT_BROWSERS_PATH=<existing-browser-cache> \
CONTROL_PANEL_NAVIGATION_BASE_URL=http://127.0.0.1:5177/ \
CONTROL_PANEL_NAVIGATION_EVIDENCE_DIR=<evidence-directory> \
node --experimental-strip-types --experimental-test-module-mocks \
  apps/control-panel/tests/navigation-focus.browser.mjs
```

The Browser plugin is unavailable in this environment; this uses existing locked Playwright without adding dependencies or changing CI. The new follow-up archive is separate from immutable original PR #948 evidence. Its exact head, patch/archive hashes, Library file and hosted required-check provenance are recorded in the draft PR. Independent review must use the final head; checks on the earlier candidate do not clear the follow-up. All merges remain held while parent-reported release 103 is pending at frozen main.

## Owner, activation and provider gates

The approved contributor/reader distinction is implemented using existing retained evidence. Active/quiet completion still requires a verified reader-inclusive source and explicit agreement on eligible population, windows, foreground versus background evidence, deduplication, privacy/consent, retention/deletion and cutover coverage. Do not silently adopt the previously proposed admin-role exclusion: this slice includes genuine admin contributors.

A future minimal first-party proposal could record one approved foreground-use fact per canonical account and agreed time bucket with server time, without content, email, location or durable device identity. Its consent/legal basis, event semantics, deletion linkage, retention, rate bounds and rollout coverage require separate owner/privacy review. Session refreshes and background polling would not demonstrate deliberate use merely by occurring. This is a proposal only: no event schema, DDL, collector, analytics SDK activation or consent expansion is added here. Existing optional/disabled-feature distinctions and the monthly 13,500 model are unchanged.

The nonbinding minimal reader proposal is one observed visible authenticated app-screen render, including an empty feed, deduplicated by the server's canonical account and UTC day across devices/retries. App resume, background refresh/prefetch, heartbeat, push delivery and general authenticated requests do not qualify by themselves. Queued evidence must be discarded on logout/account switch. It measures observed foreground use, not reading attention or complete reader coverage. Genuine members with admin roles qualify through the same signal; retained contributors remain accepted activity evidence.

Purpose/scope, signal and storage are separate owner choices. Keep collection off unless separately approved; a consented-pilot design would need explicit account-linked measurement notice and default opt-out. Canonical account/day facts are personal data, and existing anonymous analytics consent does not authorize them. Private 31-day account/day retention could support distinct reader counts only inside that retained coverage, subject to privacy/DSR approval and verified delivery/cutover. Daily totals with next-day erasure of temporary deduplication cannot deduplicate accounts across days. Consent-off, offline/missing delivery, unsupported versions, deletion, expiry and pre-cutover history remain unknown, never quiet or zero; a consented subset cannot establish all-member totals.

**31 UTC days cannot support two adjacent 30-day quiet windows.** Quiet therefore remains unavailable under the 31-day proposal. If the owner later approves that particular quiet definition, a separate minimal retention choice is at most **61 UTC day buckets: 60 sealed days plus the live current day**. That is an unapproved extension requiring a specific purpose/notice, privacy/DSR/withdrawal review and complete coverage across both windows; a consented pilot still cannot establish all-member quiet status. Do not inherit audit-ledger retention or silently extend collection. Declining longer retention keeps quiet unavailable. No window definition, account-linked collection or retention change is implemented here.

No production data scan, production write/DDL, provider resource, upgrade, new credentials, invoice estimate, release or deployment occurs. Release `102f757` remains the supplied deployed baseline. Independent review and a separately assigned serialized merge slot are required before this new candidate can merge; complete active/quiet and provider metrics remain named external/owner gates.
