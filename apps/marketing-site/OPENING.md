# Homepage opening

Lythaus's opening represents one encounter with a rotating light. The material exists before illumination. A compact white point stays at the centre of the word while its beam, reflected light and warm outer spill travel left to right, leaving stable warm ivory. The source stays fixed; the beam turns. No reference-video measurements are claimed.

## Structure and tuning

- `OpeningWordmark.astro` contains one vector word shape, a dark material layer, accumulated exposure, local reflection and an independent light source. Decorative geometry is hidden from assistive technology; the heading is named Lythaus.
- The shape is artwork derived from [Manrope](https://github.com/google/fonts/tree/main/ofl/manrope), weight 500, with 34 font units of added tracking, normalized to a 1000-unit advance and a 160-unit baseline. No font binary or image sequence is embedded in the wordmark.
- `home-opening.css` owns core geometry and timing. `home-polish.css` owns the final production optical gain, warmer ivory/gold palette, disciplined homepage type scale and the unboxed waitlist treatment. Geometry uses SVG scene units; timing values are milliseconds. Mobile adjustments keep the same concept at 390 px.
- The supplied visual reference informs the brighter champagne-ivory lettering, warm-white light and gold falloff. The active optical layers intentionally run much hotter than the earlier restrained version: the white core remains display white while local bloom, clipped reflection and warm spill use layered brightness and small bounded drop shadows to create the perception of an ultra-bright source without a full-screen flash.
- `home-opening.js` projects one angular coordinate across the material response and moving beam. A faint tapered projection connects the stationary central point to the moving footprint, narrowing as it faces the viewer and opening toward the right. The point's halo and white core never translate. Native animations are constructed once, then given the same start time after setup. One requestAnimationFrame schedules initialization; there is no JavaScript frame loop.
- The homepage preloads the existing DM Sans and Manrope Latin font files directly. Other routes retain their existing font loading. The SVG word and its vertical anchor do not depend on font delivery.
- The scene remains SVG/CSS/WAAPI only. There is no canvas, WebGL, raster sequence or animation library.

## Timeline

All times are relative to the shared animation start, after setup. Pending font layout gets at most 300 ms before that start; interruption remains immediate during this bounded preparation.

| Time | Event |
| --- | --- |
| 0–120 ms | Dark material; stillness |
| 120–1200 ms | One spatial passage from -70 to 1070 in the 1000-unit scene |
| ~174–1092 ms | Stationary central core remains at full intensity before fading |
| ~584–725 ms | Primary light energy reaches and holds its peak |
| 1200–1320 ms | Environmental spill decays beyond the S |
| 1320–1420 ms | Stillness |
| 1420–1600 ms | Tagline enters |
| 1510–1690 ms | Supporting sentence enters |
| 1585–1765 ms | CTA and header enter |
| After ~1780 ms | Animations cancelled; unmasked ivory and static controls |

The reflection trail spans approximately 120 ms at the mean traversal velocity. Opacity entrances last 180 ms, with no more than 5 px of vertical travel. Header position never animates.

## Refresh and progressive enhancement

The default document is the complete readable page. The early homepage-only bootstrap arms the animation on every eligible full page load, including a normal browser refresh. It is intentionally not session-gated.

The opening still resolves immediately instead of playing when any of these conditions apply:

- `prefers-reduced-motion: reduce`
- the document is hidden
- the URL arrives with a fragment identifier
- the browser restores a back/forward history entry
- the Web Animations API is unavailable
- initialization fails

Any pointer, key, touch, scroll or focus input resolves immediately without preventing the input. Resize, hiding/leaving the page, history restoration and changes to reduced motion also resolve. Resolution is idempotent, removes listeners, clears the watchdog, cancels animations and removes all optical masking. A 2500 ms bootstrap watchdog handles missing initialization.

The narrative does not depend on scroll-triggered reveals. Approved copy, anchors and waitlist submission behaviour are unchanged.

## Typography and bottom-of-page cleanup

The homepage uses one editorial section-heading scale instead of enlarging individual chapters to fill space. Hero support, section headings, ledes, body copy, emphasis lines and principle rows now follow a small consistent hierarchy across desktop and mobile.

The private-beta area is explicitly forced back into the page flow as a transparent editorial section. Legacy homepage card styling cannot give it a floating background, side border, radius, shadow or transform. This prevents the obsolete boxed treatment from appearing as a stray block near the bottom of the page while preserving the waitlist and Turnstile behaviour.

## Validation

Run from the repository root after dependency installation:

```sh
npm run marketing:test
npm run build --prefix apps/marketing-site
npm run marketing:validate
npx playwright install --with-deps chromium firefox webkit
npm run marketing:test:browser
```

The browser suite serves the production build on an ephemeral loopback port. It validates stable completion at desktop, laptop, tablet and 390 px mobile widths, interruption behaviour, reduced motion, no-JavaScript fallback, fixed central source geometry, the beyond-S beam exit, refresh replay, static history restoration and absence of horizontal overflow.

Review recordings and screenshots belong outside the repository. Do not ship the reference, QA recordings, captured frames, font-source download or runtime experiments as site assets.
