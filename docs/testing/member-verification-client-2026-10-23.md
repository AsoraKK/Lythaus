# Inactive member verification client validation

Base: reviewed PR #1084 at `6270c2b95c808b33b3bc115c0e3066d8d00d6296`.
Scope and activation decisions are in the
[client architecture record](../architecture/member-verification-client-inactive-2026-10-23.md).
[Captured local output](../evidence/member-verification-20261023/client-validation.txt)
records the passing full suite and individual new cases.

## Initial client checkpoint (`dfba52ac`)

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
session/JWT implementation, release settings and dependencies are
byte-unchanged from the reviewed base. AuthService differs only by the additive
read-only method; removing it gives exact byte equality with the base file.

## Independent-review repairs

Current repair validation: **3,711 Flutter tests passed**, six unchanged skips,
zero failures; full analysis and enabled release compilation passed. All
existing coverage gates pass: total 89.66% >=87%, P1 91%, P2 94%, P3 80%,
each >=80%. The eight critical-auth module checks also pass, with AuthService
unchanged at 94.82%. See the
[predecessor/fix output](../evidence/member-verification-20261023/client-review-repairs-validation.txt).

The guest-recovery predecessor regression fails at `dfba52ac`: a private
navigator dialog becomes visible after the shield drops for guest mode.
The fix holds a navigation boundary until a fresh root router has disposed
private overlays/routes. It observes account exit synchronously, fences late
guest completion against B, and retains the shield if navigation reset fails.
Nineteen shield tests include real GoRouter/production redirect logic, combined
private-route/dialog -> lock -> guest, late dialog data, A -> B with B set to
Off, late A guest completion after B navigation, and same-account route retention.

The predecessor native adapter also follows POST303 and forwards synthetic
custom headers to a different local origin. Both account-action requests now
disable redirects and impose a strict 2xx status predicate. Six real native
IO-adapter cases exercise initial action, password verification and verified
retry, each with default/permissive inherited status handling. All six reject
the redirect with zero requests or forwarded headers at the other origin.

Because browser XHR ignores redirect control, the isolated web adapter now uses
the existing Fetch-backed HTTP client with redirect rejection and HttpOnly
cookie credentials. A compiled Chromium fixture verifies three redirect stages
and a legitimate success: zero target-origin requests, no native binding from
web, the existing HttpOnly cookie present at the intended API, and unreadable
from JavaScript. The CI workflow adds only its fixture build and verification
steps; existing required assertions, security gates and deployment workflows
remain unchanged.

Reproduce the network checks without any provider, stored credential or real
account operation:

```sh
flutter test --no-pub test/features/member_verification/account_action_native_redirect_test.dart
flutter build web --debug --no-pub --no-wasm-dry-run --no-web-resources-cdn --target test/browser/account_action_redirect_entry.dart --output build/member-action-redirect-fixture
node scripts/tests/account-action-redirect.browser.mjs
```

All network fixtures use two disposable loopback origins and runtime-only
synthetic probes. Captured evidence contains case names, counts and booleans;
no header values, passwords, cookies or proof values are written to logs.

Required full remote CI remains due after normal dependent-base reconciliation;
scoped workflows on a dependent draft cannot certify the resulting main-based
candidate. Actual native OS acceptance and separate activation/migration gates
remain open. No production credentials, provider operations, deletion, reward
claims, reputation mutations or deployments were used for validation.
