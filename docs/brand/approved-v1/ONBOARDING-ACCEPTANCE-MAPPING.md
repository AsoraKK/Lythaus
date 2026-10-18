# Onboarding component-host acceptance mapping

This intentionally changes the six onboarding cases from cold synthetic startup
to presentation of the actual OnboardingIntroScreen in a visibly painted,
settled signed-out app. It is a fixture-only acceptance repair supported by
independently reviewed PR1048 evidence, not a cold-static renderer fix or a new
shipping journey. The production screen remains deferred from production route
integration; no new GoRoute, app, Navigator or provider override is introduced.

All 24 unique cases per engine remain required: six each login, onboarding,
shell and admin, at light/dark and 320/390/1440px. Flutter scale is 2 at320 and
1 at390/1440. Both engines run even if the first fails, every case is collected,
and any failed component case fails the aggregate. The six repaired login cases
and six awaited-auth companions, shell and admin paths are preserved.

## Complete old-to-new assertion mapping

| Original assertion or behavior | Current assertion and saved evidence | Scope or retained coverage |
| --- | --- | --- |
| Six onboarding theme/width combinations | Same six keys, dynamic viewport/scale/theme and black/white SVG selection | No skipped, duplicate or replaced matrix cases; unchanged matrix guard rejects omissions. |
| Cold static app with fake signed-out auth/analytics | Real lib/main.dart bootstrap, AuthStateNotifier and GoRouter; original visible login must paint before component presentation | Intentional host-scope change. No claim that cold startup is repaired. Original static code remains intact as a separate geometry reference. |
| Actual OnboardingIntroScreen | Same unedited widget and policy copy on one test-only PageRouteBuilder using the existing Navigator | No copied screen or production route. Detached helper imports never enter deployed main. |
| Original theme, text scale and disableAnimations:true | Read-only layout records actual inherited theme, scale, animation policy, every text/brand rectangle | Exact equality against a separate original-static geometry reference for each of all six combinations and both captures. |
| One named Lythaus image | Exactly one image after original captures; semantic bounds agree with saved fractional geometry within0.02px | Covered login route is not onstage; read-only traversal registers no inherited dependencies. |
| Brand has at least4 colors,16 painted pixels and fraction>0.003 | Unchanged predicate on saved original brand PNG; headings and top900px surface must also paint | Both250/5250ms component originals fail closed before reference pages, semantics or scrolling. No later image rescues a blank original. |
| Native SVG precision/recall>=0.9 and difference<0.04 | Same helpers/thresholds against the correct light/dark canonical SVG using saved original bytes | Reference pages open only after all login/component originals pass pixel checks. |
| Onboarding layout box / wordmark crop | Original fractional Dart bounds saved before/after each image; contained wordmark crop | No ink-derived crop. Exact static/component and before/after geometry equality, all six conditions. |
| Policy headings and copy | Every existing heading, description, policy line and Continue checked in layout and later semantics | Original product text unchanged. |
| Up to20 post-semantics screenshot retries plus QA overlay | Two immutable original component captures at250/5250ms targets from presentation request; separate later semantic PNG | Intentional stronger fail-closed protocol, not equivalent timing. Actual timestamps and hashes saved. No retries overwrite originals. |
| Semantics activation before interaction | Activate only after original captures and fidelity checks; exact named image/copy checks | No semantics or artificial focus/resize/scroll stimulus before original captures. |
| Four favicon/apple-touch links and hashes | Same count, manifest paths, HTTP200 and SHA256 checks | Actual results saved for each case. |
| Continue reachable with up to12x400px scrolls and120ms waits | Same bounded ordinary scroll/click plus explicit visible button bounds | Scroll observations and signed-out/guest:false state saved. |
| Actual Continue callback reaches synthetic marker | Same marker text via same Navigator; save final settled marker PNG and route state | One app/Nav identity across login, component and marker; URL stays/login. Not a shipping destination or browser Back journey. |
| No unexpected network/page/render failures | Unmodified normal observeRenderHealth/assertRenderHealth, pinned fonts, exact refresh401 exception only | Raw health retained, unexpected traffic rejected. Existing browser RAF/context instrumentation retained; no new Dart frame hook. |
| Static fixture has no app transport | Real login requires exactly one completed refreshPOST401 with exact body SHA before presentation | Fulfillment and request-finished timestamps required. No logout, Discover, fabricated provider state or held refresh. |
| No pre-capture user interaction | Passive event record and explicit rejection of focusin, resize, pointer/touch/key/input/change/wheel/scroll from presentation through both captures | Natural initial Flutter-view focus before presentation is retained. Both before/after observations plus final-original boundary checked. |
| Fixed signed-out fixture | guest:false, signed-out auth, no pending authenticated work and one app/Nav required at every recorded lifecycle/scroll boundary | Duplicate presentation rejected without state change. Guest transition remains covered separately by unchanged login cases. |
| Original stack/callback contract | Six route companions run in ordinary flutter test --coverage | Verify zero durations, no requested focus, inherited theme/scale, actual Continue, one Navigator and normal stack restoration. |
| Login focus/draft/resize and awaited guest callback | Unchanged login browser path and six existing normal-coverage companions | No callback, provider, feed or auth implementation edits. |
| Shell composer→Discover→empty feed, disabled controls, decorative semantics and24px symbol fidelity | Unchanged six shell cases | Existing shell fixture and assertions retained. |
| Admin flags→audit and icons/layout | Unchanged six admin cases | Existing admin fixture and assertions retained. |

## Fixture construction and original evidence

The normal immutable release is built before diagnostic fixture preparation.
`scripts/build-brand-onboarding-fixtures.sh` creates detached worktrees and
copies the test-only probe/route/geometry helpers there. Source contracts strip
those additions back to the original main plus the existing test scale/login
geometry wrapper. Production `lib/` is unchanged by this acceptance repair.
Helpers request no frame, repaint loop, semantics, focus or provider overrides.

Each onboarding case first runs a separate original-static reference context
with only the read-only geometry getter added. Its original entry, fixed auth
and animation policy are retained. Reference pixels, bounds and hashes are
saved; static blankness is labeled negative reference evidence, never a passing
component result. The reference app is closed before the real host starts.
All40 asset/CanvasKit hashes must match the two real scale builds. Complete
inventories, source construction and compiled script hashes are saved.

The real host saves original login images at250/5250ms from natural first frame.
Brand, Email and Password must paint with original fractional geometry. Only
after exact refresh completion and settled-state checks does one zero-transition
presentation request start the component captures. All SVG reference pages,
semantics, icon/scroll/Continue checks happen afterward. The normal marker
transition gets a bounded postinteraction wait; this cannot alter originals.

[Archived PR1045 cold-static evidence](https://chatgpt.com/api/library/files/libfile_549ddb29b1dc81918bf97fa478649caf/download)
is bound to head `65c54da2fed08cd9121fd1158d9557e345c911d2`,
tested merge `d8bc4611b18db864b9c0e2a124cc8d9134df29ee` and run39079706325.
Archive SHA256 is `439128aaafea077e40cf10d567426e7f5fd118cdde744377d09c2d724561c633`.
WPE light320/390/1440 and dark320 failed; dark390/1440 passed. Per-case PNG
hashes are retained in `ONBOARDING-COLD-STATIC-ARCHIVE.json`.

[Reviewed PR1048 diagnostic evidence](https://chatgpt.com/api/library/files/libfile_dc39f8e0c944819192edeb96bfcbad42/download)
remains frozen at `c2fd06dc501d35bb78a2b75e2bcde5f2b8aca2b4`. PR1046/1047 controls
and the unexecuted held-auth draft remain preserved. No earlier failure is
rewritten. This acceptance migration does not isolate a renderer root cause,
prove background callbacks have stopped, certify cold startup, real Safari
devices, performance or a shipping onboarding route. Those limits and deferred
production-screen integration remain explicit. Exact-head CI and independent
review are required before any coordinated merge/deployment.
