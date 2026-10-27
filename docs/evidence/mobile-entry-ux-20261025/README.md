# Mobile entry polish, 25 October 2026

This is a presentation-only patch to `InviteRedeemScreen`, based on main
`c0963c36693476ecc49ab1fcba0572454926b4d3` (verified through GitHub and fetched
before implementation). It does not certify authentication, invitation
redemption, publishing, detection or rewards in production.

## Findings and change

1. **Controls become unreachable with reduced height.** The original fixed
   column clips the field and redemption action at 320×340 with 200% text.
   A Flutter regression using 320×568, 200% text and a 280px keyboard inset
   fails on the base with `A RenderFlex overflowed by 228 pixels on the bottom.`
   The candidate uses a safe, scrollable, width-constrained form. A real wheel
   gesture can now reveal the action in the constrained browser viewport.
2. **The secondary entry screen omits the approved identity and error hierarchy.**
   Invite entry now uses the existing standalone `LythBrand`, a screen-reader
   heading, and body-size validation text announced as a live region. It retains
   approved black/white artwork, existing theme colors and bundled Manrope.
3. **Sign-in already uses the approved branding.** Its baseline and candidate
   captures remain unchanged. No sign-in redesign is included.

Only the screen's build method and brand import change in production. Submission,
validation, error mapping, invite persistence, authentication providers, routing
and security logic are unchanged. The source from `_redeemInvite()` to the end
of the file is byte-identical to the pinned base.

## Rendered evidence

The original PNG files are unedited Chromium captures of real Flutter screens.
They contain blank forms and no real account data. The fixture uses synthetic
authentication and null analytics; browser requests outside its local server
are blocked, except pinned engine font bytes served from the existing fixture.
No real account is signed in or invite redeemed. The empty-code error exercises
the production validation handler without making a request.

| Build | Source | Toolchain |
| --- | --- | --- |
| `mobile-ux-before` | `c0963c36693476ecc49ab1fcba0572454926b4d3` | Flutter 3.41.1 / Dart 3.11.0 / CanvasKit |
| `mobile-ux-after` | `8b46b671c8571f821cfefa0799a60699d316d7ca` | Flutter 3.41.1 / Dart 3.11.0 / CanvasKit |

Both use Chromium 151.0.7922.34, device pixel ratio 1 and reduced motion.
The subsequent evidence commit changes only documentation and the browser
capture driver; its production code and Flutter fixture are identical to the
candidate build above. `captures.json` records source, viewport, text scale,
bundle SHA-256 and each PNG SHA-256. The driver uses wheel input to scroll the
painted Flutter view and verifies primary-button pixels inside its visible
bounds; accessibility-DOM scrolling alone is not accepted as evidence.

| Screen / viewport / text | Before | After |
| --- | --- | --- |
| Invite, light, 390×844, 100% | [Before](before/invite-light-390x844-1x.png) | [After](after/invite-light-390x844-1x.png) |
| Invite, light, 320×568, 200% | [Before](before/invite-light-320x568-2x.png) | [After](after/invite-light-320x568-2x.png) |
| Invite after wheel, light, 320×340, 200% | [Clipped controls](before/invite-constrained-light-320x568-2x.png) | [Reachable controls](after/invite-constrained-light-320x568-2x.png) |
| Invite, dark, 390×844, 100% | [Before](before/invite-dark-390x844-1x.png) | [After](after/invite-dark-390x844-1x.png) |
| Sign-in, light, 390×844, 100% | [Before](before/login-light-390x844-1x.png) | [After](after/login-light-390x844-1x.png) |
| Sign-in, light, 320×568, 200% | [Before](before/login-light-320x568-2x.png) | [After](after/login-light-320x568-2x.png) |
| Sign-in, dark, 390×844, 100% | [Before](before/login-dark-390x844-1x.png) | [After](after/login-dark-390x844-1x.png) |

Additional validation captures: [light](after/invite-error-light-390x844-1x.png),
[200% text](after/invite-error-light-320x568-2x.png),
[dark](after/invite-error-dark-390x844-1x.png).
The reduced browser viewport is not a native IME capture. Keyboard insets and
pause/resume are exercised through Flutter widget tests, not a physical device.

## Validation

Commands below were run in the isolated worktree with the cached SDK selected.
These are overlapping scopes, not additive counts of unique business journeys.

| Command | Result |
| --- | --- |
| `flutter pub get --offline --enforce-lockfile` | Passed; lockfile unchanged |
| `flutter analyze --no-pub` | Passed; no issues |
| `flutter test --no-pub test/features/auth/presentation/invite_redeem_layout_test.dart test/features/auth/presentation/invite_redeem_screen_test.dart test/features/auth/presentation/invite_redeem_screen_coverage_test.dart` | 26 passed |
| `flutter test --no-pub test/features/auth/presentation test/core/routing test/design_system/lyth_brand_test.dart test/design_system/approved_brand_painter_test.dart` | 173 passed |
| `node --test scripts/tests/approved-brand-assets.test.mjs scripts/tests/brand-login-contracts.test.mjs scripts/tests/brand-onboarding-contracts.test.mjs apps/marketing-site/tests/homepage-protection.test.mjs` | 77 passed |
| `python3 scripts/generate-approved-brand-paths.py --check` | Passed |
| `dart format --output=none --set-exit-if-changed` on the two changed Dart files | Passed |
| `git diff --check` | Passed |
| Local Chromium capture driver, baseline / candidate | Passed: 7 / 10 screenshots; all three Back-to-draft journeys pass in each build |

At 320×340 / 200% text, the candidate action occupies y=253–316 (63px tall).
87.36% of its sampled interior pixels match the existing primary-button color;
the baseline action remains below the viewport at y=429–492 after the same wheel
input. Every saved PNG checksum was verified against its capture manifest.

The six new widget cases exercise both-theme large-text/keyboard layout, error
live-region and heading semantics, labeled 48px touch targets, light-theme text
contrast, draft preservation during resize and pause/resume, Back to the existing
sign-in draft, and a disabled pending action with progress semantics. Pending
redemption uses a controlled service future and is presentation evidence only.

An initial guard run used stale cached Undici 7.29.1 and failed two existing
dependency-security cases. Installing the unchanged lockfiles with
`npm ci --ignore-scripts --no-audit --no-fund` (root and marketing workspace)
resolved them. No dependency or marketing source files changed.

Build each source with:

```sh
flutter build web --release --no-pub --no-tree-shake-icons --no-wasm-dry-run \
  --no-web-resources-cdn --target test/browser/approved_brand_entry.dart \
  --output build/mobile-ux-after
MOBILE_UX_SOURCE=8b46b671c8571f821cfefa0799a60699d316d7ca \
MOBILE_UX_BUILD=build/mobile-ux-after \
MOBILE_UX_EVIDENCE=build/mobile-ux-evidence \
node scripts/tests/mobile-entry-ux.browser.mjs
```

For the base, build the same unmodified Flutter fixture at the pinned base SHA,
then run the candidate's browser driver with `MOBILE_UX_BASELINE=1`, the base
source SHA and its build directory. The baseline mode records the known clipped
state; candidate mode requires a visible action and validation message. Both
modes verify Back preserves the synthetic sign-in draft in three viewport/theme
cases. The browser driver is a local regression command; hosted Flutter CI
automatically discovers the new widget tests.

## Scope and handoff

PR1101 was inspected at `e7b2588c7c1284a0ac640d44e76ffc07129aa9bd`; no changed
paths overlap its comments/monthly/status work. No release/database/workflow
files owned by PR1102 are touched. Auth acceptance owns authentication behavior;
if that task modifies the invite file, retain its business-logic changes and
apply this build-method patch narrowly. Parent owns merge order and deployment.

Intentionally deferred: wholesale sign-in/onboarding/navigation redesign,
alpha/beta copy policy reconciliation, direct-deep-link routing changes,
comments and monthly-state presentation, and detection/reward contracts.
No feature activation, policy, provider, publication or release gate changes.

Implemented and locally tested; draft-PR hosted checks and independent exact-head
review must be assessed separately before merge. No merge, deployment or
activation is performed. Native Android/iOS, VoiceOver/TalkBack and device IME
acceptance remain unverified; Chromium and synthetic widget tests do not prove
those environments or production backend acceptance.
