# WP01 auth runtime evidence — 7 October 2026

No residual production auth defect was reproduced in this bounded slice.
Existing merged fixes were exercised through the actual Public Worker and Jobs
handlers, native workerd boundaries, disposable PostgreSQL 17 and rendered
Chromium/WebKit journeys. External delivery and owner acceptance remain pending.
Issue 720 stays open.

## Source and change boundary

Base/main/runtime source: `f757d35a3263f86f817ea09fd76368bd1f6a8e01`.
Test-harness implementation: `89a695ad41554858ff848a3086b61147f2b170fe`.
The final PR head additionally contains these evidence documents; obtain its
exact SHA and check results from the PR rather than treating this document as a
self-referential head assertion.

The only executable file changed is `scripts/tests/flutter-auth.browser.mjs`:
it accepts the same optional `WEBKIT_EXECUTABLE` override already supported by
the actual API/PostgreSQL browser harness, closes its local TLS/proxy fixture
when browser launch fails, and captures a screenshot after an optional QA run
fails. Default CI launch behavior and all application security gates are retained.

Before the cleanup change, a missing WebKit dependency failed both launch cases
but left fixture servers running for more than two minutes. With a deliberately
absent synthetic executable, the final harness reports both expected launch
errors and exits with status 1 in 575 ms, before the ten-second outer deadline.
This negative run is evidence of prompt failure/cleanup, not two passing auth
cases. No production source, shared router/index, CI, OpenAPI/client, schema,
profile/settings/shell or session-provider file is changed.

## Runtime boundaries and results

Toolchains: Node 22.23.3, PostgreSQL 17.11 (`server_version_num=170011`), Docker
28.4.0, Flutter 3.41.1/Dart 3.11.0, Playwright 1.62.0, Chromium build 1234 and
WebKit build 2336. Native workerd is invoked by the repository's locked
Miniflare/workerd dependencies. The local database is bound only to loopback,
uses a synthetic test identity and passes the harness's disposable-database guard.

| Verification | Result | Actual boundary and limit |
| --- | --- | --- |
| Auth/email domain tests | 82/82; zero skips | Policy and adapters with synthetic DB/provider fixtures |
| Auth PostgreSQL tests | 30/30; zero skips | Actual Public Worker/Jobs/coordinator handlers, socket-connected PG17 and restricted role transactions; synthetic Turnstile/password/provider responses |
| Native workerd tests | 6/6; zero skips | Password screening, private envelope service boundary, provider redirect rejection and mailbox provider observation; no real send |
| Flutter auth tests | 74/74 | Auth service/providers/revision/state, recovery navigation, gate, password policy and return-location tests |
| Marketing auth tests | 17/17; zero skips | Existing auth form/request/password/idempotency regressions |
| Certification contracts | 29/29; zero skips | Strict real-email observation, collector/provenance and lifecycle contract; synthetic evidence only |
| Critical security policy | 3/3; zero skips | Existing fail-closed security contract |
| Actual API/PG17 browser matrix | 4/4; zero skips | Chromium/WebKit at 1440/390; actual Worker and Jobs handlers plus real PG17, locally routed marketing and exact-source Flutter artifact |
| Flutter browser matrix | 4/4; zero skips | Actual compiled Flutter artifact, synthetic API fixture, Chromium/WebKit at 1440/390 |
| Native typecheck | Pass | Existing `typecheck:native`; no typecheck configuration change |
| Marketing build | Pass; 19 pages | Exact base source, synthetic local Turnstile site key; not a production artifact or live provider claim |
| PG17 compatibility | Pass | All 21 approved migrations, grants and verification on disposable local DB; 103 relations; no hosted DDL |

The browser Flutter bytes reuse the exact-main CI artifact from run 37515933108.
ZIP SHA-256:
`48ff654c7bd4635283c8b05a411b4d2ec8a85008dff8860721cef1f6ee286c48`.
Production Dart/auth code is identical between the base and this test-only
candidate. This does not prove the latest CDN response or owner browser state.

## Requirements to actual evidence

| Required behavior | Source boundary | Executed evidence |
| --- | --- | --- |
| Initial registration creates one pending identity and fresh verification intent | Public intake/account transaction; Jobs email runtime | Domain, real PG17 journey and actual API/browser matrix |
| No usable attacker-chosen pre-registration password | Intentional verification POST/account transaction | Real handler + PG17; original password refused after mailbox-owned setup |
| Next-day resend and duplicate signup retain identity | Recovery/intake transaction | Real PG17 next-day, old queued/processing/failed outbox and fresh proof cases |
| Cooldown, expired/changed key and ambiguous response semantics | Intake policy and marketing request helper | Real PG17 key expiry/conflict, cooldown/replay; marketing tests; interrupted-response browser retry |
| Scanner GET does not consume; deliberate POST validates password first | Actual verification/reset routes and account transaction | Real PG17 GET rejection/no consumption, invalid password, deliberate consume and consumed-link replay |
| Expired, superseded and consumed proofs cannot dispatch or redeem | Jobs challenge check; Public account transaction | Restricted PG17 metadata tests, next-day supersession/replay and email dispatcher tests |
| Queue publish outage preserves committed intent | Post-commit dispatch adapter | Real PG17 failed publish followed by ordinary durable-intent recovery |
| Duplicate/forged hints, not-yet-due retries and lease state cannot duplicate sends | Signed dispatch hint; due-row claim | Real PG17 hint duplicate/backoff and domain forged/terminal/lease tests |
| Explicit rejection retries; ambiguous acceptance is terminal and scrubbed | Transactional email runtime | Synthetic provider failure classification/dispatcher tests; real PG17 explicit due retry |
| Authenticated lifecycle is distinct from acceptance and monotonic | Jobs lifecycle adapter | PG17 duplicate/monotonic delivery transaction; lifecycle/strict observer contracts |
| Login/reset/refresh races serialize; reset revokes authorization | Public account/session transaction | Actual PG17 login/reset/refresh races plus revoked-cookie/access rejection |
| Account switch, disposal, late login/refresh and logout cannot restore stale state | Existing Flutter auth service/providers/session revision | 74-test Flutter slice; simultaneous-tab rendered refresh and global logout |
| Unknown/restricted/corrupt account intake remains neutral | Public recovery policy/intake transaction | Real PG17 support blockers and rollback cases; existing anti-enumeration domain tests |
| Exact cookie origin/transport, no Web Storage credentials, no custom User-Agent | Session transport and Flutter API fixture | Real PG17 origin/cookie failures; both rendered matrices; existing transport/security tests |
| Password/provider/Turnstile failures fail closed without secret logs | Password screen, runtime policy, provider adapters | Domain/workerd boundaries and real PG17 screening outage/log exclusion |
| Runtime does not depend on certification availability | Existing separated Worker/coordinator policy | Retained release separation plus policy/observer tests; no live outage injection |

## Setup failures and remaining uncertainty

The initial local marketing build omitted its synthetic site key. The page
therefore refused bot verification before any API request. It was rebuilt with
a synthetic key and API origin; all network traffic still goes through the
local fixture. No live Turnstile or provider setting was read or modified.

The saved WebKit library set exists in the workspace. Its default wrapper
replaces `LD_LIBRARY_PATH`, and Playwright's dlopen preflight uses only the
system linker cache. A local runner supplies the saved engine and libraries
using the supported executable override. Actual `ldd` and GLES `dlopen` checks
pass. No system package installation, skipped app-security check, provider
protection change or browser dependency-validation environment bypass is used.

One earlier WebKit 390 Flutter journey selected Settings but opened Activity &
Audit Log. It had no page errors or failed API requests. A diagnostic rerun and
the final four-case matrix passed. The diagnostic screenshot showed Profile
still rendering during the transition. The cause remains unproven and appears
timing-dependent; it must not be described as a verified profile fix or ignored
as proof of reliable tapping. Profile/settings ownership remains with Lane B.
The failure log is retained for that lane's rendered/semantics review.

Local XDG configuration/cache directories resolved the saved executor's
read-only-home Flutter/Astro configuration failures. Those were tooling
failures. The executor also successfully answered a command at 04:03:16 UTC
after the second disconnect callback; availability is not inferred from callbacks.

## Reproduction

Use the repository-locked dependencies and Node 22. Synthetic fixtures prohibit
external fetches. Do not substitute a production database or real provider.
Set `PLANETSCALE_PG17_TEST_DATABASE_URL` to a loopback disposable PostgreSQL 17
database whose name starts with `lythaus_auth_test`; set `AUTH_WEB_ARTIFACT_DIR`
to the digest-verified exact-source CI Flutter artifact. Build marketing locally
with a synthetic `PUBLIC_TURNSTILE_SITE_KEY` and the canonical API origin.

- Domain: `node --experimental-strip-types --experimental-test-module-mocks --test`
  with the seven Public auth domain files, Public password screen, three Jobs
  transactional-email files and contracts auth-state/email policy file.
- PG17: `node --experimental-strip-types --experimental-test-module-mocks --test --test-concurrency=1 --test-timeout=180000 apps/lythaus-public-api/tests/auth-account-transaction.postgres.mjs apps/lythaus-public-api/tests/auth-journey.postgres.mjs`.
- Workerd: `node --test --test-timeout=60000` with
  `apps/lythaus-public-api/tests/auth-password-screen.workerd.mjs`,
  `scripts/tests/private-email-binding.workerd.mjs`,
  `scripts/tests/auth-provider-redirects.workerd.mjs` and
  `apps/lythaus-auth-acceptance-coordinator/tests/mailbox-provider.workerd.mjs`.
- Actual API browser: `node --experimental-strip-types --experimental-test-module-mocks --test --test-timeout=180000 apps/lythaus-public-api/tests/auth-journey.browser.mjs`.
- Flutter browser: `node --test --test-timeout=180000 scripts/tests/flutter-auth.browser.mjs`.
- Negative cleanup: supply a deliberately absent `WEBKIT_EXECUTABLE` and run
  the Flutter browser command with `--test-name-pattern=webkit` inside a
  ten-second outer timeout. Expected result is launch errors/status 1, never
  outer timeout/status 124. It emits no real mail or account writes.

Logs remain in the scoped local evidence directory. They are not committed as
acceptance observations. Only sanitized outcomes and digests belong in the
external packet. No personal address, credential, bearer link, row/user ID,
ciphertext, raw provider identifier or message body is in that packet.

Final clean actual API/PG17 browser log SHA-256:
`6938e18b5fc0d1306461f693f7b0f9a1087464b79af1b1ac65ef82de3fd39a4a`.
Final Flutter browser log SHA-256:
`e2d5da7cbc3ecd68af0b76862bf6098c75cc4da9b3a95f9353ca2b111dc30feb`.
Controlled expected-launch-failure log SHA-256:
`76b3511b724319b91070b9cfd40c0ca0fa62809309defa26dd3b8441c55557b0`.

## Review, six states and coordinator gate

| State | Retained auth implementation | This bounded test/evidence slice |
| --- | --- | --- |
| Implemented | Merged fixes already exist; no residual production fix proposed | Portable browser runner option, launch-failure cleanup and diagnostic capture implemented |
| Tested | Local synthetic/unit/workerd/PG17/rendered evidence as mapped above | Positive rendered matrix and controlled negative launch regression executed |
| Merged | Retained PRs are in main | Draft candidate only; normal independent review/merge belongs to parent |
| Deployed | Release 102 exact-main six surfaces | No deployment performed or requested by this slice |
| Activated | Approved prior prompt-dispatch configuration retained | No flags, protection, resources, privacy, support, passkeys or rewards activated |
| Owner-accepted | Pending | Pending; owner UAT reserved for 10 October |

Independent review and exact-head GitHub checks are required for this draft.
The parent coordinator owns the reviewer slot, normal protected merge and any
subsequent exact-SHA release. No previously denied approval API is retried.
CI may build/test the candidate; a green run cannot certify live mail receipt.

The companion external handoff packet carries exact retained source/component
provenance and explicit null acceptance run/window/timestamps. A future
authorized run must refresh serving versions and main routing, stage its exact
reviewed candidate, use legitimate Turnstile and two independent authorized
mailbox providers, and generate the strict v2 observer's grouped read-only
counts and chronology. Initial, resend and reset provider acceptance, delivered
lifecycle, inbox receipt, latency and owner acceptance are separate observations.
Missing evidence remains `HUMAN_ACCEPTANCE_REQUIRED`/`NO-GO`; issue 720 stays open.
