# Lythaus waitlist release runbook

## Architecture

The public Astro site submits to `POST https://api.lythaus.co/api/waitlist` on
the existing `lythaus-public-api-development` Worker. The Worker uses
`DB_APP_FRESH` through Hyperdrive and stores only a deterministic email lookup
HMAC plus AES-GCM ciphertext in PlanetScale PostgreSQL.

The existing control panel reads `GET
https://admin-api.lythaus.co/api/admin/waitlist`. Cloudflare Access protects
the browser and API surfaces. The admin Worker independently verifies the
Access assertion, resolves `identity.admin_memberships`, decrypts approved
email fields, and records `marketing.waitlist_viewed` before returning PII.

No new Worker, database, authentication provider, or hosted waitlist service is
part of this release.

## Migration reconciliation and validation

Do not apply `0009` through `0013` to PlanetScale `main` until all of the
following are complete:

1. Run `npm run reconcile:planetscale-migrations` against the exact target and
   retain its sanitized result. Each migration must be classified as
   `NOT_APPLIED`, `FULLY_APPLIED`, or `PARTIALLY_APPLIED` from catalog evidence.
2. An incremental application is permitted only when the registry is the exact
   canonical `0000` through `0008` prefix and every `0009` through `0013`
   artifact is `NOT_APPLIED`. A partial state requires an individually reviewed
   corrective migration; never rerun a partial canonical migration.
3. Independently validate the exact production target as
   `lythaus/lythaus-core/main`.
4. Validate the complete `0009` through `0013` chain on a PostgreSQL 17
   disposable target using synthetic data.
5. Record a completed, restorable production backup identifier and creation
   time before DDL.
6. Review the relation fingerprint, immutable migration checksums, role grants, rollback
   plan, measured migration usage, and protected-environment approval.
7. Obtain the explicit production migration approval required by the protected
   migration runner.

The runner applies each incremental migration and its insert-only registry row
inside one transaction guarded by an advisory lock. It never updates a recorded
checksum. The bootstrap path remains limited to an empty database and records
the early migrations when `0004` creates the registry.

## Waitlist retention

Lythaus applies the approved product policy below. It is not a statutory
retention claim.

- `waiting` and `invited`: retain for at most 24 months from signup.
- `converted`: remove the waitlist-specific record within 30 days of conversion.
- `unsubscribed` or withdrawn: remove recoverable waitlist PII within 30 days.
- An active legal hold suspends deletion until it is released.

`marketing.waitlist_signups` stores the due date and legal-hold state without
recording plaintext email, IP address, user agent, or Turnstile token. The
existing daily retention workflow deletes only due, unheld records through the
privacy database binding and logs a count, never identifiers or PII.

## Turnstile

Create one production managed widget only after confirming no equivalent
widget exists in Cloudflare account `e5b7ae46e04698f507b7e4b3d4ef1af0`.

- Display name: `Lythaus Website Waitlist`
- Production hostnames: `lythaus.co` and `www.lythaus.co`
- Expected action: `waitlist_signup`
- Marketing build variable: `PUBLIC_TURNSTILE_SITE_KEY`
- Public Worker secret: `TURNSTILE_SECRET_KEY`
- Public Worker variable: `TURNSTILE_EXPECTED_HOSTNAMES`

Both production hostnames were active marketing Pages domains during the
2026-08-14 inspection. Reconfirm this immediately before widget creation and
remove `www.lythaus.co` if it is no longer canonical. Use Cloudflare's published
test keys for local development. Never commit or expose the production secret.

After creation, add the widget's sanitised identifier and lifecycle status to
`infrastructure/lythaus-resource-registry.json` in the reviewed release change.

## Cloudflare Access

Retain the existing Access applications for `admin.lythaus.co` and
`admin-api.lythaus.co`. The UI application must permit only approved Lythaus
administrators. The API application must continue forwarding a valid
`Cf-Access-Jwt-Assertion` whose audience, issuer, and signature match the
existing admin Worker configuration.

Do not add a login form, API bearer token, or browser token persistence. Verify
an administrator can open `/waitlist` and that a non-member receives `403` from
the API after Access authentication.

## Secrets and variables

Provision through the existing Cloudflare secret process. Do not print values.

- Public Worker: `TURNSTILE_SECRET_KEY`, `PII_HMAC_KEY_V1`,
  `PII_ENCRYPTION_KEY_V1`
- Admin Worker: `PII_ENCRYPTION_KEY_V1`
- Marketing Pages build: `PUBLIC_API_BASE_URL=https://api.lythaus.co`,
  `PUBLIC_TURNSTILE_SITE_KEY=<production site key>`

The admin Worker does not need `PII_HMAC_KEY_V1` for this read-only route.
`ACCESS_SUBJECT_HMAC_KEY` remains required for administrator membership lookup
and is unrelated to waitlist email deduplication.

## CORS and caching

The public Worker allowlist is limited to `https://lythaus.co`,
`https://www.lythaus.co`, and `https://app.lythaus.co`. The admin Worker
allowlist remains `https://admin.lythaus.co`. Local origins are development
configuration only.

Public waitlist responses use `Cache-Control: no-store`. Admin waitlist
responses use `Cache-Control: private, no-store`. Hyperdrive query caching
remains disabled for both Workers.

## Edge abuse control

The Worker enforces five submission attempts per minute per
HMAC-pseudonymised abuse subject and requires Turnstile. If the existing
Cloudflare plan includes route-level rate limiting at no new cost, add a rule
scoped only to `POST api.lythaus.co/api/waitlist` with a conservative threshold
and documented rollback. Do not add a paid feature or broaden the rule without
explicit cost approval.

## Release sequence

1. Merge the reviewed code and migration.
2. Capture the production backup anchor, reconcile, and validate the PlanetScale migration chain.
3. Apply the approved migration through the exact-SHA protected production runner.
4. Verify the exact `0013` registry checksum, relation fingerprint, indexes,
   and grants with read-only checks.
5. Provision the Turnstile widget, Worker secrets, and Pages build variables.
6. Deploy the exact merged `main` SHA through the existing workflows.
7. Complete one new signup and one duplicate signup without logging PII.
8. Confirm only one row exists by HMAC lookup through an approved database
   verification path.
9. Open `https://admin.lythaus.co/waitlist` as an authorised administrator and
   confirm the email, counts, pagination, no-store header, and
   `marketing.waitlist_viewed` audit event.
10. Confirm an unauthorised Access identity cannot obtain the list.
