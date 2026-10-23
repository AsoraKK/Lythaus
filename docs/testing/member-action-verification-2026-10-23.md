# Inactive action verification: validation record

Date: 23 October 2026. Dependent base:
`68496e624790b6dc4a2ca2dd1b2971685e8829b6` (draft #1082). The dependent PR's
exact head identifies this source. Flutter 3.41.1 / Dart 3.11.0 / Node 22.23.3;
existing dependencies, no lockfile changes or new providers. All tests below use
synthetic fixtures. No migration, real credential, security activation or
reputation mutation was performed.

Publication check fetched main `868be4ee163ba5f7968212230d731682ff005e45`
(restore inventory #1083). That work remains separate. This dependent PR's CI
registration is additive; current-main integration is not claimed by local tests.

## Initial dependent-slice results

```sh
npm run typecheck:native
# Passed.

node --experimental-strip-types --experimental-test-module-mocks --test packages/security/tests/member-action-verification.test.mjs apps/lythaus-public-api/tests/member-action-verification.test.mjs packages/contracts/tests/monthly-security-choice.test.mjs packages/db/tests/member-security-maintenance.test.mjs packages/db/tests/member-security-assembly.test.mjs packages/contracts/tests/monthly-maintenance.test.mjs apps/lythaus-public-api/tests/auth-session-runtime.test.mjs apps/lythaus-public-api/tests/auth-session-transport.test.mjs
# 62 passed, 0 failed/skipped.

node --experimental-strip-types --test packages/security/tests/critical-security-policy.test.mjs packages/security/tests/recent-account-authentication.test.mjs
# 6 passed, 0 failed/skipped.

node --experimental-strip-types --test packages/db/tests/member-security-maintenance.test.mjs
# 5 passed after the final explicit cross-account choice validation assertion.

flutter test --no-pub --concurrency=1 test/features/member_verification test/features/auth/application test/integration/rewards_redemption_integration_test.dart --reporter expanded
# 110 passed: foundation/device settings plus existing restoration/redemption tests.

flutter analyze --no-pub lib/features/member_verification lib/ui/screens/profile/account_security_screen.dart test/features/member_verification
# No issues found.

dart format --output=none --set-exit-if-changed lib/features/member_verification lib/ui/screens/profile/account_security_screen.dart test/features/member_verification
# Passed, no changes.

git diff --check
# Passed.
```

Final command output is retained in
[`action-validation.txt`](../evidence/member-verification-20261023/action-validation.txt).
The existing CI job registers the five new Node test files; no release gate,
assertion threshold or deployment workflow changes. The dependent base preserves
#1082's reviewed source and successful remote run history. Its green checks do
not certify this new head; inspect the dependent PR's own checks before merging.

## Evidence matrix

| Concern | Evidence |
| --- | --- |
| Default inactivity | Card disabled without provider/store/OS calls; proof consumption disabled without DB calls; collection disabled or mapping absent without reads/writes; assembly does not read new schema or change legacy calculation when disabled. |
| Preference persistence/account separation | Five settings choices confirmed and persisted; foundation real secure-store fixtures, serialized cross-controller writes, guest/account fences and late hydration retained. |
| Lifecycle, cancellation, lockout | OS inactive sheet stays valid; hidden/paused cancels, late success cannot save; explicit cancellation, lockout and storage failures retain choice; Off does not require OS or reward approval. Foundation tests cover exact 1/5/15-minute boundaries and every reopen. |
| Hardware/web/offline/time | Unsupported-web/hardware cannot enable choices; OS fallback is configured; local OS operation has no network dependency. Existing monotonic/wall-clock/clock-reset cases pass. Monthly timezone/DST, leap/year/month-length and settlement cases use canonical calendar boundaries. |
| Genuine verification | Real existing password hash/verifier exercised; incorrect password, unavailable credential/schema, missing session and unrecognized action deny issuance. Client actor/family/authentication time/local boolean claims cannot substitute. |
| Binding, expiry and replay | Exact five-minute server clock, future time denied, account/family/session/version checks, action/raw-body/query/HMAC key and secret binding; conditional consumption/rollback/single effect tested through SQL-aware synthetic transaction fixtures. These fixtures do not replace actual PG17 concurrency acceptance. |
| Refresh invariants | Existing session expiry/rotation/CAS/reuse/token-version and transport suites pass; rotated read-only binding in the same family retains original proof age. JWT tests retain existing 900-second expiry and Principal claims. Auth restoration/redemption Flutter suites pass unchanged. |
| Monthly eligibility | Missing mapping/capability emits no security facts; no local face/fingerprint/PIN choice becomes proof. Whole-month selection plus actual coverage and matching server event required; last-day enrollment, midmonth switch, disable/revoke/gap and wrong account fail. Exact cutoff and credential rotation cases included. Existing calculator amounts are reused without stacking or mutation. |
| Assembly integration | Explicit selection filter withholds security points for gaps/settlement/mapping pending while preserving other maintenance; version/history recorded, policy changes on existing reports require review. Actual assembly module exercised with synthetic module/DB dependencies. |

The first widget run found a test-fixture lifecycle transition error and a disposed
controller getter read. The fixture now uses valid lifecycle transitions and the
getter checks `mounted`; final assertions remain intact. There were no security
assertions relaxed to obtain these results.

## Independent-review integration regressions

`member-action-routes.test.mjs` executes the actual public API router, real
password verification, actual proof issuance/consumption and existing idempotency
implementation. Only DB transport and activity persistence are synthetic module
dependencies; it does not execute SQL or create schema. Reward and deletion routes
cover challenge, real verification and fresh-key recovery; intentional old-key
403 replay without consuming a fresh proof; expired-proof renewal; concurrent
same-key success; replay after expiry; different-key proof reuse denial; body/key
conflict; and commit followed by finalization failure remaining quarantined.
Default-disabled routes are also exercised. This validates the review-approved
fresh-key recovery alternative; it does not claim same-key challenge recovery.

The operation reader now rejects malformed UTF-8 with `invalid_json`, preserves
valid BOM/replacement characters distinctly, and checks the 8,192-byte boundary.
The actual reward route rejects invalid bytes before proof consumption or effect.
The idempotency engine and request hash remain unchanged.

Review-delta validation (all final checks exit 0):

```sh
node --experimental-strip-types --experimental-test-module-mocks --test packages/security/tests/member-action-verification.test.mjs apps/lythaus-public-api/tests/member-action-verification.test.mjs apps/lythaus-public-api/tests/member-action-routes.test.mjs apps/lythaus-public-api/tests/idempotency-runtime.test.mjs packages/contracts/tests/monthly-security-choice.test.mjs packages/db/tests/member-security-maintenance.test.mjs packages/db/tests/member-security-assembly.test.mjs packages/contracts/tests/monthly-maintenance.test.mjs apps/lythaus-public-api/tests/auth-session-runtime.test.mjs apps/lythaus-public-api/tests/auth-session-transport.test.mjs
# 77 passed, 0 failed/cancelled/skipped.
npm run typecheck:native
# Passed.
```

Only the operation reader was temporarily replaced by its predecessor at
`4f2ecbd27283c317c7841a77a7d277ff77aee717` for negative regression evidence.
The actual route then returned **201 instead of 400** for different invalid bytes
decoded into the approved replacement-character body; the unit assertion failed
with "Missing expected rejection." The oversized clone test remained pending and
was cancelled by the test harness. Restoring the fixed reader passes the same
assertions unchanged. The local reader cancels both request branches without
awaiting tee cancellation, rejects invalid UTF-8 and preserves valid body bytes.
No shared media reader or idempotency implementation changed.

Exact final and predecessor output:
[`review-integration-regressions.txt`](../evidence/member-verification-20261023/review-integration-regressions.txt).
Earlier 110-test Flutter evidence remains applicable: this delta changes no Dart
source. Actual database concurrency and physical-device acceptance remain pending.

## Protected sources and limits

This comparison returned no differences from the reviewed foundation:

```sh
git diff --exit-code 68496e624790b6dc4a2ca2dd1b2971685e8829b6 -- apps/lythaus-public-api/src/auth-session-runtime.ts apps/lythaus-public-api/src/auth-session-transport.ts apps/lythaus-public-api/src/auth-account-transaction.ts packages/security/src/jwt.ts lib/features/auth
```

The original principal/issue/refresh callbacks in public API `index.ts` also remain
unchanged. No changes to existing auth storage, cookies, restoration, expiry,
rotation, revocation, signed monthly policies, migration manifest or release/grant
workflows. All new runtime flags remain absent from build/provider configuration.

No new SQL proposal was executed, so real DB privileges, transaction isolation and
migration compatibility are **pending**, not passed. Device/browser acceptance,
app-wide lock composition and client server-verification UX remain **pending**.
Security/email settings mutation routes do not exist at this baseline; policy
types are prepared but no working-looking invented endpoint was added.
The option-to-award mapping and coverage-source integration remain **pending**;
the current implementation makes these states explicit. See the
[activation packet](../architecture/member-action-verification-inactive-2026-10-23.md).

## Approved equal-benefit and monthly grace delta

The owner's later approval supersedes the earlier strict no-gap/same-option
candidate in this PR. The new versioned adapter permits a cumulative union of
verified unprotected intervals of at most 24 hours per UTC calendar month. Tests
cover zero, under/exactly/over 24 hours; repeated method switches without resets;
overlapping expiry/revocation/disablement intervals; cross-month clipping and
monthly reset; enrollment after month start; unknown coverage and missing/revoked
authentication; unchanged timezone/settlement boundaries; and equal treatment of
synthetically mapped different verified methods without stacking.

The fixture's common action is explicitly synthetic configuration. No production
qualifying credential, common catalogue mapping or new point value is chosen.
The old calculator still rejects real coverage gaps in raw facts; only the new
optional shadow adapter applies the approved grace rule to one existing mapped
component. Other monthly/quarterly components and reputation remain unchanged.

Grace-delta validation at `1c8f937036911cd2687158e95e1a38c650c1fcb3` reruns the exact ten-file Node command in the review
section above: **87 passed**, no failed/cancelled/skipped tests. The complete
targeted Flutter command passes **110 tests**. TypeScript checking, Flutter
analysis, Dart formatting (11 files, zero changes) and diff checks pass. Raw output
is in [monthly-grace-validation.txt](../evidence/member-verification-20261023/monthly-grace-validation.txt).
This delta follows `d1e66ed61ebaa2506b9e6da8495a203381ade3a4`; that predecessor
contains the reviewed retry/UTF-8 fixes but does not implement the later grace rule.

## Common-benefit availability correction

Independent review found that a verified MFA-only method with the configured
common credential action unavailable could report ready but receive zero; the
reverse capability configuration had the same risk. The adapter now reports
`unavailable / common_security_benefit_unavailable` before claiming eligibility
when the common component cannot be awarded under the current rules. It does not
select another amount, require user enrollment into another method, or fall back
to a second security benefit.

Two asymmetric regressions cover both directions, available-budget controls,
one-benefit behavior and unknown-evidence denial. Both fail unchanged against the
predecessor guard and pass with the correction. The exact ten-file Node command
above now passes **89 tests**, with no failures/cancellations/skips, and native
TypeScript checking passes. No Dart source changed after the 110-test validation.
See [common-budget-validation.txt](../evidence/member-verification-20261023/common-budget-validation.txt)
for the predecessor, final regression and complete test output.
# Main-base integration after foundation merge

PR #1082 squash-merged as `5b7e457d4fb4df35c999aa10a8a4f5d1ecfe663a`;
its tree equals reviewed foundation head `4c21b5c5594c7216648268cf5bd91b62551916ee`.
This dependent draft is now based on main. The branch merge retains the reviewed
`6270c2b95c808b33b3bc115c0e3066d8d00d6296` API/auth, proof, device settings,
schema proposal and monthly policy bytes without modification. It inherits
main's already merged inventory and rendered-browser fixes.

Four conflicts were resolved: retain reviewed #1084 controller/settings source
and Node verification step; retain main's expanded foundation evidence. No
assertions, thresholds, feature defaults or runtime paths were weakened.

On the integrated source, 110 targeted Flutter tests and 89 Node regressions
pass, with native TypeScript, targeted analysis, formatting and diff checks
passing. The first Node invocation in the new worktree lacked workspace package
links; installing the unchanged lockfile with `npm ci --ignore-scripts --no-audit`
resolved that setup error before the passing run. Full required remote CI must
run for the resulting exact main-based head; earlier scoped workflows do not
clear it. See [integration evidence](../evidence/member-verification-20261023/action-main-integration-validation.txt).

The PR remains draft/unmerged. All enforcement/evidence flags stay off; no
credential, migration, reputation mutation, award or deployment is performed.

# Required-CI contract repair

Main-based head `4909a47537a9dd6c7ff415db4c96e1b508e4a567` started full CI
`39992571253`, attempt 1. Actual logs identify three failed jobs: the OpenAPI
route count/spec omitted the new verification endpoint; homepage allocation
checks rejected the reviewed Public API blob and two redundant Jobs Env type
fields; the pinned Wrangler subprocess hit its existing 55-second timeout.
The timeout cause is unproven. No old-head rerun, timeout increase or assertion
relaxation is used to resolve these failures.

The additive v14 contract documents the existing-password endpoint, disabled
503, bounded exact operation, existing cookie/native session context, five-minute
one-use receipt and confirmed-no-effect fresh-key retry contract. The generated
Dart SDK receives only the new method/models. Its native verification method
rejects redirects even with permissive status predicates; its generic web
adapter reports unavailable before transport because XHR cannot enforce that
boundary. The separate #1092 app client retains its redirect-rejecting Fetch
transport. Generation applies this restriction repeatably. Existing generated
login/refresh/logout methods and their behavior remain unchanged.

Jobs drops only the two redundant optional Env declarations and returns to the
existing exact allocation `50a6d8c3f4dd73f49db3c68b463a19b8c172ebb9`; the monthly
module owns those optional fields. Public API source is untouched. Its strict
allocation advances to the independently reviewed `6270c2b` blob
`95ae09a2df0d260d699b4526a18bc682ff6cc485`; negative tests explicitly reject the
prior blob, unrelated paths and mutated bytes. This allocation delta needs
independent review before integration; it adds no wildcard or admitted path.

Local validation: 78 OpenAPI contract tests pass (17 existing skips); 1,601
generated SDK tests pass, including two real two-origin native 303 refusals and
a successful exact-body/password/receipt round trip; 7 generator/validator
regressions, 103 marketing unit tests (44 homepage-protection tests), 89 inactive action/monthly/session
tests, native TypeScript and diff checks pass. SDK analysis retains 76 existing
warnings with no errors. Two clean generations produce identical source trees.
See [contract repair evidence](../evidence/member-verification-20261023/action-contract-repair-validation.txt).

No reviewed proof, session, account-security UI, migration proposal or monthly
security calculation is altered. Qualifying credential/coverage production and
the existing common catalogue action mapping remain activation decisions;
equal benefit and cumulative 24-hour monthly grace do not invent that mapping.

Head `4049cd4ea99d7997ce3d218c64a0ec41e6d93e11` CI `39996953745`, attempt 1,
passed OpenAPI but its web unit job `120563560256` caught one remaining exact
package-command pin. The earlier standalone 42-test marketing pass preceded
the new SDK generation hook and therefore did not clear those final command
bytes. The follow-up pins only the two complete new SDK commands, preserving
their historical baselines, and adds negative tests for removed security steps,
appended commands/bytes and unknown command names. The complete final marketing
unit command above passes 103/103, including 44 homepage protection tests, after
installing the unchanged marketing lockfile in the isolated worktree. SDK and
production implementation bytes are unchanged by this test-only follow-up.
