# Homepage protection evidence

The marketing root `/` remains a frozen consumer of the existing design. The explicit source baseline is `8e3b3ebad2f846e61db2bfe819376723da7e9863`. All checks below were local or read-only production observations on 26 September 2026. No commit, push, merge, deployment, production waitlist submission, or provider mutation was performed by this work.

## Protected dependency graph

| Layer | Frozen sources and dependencies |
| --- | --- |
| Page and metadata | `apps/marketing-site/src/pages/index.astro`, `src/layouts/BaseLayout.astro`, `src/env.d.ts` |
| Opening | `src/components/OpeningWordmark.astro` → `src/styles/home-opening.css`; layout → raw `src/scripts/home-opening.js` |
| Cascade | Layout → `src/styles/global.css`; page → `home-pitch.css`, `home-pitch-compact.css`, `home-polish.css`, in that order |
| Fonts | Existing DM Sans v17 and Manrope v20 Google-hosted WOFF2 URLs from `home-pitch.css` and the layout preload declarations; downloaded once into the evidence folder and served identically for every controlled capture |
| Public files | Every baseline file under `public/`, including mark, favicons, PWA icons/manifest, headers, redirects, sitemap and robots |
| Build inputs | Marketing Astro configuration, manifest and lockfile; root manifest/lockfile and tracked Node/Git/npm settings; marketing deployment workflow and validation script |
| Waitlist service | Entire existing public API Worker, its contracts/db/security/observability/media/Cloudflare environment packages, waitlist migration, deployment workflow, candidate/live probe and materialization scripts |
| Existing protection | `homepage-waitlist.test.mjs` and `home-opening.browser.mjs` are unchanged |

`homepage-protection.test.mjs` compares every baseline Git blob in this inventory with its current normalized working-tree blob. It fails if the explicit baseline is missing or a protected file differs. It also rejects new marketing environment files and common root-route/middleware interceptors. The Web frontends CI checkout now fetches history so this guard can resolve the fixed baseline. No gate was removed.

Secondary routes use their own opt-in layout, stylesheet and fonts. The homepage does not import the semantic-token adapter, secondary stylesheet or secondary layout. Generated `.astro` changes from running the development server/build were restored to their baseline content.

## Evidence locations

Evidence root: `C:/Users/kylee/AppData/Local/Temp/lythaus-design-evidence`.

| Artifact | Contents |
| --- | --- |
| `homepage-before/dist/` | First unmodified 17-route baseline build, saved before secondary-source edits |
| `deterministic/homepage-before/` | Immutable copy of that build, two frozen font files, 30 baseline PNGs and JSON run report |
| `deterministic/homepage-after/` | 30 matching after PNGs and run report |
| `deterministic/homepage-production/` | 25 read-only live-page captures under the same viewport/font conditions |
| `deterministic/homepage-build-parity.json` | Exact resource hashes, package-size comparison and CSS-cascade equivalence |
| `deterministic/production-source-summary.json`, `production-index.html` | HTTP/source observation; the public Turnstile site key is configuration, not a secret |
| `existing-before/`, `existing-after/`, `existing-after-firefox/` | Original cross-engine suite screenshots; after logs also sit at the evidence root |

The first harness attempt used the wrong tablet navigation breakpoint and captured a finite settling transition. Its incomplete artifacts were retained. Deterministic captures were made from the saved original build after correcting only test timing/breakpoint handling. No existing screenshot was replaced. Native validation tooltips are dismissed through Escape and an ordinary heading click before capturing the persistent validation message. No real content is masked and no pixel tolerance is used.

## Results

| Check | Result |
| --- | --- |
| Existing baseline source tests | 25/25 passed |
| Baseline Astro build | 17 routes; Astro-reported build 2.56 seconds |
| Frozen-source guard | Passed after migration |
| Before/after visual comparison | 30/30 PNGs byte-identical at 360, 390, 768, 1024 and 1440 pixels; DPR 1; fixed locale/timezone; frozen fonts |
| Opening and interactions | Initial frame, 700ms light frame, complete page, mobile/tablet menu, Escape focus restoration, section navigation, reduced motion, no horizontal overflow |
| Waitlist browser fixtures | Invalid email, missing bot verification, successful response and rate-limit error; only intercepted synthetic POSTs to `example.invalid` addresses |
| Existing cross-engine baseline suite | 96/96 passed across Chromium, Firefox and WebKit |
| Existing cross-engine after suite | Chromium and WebKit passed; Firefox initially timed out on a page load and then its parent timeout. An unchanged isolated Firefox rerun passed 32/32. The failed run is retained; no timeout or assertion was changed. |
| Production observation | HTTP 200; all 25 common PNGs and page text matched the local baseline under controlled font/network conditions |
| Page runtime errors | No uncaught page errors in the controlled new suite |

Browser plugin was not available. The existing Playwright workflow was used with the bundled Playwright 1.62.1 runtime and Chromium 151.0.7922.34. An ignored `node_modules/playwright` junction allowed the unchanged existing suite to resolve that runtime. This is local fixture/browser evidence, not real authentication, delivery, or waitlist integration acceptance.

Production HTML is not claimed to be a raw byte match or proof of the deployed repository SHA. It differs from the Windows baseline through CRLF/LF in the raw opening script and production's configured public Turnstile key/script. Removing only those identified differences produces identical HTML. Production bot verification was blocked from the screenshot harness, and no production form was submitted.

## Build and timing comparison

The new secondary layout makes the old global stylesheet exclusive to the homepage. Astro consequently combines two homepage CSS files into one. Raw generated HTML/CSS hashes therefore change even though the source and rendering do not.

| Measurement | Before | After |
| --- | ---: | ---: |
| Homepage HTML bytes | 35,333 | 35,271 |
| Homepage local asset bytes, including PWA assets | 83,978 | 83,736 |
| Homepage CSS bytes | 11,293 + 23,739 | 34,790 |
| Ordered effective CSS records | 1,164 | 1,164, identical |
| Total built site bytes | 317,873 | 545,086 |
| Sample local load event, 390px | 56.4ms | 57.0ms |
| Sample local load event, 1440px | 64.9ms | 56.4ms |
| Uninterrupted opening, 390px | 1,775.3ms | 1,782.6ms |
| Uninterrupted opening, 1440px | 1,770.0ms | 1,782.8ms |

The build guard verifies HTML is identical except for stylesheet-link packaging, non-CSS resources are byte-identical, and the ordered CSS cascade is identical after expanding grouped selectors and discarding earlier declarations superseded by the same selector/property/importance within the same conditional scope. Font-face blocks remain exact and ordered. The 242-byte CSS decrease is minifier deduplication, not a removed design rule. The larger total site includes the new secondary layout, pages and local font asset; none enters the homepage resource graph. These single-machine samples do not establish field performance; they show no measured homepage regression under these conditions.

## Reproduction

From the repository root, with its existing dependencies installed:

```powershell
node --test apps/marketing-site/tests/*.test.mjs
$env:PUBLIC_API_BASE_URL = 'https://api.lythaus.co'
$env:PUBLIC_TURNSTILE_SITE_KEY = ''
npm --prefix apps/marketing-site run build
$env:HOMEPAGE_QA_DIR = 'C:/Users/kylee/AppData/Local/Temp/lythaus-design-evidence/deterministic'
$env:PLAYWRIGHT_MODULE_DIR = 'C:/Users/kylee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'
node apps/marketing-site/tests/homepage-build-parity.mjs
node apps/marketing-site/tests/homepage-frozen.browser.mjs compare
node --test apps/marketing-site/tests/home-opening.browser.mjs
```

`capture` creates a new baseline and refuses an existing directory. It is for an explicitly frozen, reviewed revision before edits; do not recapture to make a regression pass. `resume-capture` can complete an interrupted capture only against its saved immutable build and refuses to overwrite any existing PNG. Missing baseline evidence fails the comparison. `production` performs read-only captures and never submits a form.

Manual inspection covered desktop page composition, mobile menu and waitlist success/error captures. The existing success presentation repeats confirmation copy in the success block and live status text; this pre-existing homepage presentation was left unchanged. This is not a manual screen-reader or universal accessibility certification.
