# Native platform secrets inventory

Names only. Values, private keys, tokens, connection strings, and personal
data are never stored in this file or in Git.

## Public API Worker

- `AUTH_PASSWORD_PEPPER_V1`
- `PII_ENCRYPTION_KEY_V1`
- `PII_HMAC_KEY_V1`
- `JWT_PRIVATE_KEY`
- `JWT_PUBLIC_JWKS`
- `JWT_KEY_ID`
- `TURNSTILE_SECRET_KEY`
- `EMAIL_PROVIDER_TOKEN` (only when an external email adapter is enabled)
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

## Admin API Worker

- `ACCESS_SUBJECT_HMAC_KEY`

## Jobs Worker

The jobs Worker uses existing R2 bindings and does not require an object-store
credential or external backup healthcheck token.

## Protected CI and migration environment

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `PLANETSCALE_SCHEMA_READ_DATABASE_URL` (registry-only deployment verification)

The protected manual migration environment, which is not invoked by Worker
deployment, may separately use:

- `PLANETSCALE_ADMIN_DATABASE_URL`
- `PLANETSCALE_PRODUCTION_MIGRATIONS_APPROVED`
- `PLANETSCALE_SERVICE_TOKEN`
- `PLANETSCALE_SERVICE_TOKEN_ID`

Secrets are provisioned per Worker with least privilege. The existing shared
Cloudflare account is constrained by the Lythaus account, zone, and resource
registry. Worker deployment requires the predeployment gate group; final gates
are completed only after live runtime acceptance.
