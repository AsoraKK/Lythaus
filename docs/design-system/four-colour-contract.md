# Four-colour presentation contract

The approved presentation uses one dark theme across the marketing site and consumer Flutter app. Existing layouts, content, navigation, authentication and release gates remain authoritative.

| Source token | Value | Role |
| --- | --- | --- |
| Canvas | `#242321` | Page background and labels on amber controls |
| Surface | `#302E2B` | Cards, inputs, sheets and raised regions |
| Text | `#F5F3EE` | Reading text, secondary text and essential control boundaries |
| Accent | `#EFC58D` | Actions, focus, selections, progress and warm light |

`design/tokens.json` defines semantic aliases. Marketing `palette.css` and Flutter `LythSemanticColors` are checked against it. The legacy light entry points resolve to the same dark presentation; there is no appearance selector. No generated Material seed palette is permitted.

Reading text stays opaque. Hierarchy uses the existing type scale, weight, spacing and line length. Text contrast is 14.16:1 on canvas and 12.21:1 on surface. Charcoal on amber is 9.75:1. Surface against canvas is only 1.16:1, so essential controls use a text or accent boundary rather than surface contrast alone.

Hover and pressed states may mix the four source colours or vary a decorative alpha. Keyboard focus uses an amber outline. Selected controls retain checkmarks, underlines, labels or position. Disabled controls retain readable labels, disabled semantics and their existing inactive behaviour; web controls also use a dashed boundary. Loading retains labelled progress. Errors, warnings, success and information use their existing distinct wording, icons and live announcements, with amber on a dark surface. Colour never carries status by itself.

The homepage keeps its beam opening with restrained energy. Navigation, copy and the approved wordmark remain readable throughout. Reduced motion, no JavaScript, unsupported masks, missing animation APIs, failed initialization, interruptions and history returns show the static approved artwork. The header uses the approved LH symbol. Decorative numbered section prefixes are removed while headings and anchor IDs remain intact.

Approved artwork bytes and generated outline data are immutable. Monochrome alpha masks, SVG flood filters or Flutter `srcIn` filters apply the text token to those outlines. The independent SVG filter preserves the static approved wordmark when masks are unavailable. User media, third-party logos and OS-rendered controls are excluded from recolouring.

Asset conflicts to report: immutable application/social icons retain their originally approved colours. If both SVG filters and masks are unavailable, the required static original artwork retains its original white. These are artwork-preservation limitations, not additional approved interface tokens. They must be disclosed with validation evidence.

Validation: marketing source/asset/protection tests, cross-platform colour inventory and contrast tests, Flutter theme/component/screen tests, and real browser checks with synthetic data. Browser availability limitations must be reported; Chromium is not evidence for native Safari or Samsung Internet.
