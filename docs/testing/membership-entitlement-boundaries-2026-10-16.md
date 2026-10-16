# Membership Entitlement Boundaries — 16 October 2026

## Authority

The approved product copy and server tier policy agree on these MVP benefits:

| Tier | Custom feeds | News Board |
| --- | ---: | --- |
| Free | 1 | None |
| Premium | 2 | None |
| Black | 3 | Full access |

Posting, moderation, reputation, appeal, and reward eligibility remain tier-neutral. Subscription does not buy reputation, reviewer qualification, vote weight, Editorial standing, or a moderation bypass.

The same server safety limits apply at every tier: 5 posts, 50 comments, 100 reactions, 2 follow-state changes per relationship per day, 20 flags, 20 media uploads per day, 10 MiB per upload, 1 appeal per day, and a 30-day export cooldown.

## Current entitlement semantics

`identity.user_entitlements.subscription_tier` is the server authority. Missing or unknown tier data resolves to Free. The admin tier endpoint is the only current grant path; it records a manual tier change and its audit, outbox, and activity evidence. Client tier fields do not grant access.

The current table has no payment provider, pending state, cancellation state, or expiry fields, and no billing provider is connected. A manually stored Premium or Black tier remains authoritative until an authorized tier change updates it. Expiry and cancellation cannot be automatically enforced in this schema; representing provider lifecycle state needs a separately approved schema and integration lane. This work adds neither.

The manual grant endpoint rejects provider lifecycle fields such as `status`, `provider`, `currentPeriodEnd`, `cancelAtPeriodEnd`, and `manualGrantExpiresAt`. An unavailable provider signal is not a confirmed entitlement.

The existing OpenAPI `SubscriptionStatus` schema is stale: it lists payment lifecycle/provider states and describes Free preview plus Premium/Black full News Board access. Those fields and benefits are not supported by the current table or approved tier copy. This server-only change leaves that API/client contract untouched; it needs a separate contract and generated-client update.

## Regression evidence

`apps/lythaus-admin-api/tests/membership-entitlements.postgres.mjs` uses only synthetic local PostgreSQL 17 fixtures. It covers concurrent first grants, repeated requests, account isolation, downgrade, unsupported provider lifecycle inputs, and unauthenticated changes.

`apps/lythaus-public-api/tests/membership-entitlements.postgres.mjs` uses synthetic local PostgreSQL 17 fixtures. It covers server-enforced tier limits, Black-only News Board access, forged client tier and lifecycle claims, idempotent replay, cross-account reads, downgrade, and unavailable authoritative entitlement reads.

The CI route check found a separate Black News Board availability blocker: the Black authorization policy returns `full`, but `GET /api/news-board` returns 500 with `permission denied for schema editorial`. That query reads `editorial.publications`; `database/planetscale/grants/roles.sql` grants neither `USAGE` on the `editorial` schema nor `SELECT` on that table to `lythaus_runtime`. The public API suite keeps a dedicated skipped Black route acceptance test until that read path is provisioned; it does not claim the Black route works. A least-privilege grant proposal for a separately authorized grant lane is `GRANT USAGE ON SCHEMA editorial TO lythaus_runtime` plus column-level `SELECT (id, title, post_id, published_at) ON editorial.publications TO lythaus_runtime`, which covers the route's referenced publication columns. No effective production grants were inspected, and no grant was applied in this work.

Neither suite performs provider calls, creates subscriptions, runs migrations or grants, or activates features.
