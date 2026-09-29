# Simplified production release runbook

This runbook is for the solo founder operating the canonical release workflow.
The current source of truth is the exact remote `main` SHA and the live GitHub
release/acceptance state. Never reuse an old candidate ID, acceptance run, or
release SHA without rechecking it.

## Before dispatch

1. Confirm the reviewed commit is still the current protected `origin/main`
   SHA and is the merge commit of one reviewed PR.
2. Confirm the exact successful CI, CodeQL, dependency-review, secret-scan,
   and historical-reconciliation run IDs for that SHA.
3. Supply the previous canonical production SHA, or `NONE` only for the first
   canonical release.
4. Set `confirm_production=true`. Set `force_auth_critical=true` only when an
   otherwise standard change should receive the critical ceremony.

The workflow computes `releaseClass`, `changedComponents`, and
`reusedComponents`; there is no manual downgrade switch.
Root `package.json` edits remain critical, while scripts-only edits reuse all
component versions because the resolver proves the dependency graph is
unchanged.

## What happens next

`STANDARD_RELEASE` runs protected source and security checks, provider/schema
compatibility, changed-component candidates, automated readiness, activation,
and production smoke. It does not call Keeper, Gmail, real signup/reset,
human Turnstile, or the acceptance mailbox.

`AUTH_CRITICAL_RELEASE` runs all standard gates, then the protected Coordinator
acceptance. Complete the real Turnstile and mailbox steps in the Keeper page:

```text
Turnstile -> signup -> delivered email -> verification -> replay rejected
-> login/refresh -> resend -> password reset -> session revocation/logout
```

The workflow will not activate until server-derived acceptance evidence is
`PASSED`. The acceptance user is isolated and excluded from product metrics.

## Reuse and resume

The cutover artifact and Release Manifest v2 show every component's version ID,
source SHA, provenance, and status:

- `NEW_CANDIDATE`: built from the current release SHA.
- `REUSED_PRODUCTION`: the exact known-good production version was retained.
- `ACTIVATED`: a changed candidate is serving after final gates.

If a critical human window expires, do not upload duplicates. Recheck that the
recorded candidate/reused IDs, release SHA, source SHA, and expiry are still
valid, then dispatch the same exact release SHA with the current acceptance run
ID when the workflow supports a direct resume. If the old run is expired, the
Coordinator creates a fresh run against the same still-valid candidate set.

## Failure handling

Read `failureDomains` in the manifest and the sanitized cutover artifact.
`TOOLING_FAILURE` and `CERTIFICATION_BLOCKER` need operator/tool follow-up;
they are not evidence that runtime auth is broken. `PRODUCT_BLOCKER` requires
investigating the candidate. `SAFETY_BLOCKER` keeps activation fail-closed.

On a deployment failure, rollback restores only changed components to the
captured positive serving traffic. Zero-traffic candidates are excluded from
rollback. Reused components are not redeployed.

## Live launch gate

Repository integration and green CI do not prove production email delivery.
The open production auth issue (#720) remains a live evidence gate until a
fresh real signup, Cloudflare Email lifecycle observation, verification,
replay, session, resend, reset, and revocation acceptance passes for the exact
candidate set.

## Email incident repair: local verification and approval boundary

The September 2026 repair is an `AUTH_CRITICAL_RELEASE`. Implementation and
synthetic test evidence do not certify the serving release. Do not dispatch a
production migration, synthetic production identity, or activation without the
required approval. Re-read the ledger: migration 0016 being applied does not
prove migrations 0017–0020 are applied. The approved manifest is the canonical
schema identity source; never replace its fingerprint with an observed value.

Migration `0020_auth_recovery_delivery.sql` only extends the outbox purpose
constraint to include `password_changed`. It does not rewrite identities or
passwords. Apply prerequisites in manifest order through the reviewed migration
path, with a read-only preflight and the existing production approval. The
runtime role also needs the narrowly declared audit-intake INSERT grant in
`database/planetscale/grants/roles.sql`. Retain compatible additive schema on
software rollback; never undo a user's verification or password change.

Local checks use disposable PostgreSQL 17, synthetic addresses under
`example.invalid`, an in-process email capture, and local-only Turnstile
fixtures. The rendered Flutter test uses real local HTTPS/cookie transport,
with an ephemeral TLS key outside the checkout; it never contacts production.
OpenSSL and Playwright Chromium/WebKit are required for that test. Browser
viewport emulation is not evidence from an Android/iOS device.

## Recovery semantics

- Login verifies the original raw password, including supported 12–14-character
  credentials. Creation, mailbox-owned setup and reset require 15–128 Unicode
  code points and compromised-password screening. Screening outages fail closed.
- Repeated registration never overwrites a credential. The mailbox owner must
  choose/confirm a password on the intentional verification POST. Following an
  unsolicited GET cannot activate a pre-registrant's password.
- Resend/reset intake always reports a neutral accepted state. Internal outcomes
  are `queued`, `cooldown`, `suppressed`, `support_required`, or `failed` in a
  restricted audit record. A savepoint rolls back partial account-specific work
  before recording `failed`; inability to persist intake must not be accepted.
- Legacy setup uses the existing trusted contact and user ID. Conflicting,
  untrusted, protected or restricted identities require protected support, never
  a bulk update. No account is recreated.
- Existing verification/reset lifetimes remain 30 minutes. Intentional resend
  supersedes prior live challenges after the cooldown; transport retries reuse
  an accepted idempotent operation. GET/HEAD and email previews do not redeem.
- Reset validates the new password before consuming the token, serializes with
  login/refresh, revokes existing authorization, and atomically queues a separate
  password-change notification. Notification failure cannot undo the reset.

## Session rollout

Deploy the backward-compatible API before serving the new app/auth pages.
Native/deployed clients retain the JSON token contract; `cookie-v1` web clients
receive only an in-memory access token and a host-only HttpOnly/Secure/Strict
refresh cookie. Exact allowed origins and the explicit transport header are
required. Never expose refresh credentials in Web Storage. A cached old client
is a compatibility case, not a reason to clear all user storage.

Web refresh is single-flight and coordinated across tabs. Sign-out is global
and labeled accordingly. A failed remote sign-out retains a nonsensitive local
pending marker and refuses to restore the cookie until server logout succeeds.
Native logout can prove the session with its refresh credential even after its
access token expires. A 401 is not proof that revocation completed.
Web Dio must not override `User-Agent`: WebKit otherwise requests permission
for that header in CORS preflight and prevents authenticated app data loading.
Do not expand the production CORS allowlist to accommodate a browser-owned header.

## Sanitized incident diagnosis

Use the existing protected `audit-production-auth-incident.mjs`, Keeper email
health, and canonical observer. Never dump personal rows, request bodies,
stable email indexes, provider payloads or credential-bearing URLs. A support
correlation is safe to locate restricted intake outcomes; it is not public
proof that an account exists.

The incident audit defaults to read-only. Keep `send_probe=false` unless an
owner approves the explicit one-message provider probe; that probe still cannot
certify mailbox receipt or GO. At startup volume, investigate any pending email
older than two minutes, any abandoned five-minute lease, any configuration
failure, or any expired incomplete acceptance run. Use counts and oldest age,
not percentages from tiny samples. These operator thresholds are diagnostic
alerts, not proof that a provider or mailbox failed.

| Observation | Meaning / next action |
| --- | --- |
| Request rejected before intake | Inspect sanitized validation, Turnstile, origin, rate-limit and deadline codes; do not infer account state |
| Intake suppressed/support required | Protected linkage/enforcement review; no public enumeration and no automatic reactivation |
| Intake failed | Partial work rolled back; inspect configuration and sanitized DB/provider categories, then safely retry |
| Queued, no provider acceptance | Check sweep/lease health, scoped-key compatibility, next attempt and challenge validity |
| Unknown provider acceptance | No blind resend; reconcile provider lifecycle first, then deliberate new issuance if needed |
| Provider accepted | Provider message ID exists internally; this is not mailbox receipt |
| Delivered lifecycle | Provider delivery report; mailbox observation remains a separate acceptance gate |
| Bounce/suppression/permanent failure | Preserve suppression; investigate through restricted provider diagnostics |
| Expired/superseded/consumed link | Do not dispatch/reuse it; request an intentional new challenge |
| Correct password, verification required | Complete mailbox-owned setup/resend; do not mislabel it as a password error |
| Userinfo/refresh failure | Bounded retry or sign-out, never a half-authenticated app |

The dispatcher claims one row immediately before its bounded send, up to 25
per sweep. It does not start leases for an entire waiting batch. Provider
acceptance scrubs the encrypted delivery envelope. Definite transient rejection
uses bounded backoff; an abandoned processing lease becomes acceptance-unknown
rather than automatically resending a possibly delivered bearer link.

Before GO, retain exact serving/reused provenance, positive-traffic rollback,
real Turnstile, mailbox receipt at two independent authorized providers, setup,
replay, legacy fixture ID preservation, reset/revocation and post-activation
cached/fresh browser evidence. Missing evidence remains a certification blocker.
