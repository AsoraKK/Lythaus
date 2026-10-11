# Notifications testing runbook

Authority reconciled: 11 October 2026. Scope: synthetic tests of the existing
in-app notification and device-registration contracts; live push is unverified.

Read the [current policy authority](../policy/current-policy-authority.md) and
[Firebase mobile purpose inventory](../security/firebase-mobile-purpose-inventory.md).
No provider calls, real-user content, credentials or activation are authorized
by this lane. Public posting stays withheld until full pipeline validation.

## Current runtime and contract

The Public API Worker owns private member notification reads and mutations.
The Jobs Worker records notifications from canonical product lifecycle events.
Use the source [OpenAPI](../../api/openapi/openapi.yaml) and its
[product-integrity fragment](../../api/openapi/product-integrity.yaml). The
former Function App settings, dispatcher timer and function-host URL are retired.
There is no current `/notifications/send` or post-like operation in that contract.
Do not restore these paths or infer an approved live FCM dispatcher from the SDK.

| Member operation (relative to `/api`) | Contract purpose |
| --- | --- |
| `GET /notifications` | Private cursor page for the current principal |
| `GET /notifications/unread-count` | Private unread count |
| `POST /notifications/{id}/read` | Mark an owned notification read |
| `POST /notifications/{id}/dismiss` | Dismiss an owned notification |
| `GET`, `PUT`, `PATCH /notifications/preferences` | Read or change the current member's preferences |
| `GET`, `POST /notifications/devices` | Read metadata or register a device with the contract's token/platform body |
| `POST /notifications/devices/{id}/revoke` | Revoke an owned delivery endpoint |

All identity comes from current server authentication, never a client-supplied
subject. Device tokens are sensitive: synthetic fixture values only, no raw token
logging or screenshots. Successful registration returns metadata and does not
prove OS permission, dispatch or delivery. The synthetic seed disables
`notifications.push`; neither seed nor source is evidence of a live flag.

## Local validation

1. Use disposable local PostgreSQL 17 for database fixtures and outbound-denied
   Worker/browser fixtures where the suite requires them. No production writes.
2. Verify owner isolation, private/no-store responses, preferences, pagination,
   stable read/dismiss behavior and device revocation from the contract.
3. Verify positive and rejected paths, duplicate/retried requests, stale session
   replies, concurrent actions and interrupted lifecycle paths. Confirmed actions
   must survive late request failures without exposing another account's state.
4. Reconcile server events and audit/activity metadata; do not infer notification
   delivery from a submitted post or an in-app record.

Relevant source-backed checks include
`npm run test:product-integrity-runtime`, `npm run openapi:test:contract`, and
the Flutter suites under `test/features/notifications/` and
`test/services/push/push_notification_service_test.dart`. Record which suites
actually ran, their result, and unavailable toolchains; a named test is not a pass.

## Provider acceptance remains separate

FCM/APNs device delivery, provider retry/invalid-token handling and crash telemetry
require separately approved exception/privacy scope and synthetic acceptance
evidence. Do not provision FCM keys, enable a feature, trigger live product events
or send an admin notification to manufacture evidence. Missing provider access,
retention terms or delivery proof remain `UNKNOWN/BLOCKED`.
