# Startup and sign-in wordmark light

**The local Chromium and WebKit browser matrix passes.**

An earlier WebKit 26.5 run stopped on a glow frame when reduced motion was
enabled during sign-in. Temporary instrumentation confirmed that the preference
listener, static widget build and paint ran, and that the new static marker
reached the connected canvas's default WebGL framebuffer; the browser screenshot
still showed the preceding glow. The loading widget now requests one additional
presentation frame after switching to reduced motion, guarded by mounted and
active state, with no timer or continuing animation. The diagnostic marker and
render probes are not part of the implementation.

The startup screen removes the visible opening caption. Its screen-reader
status remains available; slow-load and failure messages and the retry button
remain visible when needed. The approved website wordmark reveals once, then
its light sweeps every three seconds while startup or sign-in remains pending.
The ivory letters stay readable between subsequent sweeps.

`web/index.html`, `web/startup-presentation.css`, and
`web/startup-presentation.js` own the pre-Flutter presentation.
`LythLoadingWordmark` uses the existing generated approved SVG paths, and only
the brand slot in `AuthChoiceScreen` changes. Its initial reveal, projection,
reflection, afterlight, bloom, fixed central source, colors and timing follow
the marketing site's `OpeningWordmark.astro`, `home-opening.css`, and
`home-opening.js` at base `23c607268b20102dc7014f0a0ceaf8511f9df7ed`.
No marketing-site files, assets, dependencies, authentication decisions,
session logic, backend, database, shell or navigation changes are included.

Readiness removes startup immediately; errors stop its animation and retain
retry. Disposal cancels animation and restores the Flutter view's prior inert
state. Hidden pages pause; resuming does not replay the completed initial reveal
or catch up missed cycles. Flutter also pauses behind another route and when
TickerMode is disabled. Reduced motion uses a static approved wordmark, including
when the preference changes while loading. Re-enabling motion keeps the
already-visible letters settled in both startup and sign-in; it resumes the
light without replaying the initial reveal. Sign-in is announced once through
Flutter's polite live-region mechanism, independently of animation frames.
The conditional `loading_motion_preference_web.dart` listener supplies the
browser media preference because this Flutter web runtime does not map it into
MediaQuery. Its native stub retains the platform's MediaQuery behavior. The
listener is removed on disposal; it does not change global accessibility state.

## Local validation

The target flow is startup -> pending synthetic session restoration -> ready
login -> pending synthetic sign-in -> actionable failure and static wordmark ->
synthetic guest entry. Successful sign-in and disposal are covered by widget
tests. No real account or provider operations are performed.

Make Flutter and the project's installed Node dependencies available before
running the commands. Set `WEBKIT_EXECUTABLE` to the local WebKit executable;
set `LOADING_EVIDENCE` to override the default temporary output directory.

```sh
flutter pub get --offline
node --test scripts/tests/approved-brand-assets.test.mjs scripts/tests/startup-presentation.test.mjs scripts/tests/flutter-bootstrap.test.mjs
flutter analyze --no-pub lib/design_system/widgets/lyth_loading_wordmark.dart lib/design_system/widgets/loading_motion_preference_stub.dart lib/design_system/widgets/loading_motion_preference_web.dart lib/features/auth/presentation/auth_choice_screen.dart test/design_system/lyth_loading_wordmark_test.dart test/features/auth/presentation/auth_choice_screen_test.dart
flutter test --no-pub test/design_system/lyth_loading_wordmark_test.dart test/features/auth/presentation/auth_choice_screen_test.dart test/features/auth/presentation/brand_login_navigation_contract_test.dart test/features/auth/presentation/invite_redeem_layout_test.dart
source cloudflare/pages-release.sh
flutter build web --release --no-pub --no-tree-shake-icons --no-wasm-dry-run --no-web-resources-cdn --dart-define=ENVIRONMENT="$ENVIRONMENT" --dart-define=API_BASE_URL="$API_BASE_URL" --dart-define=AUTH_URL="$AUTH_URL" --output build/loading-web
node scripts/tests/loading-wordmark.browser.mjs
```

Browser evidence was collected outside the repository: `results.json` and Chromium 151 /
WebKit 26.5 captures at 390x900 and 1440x900. Each case checks the first reveal,
three-second repeat, simulated hidden-page pause and resume, reduced-motion
changes during a visible sweep, an actionable error and preference-listener
removal. Seven samples spanning at least 3.9 seconds must each match both the
idle logo and an expanded region covering the glow, while sign-in remains
pending. Startup resumption also compares the full visible artwork; the small
allowed channel difference covers masked-SVG edge antialiasing. Error artwork
uses one-pixel edge alignment because the centered form can shift fractionally.
The runner serves the actual production `lib/main.dart` build through a local
TLS proxy, with synthetic API responses and no live authentication requests. It
records the exact visible sign-in error; the final matrix received invalid
credentials in all four cases. A previous 1440-pixel Chromium run reached the
existing sign-in timeout while the fixture was held, and is retained separately.
Unit tests also cover 96/144/200/320-pixel approved artwork bounds, 2x text,
keyboard access, the resumed three-second cycle, one final presentation frame,
and immediate success/error/disposal stop.

Focused local results: 30 Node tests and 49 Flutter tests pass; targeted
analysis, formatting, the production web build and all four browser cases pass.
`results.json` records source and compiled-artifact hashes. A separate source
receipt binds those tested bytes to the review commit without changing the
recorded checkout HEAD. Earlier failure evidence remains in private storage.

The Browser plugin was unavailable, so the installed Playwright browsers were
used. WebKit uses the environment's explicit executable and bundled library
path; default host-library discovery does not detect those libraries. Chromium
ReadPixels GPU-stall warnings caused by screenshot readback are retained as
environment warnings, separately from application errors. Browser checks do
not certify physical devices or real assistive technology.

This is a local review bundle, not CI, merge or deployment approval. Any remote
publication and integration are coordinated by the parent task.
