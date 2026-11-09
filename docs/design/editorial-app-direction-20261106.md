# Editorial app direction — implementation handoff

This is an isolated Flutter implementation of Kyle's approved review direction.
It is not a deployment record. The parent release task explicitly paused
publication and deployment while confirming the combined candidate and gates.

## Branch and integration

- Worktree: `/workspace/lythaus-app-editorial-20261106`.
- Branch: `codex/editorial-app-direction-20261106`.
- Base: `5a76e9862c9ac060c8dcc90326102fa06701e172`, the published PR1133
  candidate including signup/support work. The parent's newer unpublished
  combined candidate was not available in this executor.
- Apply the local implementation commit to the parent-owned candidate and
  resolve overlapping shell, content-screen and theme changes there. Do not
  replace the release branch with this worktree or treat this older base as the
  complete release candidate.
- No provider, database, deployment workflow, backend, API contract, generated
  client or approved brand asset was changed. Nothing was pushed or deployed.

## Implemented behavior

The app has one approved wordmark in its header, a visible feed row, and
Create/Search/Menu actions on mobile and desktop. Profile, rewards,
notifications, reviews/appeals, personal submissions, settings and feed
management remain accessible from the right Menu panel. The selected feed
opens its existing controls; Discovery appears once in the feed row.

The reading layout uses a quiet author/date column on wide screens and stacked
metadata on mobile. Text comes before media, post actions are quieter, and
source links appear only when supplied by the real content model. Approved
Manrope remains the app font; the earlier HTML concept's serif body was not
introduced as a new font dependency. This is an implementation of the direction,
not a claim of pixel identity with that prototype.

Light, Dark and System are real app themes with a device-local preference.
Appearance changes are immediate: animating the palette caused Flutter web to
drop modal keyboard focus during the transition in the browser review.
Both retain the original charcoal, off-white and amber palette. Amber filled
actions use charcoal labels; light-mode text, links and focus indicators use
charcoal for contrast. The approved wordmark outlines, proportions and asset
bytes are unchanged; its existing monochrome treatment follows theme contrast.

Central touch swipes change one feed at a time. An inward swipe from the right
24–48px inset opens Menu; the outermost 24px is left to the OS. Buttons,
editable text, media interactions, vertical scrolling, multitouch and cancelled
gestures do not trigger feed switching. The existing horizontal-swipe setting,
left-handed action order, reduced motion and accessible-navigation setting are
respected. Visible feed buttons and Menu remain the primary accessible controls.

Drafts and reading positions survive shell navigation. The active composer owns
Back decisions for saving, uncertain and in-flight submissions; drawer Back
closes the drawer. Escape closes Menu even after changing appearance and returns
focus to its action. Web wordmark semantics have their own bounded image node.

## Publishing and Discovery dependencies

Kyle's latest supplied direction removes all authorship controls and banners,
bans AI-generated or AI-edited media, and permits AI-generated text up to
250 characters. Feed cards, detail/comments, composer, edit dialog, onboarding
and first-post policy copy reflect that direction. Historical stored declarations
and moderation records are not rewritten.

The base backend/client publishing contract still requires a declaration and
limits assisted text to 249 characters. This branch does **not** invent a human
declaration or change that server contract. The shared
`contentSubmissionPresentationEnabledProvider` defaults to false. Create,
comment and edit callbacks recheck it before starting authentication, device
checks or content writes. New private media uploads are unavailable even if the
older runtime upload flag is enabled. Existing private drafts and uncertain
attempts remain intact; uncertainty does not cause automatic replay.

The separate publishing lane must reconcile declaration-free intake, the
250-character rule, media checks and full pipeline validation before enabling
submission. First-post access rules are unchanged, so accounts still awaiting
their first accepted post remain subject to that existing restriction.

The separate Discovery lane owns ranking, local/international mix, distance,
interests, randomness and search-keyword persistence/removal. This branch uses
the existing control panel and services and does not claim those new controls
or behavior are implemented. Integrate that lane into the selected-feed entry.

## Validation and evidence

The implementation was exercised through Flutter widget/provider tests and a
compiled Flutter CanvasKit browser fixture, not only the earlier HTML prototype.
Final counts and the local commit are reported in the handoff response.

- Full `flutter analyze --no-pub` is clean. The broad Flutter run passes
  3,864 tests; six existing configuration-dependent checks are skipped (five
  environment certificate-pin checks and one support-feedback flag check).
  These skips do not certify those production configurations. Final appearance
  focus changes also pass a separate 60-test shell/navigation/gate/keyboard run.
- The actual `lib/main.dart` JavaScript web release build succeeds. Existing
  secure-storage dependencies still report WebAssembly dry-run incompatibilities;
  this work does not claim a WASM build.
- The 232-test content-screen run covers closed-gate callbacks, retained drafts,
  private image lifecycle, native Back, session fencing, retries and navigation.
  Four refresh-race tests now explicitly use create → delete in the same mounted
  thread; this preserves busy/read/account races without an illicit second
  declaration. Repeated live-create coverage depends on publishing reconciliation.
- The 41 brand/startup checks, including the 26 approved-asset and artwork
  checks, verify unchanged source bytes, geometry, native mappings and current
  wordmark presentation expectations.
- All 20 compiled-browser scenarios pass: widths 320, 390, 768, 1024 and
  1440 at 100% and 200% text in light and dark themes. They exercise actual
  input/draft return, same-mode and opposite-mode appearance choices, System
  mode with OS changes, drawer keyboard scrolling, Escape/focus return and
  canonical wordmark pixels. There are zero browser errors, blocked external
  requests or API writes. Mobile, desktop and narrow large-text screenshots
  were also visually inspected.
- `scripts/tests/editorial-shell.browser.mjs` records synthetic screenshots,
  semantics, source identity, compiled JavaScript hash, real input/draft round
  trips, appearance switching, rendered wordmark fidelity and network activity.
  It rejects external network calls and content writes. Browser output is under
  `build/editorial-review-evidence/`; `results.json` is the scenario record.
  Its source label is honestly retained as `uncommitted-review`; the companion
  handoff manifest binds those unchanged compiled bytes and source files to the
  subsequent local commit. Fixture JavaScript SHA-256:
  `ba7341eda1b85b5c7f258b4baedbd78d694f5f627b18c073b4ce7340c45d8fa9`.
- Legacy brand-browser shell selectors were aligned with the new navigation.
  Their complete Chromium/WebKit login/onboarding release matrix still belongs
  to the exact combined candidate's release review.

Physical-device OS back gestures, touch selection/pinch behavior and production
authentication/publication were not certified here. Synthetic local browser
success is not production activation evidence. Any previously denied or uncertain
publication action remains with the parent release owner and was not retried.
