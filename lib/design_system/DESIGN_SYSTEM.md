# Lythaus design system

The canonical application and support-page system uses **warm editorial precision**:
warm paper or near-black reading surfaces, measured typography, clear controls,
and amber reserved for orientation and primary action. Content is the focus.

The public marketing homepage is a frozen, separate consumer. Do not import these
tokens or styles into its layout, styles, scripts, fonts or assets. The secondary
website layout opts into this system independently.

## Source and platform adapters

`design/tokens.json` defines shared semantic colors, typography, layout, radius,
spacing and motion. `tokens/semantic_colors.dart` is the small compile-time Flutter
adapter. `test/design_system/semantic_foundations_test.dart` checks every color
against the JSON. Flutter does not fetch or parse design tokens at runtime.

Web support surfaces consume the JSON in their opt-in layout. Share semantic roles
and values across platforms; use native Material and HTML controls for behavior.
The application continues to use its existing theme preference and persistence.

`LythAvatar` reserves its diameter and uses an account initial during loading or
image failure. It leaves the source media unchanged. Reaction controls use native
outlined buttons with selected semantics and meaningful icons; public subscription
labels remain distinct from authorship and private reputation.

## Semantic colors

| Role | Flutter use | Meaning |
| --- | --- | --- |
| canvas | `colorScheme.surface` | Full-screen background |
| surface | `surfaceContainer` | Reading panels and fields |
| surfaceRaised | `surfaceContainerHigh` | Menus and secondary containers |
| text | `onSurface` | Primary reading text |
| secondary | `onSurfaceVariant` | Supporting prose and icons |
| muted | `semanticColors['muted']` | Metadata; tested on every reading surface |
| accent / onAccent | `primary / onPrimary` | Links, focus and primary filled actions |
| selection / onSelection | `primaryContainer / onPrimaryContainer` | Selected destinations and filters |
| border | `outlineVariant` | Decorative dividers, non-interactive card edges |
| control | `outline` | Essential field, control and interactive-card boundaries |
| focus | `primary` | Visible focus, plus native focus semantics |
| danger / onDanger | `error / onError` | Destructive action and its label |
| dangerSurface | `errorContainer` | Error feedback surface |
| success, warning, info | `semanticColors[role]` | Distinct feedback with matching `roleSurface` |

Dark references are canvas `#070706`, text `#F2EEE3`, secondary `#C9C3B7`,
muted `#A09A8F`, accent `#F2C98D`. Light uses warm paper `#F7F4EC` and deep
amber `#80551F` for readable small links and controls. Do not use pale amber as
small text on a light surface.

Enabled text pairs are tested at 4.5:1; essential boundaries and focus are tested
at 3:1 across canvas, surface and raised surfaces. Decorative dividers and
disabled controls are separate roles and do not claim enabled-control contrast.
Do not multiply outline opacity for a field boundary or metadata text.

The contrast helper composites a translucent foreground on an opaque background
and uses Flutter's sRGB relative luminance calculation. Passing a translucent
background fails explicitly because its final appearance is unknown.

## Typography and layout

App typography uses **bundled Manrope**, directly through `fontFamily`, without
the previous Google Fonts runtime lookup. Flutter's existing web engine still
attempts a Roboto fallback request in a cold browser; the blocked-network browser
harness records it in both versions. It is not a new typography dependency.
DM Sans is the website body reference. It is not bundled
in Flutter, so Manrope is the documented platform fallback rather than a new
download. The existing five licensed Manrope assets remain unchanged.

| Role | Size / line height | Usage |
| --- | --- | --- |
| display / headline large | 28–32 / 1.2–1.25 | Page hierarchy |
| headline medium / small | 24 / 1.3; 20 / 1.35 | Section hierarchy |
| title large / medium / small | 18 / 1.4; 16 / 1.4; 14 / 1.4 | Compact headings |
| body large | 16 / 1.6 | Posts, articles and input text |
| body medium | 14 / 1.5 | Interface explanations |
| body small | 12 / 1.5 | Metadata and secondary captions |
| labels | 12–14 / 1.4 | Controls; never important policy prose |

Headings use restrained negative tracking; body text uses normal tracking. Never
cap system text scaling. Controls grow in height and labels wrap at larger sizes.

The shared spacing scale is 4, 8, 12, 16, 24, 32, 48, 64. Existing Flutter
`xl = 20` is retained as a compatibility value; use 24 for new major gaps.
Current names are `xs=4, sm=8, md=12, lg=16, xl=20, xxl=24, xxxl=32, huge=48`.
Controls use radius 8, surfaces 12 and dialogs 16. Avatars may remain circular.
Reading width starts at 720 logical pixels; support articles at 760 CSS pixels.

Flutter targets are at least 48 logical pixels. Website controls target 44 CSS
pixels. These are product usability targets, not WCAG AA minimum-size claims.

## Components and states

Import `package:lythaus/design_system/index.dart` for tokens, theme and core
components, or `components/index.dart` for the complete component collection.

- `LythButton`: primary, secondary, tertiary and destructive variants. Busy state
  preserves label geometry, announces progress, and disables duplicate taps.
  Small and medium have a 48-pixel minimum; large has 52. Labels may wrap.
- `LythTextInput` / `LythTextField`: persistent labels, native focus/error
  association, email autofill and password visibility. Errors/helpers occupy
  natural height once, rather than a fixed-height field plus duplicate errors.
  Use `LythTextField` when participating in a `Form`.
- `LythCard`: quiet grouping. Its interactive version has a visible control
  boundary and native ink/focus interaction. `LythCardElevated` remains available
  for existing consumers; avoid elevated cards in long scrolling feeds.
- `LythIconButton`: standard, filled and outlined. Supply a meaningful tooltip.
  Disabled colors come from the native control, not a fixed icon color.
- `LythListRow`: text expands, the whole row is interactive, selection is
  announced, and a precise amber leading line reinforces the selected state.
- `LythChip`: standard, filter and input. Selected filters retain the native
  checkmark and selection semantics. A chip is not a replacement for a button.
- `LythConfirmDialog`: scrollable confirmation content and native action
  overflow. The callback is synchronous; callers own async confirmation,
  reauthentication, pending states and failure recovery.
- `LythSnackbar`: success, error, warning and information use distinct surface
  pairs and named icons. Actions remain readable on their feedback surface.
  Emit success only after the existing service confirms completion.
- `LythSkeleton`: stable dimensions with a modest loading pulse. It becomes
  static when reduced motion is enabled, including changes while visible.
- `LythEmptyState`: an honest empty state with optional valid recovery action.
  Callers must distinguish loading, empty data, denied access and request failure.

Native Material buttons, fields, menus, sheets, dialogs, switches, radios,
checkboxes, tabs, navigation, progress, tooltips and tables receive the same
theme. Prefer native state handling for hover, press, focus, selected and disabled
states. Business busy/error/success state stays with the existing controller.

## Product patterns and trust

Use an amber selected-navigation line, a quiet authorship disclosure area, and
tabular contribution rows to aid orientation. Do not invent trust metrics.
Authorship, security, personhood, reputation, rewards and subscription remain
distinct concepts and must use actual model states.

Keep post text visually stronger than time, identifiers and disclosure metadata.
Provide visible policy requirements in composition; tooltips may supplement
them but must not be the only explanation. Settings group related controls and
keep security and destructive actions discoverable. Rewards preserves separate
weekly, monthly and quarterly contract groups and never substitutes zero for an
unknown balance.

## Motion

New small control transitions use 160 ms and surfaces use 220 ms. Existing
`quick=100ms, standard=200ms, prominent=300ms` aliases remain for compatibility.
Respect `context.disableAnimations` for custom transitions. Busy buttons provide
a static indicator under reduced motion, and skeletons stop their controller.
Do not add page reveals, feed entrance animation or perpetual decorative motion.
The legacy Flutter wordmark widget is not a new animation pattern and its artwork
is not changed by this upgrade.

## Verification and exceptions

Run from the repository root:

```sh
flutter analyze --no-pub lib/design_system
flutter test --no-pub test/design_system test/golden_comparator_test.dart
flutter test --no-pub test/features/feed/presentation/create_post_screen_test.dart test/features/feed/presentation/create_post_screen_extended_test.dart test/features/feed/presentation/create_post_screen_ui_paths_test.dart test/features/privacy/analytics_settings_card_test.dart
```

The foundations test covers all shared color roles, known contrast reference
values, alpha compositing, 320-pixel layouts at 200% text, stable loading geometry,
password visibility and dynamic reduced-motion preferences. These checks do not
constitute a manual screen-reader audit or establish every route's accessibility.

The golden comparator retains its documented 15% cross-platform tolerance, with
the pre-existing percentage/fraction defect corrected. The comparator test proves
that 20% and 100% image differences fail. Homepage comparisons are independent
and must never use that tolerance or adopt a changed baseline.

Update only deliberately changed Flutter golden images after reviewing the
before/after render. See `COMPONENT_VERIFICATION.md` and the repository's route
migration matrix for exact implemented/verified coverage. Keep unresolved
dependencies and untested integration paths explicit.

