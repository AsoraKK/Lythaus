# Product Contract Reconciliation — August 2026

**Status:** Resolved in the current worktree / Partial release evidence — this is not production-readiness evidence.

**Assessment boundary:** `codex/product-integrity-2026-08-10` at worktree HEAD `54c90634b9322e7dfb51598650e6f1690ac30d44`, with uncommitted reconciliation changes and `origin/main` at `6c5eb0f0dd6fb361f0ee05d6a3d9069ecca20aa1`. PlanetScale state was verified read-only on 2026-08-10. No provider write or DDL was executed, and no deployment, secret, or human-governance gate was approved here.

## Read-only PlanetScale evidence

Only `main` and `development` exist.

| Branch | Provider role / PostgreSQL | Application tables | Migration evidence | Product-integrity evidence |
| --- | --- | ---: | --- | --- |
| `main` | Production and default; PostgreSQL 17.10 | 76 | Latest `system.schema_migrations.version` is `0008_legacy_relink_status.sql`. | `trust.user_activity_events`, `moderation.appeal_review_votes`, and `feed.notification_devices` are absent. |
| `development` | Development; PostgreSQL 18.4 | 75 | The migration-marker query returned no rows. | It is not the required disposable PostgreSQL 17 compatibility target. |

The local PostgreSQL 17 command failed closed because `PLANETSCALE_PG17_TEST_DATABASE_URL` was missing. The Docker Desktop engine and a local `psql`/PostgreSQL service were also unavailable, so no substitute PostgreSQL 17 migration-chain result exists.

## Status language

| Label | Meaning in this report |
| --- | --- |
| **Live** | Independently deployed and verified in the target environment. No new product-integrity capability is claimed Live. |
| **Partial** | Repository code or a contract exists, but its complete wiring, migration, deployment, or acceptance evidence is missing. |
| **Planned** | Required design or test work has not been evidenced in the active runtime. |
| **Deprecated** | Active documentation or client contract is superseded and must not guide new work. |

## Reconciled product contract

1. Cloudflare Workers are the backend and PlanetScale PostgreSQL is canonical. Initial authentication is email plus guest only.
2. Subscription is **Free**, **Premium**, or **Black**. It controls only entitlements: one, two, or three custom feeds respectively; only Black has full News Board access. It never changes reputation, moderation treatment, reviewer qualification, vote weight, or Editorial standing.
3. Reputation is a private, versioned Level `0`–`5` trust policy. Promotion requires score, multi-pillar gates, age, activity distribution, qualifying human contribution, conduct, and anti-gaming eligibility; it is not an XP or popularity counter.
4. Human-authored public text may be eligible for authorship reputation. AI-assisted public text is normalised to NFC and trimmed; it is allowed only at **249 or fewer** user-perceived Unicode characters, is labelled `AI-assisted`, and receives no authorship reputation. At **250 or more** it is blocked. AI-generated public content is blocked.
5. Appeal governance is independent: five trained reviewers, one ordinary vote each, at most one qualified Level 5 reviewer with weight two, at least 60% of weighted votes, and trained Editorial/journalist adjudication (one standard, two high-risk). Level 5 alone grants no review authority.
6. The Activity & Audit Ledger is private, append-oriented, server-authoritative, idempotent, and metadata-allowlisted. It records semantic outcomes, not clickstream telemetry.

## Findings

| Priority | Status | Finding and evidence | Required reconciliation |
| --- | --- | --- | --- |
| P0 policy contradiction | **Resolved in worktree** | The Alpha policy now blocks AI-generated public publication, caps AI-assisted text, and withholds authorship reputation. Shared policy and product copy agree. | Preserve this contract through exact-SHA CI and deployment evidence. |
| P0 governance contradiction | **Resolved in worktree** | The admin runbook now prohibits direct/timed/public appeal resolution and requires five trained reviewers plus trained adjudication. | Prove staffing, training, assignment, recusal, and high-risk adjudication operational readiness before launch. |
| P1 launch behaviour mismatch | **Resolved in worktree / Partial release evidence** | Canonical OpenAPI now blocks AI-generated publication, models current appeals/activity/reputation routes, passes contract tests, and has a regenerated Dart client. | Verify the committed exact SHA, generated-diff gate, authenticated Flutter integration, and deployed Worker routes. |
| P1 client contract mismatch | **Resolved in worktree / Partial release evidence** | Reachable retired Flutter appeal endpoints have been removed and focused current-route tests pass. | Prove only canonical generated/current clients are used in exact-SHA authenticated integration. |
| P1 missing live schema | **Planned** | Read-only evidence shows production/default `main` on PostgreSQL 17.10 with 76 application tables and latest migration `0008_legacy_relink_status.sql`; the activity-ledger, appeal-review-vote, and notification-device relations are absent. Repository migrations continue through `0012_product_integrity_v2.sql`. | Validate the complete `0009`–`0012` chain against an explicit disposable PostgreSQL 17 target, reconcile the baseline, and obtain explicit approval before any `main` write or DDL. |
| P1 coverage scope gap | **Partial system scope** | `npm run test:critical-coverage` passes at least 80% lines and branches for 20 production modules across 12 required domains, including nine invoked public/admin/jobs runtime seams. It does not prove complete route, SQL transaction, Hyperdrive, queue, migrated-database, deployment, or Flutter behaviour. | Keep the passing per-module gate and add migrated database and authenticated integration evidence without overstating extracted-seam coverage. |
| P1 audit completeness gap | **Resolved inventory / Partial live evidence** | A catalogue-keyed public-API mutation inventory, separate admin/jobs activity call-site invariants, private API, and completed Flutter UX exist. The uniqueness identity provides at-most-one persisted effect after migration, while concurrent retry/result retrieval and live delivery remain unproven. | Verify transactional/outbox behaviour, concurrent idempotency, retries, export, deletion, legal-hold handling, and access isolation on migrated infrastructure. |
| P1 DSR live-acceptance gate | **Partial** | The remediation now locates accountability signals and notification preferences/devices; deletion removes those records, private profile fields, retention rules, and prior export objects/manifests; it redacts appeal statements and marks retained governance rows pseudonymized. Passport v3 includes notification metadata/preferences and accountability signals, and decrypts the private accountability name only with `PII_ENCRYPTION_KEY_V1`. | Verify the migrated/live path, confirm the Jobs PII key without exposing it, exercise private no-store export access, and obtain no-cost approval before enabling disabled notification/media queues. |
| P2 entitlement/copy drift | **Resolved in worktree** | Approved copy now gives Free/Premium/Black one/two/three custom feeds, Black-only News Board, and explicitly separates subscription from reputation and governance. | Preserve central policy as enforcement source and verify exact-SHA UI copy. |
| P2 status overstatement | **Resolved wording / Partial release evidence** | Capability parity now says repository-complete while explicitly gating production on migration and provider configuration. | Keep every deployment/live claim behind exact-SHA migration, secret, provider, and human evidence. |
| P2 UX completion gap | **Resolved in worktree / Partial release evidence** | `ReputationLedgerScreen` now has category filters, cursor pagination, detail treatment, contextual policy links, retry/empty/error states, and accessibility without raw JSON. | Verify the private Activity API and Flutter UX together in authenticated exact-SHA acceptance. |
| P2 performance evidence gap | **Planned** | No current feed p95 measurement or release-load result was found for the `<200 ms` target. | Define a representative dataset and run repeatable feed/cache-isolation load tests before launch. |

## Current implementation map

| Contract area | Evidence | Status |
| --- | --- | --- |
| Content declaration boundary | `packages/contracts/src/content-policy.ts`; policy tests cover NFC/trimmed grapheme counting, 249 allowed, 250 blocked, and generated blocked. | **Resolved in worktree / Partial release evidence** |
| Tier entitlement policy | `packages/contracts/src/tier-policy.ts`; Free 1, Premium 2, Black 3 custom feeds; Black-only News Board. | **Resolved in worktree / Partial release evidence** |
| 429 anti-abuse controls | Implemented repository limits return `429` for 20 flags/day, 20 media-upload sessions/day, more than two follow/unfollow state changes per relationship/day, and export requests inside a 30-day cooldown. | **Partial** — live deployment and concurrency acceptance remain required. |
| Reputation policy/catalogue | `packages/contracts/src/reputation-policy.ts`, `packages/db/src/reputation.ts`, and migration `0012`. | **Resolved in worktree / Partial release evidence** |
| Appeal policy | `packages/contracts/src/appeal-policy.ts`, admin/jobs wiring, and migration `0012`. | **Resolved in worktree / Partial release evidence** |
| Activity ledger | `packages/contracts/src/activity-policy.ts`, `packages/db/src/activity.ts`, `/api/activity`, mutation inventory, complete requested Flutter activity UX, and migration `0012`. | **Resolved in worktree / Partial release evidence** |
| DSR linkage | Repository remediation preserves prior reputation-event/appeal coverage; adds accountability and notification locator/delete coverage; cleans private profile/retention/export artifacts; redacts appeal statements; and retains governance rows pseudonymized. Passport v3 conditionally decrypts the private accountability name only with `PII_ENCRYPTION_KEY_V1`. | **Partial** — migration, Jobs-key provisioning, no-store export acceptance, and live privacy evidence remain required. |
| Production rollout | PlanetScale branch/schema state is verified read-only; deployed Worker SHA, secrets, migrations beyond `0008`, PG17 compatibility, and governance approvals remain unknown/unverified. | **Planned** |

## Acceptance gates

Before this report may be replaced by a launch decision, the release owner must have: an exact merged SHA; passing current-head CI (the current worktree policy coverage gate is passing); a successful `0009`–`0012` migration-chain validation against an explicit PostgreSQL 17 target (the PostgreSQL 18.4 `development` branch is not a substitute); approved `main` migration evidence; deployment and secret verification including confirmation that Jobs has `PII_ENCRYPTION_KEY_V1`; tested DSR passport-v3 export/delete/pseudonymized-retention/legal-hold behaviour and private no-store export access; explicit no-cost approval before enabling disabled notification/media queues; runtime/OpenAPI/Flutter contract evidence; critical runtime-orchestration coverage; feed p95 evidence; and trained reviewer/adjudicator operations approval. Until those gates pass, no PlanetScale write or DDL is authorised.

**Conclusion:** **NO-GO for production launch.** Policy sources and the repository client/API contract are reconciled in the current worktree. They remain uncommitted release evidence, and the live database, approved migration, exact-SHA deployment, secrets/providers, performance, and human governance gates are not proven.
