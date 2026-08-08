# ADR 003 authenticated acceptance

This is the launch-blocking acceptance record for the native Cloudflare/PlanetScale stack. It must run against the exact reviewed Worker deployment and a database routing probe that passes for PlanetScale `main`.

## Required cases

| ID | Acceptance case | Evidence owner |
|---|---|---|
| A01 | Google sign-in | Kyle/manual identity step |
| A02 | New-user creation | automated/manual |
| A03 | Existing-user sign-in | automated/manual |
| A04 | Provider-link lookup | automated |
| A05 | Contact-email write and lookup | automated |
| A06 | Session issuance | automated |
| A07 | Refresh-token rotation | automated |
| A08 | Refresh-token replay rejection | automated |
| A09 | Logout | automated |
| A10 | Session revocation | automated |
| A11 | Profile read and write | automated |
| A12 | Authenticated post submission | automated |
| A13 | Moderation submission | automated |
| A14 | Privacy request submission | automated |
| A15 | Account deletion request | automated |
| A16 | Invalid OAuth state rejection | automated |
| A17 | Expired code rejection | automated |
| A18 | Duplicate callback handling | automated |
| A19 | CORS validation | automated |
| A20 | Mobile and web callback validation | Kyle/manual mobile plus automated web |

## Evidence rules

Record the exact commit SHA, GitHub Actions run ID, Worker deployment versions, Hyperdrive IDs, PlanetScale branch, UTC timestamps, sanitized correlation IDs, and pass/fail outcomes. Do not commit tokens, email addresses, raw OAuth codes, refresh tokens, user IDs, or database row contents.

The acceptance remains `BLOCKED` when the Google or mobile identity step is missing, when any case is not executed, when any protected readiness probe is not `pass`, or when the database branch is `unknown`.

## Native harness

Run `npm run acceptance:adr003` only against the reviewed Worker deployment after the Hyperdrive verifier has passed. The harness requires `DATABASE_READINESS_TOKEN`, `HYPERDRIVE_VERIFIED_MAIN=true`, the expected schema fingerprint/version, a dedicated already-verified test account, and a web health URL with CSP. It writes only sanitized case outcomes and correlation IDs to `ADR003_EVIDENCE_PATH`; tokens, credentials, emails, row identifiers, OAuth payloads, and response bodies are never written.

Google sign-in, provider-link lookup, duplicate callback, web callback, mobile callbacks, and new-user creation remain explicit Kyle-owned flags. Account deletion requires `ADR003_RUN_DESTRUCTIVE_ACCOUNT_DELETION=true` and is not enabled by the workflow default.
