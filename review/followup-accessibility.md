# Affected-screen semantics follow-up

Source revision: main checkout `c0963c36693476ecc49ab1fcba0572454926b4d3`. The test mounts actual FeedCard, CommentThreadScreen, and RewardsDashboard widgets with local synthetic state; no provider or production service was contacted.

`test/review/affected_screen_accessibility_test.dart` loads the app's bundled Manrope Regular, Medium, SemiBold, and Bold fonts plus Material Icons, matching the font setup in `test/ui/design_review_test.dart`. This matters for layout assertions: an earlier run without the bundled fonts showed a 318px overflow at 320×640, but that run used fallback Ahem glyphs and is superseded. With the real bundled fonts loaded, the final bounded test reports no overflow at any of the three viewports.

Command:

```sh
source /workspace/.lythaus-tools/activate.sh
flutter test --no-pub test/review/affected_screen_accessibility_test.dart
```

Result: **4 passed, 0 failed** ([raw output](semantics-final.log)). The responsive case checks 320×640, 320×900, and 390×844 at text scale 2.0, DPR 1.0, and `LythausTheme.light()`. It checks the reply field and send action remain discoverable in the semantics tree, Send reply remains a button with a tap action, the button target remains at least 48 logical pixels high, and no framework layout exception is collected. The 48px check is the existing Flutter/Material minimum interactive target convention; this test does not claim WCAG conformance or validate a real screen reader. The superseded fallback-font overflow output is kept in [semantics-provisional-ahem.log](semantics-provisional-ahem.log) for audit only.

The other three cases verify FeedCard's Post actions tooltip/button/tap action and target size, the comment field's Write a reply text-field semantics plus Send reply semantics, and the Rewards failure state's enabled Retry button. Those results establish semantics exposure and actionable controls in the widget tree only.

The responsive test rasterized screenshots before collecting layout exceptions. SHA-256 hashes for the final bundled-font renders:

| Fixture | Viewport | SHA-256 |
|---|---:|---|
| `screenshots/comment-thread-320x640-200pct.png` | 320×640 | `51b6491f922715b9025d67233a10f87f1946dd29980a16730f56df042ba95738` |
| `screenshots/comment-thread-320x900-200pct.png` | 320×900 | `3b5dc54c69e2eaf8a6f9e721b2517d5baf55d435c15f353cc021beb712a521c0` |
| `screenshots/comment-thread-390x844-200pct.png` | 390×844 | `e5f3d6a1ad1ed532b60481fffcef9ce428caaa6564504cc2da3e7d5f27662430` |

The failed fallback-font overflow observation is not filed as a product defect. No production UI code was changed.
