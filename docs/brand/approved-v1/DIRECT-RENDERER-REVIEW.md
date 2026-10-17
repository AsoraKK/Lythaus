# Direct renderer review: held candidate

Preserved implementation: `ed10b549fb1a4c7556dd83c643d8e8987781b502`.
Current-main integration is a normal merge of
`96bac288e8794d0d4bf9d82db86dfbf71db73929`, on a separate review branch.
No force push, merge to main, deployment, or gate relaxation is authorized here.

The widget draws a standalone wordmark OR symbol. Source SVG geometry/colors remain
unchanged. The generator precompiles SVG commands and transforms into Dart canvas
calls; there is no runtime XML or SVG path-string parsing on this web path.
Only the selected painter constructs paths when painted, rather than eagerly
constructing all variants. Native rendering continues to use the approved SVGs.

Path reuse (`8c27b457`) and Paint reuse (`5bc23a1b`) were evaluated separately and
failed headed rendering. Generation-time transform flattening (`d7e6d0fd`) passed
native fidelity but failed headed desktop onboarding. Private glyphs (`e5e788e6`)
failed 28/72 fidelity comparisons. None of these experiments is selected. Further
object caching cannot be called safe from these results; no tolerance was relaxed.

## Performance evidence

Baseline `f2c8712de963d6dc8f1d254abe6448f6a397da8f`; candidate runtime
`987524806d70a7122dc0f306df568880bdcfba98` (application code identical to ed10b549).
Both use the normal renderer. Same Linux container, software graphics, headed
WebKit 26.5, private Xorg display in the same IPC namespace, en-US locale, 960px
viewport height, reduced motion, local immutable release fixtures, synthetic
composer and identical font routing. Four alternating matched pairs per width;
16 measured trials total plus four excluded warmups. No concurrent builds/browser
suites ran during measurement. Timing includes automation and frame synchronization.

Composer opening, milliseconds:

| Width | Variant | n | Median | Empirical p95* | Min–max | Sample SD |
|---|---|---:|---:|---:|---:|---:|
|390|Baseline|4|290.56|301.70|282.32–301.70|8.13|
|390|Candidate|4|274.18|277.85|269.42–277.85|3.46|
|1440|Baseline|4|419.09|500.91|348.91–500.91|62.15|
|1440|Candidate|4|480.00|520.99|380.32–520.99|61.75|

*Nearest-rank p95 equals the maximum with only four observations; it is not a
reliable population-tail estimate. Desktop median difference is +60.91ms (+14.53%),
with overlapping ranges and substantial variability. This is an observed difference,
not evidence establishing a material regression or universal performance preservation.
Desktop typing CPU median fell 2.59% and input p95 median fell 4.02%; mobile typing
CPU rose 1.65% and input p95 median rose 0.33%. Real-device performance is unverified.

## Headed versus headless: actionable distinction

The installed Playwright WebKit `pw_run.sh` selects **different Linux ports**:
`--headless` selects `minibrowser-wpe`; headed selects `minibrowser-gtk`.
Thus toggling headless is not simply hiding the same GTK window. The successful
headed harness also pins en-US locale and adds independent desktop capture; its
existing protocol pixel threshold is unchanged. Headless failure reached the
nonblank-brand assertion with no page errors or blocked requests, so it was not
merely a locale startup exception.

The smallest useful next diagnostic is a one-page WPE/GTK comparison with identical
locale, fonts, compiled bytes and direct-path/canvas image controls, recording the
actual port/graphics context. It should isolate WPE offscreen canvas/readback from
application initialization, rather than rerun the unchanged 24-case suite. Do not
substitute GTK for the required WPE gate or enable a global CPU override.

Two full 24-case headed brand runs and 24 Chromium cases passed before integration,
with paired independent desktop/protocol evidence. Required headless WebKit still
fails. Hosted exact-head CI, real Safari/device review, performance acceptance and
coordinated release approval remain outstanding. This document grants no clearance.

## Diagnostic follow-up (17 October)

The integrated 623c48cf headed run passed 17 cases then failed dark onboarding at
390px. Both independent desktop and protocol captures showed the entire Flutter
surface blank with the DOM QA label visible. The earlier passes do not supersede
this failure. Matching main.dart.js alone did not attest the whole environment.

The combined hosted Chromium/WebKit brand step at 623c48cf subsequently failed.
Independent review also confirmed a separate Web frontends rendered-email-
authentication controls timeout at 60 seconds in run 39061136619. That failure is
not attributed to branding. Dependency audits passed; the failed aggregate summary
reflects launch blockers rather than a dependency-audit failure.
The evidence artifact exists, but log/artifact downloads returned Forbidden; the
available step status cannot identify the failing engine or assertion. Hosted
CI installs browsers with --with-deps. Local host validation instead reports missing
libGLESv2.so.2 despite the bundled library and launcher library paths. Local runs
that skip this validation remain diagnostic evidence, never release clearance.

The new bounded fixture isolates a Flutter rectangle, text, direct vector artwork,
production brand widget, SVG and PNG image, with independent DOM/2D controls. It
also runs without any brand/image region. Telemetry installed before navigation
records HTTP statuses and response hashes, request failures, page errors/crashes,
HTML/OffscreenCanvas context events and a browser requestAnimationFrame heartbeat.
That heartbeat is not a Flutter raster/frame counter. Worker-only context
events are not instrumented. Build-file inventories and sampled live process/library
hashes supplement browser-bundle and font hashes; they do not attest real hardware.

In earlier local headed controls, baseline f2c8712d and the candidate both painted
rectangle/text and passed direct/production/SVG artwork fidelity, with working DOM,
2D and no-brand controls. No whole-Flutter loss was seen. Later console telemetry
exposed a diagnostic-server CSS MIME error that earlier telemetry missed; those
samples are not healthy-environment comparisons. The PNG region painted on baseline but was blank
on candidate in this bounded sample before image readiness was instrumented;
loading, decoding and presentation were not distinguished. This does not establish
an image-path regression or whole-surface candidate causation. Both actual dark-390 onboarding pages
also passed a single fresh-context artwork check. Candidate specificity of the
earlier whole-surface loss therefore remains UNRESOLVED, not disproved.

An initial diagnostic server root-route error and initial expanded-semantics crop
errors are preserved as invalid setup evidence. Corrected fixture crops use its
fixed geometry independently of semantics. No failed production gate was retried
until green, removed, weakened or replaced. No preceding-sequence replay is claimed.

The production browser harness retains its nonblank threshold and additionally
compares tight artwork pixels against the approved SVG: mask precision/recall >=90%
with one-pixel edge allowance, and normalized RGB difference <4%. Shell assertions
crop the centered 24px artwork, never the whole control. Native 0.5% geometry tests
remain unchanged. Negative tests reject blank, border-only, wrong-icon and solid
fills. Named-image counts and decorative duplicate checks are explicit. The SVG
generator accepts only its documented pinned subset, rejects unknown attributes
and malformed/nonfinite transform arguments, and is not a general SVG translator.

The named-wordmark crop now applies BoxFit.contain geometry to every named slot,
including login's stretched 272x40 semantics box (centered artwork about 144x40).
Positive stretched and width-limited container tests complement the unchanged
negative controls and fidelity thresholds.

The fixture now separately records Dart persistent-frame callbacks and per-region
CustomPainter callbacks. These attest Dart frame/paint execution, not GPU raster
completion or physical presentation. PNG ImageStream decode, frameBuilder-ready
and error signals are explicit. Diagnostics wait at most ten seconds for these
signals, retain readiness timeouts/errors as failures, and do not infer an image
presentation failure from an unready image. This instrumentation is fixture-only;
no production renderer, frame scheduling or CPU workaround is changed.
The diagnostic server now serves Flutter's semantics stylesheet as text/css;
the run that exposed its prior MIME error is retained as failed setup evidence.

With the CSS correction and readiness instrumentation, the bounded matched run
painted the PNG on BOTH baseline and candidate after decode/frame-ready signals.
Each branded fixture recorded five Dart frame callbacks and three per-region paint
callbacks; both no-brand fixtures also painted their controls. DOM/2D, direct,
production and SVG fidelity checks passed, without recorded health errors. This
supersedes the earlier unready/invalid-setup comparison as diagnostic evidence,
but does not erase historical failures or establish their cause. Whole-surface
candidate specificity remains unresolved; no real Safari or release clearance.

## Hosted WPE follow-up

Independent review verified run 39063337879 at 58692536: Chromium passed all 24
brand cases and Web frontends email controls passed. The first headless WPE
login-light-320 case failed the original nonblank guard. Artifact 12111554790
showed the whole Flutter surface white with the DOM label visible, 17 HTTP 200
resources with hashes, no recorded errors/crashes/context loss, five WebGL2
requests and 23 semantics nodes. Empty light-DOM canvas inventory is not evidence
of absent canvas rendering; shadow roots, offscreen contexts and workers differ.

The workflow now runs supplemental WPE diagnostics only after that required gate
fails, then uploads all build/resource/health/pixel evidence. The original failed
step remains failed. Both fixtures use the same current tree and dependency lock;
only the baseline LythBrand source is replaced with the pinned f2c8712d SVG widget.
This counterfactual baseline is not a claim that the entire old application tree
was tested. Both builds retain the identical new diagnostic fixture/direct control.
Original bootstrap hashes are retained, and the build-specific service-worker
version is equalized only after proving it is the sole loader difference. Every
non-main.dart.js build resource must then match exactly, or comparison stops.
The hosted comparison uses headless WPE, light scheme, width 320, brand/no-brand
controls, Dart frame/paint callbacks and PNG readiness. It does not rerun GTK,
force CPU rendering, change fidelity tolerance or grant release clearance.

Raw measurements, scripts, approved-geometry comparisons and screenshots:
[preserved review bundle](https://chatgpt.com/api/library/files/libfile_a7127ffd29b481919131f9e4a3853e17/download).
