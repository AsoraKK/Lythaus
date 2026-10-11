# Firebase mobile purpose and exception inventory

Status: repository inventory at `49cca9caa34b34c7ded7f4842792f698be9bd41f`,
reconciled 11 October 2026. No provider dashboard, credential values or user
content were accessed. This is not a live capability or privacy certification.

The owner requires Cloudflare-first use of existing Workers Paid with no
additional paid resources. The [current policy authority](../policy/current-policy-authority.md)
records that boundary. Firebase dependencies already exist; they do not authorize
a new provider, paid resource, authentication method or automatic activation.

## Purpose and observed data scope

| Component | Repository purpose / evidence | Observed or potential data scope | Approval and retention evidence |
| --- | --- | --- | --- |
| Firebase Core | `firebase_core` in [pubspec](../../pubspec.yaml); Android crash sink calls `Firebase.initializeApp()` in [crash reporting](../../lib/core/observability/crash_reporting.dart) | SDK/app initialization; native mobile configuration. SDK-managed identifiers and provider processing require separate inventory | No explicit full Cloudflare-first exception or provider retention terms found |
| Firebase Messaging | `firebase_messaging` in pubspec; [push service](../../lib/services/push/push_notification_service.dart) requests permission, obtains/refreshes a token, consumes messages and routes taps | Delivery token, permission state, message ID, notification title/body, message data and deep link; these are not authentication credentials | Purpose is documented; live delivery, approved payload allowlist, provider storage/retention/deletion and transfer terms remain unverified |
| Firebase Crashlytics | `firebase_crashlytics` in pubspec; [startup](../../lib/main.dart) wires the Android crash sink. Non-debug Android collection is enabled by the code; debug is disabled unless explicitly enabled. Other platforms return without initialization in this sink | Flutter error details, exception values and stack traces. No application-set user ID/custom-key API was found in this sink; that does not prove SDK payloads contain no personal data | Existing code forwards errors without an explicit privacy scrub at the sink. Consent/notice basis, scrub policy, SDK identifier scope and provider retention/deletion need review; no numeric retention period is established |

The existing [credential purpose inventory](github-credential-purpose-inventory.md)
retains the **name** `GOOGLE_SERVICES_JSON` for mobile Messaging/Crashlytics build
configuration and explicitly excludes authentication. That record supports
retaining the existing purpose; it does not document complete exception approval,
provider terms or runtime provisioning. No values or unspecified plaintext
attachments were retrieved. Do not remove dependencies or credentials by
inference, or create access to fill an evidence gap.

## Application privacy paths and limits

The Public API's `notificationDevices` handler in
[the Worker](../../apps/lythaus-public-api/src/index.ts) binds registrations to the
authenticated principal, stores token ciphertext and keyed lookup in
`feed.notification_devices`, and returns private metadata rather than raw tokens.
Device registration uses the canonical
[notification contract](../../api/openapi/product-integrity.yaml); it is not
proof of provider dispatch or delivery.

The [Jobs privacy workflows](../../apps/lythaus-jobs/src/index.ts) export device
metadata/preferences and delete application notification devices/preferences on
account deletion. The [product-integrity migration](../../database/planetscale/migrations/0012_product_integrity_v2.sql)
adds subject locators for these application records. Those paths do not prove
Firebase provider-side erasure, provider retention or an end-to-end live DSR drill.
No approved numeric FCM/Crashlytics retention period was found in the reviewed
docs, and the [vendor register](../legal/registers/vendors.csv) records this gap.

`notifications.push` is disabled in the synthetic development seed. This is not
live flag evidence. The Jobs source records in-app notifications; the retired
Function App timer, admin-send route and FCM credential instructions in the old
testing guide are not the current contract. Local checks use synthetic fixtures;
do not enable push, send a live notification or inject a crash into a real device
to close this documentation inventory.

## Outstanding review

- Record an explicit owner exception decision for each retained Firebase purpose,
  including allowed platforms, cost boundary and the existing resource identity.
- Confirm mobile configuration, SDK identifier/payload scope, crash scrubbing and
  notification payload minimization without exposing tokens or private content.
- Record privacy notice/consent basis, transfer/processor terms, numeric retention,
  deletion/DSR and restricted-access evidence with the privacy owner.
- Validate delivery and crash collection only in a separately authorized synthetic
  acceptance exercise. Source, retained credential names and dependency presence
  alone establish none of these approvals.

This lane changes documentation only. Backend runtime stays on existing Workers;
no dependency, provider registration, credential, feature flag or resource changes.
