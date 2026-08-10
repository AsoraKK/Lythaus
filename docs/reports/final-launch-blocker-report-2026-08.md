# Final Launch Blocker Report — August 2026

## Decision

**NO-GO.** The product-integrity worktree contains promising repository contracts and in-progress code, but the required database state, PostgreSQL 17 validation, deployment evidence, secret/provider confirmation, exact-SHA CI, and human governance approvals are not established.

**Evidence boundary:** base commit `6c5eb0f0dd6f` on `codex/product-integrity-2026-08-10`, current uncommitted worktree files, and read-only PlanetScale evidence verified 2026-08-10. No PlanetScale write or DDL, production mutation, or live deployment verification was performed.

## Verified database state

Only `main` and `development` exist.

| Branch | Provider role / PostgreSQL | Application tables | Migration evidence | Missing/invalidating evidence |
| --- | --- | ---: | --- | --- |
| `main` | Production and default; PostgreSQL 17.10 | 76 | Latest `system.schema_migrations.version` is `0008_legacy_relink_status.sql`. | `trust.user_activity_events`, `moderation.appeal_review_votes`, and `feed.notification_devices` are absent. |
| `development` | Development; PostgreSQL 18.4 | 75 | The migration-marker query returned no rows. | It is not the required disposable PostgreSQL 17 compatibility target. |

The local PostgreSQL 17 validation command failed closed because `PLANETSCALE_PG17_TEST_DATABASE_URL` was missing. The Docker Desktop engine and local `psql`/PostgreSQL service were unavailable, so there is no local PostgreSQL 17 compatibility result.

## P0 blockers

| Blocker | Evidence | Exit criterion |
| --- | --- | --- |
| Production schema is behind the repository | Verified production/default `main` is PostgreSQL 17.10 with 76 application tables and latest migration `0008_legacy_relink_status.sql`; activity-ledger, appeal-review-vote, and notification-device relations are absent. Repository migrations continue through `0012_product_integrity_v2.sql`. | Validate the full chain using synthetic data on an explicit PostgreSQL 17 target; reconcile baseline; obtain explicit human approval before any `main` write or DDL; capture post-migration schema evidence. |
| PostgreSQL 17 compatibility validation unavailable | `development` is PostgreSQL 18.4 with 75 application tables and no migration-marker rows, so it cannot serve as the required PostgreSQL 17 target. The local command failed closed without `PLANETSCALE_PG17_TEST_DATABASE_URL`; Docker Desktop and local `psql`/service were unavailable. | Supply an approved disposable PostgreSQL 17 test target, execute the complete `0009`–`0012` chain, and retain the successful exact-chain evidence. |
| Deployment, secrets, and provider gates are unknown | No deployed Worker SHA, binding/secret verification, email/notification delivery proof, or provider-state approval was supplied. Jobs must have `PII_ENCRYPTION_KEY_V1` for authorised accountability-name export; disabled notification/media queues require a no-cost approval before enablement. | Verify the exact reviewed/merged SHA, required bindings and secrets without exposing values, Jobs PII-key presence, service readiness, rollback, and explicit no-cost approval for any queue enablement. |
| Active policy sources contradict the release contract | Alpha policy permits AI-generated public publication; admin runbook auto-resolves appeals; canonical OpenAPI retains conflicting language/routes. | Retire or correct the active policy/runbook/OpenAPI sources and prove Worker, generated client, and Flutter agreement. |

## P1 blockers

| Blocker | Evidence | Exit criterion |
| --- | --- | --- |
| Critical coverage proves policy modules, not full runtime orchestration | The full `npm run test:critical-coverage` gate passes in the current worktree. Its manifest’s 80% line/branch gate covers selected contracts and helpers; it does not measure end-to-end Worker routes, DB/outbox, DSR, or Flutter flows. | Maintain the passing policy gate and add manifest-backed behavioural integration/contract coverage for all critical runtime paths. |
| Activity/Audit ledger is not proven complete | Event catalogue, helper, routes, jobs/admin call sites, migration, and a Flutter tab exist, but no accepted authoritative mutation-to-event inventory or live delivery evidence exists. | Prove each semantic state change emits exactly one private event after commit; test retry, rollback, private access, export, delete, and legal restriction. |
| Reputation and appeals are only partial repository implementation | Versioned policy, profile/reviewer schema, and Jobs/Admin code are in the worktree; migration/deploy/runtime acceptance is absent. | Validate promotions/demotions/reversals, reviewer assignment, 60% tally, adjudication, recusal, notifications, and DSR on migrated PostgreSQL 17. |
| Flutter retains legacy appeal endpoints | Older services still reference unsupported `/api/appealContent`-style routes while the new Worker uses `/api/appeals` shapes. | Eliminate reachable legacy calls, regenerate/verify canonical client use, and run an authenticated Flutter integration suite. |
| DSR/retention/legal-hold live acceptance is incomplete | Repository remediation now covers accountability signals and notification preferences/devices, deletes private profile/retention/prior-export artifacts, redacts appeal statements, and marks retained governance rows pseudonymized. Passport v3 exports notification/accountability data and decrypts the private accountability name only with `PII_ENCRYPTION_KEY_V1`; authenticated export is private/no-store and records `privacy.export_accessed`. | Demonstrate this path on migrated infrastructure, confirm the Jobs PII key, test legal-hold behaviour, and prove no PII/secrets appear in operational logs. |
| Reviewer/adjudicator operations are not ready | The policy requires trained independent reviewers and trained Editorial/journalist adjudicators; staffing, training, conflict operations, and escalation approval are unknown. | Approve reviewer qualification, assignment seed custody, recusal/appeal operations, high-risk two-adjudicator roster, and support ownership. |

## P2 blockers

| Blocker | Evidence | Exit criterion |
| --- | --- | --- |
| Activity UI is incomplete | Existing screen has tabs, cursor pagination, retry, empty state, and semantics, but lacks category filtering, detail, policy links, and accepted UX coverage. | Complete accessible activity-log UX and verify it against the private API contract. |
| Product copy and status docs are stale | Entitlement/reward copy and native capability parity prose overstate or conflict with central policies. | Reconcile every active policy, runbook, architecture status, and user-facing copy before release communications. |
| Feed performance has no release evidence | No p95 measurement/caching isolation proof was found for the `<200 ms` target. | Run repeatable mixed-user feed load and cache-isolation tests on release-like infrastructure. |
| Abuse test depth remains uneven | Current policy tests are valuable but leave duplicate/near-duplicate detection, rings, account clusters, and live queue-failure tests unproven. | Execute the test plan in `abuse-test-matrix-2026-08.md` and retain results against the exact release SHA. |

## Repository progress (not launch clearance)

| Area | Current state |
| --- | --- |
| Content declaration | **Partial:** shared normalized/trimmed grapheme policy permits AI-assisted text through 249 and blocks 250+ and AI-generated public content. |
| Tiers | **Partial:** central Free/Premium/Black limits and Black-only News Board policy exist. |
| Reputation | **Partial:** versioned pillars, gates, event catalogue, reversals, and anti-farming calculations exist in repository policy. |
| Appeals | **Partial:** trained reviewer qualification, five-reviewer quorum, capped Level 5 weight, and adjudication policy exist in repository policy. |
| Activity/Audit | **Partial:** catalogue, storage helper, migration, API route, and Flutter surface exist in the worktree. |
| Critical coverage | **Partial scope:** the full current-worktree gate passes at the 80% line/branch policy-module threshold; it is not a whole-runtime coverage certification. |
| 429 anti-abuse controls | **Partial:** repository controls now enforce 20 flags/day, 20 media-upload sessions/day, two follow/unfollow state changes per relationship/day, and a 30-day export cooldown. Live deployment, concurrency, and no-cost queue acceptance are still required. |

## Deliberately deferred / out of scope

- Forensic/authenticity model training, classifier expansion, datasets, and provider experimentation.
- Public numeric authenticity confidence or detailed public reputation history.
- Engagement-maximising reputation mechanics, paid trust, and popularity-driven ranking.
- Any PlanetScale `main` write, Cloudflare mutation, new provider/resource, or deployment action without explicit approval.

## Required launch packet

The release owner needs a single exact-SHA packet containing: all CI results (including the passed policy coverage gate); migration-chain and post-migration schema proof; deployment/binding/secret verification including Jobs `PII_ENCRYPTION_KEY_V1`; private no-store passport-v3 export/access-recording and delete/pseudonymized-retention/legal-hold proof; explicit no-cost approval before enabling disabled notification/media queues; Worker/OpenAPI/generated-client/Flutter contract evidence; critical runtime coverage; abuse/failure/load results; feed p95/cache-isolation data; incident/rollback evidence; and trained reviewer/adjudicator approval. Until that packet exists, production readiness remains **NO-GO**.
