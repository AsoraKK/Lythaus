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

Record the exact commit SHA, GitHub Actions run ID, Worker deployment versions, Hyperdrive IDs, PlanetScale branch, UTC timestamps, sanitized correlation IDs, and pass/fail outcomes. Do not commit tokens, email addresses, verification links, reset links, refresh tokens, user IDs, or database row contents.

The acceptance remains `BLOCKED` when guest or email acceptance evidence is missing, when any case is not executed, when any protected readiness probe is not `pass`, or when the database branch is `unknown`.

## Native harness

Run `npm run acceptance:adr003` only against the reviewed Worker deployment after the Hyperdrive verifier has passed. The harness requires `DATABASE_READINESS_TOKEN`, `HYPERDRIVE_VERIFIED_MAIN=true`, the expected schema fingerprint/version, a dedicated already-verified email test account, and a web health URL with CSP. It writes only sanitized case outcomes and correlation IDs to `ADR003_EVIDENCE_PATH`; tokens, credentials, emails, row identifiers, verification payloads, and response bodies are never written.

Guest entry, new-user creation, verification delivery, consumed-link replay, and web email flow remain explicit Kyle-owned flags. Mobile email-flow validation is a separate mobile-release gate and does not block web/API production acceptance. Account deletion requires `ADR003_RUN_DESTRUCTIVE_ACCOUNT_DELETION=true` and is not enabled by the workflow default.

Repeat runs may encounter an existing privacy request from an earlier candidate attempt. In that case the harness records a pass only when the API returns the expected fail-closed limit error and the authenticated status endpoint confirms the matching request and an allowed state; unexpected `429` responses still fail acceptance.
