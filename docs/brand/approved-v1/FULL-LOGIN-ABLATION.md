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

## Delayed-semantics follow-up

Head `38371f911f90682d1485adabe5a06dc8087fe1f9`, run `39070683274`, reproduced the
direct-path whole-page whiteout. SVG and placeholder forms painted identically;
SVG artwork was blank and placeholder colors were correct. The source and
artifacts remain preserved in the repository history and durable archive
`libfile_d600888f13b88191877b9ec3672f3f9e` (archive SHA256
`cdef82ef4570c701699053e9897a9b0c738fc006973f0224bda098f779784ed7`).
Frame/semantics timing differed, so a startup-order race remains possible.

The next failure-only hook runs direct paths and placeholder once each. It waits
for an observed Dart frame and read-only layout snapshot, captures the original
scene with semantics disabled, then clicks the semantics placeholder and captures
at 250/5250 ms. It records screenshot start/completion, activation and frame times,
plus Dart semantics state. Ordering assertions reject pre-enabled semantics,
activation during the initial screenshot, or capture before the first frame.
The first brand crop uses Dart render geometry because semantic nodes do not yet
exist. No new repaint wrapper, geometry/path transform, renderer override or
production source change is introduced. Resource parity remains enforced.
The earlier required gate and its startup order stay unchanged; this is a
diagnosis of ordering, not a new readiness wait that makes the gate pass.
