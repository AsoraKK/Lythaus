# Flutter web live updates

## What users see

Release web builds check the deployed release manifest at startup, when a tab
returns to the foreground, when connectivity returns, and every five minutes
while the tab is visible. A failed, malformed, stale, or offline check does not
reload the page. If a newer or rolled-back release is available, the app reloads
after its safety gate opens. When a draft or operation is not safe to discard,
the page shows an update-ready banner and waits for the user to finish or save
that work.

If the deployed release changes while a candidate is being verified, the
watcher rechecks the newest candidate with a bounded exponential delay from 250
milliseconds up to five seconds. Ordinary failed or offline checks wait for the
next resume, connectivity event, or visible five-minute poll.

The reload uses normal browser navigation. The app does not invoke or promise a
browser hard refresh. The HTML document and release manifest revalidate without
cache, while each Flutter entry point has a content-derived filename so the
next navigation requests the newly deployed app code.

Flutter 3.41.1 emits a service worker that activates immediately and navigates
all open clients. The Pages build replaces it with a network-only pass-through
worker that claims clients and unregisters without navigating them. This keeps
service-worker activation from bypassing the app's draft and request guards; the
release watcher owns live update navigation.

An already-open tab running a build from before this watcher existed cannot
detect releases. It must navigate or reload once to receive the watcher; later
releases are detected automatically.

## Build and deployment

The normal Pages build runs `scripts/ci/version-web-entrypoints.mjs` after the
Flutter release build. It embeds a content-derived release ID in `index.html`,
versions `main.dart.js`, `flutter_bootstrap.js`, and `release-update.js`, and
writes `web-release-assets.json`. The index, manifest, and versioned files must
be published together as one Pages deployment. Keep the `/web-release-assets.json`
no-store header and the global document revalidation header in `web/_headers`.

The watcher accepts only schema version 1 manifests with valid release IDs and
versioned asset names. Before reloading, it fetches the current index without
cache, verifies that the index carries the manifest's release ID, and confirms
that the candidate JavaScript files are available from the same origin. This
avoids reloading into an SPA fallback page or a partially propagated release.
Release comparison uses identity inequality, so rollback releases are eligible
too.

## Safety and storage

The app keeps its authentication cookies and secure content-recovery storage.
The updater does not clear local storage, cookies, IndexedDB, or account data.
Its attempted-release IDs live in `sessionStorage` for the current tab only.
They prevent the same candidate from causing a reload loop and are cleared only
after that release identity is actually loaded. The loaded document clears only
its own marker at startup, even if the live manifest already points to a newer
release; other candidate markers remain fenced. If the browser serves a stale
document or manifest after navigation, the unobserved candidate remains fenced
and the tab stays open with an update-ready action. A later deployment with a
different release identity can still trigger an automatic reload. If
`sessionStorage` cannot record the fence, the update stays ready but automatic
reload is paused.

Before navigation, the watcher rechecks that the verified manifest candidate is
still current and that the Flutter safety gate is still open. If a newer release
or rollback appears during asset verification, it verifies the new candidate
instead of navigating to the superseded one.

Reload waits for secure recovery-journal writes to settle, account/session
transitions to finish, authenticated write requests to complete, and active
submission attempts to finish. Focused text fields and unsafe drafts also hold
the gate. Signed-in comment drafts can reload once the secure draft save has
completed. Active edit screens, anonymous comment text, private support text,
appeal statements, authenticity uploads, media-bearing posts, and pending
authenticated operations hold the gate until they are finished or leave the
screen. Uncertain writes are never automatically replayed by the updater.

If browser storage is unavailable, account recovery is still loading, journal
writes do not settle within five seconds, or the user has work that cannot be
recovered safely, automatic reload stays disabled. The page retains the work
while the update banner waits for the app to report a safe reload state.

## Local checks

Run the release metadata, JavaScript cache checks, and compiled Flutter gate
browser test with:

```sh
node --test scripts/tests/version-web-entrypoints.test.mjs
node scripts/tests/web-release-cache.browser.mjs
flutter build web --debug --no-pub --no-wasm-dry-run --no-web-resources-cdn --target test/browser/web_release_gate_entry.dart --output build/web-release-gate-fixture
node scripts/tests/web-release-gate.browser.mjs
flutter test test/features/feed/application/content_mutation_test.dart test/features/feed/application/post_creation_state_test.dart test/core/network/pending_authenticated_operations_test.dart
```

The JavaScript browser test covers stale bundles and manifests, per-tab reload
fences, rollback, release and safety-gate races, changing manifest candidates,
bounded retries, repeated version signals, visible/focused/BFCache resume,
reconnect, an HTML SPA fallback, and offline recovery. The compiled Flutter
browser test runs the real Dart reload gate and web bridge while editing a post
draft, saving it to the recovery journal, holding an authenticated operation,
and switching accounts while a journal write is pending.
