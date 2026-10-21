# Firebase Spark dependency audit, 21 October 2026

This is a bounded source/configuration review of
`13b700cc1ef7a5ce6aa6f8cefd4878faa0093dd5`, supplemented by official provider
documentation. The parent supplied notices that the Google Cloud trial ended
at 08:34 UTC and Firebase project `lythaus` changed to Spark at 08:48 UTC.
Those notices were not independently verified through provider access here.
No Firebase dashboard, credential value, application row or production log was
opened. No upgrade, sign-in method, credential or provider setting was changed.

## Findings and effect on acceptance

| Area | Current repository evidence | Implication |
| --- | --- | --- |
| Authentication | Native email/password API in `lib/features/auth/application/auth_service.dart` and the Public API Worker; no `firebase_auth`, third-party sign-in dependency or active Firebase authentication call found | The source does not make web signup, verification, reset or sessions depend on this Firebase billing project. Authenticated live acceptance still requires its existing protected evidence. |
| Backend/database | Workers configurations under `apps/lythaus-*/wrangler.jsonc`, existing Hyperdrives and canonical PlanetScale PostgreSQL | No Cloud Run, Google Cloud Functions, Firestore or Google Cloud database runtime dependency found in the current application/configuration search. This is not a live provider inventory. |
| Media and hosting | Worker/R2 media contracts and Cloudflare Pages release workflows; no tracked `firebase.json` or `.firebaserc`, Firebase Storage SDK, Functions code or Firebase Hosting deployment | No source evidence that the Spark change breaks the current hosted media or web deployment path. Existing native recovery, publishing and hosted qualification gates remain required. |
| Android crash reporting | `firebase_core`, `firebase_crashlytics`, Android Google Services/Crashlytics Gradle plugins; `FirebaseCrashSink.initialize` in `lib/core/observability/crash_reporting.dart` initializes Firebase only on Android | This is an actual retained mobile dependency. The enclosing service catches initialization errors and returns, allowing `main.dart` to reach `runApp`; runtime availability is not proven by that error path. Release collection and privacy/retention approval remain separate. |
| Push | `firebase_messaging`; `lib/services/push/push_notification_service.dart` can request permission, obtain/refresh a token and consume messages; the device service uses the native notifications API | Service providers exist, but no production consumer calling this push initializer was found in `lib`, and no FCM sender endpoint/Admin SDK was found in the native Workers. Device registration or an old workflow comment does not establish delivery. |
| Native project binding | Only `android/app/google-services.json.example` and `ios/Runner/GoogleService-Info.plist.example` are tracked; existing secret-purpose inventory names mobile configuration | The actual built client-to-project binding is unverified. Do not infer that a template, retained secret name or SDK package proves it targets the reported project. No configuration values were retrieved. |
| Google Fonts | Marketing layout and control-panel CSS reference public Google Fonts endpoints | This is an external font dependency, not evidence of a workload in the owner's Firebase/Google Cloud billing project. |

The scan covered `lib`, Android/iOS/web configuration, current Workers/packages,
infrastructure, dependencies and release workflows. Negative source findings
do not prove an empty Google Cloud/Firebase provider inventory or the absence
of unpublished/mobile build configuration.

## Provider plan facts

Firebase lists FCM and Crashlytics as no-cost products available on Spark as
well as Blaze. Losing the trial/Blaze plan alone therefore does not prove these
two retained SDK purposes stopped working. Paid Google Cloud services and new
Cloud Functions deployment are restricted on downgrade. See the current
[Firebase plan documentation](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans).

Cloud Storage for Firebase requires Blaze; Spark bucket calls can return
402/403. No active application dependency on that product was found here, so
this restriction is not proof of a Lythaus R2 outage. See the provider's
[Storage billing requirements](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024).

These facts do not authorize a billing upgrade or credential change. No paid
fallback or additional identity provider should be introduced to address this notice.

The final guarded browser observation at 10:01:20 UTC, after the reported
downgrade, used clean harness `1b7cf2a718d161cb6de8c65f38e0e5ff3b856e09`.
All 14 public page/decoded-visible-wordmark checks passed at mobile and desktop
widths; both public guest feeds completed with HTTP 200 and a visible card
counted without collecting its content. The earlier 09:05 run had withheld
branding assets and did not establish feed completion. See the dated
[acceptance matrix](public-launch-acceptance-2026-10-21.md) for exact scopes.
The final evidence remains `LIVE_PUBLIC_READ_ONLY_UI_OBSERVATION` and
`ATTENTION_REQUIRED` for provider-injected analytics rejected by CSP. It does
not prove authentication, email delivery, publishing, deployed source identity,
TLS validation or native Firebase health, and does not establish a whole-app
outage.

## Remaining bounded evidence

Continue the existing Cloudflare/PlanetScale owner-testing release and public
read-only web checks under their current gates. Do not label the entire app
down or claim native Firebase delivery is healthy from this source review.

For mobile acceptance, use already-authorized read-only project/app metadata
and sanitized existing diagnostic logs to confirm the built configuration's
project, enabled FCM/Crashlytics services and any downgrade-related error.
If those reads are unavailable, retain `UNKNOWN`. A real push, token/device
registration, induced crash or other provider write requires its own approved
test scope. Existing iOS/APNs implementation, mobile configuration and the
[Firebase purpose/privacy gaps](../security/firebase-mobile-purpose-inventory.md)
remain unresolved independently of Spark pricing. No removal or automatic
activation of these SDKs is implied.
