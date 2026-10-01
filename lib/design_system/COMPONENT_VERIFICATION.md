# Design-system verification

Baseline: `8e3b3ebad2f846e61db2bfe819376723da7e9863`.
Toolchain used: Flutter 3.44.2 / Dart 3.12.2 on Windows. The repository declares
Flutter 3.32.0; no SDK or dependency requirement was changed.

The untouched baseline design-system suite passed 120 tests. It was also run
against the pristine baseline worktree with only the screenshot comparator's
fraction correction temporarily overlaid: all 120 passed. That overlay was then
removed. No baseline production behavior was changed.

Two pre-existing verification defects were corrected:
- Contrast previously used an exponent of 2 instead of the sRGB exponent 2.4.
  A known mid-gray reference and alpha-compositing tests now check the helper.
- Screenshot comparison used a fraction against 15 rather than 0.15, accepting
  arbitrary differences. A regression test now checks that 20% and 100% fail.

New foundation checks cover shared token drift; normal text, action, control
and feedback contrast in both appearances; 320-pixel layouts at 200% text;
stable busy-button geometry and submission blocking; reversible named password
visibility; and reduced-motion changes while skeletons are visible.

The first post-change suite run passed 124 checks and failed six Flutter golden
comparisons (button, field and static wordmark, each appearance). Those failures
reflect intentional theme changes and have not been treated as baseline success.
Their before/after files are preserved outside source under
`C:/Users/kylee/AppData/Local/Temp/lythaus-design-evidence/reviewed-foundation-golden-differences/`.
All six before/after image pairs were inspected. The new fields replace a
clipped error field and duplicated error message with natural height and one
associated message; boundaries are visible in both themes. Static wordmark
source and geometry are unchanged and inherit the theme's local font and colors.
Button fixtures now provide callbacks for the four active variants (previously
all were disabled), and their loading indicator is deterministically static
under reduced motion. Both resulting active-button images were inspected again.
The foundation suite refreshed these six Flutter baselines:
`lyth_button_light.png`, `lyth_button_dark.png`,
`lyth_text_field_light.png`, `lyth_text_field_dark.png`,
`lyth_wordmark_light.png`, `lyth_wordmark_dark.png`.
Assertions and the documented 0.15 fractional tolerance were retained. No
homepage baseline was updated.

The later full suite exposed two stale legacy onboarding goldens after the same
comparator correction. Their stored policy copy predates the unchanged baseline
Dart source. Both before/after images were inspected; the test harness now loads
Material Icons so the lock renders as a lock rather than a missing-glyph box.
Those two onboarding PNGs were refreshed for the existing policy and intentional
theme change. Their source screens and policy copy were not edited. Original
comparisons remain in `reviewed-onboarding-golden-differences/` beside the other
evidence. No assertion or tolerance was relaxed.

The composer and analytics-settings suites passed 53 tests, including 320-pixel
layouts at 200% text in both themes and scrolling through composer proof actions.
Their original service providers, analytics-consent logic, moderation results,
policy copy and submission callbacks remain in use.

The final combined foundation, comparator, composer and analytics-settings run
passed **184 tests**. Scoped analysis of the foundation, these two product
surfaces and their changed tests reported **no issues**. Baseline scoped
foundation analysis also reported no issues. Formatting is checked with the
installed Dart formatter; SDK generated-file changes are excluded from this work.

This document is evidence for the shared foundation, not a claim that all app
journeys, real infrastructure, native screen readers or production are verified.
The route migration matrix and final task evidence contain the wider result.
