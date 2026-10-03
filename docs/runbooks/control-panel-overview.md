# Control panel Accounts and Overview

## Review and release boundary

Prepared 2026-10-02 from GitHub main `8c4261402dd370b4c57e082cf0fc16b41927f7db` (last-live reference supplied by the parent). This is source implementation for a draft PR. Deployed Pages/Worker SHA and production metric values were not independently verified: existing Cloudflare read requests returned HTTP 401. Parent review controls integration, activation and releases. No production SQL writes, DDL, account lookups or mutations, provider resources, credential changes, dependency/lockfile updates or public-homepage edits are part of this increment.

Resumed 2026-10-03: main is `6d1d52a4fa3f51ae041fbf38b5724578a8596b61`, including security #897/#898. PR #903's previous head `e64dbddb42c32e78fdd5e519f80d9cf333d654e7` had all 12 CI checks passing. Its four commits replayed onto current main without conflicts; upstream lockfiles, tooling handle validation, homepage protection and the new file-I/O CI check are preserved. [Canonical release run 37118382512](https://github.com/AsoraKK/Lythaus/actions/runs/37118382512) confirms successful release of this main SHA, including provider-evidence and production-surface verification jobs; it does not deploy PR #903. GitHub branch-protection reads return 403 for the existing integration, so exact required-check configuration must be confirmed by the integration owner.

Read root AGENTS.md, native architecture, registry, CI and existing support contracts first. No nested AGENTS.md/SKILL.md was found in the checkout. Registry resources remain authoritative. Live PlanetScale branch metadata currently lists only `main`; AGENTS.md's older development-branch observation is stale. No branch was created.

## Navigation and dependency findings

Before: Home, Flags, Appeals, Authenticity beta, Users, Account support, Waitlist, Audit, Preview, Auth acceptance (10 entries). After: Overview, Flags, Appeals, Authenticity beta, Accounts, Waitlist, Audit, Auth acceptance (8 entries).

| Route | Behavior |
| --- | --- |
| `/` | Overview |
| `/accounts` | PR #890 owner-only exact-email support, state and partial history |
| `/accounts/management` | Existing account administration, with existing server permissions and mutation confirmations |
| `/users` | Replace-history alias to administration; retains query and fragment |
| `/account-support` | Replace-history alias to support; retains query and fragment |
| `/preview` | Existing page-not-found screen; no simulation route |
| `/moderation` | Existing Flags alias retained |
| Other routes | Appeals, Authenticity beta, Waitlist, Audit and Auth acceptance retained |

Support is the default Accounts view; navigation grants no authorization. PR #890 (`1dac5e7`, already merged) is reused, including private exact-email POST, current active owner checks, audit-before-disclosure, minimal account projection and honest partial history. Account administration remains a separate subroute. The unfiltered existing user query includes registered unverified, suspended, locked and relink-required records; no active-only default or invented “inactive” status was added. Its last-login field can fall back to account creation, now labeled accordingly. Waitlist is separate.

Global import/export/call-site checks found App.jsx as the only AppPreview consumer and AppPreview as the only DeviceEmulator consumer; no tests imported either component. AppPreview explicitly defaulted liveMode to false and contained mock likes, reputation, posts, comments and rewards. Both files and their exclusive simulation styles were removed. Shared header styles, real research screens, existing support/management tests and all automated fixtures remain. Removed style-class names were checked against surviving consumers: generic names occurred only under simulation selectors; the surviving “dot” occurrence is reason-code help text. Legacy aliases, browser back/forward and retired Preview behavior have regression tests.

## Tracking chain and source coverage

The old Dashboard was source-wired, but that alone did not prove production behavior. It made six canonical reads: health, auth summary, email health, moderation cases, pending adjudications and audit. Case/audit/appeal counts were loaded-page counts, and missing arrays were coerced to empty arrays. They are now explicitly page-scoped and missing responses remain unavailable.

The additive seventh read is GET `/api/admin/overview?period=today|mtd|ytd`, contract `overview-v1`. It uses existing `DB_ADMIN_FRESH` privileges and authoritative retained DB records:

| Metric | Producer and source | Definition / limits |
| --- | --- | --- |
| Posts | Public Worker post-create transaction → `content.posts`; Jobs/admin moderation writes eligibility state | Created in window, currently public + allowed, nondeleted, author nondeleted and not production acceptance |
| Comments | Public Worker comment-create transaction → `content.comments`; moderation changes state | Created in window on eligible public posts, including earlier posts; same author/content exclusions |
| Comments per new post | Same two tables | Comments created in window on posts created in that same window / those posts; empty cohort = null |
| Unanswered posts | Same two tables | Eligible posts created in window with no eligible comment from another account before that window end; self-comments do not answer |
| Unique contributors | Distinct post/comment author IDs, used only inside SQL | Union of eligible authors creating posts/comments in window; requests, sign-ins and all app users are different populations |
| New registrations | Public registration creates `identity.users` with account event; admin invitation also precreates identity | Retained identity creation in window, all nondeleted statuses, no acceptance accounts; includes pending/invited/relink records, not completed/verified signups |
| Free / Premium / Black | `identity.user_entitlements` joined by user ID | Current entitlements across retained nondeleted registered accounts; missing entitlement defaults free by existing runtime contract; no historical tier or payment inference |

Concrete producers inspected: public index.ts registration `INSERT identity.users` / `email_registration_started`, post-create `INSERT content.posts`, comment-create `INSERT content.comments`; auth-recovery verification and admin/private invitation service; jobs/admin moderation eligibility updates. This path reads synchronous records directly: no invented analytics emitter, new ingestion pipeline or third-party usage count is substituted. Live connector schema inspection confirmed the relevant table/column shapes, not their current row populations or deployed producers.

Content totals describe retained public-visibility/allowed records, including nonactive authors. They are not the full feed delivery/publication population: the native feed additionally checks active author status, authorship/public-label and audience rules. Those policies remain unchanged. This bounded storage metric deliberately does not infer impressions, requests, completed moderation or confirmed AI labels from a post row.

Verification timestamps and `email_verified` events can reflect repeat verification; complete first-ever coverage has not been certified. Login/activity histories are partial and retention-bound. Returning users, retention, quiet users and new verified users stay unavailable. A future event contract must define first-ever verification, qualified activity, cohort entry, observation windows, inactivity thresholds, deletion treatment and coverage start before these metrics become enabled.

Entitlements can change administratively. No certified payment transition/refund/currency/recognition ledger was found for paid upgrades, cancellations or revenue. Member reason-coded flags, automated authenticity evidence, confirmed classifications and appeal outcomes must remain separate. AI-suspicion taxonomy and confirmed-label/outcome metrics need Astra lane policy reconciliation; pending adjudication entries are not appeal outcomes.

### Calendar, population and availability rules

- UTC calendar Today/MTD/YTD, half-open `[start, database sample time)`. Previous starts at the preceding calendar day/month/year, with the same elapsed duration. If the prior month/year is shorter, comparison is unavailable; no mismatched full prior period is used.
- Historical windows apply current retained deletion/visibility/account state. Values can revise after deletion or moderation: `coverage=retained_current_state`, not an immutable activity ledger.
- Nonactive registered statuses remain eligible unless deleted; production-acceptance accounts are excluded. Guest sessions and waitlist rows do not enter registered-identity counts.
- Only posts/comments count as contributor activity here. A self-comment contributes to the ratio/contributor population but does not answer its own post.
- Count fields must be safe nonnegative integers. Missing, malformed, failed or capacity-exceeded values are null/unavailable. A measured empty count is 0; an empty post cohort has no ratio. Percent change has no value when the prior denominator is 0 or missing.
- Current entitlements have no prior-period comparison. Currency and accrued/finalized costs remain null until verified.

### Query cost, authorization and freshness

The source tables have primary-key indexes but lack a globally leading created-at index needed for cheap unconstrained historical scans. This increment uses three materialized, primary-key ordered scans of at most 5,001 rows each, plus bounded keyed author/entitlement lookups. Only aggregate numbers leave the query; bodies, email, credential data and author IDs are absent from the response and metric logs. If either content population exceeds 5,000, dependent content totals are unavailable; account cap independently gates registration and tiers. Cap checks also prevent the corresponding eligibility/cohort work from running: resumption testing exposed excessive work on already-unavailable capped populations, which is now skipped without raising the 1,500 ms timeout. It never presents a subset as a total.

Statement timeout is 1,500 ms. A repeatable-read transaction checks current active owner membership joined to an active, nondeleted identity before every response, including cache hits. Every response requires a committed minimal audit event; query/audit failures return a safe 503 with no stale fallback or raw DB error. Existing verified Access, administrator membership, rate limit and CORS protections remain. Unsupported/cross-user filters and duplicate period parameters are rejected.

Only the aggregate snapshot is cached per binding and period for up to 60 seconds. Authorization is never cached. Calendar rollover and backward clocks invalidate cache reuse; successful commit is required before cache population, including an explicit failed-commit regression test. HTTP responses are private/no-store. The UI expires source values at the earlier of sample TTL or the UTC reporting boundary, resets on refresh/period changes, ignores late responses and withholds incompatible/future/stale samples. Operational freshness starts when the parallel request batch starts, so a delayed source cannot renew earlier values; backward clock changes fail closed. No provider polling or timer-driven API requests were added.

Legacy operations remain separate: auth summary reports current account states/verification and waiting-list totals; it is not active-user analytics and may include acceptance accounts. Email health counts outbox rows created in the last 24 hours grouped by their current accepted/delivered/failure state, not events occurring in that window. Queue figures are bounded loaded pages (cases 200, audit 100; pending-adjudication endpoint's own page). Operational freshness reflects fetch time and expires after 60 seconds; the database clock is labeled as a clock, not an ingestion watermark.

## Provider capability audit (read-only, 2026-10-02)

Only registry Lythaus account/resources were addressed. No Nite Owl resources were queried. Existing credentials were kept backend-only and never emitted to browser code or reports.

| Provider / read | Observed evidence | Remaining gate |
| --- | --- | --- |
| Cloudflare Workers GraphQL | Exact public/admin/jobs registry script filters, one row each, last 15 minutes; all HTTP 401 authentication error | Resolve existing credential authentication, certify Account Analytics Read and an approved backend runtime binding |
| Cloudflare Pages metadata | Exact existing control-panel project read; HTTP 401 / code 10000 | Existing read credential authentication; deployed SHA still unverified |
| PlanetScale database/branches/schema | `lythaus/lythaus-core` ready Postgres; registry account matches; only main branch; 102 table metadata | Metadata and connector access do not prove Worker telemetry permissions or migration reconciliation |
| PlanetScale query Insights | Existing connector read succeeded with bounded 15-minute / one-row request; count and p50/p99 fields exposed | Verify latency units, sampling/coverage and approved backend telemetry authentication; normalized SQL is excluded from artifacts |
| PlanetScale invoice and exact database line item | Reads succeeded; exact target flagged `cloudflare_billed=true`; organization invoice totals are not a reliable Lythaus spend value | Certify currency, period, finalized/paid state, attribution and Cloudflare invoice reconciliation before using amounts |
| Storage / connections / queue depth / jobs / end-to-end latency | No successfully authorized runtime samples | Verify appropriate existing provider metrics and instrumentation; DB readiness is not storage/query/queue health |

[Cloudflare Workers metrics documentation](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/) documents requests, errors and CPU quantiles. CPU time is not end-to-end latency. [GraphQL token documentation](https://developers.cloudflare.com/analytics/graphql-api/getting-started/authentication/api-token-auth/) specifies Account Analytics Read; the 401 responses did not certify this permission. [Billing permissions](https://developers.cloudflare.com/billing/understand/billing-permissions/) and [usage API](https://developers.cloudflare.com/api/resources/billing/subresources/usage/) do not guarantee this credential can read billing or that shared account totals can be attributed to Lythaus.

[PlanetScale Postgres monitoring](https://planetscale.com/docs/postgres/monitoring/prometheus-metrics-postgres) describes separate metrics authentication. [Billing API permissions](https://planetscale.com/changelog/billing-api-endpoints) document invoice access; the connected read capabilities are not new runtime credentials. This task deliberately did not call the connector's read-query tool because it creates new ephemeral credentials, contrary to the task's no-new-credential boundary. No production counts or account rows were retrieved.

Both UI provider adapters remain explicitly disabled/unavailable with null telemetry/cost/currency/period. No fake chart or zero-spend fallback was added. A future enabled adapter must validate approved backend credentials, target only registry identifiers, cache bounded provider queries, normalize units/freshness, preserve request-vs-user distinctions and deduplicate Cloudflare-billed PlanetScale lines. Accrued estimates and finalized invoices require separate amounts, currency, accounting period, resource attribution and sample timestamps. Shared account totals cannot be summed into resource totals.

## Review gates and neighboring work

### Local validation evidence

All checks used this original cloud workspace and synthetic/disposable data. Production account state was not read or changed.

| Check | Result |
| --- | --- |
| Control-panel Vitest + production build | 55 tests / 9 files pass; Vite bundle builds |
| Native Overview policy/runtime | 11 tests pass; both files 100% line and branch coverage under the existing 80% gate |
| Real Worker dispatcher (Overview + existing support) | 16 tests pass, including verified Access/member/current-owner denials, CORS and safe failures |
| Full critical coverage gate | 42 production modules / 13 required categories pass; thresholds unchanged |
| Disposable PostgreSQL 17 | Exact approved migrations 0000–0020 and role grants validate; all 47 public/admin integration tests pass, including 5 new Overview tests |
| Query plans and capacity | Restricted-role EXPLAIN ANALYZE verifies bounded LIMIT scans; 5,001-row content/account fixtures produce unavailable totals within the 1,500 ms query limit |
| OpenAPI | Lint/bundle and 42 contract tests pass; 17 pre-existing opt-in live tests remain skipped; actual local handler response validates against the new schema |
| Generated Dart client | Pinned generator 7.7.0; Dart 3.11.0 build_runner/analyze and 1,069 generated tests pass; 57 nonfatal generated-code analyzer notices |
| Native source/config | Typecheck, Worker dry-run bundle (no deploy), generated Worker config validation and 33-resource registry validation pass |
| Browser | 15 layout checks, actual light/dark token themes, 390/768/1440px, doubled text, keyboard details/navigation, legacy query/fragment aliases, back history and Preview 404; 0 page errors |

Browser Overview responses traversed the actual restricted-role handler and database with synthetic records; Access and the six legacy operation responses were simulated. This is local reconciliation, not a production-live claim. A discovered doubled-text Accounts overflow was fixed with scoped wrapping/min-width rules. Temporary evidence in this workspace: `/tmp/lythaus-control-panel-browser-evidence.json`, `/tmp/lythaus-overview-local-snapshot.json`, 12 `/tmp/lythaus-overview-{light,dark}-*.png` / `/tmp/lythaus-accounts-{light,dark}-*.png` screenshots and test logs. The browser plugin was unavailable; installed system Chromium with Playwright was used. Downloads of pinned generator/Dart SDK were checksum-verified; no lockfile changed.

Reproduce with `npm test` / `npm run build` in apps/control-panel, `npm run openapi:test:contract`, `npm run openapi:lint`, `npm run typecheck:native`, `npm run test:critical-coverage`, and the CI PostgreSQL command against a disposable local database. See `.github/workflows/native-planetscale-ci.yml` for baseline setup and role validation. Never point fixture integration tests at production.

No migration is needed for this bounded increment; exceeding the cap requires a separately reviewed rollup/index/event migration and production gate. Provider adapter activation remains blocked by authentication/runtime-binding/unit/billing-attribution gaps. Production reconciliation and exact deployed SHA checks remain parent release gates, not implied by local validation.

App-flow task `01a0fd57-01ef-7124-b7c7-bddfd59410dd` exclusively owns main/release integration until Friday transfers the slot; it also owns privacy-status/export and account controller/navigation corrections. PR #906 overlaps root OpenAPI, bundled JSON and CI; no changes from that unmerged branch are imported here. Astra task `01a0fd06-2b22-7597-9915-7304fb6bb0cb` owns monthly scoring/appeals/rewards UI and contracts: PR #896 overlaps admin dispatcher, OpenAPI/generated client and CI. Its policy, schema proposals, shared awards and member UI remain untouched. Friday should serialize shared OpenAPI authoring, then regenerate bundle/client from the reconciled sources rather than copy generated outputs between branches. Security #897/#898 remains incorporated without modification. Public homepage, Flutter feed/sidebar and backlog disposition remain outside this PR. Local synthetic tests supplement release QA; production account checks, activation, DDL and releases remain separate gates.

Private Support and Feedback staging is documented in [support-feedback-roadmap.md](support-feedback-roadmap.md); it is not activated in this PR.
