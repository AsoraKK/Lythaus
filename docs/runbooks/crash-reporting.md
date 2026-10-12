# Crash Reporting Runbook (Android)

Version: 1.0
Last Updated: 2026-02-05
Owners: Mobile + Platform

Authority inventory reconciled 11 October 2026: [Firebase mobile scope](../security/firebase-mobile-purpose-inventory.md).
The code behavior below is not proof of an approved Cloudflare-first exception,
provider data minimization/retention or live crash delivery. This docs lane does
not authorize a provider call or mobile collection change.

## 1. Scope

- Crash reporting is enabled for Android builds through Firebase Crashlytics.
- iOS setup is intentionally deferred and out of current scope.

## 2. Implementation References

- Startup wiring: `lib/main.dart`
- Crash service: `lib/core/observability/crash_reporting.dart`
- Android plugin setup: `android/build.gradle.kts`, `android/app/build.gradle.kts`
- Dependency: `pubspec.yaml` (`firebase_crashlytics`)

## 3. Verification Steps

1. Run:

```bash
flutter pub get
flutter test test/core/observability/crash_reporting_test.dart
```

2. Build Android debug and release:

```bash
flutter build apk --debug
flutter build apk --release
```

3. A provider-delivery exercise (synthetic non-fatal error in an authorized QA
   build) requires separate exception/privacy and acceptance authorization.
   Do not inject crashes or send error payloads to a live provider in this lane.

## 4. Operational Notes

- Crash collection is disabled in debug by default and enabled for non-debug builds.
- Uncaught Flutter framework and runtime errors are forwarded to crash reporting.
- If Firebase initialization fails, app startup continues and logs a warning.
- Error details and stacks can contain private data; the existing sink has no
  explicit scrub step. Do not infer provider privacy or retention guarantees from
  the absence of an application-set user ID. Track the review in the scope inventory.
