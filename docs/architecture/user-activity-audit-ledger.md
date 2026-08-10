# User Activity & Audit Ledger

**Status:** Partial — repository contracts, storage helpers, Worker routes, and a Flutter surface exist; live migration, delivery, and privacy-operation evidence remain unverified.

The Activity & Audit Ledger answers: “What did I do on Lythaus, what did Lythaus do because of it, and did it affect my account, content, or reputation?” It is private, user-semantic history. It is not an operational log and it is not a raw clickstream.

## Contract sources

- [Activity Event Catalogue](../contracts/activity-event-catalogue-v1.json) is the machine-readable event vocabulary.
- `packages/contracts/src/activity-policy.ts` defines `activity-v1.0.0`, category vocabulary, metadata restrictions, retention classes, and private-view policy.
- `packages/db/src/activity.ts` provides idempotent record and keyset-list helpers.
- `database/planetscale/migrations/0012_product_integrity_v2.sql` defines `trust.user_activity_events`, calls the prior DSR locator, and adds integrity-v2 reconciliation relations; the current remediation extends locator/delete treatment to accountability and notification data.
- The public Worker has private `GET /api/activity` and `GET /api/users/me/activity` routes; Flutter consumes `/api/activity` in `ReputationLedgerScreen`.

## Taxonomy and user visibility

The stable categories are `account`, `content`, `social`, `reputation`, `moderation`, `appeals`, `privacy`, and `rewards`. Event keys are deterministic dot-separated names. Every catalogue entry has a user-visible title and plain explanation; it must never expose raw internal policy scoring or sensitive user data.

The ledger records authoritative outcomes such as `social.follow_created` after a successful relationship mutation, not a client tap. It excludes pixel scroll, keystrokes, pointer movement, focus, rendering, animation, and other clickstream telemetry.

## Data model

The proposed/partial storage model is `trust.user_activity_events`:

| Field group | Fields |
| --- | --- |
| Identity | UUIDv7 `id`, `user_id`, optional `actor_user_id`, `source_event_id`, `correlation_id` |
| Event | `event_type`, category, source (`public_api`, `admin_api`, `jobs`, `workflow`, `system`), result, reason code, policy version |
| Related object | optional object type and UUID |
| User explanation | bounded title and explanation, appealability, reputation-effect band |
| Privacy | allowlisted metadata, retention class, retention-until timestamp |
| Ordering | immutable `created_at`; owner cursor index `(user_id, created_at DESC, id DESC)` |

The schema uniqueness key `(user_id, source_event_id, event_type)` makes delivery idempotent per user-visible effect. A duplicate source delivery returns the original event rather than creating a second ledger row. UUIDv7 creation and the caller-provided source event make correlation deterministic.

## Delivery architecture

Required flow for an authoritative mutation:

1. A client requests a mutation.
2. The authoritative Worker validates identity, policy, and idempotency.
3. The primary state transition commits in a transaction.
4. A domain/outbox event is written in the same transaction where asynchronous work is needed.
5. The durable activity record is recorded idempotently from that authoritative outcome.
6. The private API returns cursor-paginated records to the subject.

The repository has shared `recordUserActivity` helpers and activity call sites in public/admin/jobs Workers. **Partial:** an inventory proving every state-changing mutation has the correct event and transaction boundary has not been accepted, and live queue/retry behaviour was not exercised.

## Metadata and operational privacy

Metadata is deliberately a small scalar allowlist. Nested objects, arbitrary bodies, and strings longer than 160 characters are rejected. The forbidden-key rule rejects names matching authorisation, body, cookie, credential, email, password, request, secret, or token.

| Category | Allowed metadata keys |
| --- | --- |
| Account | `authenticationMethod`, `changedField`, `sessionAction` |
| Content | `contentType`, `creationMode`, `visibility`, `moderationState` |
| Social | `relationshipType`, `targetType` |
| Reputation | `pillar`, `levelBefore`, `levelAfter`, `explanationCode` |
| Moderation | `decisionType`, `restrictionType`, `durationBand` |
| Appeals | `appealState`, `riskClass`, `outcome` |
| Privacy | `requestType`, `requestState`, `retentionClass` |
| Rewards | `tierBefore`, `tierAfter`, `entitlementType`, `rewardId` |

Operational logs must not substitute for the ledger and must never contain raw PII, credentials, OTPs, reset tokens, access tokens, refresh tokens, or encryption material.

## Access and API

The subject can read their own entries. The policy permits another viewer only with `privacy:activity:read`; the public Worker route derives the subject from the authenticated principal and does not accept an arbitrary subject parameter. The API supports a bounded limit, opaque cursor, reverse chronological order, and an optional category filter. No public activity endpoint is part of this contract.

Related authoritative 429 safeguards reject excessive semantic requests: flags are limited to 20 per day, media-upload sessions to 20 per day, follow/unfollow state changes to two per relationship per day, and privacy export requests to one per 30-day cooldown. The export cooldown protects the private passport path without changing DSR eligibility or reputation.

**Partial:** endpoint and policy tests exist in the repository, but cross-user access isolation has not been proven against the migrated/deployed runtime in this documentation pass.

## Retention, DSR, deletion, and legal restriction

The policy currently maps ordinary activity to 730 days, security activity to 365 days, and moderation activity to 90 days. These are ledger retention classes, not permission to retain all surrounding content or operational logs indefinitely. Content purge, operational-log, and closed-case rules retain their own controls.

Migration `0012` renames and calls the prior locator before adding activity, reputation-profile, reviewer-qualification, assignment, vote, adjudication, outcome, and outcome-effect locations. The remediation now also locates accountability signals and notification preferences/devices. Deletion removes those records, private profile fields, retention rules, and prior export objects/manifests; it redacts appeal statements and marks retained immutable governance rows pseudonymized. This preserves audit/legal integrity without retaining direct identifiers indefinitely; legal holds still control when deletion or pseudonymization is deferred.

Passport v3 includes notification metadata/preferences and accountability signals. The authenticated `GET /privacy/requests/{id}/export` route streams the passport privately with `no-store` and records `privacy.export_accessed`. The private accountability name is decrypted only in the authorised export path and only when Jobs has `PII_ENCRYPTION_KEY_V1`; no value is exposed in operational logs.

**Partial:** the migration is not on reported production `main`, PostgreSQL 17 validation is unavailable, and the live Jobs PII-key, private no-store export, deletion/pseudonymization, and legal-hold behaviour still require acceptance evidence. Enabling disabled notification/media queues also requires explicit no-cost approval. A legal restriction should be shown only where disclosure is permitted.

## Flutter experience

`ReputationLedgerScreen` currently provides private Reputation and Account Activity tabs, authenticated server pagination, retry, empty states, and accessible semantic labels. It does not yet provide the full requested category filter rail, entry detail, policy links, or a dedicated appeal affordance. It must not render raw metadata JSON.

## Security and launch requirements

Before production use, validate the full migration chain on PostgreSQL 17, prove transactional/outbox retry and duplicate handling, test private-access isolation and DSR passport-v3 export/delete/pseudonymized-retention/legal-hold behaviour, confirm the Jobs `PII_ENCRYPTION_KEY_V1` binding without exposing it, verify private no-store export streaming and `privacy.export_accessed`, obtain no-cost approval before enabling disabled notification/media queues, test metadata/log redaction, reconcile OpenAPI/generated Flutter contracts, verify deployment configuration and secrets, and measure feed p95. Until then, the ledger is **Partial** and the release is **NO-GO**.
