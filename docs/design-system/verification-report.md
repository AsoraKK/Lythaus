# Lythaus UI/UX implementation and verification

## Outcome and release status

**Delivery request, 28 September 2026:** the user accepts the presented appearance and
requests that the live app display the updated UI. Review, merge and protected frontend
deployment are now in scope. Live delivery is tracked in [the current status](implementation-status.md#live-delivery-2026-09-28);
the earlier visual observations remain follow-up work. No deployment success is implied
by that authorisation.

**Visual acceptance reopened, 28 September 2026:** the user's quality concern is confirmed
by a fresh live/branch comparison. The live app does not show the pushed branch, and the
branch itself still has an insufficiently composed sign-in screen, empty feed and guest
Profile. The checks below remain engineering evidence; they are not acceptance of the
requested visual quality. See [the current status](implementation-status.md#live-and-branch-review-2026-09-28).

The local Flutter application and all 16 existing secondary website routes now share warm editorial design foundations. The website also has a real-link Help directory and a styled 404 page. The app retains Flutter/Riverpod/GoRouter and its service boundaries; the support site retains Astro. The marketing homepage remains a frozen consumer with independent source, rendering and behavior evidence.

**This implementation is not production acceptance.** Verification was completed locally before committing. The user subsequently authorised committing and pushing on 27 September 2026 to `codex/lythaus-design-system`. Work is in `C:/Users/kylee/.codex/worktrees/lythaus-design-system/Lythaus`, based on `8e3b3ebad2f846e61db2bfe819376723da7e9863`. The original checkout and unrelated untracked files were preserved. The baseline was fetched and rechecked against GitHub on 27 September 2026; no claim is made that production is deployed from that SHA. Merge, deployment, schema changes and infrastructure mutations remain outside the authorised delivery.

The full requested definition of done remains **open** for visual quality and the genuine dependencies below. They were not replaced with invented content or fake functionality.

## What is implemented

- A modest platform-neutral `design/tokens.json`, a checked Flutter color adapter, and direct build-time Astro consumption. Semantic roles cover both appearances, text/control contrast, feedback, focus, spacing, type, radii and motion. Bundled Manrope replaces app runtime Sora requests; DM Sans has not been newly downloaded.
- The existing Flutter primitives now support readable control boundaries, stable busy geometry, minimum touch targets, natural height at enlarged text, named password visibility, feedback and reduced motion. The contrast helper and golden comparator have focused correctness tests.
- A consistent app shell with Discover, Create, Profile and Rewards; desktop sidebar, tablet rail and four labelled mobile destinations. Visited tabs retain state. Browser/native back restores selection and tab query parameters. Existing guest/role/entitlement gates remain in place; custom-feed launch entry points remain deferred.
- Shared reading panes, author/disclosure anatomy, content history, meaningful reaction icons, accessible reaction buttons, image fallbacks, public biography, separated subscription labels, grouped settings, security/privacy presentation, notification actions and saving/retry states. Search/trending results open actual post details; search distinguishes empty from unavailable.
- Rewards preserves the server-backed offers, eligibility, redemptions and history. Weekly, Monthly and Quarterly are separate **unavailable** sections after real offers/history. No points, completion, recurrence dates, verification status or hypothetical partner benefits are synthesized.
- An isolated `SecondaryLayout.astro` and scoped CSS for every non-homepage page. Legal text/dates and existing account scripts are protected by exact baseline-content tests. Contact now uses the support address already published in Terms instead of the prior disconnected form. Its mailbox delivery is not claimed verified.

The exhaustive implementation/state inventory is in [the app matrix](app-migration.md) and [the website matrix](web-migration.md). The canonical [design-system guide](../../lib/design_system/DESIGN_SYSTEM.md) and [navigation specification](../product/quiet-trust-feed/navigation-spec.md) have been updated.

## Passed checks

Toolchain: Windows, Flutter **3.44.2**, Dart **3.12.2**, Node **22.17.0**, bundled Playwright **1.62.1**, Chromium **151.0.7922.34**. The repository declares Flutter 3.32.0; its SDK requirement, manifests and dependencies were not upgraded. Verification on the declared SDK remains a CI check.

| Check | Result and scope |
| --- | --- |
| Baseline full Flutter suite | 2,558 passed, five pre-existing opt-in skips. Includes 24 test-only baseline capture cases; 2,534 original tests passed. |
| Combined Flutter suite | **2,689 passed**, five opt-in SPKI checks skipped under the default environment. Includes 100 route/theme/reflow captures. |
| Explicit SPKI configuration gate | **5/5 passed** with `SPKI_GATE=true`; no security gate was weakened. These are configuration tests, not live certificate-rotation acceptance. |
| Flutter static analysis | **No issues** after repairs. |
| Formatting and whitespace | 86 changed/new Dart files formatted; `git diff --check` passes. Source edits used patches. |
| Flutter release web build | Passed with local preview HTTPS origin defines and `--no-web-resources-cdn`; final JS bundle SHA-256 `f589d3c0dc025fec6c05c8b41d76f29bef7f758eb7435a8975b1c25d284417cd`. No build was published. |
| Final native navigation/reaction/receipt subset | **15/15 passed** after final annotation/formatting changes. |
| App visual fixtures | **100/100 passed**: feed, settings, security, rewards, post, profile, notifications, notification settings, appeals and receipt; light/dark; 390, 768, 1024, 1440, plus 320px at 200% text. Actual app widgets and deterministic synthetic providers; no auth bypass in production. |
| Moderation/privacy visual fixtures | **24/24 passed**: review queue, decision controls, export cooldown and deletion section; both themes, 390/1440 and 320px at 200%. Local Material Icons loaded for inspection. |
| App release-browser journeys | **8/8 viewport/theme cases**, zero uncaught page errors: guest entry, Rewards/Profile/browser back, blocked guest Create, tag search empty/error/retry with preserved query. Keyboard/paste input uses Flutter's actual text editing surface. |
| Website source/contract tests | **41/41 passed**, including frozen-homepage dependencies, unchanged auth scripts/legal text and secondary token/contrast checks. |
| Secondary website build and rendering | Build passed; **216 route/viewport/theme renders**, 244 screenshots, 20 account fixtures, reflow/keyboard/history/theme/anchor/print checks; zero recorded failures. |
| Homepage source and build guards | Passed at the explicit baseline. Protected page, layout, stylesheet, script, asset, font configuration, waitlist and build-input sources are unchanged. |
| Homepage before/after | **30/30 PNGs byte-identical**, zero tolerance or masks; opening/settled, mobile menu, links, reduced motion and intercepted waitlist outcomes. |
| Existing homepage cross-engine checks | Baseline **96/96**. After Chromium/WebKit passed; Firefox had one page-load timeout during concurrent work, then unchanged isolated rerun **32/32 passed**. Failed logs retained. |

The homepage's generated CSS packaging changes from two files to one because the old global stylesheet is now exclusive to the homepage. HTML differs only in stylesheet links; the ordered effective cascade is identical, and non-CSS assets are byte-identical. This explained bundling effect is documented in [homepage protection](homepage-protection.md). Homepage screenshot baselines, assertions and tolerances were never updated.

Manual image inspection covered desktop/phone feed, both settings appearances, post typography/actions, long profile identity and biography with a failed avatar, Rewards, secondary Help/sign-in/privacy, homepage settled/menu/waitlist, and enlarged moderation/privacy controls. This is not a manual screen-reader audit or a claim that every possible state has been visually inspected.

## Failures found and resolved

The initial combined app run had 17 failures. Repairs addressed a media-composer overflow, preserving the deferred custom-feed gate, offscreen settings/Rewards interactions, reaction/label expectations, and intentionally changed Flutter goldens. The final complete run passes; no tests were removed or loosened.

Two pre-existing test defects were corrected: contrast used exponent 2 instead of 2.4, and the screenshot comparator compared a fraction with 15 instead of 0.15. Dedicated tests now reject incorrect contrast and 20%/100% image drift. Six intentional foundation goldens and two stale legacy onboarding goldens were inspected and refreshed. The onboarding Dart policy text is unchanged from the baseline; its prior stored screenshots were older. The original comparison images are retained outside source. No homepage image was refreshed.

Early browser harness attempts selected the wrong Flutter semantics text nodes or typed before the editing surface had processed focus. Those unsuccessful logs remain. The final script waits for actual UI state and two rendering frames before inserting text, verifies the precise query and requires zero after-build page errors. No production control or assertion was disabled to make the flow pass.

## Performance and evidence

Comparable local measurements are samples, not real-user performance or Core Web Vitals. Flutter `main.dart.js` changes from **3,803,675 to 3,825,729 raw bytes** (+0.58%) and **1,115,561 to 1,122,985 gzip bytes** (+0.67%). No new heavy dependency is introduced. Across one cold context for each of eight viewport/theme cases, median navigation-to-accessible-login time is **717ms before / 737.5ms after**. This small single-machine sample does not establish statistical significance or native-device performance.

With all external font requests deliberately blocked, the baseline attempts two unbundled Sora downloads and emits two font errors per browser case. The after build removes those requests/errors. Both builds still attempt Flutter engine's existing Roboto fallback; that request is recorded and blocked. The baseline browser captures therefore document fallback rendering, not downloaded Sora typography. Original representative widget captures omit feed for the same baseline runtime-font issue.

Homepage assets decrease by 242 bytes through equivalent CSS deduplication. The secondary site's total output grows chiefly through bundling the two existing local fonts once and adding Help/404; detailed comparable route timings and byte caveats are in [the web report](web-migration.md).

Evidence root: `C:/Users/kylee/AppData/Local/Temp/lythaus-design-evidence/`.

| Evidence folder | Contents |
| --- | --- |
| `deterministic/homepage-before`, `homepage-after`, `homepage-production` | Frozen baseline, 30 exact before/after images, 25 read-only production captures from 26 September, reports and fonts |
| `secondary-before`, `secondary-after` | Original page captures; all-route after screenshots, fixtures and performance report |
| `flutter-before-with-icons` | 24 original settings/security/Rewards widget captures |
| `flutter-journeys-reviewed` | 100 final app fixture PNGs, including 320px/200% cases |
| `moderation-privacy-reviewed` | 24 final component fixture PNGs; fixture preview is explicitly labelled |
| `flutter-browser-before-complete`, `flutter-browser-delivery` | Original and final release-browser login/feed screenshots; final history/search/error captures, request ledger and bundle fingerprint |
| `reviewed-foundation-golden-differences`, `reviewed-onboarding-golden-differences` | Original failed comparisons retained for review |

Representative previews: [post, dark phone](<C:/Users/kylee/AppData/Local/Temp/lythaus-design-evidence/flutter-journeys-reviewed/post-390-dark.png>), [settings, light phone](<C:/Users/kylee/AppData/Local/Temp/lythaus-design-evidence/flutter-journeys-reviewed/settings-390-light.png>), [Rewards](<C:/Users/kylee/AppData/Local/Temp/lythaus-design-evidence/flutter-journeys-reviewed/rewards-390-dark.png>), [Help, light desktop](<C:/Users/kylee/AppData/Local/Temp/lythaus-design-evidence/secondary-after/help-1440-light.png>).

Full command logs are beside that evidence root as `lythaus-design-*.log`. The final authoritative app logs are `final-full-tests`, `final-analyze`, `delivery-build`, `delivery-targeted`, `spki-gate`, `journeys-reviewed`, `moderation-privacy-reviewed` and `browser-delivery`; earlier failed/debug runs are not final evidence.

## Reproduction

Run from the isolated worktree with its existing dependencies and the explicit baseline Git object available:

```powershell
flutter test --no-pub --reporter expanded
flutter analyze --no-pub
$env:SPKI_GATE = 'true'
flutter test --no-pub test/security/environment_spki_pin_test.dart
Remove-Item Env:SPKI_GATE
git diff --check
$taskFiles = @(git diff --name-only -- '*.dart') + @(git ls-files --others --exclude-standard -- '*.dart')
dart format --output=none --set-exit-if-changed $taskFiles
node --test apps/marketing-site/tests/*.test.mjs
flutter build web --no-pub --release --no-web-resources-cdn --dart-define=AUTH_URL=https://auth.lythaus.co --dart-define=API_BASE_URL=https://api.lythaus.co
$env:LYTHAUS_UI_EVIDENCE = 'C:/Users/kylee/AppData/Local/Temp/lythaus-review-new/app'
flutter test --no-pub test/ui/design_review_test.dart
$env:LYTHAUS_WIDGET_EVIDENCE = 'C:/Users/kylee/AppData/Local/Temp/lythaus-review-new/moderation-privacy'
flutter test --no-pub test/features/moderation/presentation/shared_readability_test.dart
$env:FLUTTER_QA_DIR = 'C:/Users/kylee/AppData/Local/Temp/lythaus-review-new/browser'
$env:PLAYWRIGHT_MODULE_DIR = 'C:/Users/kylee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'
node scripts/design-system/flutter-browser.mjs
```

For an original-browser comparison, set `FLUTTER_QA_BASELINE=1`, `FLUTTER_QA_BUILD` to a pristine baseline release build, and a separate evidence directory; unset those variables for after checks. Baseline mode records existing errors and only exercises its available guest flow. The final mode asserts all new journey checks. All non-local requests are intercepted fixtures or blocked; no real account writes or messages are sent. Homepage and support reproduction commands are in their linked reports. Do not regenerate a homepage baseline to accept a change.

## Remaining dependencies and checks not claimed

1. **Rewards recurrence contract:** there is no approved runtime action catalogue with exact points, eligibility, verification methods, recurrence/caps and backend progress. The presentation cannot complete operational Weekly/Monthly/Quarterly actions without that contract. Current offers/history remain functional under their existing APIs.
2. **Approved policy/availability conflicts:** existing Guidelines, AI moderation, Pricing, About and Features contain conflicting enforcement/availability statements. Legal/pricing copy is preserved and exact conflicts are listed in the web matrix. Owner/policy reconciliation is required before claiming product-wide language agreement.
3. **Real integrations/native accessibility:** no real sign-in/publication/upload, email/push delivery, native device/camera/keyboard, account deletion/export, successful invitation handoff, subscription entitlement acceptance, manual screen-reader audit or physical-device performance measurement was performed. No staging or production deployment was authorized. Fixture success is not live acceptance.
4. **Release coordination:** the app's new Help link targets `/help`; deploy the secondary site and app together through the existing release process after approval. Current production is not claimed to include this new route. Support mailbox ownership/delivery and the existing static sign-in email-prefill issue remain unverified/pre-existing.
5. **Tooling limits:** JavaScript web builds pass. The existing secure-storage dependency still emits Wasm dry-run compatibility warnings. Android/iOS/macOS/Linux/Windows binaries and app cross-engine/native screen-reader checks were not run. Existing homepage Chromium/Firefox/WebKit evidence is separate.

These dependencies keep full product acceptance open. The local implementation and its reproducible evidence are ready for review; none of the open items is represented as completed.
