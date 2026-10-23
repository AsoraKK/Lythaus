# Inactive member verification client wiring

This dependent slice starts at reviewed PR #1084 commit
`6270c2b95c808b33b3bc115c0e3066d8d00d6296`. It adds client composition;
it does not change that commit's server proof, monthly policy, schema proposal,
token refresh, grants or deployment implementation.

## Runtime boundary

Three compile-time providers default to false, with no release configuration
changes: `MEMBER_RECENT_AUTH_CLIENT_ENABLED`,
`MEMBER_DEVICE_UNLOCK_SETTINGS_ENABLED` (inherited), and
`MEMBER_DEVICE_APP_LOCK_ENABLED`. The app shield also requires the settings
flag. Disabled composition returns the existing router child without creating
a lifecycle observer or reading preferences. Disabled reward and deletion
requests retain their existing transport paths. No server flag is activated.

The only AuthService addition reads existing session headers through its
existing storage queue, fencing sign-out and replacement owners. It performs
no HTTP request, refresh, write, rotation, extension or restoration. Native
requests use the current securely stored refresh credential solely as the
existing server's session-binding input. Web reads only the access token in
memory and uses the existing HttpOnly cookie contract; an isolated Dio clone
carries credentials, preserving the shared client's defaults and interceptors.
No new secret, provider, application PIN, credential or enrollment is created.

Both verification and mutation explicitly reject redirects and accept only 2xx,
even if a caller's shared Dio status predicate is permissive. Native requests
set `followRedirects: false` and zero redirects. The isolated web clone reuses
the existing Fetch-backed `http` BrowserClient with credentials included and
redirect rejection; XHR cannot enforce this boundary. Cancellation and response
timeouts abort that isolated request, and disposal never closes the shared
native adapter. No custom binding, proof, password or cookie is forwarded to
a redirect target.

The underlying behavior is documented by the
[Dart redirect contract](https://api.dart.dev/dart-io/HttpClientRequest/followRedirects.html)
and [pinned Dio native adapter](https://raw.githubusercontent.com/cfug/dio/dio_v5.9.0/dio/lib/src/adapters/io_adapter.dart).
Controlled native-adapter and Chromium Fetch regressions verify the actual
network boundary with runtime-only synthetic probes, never live credentials.

## Sensitive actions

The enabled flow is limited to existing POST reward redemption and POST privacy
deletion-request routes. Security/email actions remain unsupported because
their mutation handlers do not exist; no placeholder working controls are added.

1. Send the requested action with the caller's existing idempotency key.
2. Only an exact confirmed `403 recent_authentication_required` opens the
   account password dialog. Other errors never trigger automatic verification.
3. Submit the existing password to `/api/auth/recent-verification`, with the
   exact method, canonical path and UTF-8 body used by the mutation. No local
   biometric result, token issue time or reputation is submitted as proof.
4. After genuine server proof, allocate a fresh key and retain it *before*
   submitting the single verified retry with `X-Lythaus-Action-Verification`.
   The old key's completed denial remains unchanged on the server. No proof is
   added to the idempotency hash and no unknown operation is reclaimed.
5. Network/5xx/in-progress/unknown outcomes retain the attempted key for
   reconciliation. They never automatically open another password dialog or
   select another key. An expired/rejected proof returns the retry's response;
   a later deliberate attempt can verify again after a confirmed denial.

The server remains authoritative for genuine password verification, subject,
token-version, refresh-family, action and exact-request binding, five-minute DB
expiry and atomic one-use consumption. The client does not infer authentication
age from its clock or JWT refresh. Proof/password values are transient and are
not persisted or logged. New verification errors are sanitized before display;
deletion logging excludes request objects carrying sensitive headers.

Repeated clicks are suppressed. The dialog disables resubmission while pending,
clears entered text on submit, permits cancellation during network verification,
and closes on account transition or actual backgrounding. Late results cannot
submit an action for a replacement account. A cancellation after a confirmed
challenge records no new mutation; lack of a server response cannot clear an
earlier unknown key. Browsing is available after cancellation.

## Per-device lock

The shield sits above the router, including existing dialogs and nested routes.
It hides private rendering, semantics and focus while preferences are loading,
storage is unconfirmed, or the chosen local lock is due. It preserves the
underlying route and existing session/network work. Off never prompts; non-Off
choices lock on a cold reopen. Existing monotonic/wall-clock checks implement
Every reopen and 1/5/15 minutes away, including clock rollback handling.

Unlock is deliberate and uses the inherited OS-managed authenticator with
`biometricOnly: false`. OS-sheet `inactive` is tolerated; actual hidden/paused
events cancel pending authentication. Cancellation, lockout, unsupported web,
unavailable hardware and storage failure retain an honest locked/unavailable
state. No local unlock becomes a server proof.

The existing guest/sign-out path remains available while locked and retains the
device preference. Guest recovery first replaces private navigation and keeps
the shield until the new router has painted and the old routes/dialogs have
been disposed. A synchronous account-exit listener also serializes that boundary
for A-to-guest, A-to-B (including B set to Off), and coalesced owner transitions.
Late A logout or dialog completion cannot expose A content or replace B's new
navigation. Failure to reset navigation retains the shield with an explicit
retry. Same-account validation and ordinary guest navigation retain their routes.
Users can restore their OS credentials separately; account
password recovery does not silently reset a device lock. Once unlocked, members
can select Off without an award gate. Actual native-device acceptance, including
OS passcode/pattern accessibility, unavailable-device recovery and snapshots,
is still required before activation.

## Activation decision packet

- Keep all client and server flags off. No release, merge, production request,
  migration, credential, grant, award or live reputation mutation is performed.
- Independently review this client delta, then reconcile dependent bases and run
  full required CI on the resulting exact candidate. Scoped dependent-PR jobs
  do not replace the main CI suite. PR #1082's readiness and inventory sequencing
  holds remain with the parent; this slice does not retry either operation.
- Obtain separately approved schema/grant/application/retention and native-device
  acceptance before any server or app-lock activation.
- Monthly security policy is inherited unchanged: one equal explicitly mapped
  existing benefit, verified calendar-month protection plus matching genuine
  server authentication, cumulative known-unprotected allowance <=24 hours,
  no stacking, no last-day enrollment credit, unknown evidence fails closed,
  and no deduction of other reputation. The qualifying credential/coverage
  producer and the single existing catalogue action that funds the common
  benefit still require an explicit mapping. Local preference selection cannot
  resolve that policy decision or manufacture monthly coverage.
