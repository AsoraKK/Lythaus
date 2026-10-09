# Disabled monthly rewards Flutter presentation

This presentation slice depends on draft #965 at
`822d799029c22e91d249a50826441ae82e218ed1`. It adds read-only monthly status
and source evidence to the existing Rewards destination and owner-only profile
tracker. It does not activate v2 scoring, entitlement, partners, or awards.

## Authority and version boundaries

- A confirmed level is displayed only for a confirmed, recognized historical v1
  snapshot with an integer level and source score. Its effective month and
  source month come from the server. Current source progress cannot change it.
- Current source progress uses the requested month's canonical report response.
  A mismatched source month fails closed. Detailed legacy evidence is displayed
  only for `lythaus-monthly-rewards-2026-10-v1`; historical maximum 13,500 remains
  explicit. Unknown-policy evidence does not supply scores or CSV export.
- Following-month projection is unavailable. Production `preparedResponse`
  remains null; this UI does not consume it as live authority, even if a fixture
  contains one. There is no client-side level or eligibility calculation.
- The collapsed v2 methodology appears only for the exact disabled readiness
  response, policy, data version 2, maximum 13,650, preparation-only flags,
  zero applied points, and catalogue hash
  `26213abccce99ee51be6c0623406c28aaa7d39ed3ea3b4ac630b7cffd859db67`.
  It describes four whole weekly totals of 2,500, monthly 2,500, email 1,000,
  and optional suggestion 150. All quarterly awards would run from completion
  month to calendar-quarter end, without earlier credit or carry. It grants
  nothing; lower thresholds are unchanged.
- Null dates, points, and months remain unknown. Numeric evidence must be finite,
  non-negative, integral, and within the exact integer range. No truncation or
  default entitlement is introduced.

## Existing journeys and private state

The existing `/rewards` route and navigation item are reused. Rewards displays
monthly reads independently of the existing offers endpoint, so an offers error
does not hide monthly status. Existing redemption and idempotent retry behavior
remain covered by integration tests.

Profile Overview remains settings-first, followed by the owner-only tracker.
Overview/Posts/Comments, account-synced preferences, and the public profile
boundary are unchanged. Guests receive the existing sign-in destination and
make no monthly reads. Public profiles show no private monthly evidence.

The existing synchronous session-revision cancellation guard is reused for
generated API reads and CSV export. Loading states hide cached account values;
tracker/report state resets on revision changes. Rapid A-to-signed-out-to-A
transitions cancel old transport requests. CSV export checks the captured month
and revision again after fetching and after the native save-location dialog.

Loading, pending, unavailable, error/retry, corrected revisions, omitted weeks,
cap groups, and missing evidence are explicit. Disclosure headers have button
semantics without merging expanded evidence into one button. Reduced-motion
preferences disable disclosure animations. Material theme tokens and the
existing refresh/export/sign-in/profile actions are reused.

## Canonical client and build preparation

The monthly providers call `RewardsApi.getMyMonthlyRewards` and
`ReputationApi.getMyMonthlyReputationReport` with canonical generated models.
No OpenAPI or generated source was edited.

The canonical SDK declares a different Dart minimum language version from the
application. Installing it directly from beneath the application's `lib/`
causes generated part/library language-version conflicts. The existing
temporary client validator now has a preparation mode that builds serializers
with its pinned compatible toolchain and copies an unchanged canonical package
plus generated parts into ignored `build/api_client`. The app uses that local
package. Its 336 tracked library files were compared byte-for-byte with the
canonical files. The default validator still formats, analyzes, and runs its
full client test suite.

Fresh checkouts must run:

```sh
npm ci --ignore-scripts
node scripts/validate-openapi-dart-client.mjs --prepare-for-flutter
flutter pub get
```

CI, the standalone web build, and existing scoped Flutter validation jobs run
the same preparation before dependency resolution. No deployment was run.

The canonical serializer registers a nullable JSON map with a non-nullable
`MapBuilder<String, JsonObject>`. Real nullable snapshot/report/correction
values consequently fail to deserialize. `monthly_api_serializers.dart`
overrides that one builder factory on a serializer copy scoped to the two
monthly reads. Global and canonical serializers remain unchanged. Correcting
the generator's nullable-map factory is a separate upstream follow-up.

## Validation and evidence

- Flutter 3.41.1 / Dart 3.11.0: release web build, clean analysis, and unchanged
  formatting passed.
- 66 focused provider, monthly widget, Rewards, redemption, responsive, and
  owner/public profile tests passed. They cover generated HTTP calls, account
  cancellation, malformed months, unknown policy, null values, retry, disabled
  prepared fixtures, narrow 320px layouts with actual 200% text scaling,
  keyboard focus, and reduced motion.
- The validator wrapper's four tests passed, as did repository hygiene,
  immutable workflow pins, actionlint, and the existing coverage thresholds.
- The first development full-suite run had 3,122 passes, five skips, and seven
  failures in profile fixtures/scrolling and semantics-handle cleanup. Those
  seven checks pass in the final focused run. This is not a full-suite pass;
  the exact published head must run the complete CI suite.
- Local browser evidence uses the real release artifact with synthetic local
  TLS fixtures. Chromium and WebKit exercise pending/confirmed/disabled states,
  keyboard refresh, failure/retry, corrections/cap groups, owner/public privacy,
  and real sign-out, with desktop light and mobile dark captures. Browser 200%
  zoom is approximated by halving the CSS viewport at DPR 2. Physical screen
  readers and native devices were not tested.

At candidate `73e9b311ba38494fc05d7f514195a086e3612793`, the complete Chromium
desktop/light and mobile/dark journeys passed with zero captured app or console
errors. The WebKit rerun completed monthly and owner checks but failed during
mobile session restoration before loading the public profile, showing
“Unable to refresh your session”; that run is not a pass. Earlier complete
WebKit journeys are historical evidence only. The existing Chromium mobile/light
profile visual regression also passed, including Posts/Comments, settings, and
saved preferences. Review fixes after this candidate require fresh validation.

The CSV request lifetime gap was carried forward from the dependent base.
Its separate repair scopes a manual provider subscription to the export, closes
it synchronously on session change, and retains automatic disposal/cancellation.
Six actual-button tests pass with delayed Dio transport: exact saved server
bytes, error/retry, navigation, sign-out, account switching, and sign-out while
the native save dialog is open. No global keep-alive or cancellation removal
was introduced.

Snapshot fixtures now match `readOwnMonthlyRewardSnapshot`: the snapshot state
itself is `shadow` or `confirmed`; no `mode` field is invented. Shadow evidence
is explicitly unconfirmed. Prepared v2 shadow values do not supply live scores
or levels. Reader-shaped unavailable, unassessed pending, and corrected
confirmed snapshots are also covered. The isolated legacy owner-profile test
reproduced its coverage-run timeout before adding typed monthly read fixtures;
its original profile/error assertions remain intact.

Selected screenshots and a sanitized evidence receipt are stored in
`docs/architecture/evidence/monthly-rewards-flutter/`. Review the
[mobile disabled methodology](evidence/monthly-rewards-flutter/chromium-mobile-dark-confirmed-disabled-methodology.png),
[omitted weeks and cap evidence](evidence/monthly-rewards-flutter/webkit-mobile-dark-corrected-evidence.png),
[settings-first owner overview](evidence/monthly-rewards-flutter/chromium-desktop-light-owner-settings-first.png),
and [public profile](evidence/monthly-rewards-flutter/chromium-desktop-light-public-private-evidence-absent.png).
The browser harness emits
the complete capture set under `build/monthly-rewards-evidence` in CI.

## Remaining gates

1. The repository dependency-review parser rejects all non-hosted Dart sources,
   including the canonical SDK's new path dependency, with
   `UNSUPPORTED_DEPENDENCY_SOURCE:pubspec.lock:lythaus_api_client`. The native
   architecture suite therefore has one failing security-validation test.
   Security validation is outside this slice's authorization and was not
   altered or bypassed. The security owner must add a reviewed representation
   and native dependency coverage for this exact repository-owned package.
2. Complete exact-head CI and dependent review are required before merge.
   Draft #966's separate rate-window fixture repair is not included here.
   The unchanged analytics-owned `flutter-auth.browser.mjs` timed out during
   local regression validation: its mobile Settings helper waits for the
   monthly pending tracker through `getByLabel` before clicking Settings. Flutter
   renders the isolated static status semantics as readable text in a `span`,
   without the previous merged node's `aria-label`; the exact DOM was inspected.
   The pending semantics label is preserved and widget-tested. The dedicated
   monthly harness selects the rendered text and scrolls to the owner tracker
   below the settings-first content. This slice does not edit the reserved auth
   probe or move the tracker ahead of settings. The desktop settings/back journey also timed out
   in the initial concurrent run; its exact-head result remains an analytics
   lane gate. Local full-harness WebKit launches were blocked by its host-library
   detection; dedicated WebKit QA uses the verified scratch browser binary and
   libraries without changing system packages.
3. A future authoritative v2 progress/projection contract and activation
   approval are required before displaying live v2 scores or projections.
   Existing `preparedResponse: null` and disabled readiness are insufficient.
4. Scoring/entitlement activation, schema changes/grants, partner operations,
   and deployment remain separate owner gates. No production access, resource
   changes, paid services, credentials, migrations, deployment, or merge were
   performed.
