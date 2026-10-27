# Homepage opening

The opening keeps the approved Lythaus wordmark readable while a restrained warm reflection passes once across it. Navigation, copy and controls are visible from first paint. The header uses the approved LH symbol; descriptive section labels retain their anchors without decorative numbers.

## Artwork and palette

`OpeningWordmark.astro` references the exact approved `lythaus-wordmark-white.5ba0451347e2.svg` bytes. Its original outlines and proportions are contained within the existing 1000-by-166 scene. An alpha mask applies the shared off-white text token; optical layers combine only off-white and amber. The original SVG file and generated outline data are unchanged.

`palette.css` shares the four-colour contract with Flutter and `design/tokens.json`: canvas `#242321`, surface `#302E2B`, reading text `#F5F3EE`, accent `#EFC58D`. There are no brightness/saturation filters creating additional source colours. The original static artwork is tinted using an independent SVG flood filter when masks are unavailable. If both filters and masks are unsupported, the required original white artwork remains visible; this asset-preservation limitation is documented in `docs/design-system/four-colour-contract.md`.

`home-opening.css` owns optical geometry and timing. `home-polish.css` retains the existing type scale, spacing and waitlist layout. The scene uses SVG, CSS and native Web Animations without an animation dependency.

## Timing and interruption

After bounded font readiness (at most 300 ms), all animations receive a shared start time:

| Time | Behaviour |
| --- | --- |
| 0–120 ms | Complete static wordmark, copy and navigation |
| 120–1200 ms | One left-to-right light passage; the compact source stays central |
| 1200–1320 ms | Warm spill decays beyond the final letter |
| After completion | Animation objects and listeners are removed; static artwork remains |

The scene box and content positions remain fixed. There are no copy entrances or hidden navigation. Pointer, key, touch, scroll, focus, resize, history restoration, page visibility and reduced-motion changes resolve immediately without preventing the interaction. Resolution is idempotent. The 2500 ms bootstrap watchdog handles missing initialization.

The complete static fallback works with no JavaScript, reduced motion, unavailable Web Animations or SVG masks, failed initialization, hidden documents and fragment/history navigation. An eligible full refresh may play once again. The wordmark does not depend on font delivery, and there is no replay during scrolling or normal interaction.

## Validation

Run from the repository root with the pinned dependencies and available browsers:

```sh
npm run marketing:test
npm run build --prefix apps/marketing-site
npm run marketing:validate
npm run marketing:test:browser
```

The browser suite serves the local production build and checks desktop, tablet and mobile completion, static fallbacks, always-visible copy, interruptions, central-source geometry, beam exit, history/refresh behaviour, mobile keyboard navigation, supporting pages, form states and overflow. Report unavailable engines explicitly; do not treat Chromium results as native Safari or Samsung Internet validation.

Keep review screenshots and runtime experiments outside the repository. No deployment or release permission follows from these presentation changes.
