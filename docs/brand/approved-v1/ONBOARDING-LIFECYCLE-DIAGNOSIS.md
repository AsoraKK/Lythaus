# Controlled onboarding lifecycle diagnosis

PR1045 review head `65c54da2fed08cd9121fd1158d9557e345c911d2` and its required
24-case matrix remain unchanged. Four static onboarding cases failed in hosted
WPE: light 320/390/1440 and dark 320. The actual `OnboardingIntroScreen` has no
production GoRouter route; this diagnosis does not add one or substitute login.
The isolated baseline is the exact tested merge
`d8bc4611b18db864b9c0e2a124cc8d9134df29ee`, including main's auth-service change.
The diagnostic PR targets a frozen Git baseline branch, not main or PR1045.

Four controls run at each of those four theme/width/scale conditions:

1. Original static setup and original build flags.
2. Identical static setup with the production host's public build defines.
3. Configured static setup plus the same fixture presentation wrapper as (4).
4. Original production bootstrap and LythausApp lifecycle, router and providers,
   displaying the actual onboarding widget in a fixture-only Navigator while the
   existing router stays mounted offstage. The real signed-out URL remains `/login`;
   it is not an onboarding URL. The visible widget is verified to be onboarding.

All controls add the same on-demand read-only geometry getter. It changes
compiled bytes, and cannot exclude an observation effect. The original static
fixture's auth override remains unchanged; no artificial auth transitions are
introduced. The production host uses real auth initialization, with only the exact
refresh POST fulfilled locally as signed out. All other external traffic is
rejected except existing pinned engine fonts.

Control order rotates across the four conditions, so each variant runs first,
second, third and fourth once. Each observation starts a fresh browser process,
blocks service workers, uses
reduced motion and captures once at 250ms and once at 5250ms after the natural
`flutter-first-frame` event. Semantics stays disabled throughout. No input,
scroll, resize, frame request, callback pump, RAF loop, canvas wrapper or repaint
is added. Geometry polling uses a timed read, not a RAF loop. Original PNG bytes,
fractional geometry, asset hashes, source construction and network/errors are
retained. SVG fidelity uses the existing thresholds and contained layout box.

The static-host control tests whether the presentation wrapper alone is enough.
The production-host comparison still changes bootstrap, real provider/router
lifecycle, offstage content and existing font configuration together: it cannot
attribute a difference to auth alone, a GPU cause or any single initialization
step. A positive host result is not a shipping onboarding route or permission
to change acceptance. Blank outcomes remain recorded; successful diagnostic
collection is not a passing required brand gate.

The actual onboarding Continue callback still uses the existing synthetic
Navigator marker. A companion widget test verifies it without adding startup
interactions to the browser observations. Required acceptance files and thresholds
are untouched. This isolated diagnostic branch must not be merged or deployed.
