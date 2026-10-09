# Profile usability and accessibility evidence

This dated evidence pack preserves eight representative screenshots from the
synthetic profile visual run. The full run captured 64 screenshots across
mobile/desktop and light/dark configurations; the other 60 images are omitted.
The copied [visual QA manifest](profile-visual-qa-manifest.json) records the
capture matrix and its zero unexpected runtime errors or unhandled API paths.

## Provenance

- Exact source commit tested locally: `c0fbf470b3a5fda5f379c95ec538a57ff5d709f4`.
- Draft PR #973 head: `c1e0f2b8ea9b2e0ed563a64b8726615bcfda7944`.
- Both commits have the same tree: `4aaeab2afd2737a4bcace04d67ed785a77a02276`.
- Base `main`: `1853ed33fe5aa0b159597b914a5e77c84a69d193`.
- Browser: Chromium `151.0.7922.34`; app built with Flutter `3.41.1`.
- Fixtures are synthetic, served locally through the repository's browser
  fixture; no real account or production API was used.
- The account-unavailable captures omit `presentationPreferences` from the
  synthetic owner profile response. The loading captures hold that profile
  response while the preference section is loading.

## Pixel review

All eight PNGs retained here were individually opened and visually inspected.
Of the 64 screenshots in the full matrix, four were pixel-reviewed: the mobile
profile posts error/retry screen, desktop comments-unavailable screen, and
mobile/desktop account-first settings screens. The other 60 matrix screenshots
were captured by the automated run but not individually inspected.

## Captures

| File | CSS viewport | State |
| --- | ---: | --- |
| [profile-mobile-error-retry.png](profile-mobile-error-retry.png) | 390 × 844 | Posts error with visible tabs and Retry |
| [profile-desktop-comments-unavailable.png](profile-desktop-comments-unavailable.png) | 1440 × 960 | Comments tab unavailable state |
| [settings-mobile-account-first.png](settings-mobile-account-first.png) | 390 × 844 | Account settings and preference controls |
| [settings-desktop-account-first.png](settings-desktop-account-first.png) | 1440 × 960 | Account-first settings layout |
| [settings-mobile-preferences-loading.png](settings-mobile-preferences-loading.png) | 390 × 844 | Saved-preferences loading indicator |
| [settings-desktop-preferences-loading.png](settings-desktop-preferences-loading.png) | 1440 × 960 | Saved-preferences loading indicator |
| [settings-mobile-preferences-unavailable.png](settings-mobile-preferences-unavailable.png) | 390 × 844 | Unavailable notice; preference switches and Save disabled |
| [settings-desktop-preferences-unavailable.png](settings-desktop-preferences-unavailable.png) | 1440 × 960 | Unavailable notice; preference switches and Save disabled |

The preference captures use device-pixel ratio 2, so their PNG dimensions are
twice the CSS viewport dimensions. The account-unavailable screen is fixture
evidence for the presentation state; it does not claim that backend preference
columns have been applied or that persistence succeeds.

## SHA-256

```text
650535639fbeb1d2563cc10493c7ff7625d0067877da31b20dfb4f84f50c9933  profile-desktop-comments-unavailable.png
239f7eb7d26b337a1291653a4e764e4e571a45267b786da6b6df35542048f135  profile-mobile-error-retry.png
92aa9eba1647d4077596f58c497f6dc3edc086f9156eacc4e7194a390e0987f2  settings-desktop-account-first.png
1ceeda3be13d11421fdf1afa18571744e93ecef0ff3fafdb9b7479360f5a9732  settings-desktop-preferences-loading.png
f36f03b64352c7e5b8d0d240c7b47d78039d86b83e6ac53d8bdc8b6dae8c8132  settings-desktop-preferences-unavailable.png
c9aeb009ebe6642e019d5263ffb9079ed96edb4b23e80464a9a200012ee2035b  settings-mobile-account-first.png
0cb62a1d43bfccb2d229a4f10988af1a8760024b272a4c59a070149a3d909f37  settings-mobile-preferences-loading.png
d998a6bfee28609c424eb61cb9e14e1116e8c978eed8509bbb0e71aa4d1ae476  settings-mobile-preferences-unavailable.png
```
