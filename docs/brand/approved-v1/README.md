# Approved app branding

Source: Lythaus-approved-brand-assets-v1.zip, Library
libfile_fc1857b59fc08191b925fcb73d07e27b, approved by Kyle on
2026-10-16 at 10:18 UTC.

ZIP SHA-256: 5e39cb394ce182f540a5434f8e14267a51b40977a05c1ed3816918d85ff22995.
All 173 checksums in the supplied SHA256SUMS.txt were verified before import.
INTEGRATION-MANIFEST.json and source checksums are unchanged package bytes.
import-map.json records each imported repository path and source digest.

## Integration

- Kyle's 17 October either/or requirement selects standalone black/white
  wordmarks for named headers and entry screens, and standalone black/warm LH
  symbols for compact surfaces. Combined LH+wordmark lockups are not displayed.
  Their imported files remain unchanged for source provenance.
- Flutter uses these standalone variants through LythBrand. It keeps the supplied
  aspect ratio and does not tint, animate, reconstruct, or alter the artwork.
- Desktop navigation retains its injectable passive brand slot. The feed mark
  remains the existing **Feed controls** button, with that action label; the
  child image is decorative. Standalone artwork has one **Lythaus** image label.
- Login, onboarding and expanded desktop navigation use the standalone wordmark.
  The control-panel header also uses the standalone wordmark. Onboarding remains scrollable at
  320px with enlarged text. Authentication and composer state logic is unchanged.
- App and admin headers/icons use the manifest's fingerprinted paths.
  Fingerprinted paths are immutable; stable fallback aliases keep their existing
  revalidation policy. Legacy web icon URLs now serve the corresponding approved
  exports so older documents do not request Flutter artwork.
- The existing web manifest retains its routing/display fields. Regular and
  maskable icon purposes remain distinct. Native resource identifiers and Apple
  size/scale catalog declarations are preserved. Android v26 adaptive and v33
  monochrome resources reference the supplied vector foregrounds.
  Local notification initialization uses the supplied white monochrome drawable,
  avoiding the opaque/adaptive launcher background as a small notification icon.
  This only changes the icon reference; it does not activate notification delivery.
- Marketing files are outside this integration. Neutral native splash resources
  are retained; the existing iOS launch images are empty 1px placeholders.

## Repeatable validation

Run from the repository root:

    node --test scripts/tests/approved-brand-assets.test.mjs scripts/tests/version-web-entrypoints.test.mjs

The asset checks verify the pinned source manifest, every imported byte,
browser references, native dimensions/catalogs, ICO frames and cache policy.
They are included in CI.

Flutter tests cover approved theme selection, contrast, single/decorative image
semantics, static wordmarks, narrow onboarding, and existing auth/navigation
regressions. Updated wordmark/onboarding goldens depict the approved artwork.

Build and exercise the synthetic fixture:

    flutter build web --release --no-tree-shake-icons --no-web-resources-cdn --target test/browser/approved_brand_entry.dart --output build/brand-web
    npm run build --prefix apps/control-panel
    BRAND_SOURCE="$(git rev-parse HEAD)" node scripts/tests/approved-brand.browser.mjs
    BRAND_SOURCE="$(git rev-parse HEAD)" BRAND_BROWSER=webkit node scripts/tests/approved-brand.browser.mjs
    NAVIGATION_SOURCE="$(git rev-parse HEAD)" NAVIGATION_WEB_BUILD=build/brand-web node scripts/tests/adaptive-shell.browser.mjs

Brand browser checks use real Flutter/React components with synthetic local
auth/admin responses. They cover light/dark at 320/390/1440px, 2x text at 320px,
form preservation through resize, continuation controls, admin navigation,
favicon responses, and screenshots. The existing navigation browser test
additionally checks draft text, selection and focus across resizing/tab changes,
keyboard navigation, and sign-out.

Screenshots still require painted pixels inside the accessible brand bounds,
in addition to checking the label and dimensions. This candidate retains the
normal Flutter renderer; the prior global WebKit CPU workaround is unacceptable
because of measured composer regression. The service-worker version token and
immutable release hashing are preserved.

Release remains held: the strict WebKit pixel gate is unresolved. Static WebGL
protocol snapshots differ across engines, but sampling a non-preserved drawing
buffer after presentation does not prove the displayed UI is blank. The available
headed WebKit desktop-capture path also fails plain-HTML calibration. A trustworthy
independent visible-layer capture is needed before release validation can be
completed. No CPU, preserved-buffer, repaint-loop or retry workaround is used to
clear this gate. Real Safari behavior and device performance remain unverified.

Native byte/mapping validation does not prove compilation or device rendering.
Android, iOS, macOS and Windows packaging must be checked on their native
toolchains before any native release. This Linux environment lacks the Android
SDK and Apple/Windows build tools. Production asset/hash smoke remains a
coordinated deployment gate; no deployment is performed by this change.
