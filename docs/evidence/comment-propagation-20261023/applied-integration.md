# Applied comment integration candidate

Dependent on the module repair branch `codex/comment-reply-propagation`; parent
cleared shared ownership at 16:03 UTC on 23 October. This branch applies the
narrow public API, Jobs, Admin and native notification-model hooks as real files.
The module PR remains separate. No provider calls, live notifications, migration
execution, security/policy activation, release or merge is performed here.

The notification-model import follows `library;`. A generator regression checks
directive order. Patch helpers accept an already fully applied hook set without
duplicating it; incomplete marked integrations fail assertions. Setting
`COMMENT_REQUIRE_APPLIED_HOOKS=true` makes runtime fixtures read actual API/Jobs
source without applying their in-memory transforms.

## Actual applied validation

- Native TypeScript passes against the real changed entrypoints.
- Full Flutter analyzer passes, no issues. Actual native notification API parsing,
  notification-screen tap, post navigation and exact comment reveal pass; a
  malformed UTF-8 destination stays unavailable without throwing. Together with
  existing model/screen/link regressions: 26 tests pass.
- Applied workerd comment/notification journeys: four pass with
  `COMMENT_REQUIRE_APPLIED_HOOKS=true`.
- Actual restricted Worker/PG-to-Flutter route regressions: three pass with the
  same flag; no handler integration transform is used.
- Existing native feed/read PG17 suite: nine pass. It now requires private/no-store
  comment responses and indistinguishable 404 for unavailable parents, rather
  than the obsolete 200/empty assertions. Missing IDs and hostile paths still
  retain strict privacy/error checks. No weaker expectation is introduced.
- Canonical shared patch reverse apply-check passes, establishing that its four
  applied runtime/native deltas match the separately reviewable patch.

Commands use the documented loopback-only disposable PostgreSQL 17 database:

```sh
npm run typecheck:native
flutter analyze --no-pub
flutter test --no-pub test/features/feed/domain/comment_notification_integration_test.dart test/features/notifications/domain/notification_models_test.dart test/features/notifications/presentation/notifications_screen_test.dart test/features/feed/domain/comment_notification_link_test.dart
COMMENT_REQUIRE_APPLIED_HOOKS=true node --experimental-strip-types --test apps/lythaus-public-api/tests/comment-propagation.workerd.mjs
COMMENT_REQUIRE_APPLIED_HOOKS=true node apps/lythaus-public-api/tests/run-comment-route-ui.mjs
node --experimental-strip-types --test apps/lythaus-public-api/tests/feed-post-read-native.postgres.mjs
node apps/lythaus-public-api/tests/check-comment-shared-compatibility.mjs
```

## Pending-branch compatibility

The compatibility checker reads pinned security #1084
`6270c2b95c808b33b3bc115c0e3066d8d00d6296` and detection #1086
`0f4a122e4109b1b0f834c3067488dde9c3a63201` from Git. It three-way combines their
overlapping Jobs changes, applies only comment hooks to those composed sources,
and compiles all 14 overlaid TypeScript files. It preserves actual account-proof
consumption, inactive security mapping flags, image processing/privacy and their
supporting modules. Neither source branch nor the checked-out entrypoints are
overwritten by this compatibility check. This is compile/source compatibility,
not a claim that every other lane's runtime acceptance was rerun.

## Exact-source allocation hold

The homepage protection guard is deliberately unchanged. Its actual applied test
fails because these new API/Jobs blobs are not yet independently allocated. Do
not update the pins merely to obtain green CI.

| Path | Actual applied blob |
| --- | --- |
| Public API index | `aacfbb522f8387a72db133fa8c5384dcf9d4e2f2` |
| Jobs index | `9d192e7f489fd5d0f6db0e010bfcb1dd79c02a12` |
| Admin index | `233a52ab45ccfa394f1335bf64470b5983bd693b` |
| Native notification model | `d21357b572a89b62974d7cb366f6de43153888d7` |

The purely composed pending-security/detection compatibility outputs have API
blob `dfb94053f9ac2762d58c29983021e5870594f133` and Jobs blob
`d4d53ed44c995bce8b52943be7b747bf644b8e46`. These are compatibility outputs, not
checked-out production candidates or permission to change allocations. Parent
must choose/review the actual combined merge order and resulting bytes.

Normal exact-head required CI and any reviewed allocation update remain pending.
Public posting, Most relevant, provider delivery and all pre-existing launch
acceptance gates stay withheld. The trusted-signal contract is a proposal only;
no AI service, new ranking, earning effect or reputation penalty is activated.
