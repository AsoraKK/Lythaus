# Four-colour presentation contract

The approved presentation uses one dark theme across the marketing site and consumer Flutter app. Existing layouts, content, navigation, authentication and release gates remain authoritative.

| Source token | Value | Role |
| --- | --- | --- |
| Canvas | `#242321` | Page background and labels on amber controls |
| Surface | `#302E2B` | Cards, inputs, sheets and raised regions |
| Text | `#F5F3EE` | Reading text, secondary text and essential control boundaries |
| Accent | `#EFC58D` | Actions, focus, selections, progress and warm light |

`design/tokens.json` defines semantic aliases. Marketing `palette.css` and Flutter `LythSemanticColors` are checked against it. The legacy light entry points resolve to the same dark presentation; there is no appearance selector. No generated Material seed palette is permitted.

Native startup surfaces also mirror the canvas token: Android launch/normal windows use `@color/lythaus_canvas` in both appearance resources, and iOS launch/main storyboards use its exact sRGB components. Parity tests cover these static bootstrap representations. The existing iOS launch-image placeholders remain fully transparent. Native device rendering requires separate validation.

Reading text stays opaque. Hierarchy uses the existing type scale, weight, spacing and line length. Text contrast is 14.16:1 on canvas and 12.21:1 on surface. Charcoal on amber is 9.75:1. Surface against canvas is only 1.16:1, so essential controls use a text or accent boundary rather than surface contrast alone.

Hover and pressed states may mix the four source colours or vary a decorative alpha. Keyboard focus uses an amber outline. Selected controls retain checkmarks, underlines, labels or position. Disabled controls retain readable labels, disabled semantics and their existing inactive behaviour; web controls also use a dashed boundary. Loading retains labelled progress. Errors, warnings, success and information use their existing distinct wording, icons and live announcements, with amber on a dark surface. Colour never carries status by itself.

The homepage uses a strong amber beam to progressively reveal the approved wordmark. Navigation and copy remain visible throughout, and the heading retains its accessible name. Reduced motion, no JavaScript, unsupported features, unavailable artwork, failed initialization, interruptions and history returns show the static approved artwork. The header uses the approved LH symbol. Decorative category eyebrows are removed while headings and anchor IDs remain intact.

Approved artwork bytes and generated outline data are immutable. Marketing and app startup pages inline the exact approved SVG paths, transforms and viewBox with `currentColor` fill; their static representations use the text token without JavaScript, masks or filters. The enhanced opening uses alpha masks, and Flutter uses `srcIn` filters on the same approved outlines. User media, third-party logos and OS-rendered controls are excluded from recolouring.

Selected consumer/marketing favicon, PWA, native launcher and social-preview exports use palette-matched derivatives. Original masters and imported copies remain byte-identical for provenance; active references select the new exports, and exact temporary icon-alias redirects retain compatibility. The [derivation contract](../brand/four-colour/README.md) records source hashes, geometry/alpha preservation and the exported palette. Normal page headers, footers, wordmarks, startup and no-JavaScript content have no original-white fallback exception.

Validation: marketing source/asset/protection tests, cross-platform colour inventory and contrast tests, Flutter theme/component/screen tests, and real browser checks with synthetic data. Browser availability limitations must be reported; Chromium is not evidence for native Safari or Samsung Internet.

Consumer brand browser references use the pinned LH symbol in shell headers/sidebars and the pinned wordmark in authentication/onboarding. Independent SVG references apply the text token, and both OS colour preferences must retain the single charcoal presentation. Artwork fidelity thresholds, wrong-artwork negative controls and the complete viewport/preference matrix remain enforced. Admin references retain their original artwork contract.
