# Notification client request lifecycle

Integration base: `88ffc079d95797485bce33617e2a7e3545ef7e0b`, fetched from
`origin/main` and independently checked through GitHub on 2026-10-11.
#975–#978 and #979/#980/#983 are included. The initial saved checkout was
clean at `dba135ca3720b1311c5ec3d1d9e00ab7a67a568d`.

Read root AGENTS.md, README, canonical notification schemas/routes in
`api/openapi/product-integrity.yaml`, the resource registry, migrations
0004/0010/0012, native notification handlers and policy, and the disabled
push seed before edits. No repository `.agents/skills/SKILL.md` or nested
AGENTS.md exists. Open PRs were inspected; #981/#982/#984/#985 own adjacent
work and have no overlapping paths. No competing notification-centre slice
was found. Their workflow, settings, posting and export files are untouched.

Read-only PlanetScale metadata confirms `lythaus/lythaus-core` is PostgreSQL
with only production `main`. Feed schema inspection confirms existing
notification, delivery-preference and redacted-device storage. No personal
notification content or live rows were read. Registry resources, feature
flags, provider configuration and production schema/data are unchanged.

## Demonstrated defects and correction

Thirteen new delayed-response provider tests fail against unmodified main.
Six rendered tests copied into a detached checkout of the same exact main
also fail, covering refresh recovery, repeated navigation and a receipt
arriving after another route becomes current, at 390px and 1440px.

The client now preserves acknowledged read/dismiss actions across later list
responses, deduplicates IDs, rejects repeated/cyclic cursors without appending
rows, and clears pagination errors after successful retry. Refresh failures
retry the first page, including when no pagination cursor remains.

Per-notification pending actions issue at most one concurrent write. Boolean
results describe an acknowledged action independently of the current page.
Uncertain transport results retain rows and show confirmation/recovery text;
explicit refresh can reconcile an operation whose server reply was lost.
Reads retain a nullable server timestamp rather than inventing one locally.
Read/dismiss outcomes invalidate the separate unread-count read, including
uncertain results; an older count cannot replace its refreshed generation.

Authentication-required mutation results clear the private list and fence
older list reads. Existing synchronous session revision, cancellation,
JWT-subject binding and guest protection remain intact. A navigation guard
permits one destination at a time and rejects late navigation after Back,
an account change, or another route becoming current.

Preference reads use a request generation so an older result/error cannot
replace an acknowledged save or newer read. A pending preference save blocks
overlapping loads and rejects another write. The existing error/reload UI
still obtains authoritative server values after a failed save.

Confirmed ID sets and cursor history are memory-only and belong to the
existing session-scoped controller. Read/dismiss are monotonic operations in
the current contract; neither endpoint supports undo. Fresh first-page reads
reset cursor history, and a new authentication session gets a new controller.

## Requirements, code and regression evidence

| Requirement | Code | Tests |
| --- | --- | --- |
| Stale pages cannot reverse confirmed actions | `NotificationsController._reconcile`, `markAsRead`, `dismiss` | Delayed refresh/page × read/dismiss; overlapping IDs; uncertain dismissal retained until explicit read |
| Truthful pagination and recovery | Captured cursor, `_visitedCursors`, `loadMoreFailed`; centre retry callback | Repeated cursor, cursor cycle/reset, failed-page retry then another page; last-page refresh retry at both widths |
| Private account isolation and session revocation | `_requireAuthentication`, existing service session fences; centre epoch and route checks | Real Dio/provider A→B→A; mutation 401 with stale refresh; existing logout/reentry, delayed token, guest and foreign-owner cases |
| Reliable mutation and unread reconciliation | Per-ID pending set, explicit result, `onUnreadChanged` callback | Repeated pending reads; four real-provider read/dismiss × confirmed/uncertain count tests with late older counts |
| Existing destinations and Back | Centre `_opening`, captured `ModalRoute.isCurrent` | Repeated clicks, Back after destination, Back before receipt, inactive route, failed-read retry and unknown destination at both widths |
| Preference request ordering | `PreferencesController._requestEpoch`, `_updating` | Older read/error after save, latest read wins, repeated save/load while saving; existing native toggle acknowledgements and account-switch rendered tests |
| Truthful empty/loading and native preference contract | Existing screen branches, preserved native parsing | Pending load becomes empty only after response; existing guest/error states; native five-boolean payload, no quiet-hour/timezone controls or invented links |

## Validation

At the final production source and initial 18 rendered cases:

- `bash scripts/test-with-coverage.sh`: 3,202 PASS, six existing skips,
  zero failures; total coverage 88.77%.
- `bash scripts/check_coverage_gates.sh`: PASS, total/P1/P2/P3 gates intact
  (88.77%/89%/91%/86%). No baselines were changed.

At the final test source, including two additional failed-read/unknown-link
cases and deterministic icon loading:

- `flutter test --no-pub test/features/notifications test/core/routing/deeplink_router_test.dart test/screens/guest_account_entry_test.dart --reporter expanded`:
  134 PASS, zero failures/skips, including 20 new rendered mobile/desktop cases.
- `flutter analyze --no-pub`: PASS after scoped formatting/type corrections.
- Scoped `dart format --output=none --set-exit-if-changed` and
  `git diff --check`: PASS.
- `bash scripts/cf-pages-build.sh`: PASS, release host and security-header
  checks intact. Existing Wasm dry-run warnings remain; no Wasm build is claimed.
- `npm run typecheck:native`: PASS.
- `npm run openapi:test:contract`: 70 PASS, 17 existing skips.
- Native notification policy tests: 2 PASS.
- `npm run validate:planetscale-postgres17`: PASS on a new disposable local
  PostgreSQL 17 container/database, including migration checksums, grants,
  forbidden privileges and rollback checks. This validates schema compatibility,
  not a new end-to-end notification delivery path.
- Existing release `native-notifications.browser.mjs`: Chromium 390px/1440px
  PASS. Both WebKit cases fail before launching the app: host validation
  reports `libGLESv2.so.2` unavailable in the system loader cache. The packaged
  library is available through the local library path, but that does not
  satisfy Playwright's independent `ldconfig -p` check. A WebKit-only rerun
  reproduces the same pre-launch failure. Fixture listeners left open after
  failed launch cause the outer 180-second run timeout. No host check, test,
  assertion or workflow was disabled or weakened. WebKit app assertions are
  unrun locally; exact-head hosted CI remains separate evidence.

The initial new rendered fixture stalled on test-clock scheduling and was
stopped; corrected fixtures pass. Popup-menu route counting was corrected to
count page destinations. Existing settings tests still emit their prior
hit-test warning; this slice does not suppress it or claim physical-device QA.

Regenerate synthetic screenshots with
`NOTIFICATION_SCREENSHOTS_DIR=/tmp/notification-screenshots flutter test --no-pub test/features/notifications/presentation/notifications_lifecycle_test.dart`.
Captured and visually inspected mobile/desktop refresh-error and unconfirmed-
dismissal PNGs are available under that directory. Provider/unit baseline
failure logs, rendered baseline failures and final logs are in
`/tmp/notification-*.log`. Generated coverage artifacts are local evidence,
not part of the source change.

## Remaining gates and rollback

GitHub denied `GET /repos/AsoraKK/Lythaus/branches/main/protection` with HTTP403
`Resource not accessible by integration`. That operation was stopped without
another route to obtain protected settings. The parent must certify the
required-check set and coordinate independent review and serialized integration.
Draft head, verified remote SHA and exact-head CI results belong in the PR
handoff; historical main or earlier-head checks do not certify the draft.

Native notification payloads currently provide a generic title/type/entity ID
without a destination or post preview. Existing compatible deep links remain
supported; this slice does not derive a post destination from an ambiguous ID.
Any new server destination/payload policy would require parent allocation of
`apps/lythaus-public-api/src/index.ts` and `api/openapi/product-integrity.yaml`,
with posting/moderation review. Private or under-review post previews are not
introduced. Canonical preferences expose only five delivery booleans;
quiet-hour/timezone editing needs an approved server contract/schema and product
decisions. Existing unavailable behavior and disabled features are preserved.

Owner native/browser, cross-device and complete social-post/delivery acceptance
remain pending Sunday October 11. No live push/email, credentials, activation,
paid resources, migration, merge or deployment occurred. Rollback is a reviewed
revert of the scoped client commit; there is no database or provider rollback.
