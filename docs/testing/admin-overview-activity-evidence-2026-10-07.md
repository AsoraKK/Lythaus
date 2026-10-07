# Contributor-backed activity evidence — 7 October 2026

## Review scope and proved gap

The existing Overview exposes a distinct contributor count but does not explain the owner-accepted relationship between contributors and reader-inclusive activity. Before this change, a Dashboard test for a known-active minimum failed because the card was absent. This slice adds that explanation and a source-backed minimum to the invoked Overview page. Complete active members, contributor share of active members, and quiet members remain explicitly unavailable.

The accepted decision is that contributors are active and readers can be active without contributing. Detailed DAU/WAU/rolling-30-day MAU definitions, eligibility, inactivity/returning windows and telemetry policy remain owner decisions. This change uses only the shipped Today, month-to-date and year-to-date UTC operational windows. It does not label them DAU, WAU or MAU.

Initial implementation base: `8b4058108da3ef519b801ae4dae60ed2e1f39909` (merged Overview freshness fix, PR #945). Review base refreshed to `a31f73d8534cd0fd52962873086cf0a666cc41fe` (merged admin admission, PR #946). The draft PR records its exact candidate head and hosted check provenance. No merge or deployment is authorized by this candidate handoff.

Owned files are `apps/control-panel/src/pages/overview-activity.js`, its test, `Dashboard.jsx`, `Dashboard.test.jsx`, and this document. No dispatcher, admin client, shared API schema, generated client, app shell/router, profile/DSR schema, support domain, CI or package lock changes are needed.

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
| No private content or cross-account identity disclosure | Aggregate-only response and model | PG aggregate/privacy assertions, owner downgrade tests, browser assertions that fixture identities/private bodies are absent from responses/logs; model leaves input unchanged and omits private fields |

## Verification and evidence

Local full control-panel suite: **116 tests in 13 files pass**; production Vite build passes. Focused model/Dashboard suite: **50 tests pass**. Model coverage runs the same 31 checked-in cases inside the existing Vitest worker using Node inspector precise coverage and locked `v8-to-istanbul`; no dependency/lock change. Source-mapped results: **35/35 lines, 2/2 functions, 37/38 V8 branches (97.36%)**. The sole uncovered mapped branch is the generated export getter's catch guard mapped to source line 1; both named source functions have every measured range executed. V8 block coverage is not a decision/MC/DC completeness guarantee.

Disposable local PostgreSQL **17.11** validation applies only the existing approved canonical migration manifest and verifies restricted roles, permissions and negative DDL checks. Existing Overview PG suite: **7/7 pass**. Small-fixture EXPLAIN: **0.493 ms**, 34 shared-hit blocks, zero shared-read blocks. The overflow fixture with 5,001 additional rows per source: **12.66 ms**, 225 shared-hit blocks, zero shared-read blocks. These are local synthetic measurements, not production latency/capacity estimates. The new UI adds zero SQL and zero requests.

Browser capture initially on base `8b405810`: **13 Overview responses, 11 committed successful-view audits, 6 aggregate scans**; Chromium passes both widths/themes and text scaling. Other operational services explicitly respond unavailable in the local harness. WebKit's normal launch is blocked by the selected host's missing `libGLESv2.so.2`; no host-dependency validation bypass is used. The real-dispatcher run is repeated on refreshed base `a31f73d8` and included with the draft evidence.

Evidence directory: `/workspace/lythaus-lane-c-activity-evidence` contains labelled positive, zero, stale and large-text screenshots, sanitized `overview-snapshot.json`, and `browser-receipt.json`. Companion logs/harness and coverage receipts in `/workspace/lythaus-lane-c-evidence/activity-*` are packaged separately from the immutable PR #945 evidence. The draft PR provides the archive hash and Library identifier.

## Owner, activation and provider gates

The approved contributor/reader distinction is implemented using existing retained evidence. Active/quiet completion still requires a verified reader-inclusive source and explicit agreement on eligible population, windows, foreground versus background evidence, deduplication, privacy/consent, retention/deletion and cutover coverage. Do not silently adopt the previously proposed admin-role exclusion: this slice includes genuine admin contributors.

A future minimal first-party proposal could record one approved foreground-use fact per canonical account and agreed time bucket with server time, without content, email, location or durable device identity. Its consent/legal basis, event semantics, deletion linkage, retention, rate bounds and rollout coverage require separate owner/privacy review. Session refreshes and background polling would not demonstrate deliberate use merely by occurring. This is a proposal only: no event schema, DDL, collector, analytics SDK activation or consent expansion is added here. Existing optional/disabled-feature distinctions and the monthly 13,500 model are unchanged.

No production data scan, production write/DDL, provider resource, upgrade, new credentials, invoice estimate, release or deployment occurs. Release `102f757` remains the supplied deployed baseline. Independent review and a separately assigned serialized merge slot are required before this new candidate can merge; complete active/quiet and provider metrics remain named external/owner gates.
