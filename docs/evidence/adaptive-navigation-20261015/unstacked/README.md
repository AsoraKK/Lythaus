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

## Coordination and gates

Feed PR1025 owns its WebKit logout/navigation regression and shared auth/content
harness. This lane does not edit those files. A combined-tree check must identify
both exact source SHAs; an older feed revision is not evidence for its later fix.
Final CI, independent review and coordinated merge/deployment remain required.
No homepage redesign, brand activation, merge or deployment is performed here.
