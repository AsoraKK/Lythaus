# Member unlock and verification: inactive foundation

Status: draft for parent review. **Do not merge or activate before parent review
and agreement on policy options.** This work does not authorize deployment,
credential enrollment, resource creation, migrations, reward activation or changes
to launch email/password authentication.

## Implementation scope

Add a device-local, account-scoped preference store and independently testable
draft lifecycle controller; an OS-credential adapter disabled by default; a
read-only settings policy preview behind a disabled build flag; and an unconnected
server freshness gate that has no successful verification path. Preserve existing
sessions, refresh rotation/reuse detection, expiry, storage/cookies, revocation,
restoration and rewards. No application PIN or new passkey/provider flow.

## Three independent concepts

| Concept | Foundation | Authority / limitations |
| --- | --- | --- |
| App unlock on this device | Versioned local preference: Off, Every reopen, After 1/5/15 minutes away. Draft controller and OS adapter. | Local access convenience only; no server authentication, token, reward or reputation effect. The app does not instantiate the controller or adapter. |
| Recent account authentication | `recentAccountAuthenticationGate()` returns `inactive` by default; explicitly passing `true` returns `deny / recent_account_authentication_unavailable`. | No trusted original-authentication evidence exists. Gate is not imported by a live route or package entry point. Client booleans, JWT `iat`, preference and reputation never create clearance. No freshness interval or mandatory action is selected. |
| Optional monthly maintenance | Read-only unavailable explanation; existing calculator and gates retained. | Whole-month credential coverage plus a matching server-verified authentication event remain required. Provider and defaults are pending. Face/fingerprint/PIN choices do not stack, earn points or reduce reputation. No new reward evidence is emitted. |

## Inactive boundaries and behavior

`MEMBER_VERIFICATION_POLICY_PREVIEW_ENABLED` defaults to `false`. Setting it to
`true` exposes explanatory text only to signed-in members in Account security.
There are no switches, save controls, hardware probes, storage reads, prompts,
lifecycle observers or network requests in that preview. The flag cannot enable
unlock enforcement, recent authentication or reward maintenance.

The separately testable controller and native adapter also default to disabled;
their disabled methods do no I/O. Test fixtures explicitly enable them. Production
has no composition that enables them and no overlay, router guard or API hook.
This slice cannot lock out existing users. Stored draft choices do not activate
anything on this or another device.

Preferences use a dedicated `lythaus.member_unlock.draft.v1.<account-hash>` key,
never auth keys or shared guest settings. Apple defaults use non-synchronizing,
device-only keychain accessibility. No preference is synced to the server. Missing
data means draft Off; unsupported versions, corrupt values and failed reads/writes
remain unavailable rather than silently claiming a saved/usable preference.

The draft controller binds one immutable account ID. Future integration must
dispose it on the existing synchronous auth-session revision, including
A → guest → A; token rotation must not count as a new login. Disposal and
cancellation invalidate asynchronous prompt/load results. Duplicate prompts and
overlapping saves are suppressed. A fresh controller with any enabled preference
starts locked; no prior unlocked timestamp is persisted. Off never prompts.

Away timing starts at the first inactive/hidden/paused/detached event. Resume
evaluates the draft interval without automatically prompting. Monotonic elapsed
time prevents wall-clock rollback from extending grace; wall time can conservatively
trigger an earlier lock if a platform timer excludes sleep. Negative elapsed or
wall deltas lock. Backgrounding during a prompt cancels it and ignores late
success. A cancelled, locked-out or unavailable result never unlocks the model.

The native adapter uses `biometricOnly: false` to allow OS-managed password,
passcode or pattern fallback, not an application PIN. It does not inspect/enroll
biometric modalities, retain credentials, open enrollment dialogs or make remote
requests. Unsupported web/hardware and native errors remain unavailable. OS
lockout is reported, with no custom attempt counter or automatic retry. Local
offline success is local unlock only; there is no offline server-freshness bypass.

This is a simulation-tested foundation, not native security acceptance. Real
device testing must establish accessible OS fallback, device-credential setup
requirements, Android/iOS lifecycle behavior of system sheets, interruption and
deep-sleep timing before app integration. In particular, system-sheet `inactive`
events may need platform-specific handling; the draft cancels conservatively.

## Source evidence

Reviewed current main: `ada165d3dd4da186b70503da76e4d1c96c324e0d` (includes sign-in
UI PR #1081). Root `AGENTS.md` and `docs/policy/current-policy-authority.md` were read.
All references below name that exact baseline. Except for the gated Account
security preview insertion, the referenced implementation stays unchanged.

- [Settings state](https://github.com/AsoraKK/Lythaus/blob/ada165d3dd4da186b70503da76e4d1c96c324e0d/lib/state/models/settings.dart)
  has presentation preferences, no authentication frequency policy.
- [Account security](https://github.com/AsoraKK/Lythaus/blob/ada165d3dd4da186b70503da76e4d1c96c324e0d/lib/ui/screens/profile/account_security_screen.dart)
  shows session expiry and sign-out. This PR adds only the gated preview insertion.
- [Auth service](https://github.com/AsoraKK/Lythaus/blob/ada165d3dd4da186b70503da76e4d1c96c324e0d/lib/features/auth/application/auth_service.dart)
  owns transport/storage and restoration; its biometric helper is local-only.
- [JWT / Principal](https://github.com/AsoraKK/Lythaus/blob/ada165d3dd4da186b70503da76e4d1c96c324e0d/packages/security/src/jwt.ts)
  supplies no original-authentication age or method. Issuance `iat` is not a fresh-login event.
- [Session runtime](https://github.com/AsoraKK/Lythaus/blob/ada165d3dd4da186b70503da76e4d1c96c324e0d/apps/lythaus-public-api/src/auth-session-runtime.ts)
  preserves 900-second access tokens, 30-day refresh sessions, rotation and family
  revocation on reuse. No auth-time claim/schema has been added or reset on refresh.
- [Monthly maintenance](https://github.com/AsoraKK/Lythaus/blob/ada165d3dd4da186b70503da76e4d1c96c324e0d/packages/contracts/src/monthly-maintenance-policy.ts)
  preserves unavailable defaults, whole-month coverage, matching credentials and
  fixed non-stacking award budgets. Signed historical and prospective policy lanes
  are untouched.

## Activation decision packet

Recommendation: retain **Off / unavailable** across all three concepts. Review the
foundation independently from any subsequent security activation change.

| Decision | Draft option / required agreement |
| --- | --- |
| Local prompt frequency | Off default; optional Every reopen or 1/5/15 minutes away. Agree cold-open behavior, what counts as leaving, changing/disabling protection while locked, sign-out/recovery access, and device replacement/reset behavior. |
| Accessible fallback | Prefer OS-managed credentials with biometrics optional. Validate non-biometric fallback and OS lockout/recovery before enabling native integration. Web remains unavailable. |
| Sensitive actions | Agree an explicit action matrix (for example redemption, password/email changes, account deletion) and freshness interval(s). Existing mandatory behavior remains unchanged. Do not infer requirements from reputation or a local choice. |
| Server evidence | Choose a reviewed existing-credential reauthentication design and server-owned original-authentication event/session binding. Specify age, method, revocation, replay/concurrency, recovery and offline denial. Refresh must preserve genuine authentication age. No passkey provider is introduced here. |
| Optional monthly maintenance | Keep existing whole-month coverage plus matching server-verified event gates. Provider/defaults and evidence retention need agreement with the owning policy lane; prompt choices have no award/penalty effect. |

Smallest question before dependent server implementation: **Which sensitive
actions must require recent account authentication, and how long should a verified
email/password authentication remain fresh for each?** This PR deliberately stops
before selecting those requirements or fabricating a proof source.

After policy agreement: a separate reviewed integration must bind account/session
changes, protect preference edits, add real native acceptance, implement trusted
server evidence without altering refresh semantics, test route-specific negative
cases, and obtain an explicit activation/rollback decision. This draft neither
merges itself nor participates in the grant, restore, migration or deployment lanes.

## Reproducible validation

Use the repository's installed Flutter/Dart and Node toolchain. Commands and exact
outcomes are recorded in
[`docs/testing/member-verification-foundation-2026-10-23.md`](../testing/member-verification-foundation-2026-10-23.md).
