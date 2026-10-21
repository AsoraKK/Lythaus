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

The synthetic PostgreSQL 17 CI fixture now executes the Black News Board route without an unconditional skip. It first proves the canonical role's missing editorial access fails closed, then adds fixture-only `USAGE` and column reads in its fresh owned loopback database or the existing disposable Actions PostgreSQL service, verifies Black access and Free/Premium denial, and revokes those fixture privileges. Both paths retain the loopback-only target guard; the `/postgres` service target requires `GITHUB_ACTIONS=true`. Canonical production grants remain unchanged. Production Hyperdrive role mapping and live behavior remain unverified; local failure does not establish a production `500` or prove hosted effective grants. The consolidated [rewards and News Board approval package](rewards-membership-permissions-approval-2026-10-21.md) specifies the proposed columns, binding identity gate, privacy consequences and remaining approval. No hosted grant or access check was executed.

Neither suite performs provider calls, creates subscriptions, applies hosted migrations or grants, or activates features.
