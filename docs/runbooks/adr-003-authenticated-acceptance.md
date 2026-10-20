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
| A21 | Controlled 25-hour-old verification link rejection and resend | Kyle/manual mailbox step plus candidate observation |
| A22 | Immediate resend cooldown without a new email intent, then resend after cooldown | Kyle/manual Turnstile and mailbox step plus candidate observation |
| A23 | Two-account session isolation, independent logout, refresh rotation and recovery revocation | Kyle/manual password entry plus candidate observation |
| A19 | CORS validation | automated |
| A20 | Web email-flow validation | Kyle/manual web plus automated web security |

## Evidence rules

Record the exact commit SHA, GitHub Actions run ID, candidate public Worker version, the full public/admin/jobs/coordinator dependency version and provenance set, Hyperdrive IDs, PlanetScale branch, UTC timestamps, and pass/fail outcomes. The protected acceptance run binds those values and its rollback snapshot before any human step; do not resume a run if either identity changes. Use the generated acceptance run ID only to correlate the protected observer and database query; do not emit database correlation IDs. Do not commit tokens, passwords, email addresses, verification links, reset links, refresh tokens, user IDs, or database row contents.

The acceptance remains `BLOCKED` when guest or email acceptance evidence is missing, when any case is not executed, when any protected readiness probe is not `pass`, or when the database branch is `unknown`.

## Native harness

Run `npm run acceptance:adr003` only against the reviewed Worker deployment after the Hyperdrive verifier has passed. The harness requires `DATABASE_READINESS_TOKEN`, `HYPERDRIVE_VERIFIED_MAIN=true`, the expected schema fingerprint/version, a dedicated acceptance account created after candidate staging, and a web health URL with CSP. It writes only sanitized case outcomes and generated opaque challenge/outbox/provider references to `ADR003_EVIDENCE_PATH`; tokens, credentials, emails, raw verification payloads, and response bodies are never written.

## Generated auth evidence

The release workflow must set `ADR003_AUTH_ACCEPTANCE_EVIDENCE_SOURCE` explicitly to either `protected_probe` or `read_only_query_artifact`. A protected probe must be an explicitly configured HTTPS URL, require the readiness bearer token, receive the exact Worker version override and `ADR003_ACCEPTANCE_RUN_ID`, and return the generated `lythaus-real-email-acceptance-v3` observation. A passing result requires the exact candidate dependency set, protected Cloudflare Email Sending lifecycle subscription observation, four delivered verification messages, one delivered reset message, a controlled expired-link rejection, a no-send cooldown observation, two distinct mailbox providers, and account-isolation proof. There is no default or public auth-evidence endpoint.

For `read_only_query_artifact`, a protected database step must first write that same sanitized observation. Its transaction must be read-only and its aggregate query may use `system.transactional_email_outbox` fields `purpose`, `challenge_id`, `state`, `provider`, `provider_message_id`, `provider_error_category`, `accepted_at`, `delivered_at`, `created_at`, and the parameterized `correlation_id` filter. The query must return only grouped counts, including accepted rows, delivered rows, and `count(DISTINCT provider_message_id)`; it must not select `id`, `user_id`, `contact_email_user_id`, `correlation_id`, `secret_ciphertext`, encryption key version, raw provider message IDs, or provider error text. The query must filter by the generated acceptance correlation ID, exact candidate time window, and the observed challenge IDs, then require four post-stage verification messages (initial signup, aged expired-link fixture, first resend, and post-cooldown resend) plus one post-stage password-reset message, all with Cloudflare acceptance and authenticated lifecycle delivery state. Aggregate counts are independent database evidence; typed booleans or JSON are not proof.

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

The protected observer must verify the aged fixture was expired at the candidate verification endpoint before it was superseded, and that it was delivered through Cloudflare and opened from the second mailbox provider. It must verify that the immediate retry returned the candidate's resend cooldown with zero new outbox rows, and that a new challenge was sent after the reported cooldown elapsed. Opaque challenge references and timestamps may be emitted; raw provider IDs, tokens, links and email addresses may not. Local synthetic SMTP, DNS, Turnstile or Cloudflare API fixtures must never be presented as provider or mailbox receipts.

The collector normalizes either source into the strict v3 observation and the parser enforces candidate upload/stage, all four candidate dependency identities, account, Turnstile, provider acceptance/delivery, mailbox receipts, verification, expired-link rejection, cooldown/no-send, replay, login, refresh, logout, account switching, resend supersession, and reset chronology. Synthetic test fixtures exercise this schema but cannot certify a live run. If real Turnstile, provider lifecycle or mailbox interaction cannot be completed legitimately, the generated result is `HUMAN_ACCEPTANCE_REQUIRED` or `BLOCKED` and cannot unlock release.

## Protected live-acceptance operator procedure

Run this only after the production environment grant and owner approval are available. This repository task does not perform the live run, create mailbox accounts, or send messages.

1. Stage the approved exact candidate at zero traffic through the protected release workflow. Confirm the public Worker version, source SHA, upload and stage timestamps, full public/admin/jobs/coordinator dependency versions and provenance, and rollback snapshot all match the run summary. Do not substitute a build or resume a run after dependency drift.
2. Open the run's Keeper URL only through Cloudflare Access. Keep the generated acceptance run ID in the protected workflow context; do not paste it into email or issue comments. Use only the two pre-authorized mailbox bases configured for the run, with distinct Google and Microsoft MX providers.
3. Complete real Turnstile immediately before each signup, resend, and reset operation. Use the unique run alias shown only inside the protected workflow. Enter passwords into the protected Keeper or candidate form; never copy them into logs, artifacts, shell history, screenshots or issue comments.
4. Open the delivered signup message, complete verification, confirm replay rejection, then prove sign-in and refresh rotation. Verify the message has both Cloudflare provider lifecycle delivery and a human-visible receipt in the designated mailbox.
5. Send the controlled 25-hour-old verification fixture to the second mailbox and open its link. The candidate must reject it as `verification_token_invalid` before the fixture is superseded. This proves expired-link handling with an aged token fixture; it does not wait 25 hours in real time.
6. Request a fresh resend, immediately request it once more with a fresh Turnstile challenge, and confirm the second request reports the 30-second cooldown while the outbox count does not increase. After the reported cooldown, solve a new challenge and request resend again. Complete only the newest delivered second-mailbox link, enter its password in the Keeper, and confirm replay rejection. If Turnstile cannot be completed before the cooldown elapses, stop and restart under an approved fresh acceptance run instead of counting a second email as cooldown proof.
7. Request and complete primary-account password recovery. Confirm reset-link replay rejection, revocation of the captured pre-reset refresh session, old-password rejection and new-password acceptance. Then enter the primary's previous password, new password, and the second account's password into the Keeper's temporary fields to prove separate identities, cross-account session retention, and independent logout. The page clears these fields after the proof.
8. Collect the sanitized protected observer result and release workflow summary. A green synthetic test, mocked provider event, local SMTP capture, or typed operator assertion is not live evidence. Keep the release `BLOCKED` unless the v3 parser and the exact candidate release gate both pass.

As of the latest recorded issue #720 update (29 September 2026), production grant reconciliation run `36559940175` still awaited owner approval in the production environment. That update states no production grant mutation, migration, Worker deployment, traffic activation or email probe had occurred. Recheck the protected approval state before scheduling the operator procedure; no approval or production access is implied by this runbook.

Guest entry, new-user creation, verification delivery, consumed-link replay, and web email flow remain explicit Kyle-owned flags. Mobile email-flow validation is a separate mobile-release gate and does not block web/API production acceptance. Account deletion requires `ADR003_RUN_DESTRUCTIVE_ACCOUNT_DELETION=true` and is not enabled by the workflow default.

Repeat runs may encounter an existing privacy request from an earlier candidate attempt. In that case the harness records a pass only when the API returns the expected fail-closed limit error and the authenticated status endpoint confirms the matching request and an allowed state; unexpected `429` responses still fail acceptance.
