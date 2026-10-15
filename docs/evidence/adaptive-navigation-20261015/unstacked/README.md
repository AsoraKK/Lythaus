# Standalone navigation and composer preservation

Navigation is based on main `53ac0f4ece621605762cde8d9a42f7dde8362ca9`, without
PR1024's branding changes. The default passive identity is main's plain
`Text('Lythaus')`; `AdaptiveShell.brand` accepts a replacement widget. Existing
theme fonts and assets are unchanged. Kyle's uppercase LH direction and pending
wordmark review remain outside this PR. The previous stacked head is preserved
on `archive/navigation-stacked-1804d117`, and PR1024 remains separately reviewable.

## Behavior

A stable content key preserves composer state when moving between mobile,
compact and expanded layouts. Each visited tab has a focus scope and remembers
its last focused control. Returning to a tab restores that control only if it
still exists and can receive focus. Inactive tabs cannot receive keyboard focus;
tab traversal leaves the active scope through its parent rather than trapping
the keyboard in the composer. Deferred restoration checks the current tab and
node lifetime, so rapid tab changes and sign-out cannot focus retired content.

The native regression checks controller identity, draft text, selection and
focus before and after tab switches at 320, 390, 1024 and 1440px, in light/dark
and 100%/200% text. It verifies keyboard escape to navigation, then rapid tab
changes followed by actual auth-provider sign-out and a resize. The protected
composer must disappear. A separate shell assertion verifies a custom brand slot.

## Rendered verification

`test/browser/adaptive_shell_entry.dart` mounts the real shell and composer with
synthetic read-only auth, empty feed data and in-memory draft storage. It exposes
a read-only snapshot of the actual controller identity, text, selection and focus
for assertions; a separate synthetic sign-out hook removes the fixture session.
No post is submitted and external requests are blocked by the browser runner.

`scripts/tests/adaptive-shell.browser.mjs` tests Chromium and WebKit independently.
Each covers both themes, 100%/200% text and all four widths, with actual typing,
selection, tab navigation, resizing, keyboard activation and session removal.
This is fixture-level UI evidence, not production authentication certification.
The native test exercises the existing auth sign-out service separately.

CI builds this fixture, runs both engines and retains the browser evidence on
the exact candidate SHA. Source SHA and compiled JavaScript hash are recorded
in each browser receipt. Screenshots and local results are added after the clean
source build; subsequent evidence-only commits do not change the application.

Source `30fa6bc959f2ecb35b485f11f29c6c8c4142bebf` passed all 32 rendered cases,
with no unexpected errors or external requests. Receipts:
[Chromium](chromium-results.json), [WebKit](webkit-results.json).
[SHA-256 manifest](sha256.json) covers 42 generated artifacts. The full local
Flutter suite passed **3,365 tests, six skipped, zero failures**; the expanded
native shell suite passed all 18 tests. Analysis and pinned formatting passed.
See [full-suite summary](full-suite-summary.txt), [native log](native-shell.txt)
and [analysis](analyze.txt).

Visual review caught one earlier WebKit capture from `38d39c7a` showing the
preceding frame despite passing state assertions. Current images were all
regenerated after two animation frames and a 250ms compositor settling interval.
Manual inspection and [read-only OCR](capture-text-check.json) confirm visible
composer draft text in all 32 current captures. Application code remains identical
to `fa33ed13`; only the capture timing and evidence changed. Do not use the earlier
unsettled screenshots as current visual evidence.

| Width | Chromium 100% | Chromium 200% | WebKit 100% | WebKit 200% |
| --- | --- | --- | --- | --- |
| 320 | [Light](chromium-light-1x-320.png) / [Dark](chromium-dark-1x-320.png) | [Light](chromium-light-2x-320.png) / [Dark](chromium-dark-2x-320.png) | [Light](webkit-light-1x-320.png) / [Dark](webkit-dark-1x-320.png) | [Light](webkit-light-2x-320.png) / [Dark](webkit-dark-2x-320.png) |
| 390 | [Light](chromium-light-1x-390.png) / [Dark](chromium-dark-1x-390.png) | [Light](chromium-light-2x-390.png) / [Dark](chromium-dark-2x-390.png) | [Light](webkit-light-1x-390.png) / [Dark](webkit-dark-1x-390.png) | [Light](webkit-light-2x-390.png) / [Dark](webkit-dark-2x-390.png) |
| 1024 | [Light](chromium-light-1x-1024.png) / [Dark](chromium-dark-1x-1024.png) | [Light](chromium-light-2x-1024.png) / [Dark](chromium-dark-2x-1024.png) | [Light](webkit-light-1x-1024.png) / [Dark](webkit-dark-1x-1024.png) | [Light](webkit-light-2x-1024.png) / [Dark](webkit-dark-2x-1024.png) |
| 1440 | [Light](chromium-light-1x-1440.png) / [Dark](chromium-dark-1x-1440.png) | [Light](chromium-light-2x-1440.png) / [Dark](chromium-dark-2x-1440.png) | [Light](webkit-light-1x-1440.png) / [Dark](webkit-dark-1x-1440.png) | [Light](webkit-light-2x-1440.png) / [Dark](webkit-dark-2x-1440.png) |

Local WebKit's host preflight did not detect the already installed workspace
`libGLESv2.so.2`. Its dynamic dependencies were verified with `ldd`, the workspace
loader path was supplied, and local host preflight was disabled to run the actual
browser. CI uses normal Playwright dependency installation and validation; no
CI checks are disabled. The raw [WebKit log](webkit-run.txt) records this local
environment workaround. Browser versions are in the receipts.

Reproduce from this application source with Flutter 3.41.1 and the repository's
locked Playwright installation:

```sh
flutter build web --debug --no-pub --no-wasm-dry-run --no-web-resources-cdn \
  --target test/browser/adaptive_shell_entry.dart --output build/adaptive-shell-web
NAVIGATION_SOURCE="$(git rev-parse HEAD)" node scripts/tests/adaptive-shell.browser.mjs
NAVIGATION_SOURCE="$(git rev-parse HEAD)" NAVIGATION_BROWSER=webkit \
  node scripts/tests/adaptive-shell.browser.mjs
```

## Coordination and gates

Feed PR1025 owns its WebKit logout/navigation regression and shared auth/content
harness. This lane does not edit those files. A combined-tree check must identify
both exact source SHAs; an older feed revision is not evidence for its later fix.
Final CI, independent review and coordinated merge/deployment remain required.
No homepage redesign, brand activation, merge or deployment is performed here.

The initial local combined tree `82733d10636b799a1c76dfb8756c6c2455d36758`
combines navigation source `fa33ed132118a3c6bb3ea6d8e5c3ce54943b4bfb` with feed
`39e823e97c333c949e0866fce21df02e83e3996b`, and passes 97 shell/navigation/feed
isolation/presentation tests. That feed head adds diagnostics, not a confirmed
logout fix. This local synthetic tree is not pushed or merged to main. The final
feed fix and its combined production-browser checks remain separate gates.

The first combined production WebKit 390px run passed both baseline and delayed
owner-response scenarios. Repetition then reproduced the existing feed-lane
blocker: baseline failed on an unexpected cancelled `GET /api/feed/discover`
during protected return, after sign-out intent. The delayed-owner case passed.
No assertion was weakened. [Combined receipt](combined-result.json) records the
exact source/tree and compiled hash, failure event, raw local trace hashes and
the harness's `local` head fallback. Use `GITHUB_SHA=82733d10636b799a1c76dfb8756c6c2455d36758`
when reproducing with `node --experimental-strip-types --test
--test-name-pattern='webkit 390' --test-timeout=600000
scripts/tests/flutter-auth.browser.mjs`. The feed lane has the diagnostic and
owns the fix. Combined release readiness remains blocked until its final fix is
retested; navigation's fixture pass is not a substitute.
