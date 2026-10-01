# Secondary website migration

Baseline: `8e3b3ebad2f846e61db2bfe819376723da7e9863`, isolated worktree `lythaus-design-system`. No commit, push, merge, or deployment is part of this change. Routes below are from the actual Astro page tree and `_redirects`, not a proposed product inventory.

The secondary website uses `apps/marketing-site/src/layouts/SecondaryLayout.astro`, `src/styles/secondary.css`, and `src/components/ArticleContents.astro`. These are opt-in dependencies. The protected homepage continues to use `BaseLayout.astro` and its original styles, scripts, assets, metadata, waitlist logic, and font configuration. See [homepage protection](homepage-protection.md) for independent before/after and production evidence.

## Route and state matrix

Paths in the implementation column are relative to `apps/marketing-site/src/pages/`. Every migrated route uses the secondary shell: accessible breadcrumbs, native responsive navigation, footer, system/light/dark appearance, and a skip link. Auth pages use one shared form, feedback, password visibility, and action system. Article pages use one reading surface. `R` means the all-route viewport/theme suite, `F` a named fixture case, and `S` the baseline source contract checks described below.

| Route | Implementation | Audience and important states | Baseline inconsistency | Shared patterns / status | Verification |
| --- | --- | --- | --- | --- | --- |
| `/` | `index.astro` | Public; opening, settled, mobile menu, reduced motion, waitlist | Protected reference | Frozen consumer, not migrated | Independent homepage suite |
| `/about` | `about/index.astro` | Public; principles and team | Unconstrained article, oversized marketing heading | Reading surface; migrated | R; stable section IDs |
| `/features` | `features/index.astro` | Public; feature overview | Generic undifferentiated blocks, skipped heading levels | Editorial two-column list; migrated | R; h1 → h2 hierarchy |
| `/pricing` | `pricing/index.astro` | Public; current beta and future plans | Generic cards and unstyled price | Editorial list and tabular figures; migrated; pricing unchanged | R |
| `/ai-moderation` | `ai-moderation/index.astro` | Public; declarations, review, appeals | Unconstrained article | Reading surface and stable anchors; migrated | R |
| `/guidelines` | `guidelines/index.astro` | Public; principles, prohibited content, moderation, appeal and safety contact | Dense text, no document navigation | Reading surface, contents disclosure, anchors, print; migrated | R, S legal text/effective date |
| `/privacy` | `privacy/index.astro` | Public; collection, waitlist retention, rights and contact | Dense text, no document navigation | Reading surface, contents disclosure, anchors, print; migrated | R, S legal text/date; keyboard `#contact` and print |
| `/terms` | `terms/index.astro` | Public; accounts, content, enforcement, liability and support | Dense text, no document navigation | Reading surface, contents disclosure, anchors, print; migrated | R, S legal text/date |
| `/contact` | `contact/index.astro` | Public; support email and privacy/safety routes | Form had no action, script, or integration; default GET could place a private message in the URL | Truthful directory using support address already published in Terms; migrated | R, S no disconnected form; no mail sent |
| `/invite`, `/invite/*`, `/invite?code=…` | `invite/index.astro`; existing `_redirects` rewrite | Invitee; missing code, validating, invalid, service error, verified app handoff, clipboard success/failure | No reading-width/status system; premature actions visible before validation | Shared status panel; actions initially hidden until existing validation enables them; migrated | R, S script unchanged; F invalid path-code; actual successful app handoff not live-tested |
| `/signup` | `signup.astro` | Visitor; invalid email/password, Turnstile, submitting, accepted/queued email, resend/cooldown, service error | Seven duplicated dark-only form styles; tiny helper text | Shared form, status strip and visibility toggles; migrated | R, S script unchanged; F signup accepted, credentials cleared, delivery not claimed |
| `/sign-in` | `sign-in.astro` | Member; validation, busy, generic failure, accepted credentials, verification required, resend | Duplicated dark-only form styles | Shared form, status strip, recovery and visibility; migrated | R, S script unchanged; F accepted credentials and verification-required; app session not implied |
| `/forgot-password` | `forgot-password.astro` | Visitor; optional email query, neutral request, bot check, busy, accepted/queued, failure/offline | Duplicated dark-only form styles | Shared form and status strip; migrated | R, S script unchanged; F query prefill/scrub, accepted and offline recovery |
| `/resend-verification` | `resend-verification.astro` | Visitor; optional email query, neutral request, bot check, cooldown, failure | Duplicated dark-only form styles | Shared form and status strip; migrated | R, S script unchanged; F accepted with original cooldown |
| `/check-email` | `check-email.astro` | Visitor; neutral next steps after an accepted request | Oversized centered marketing presentation | Compact account reading surface and real recovery links; migrated | R; original delivery wording retained |
| `/verify-email?token=…` | `verify-email.astro` | Link holder; no mutation on GET, missing token, intentional confirm, busy, success, expired/used link, retry | Duplicated dark-only panel/styles | Shared status and account surface; migrated | R, S exact script; F success/invalid, deliberate POST, query scrub, no-referrer/noindex |
| `/reset-password?token=…` | `reset-password.astro` | Link holder; missing/expired token, policy/mismatch, busy, confirmed change and session invalidation | Duplicated dark-only form styles | Shared form, status and visibility; migrated | R, S exact script; F mismatch/no request, success/cleared disabled fields, query scrub |
| `/help` | `help/index.astro` | Public; getting started, account access, community, privacy and support | No help directory existed | Compact real-link directory; added | R; keyboard navigation and browser back |
| Unknown routes / `404.html` | `404.astro` | Public; missing page and valid recovery links | Framework/system fallback | Shared error reading surface; added | R; noindex, Help/Home links |

No existing Rewards help article, feed-search help implementation, contact service, maintenance page, or access-denied page exists in this Astro tree. The help directory does not invent them. Gated Rewards remain the application's responsibility. The `/invite/*` rewrite, all existing paths/query handling, auth endpoints, response-state checks, Turnstile actions, token clearing, and email wording remain intact.

## Component and token use

- `design/tokens.json` is consumed directly at build time. There is no manually duplicated web palette. Every secondary selector is scoped to `html[data-secondary]` or `.secondary-page`; the stylesheet is only imported by `SecondaryLayout`.
- Complete light and dark semantic colors cover canvas/surfaces, text hierarchy, accent/on-accent, selection, essential control borders, focus, and all feedback states. Decorative dividers are deliberately quieter than essential input boundaries.
- The layout follows the system by default. The optional native appearance select stores only `lythaus-secondary-appearance`; no existing homepage preference, storage key, or theme configuration is touched. Storage-denied environments retain a working system/default theme.
- Existing local Manrope regular and semibold files are bundled for deterministic rendering without font-provider requests. This is the approved local fallback for the homepage's Manrope/DM Sans reference; no new font is downloaded. The existing white brand asset is unchanged and sits on a small dark brand surface in light mode.
- Headings are restrained at 32–48 CSS pixels; article text is 17 pixels with a 1.65 line height and 760-pixel maximum reading width. The web target is at least 44 pixels for standalone controls; primary form controls are at least 48 pixels. Inputs grow with text and do not constrain labels to one line.
- The amber navigation rule, restrained feedback strip, and content-led directory rows are reusable details. Native `details`, `select`, labels, focus rings, and HTML link semantics remain intact. Buttons preserve their width as busy labels change because forms stretch them across a stable grid column.
- All password visibility controls are progressive enhancement in the shared shell. They preserve field IDs, labels, autocomplete, paste, validation, and the page's original service code. No password or token is persisted by the shell.
- `ArticleContents` consumes the page's explicit section IDs. Legal copy and dates are protected independently from presentation. Print styles remove navigation while preserving the article and its headings.

## Verification and evidence

Before evidence: `C:/Users/kylee/AppData/Local/Temp/lythaus-design-evidence/secondary-before/` contains ten 1440/390 screenshots of the original sign-in, signup, privacy, guidelines, features, contact and invite pages. Those early development screenshots include the Astro development toolbar. The homepage baseline directory also contains the immutable original static build used by the independent protection suite.

After evidence: `C:/Users/kylee/AppData/Local/Temp/lythaus-design-evidence/secondary-after/` contains the static-build screenshots and `report.json`. The automated suite renders all 18 secondary routes at 320, 360, 390, 768, 1024 and 1440 CSS pixels, in both supported themes. It checks page identity, meaningful content, absence of framework overlays and runtime errors, horizontal reflow, 44-pixel standalone controls, and actual composited text contrast. Reduced motion is enabled for reproducible screenshots; no page content is masked.

Additional checks cover 200% root text scaling at 320 pixels for Help, Privacy, Signup and Reset Password; keyboard skip/menu focus and Escape restoration; theme persistence; browser history; article anchors and print; fixture-backed signup/sign-in/recovery/resend/verification/reset/invite outcomes. All external API calls are blocked except explicitly intercepted fixture responses; fixtures use synthetic `.invalid` addresses and do not send messages or establish real sessions.

Final result: build passed (19 total pages); all 41 source/contract tests passed; all 216 viewport/theme route renders, 20 account/invite fixture cases, both keyboard/navigation/theme/print interaction groups, and eight enlarged-text renders passed. The corrected run produced 244 screenshots with no failures. Representative before/after screenshots were manually inspected, including Help at 1440 light, Privacy at 1440 light, and Sign-in at 390 dark. These observations establish the inspected layout quality, not a universal accessibility certification.

The first browser contrast helper incorrectly parsed the fractional channels returned by CSS `color(srgb …)` for a hovered `color-mix` button. That helper was replaced with the browser's canvas color resolution and assertions for RGB, fractional sRGB, transparent colors, alpha composition and luminance endpoints. Contrast evidence is accepted only from the corrected run. This was a test-helper defect, not a waiver of the contrast requirement.

Reproducible PowerShell commands from `apps/marketing-site`:

```powershell
npm test
npm run build
$env:PLAYWRIGHT_MODULE_DIR = 'C:/Users/kylee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'
$env:SECONDARY_QA_DIR = 'C:/Users/kylee/AppData/Local/Temp/lythaus-design-evidence/secondary-after'
node tests/secondary-pages.browser.mjs
$env:HOMEPAGE_QA_DIR = 'C:/Users/kylee/AppData/Local/Temp/lythaus-design-evidence'
node tests/secondary-performance.browser.mjs
```

Browser skill availability: the Browser plugin/skill is not installed in this session. Validation uses the already bundled Playwright runtime; no dependency or build-tool upgrade was made. The browser suite starts a temporary loopback static server and closes it on completion. If Playwright is locally installed, `PLAYWRIGHT_MODULE_DIR` may be omitted.

Source checks: the original 25 marketing tests passed before edits. New checks hash the exact seven account/invite scripts and visible legal source text against the explicit baseline, assert all secondary consumers use the isolated shell, validate anchor targets and contact recovery, and check semantic text/control contrast. The independent homepage checks protect the original source and dependency graph.

Implemented does not mean production-verified: browser results are Chromium and deterministic fixtures. No live signup, email delivery, private session, successful app invite handoff, external mail-client delivery, native screen reader, or manual WCAG conformance audit is claimed. Cross-engine homepage evidence is documented separately.

### Local performance and asset comparison

`secondary-after/performance.json` compares five cold browser contexts per route/version at 390×844, dark and reduced motion, against the immutable original static build. Both are served on loopback. Original external font CSS and the frozen font bytes are fulfilled locally so network/provider latency cannot bias the comparison. These are local medians, not Core Web Vitals or real-user claims:

| Route | Load before → after | DOM ready before → after | Menu next frame before → after |
| --- | --- | --- | --- |
| Sign-in | 234.4 → 153.0 ms | 93.2 → 44.3 ms | 10.4 → 7.4 ms |
| Privacy | 165.4 → 167.7 ms | 81.7 → 43.8 ms | 1.6 → 0.8 ms |

The 2.3 ms Privacy median increase is small relative to the local timing variability and is not evidence of a user-visible regression. Built output grows from 317,873 to 545,132 raw bytes across all pages/assets: 190,068 bytes of that change are the two existing local Manrope fonts, now bundled once, plus two new pages and the secondary shell. Same-origin resources per sample grow from 11,733 to 203,294 bytes; the original number excludes its external font downloads, so those values must not be described as a like-for-like total network comparison. Sign-in HTML falls from 20,761 to 18,900 bytes after duplicated styling is removed; Privacy HTML grows from 9,837 to 11,827 bytes with accessible document navigation. No font asset format conversion, dependency upgrade, or new third-party request was introduced. Deployment caching/compression and real-device loading remain unmeasured.

## Existing content and integration dependencies

| Existing issue | Evidence / disposition |
| --- | --- |
| Moderation policy wording conflicts | `/guidelines` says every post receives automated analysis and high-confidence violations are blocked; `/ai-moderation` says paid automated detection is inactive and alpha uses declarations/flags/staff review. `/pricing` still lists AI-powered moderation, and `/about` says AI flags. Approved policy/pricing copy is preserved; owner/policy reconciliation is required before claiming complete product-wide language agreement. |
| Marketing availability promises | `/features` says Android, iOS and web are available and `/pricing` says full access to all features. No new availability claim was introduced; these pre-existing statements require launch-owner validation. |
| Support address availability | The contact route reuses `support@lythaus.app` from Terms exactly. Mailbox ownership/delivery was not tested, and no response-time promise was added. Privacy and safety addresses remain in their original documents. |
| Sign-in email query prefill | Static Astro output cannot apply server-time `Astro.url.searchParams` to a later request. Sign-in's existing script scrubs the query but does not perform the client prefill used by recovery/resend. This pre-existing behavior remains unchanged to keep the redesign's auth contract narrow. |
| Cooldown truth source | Signup/resend/sign-in retain their existing 30-second client cooldowns. This change does not reinterpret them as server-provided eligibility or delivery guarantees. |
| Invitation deployment rewrite | The local suite emulates the existing `/invite/*` rewrite. Real deployed routing and a successful app handoff remain integration checks. |

The separate operator application at `apps/control-panel/` uses Vite/React and its own `src/styles/tokens.css`, with no imports of the marketing layout/styles or this token file. Its package/config/source were inspected read-only. It is intentionally not rebuilt or restyled as part of the public/support migration; no shared-dependency path was found that would indirectly alter it.
