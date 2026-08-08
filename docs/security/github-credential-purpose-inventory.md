# GitHub credential purpose inventory

This inventory records names, scopes, current consumers, and decisions only.
Secret values, tokens, passwords, private keys, and connection strings are
never recorded.

## Verified retained credentials

| Name or group | Scope | Current consumer and purpose | Decision |
| --- | --- | --- | --- |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` | Repository Actions | Native Worker and Lythaus Pages deployment workflows for the approved Cloudflare account | Retain |
| `CLOUDFLARE_AUDIT_API_TOKEN` | Repository Actions | Read-only Cloudflare domain/resource audit workflow | Retain |
| `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` | Repository Actions | Cloudflare Access-protected admin/API acceptance smoke checks | Retain |
| `PLANETSCALE_SCHEMA_READ_DATABASE_URL` | Production environment | Read-only PlanetScale schema and migration gate verification | Retain |
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | Repository Actions | Android release signing and keystore validation | Retain |
| `GOOGLE_SERVICES_JSON` | Repository Actions | Firebase Messaging/Crashlytics configuration for the mobile release build; not authentication | Retain |
| `K6_SMOKE_TOKEN` | Repository Actions | Authenticated load/smoke test harness | Retain |
| `MVP_SMOKE_EMAIL`, `MVP_SMOKE_PASSWORD` | `dev` environment | Synthetic email-authenticated acceptance checks | Retain |
| `MVP_PRIVACY_ADMIN_EMAIL`, `MVP_PRIVACY_ADMIN_PASSWORD` | `dev` environment | Synthetic privacy-admin acceptance checks | Retain |

## Conditional or owner review required

`STAGING_DOMAIN` and `STAGING_SMOKE_TOKEN` are read by optional live contract
and privacy integration tests, but no current workflow invokes those tests.
Retain them only if live-contract acceptance remains an approved release gate;
otherwise delete them in a separate GitHub administration action.

The following names have no current consumer in tracked workflows, scripts, or
tests and are not treated as retained credentials: `ALPHA_REPORT_ADMIN_TOKEN`,
`CLIENT_IP`, `ALPHA_RELEASE_ADMIN_TOKEN`, and the `ORIGIN_GATEWAY_TOKEN*`
variants. Delete them only after owner approval.

No values were read. Valid non-Azure credentials are not deleted by this
repository PR merely because their names are unfamiliar.
