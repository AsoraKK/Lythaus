# Authentication acceptance — 25 October 2026

This is local implementation evidence and a protected-mailbox handoff. It is
not production authentication certification. Issue [#720](https://github.com/AsoraKK/Lythaus/issues/720)
remains open.

## Source and release identity

- Original paused base: `c0963c36693476ecc49ab1fcba0572454926b4d3`.
  Resumed work is based on freshly fetched remote `main`
  `3e1edce56cba5b9dcc357b96983ee8eea9c8c36f`, including the merged mobile
  invite layout and comments integration. The preserved edits applied cleanly.
- Branch: `codex/auth-acceptance-20261025`. The draft PR records the final head
  and its hosted checks; this document does not assert that its own commit has
  passed CI, review, merge or deployment.
- Latest canonical release found by the read-only workflow listing:
  [39010370047](https://github.com/AsoraKK/Lythaus/actions/runs/39010370047),
  source `3880a8be4c89459dd7ef831c9385817a887511ef`, captured
  `2026-10-17T06:46:54.511Z`. Its successful workflow conclusion is deployment
  evidence only: the manifest explicitly says `AUTH_CRITICAL_RELEASE`,
  `OWNER_TEST_DEPLOYED_UNCERTIFIED`, `productionStatus=NO-GO`, and
  `authAcceptance.status=OWNER_TEST_PENDING`, with no acceptance run ID.
- Downloaded artifact: `12093012110`; release-manifest bytes SHA-256
  `e96bb54378c0385ae3696177dd906ac23110bb76ed2a2f7edb3f8b18e36425b9`, matching
  its included checksum. Public version `22bb30df-6f69-4bd4-aa83-01108a5d6f63`,
  Admin `c5237699-3f00-4239-9d3f-2ab343a1b10a`, Jobs
  `6d9b5913-69c6-4032-93d4-cce7f3d8969b`; Coordinator is
  `DEFERRED_OWNER_TEST`. These are retained manifest observations, not a fresh
  serving-traffic or database inspection.

The email/guest ADR remains authoritative: guest browsing plus verified
email/password, no replacement with magic links or OTP. The server contracts
remain access tokens 900 seconds, rotating refresh sessions 30 days, verification
and recovery proofs 30 minutes, and resend cooldown 30 seconds. This repair
changes none of those controls, password policy, device unlock preferences,
anti-abuse protections, release gates or publication state.

## Reproduced repair

An account A `userinfo` call can finish after account B signs in. Previously,
the A request's delayed 401 could invoke `refreshSession()` using B's current
refresh credential. Stale service errors could also escape, and
`validateAndRefreshToken()` could return true for A's delayed successful result.

The auth service now checks the captured session epoch and owner revision before
handling these results. Superseded reads return null/false without refreshing
or signing out the replacement account. The second `userinfo` request after
refresh obeys the same rule. Failures belonging to the current session retain
their existing behavior.

The new `auth_delayed_userinfo_test.dart` executes the actual `AuthService` with
controlled HTTP/storage boundaries. It covers success, 401, 503 and transport
failure after an account switch, both initial restoration and restoration after
refresh, plus token validation. No implementation hooks are inserted. On the
unchanged base service: 4 passed and 8 failed. After the fix: 12 passed.

The auth-owned browser journey also updates its empty-feed assertion from the
retired `No posts yet` copy to the rendered candidate's `No public posts yet`,
scoped to Flutter semantics so the transient live announcement is not a second
match. This uses the same locator convention as the existing guest/auth tests.
On mobile it uses the current `Open settings` profile action and verifies the
settings route; the previous exact `Settings` label no longer names that action.
After the intentional logout/reload it waits for the real client's persisted
logout-pending marker to clear before asserting cookie removal and database
revocation. The sign-in form is visible while revocation is still finishing;
its presence alone caused an early WebKit mobile assertion. No fixed sleep,
cookie injection, response substitution or weaker revocation assertion is added.
The first configured browser attempt completed signup, verification/replay,
login, cookie refresh and userinfo, then failed only this outdated locator.
An earlier unconfigured attempt made zero API calls because the local marketing
build lacked its documented synthetic Turnstile site key. Neither attempt is
counted as a passing end-to-end journey.

The resumed lane also repairs pending invite redemption after Back/disposal.
It checks widget ownership before accessing providers or updating state after
token lookup and redemption. Analytics completion or failure no longer delays
the result or turns a successful redemption into an error. Eight deterministic
widget cases cover late token results, success/failure after Back, duplicate
submit, retry and delayed/failing analytics. Six fail on the unchanged invite
handler; all eight pass after repair. The merged responsive layout is preserved.

Sixteen real Dio interceptor/adapter tests cover interrupted transport with a
stable idempotency key and payload, bounded retry failure, invalid/missing keys,
explicit opt-out and non-retryable errors. They raise `dio_client.dart` coverage
from 75.22% to 84.96% without changing that module or lowering the 80% gate.

Changes are confined to auth application/presentation lifecycle logic, its tests,
the auth-owned browser harness, retry tests and this evidence document. No
marketing, shared-hook, database, workflow or release source changes are made.
The integration lane coordinates deployment. Normal required checks and review
must pass before merge; merge authorization does not authorize live mailbox
mutations or authentication certification.

## Local acceptance

Tools: cached Node 22.23.3, Flutter 3.41.1 / Dart 3.11.0, PostgreSQL 17.11 in the
disposable `lythaus-onboarding-pg17` container. Root and marketing dependencies
were restored with `npm ci --ignore-scripts` from the unchanged lockfiles before
final Node/browser validation. This corrected an initial stale-cache failure
(installed Undici 7.29.1/8.10.2 versus locked 7.30.1/8.12.2 and the old marketing
cache-policy package); no dependency source or lockfile change was needed.

| Layer | Outcome | Scope and limitation |
| --- | --- | --- |
| Focused auth, routing, networking and device guard tests | 346 passed | Includes 12 delayed-response tests, 8 invite lifecycle tests and 16 retry transport tests; synthetic HTTP/storage |
| Complete Flutter suite | 3,784 passed, six skipped | No failures; unchanged aggregate and individual critical-auth coverage gates pass |
| Public auth and certification contracts | 80 passed | Intake, recovery, session/cookie transport, anti-enumeration, dispatch, provenance and evidence parser; not live acceptance |
| Actual API/coordinator handlers with PG17 | 30 passed | Registration, verification, resend, reset completion, row-lock races, revocation, real local outbox relay and synthetic mailbox capture |
| Native Public Worker in Workerd with PG17 | 8 passed | Provider errors, request replay, stale proofs, expiry, refresh reuse, two-account isolation, rate limits, redacted traces; external requests denied |
| Marketing source tests | 107 passed | Includes auth forms and request lifecycle; entire suite passes with locked dependencies |
| Browser plus actual handlers/PG17 | 4 passed, zero skipped | Chromium/WebKit, widths 1440/390; rebuilt candidate Flutter artifact and local synthetic Turnstile/mail transport |
| Full Flutter analysis, Dart format, native TypeScript check, diff whitespace | Passed | No findings |
| Flutter release web and marketing builds | Passed | Local artifacts only, no publication |

Final full-suite critical coverage: Dio 84.96%, device integrity guard 80.95%,
auth service 95.03%, auth providers 95.00%, native session platform 100%,
password policy 100%, auth failure 86.67%, and auth choice screen 95.83%.
No baseline or coverage threshold changed. The earlier focused-only guard
coverage of 66.67% does not replace the complete suite's 80.95% observation.

The PG17 baseline applies all 22 canonical migrations `0000` through `0021`
and verifies registry checksums, schema, role grants and rejection boundaries.
The handler suites use restricted runtime roles; synthetic setup uses only the
disposable local database. Email delivery/lifecycle, Turnstile, compromised
password screening and Access are synthetic where required by each harness.
The native Worker fixture imports the candidate `worker.ts` and substitutes
only the local database transport and provider boundaries. Proof ageing in
fixtures is not evidence of elapsed wall time or live stale-link acceptance.

Reproduction in the saved environment (use fresh local databases per relay
suite so independent synthetic encryption keys never share pending outbox rows):

```sh
source /workspace/.lythaus-tools/activate.sh
bash /workspace/.lythaus-tools/start.sh --postgres
npm ci --ignore-scripts
npm --prefix apps/marketing-site ci --ignore-scripts
docker exec lythaus-onboarding-pg17 createdb -U postgres lythaus_auth_test_acceptance
export PLANETSCALE_PG17_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/lythaus_auth_test_acceptance?sslmode=disable'
node scripts/ci/validate-planetscale-postgres17.mjs
node --experimental-strip-types --experimental-test-module-mocks --test --test-concurrency=1 --test-timeout=180000 apps/lythaus-public-api/tests/auth-account-transaction.postgres.mjs apps/lythaus-public-api/tests/auth-journey.postgres.mjs
node --test --test-concurrency=1 --test-timeout=180000 apps/lythaus-public-api/tests/auth-password-screen.workerd.mjs apps/lythaus-public-api/tests/auth-failure-paths.workerd.mjs
node --experimental-strip-types --experimental-test-module-mocks --test apps/lythaus-public-api/tests/auth-*.test.mjs apps/lythaus-auth-acceptance-coordinator/tests/acceptance-contract.test.mjs scripts/tests/auth-acceptance-provenance.test.mjs scripts/tests/real-email-acceptance-evidence.test.mjs scripts/tests/collect-auth-acceptance-evidence.test.mjs
flutter test --no-pub --reporter expanded test/features/auth test/core/routing/auth_return_location_test.dart
flutter analyze --no-pub lib/features/auth/application/auth_service.dart test/features/auth/application/auth_delayed_userinfo_test.dart
dart format --output=none --set-exit-if-changed lib/features/auth/application/auth_service.dart test/features/auth/application/auth_delayed_userinfo_test.dart
npm run typecheck:native
npm --prefix apps/marketing-site test
git diff --check
```

Browser reproduction, using a second fresh local database with the same baseline:

```sh
PUBLIC_TURNSTILE_SITE_KEY=synthetic-local-auth-fixture PUBLIC_API_BASE_URL=https://api.lythaus.co npm --prefix apps/marketing-site run build
flutter build web --release --no-pub --no-tree-shake-icons --no-web-resources-cdn --dart-define=ENVIRONMENT=production --dart-define=API_BASE_URL=https://api.lythaus.co/api --dart-define=AUTH_URL=https://api.lythaus.co/api
PLANETSCALE_PG17_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/lythaus_auth_test_browser_acceptance?sslmode=disable' AUTH_WEB_ARTIFACT_DIR=build/web AUTH_QA_DIR=/workspace/auth-acceptance-evidence/browser PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 node --experimental-strip-types --experimental-test-module-mocks --test --test-concurrency=1 --test-timeout=180000 apps/lythaus-public-api/tests/auth-journey.browser.mjs
```

The saved browser libraries are present outside the system linker cache; the
documented skip flag avoids only Playwright's host-package precheck. Browser
launch and assertions must still pass. The fixture's TLS proxy serves all
product hosts locally and rejects other hosts. No real mailbox send, user
account mutation, provider inference or live database write is performed.
Eight actual signed-in/signed-out screenshots and the command logs are retained
under `/workspace/auth-acceptance-evidence/`; they are not committed to the
public repository. Resumed execution logs are in its `resumed/` directory.
The changes add no new visual layout or copy.

Full Flutter and unchanged coverage gates are reproduced with:

```sh
flutter test --no-pub --coverage --reporter expanded
node scripts/check-auth-flutter-coverage.mjs
bash scripts/check_coverage_gates.sh
flutter analyze --no-pub
```

## One protected acceptance packet for the parent

Status: `HUMAN_ACCEPTANCE_REQUIRED`; independently verified live mailbox
journeys in this task: **0 of 2**. The historical primary/secondary secret names
are documented, but no non-secret document authorizes this task to use a real
address. Do not guess an address, reuse a user's account or reset an existing
password. A read of production secret names was denied with GitHub HTTP 403
(`Resource not accessible by integration`); no secret values were requested and
the denied read was not retried. Current presence/ownership remains unknown.
The resumed lane's read of native branch-protection details was also denied
with HTTP 403. No credential or policy change was attempted; ordinary PR checks
and the protected merge operation remain authoritative.

Pending inputs, supplied through the protected process rather than this document:

1. Parent-verified explicit scope for two dedicated, owner-controlled mailbox
   bases, permitted isolated alias/account creation, sends, password setup/reset
   and revocation. Confirm protected `CODEX_TEST_EMAIL` and
   `CODEX_TEST_SECONDARY_EMAIL` are configured and independently classify as
   Google/Workspace and Microsoft/Outlook under the reviewed classifier. Two
   domains at the same provider do not qualify. Mailbox passwords are not needed.
2. The exact reviewed merged release SHA and successful required checks; the
   staged Public, Admin, Jobs and Coordinator version IDs/source SHAs/provenance,
   upload/stage times, rollback snapshot and unexpired acceptance run ID.
   Refresh all identities if any candidate dependency changes.
3. The database/recovery lane's approved readiness/routing/migration evidence
   and the protected post-stage email lifecycle subscription observation.
   This auth lane does not repeat or approve that lane's credentials, grants,
   restore qualification, DDL or release workflows.
4. An authorized operator with Access/Keeper and both mailboxes available for
   one acceptance window, plus the separately approved production release action.

Then follow the existing [ADR-003 operator procedure](../runbooks/adr-003-authenticated-acceptance.md):

- Complete legitimate Turnstile and fresh signup; observe actual primary-mailbox
  receipt, mailbox-owned password setup, single-use replay rejection and sign-in.
- Complete the independent secondary-mailbox setup/resend journey, controlled
  expired-link rejection, immediate no-send cooldown, and deliberate resend
  after the real cooldown. Observe each new message and reject superseded links.
- Exercise refresh rotation/reuse rejection, two-account state isolation,
  logout/revocation, recovery email receipt and reset completion. Confirm the
  old password, old refresh family and prior access authorization fail while
  the other account remains valid. Retry interrupted actions deliberately.
- Retain the protected v3 observer's exact dependency binding, four delivered
  verification intents, one delivered reset intent, both independently observed
  mailbox receipts and chronology. Public 202, HTTP 200, provider acceptance,
  DNS classification, local fixtures or manually typed pass flags cannot replace
  these observations. Parent separately verifies activation and serving release.

Required exact-head checks and independent review remain prerequisites to merge;
this is not a permanent owner hold. Deployment, activated traffic and certified
authentication are distinct outcomes and must be reported separately.
