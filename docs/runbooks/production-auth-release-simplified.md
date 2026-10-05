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
4. Set `confirm_production=true`. Set `release_mode=force_auth_critical` only when an
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

The certified authentication path will not activate until server-derived
acceptance evidence is `PASSED`. The acceptance user is isolated and excluded
from product metrics.

## Owner-directed initial app test (uncertified)

For the owner-authorized first live test from the ordinary `app.lythaus.co`
signup/recovery screens, select `release_mode=owner_testing` on the
canonical `production-release.yml` dispatch, keep `acceptance_run_id` empty,
and explicitly set `confirm_production=true`. The computed release class must
remain `AUTH_CRITICAL_RELEASE`; the input is not a downgrade or certification
bypass. Exact-main source/security evidence, provider/schema checks, protected
environment approvals, candidate readiness, rollback, activation, and public
production smoke remain required.

Owner testing is restricted to the existing authentication deployment. Both
production entrypoints reject a configured authenticity beta release receipt
before provider mutation, using only a presence boolean in evidence. Turnstile
and email lifecycle checks run in verify-existing mode: missing widgets, queues
or subscriptions and configuration drift stop the release without creating or
patching resources. Existing transactional-email encryption keys are preserved;
key bootstrap and coordinator key changes are prohibited in this mode. Normal
candidate code/credential binding, Worker traffic activation and the existing
admin route remain deployment operations requiring separate owner approval.
Activating Jobs resumes live queue/cron work; rollback cannot reverse delivered
emails or completed background work.

Candidate probe artifacts retain sanitized expected and observed Worker version
IDs and release tags, service/path, HTTP status and Cloudflare Ray ID before
rejecting a mismatch. The Cloudflare inventory includes the read-only custom
domain mapping for `admin-api.lythaus.co`; inspect this evidence before diagnosing
an override failure as propagation. Identity, private Public-binding and Access
checks remain fail-closed. The Admin probe permits five readiness attempts with
2/4/6/8-second delays only when a healthy response identifies a positive-traffic
Admin version and its exact source tag from the captured predeployment snapshot,
and its private Public binding already identifies the exact Public candidate.
All attempts retain sanitized expected/observed identities and retry reasons.
Only the exact candidate version and source tag can pass; a persistent prior
version exhausts the bound and triggers the existing rollback. Unknown or missing
identities, incorrect Public bindings, schema failures and Access rejection fail
immediately. Cloudflare documents that an override can fall back to normal traffic
while a deployment becomes available globally:
https://developers.cloudflare.com/workers/versions-and-deployments/version-overrides/.
This evidence is consistent with propagation, not proof of it. Do not retry the
whole release blindly or change routing based on an unverified mapping.

Failed owner-testing releases still publish their canonical manifest and integrity
digest. A rolled-back release retains `ROLLED_BACK`, the original failure domains
and `NO-GO`; only a completed owner-test activation and smoke can report
`DEPLOYED_UNCERTIFIED`. Authentication acceptance remains `OWNER_TEST_PENDING`.

The local real browser/handler test requires disposable PostgreSQL 17, a built
marketing artifact and the canonical Flutter web artifact. It routes all browser
hosts through a local TLS proxy, uses the actual API handlers and restricted
database roles, and replaces only Turnstile/password screening/email providers
with synthetic fixtures. Run it with an explicitly local
`PLANETSCALE_PG17_TEST_DATABASE_URL` whose database name begins
`lythaus_auth_test`, `AUTH_WEB_ARTIFACT_DIR` pointing to the web artifact, and
`node --experimental-strip-types --experimental-test-module-mocks --test --test-concurrency=1 --test-timeout=180000 apps/lythaus-public-api/tests/auth-journey.browser.mjs`.
Use a dedicated fixture database and run email-relay suites separately against
it so independent synthetic encryption keys cannot claim each other's outbox.
This proves local cookie handoff and retry behavior, not production mail delivery.
For an already installed WebKit executable, `WEBKIT_EXECUTABLE` may select its
local wrapper when the workspace provides shared libraries outside the system
library cache. No production hosts are contacted by this fixture.

A trusted browser logout retry with no refresh cookie acknowledges
`sessionRevocation=no_browser_session` and expires the device cookie without
changing any account or recording an account revocation. This lets an
interrupted logout finish after the browser applied the successful response's
cookie deletion. Missing or untrusted origins, malformed/duplicate cookies,
native credentials, and refresh requests keep their existing validation.

The public signup and recovery handlers do not consult acceptance mailbox
secrets or recipient/domain allowlists. Production email bindings in source
restrict only the sender to `no-reply@mail.lythaus.co`; this is not a recipient
restriction. `AUTHENTICATED_ACCEPTANCE_PROVEN` is protected readiness evidence,
not a public signup admission flag. ADR003 manual attestations and dedicated
mailbox credentials belong to acceptance execution; authenticity cohort
allowlists govern the separate private authenticity APIs.

Source configuration does not prove live sending permission. Cloudflare's
[sending limits](https://developers.cloudflare.com/email-service/platform/limits/)
allow arbitrary recipients after a sending domain is onboarded, subject to
account quotas; before onboarding, only verified destinations are available.
[Send binding restrictions](https://developers.cloudflare.com/email-service/configuration/send-bindings/)
can separately constrain recipients. Inventory evidence that retains only
binding name/type/presence cannot establish those live restrictions. An enabled
domain record, local fixtures, or a no-send audit cannot certify mailbox
delivery or general availability.

This path does not create or activate a Keeper/coordinator candidate, does not
require either `CODEX_TEST_EMAIL` mailbox secret, and does not send a test email
or create an account. Only the owner enters private email/password data through
the ordinary public Lythaus UI. The release manifest must remain `NO-GO` with
`authAcceptance.status=OWNER_TEST_PENDING` and no acceptance run ID; after
successful deployment/smoke it may record `DEPLOYED_UNCERTIFIED`. This is
deployment readiness for owner testing only, not proof of mailbox delivery or
authentication certification. Keep issue #720 open and complete the separate
certification journey—including the independent second-mailbox-provider
requirement—before any certified GO claim.

The initial restoration requires two authorized mailboxes on independent
providers. `CODEX_TEST_EMAIL` remains the primary protected secret;
`CODEX_TEST_SECONDARY_EMAIL` supplies the second authorized mailbox to the
Coordinator only. No mailbox password is required or stored. Do not create an
account at a new email provider or send to an unapproved address. The current
reviewed MX classifier supports Google/Workspace and Microsoft/Outlook; other
or mixed MX families fail closed until explicitly reviewed. Two domains hosted
by the same provider are not independent. DNS classifies the provider only;
it does not prove delivery or inbox placement.

The resend fixture uses the second mailbox and starts as an isolated
`relink_required` identity with trusted contact linkage and no credential.
Mailbox-owned setup must preserve that ID, then candidate userinfo and logout
are verified before its completion event is recorded. Wait for the genuine
30-second resend cooldown and complete a fresh Turnstile challenge; the
coordinator never backdates a token to evade the cooldown.

Mailbox links contain only a random opaque context, purpose and one-time
credential in the fragment. Release/version/rollback metadata stays encrypted
in the ledger and on the authenticated server-side candidate path, never in
an email link. Completed evidence includes server-observed distinct MX provider
classes, delivered lifecycle records and consumed challenges for both mailboxes.
An operator must still observe actual messages in those authorized mailboxes;
no neutral HTTP response or DNS observation substitutes for receipt. Negative
tests require the precise token/credential rejection, not a 429/5xx response.
Expired runs cannot produce passing observer evidence, even if marked completed.

The stricter v2 evidence reader now requires `mailboxProviders` on passing
observations. Historical observations without it do not certify this restoration.
No existing challenge, lifecycle, chronology or outbox-count check is relaxed.
Acceptance and lifecycle timestamps in the outbox are database-clock observations
of the provider response/event, not claims about an SMTP server's internal clock.
Using one clock prevents cross-host clock skew from inventing backwards delivery
chronology. Credential completion time comes from the atomic token consumption;
the later coordinator observation is checked separately. No timestamp is backdated
or replaced with a fixture value to make production evidence pass.

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
The existing admin observer needs SELECT on the random outbox `correlation_id`
for its run filter; it does not receive token-hash or product-PII access.

Read-only baseline on 2026-09-29: production PostgreSQL 17.11 has one `main`
branch, migration ledger 0000–0016, 97 relations, and fingerprint
`6bb63d99dfe7ff8da6885e1a578b2128c3df65777ffe1bdbd1219ec796aa5099`.
The runtime relation/ledger algorithm and every approved checksum matched.
The transactional email outbox had zero rows; all ten acceptance records had
expired (seven still labeled pending, three labeled expired). No row-security
filter obscured those two counts. These are dated diagnostic observations,
not current release certification. Requery before rollout. Production DDL,
test identities/mail and traffic activation were not performed by this repair.

Local checks use disposable PostgreSQL 17, synthetic addresses under
`example.invalid`, an in-process email capture, and local-only Turnstile
fixtures. The rendered Flutter test uses real local HTTPS/cookie transport,
with an ephemeral TLS key outside the checkout; it never contacts production.
OpenSSL and Playwright Chromium/WebKit are required for that test. Browser
viewport emulation is not evidence from an Android/iOS device.
The canonical web build bundles CanvasKit with `--no-web-resources-cdn`.
The browser gate rejects an artifact that still depends on Google's renderer
CDN before attempting sign-in; do not whitelist that external dependency in
the isolated test or substitute a different local artifact.
Flutter 3.41.1's WebKit semantics host can be offset outside the viewport even
when the canvas looks correct. The app-only `flutter-semantics.css` anchors it
at the view origin, matching the [upstream engine fix](https://github.com/flutter/flutter/pull/190486).
Keep this compatibility rule until the pinned engine contains the fix and the
unforced pointer/keyboard browser matrix proves it is unnecessary. No SDK
upgrade, forced control click, or marketing homepage style change is used.

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
- `support_required:<reason>` distinguishes `protected_administrative_identity`,
  `missing_contact_data`, `unsupported_contact_key_version`,
  `credential_contact_mismatch`, `missing_trusted_legacy_linkage`,
  `decrypted_address_lookup_mismatch`, and `request_contact_lookup_mismatch`.
  These fixed internal codes use the existing restricted audit `reason_code`
  column; the anonymous response always remains `reset_if_eligible`.
- The ordinary reset form displays the server-generated `correlationId` on
  accepted requests and JSON errors. Completed idempotent retries return the
  original operation's reference. The reference grants no access and contains
  no account data. Predeployment generic `support_required` records cannot
  establish a branch or identify a request from aggregate timestamps.
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

Keeper invitation/resend must also use the scoped delivery envelope. The Admin
Worker's private `AUTH_EMAIL_ENVELOPE` service binding targets the existing
Public Worker's named `AuthEmailEnvelope` entrypoint. Public rechecks the active
administrative membership and performs the identity/token/scoped-envelope/outbox
transaction with its existing runtime grants; failure rolls everything back.
Admin never needs password-table grants or product keys for these operations.
No email-encryption key is copied to Admin,
no general PII key is given to Jobs, and no anonymous HTTP route is added.
Candidate requests forward only the Public version override and reject a
mismatched version response. Before activation, the protected release must
prove the named binding resolves against the reviewed Public candidate. An
unavailable entrypoint is a release blocker, not permission to activate Public
early. Rollback to an older Public version without this entrypoint leaves the
Admin action explicitly unavailable (503), never falsely queued.


The v8 contract deliberately changes new-password creation and intentional
email verification: creation/reset require at least 15 Unicode code points,
and verification POST requires the mailbox owner's chosen password. Do not
claim those operations are compatible with old forms or make that password
optional to accommodate them. Stage the v8 API and matching verification/reset
pages together through the canonical acceptance process. After approval,
activate the API before publishing the matching app/auth pages, then verify
both fresh and cached entrypoints. Old verification pages must present a safe
retry/update path; they must never activate a pre-registrant's credential.
Existing login, omitted login mode, and native JSON session transport remain
compatible; stored 12–14-character passwords must still authenticate.

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
Sign-in shows its busy state before device-integrity evaluation. The auth
preflight has an eight-second deadline and fails closed with a retry message;
a late result, double-click or disposed screen must not initiate a login.
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

If the incident audit reports `permission denied`, do not replace the verifier
credential with the admin credential or grant table-wide SELECT. Its shared
query/grant contract is `scripts/ci/auth-incident-database-contract.mjs`.
After protected review and merge, dispatch
`planetscale-schema-verifier-grants.yml` with the exact current `main` SHA and
approve its `production` environment job. This reconciles only metadata and
listed aggregate columns; it neither applies pending migrations nor deploys
Workers. It executes the actual incident queries using the read-only verifier
before reporting success. Then rerun `production-auth-incident-audit.yml` with
`send_probe=false`. Local PostgreSQL regression tests must prove both successful
aggregates and denied access to every unlisted column before any grant rollout.

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

Prompt transactional-email dispatch is prepared behind
`TRANSACTIONAL_EMAIL_DISPATCH_ENABLED`; absence or any value other than `true`
keeps publishing and consuming dispatch hints off. No deployment configuration,
binding, provider resource, secret, grant or cron change accompanies this code.
The proposed producer binding reuses `lythaus-email-lifecycle-dev` only after
explicit capability/inventory approval. Provider lifecycle events keep their
existing parser; internal hints have a distinct type, opaque outbox UUID and
HKDF/HMAC signature derived from the existing delivery key. They carry no
recipient, message content or bearer token. Publish occurs after commit; the
database remains authoritative if publishing fails. Duplicate hints claim the
same due row at most once, and explicit transient failures request a delayed
Queue retry using database `next_attempt_at`. Unknown acceptance remains
terminal; an expired or superseded challenge cannot be delivered.

The proposed measurable healthy-path target is p95 first dispatch within ten
seconds of persisted intent, measured separately from provider acceptance and
inbox arrival. This target is not live-verified. The existing quarter-hour cron
remains the recovery path in this patch; a lost publish can still wait for that
tick. A separately approved mail-only minute fallback can reduce that residual
wait without increasing other Jobs workloads. Do not claim a hard latency
guarantee, activate the flag, add bindings or change scheduling without parent
review, exact-head fixture/security checks and canonical release gates.
