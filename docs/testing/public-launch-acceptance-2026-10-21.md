# Public launch acceptance — 21 October 2026

Status: partial. Local tests and guarded public observations are complete for
the scope below. Protected exact-candidate authenticated acceptance, genuine
mailbox delivery and native-device acceptance remain pending. This record does
not activate publishing, detectors, rewards, membership purchases or billing.

## Evidence identity and limits

The final public observation completed at **2026-10-21 10:01:20.814 UTC**, using
clean harness source `1b7cf2a718d161cb6de8c65f38e0e5ff3b856e09`.
`harnessSourceDirty` is false. The runner captures its source identity at startup;
tracked runner/policy differences produce a null exact source SHA. The deployed
app source SHA remains unknown and is not inferred from the harness commit.

Evidence class: `LIVE_PUBLIC_READ_ONLY_UI_OBSERVATION`. Fresh Chromium contexts
used 390×1000 and 1440×1000 viewports in light mode. The Browser plugin was not
available, so repository Playwright was used. The environment intercepts HTTPS;
`PUBLIC_BROWSER_PROXY_CERTIFICATE_BYPASS=true` was explicitly recorded. TLS is
not validated by this observation.

No credentials were entered, forms submitted, accounts created, messages sent,
charges initiated, private storage imported or production data changed. The
boundary blocks non-read HTTP methods, redirects, private API paths, sensitive
URL parameters, unknown origins and WebSockets. Service workers are disabled.
Non-redirect upstream responses are forwarded unchanged. Automatic app refresh
and logout calls are blocked; their failure does not test actual authentication.
Turnstile, third-party fonts and analytics are blocked too.

Raw JSON and public screenshots remain outside Git at
`/tmp/lythaus-acceptance-live-1b7cf2a7/`. This committed record contains only
sanitized outcomes. It does not contain account identifiers, private database
contents, post text, credentials, headers, cookies, tokens or production archives.

## Completed live observations

- All **14** page checks passed: signup, sign-in, reset request, resend
  verification, missing-token verification, missing-token reset and privacy,
  each at both viewport widths. Identity, meaningful content, absence of a
  framework overlay and horizontal overflow were checked. Password reveal/hide
  worked with empty fields in signup and sign-in at both widths.
- The exact black wordmark SVG loaded with HTTP 200, decoded and occupied a
  visible header box inside the viewport on all **14** pages. The selected ICO
  favicon returned HTTP 200. No required branding request was blocked. The guard
  permits only the exact wordmark and three versioned favicon paths needed by
  these pages; unknown branding assets, asset queries and mutations stay blocked.
  This corrects the 09:05 observation's blocked-branding limitation.
- Guest navigation rendered at both widths. Each guest Discover read completed
  with HTTP 200, loading finished, no empty/error notice appeared, and one
  visible existing post card was counted. The result is
  `POPULATED_FEED_OBSERVED`. No post content or identifiers are copied here. This
  replaces the earlier navigation-only observation; it does not qualify the
  current publishing/detection pipeline or establish the deployed source commit.
- There were **zero uncaught page errors**. Marketing pages remain
  `ATTENTION_REQUIRED`: their existing CSP rejects a provider-injected analytics
  script. The runner exits 1 for that finding. CSP was not weakened and provider
  configuration was not changed. The app's report-only CSP and deliberately
  blocked requests remain visible as categorized findings.
- A separate read-only admin-root HEAD check at approximately 08:51 UTC returned
  HTTP 302 to Cloudflare Access. Authenticated admin screens were not exercised.

These checks cover light-mode web rendering and limited empty-form/guest
interaction. They do not certify dark-mode fidelity, approved-artwork pixel
equivalence, native launcher/splash behavior, accessibility on physical devices,
real Turnstile, account/session behavior, mailbox delivery, privacy processing,
detector qualification, media publishing, paid access or public-release readiness.

## Acceptance matrix

| Area | Existing implementation and completed local evidence | Remaining live acceptance and scope |
| --- | --- | --- |
| Signup, verification, reset | Marketing forms and token-handling pages exist. Flutter auth tests cover verification-required handling, neutral resend behavior and recovery navigation; real-email evidence parsers remain fail-closed. The full marketing synthetic signup browser suite was not rerun in this lane. | Protected exact candidate; real Turnstile; approved primary/secondary mailbox cohort with Google and Microsoft providers; delivered links, expiry/replay, resend cooldown/supersession and password recovery. Public rendering is not delivery evidence. |
| Sessions | Actual Flutter release with local API fixtures passes cookie restoration, serialized two-tab refresh, logout, security-route reload/back/forward and negative CORS/cancellation controls. | Existing approved cohort credentials entered only through protected Keeper; prove issuance, rotation/replay rejection, independent account logout and reset revocation. No session operation was sent by the public runner. |
| Profile, privacy, navigation | Optional-profile, guest-entry, notifications and privacy browser suites pass. Synthetic tests cover verified export bytes/hash, holds, cancellation, expiry and cross-account isolation. | Approved account profile/private reads and scoped saves; explicitly scoped export/request operations. Account deletion remains separately gated. Public privacy-page rendering does not certify processing or erasure. |
| Membership / News Board | Existing UI preserves unknown/error states, distinguishes account access from payment confirmation and limits News Board to Black. Dedicated membership tests exist; their new execution/results belong to the rewards/billing lane, not this lane. | Approved existing Free/Premium/Black test accounts and unavailable/expiry states. No purchase, entitlement change or charge was performed. |
| Refresh / draft preservation | Flutter tests pass composer close/back, saved-draft reentry, uncertain acknowledgement with frozen payload/idempotency key and active-route preservation. Browser tests pass typing through reload-gate changes and cookie restoration. Unsaved profile drafts are intentionally not persisted. | Exact deployed candidate and approved account; controlled offline/reconnect, reload and navigation scenarios without assuming successful publication. |
| Admin tools | Access-protected control panel and Keeper exist. Only the public Access boundary was observed live; no admin UI test was newly run here. | Existing scoped owner/admin Access session, authenticated screen checks and individually authorized actions. No permission expansion or credential creation. |
| Mobile branding | Targeted Flutter brand-login navigation tests cover 320/390/1440 widths, light/dark and 320 at 2× text scale. Asset/login/draft/onboarding contracts pass. Latest web observation confirms visible marketing wordmarks. | Physical/native build and device acceptance remain untested. Web viewport checks do not establish launcher/splash or FCM/Crashlytics health. Root's separate audit reports mobile FCM/Crashlytics health unknown and email independently backed by Cloudflare/PlanetScale/R2. |

## Exact local validation scope

Product checks used baseline
`360aae649b58d4692e0332086c0d2fef6e0e4da6`; no product UI was changed by this
acceptance lane. These results are not final-union or exact-deployment CI.

| Validation | Result and scope |
| --- | --- |
| Fresh production-config Flutter web release build | Passed with pinned Flutter 3.41.1, local CanvasKit and canonical public API/auth URLs. |
| Combined auth/profile/privacy/guest browser invocation | **70 tests passed**, zero failed: 27 real Chromium/WebKit browser scenarios plus 43 lifecycle/fence helper tests. Files: `flutter-auth.browser.mjs`, `optional-profile.browser.mjs`, `guest-account-entry.browser.mjs`, `native-notifications.browser.mjs`, `privacy-requests.browser.mjs`. All API/session/privacy mutations in these tests used local fixtures. |
| Focused Flutter invocation | **70 tests passed**, zero failed. Files: `auth_service_test.dart`, `auth_session_revision_test.dart`, `brand_login_navigation_contract_test.dart`, `privacy_session_isolation_test.dart`, `privacy_action_boundaries_test.dart`, `auth_return_location_test.dart`, `create_post_navigation_test.dart`. |
| Follow-up boundary and browser regressions | **13 tests passed**, zero failed at the final harness code head. Exact allowed paths, normalization, unknown assets, sensitive queries, methods and private APIs are tested. Real loopback Chromium proves redirects never reach their destination, exact upstream response bytes/status/headers are preserved, the actual wordmark decodes, and an unknown brand asset never reaches the server. |
| Final focused contracts | **74 tests passed**, zero failed: boundary policy, auth-evidence provenance, real-email parsing/collection, immutable action pins and brand/login/draft/onboarding/asset contracts. No synthetic result is promoted to real provider qualification. |

## Next protected run

Retain the exact-candidate staging, dependency/version identity, database routing,
recovery, cost and approval gates in the release workflow. Use the existing
approved acceptance cohort and protected operator procedure in
`docs/runbooks/adr-003-authenticated-acceptance.md`. Do not infer mailbox access,
consent for communications, password changes, account creation/deletion,
entitlement changes, live charges or permissions from these read-only results.
No operation in this lane was denied or left with an uncertain mutation outcome.
