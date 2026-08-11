# Final Launch Blocker Report — August 2026

## Decision

**NO-GO for production launch.** The product-integrity worktree now contains the reconciled repository contracts and implementation, with targeted repository gates passing. The required live database state, approved PostgreSQL 17 migration evidence, deployment and secret/provider confirmation, exact-SHA CI, performance evidence, and human governance approvals are not established.

**Evidence boundary:** worktree HEAD `54c90634b9322e7dfb51598650e6f1690ac30d44` on `codex/product-integrity-2026-08-10`, current uncommitted worktree files, `origin/main` at `6c5eb0f0dd6fb361f0ee05d6a3d9069ecca20aa1`, and the dated read-only PlanetScale evidence verified 2026-08-10. No PlanetScale write or DDL, production mutation, or live deployment verification was performed.

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

## P1 blockers

| Blocker | Evidence | Exit criterion |
| --- | --- | --- |
| Critical coverage is broad but not end-to-end | The current-worktree `npm run test:critical-coverage` gate passes at least 80% lines and branches for 20 production modules across 12 required domains, including invoked public/admin/jobs runtime seams. It does not certify complete route, SQL transaction, Hyperdrive, queue, migrated-database, deployment, or Flutter behaviour. | Keep the passing per-module gate and add migrated database and authenticated integration evidence without representing extracted-seam coverage as whole-system coverage. |
| Activity/Audit live delivery is not proven | The catalogue, private API/Flutter UX, storage helper, public-API mutation inventory, and separate admin/jobs activity call-site invariants exist and pass. The unique identity provides at-most-one persisted effect after migration; live concurrent delivery, rollback, access, export, delete, and legal-restriction acceptance remain unproven. | Prove at-most-one durable effect and transactional/outbox reconciliation on migrated infrastructure; test concurrent retry/result retrieval, rollback, private access, export, delete, and legal restriction. |
| Reputation and appeals are only partial repository implementation | Versioned policy, profile/reviewer schema, and Jobs/Admin code are in the worktree; migration/deploy/runtime acceptance is absent. | Validate promotions/demotions/reversals, reviewer assignment, 60% tally, adjudication, recusal, notifications, and DSR on migrated PostgreSQL 17. |
| Exact-SHA client integration is not released | Reachable legacy appeal calls have been removed, canonical OpenAPI and Dart are generated in the worktree, and focused Flutter contract tests pass. These are uncommitted worktree results without authenticated exact-SHA integration or deployed-route evidence. | Commit and verify canonical generated/current clients, run the authenticated Flutter/API integration suite on the exact release SHA, and retain deployed-route evidence. |
| At-most-once idempotency needs migrated acceptance | Runtime mutations use fail-closed at-most-once claims: completed safe outcomes replay; active claims do not re-execute; aged or ambiguous claims return an unknown-outcome error. This deliberately favours duplicate prevention over automatic retry and is not an exactly-once guarantee. | Prove keyed concurrent requests, partial failure, claim finalisation/quarantine, DSR tombstoning, and replay against migrated PostgreSQL before launch. |
| DSR/retention/legal-hold live acceptance is incomplete | Repository remediation now covers accountability signals and notification preferences/devices, deletes private profile/retention/prior-export artifacts, redacts appeal statements, and marks retained governance rows pseudonymized. Passport v3 exports notification/accountability data and decrypts the private accountability name only with `PII_ENCRYPTION_KEY_V1`; authenticated export is private/no-store and records `privacy.export_accessed`. | Demonstrate this path on migrated infrastructure, confirm the Jobs PII key, test legal-hold behaviour, and prove no PII/secrets appear in operational logs. |
| Reviewer/adjudicator operations are not ready | The policy requires trained independent reviewers and trained Editorial/journalist adjudicators; staffing, training, conflict operations, and escalation approval are unknown. | Approve reviewer qualification, assignment seed custody, recusal/appeal operations, high-risk two-adjudicator roster, and support ownership. |

## P2 blockers

| Blocker | Evidence | Exit criterion |
| --- | --- | --- |
| Activity UI release acceptance is incomplete | The worktree screen has category filters, cursor pagination, detail treatment, contextual policy links, retry/empty/error states, semantics, and tests without exposing raw JSON. Authenticated exact-SHA Flutter/API acceptance is not retained. | Verify the completed accessible activity-log UX against the migrated private API on the exact release SHA. |
| Product copy and status docs are stale | Entitlement/reward copy and native capability parity prose overstate or conflict with central policies. | Reconcile every active policy, runbook, architecture status, and user-facing copy before release communications. |
| Feed performance has no release evidence | No p95 measurement/caching isolation proof was found for the `<200 ms` target. | Run repeatable mixed-user feed load and cache-isolation tests on release-like infrastructure. |
| Abuse test depth remains uneven | Current policy tests are valuable but leave duplicate/near-duplicate detection, rings, account clusters, and live queue-failure tests unproven. | Execute the test plan in `abuse-test-matrix-2026-08.md` and retain results against the exact release SHA. |

## Repository progress (not launch clearance)

| Area | Current state |
| --- | --- |
| Content declaration | **Resolved in worktree / Partial release evidence:** shared normalised/trimmed grapheme policy permits AI-assisted text through 249 and blocks 250+ and AI-generated public content. |
| Tiers | **Resolved in worktree / Partial release evidence:** central Free/Premium/Black limits and Black-only News Board policy exist. |
| Reputation | **Resolved in worktree / Partial release evidence:** versioned pillars, gates, event catalogue, reversals, and anti-farming calculations exist. |
| Appeals | **Resolved in worktree / Partial release evidence:** trained reviewer qualification, five-reviewer quorum, capped Level 5 weight, and adjudication policy exist. |
| Activity/Audit | **Resolved in worktree / Partial release evidence:** catalogue, storage helper, mutation inventory, migration, private API route, and complete requested Flutter surface exist. |
| Critical coverage | **Partial system scope:** the current-worktree gate passes at least 80% lines and branches for 20 modules/12 domains, including extracted invoked runtime seams; it is not whole-system or deployment certification. |
| 429 anti-abuse controls | **Partial:** repository controls now enforce 20 flags/day, 20 media-upload sessions/day, two follow/unfollow state changes per relationship/day, and a 30-day export cooldown. Live deployment, concurrency, and no-cost queue acceptance are still required. |

## Deliberately deferred / out of scope

- Forensic/authenticity model training, classifier expansion, datasets, and provider experimentation.
- Public numeric authenticity confidence or detailed public reputation history.
- Engagement-maximising reputation mechanics, paid trust, and popularity-driven ranking.
- Any PlanetScale `main` write, Cloudflare mutation, new provider/resource, or deployment action without explicit approval.

## Required launch packet

The release owner needs a single exact-SHA packet containing: all CI results (including the passed policy coverage gate); migration-chain and post-migration schema proof; deployment/binding/secret verification including Jobs `PII_ENCRYPTION_KEY_V1`; private no-store passport-v3 export/access-recording and delete/pseudonymized-retention/legal-hold proof; explicit no-cost approval before enabling disabled notification/media queues; Worker/OpenAPI/generated-client/Flutter contract evidence; critical runtime coverage; abuse/failure/load results; feed p95/cache-isolation data; incident/rollback evidence; and trained reviewer/adjudicator approval. Until that packet exists, production readiness remains **NO-GO**.
