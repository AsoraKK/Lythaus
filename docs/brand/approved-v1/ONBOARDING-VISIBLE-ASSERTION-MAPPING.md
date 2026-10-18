# Settled visible-host component diagnostic: assertion mapping

This is acceptance research for the actual OnboardingIntroScreen in a settled
visible app. It is not a shipping onboarding journey, a new production GoRoute,
or proof of cold standalone startup. PR1045's required 24-case matrix and its
four cold-static failures remain unchanged. PR1046 and PR1047 evidence is frozen.
The held-auth draft is not used.

At light 320px / 2x text, the real login is visibly bootstrapped without a wrapper
or second Navigator. Original login PNGs are saved at least250ms and5250ms after
natural first-frame, before semantics or interaction. Brand, Email and Password
pixels must be painted. The exact refresh POST401 response must finish with its
expected body hash; auth must be signed out, guest false, and pending authenticated
work false. Only then can the fixture present the actual onboarding component
through that same Navigator using a zero-duration route with requestFocus false.
Its inherited theme/scale/copy/layout remain intact and disableAnimations is true.

The original static diagnostic reference from PR1046 is rebuilt byte-for-byte:
main.dart.js SHA-256 ea2c11f189ee59b36b4cb16f97cb1ec8f43fc05c95df8b8566ce73f32657ede9.
It already includes the common read-only geometry probe. This is distinct from
PR1045's unchanged required static build; the diagnostic does not silently replace
that cold-static coverage. Both diagnostic controls run in fresh browser processes
in Chromium and WPE, static first, with identical assets/CanvasKit files.

## Complete old-to-new assertion mapping

| Existing assertion or behavior | Bounded diagnostic counterpart | Limit or retained coverage |
| --- | --- | --- |
| Required 24 unique cases: login/onboarding/shell/admin, light/dark, 320/390/1440 | No matrix file or required workflow changes; separate light320/2x static and visible-component comparison in both engines | Other sizes/themes/screens are not recertified here. All original cases remain required. |
| Actual OnboardingIntroScreen and existing policy copy | Same widget file; all headings, policy lines and Continue appear in read-only layout data | No substitute login, copied screen or edited product copy. |
| Static onboarding entry with fixed signed-out auth and analytics | Exact PR1046 original-static diagnostic binary retained; its original setup is untouched | Common geometry probe already changes bytes relative to required PR1045 entry. Required cold-static gate remains separate. |
| Original onboarding MediaQuery with scale2 and disableAnimations true | Actual component inherits scale/theme and copies only disableAnimations:true on its fixture route | All recorded component geometry must exactly match static at both captures. |
| Login pre-semantics first-paint proof | Saved real login PNGs at250/5250ms with original brand/Email/Password fractional rectangles and pixel assertions | SVG fidelity is computed from those saved bytes after all untouched component captures, avoiding a reference-page focus change before presentation. |
| Real signed-out refresh handling | Exact POST401, expected body hash, fulfillment and request-finished timestamps before presentation; signed-out state and no pending authenticated work | No fabricated provider state, logout, guest transition or Discover request. This is not the login guest-flow test. |
| Production router/bootstrap/root lifecycle | Original main and MaterialApp.router preserved outside existing scale clamp and fixture probe installation | No production GoRoute; imperative diagnostic route leaves URL /login. |
| Navigation to synthetic continuation marker | Actual Continue callback pushes the same marker text on the same Navigator | This remains a component callback contract, not a shipping onboarding destination. |
| One named Lythaus image; decorative brand must not duplicate it | Exactly one named image after untouched captures; visible AuthChoiceScreen count zero on onboarding | Existing shell/decorative behavior stays covered by the unchanged required matrix. |
| Brand layout box and contained wordmark crop | Exact fractional Dart geometry before/after each original PNG; exact static/component layout equality; semantic image box agrees within original0.02px tolerance afterward | No ink-derived crop or replacement of failed original PNGs. |
| At least4 colors,16 painted pixels and painted fraction greater than0.003 | Same shared regionPixels predicate for brand, plus headings and top900px surface | Existing thresholds unchanged; headings/surface strengthen the diagnostic. |
| Native SVG precision/recall at least0.9 and normalized difference below0.04 | Same compareApprovedArtwork/artworkFidelity helpers, using original saved PNG bytes | Reference pages open only after all original captures. Blank static results remain explicit. |
| Up to20 post-semantics capture/retry attempts with a QA overlay | Two fixed untouched component captures at250/5250ms from presentation request; separate post-semantics image retained | The retry/overlay behavior is not claimed equivalent or silently used to rescue a failed first capture. Existing required gate remains unchanged. |
| Activate semantics and wait for brand image | Same semantics activation after all untouched captures; exact brand count and both headings checked | Semantics remains disabled throughout original login/component/static captures. |
| Four approved favicon/apple-touch-icon links and hash checks | Same count, manifest resolution, HTTP200 and SHA-256 assertions after original captures | Actual icon results are saved. |
| Scroll up to12 times by400px with120ms waits to reach Continue, then click | Same bounded scrolling and button click after captures, plus explicit reachable bounding-box check | Scroll positions and marker outcome are saved. No scrolling occurs before captures. |
| No console/page/network failures, crashes, context loss or unhandled rejection | Unmodified normal observeRenderHealth/assertRenderHealth; exact expected refresh401 exception only, with raw health retained | Its existing RAF heartbeat and getContext wrapper remain. RAF heartbeat is not a count of Flutter frames. |
| Original pinned engine font responses and resource validation | Same font fixture; all40 asset/CanvasKit hashes match between builds; full inventories retained | Bootstrap and component helper bytes differ from prior builds and are disclosed. |
| Login draft/focus/resize, guest destination and shell/admin checks | Not moved into this component experiment | Those separate assertions remain unchanged in PR1045; no coverage is discarded. |
| Cold startup without prior app navigation | Original static reference remains captured and assessed independently | Visible component presentation has a warm, settled host. It cannot certify cold startup. |

New navigation evidence records one MaterialApp and one Navigator, Navigator
identity across login/component/marker, configured page names, current component
route, URL and timestamps. A repeated presentation request must be rejected
without changing state. A widget companion verifies zero transition, no requested
focus, one Navigator, inherited theme/scale, true animation policy, Continue and
normal stack restoration. The browser does not claim a shipping Back journey.

No frame request, repaint loop, new animation pump, focus/scroll/resize stimulus or
semantics activation is added before original captures. Normal route presentation
is the intended stimulus. Existing health instrumentation is explicitly retained.
No per-Flutter-frame tracing is added, so this does not isolate a renderer root
cause or prove every background callback has ceased. One observation per control
per engine limits generalization. No acceptance-host change is proposed here.
