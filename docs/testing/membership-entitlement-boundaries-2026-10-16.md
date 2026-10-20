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

The OpenAPI and generated Dart contract now match the Worker response: `tier` plus `entitlements.maxCustomFeeds` and `entitlements.newsBoardAccess`. Free, Premium, and Black receive 1/2/3 custom feeds; only Black receives full News Board access. The response has no payment provider, pending, payment-confirmed, cancellation, or expiry state. Its wire payload is unchanged; generated clients ignore unknown extra keys, and those keys must not be reinterpreted as lifecycle state. Future provider lifecycle support requires a separately approved contract and integration.

### OpenAPI v13 consumer migration

OpenAPI v13 is a breaking typed-contract correction because v12 marked unsupported lifecycle and policy properties as required. The runtime route and its JSON payload are unchanged. Regenerate typed clients from v13 and read only `tier` and the two documented entitlement fields. Remove consumers of `status`, `provider`, period-end, cancellation, manual-grant expiry, and unrelated safety/reputation limits from this endpoint. Do not map legacy values such as `pending`, `confirmed`, `active`, or `manual` to an access or payment state; extra response keys are ignored and do not attest to payment. A missing, unknown, or malformed tier in the active response remains unavailable to the client, while the server continues normalizing missing or unknown stored tier values to Free. This migration does not select a provider, define paid purchase behavior, or change entitlements.

## Regression evidence

`apps/lythaus-admin-api/tests/membership-entitlements.postgres.mjs` uses only synthetic local PostgreSQL 17 fixtures. It covers concurrent first grants, repeated requests, account isolation, downgrade, unsupported provider lifecycle inputs, and unauthenticated changes.

`apps/lythaus-public-api/tests/membership-entitlements.postgres.mjs` uses synthetic local PostgreSQL 17 fixtures. It covers server-enforced tier limits, Black-only News Board access, forged client tier and lifecycle claims, idempotent replay, cross-account reads, downgrade, and unavailable authoritative entitlement reads.

The synthetic PostgreSQL 17 CI fixture cannot execute the Black News Board route acceptance test because its fixture runtime role lacks `USAGE` on the `editorial` schema; the test is unconditionally skipped for that reason. This is fixture evidence only. Production Hyperdrive role mapping and live production route behavior remain unverified, so this does not establish a production `500` or prove the effective production grants. Static inspection of `database/planetscale/grants/roles.sql` shows no repository grant for `USAGE` on `editorial` or `SELECT` on `editorial.publications`; that file does not establish hosted effective privileges. For a separately authorized grant lane, one least-privilege SQL proposal is `GRANT USAGE ON SCHEMA editorial TO lythaus_runtime` plus column-level `SELECT (id, title, post_id, published_at) ON editorial.publications TO lythaus_runtime`, which covers the route's referenced publication columns. This is a proposal, not a confirmed production grant. No hosted grants or access checks were inspected or executed, and no grant was applied in this work.

Neither suite performs provider calls, creates subscriptions, runs migrations or grants, or activates features.
