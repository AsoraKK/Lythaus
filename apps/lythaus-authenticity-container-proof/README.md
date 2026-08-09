# Cloudflare Container proof skeleton

This directory is intentionally not part of the active Worker deployment. It
is a future proof configuration that reuses existing Lythaus quarantine R2 and
Jobs Hyperdrive names. The flag is `false` and the example Worker name is
explicitly `not-deployed`.

The proof path is:

`Queue message -> existing quarantine R2 read -> named lite Container -> HTTP health/forensic byte features -> structured result -> existing PlanetScale audit write -> sleep after five minutes`

The Worker includes the queue handler, but the example configuration does not
attach a second consumer to an existing mixed queue. Before any future use, a
human must approve a routed proof-event binding through the existing Jobs
runtime; creating a new permanent queue is not permitted.

The image is a bounded, CPU-only HTTP process. It is not SAFE, does not call a
model, and returns `enforcementAuthority: NONE`. Each proof result records
cold/warm status, wall-clock latency, process CPU time, resident memory, and
an explicitly unknown estimated cost. It measures only the proof boundary;
it is not an accuracy result or production cost measurement.

Before a human-approved dry-run/deployment, install the package dependencies
in this directory, inspect the live resource registry, confirm the existing
bindings, calculate a published-rate bounded worst-case estimate, and approve
rollback and emergency disable. Exact spend is only known after a bounded
runtime measurement. Do not run `wrangler deploy` in WP002.
