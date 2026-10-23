# Member verification foundation: local test evidence

Date: 23 October 2026. Baseline main:
`ada165d3dd4da186b70503da76e4d1c96c324e0d`. The draft PR head identifies the
candidate source. No merge, deployment, migrations, grants, provider mutation,
credential enrollment or activation was performed.

Toolchain: Flutter 3.41.1 (`582a0e7c55`), Dart 3.11.0, Node v22.23.3.
The workspace's installed packages were used with `--no-pub`; no dependencies or
lockfiles changed. These are synthetic local tests, not production acceptance.

## Commands and outcomes

All commands ran from the repository root and exited **0** on the final source.

```sh
flutter test --no-pub --concurrency=1 test/features/member_verification test/features/auth/application test/integration/rewards_redemption_integration_test.dart --reporter expanded
# 98 passed: 26 new foundation/widget tests + 72 existing auth/redemption tests.

node --experimental-strip-types --test packages/security/tests/critical-security-policy.test.mjs packages/security/tests/recent-account-authentication.test.mjs apps/lythaus-public-api/tests/auth-session-runtime.test.mjs apps/lythaus-public-api/tests/auth-session-transport.test.mjs packages/contracts/tests/monthly-maintenance.test.mjs
# 29 passed, 0 failed/skipped: 3 new gate tests + 26 existing regressions.

flutter analyze --no-pub lib/features/member_verification lib/ui/screens/profile/account_security_screen.dart test/features/member_verification
# No issues found.

dart format --output=none --set-exit-if-changed lib/features/member_verification lib/ui/screens/profile/account_security_screen.dart test/features/member_verification
# 8 files checked; 0 changes.

npm run typecheck:native
# tsc -p tsconfig.native.json --noEmit; passed.

git diff --check
# Passed.
```

Raw final Flutter and Node output is retained in
[`local-validation.txt`](../evidence/member-verification-20261023/local-validation.txt).
The existing security CI step now includes the new Node gate tests. Local results
do not claim the complete remote CI suite passed.

## Requirement evidence

| Requirement | Tests / observed behavior |
| --- | --- |
| Disabled behavior | Controller + native adapter perform no store/probe/prompt/cancel work by default. Widget tests verify default screen unchanged, read-only preview when flagged, no preview for guests. |
| Persistence and account separation | Real secure-storage mock roundtrips every versioned option; A and B remain distinct through reconstruction. Auth storage keys remain byte-for-byte unchanged. Empty accounts, corrupt JSON, unsupported versions and unknown choices are rejected. |
| Reopen/background/resume | All five draft choices test cold open and exact timeout; just-before boundary remains locally unlocked. First inactive timestamp survives hidden/paused transitions. Resume never automatically prompts. |
| Cancellation, races and lockout | False/cancelled, OS lockout and unavailable results remain locked. Duplicate requests do not prompt twice. Cancel/background/dispose invalidate late success. Late hydration cannot update a replacement controller. Native cancel during capability check prevents a late prompt; cancel after prompt rejects a late platform success. |
| Hardware/web/accessibility | Explicit unsupported-web/hardware cases make no native authentication call. Native adapter allows OS credential fallback (`biometricOnly: false`), with no enrolled-biometric query, enrollment dialog or sticky automatic resume. Passcode-not-set, lockout and other platform errors stay unavailable/locked. Platform behavior is mocked. |
| Offline | Local-only OS/model retry succeeds without a remote proof or network dependency. Server gate stays denied when activated, including supplied offline/previous-authentication claims. Existing offline logout and guest/restoration tests pass. This is not a physical-device offline acceptance claim. |
| Clock changes | Monotonic boundary tests plus forward/backward wall-clock changes and timer reset ensure grace cannot be extended by changing the wall clock. Cold starts do not restore an unlocked timestamp. |
| Refresh invariants | Existing client restoration/refresh concurrency, stale responses, replacement account and logout-fence tests pass; web access remains in memory and refresh transport in cookies. Existing backend tests retain 900-second access expiry, 30-day refresh sessions, CAS rotation, reuse-family revocation and token-version revocation. Critical JWT tests reject expired/untrusted claims. |
| No local-to-server freshness spoof | Separate server gate has no accepting proof path. Local biometric/PIN/unlocked claims, renewed `iat`, supplied `auth_time`/`amr`, preference, reputation and offline claims cannot change an activated denial. No route consumes this gate yet. |
| Monthly gates preserved | Existing maintenance regressions cover unavailable defaults, whole-month coverage, gaps/late enrollment/expiry, matching credential authentication, wrong-subject evidence and fixed non-stacking budgets. No new preference emits evidence or points. |

## Protected-source check

The following command exited 0 with no diff. The only changes to existing
implementation files are the Account security preview insertion and one additional
test path in the existing security CI command.

```sh
git diff --exit-code ada165d3dd4da186b70503da76e4d1c96c324e0d -- lib/features/auth lib/state/models/settings.dart lib/state/providers/settings_providers.dart packages/security/src/jwt.ts packages/security/src/index.ts apps/lythaus-public-api/src packages/contracts/src packages/db/src database infrastructure .github/workflows/production-release.yml .github/workflows/product-privilege-grants.yml .github/workflows/planetscale-production-migrations.yml
```

Immediately before preparing the draft PR, `git ls-remote origin refs/heads/main`
still returned the baseline SHA above. No post-merge CI/release work for #1081 was
performed by this lane.

## Pending activation evidence

Native hardware, OS accessibility, system-sheet lifecycle, actual lockout recovery,
deep sleep, reinstall/device replacement and browser execution were not certified
here. No real server recent-authentication provider or action-level freshness
policy was implemented. Production DB/API behavior was not exercised. Those
dependencies remain pending the owner/parent decisions in the
[activation packet](../architecture/member-verification-inactive-foundation-2026-10-23.md#activation-decision-packet).
