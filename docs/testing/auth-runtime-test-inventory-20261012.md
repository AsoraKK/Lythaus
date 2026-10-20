# Auth runtime test inventory — 12 October 2026

Base source: `6647e269ba379a53232922d50d0aadba7136230d` (`origin/main` and the
owner-testing release SHA). This inventory runs only synthetic local fixtures.
It does not certify live provider delivery, owner acceptance, deployment or
production authentication.

## Scope

The delegated auth lane covers signup, verification/resend, recovery, session
rotation/expiry/revocation, interrupted requests and redacted traces. The
repository's existing `SEC-01/02/03/11/12` entries in
`docs/testing/monthly-reputation-acceptance.md` describe monthly reputation and
personhood controls. This inventory follows the auth behaviors in the delegated
scope and does not reassign those identifiers.

The executable native Worker coverage is kept in the existing auth-owned
`apps/lythaus-public-api/tests/auth-failure-paths.workerd.mjs` harness. It runs
the real Public Worker in Workerd, connects its database adapter to disposable
loopback PostgreSQL 17, intercepts password-screening and Turnstile requests,
denies every other outbound request, and never sends email. The test reads only
synthetic encrypted outbox envelopes using the fixture's ephemeral key.

## Scenario inventory

| Behavior | Executable coverage |
| --- | --- |
| Signup creates one pending identity and one current verification proof; idempotent replay does not revalidate providers or create another proof | `auth-failure-paths.workerd.mjs`: “signup replay, resend replay, stale proof, verification replay, and sign-in retain contract boundaries” |
| Resend is idempotent; stale, superseded and consumed verification proofs fail; verified credentials replace the pre-registration password | Same native Worker case; PostgreSQL detail in `auth-journey.postgres.mjs` |
| Recovery creates an encrypted reset intent; completion changes the password, consumes the proof, and revokes existing refresh and access authorization; expired and replayed reset proofs fail | `auth-failure-paths.workerd.mjs`: “native Worker recovery, rotation, expiry, revocation and account isolation”; `auth-journey.postgres.mjs` |
| Refresh rotation issues a replacement; reuse revokes the family; expired refresh tokens fail; logout invalidates the account's access and refresh tokens | Same native Worker case; `auth-session-runtime.test.mjs`; `auth-account-transaction.postgres.mjs` |
| One account's reset/logout does not invalidate another account's sessions | Same native Worker case, with two independent synthetic accounts |
| A completed signup response discarded by the fixture and retried with the same idempotency key creates one identity, proof and outbox intent | `auth-failure-paths.workerd.mjs`: “discarded signup response replays one intent and Worker traces omit private values.” The fixture consumes and drops the response after Worker completion; it tests a retry after an ambiguous client outcome, not a socket interruption during handler execution. |
| Runtime errors expose safe status/code only; structured Worker traces omit email, passwords, tokens and arbitrary payload fields | Same native Worker case plus `auth-password-screen.workerd.mjs` and `auth-journey.postgres.mjs` trace assertions |
| Screening and Turnstile network, redirect, malformed-body, timeout and action failures fail closed without account or email persistence | `auth-failure-paths.workerd.mjs`; `auth-password-screen.workerd.mjs` |
| Auth rate limits use the existing ten-request, sixty-second policy and reset at the UTC minute boundary | `auth-failure-paths.workerd.mjs`: “the Public Worker enforces ten auth requests and resets at the minute boundary” |

Existing PostgreSQL coverage also exercises login/reset/refresh row-lock races,
registration address claims, durable queue recovery, resend after old delivery
states, and transactional email lifecycle replay. Existing unit coverage checks
the policy adapters, idempotency states, session runtime and cookie/native
transport.

## Local execution

Use a fresh PostgreSQL 17 database whose name starts with `lythaus_auth_test`,
bound only to loopback. The database must have the canonical migration baseline
and grants. `scripts/ci/validate-planetscale-postgres17.mjs` applies and verifies
the approved local baseline; it must never be pointed at a hosted database.

```sh
PLANETSCALE_PG17_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:<port>/lythaus_auth_test_lane?sslmode=disable \
  node scripts/ci/validate-planetscale-postgres17.mjs

PLANETSCALE_PG17_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:<port>/lythaus_auth_test_lane?sslmode=disable \
  node --test --test-timeout=60000 apps/lythaus-public-api/tests/auth-password-screen.workerd.mjs

PLANETSCALE_PG17_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:<port>/lythaus_auth_test_lane?sslmode=disable \
  node --test --test-timeout=180000 apps/lythaus-public-api/tests/auth-failure-paths.workerd.mjs

PLANETSCALE_PG17_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:<port>/lythaus_auth_test_lane?sslmode=disable \
  node --experimental-strip-types --experimental-test-module-mocks --test --test-concurrency=1 --test-timeout=180000 \
  apps/lythaus-public-api/tests/auth-account-transaction.postgres.mjs \
  apps/lythaus-public-api/tests/auth-journey.postgres.mjs

node --experimental-strip-types --experimental-test-module-mocks --test \
  apps/lythaus-public-api/tests/auth-intake-runtime.test.mjs \
  apps/lythaus-public-api/tests/auth-session-runtime.test.mjs \
  apps/lythaus-public-api/tests/auth-session-transport.test.mjs \
  apps/lythaus-public-api/tests/auth-account-transaction.test.mjs \
  apps/lythaus-public-api/tests/auth-recovery-policy.test.mjs \
  apps/lythaus-public-api/tests/auth-runtime-policy.test.mjs \
  apps/lythaus-public-api/tests/auth-email-dispatch-queue.test.mjs
```

The failure-path harness is already included in
`.github/workflows/native-planetscale-ci.yml`; no shared workflow or package
manifest change is needed for these additions. Current contract limits remain
unchanged: access token 900 seconds, refresh session 30 days, verification and
recovery proofs 30 minutes, and the existing 30-second resend cooldown. This
inventory adds no policy threshold.

## Evidence state

Final local evidence on the candidate worktree based on the exact source SHA
above:

- Local PostgreSQL baseline: PostgreSQL 17.11, all 20 approved migrations
  through `0020_auth_recovery_delivery.sql`, 103 application relations, 102
  tables, and migration/grant verification passed.
- Native auth failure-path Workerd suite: 7/7 passed, zero skipped. This
  includes the recovery, session, isolation, discarded-response, and
  request-correlated trace cases plus the provider-failure and rate-limit cases.
  Synthetic negative cases reject missing or mismatched correlation, leaked
  uncorrelated records, and unapproved trace fields without echoing payloads.
- Native password-screening Workerd suite: 1/1 passed, zero skipped. The
  existing Cloudflare fetch fix remains compatible with native Worker fetch.
- Auth policy, intake, recovery, session and transport unit suite: 43/43
  passed, zero skipped.
- PostgreSQL account-transaction and auth-journey suites: 30/30 passed, zero
  skipped.
- `npm run typecheck:native` and `git diff --check`: passed.

No residual backend defect reproduced, so this slice changes only the
auth-owned Workerd test harness and this inventory. Synthetic fixtures blocked
all unrecognized provider requests; no account or message was created outside
the disposable local test database. The final candidate commit SHA and fresh
pull-request CI result are reported by the handoff after publication.

## Protected acceptance harness update — 20 October 2026

The current auth acceptance coordinator and evidence parser now bind the exact
public/admin/jobs/coordinator dependency versions and provenance, require
provider lifecycle evidence plus receipts from two independently observed
mailbox providers, and cover an aged 25-hour verification fixture, an immediate
resend cooldown with zero new outbox rows, resend after the cooldown, and
two-account session isolation. The fixture ages a token in the test database;
it does not model a person waiting 25 hours. Synthetic coordinator tests are
deliberately prevented from producing a live `PASSED` observation when their
mocked Cloudflare lifecycle subscription is incomplete.

The integration test also exercises a concrete coordinator defect: after
password reset, account switching attempted primary sign-in with the old
password. It now uses the new password for that sign-in and separately verifies
that the old password fails. This is covered with different old and new test
passwords.

These additions produce sanitized v3 evidence only after a protected live
observer succeeds. Local fixtures, unit tests and the harness itself do not
certify real mailbox acceptance. Issue #720 remains the source of the
production approval blocker; see the ADR-003 runbook for its latest recorded
status and the protected operator procedure.
