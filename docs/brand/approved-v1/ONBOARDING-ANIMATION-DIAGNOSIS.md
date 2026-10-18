# Isolated Flutter animation-policy control

PR1046's frozen head 79c7b46a showed a production-host/static differential, but
MediaQuery.disableAnimations was false in production and true in every static
control. Browser reduced-motion preferences did not equalize that Flutter field.
This experiment tests that one mismatch before auth-timing or visible-host work.

At light 320px and 2x text, both controls use the exact static-configured fixture,
public build defines, assets, renderer, fonts, read-only geometry getter and
passive observation protocol. Only the existing disableAnimations literal differs.
There is no hidden app, presentation wrapper, application API traffic, fake auth
transition or new route. The true-policy compiled script must match PR1046's
configured-static SHA-256 exactly. All assets/CanvasKit files match across builds.

The existing observer is mechanically adapted only for two control names, one
condition, the policy assertion, output location and documented limitations.
Original/adapted observer bytes and hashes are retained. Captures remain at least
250ms and 5250ms after natural first-frame, with semantics disabled and unchanged
pixel/fidelity thresholds. No frame request, interaction, repaint loop or canvas
wrapper is added. Visible fractional geometry must match across both policies.

There is one observation per policy per engine, in disabled-then-enabled order.
This is a narrow differential, not broad device certification or a renderer root
cause. No frame counts are collected. A policy-dependent result does not permit
changing the original matrix or acceptance thresholds. PR1045 and PR1046 stay
frozen, and the original cold-static failures remain recorded. Do not merge or
deploy this diagnostic branch. The unexecuted held-refresh draft is preserved in
its separate worktree; the settled visible-host alternative remains deferred.
