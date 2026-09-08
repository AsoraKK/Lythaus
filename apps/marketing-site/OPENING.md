# Homepage opening

Lythaus's opening represents one encounter with a rotating light. The material exists before illumination. A compact white point stays at the centre of the word while its beam, reflected light and warm outer spill travel left to right, leaving stable ivory. This follows the user's refinement of the lighthouse description: the source stays fixed; the beam turns. No reference-video measurements are claimed.

## Structure and tuning

- `OpeningWordmark.astro` contains one vector word shape, a dark material layer, accumulated exposure, local reflection and an independent light source. Decorative geometry is hidden from assistive technology; the heading is named Lythaus.
- The shape is artwork derived from [Manrope](https://github.com/google/fonts/tree/main/ofl/manrope), weight 500, with 34 font units of added tracking, normalized to a 1000-unit advance and a 160-unit baseline. No font binary or image sequence is embedded in the wordmark.
- `home-opening.css` owns core width, bloom dimensions, warmth, intensity and timing. Geometry uses SVG scene units; timing values are milliseconds. Mobile adjustments keep the same concept at 390 px.
- The supplied colour reference informs champagne-ivory lettering (`#f3e5c7`), warm-white light (`#fff7de`) and gold falloff (`#efd095`). `--letter-reveal-gain: 1.5` raises the reflection shoulder and luminous persistence by 50%; the already-white peak stays capped at display white. This is an optical gain, not a claim of 50% greater physical screen luminance. Timing and the fixed central source are unchanged.
- `home-opening.js` projects one angular coordinate across the material response and moving beam. A faint tapered projection connects the stationary central point to the moving footprint, narrowing as it faces the viewer and opening toward the right. The point's halo and white core never translate. Native animations are constructed once, then given the same start time after setup. One requestAnimationFrame schedules initialization; there is no JavaScript frame loop.
- The homepage preloads the existing DM Sans and Manrope Latin font files directly. Other routes retain their existing font loading. The SVG word and its vertical anchor do not depend on font delivery.
- The scene uses bounded SVG radial gradients rather than blur filters, blend-mode dependencies, canvas, WebGL or an animation library. SVG masks still require painting; the implementation does not claim compositor-only execution.

## Timeline

All times are relative to the shared animation start, after setup. Pending font layout gets at most 300 ms before that start; interruption remains immediate during this bounded preparation.

| Time | Event |
| --- | --- |
| 0–120 ms | Dark material; stillness |
| 120–1200 ms | One spatial passage from -70 to 1070 in the 1000-unit scene |
| 206–1070 ms | Stationary central core maintains white before fading |
| 672–744 ms | Primary bloom reaches its one intensity peak |
| 1200–1320 ms | Environmental spill decays beyond the S |
| 1320–1420 ms | Stillness |
| 1420–1600 ms | Tagline enters |
| 1520–1700 ms | Supporting sentence enters |
| 1600–1780 ms | CTA and header enter |
| After 1780 ms | Animations cancelled; unmasked ivory and static controls |

The reflection trail spans approximately 120 ms at the mean traversal velocity. Opacity entrances last 180 ms, with no more than 6 px of vertical travel. Header position never animates.

## Progressive enhancement

The default document is the complete readable page. The early homepage-only bootstrap arms animation only for an eligible first visit in the tab session. Session storage records an attempt when it begins; repeat visits, history restoration, fragment arrivals, reduced motion, unavailable storage and unavailable animation APIs use the static state.

Any pointer, key, touch, scroll or focus input resolves immediately without preventing the input. Resize, hiding/leaving the page, history restoration and changes to reduced motion also resolve. Resolution is idempotent, removes listeners, clears the watchdog, cancels animations and removes all optical masking. Initialization failure resolves immediately when detected; a 2500 ms bootstrap watchdog handles missing initialization.

The narrative does not depend on scroll-triggered reveals. Approved copy, anchors and waitlist submission behaviour are unchanged.

## Validation

Run from the repository root after dependency installation:

```sh
npm run marketing:test
npm run build --prefix apps/marketing-site
npm run marketing:validate
npx playwright install --with-deps chromium firefox webkit
npm run marketing:test:browser
```

The browser suite serves the production build on an ephemeral loopback port. Set `HOMEPAGE_QA_DIR` to an external directory to retain eight optical frames at desktop/mobile widths and complete screenshots from all three engines. It intentionally blocks external font delivery to exercise geometry and readable fallback independently. Full-font visual and performance review is a separate check. The Web frontends CI job runs this suite.

Local review on 2026-09-08 covered Chromium 151, Firefox 153 and WebKit 26.5, using Playwright 1.62.0. Viewports: 1440 × 900, 1280 × 800, 768 × 1024 and 390 × 844. The word's first, intermediate, exit and settled frames were inspected, together with source-only and material-only isolation captures. Production and local visible-copy extraction matched across all 15 homepage groups.

A separate cold-cache Chromium recording with real font delivery measured:
- Desktop: zero layout shift; maximum 16.8 ms frame interval during the measured traversal.
- 390 px at 4× CPU throttling: zero layout shift; maximum 16.8 ms traversal frame interval, with no intervals above 34 ms.
- 1781 ms desktop and 1789 ms throttled mobile from activation to natural completion.
- Startup long tasks of 168 ms and 70 ms occurred on the throttled run before the light traversal. These are not presented as a completely long-task-free page. An earlier run exposed font layout during traversal; the bounded font preparation was added in response.

These are local engine/emulation results, not measurements from a physical phone or desktop Safari. The source/controller/optical stylesheet total approximately 4.7 KB gzipped separately; this excludes the existing font resources and the rest of the page. The old hero system and unused preview CSS were removed.

## Visual review decisions

The generated planning board establishes the sequence, not literal timing or assets. Its texture and broad amber halo were deliberately rejected. The implementation retains a flat near-black background, a neutral white core, restrained warmth at the edge, medium-weight vector typography, smaller supporting copy and uninterrupted editorial chapters. It ships no generated bitmap.

Review recordings and screenshots belong outside the repository. Do not ship the reference, QA recordings, captured frames, font-source download or runtime experiments as site assets.
