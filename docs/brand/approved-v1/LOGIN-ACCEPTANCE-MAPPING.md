# Login acceptance fixture repair

Only the six login browser cases move from `test/browser/approved_brand_entry.dart`
to the real `lib/main.dart` bootstrap, router and providers. The detached fixture
adds a fixed text-scale wrapper and an on-demand, read-only layout getter. The
production source is unchanged. No frame requests, painter changes or CPU
rendering overrides are introduced.

Each browser engine must execute 24 unique cases: login, onboarding, shell and
admin, each in light/dark at 320/390/1440px. The 320px Flutter cases use 2× text;
the other widths use 1×. Case failures are collected and still fail the gate.
Both engines execute even when Chromium fails.

| Previous assertion | Current assertion and evidence |
| --- | --- |
| One named Lythaus image on login | Unchanged; also matches the fractional brand box saved before semantics. |
| Nonblank brand after semantics | Unchanged (at least four colors, 16 painted pixels and fraction greater than 0.003). Added original pre-semantics PNG: brand and both real input-field rectangles must pass the same nonblank test. |
| Native SVG fidelity | Unchanged precision/recall ≥0.9 and normalized difference <0.04. Also applied to the saved first-paint brand using `containedWordmarkRect` on real fractional layout, never ink-derived bounds. |
| Four icon hashes | Unchanged, checked against the integration manifest. |
| Real email focus, draft text, resize away and back | Unchanged; the focused input must retain `draft@example.invalid`. |
| Login guest button reaches synthetic Navigator marker | Browser now requires real AuthStateNotifier logout, real GoRouter `/`, Discover navigation and `No posts yet`. Six normal-suite companion widget tests preserve the actual AuthChoiceScreen → awaited auth → callback → Navigator marker chain, including pending-future negative assertions and exact once counts. |
| Onboarding Continue reaches synthetic marker | Unchanged in all six onboarding cases and its original fixture. Any static onboarding rendering failure remains a failure. |
| Shell composer → Discover → empty feed | Unchanged in all six shell cases, including disabled feed controls, named/decorative semantics and 24px symbol fidelity. |
| Admin flags → audit | Unchanged in all six admin cases. |
| No unexpected network or page errors | Retained. Login alone fulfills exact refresh POST→401, logout POST→200, public Discover GET→empty feed and their matching CORS preflights. Only the exact, fulfilled refresh resource's expected 401 console error is accounted for; raw health and requests remain in evidence. Other external traffic is rejected except the existing pinned Flutter fonts. |

First paint is a single saved PNG at least 250ms after the natural
`flutter-first-frame` event, before semantics, focus, scrolling or resize.
The original file is read back for pixel checks. Layout is checked before and
after capture, and against the subsequently activated named-image semantics.
A failed first-paint PNG is never replaced by a later capture. Per-case JSON,
the PNG hash, original geometry, fidelity, raw health and compiled source hashes
are retained with the required browser artifact.

The six widget test names begin `brand login companion`, followed by theme,
width and scale. They live under `test/` and run through the existing
`flutter test --coverage` step. They use the real AuthStateNotifier with a
controlled AuthService future, verify no early callback/navigation, and require
one logout, one completed callback and one Navigator push.

This repair does not establish a production rendering root cause, certify real
Safari/device behavior or authorize release. Merge and deployment remain
coordinated gates after exact-head CI and independent review.
