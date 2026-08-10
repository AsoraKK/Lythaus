# Product Contract Reconciliation — August 2026

**Status:** Partial — repository contract audit only; this is not production-readiness evidence.

**Assessment boundary:** `codex/product-integrity-2026-08-10`, base commit `6c5eb0f0dd6f`; current worktree contracts and migration `0012_product_integrity_v2.sql` were inspected. PlanetScale state was verified read-only on 2026-08-10. No provider write or DDL was executed, and no deployment, secret, or human-governance gate was approved here.

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
| P0 policy contradiction | **Deprecated** | `docs/policy/alpha-ai-authorship-and-moderation.md` says AI-generated content may be published and AI-assisted content can earn ordinary reputation. `packages/contracts/src/content-policy.ts` blocks AI-generated public content and caps AI-assisted text; `reputation-policy.ts` withholds AI-assisted and AI-generated authorship impact. | Replace the Alpha policy before any release or public-policy use. The contract in this report and the shared policy modules is the current intended rule. |
| P0 governance contradiction | **Deprecated** | `docs/runbooks/admin-ops.md` says appeals auto-resolve after five minutes and admins can override. `packages/contracts/src/appeal-policy.ts` requires five trained reviewers, a 60% weighted majority, and adjudicator confirmation. | Withdraw the auto-resolution instruction. Update operations and OpenAPI together after the governance flow is accepted. |
| P1 launch behaviour mismatch | **Partial** | `api/openapi/openapi.yaml` still describes AI-generated publication and older appeal shapes; the uncommitted `api/openapi/product-integrity.yaml` describes the newer contract. The public Worker routes use `/api/appeals`, `/api/activity`, and `/api/reputation/me/ledger`. | Choose one canonical OpenAPI document, reconcile generated Dart clients, and run runtime/OpenAPI contract tests on the exact release SHA. |
| P1 client contract mismatch | **Deprecated** | Legacy Flutter moderation services still call `/api/appealContent`, `/api/getMyAppeals`, `/api/reviewAppealedContent`, and `/api/voteOnAppeal`; the current Worker exposes different routes. | Remove or migrate each reachable legacy client path; prove navigation uses only canonical generated/current clients. |
| P1 missing live schema | **Planned** | Read-only evidence shows production/default `main` on PostgreSQL 17.10 with 76 application tables and latest migration `0008_legacy_relink_status.sql`; the activity-ledger, appeal-review-vote, and notification-device relations are absent. Repository migrations continue through `0012_product_integrity_v2.sql`. | Validate the complete `0009`–`0012` chain against an explicit disposable PostgreSQL 17 target, reconcile the baseline, and obtain explicit approval before any `main` write or DDL. |
| P1 coverage scope gap | **Partial** | The full `npm run test:critical-coverage` gate passes for the current worktree and `scripts/critical-coverage-manifest.json` enforces 80% lines and branches for selected policy modules. It does not establish equivalent coverage for Worker route orchestration, transactional outbox delivery, database repositories, DSR deletion, or Flutter integration. | Keep the passing policy gate, label it accurately, and add behavioural integration/contract coverage for the runtime critical set without lowering the threshold. |
| P1 audit completeness gap | **Partial** | The Activity contract lists semantic event types; helpers exist in public/admin/jobs Workers and a private route/UI exist. There is no evidence every authoritative mutation produces the intended event or that delivery was exercised against the migrated database. | Complete a mutation-to-event inventory and transactional/outbox tests; verify idempotency, retries, export, deletion, legal-hold handling, and access isolation. |
| P1 DSR live-acceptance gate | **Partial** | The remediation now locates accountability signals and notification preferences/devices; deletion removes those records, private profile fields, retention rules, and prior export objects/manifests; it redacts appeal statements and marks retained governance rows pseudonymized. Passport v3 includes notification metadata/preferences and accountability signals, and decrypts the private accountability name only with `PII_ENCRYPTION_KEY_V1`. | Verify the migrated/live path, confirm the Jobs PII key without exposing it, exercise private no-store export access, and obtain no-cost approval before enabling disabled notification/media queues. |
| P2 entitlement/copy drift | **Deprecated** | `docs/policy/approved-product-copy.md` says rewards stop at Level 3 and describes broader News access, while `tier-policy.ts` has Black-only News Board and `REWARD_ACCESS_POLICY.maximumReputationLevel` is 5. | Reapprove copy against the central entitlement and reward contracts. Do not use marketing copy as an enforcement source. |
| P2 status overstatement | **Deprecated** | `docs/architecture/native-worker-capability-parity.md` says moderation, appeals, reputation, and rewards are implemented, while the required schema and deployment evidence are not live. | Change status prose to Partial until exact-SHA CI, migrations, deployment, secrets, and human gates are evidenced. |
| P2 UX completion gap | **Partial** | `ReputationLedgerScreen` has private ledger/activity tabs, pagination, retry, empty states, and semantics. It lacks the requested Activity category filters, detail treatment, and policy-link affordances. | Finish and test those UX requirements after the server contract is live. |
| P2 performance evidence gap | **Planned** | No current feed p95 measurement or release-load result was found for the `<200 ms` target. | Define a representative dataset and run repeatable feed/cache-isolation load tests before launch. |

## Current implementation map

| Contract area | Evidence | Status |
| --- | --- | --- |
| Content declaration boundary | `packages/contracts/src/content-policy.ts`; policy tests cover NFC/trimmed grapheme counting, 249 allowed, 250 blocked, and generated blocked. | **Partial** |
| Tier entitlement policy | `packages/contracts/src/tier-policy.ts`; Free 1, Premium 2, Black 3 custom feeds; Black-only News Board. | **Partial** |
| 429 anti-abuse controls | Implemented repository limits return `429` for 20 flags/day, 20 media-upload sessions/day, more than two follow/unfollow state changes per relationship/day, and export requests inside a 30-day cooldown. | **Partial** — live deployment and concurrency acceptance remain required. |
| Reputation policy/catalogue | `packages/contracts/src/reputation-policy.ts`, `packages/db/src/reputation.ts`, and migration `0012`. | **Partial** |
| Appeal policy | `packages/contracts/src/appeal-policy.ts`, admin/jobs wiring, and migration `0012`. | **Partial** |
| Activity ledger | `packages/contracts/src/activity-policy.ts`, `packages/db/src/activity.ts`, `/api/activity`, Flutter activity tab, and migration `0012`. | **Partial** |
| DSR linkage | Repository remediation preserves prior reputation-event/appeal coverage; adds accountability and notification locator/delete coverage; cleans private profile/retention/export artifacts; redacts appeal statements; and retains governance rows pseudonymized. Passport v3 conditionally decrypts the private accountability name only with `PII_ENCRYPTION_KEY_V1`. | **Partial** — migration, Jobs-key provisioning, no-store export acceptance, and live privacy evidence remain required. |
| Production rollout | PlanetScale branch/schema state is verified read-only; deployed Worker SHA, secrets, migrations beyond `0008`, PG17 compatibility, and governance approvals remain unknown/unverified. | **Planned** |

## Acceptance gates

Before this report may be replaced by a launch decision, the release owner must have: an exact merged SHA; passing current-head CI (the current worktree policy coverage gate is passing); a successful `0009`–`0012` migration-chain validation against an explicit PostgreSQL 17 target (the PostgreSQL 18.4 `development` branch is not a substitute); approved `main` migration evidence; deployment and secret verification including confirmation that Jobs has `PII_ENCRYPTION_KEY_V1`; tested DSR passport-v3 export/delete/pseudonymized-retention/legal-hold behaviour and private no-store export access; explicit no-cost approval before enabling disabled notification/media queues; runtime/OpenAPI/Flutter contract evidence; critical runtime-orchestration coverage; feed p95 evidence; and trained reviewer/adjudicator operations approval. Until those gates pass, no PlanetScale write or DDL is authorised.

**Conclusion:** **NO-GO.** The repository has a coherent target contract, but its policy sources, client/API surface, live database state, and deployment evidence are not yet reconciled sufficiently to claim production readiness.
