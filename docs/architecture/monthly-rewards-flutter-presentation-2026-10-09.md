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

- Flutter 3.41.1 / Dart 3.11.0: release web build, clean full analysis, and
  unchanged formatting passed on the reviewed runtime. The release artifact
  SHA-256 is `479297a11271246a511b385aadf3946697784256ca89aed026670ea79cb4725c`.
- 73 focused provider, monthly widget, CSV export, Rewards, redemption, responsive, and
  owner/public profile tests passed. They cover generated HTTP calls, account
  cancellation, malformed months, unknown policy, null values, retry, disabled
  prepared fixtures, narrow 320px layouts with actual 200% text scaling,
  keyboard focus, and reduced motion.
- The validator wrapper's four tests passed, as did repository hygiene,
  immutable workflow pins, actionlint, and the existing coverage thresholds.
- On `53a8ec324332139ae4ebd09160cda289078536cd`, CI run
  [37935689731](https://github.com/AsoraKK/Lythaus/actions/runs/37935689731)
  passed the full Flutter coverage suite, coverage gates, and complete monthly
  Chromium/WebKit journeys. It failed at the unchanged authentication probe
  and the native dependency parser. All dependency audits passed; their
  aggregate launch-blocker summary failed because upstream jobs failed.
  These conclusions use structured metadata, not downloaded signed logs.
- Local browser evidence uses the real release artifact with synthetic local
  TLS fixtures. Chromium and WebKit exercise pending/confirmed/disabled states,
  keyboard refresh, failure/retry, corrections/cap groups, owner/public privacy,
  and real sign-out, with desktop light and mobile dark captures. Browser 200%
  zoom is approximated by halving the CSS viewport at DPR 2. Physical screen
  readers and native devices were not tested.

Local complete browser probes on `53a8ec32` did not pass: Chromium timed out at
the owner Overview selector, while WebKit reached its test timeout. The isolated
HTTP CSV probes on `6d70bd700fef6ed074d92359ab81d43daa580fc9` also did not pass
overall. WebKit desktop passed its exact-byte CSV assertions after a response
held across two frames and 600 ms, then mobile timed out waiting for download.
Chromium timed out entering email before reaching CSV. These failures remain
gates; no token injection or auth relaxation was added. Further changes after
`53a8ec32` affect the browser harness and evidence only; application runtime
files are byte-identical. The complete final-head workflow must still finish.

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

Current inspected, labeled screenshots and a sanitized review receipt are stored in
`docs/architecture/evidence/monthly-rewards-flutter/`. Review the
[desktop v1 shadow, explicitly unconfirmed](evidence/monthly-rewards-flutter/review-chromium-desktop-light-v1-shadow-unconfirmed.png),
[mobile pending snapshot and v1 source evidence](evidence/monthly-rewards-flutter/review-webkit-mobile-dark-pending-disabled.png),
and [desktop after exact-byte CSV download](evidence/monthly-rewards-flutter/review-webkit-desktop-light-csv-export-complete.png).
Their fixture labels, tested revisions, hashes, partial-run results and limits
are in [review-receipt.json](evidence/monthly-rewards-flutter/review-receipt.json).
The original five screenshots and `receipt.json` are historical development
evidence; they do not establish a final-head engine pass.
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
