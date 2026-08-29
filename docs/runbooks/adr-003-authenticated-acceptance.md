# ADR 003 authenticated acceptance

This is the launch-blocking acceptance record for the native Cloudflare/PlanetScale stack. It must run against the exact reviewed Worker deployment and a database routing probe that passes for PlanetScale `main`.

## Required cases

| ID | Acceptance case | Evidence owner |
|---|---|---|
| A01 | Guest browsing entry | Kyle/manual client step |
| A02 | New email-user creation | Kyle/manual email step |
| A03 | Existing email-user sign-in | automated |
| A04 | Verification email delivery | Kyle/manual delivery step |
| A05 | Contact-email lookup | automated |
| A06 | Session issuance | automated |
| A07 | Refresh-token rotation | automated |
| A08 | Refresh-token replay rejection | automated |
| A09 | Logout | automated |
| A10 | Session revocation | automated |
| A11 | Profile read and write | automated |
| A12 | Authenticated post submission | automated |
| A13 | Moderation submission | automated |
| A14 | Privacy request submission or verified export cooldown on a repeat run | automated |
| A15 | Account deletion request or verified active deletion request on a repeat run | automated |
| A16 | Invalid email-verification token rejection | automated |
| A17 | Invalid password-reset token rejection | automated |
| A18 | Consumed email-link replay rejection | Kyle/manual email step |
| A19 | CORS validation | automated |
| A20 | Web email-flow validation | Kyle/manual web plus automated web security |

## Evidence rules

Record the exact commit SHA, GitHub Actions run ID, Worker deployment versions, Hyperdrive IDs, PlanetScale branch, UTC timestamps, and pass/fail outcomes. Use the generated acceptance run ID only to correlate the protected observer and database query; do not emit database correlation IDs. Do not commit tokens, email addresses, verification links, reset links, refresh tokens, user IDs, or database row contents.

The acceptance remains `BLOCKED` when guest or email acceptance evidence is missing, when any case is not executed, when any protected readiness probe is not `pass`, or when the database branch is `unknown`.

## Native harness

Run `npm run acceptance:adr003` only against the reviewed Worker deployment after the Hyperdrive verifier has passed. The harness requires `DATABASE_READINESS_TOKEN`, `HYPERDRIVE_VERIFIED_MAIN=true`, the expected schema fingerprint/version, a dedicated acceptance account created after candidate staging, and a web health URL with CSP. It writes only sanitized case outcomes and generated opaque challenge/outbox/provider references to `ADR003_EVIDENCE_PATH`; tokens, credentials, emails, raw verification payloads, and response bodies are never written.

## Generated auth evidence

The release workflow must set `ADR003_AUTH_ACCEPTANCE_EVIDENCE_SOURCE` explicitly to either `protected_probe` or `read_only_query_artifact`. A protected probe must be an explicitly configured HTTPS URL, require the readiness bearer token, receive the exact Worker version override and `ADR003_ACCEPTANCE_RUN_ID`, and return the generated `lythaus-real-email-acceptance-v2` observation. There is no default or public auth-evidence endpoint.

For `read_only_query_artifact`, a protected database step must first write that same sanitized observation. Its transaction must be read-only and its aggregate query may use `system.transactional_email_outbox` fields `purpose`, `challenge_id`, `state`, `provider`, `provider_message_id`, `provider_error_category`, `accepted_at`, `delivered_at`, `created_at`, and the parameterized `correlation_id` filter. The query must return only grouped counts, including accepted rows, delivered rows, and `count(DISTINCT provider_message_id)`; it must not select `id`, `user_id`, `contact_email_user_id`, `correlation_id`, `secret_ciphertext`, encryption key version, raw provider message IDs, or provider error text. The query must filter by the generated acceptance correlation ID, exact candidate time window, and the observed challenge IDs, then require one post-stage initial verification row, one post-stage resend verification row, and one post-stage password-reset row with Cloudflare acceptance and lifecycle delivery state. Aggregate counts are independent database evidence; typed booleans or JSON are not proof.

The required aggregate shape is equivalent to:

```sql
BEGIN READ ONLY;
SELECT purpose, state, provider, provider_error_category,
       count(*)::integer AS row_count,
       count(provider_message_id)::integer AS provider_message_id_count,
       count(DISTINCT provider_message_id)::integer AS distinct_provider_message_id_count,
       count(*) FILTER (WHERE accepted_at IS NOT NULL)::integer AS accepted_count,
       count(*) FILTER (WHERE delivered_at IS NOT NULL)::integer AS delivered_count
  FROM system.transactional_email_outbox
 WHERE correlation_id = $1
   AND challenge_id = ANY($2::uuid[])
   AND created_at >= $3::timestamptz
   AND created_at <= $4::timestamptz
 GROUP BY purpose, state, provider, provider_error_category;
ROLLBACK;
```

The generated observation must also include a sanitized `lifecycleSubscription` observation with source `cloudflare_email_sending_queue_subscription_observation`, domain `mail.lythaus.co`, status `enabled`, and exactly these Email Sending events: `delivered`, `deferred`, `bounced`, `failed`, `rejected`, and `complained`. The observation must be captured after candidate staging. A missing, disabled, differently scoped, or stale subscription is a provider configuration failure and remains fail-closed; it cannot be replaced by a GraphQL/email-send acceptance response.

The resulting `outboxSummary` must declare `lifecycleSource: "authenticated_lifecycle_handler"`. A `provider_accepted` row or an email-send response is transport evidence only and cannot be promoted to delivered; the authenticated Cloudflare lifecycle handler must consume the enabled `mail.lythaus.co` queue subscription events, reconcile the provider message, and persist `delivered`/`delivered_at` before the release gate can pass.

The verification-token query must likewise use parameterized challenge IDs and return only counts of matching rows, consumed rows, and superseded rows from `identity.email_verification_tokens`; the reset query uses the same shape against `identity.password_reset_tokens`. Both tables must expose `id`, `created_at`, `consumed_at`, and `superseded_at` to the protected query role, but those identifiers and timestamps are not emitted in the sanitized result.

The collector normalizes either source into the strict v2 observation and the parser enforces candidate upload/stage, account, Turnstile, provider acceptance/delivery, verification, replay, login, refresh, logout, resend supersession, and reset chronology. If real Turnstile or mailbox interaction cannot be completed legitimately, the generated result is `HUMAN_ACCEPTANCE_REQUIRED` and cannot unlock release.

Guest entry, new-user creation, verification delivery, consumed-link replay, and web email flow remain explicit Kyle-owned flags. Mobile email-flow validation is a separate mobile-release gate and does not block web/API production acceptance. Account deletion requires `ADR003_RUN_DESTRUCTIVE_ACCOUNT_DELETION=true` and is not enabled by the workflow default.

Repeat runs may encounter an existing privacy request from an earlier candidate attempt. In that case the harness records a pass only when the API returns the expected fail-closed limit error and the authenticated status endpoint confirms the matching request and an allowed state; unexpected `429` responses still fail acceptance.
