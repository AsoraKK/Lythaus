# Optional PWA passkeys

This cloud reconstruction adds optional passkeys alongside email/password and
guest access. It starts from main `115da92f0918ac4a19fdeb45889c00ff4db65687`;
the uncommitted PC implementation was unavailable. Reconcile that implementation
if recovered. This branch does not enable the feature or authorize deployment.

## Configuration and schema handoff

`PASSKEYS_ENABLED` defaults off. With it off, capabilities returns
`enabled:false` without reading passkey tables. No provider configuration is
changed by this branch. Future activation requires an explicitly reviewed
`PASSKEY_RP_ID`, exact HTTPS origins in `PASSKEY_ALLOWED_ORIGINS`, and the same
origins in existing `CORS_ALLOWED_ORIGINS`. RP IDs are restricted to `lythaus.co`
or its subdomains; each allowed origin must belong to that RP boundary. Choose
the RP ID before enrolling credentials: changing it does not migrate keys.

`database/planetscale/proposals/optional-passkeys.sql` is an **unnumbered proposal**,
tested only against disposable local PostgreSQL 17. The parent must reconcile
the current canonical migration sequence and other lanes before assigning its
number and registering it with the schema validator. Do not reuse `0017`, apply
production DDL, or enable this feature before approved schema/role deployment.

The proposal contains three identity tables: stable random RP user handles,
credentials/public keys, and five-minute challenges. Credential tombstones
prevent re-enrolling the same raw credential ID. Deleting email credentials
cascades to their passkey data. Runtime grants permit normal ceremonies and
expired-challenge cleanup; privacy grants permit export/deletion without DDL.
A password-reset consumption trigger revokes all existing passkeys and pending
owner ceremonies, including when the feature is disabled. Parent integration
must retain this recovery trigger. The current Jobs account deletion removes
email credentials and therefore cascades these rows; full privacy export and
data-location inventory updates for passkey metadata must be reconciled with
the schema/profile lane before activation. Pending challenge binding hashes
and public-key material must not appear in ordinary credential list responses.

API logic is isolated in `passkey-runtime.ts`, cryptography in
`packages/security/src/passkeys.ts`, and persistence in `packages/db/src/passkeys.ts`.
OpenAPI lives in `api/openapi/passkeys.yaml` with root references. Generated
OpenAPI/Dart snapshots are included because CI checks them. Coordinate root
specification, generated files, Public API session extraction, auth providers,
and lockfile changes with the profile/auth lanes; regenerate snapshots once
after their source changes are reconciled. Flutter uses a dedicated
`passkey_service.dart` auth-service part and an injectable platform bridge.

## Security and recovery behavior

SimpleWebAuthn server `14.0.3` verifies registration and authentication;
browser `14.0.0` is copied from the exact lockfile dependency into the release
artifact, served locally, and loaded before Flutter. No external script CDN is
introduced. The standard web build bundles the renderer and browser client;
its npm workspace dependencies must be installed from the frozen root lock
first. CI installs them before compiling the immutable Flutter artifact.

Every ceremony requires an authorized exact Origin and `cookie-v1` transport.
Registration requires a current verified active account and password proof;
enrollment and maintenance challenges bind to the access token and token
version. Anonymous login binds to a five-minute HttpOnly Secure SameSite=Strict
host cookie. An atomic, committed challenge update enforces expiry and one use;
a failed verification consumes its challenge. User/credential locks serialize
login with recovery and revocation. Management is owner-scoped, names are
bounded, and active credentials are limited to ten per account.

Cryptographic verification checks challenge, RP ID, origin, signature and user
verification, and rejects cross-origin/embedded client data. Discoverable login
requires the exact random user handle; owner-bound maintenance may omit it, but
rejects any other handle. Device biometric or PIN verification is acceptable.
Attestation is `none`: no biometric data is collected and no unique-human or
device-authenticity claim is made. Single-device counter regressions fail;
synced passkeys may have zero/nonmonotonic counters while retaining signature,
origin, challenge and UV checks. Stored counters never decrease.

Login issues the existing session/refresh-family flow. Browser access tokens
remain in memory and refresh tokens in HttpOnly cookies. Removal requires the
current password, revokes all sessions/families, increments token version, and
returns to sign-in. Password reset similarly removes passkey access. Email and
password, recovery links and guest access remain available; unsupported/native
clients or failed availability checks hide the optional controls.

## Reputation seam

Verified enrollment and explicit maintenance append idempotent
`security.strong_auth_evidence` account events with `passkey-evidence-v1` schema,
the canonical policy version (`reputation-v2.0.0` on this base), method, timestamp,
source/action key and **zero points**, marked `owner_review_pending`. Setup uses
one shared account key; maintenance uses one shared account/month key, rather
than per-credential awards. A policy/source unique index prevents repeats and
remove/re-add farming. Ordinary logins do not create maintenance evidence.
Account-event retention can remove old observations; any future reward consumer
must deduplicate the stable source key in the canonical reward persistence
layer rather than treating a new audit-row ID as a new earning opportunity.

UTC is the evidence observation period, not a newly activated rewards timezone.
The historical device setup 200, strong-auth setup 400 and monthly
authenticator-or-passkey shared 50 are baselines under redesign, not awards
enabled here. There is no new earning engine, weight change or dependency on
the unavailable `recordRewardSource` prototype. The parent must reconcile the
shared authenticator/passkey source contract and owner-approved weights before
any reward consumer is enabled.

## Reproducible local verification

Activate `/workspace/.lythaus-tools/activate.sh`; use the retained tools rather
than bootstrapping. Create a fresh local database whose name begins
`lythaus_auth_test`, run the existing canonical PostgreSQL 17 baseline validator
against it, then apply the proposal only there. Set
`PLANETSCALE_PG17_TEST_DATABASE_URL` to that explicitly local database. The test
fixture refuses remote or non-disposable targets and cleans up synthetic users.
The PostgreSQL CI job separately prepares an isolated `lythaus_auth_test`
database, applies the canonical baseline and then this local-only proposal,
and runs the existing authentication/email tests together with passkey tests.
The canonical baseline/schema registry and production migration paths remain
unchanged. Native dependency review verifies workspace membership and exact
workspace metadata in the changed root npm lock, retaining full transitive
review and rejection of mismatched or missing locks.

```bash
node --experimental-strip-types --test packages/security/tests/passkeys.test.mjs tests/contract/passkeys-contract.test.mjs
node --experimental-strip-types --test --test-concurrency=1 apps/lythaus-public-api/tests/passkeys.postgres.mjs
flutter test --no-pub test/features/auth/application test/features/auth/presentation test/features/auth/domain
bash scripts/cf-pages-build.sh
node --experimental-strip-types --test --test-concurrency=1 --test-timeout=180000 scripts/tests/flutter-passkeys.browser.mjs
node --test --test-timeout=120000 scripts/tests/flutter-auth.browser.mjs
```

The security tests cover malicious origins/RPs, altered signatures/challenges,
UV, user-handle ownership, synced counters and zero-point events. PostgreSQL
tests exercise real transactions, concurrent replay, expiry, stale sessions,
wrong owners/passwords, recovery, privacy deletion, restricted roles and
idempotent setup/monthly evidence. Chromium desktop/mobile use a synthetic CDP
CTAP2 authenticator against the actual Flutter release, real passkey handler,
library and local database. Email/JWT/feed responses in that browser harness
are synthetic; it does not establish production email/signup acceptance.
Screenshots and accessibility state are emitted under `AUTH_QA_DIR` (default
`/tmp/lythaus-passkey-qa`). The existing email fallback harness also runs on
Chromium and WebKit. In the retained cloud environment only, the documented
Playwright host-library precheck override still requires real browser launch
and every assertion to pass.

Review with `flutter analyze`, native typecheck/architecture/Worker validators,
OpenAPI lint/bundle/client validation, frozen-homepage tests, dependency audit
and the existing critical coverage gate. Owner mailbox setup and real signup,
email delivery and recovery acceptance remain pending. No actual owner
passkey was enrolled or removed. Parent-controlled merge, schema approval and
exact-SHA owner-testing release remain separate gates.

Library behavior follows the primary [SimpleWebAuthn server documentation](https://simplewebauthn.dev/docs/packages/server)
and [WebAuthn specification](https://www.w3.org/TR/webauthn-3/).
