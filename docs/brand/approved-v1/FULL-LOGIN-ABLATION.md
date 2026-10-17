# Full-login hosted diagnosis

This supplemental failure-only observation does not replace the required brand
gate. It runs direct paths, the pinned SVG `LythBrand` from
`f2c8712de963d6dc8f1d254abe6448f6a397da8f`, and a same-sized two-color placeholder
once each in fresh headless WPE contexts. All use the current source/dependencies,
the original `approved_brand_entry.main`, 320×960, light theme, 2× text, Manrope,
the original scrollable form and its stretched 272×40 brand slot. Production
widgets and renderer settings are unchanged by this diagnostic commit.

The placeholder replaces only the artwork draw call, inside the same fitted
bounds and transforms. A source-contract test verifies this. The SVG source is
copied unchanged from its pinned revision. Generated fixture sources, source
hashes, all served-file hashes and original build markers are retained. Only
`main.dart.js` may differ after checking and normalizing the generated bootstrap
service-worker version. No other loader, asset, font, WASM or dependency drift is
accepted. The earlier minimal-panel diagnostic and its evidence are preserved;
this hook does not rerun it.

A common fixture binding observes Dart frame, layout, compositing-bit, paint and
semantics flush boundaries. It also records render-box geometry without forcing
another frame. Direct/placeholder painters report their invocation. Browser
telemetry records HTTP status/body hashes, errors, crashes, context loss, request
animation-frame callbacks and light-DOM/open-shadow canvases. Dart pipeline
completion does not prove GPU presentation. SVG decode/frame readiness is not
instrumented, so a blank SVG sample alone cannot prove a compositing regression.

Screenshots at two fixed observation times (250 and 5250 ms after the common
settling/semantics setup) precede any resize or forced repaint. The original
nonblank threshold is measured independently for the brand, surrounding form,
and the first 900 surface rows, excluding the DOM QA overlay. The two-color
placeholder has a separate exact-color check; it cannot pass artwork fidelity.
Control bounds must match in all variants; direct/placeholder render geometry
must also match. These are diagnostic integrity checks, not release clearance.

Interpret the single sample conservatively. If all three full pages are blank,
reduce the shared page scene and stop changing brand code. If only the placeholder
paints, isolate brand-in-scene behavior and the stretched slot. If only direct
paths fail, isolate that painter. If the observed direct variant does not
reproduce the uninstrumented gate failure, do not assign candidate causation.
No browser retry-to-green, CPU forcing, tolerance relaxation, independent merge,
deployment or real Safari/device certification is authorized by this evidence.
