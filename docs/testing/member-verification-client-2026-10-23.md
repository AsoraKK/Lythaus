# Inactive member verification client validation

Base: reviewed PR #1084 at `6270c2b95c808b33b3bc115c0e3066d8d00d6296`.
Scope and activation decisions are in the
[client architecture record](../architecture/member-verification-client-inactive-2026-10-23.md).
[Captured local output](../evidence/member-verification-20261023/client-validation.txt)
records the passing full suite and individual new cases.

## Results

| Check | Result |
| --- | --- |
| Full Flutter suite, `flutter test --no-pub --coverage --concurrency=2 --reporter expanded` | 3,699 passed; 6 existing skips; no failures |
| Targeted verification/auth/privacy/reward integration suite | 312 passed; no failures/skips |
| Existing server proof, actual route, idempotency, monthly choice/assembly/maintenance and session Node tests (10 files) | 89 passed; no failures/cancellations/skips |
| Full `flutter analyze --no-pub` | No issues |
| Native TypeScript typecheck | Passed |
| Existing coverage gates | Total 89.65% >=87%; P1 91%, P2 94%, P3 80%, each >=80% |
| Independent critical-auth coverage gate | All eight modules passed; AuthService 94.82% |
| Enabled web release compile against synthetic `.invalid` endpoints | Passed; build only, no deployment or API calls |
| Dart formatting, repository hygiene, active branding, documentation-secret scan, diff check | Passed |

The full suite's unchanged skips are five opt-in `SPKI_GATE` launch checks and
one disabled support-feedback UI test. P3 passes its unchanged 80% gate and
still reports the existing advisory 85% headroom target. No gate, skip condition,
timeout, assertion, security setting or baseline was weakened.

## New regression boundaries

- Actual RewardsDashboardScreen and PrivacySettingsScreen: challenge, existing
  password verification, fresh-key single retry, exact canonical path/body,
  cancellation, account switch, and unknown-outcome same-key reconciliation.
- Encoded transport: native session header, exact UTF-8 operation body and proof
  header; unrelated 401/403/409/500 responses never prompt or rotate keys;
  offline responses never automatically retry; expired proof returns once;
  confirmed no-effect cancellation differs from an unconfirmed prior operation.
- Dialog: password is obscured and input is cleared on submission; pending
  submit is disabled; wrong password permits deliberate retry; cancellation,
  backgrounding and account transition discard late verification results.
- Root shield: disabled zero-work composition; Off/unsupported support; every
  non-Off cold-start policy; existing router-dialog hiding; background/resume;
  OS-sheet inactive versus real background cancellation; lockout/unavailability;
  storage reload; guest recovery without erasing the choice; account separation.
- Existing foundation tests retain preference persistence, delayed account-bound
  storage serialization, 1/5/15-minute thresholds, clock changes, OS fallback,
  web/hardware absence, cancellation and late-result fencing.
- Existing token restoration, expiry, concurrent refresh, rotation, sign-out and
  account-replacement regressions all pass. Native header reading performs no
  network/write/refresh; web header reading never exposes a refresh credential.

Early local runs caught a test lifecycle sequence error and a duplicate request
introduced by moving disabled-branch invalidation after listener creation.
The valid lifecycle sequence and original invalidation ordering were restored;
the existing one-request and unknown-key assertions now pass unchanged. A new
privacy screen test initially waited for global idle despite the intentional
progress spinner beneath the password dialog; it now asserts the password
dialog's bounded visible milestone and all exact request-count/key assertions.
No remote CI rerun was used to hide these local failures.

The server, schema proposal, monthly calculator, current catalogue, Jobs,
session/JWT implementation, workflows, release settings and dependencies are
byte-unchanged from the reviewed base. AuthService differs only by the additive
read-only method; removing it gives exact byte equality with the base file.

Required full remote CI remains due after normal dependent-base reconciliation;
scoped workflows on a dependent draft cannot certify the resulting main-based
candidate. Actual native OS acceptance and separate activation/migration gates
remain open. No production credentials, provider operations, deletion, reward
claims, reputation mutations or deployments were used for validation.
