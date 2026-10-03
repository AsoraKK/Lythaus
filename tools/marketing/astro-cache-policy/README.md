# Astro remote-image freshness policy

This private, independently implemented package replaces the marketing site's
`http-cache-semantics` import only for pinned Astro 7.3.1. Its actual consumer is
`astro/dist/assets/build/remote.js`: construction with plain request/response
headers, `storable()` and `timeToLive()`. It is not a general HTTP cache library;
additional APIs or nondefault constructor options require a new compatibility
review. The package has no registry or runtime dependency.

The current upstream advisory
[GHSA-ch52-4w7c-c8xp](https://github.com/advisories/GHSA-ch52-4w7c-c8xp)
covers all published `http-cache-semantics` versions through 4.2.0. Astro 7.3.5
still depends on `^4.2.0`. No audit advisory, license or security gate is ignored.
The vulnerable request-reuse API and attacker-controlled `max-stale` logic are
absent from this replacement.

The loader uses expiry to reuse images without validation. Consequently this
policy returns **fresh lifetime**, rather than upstream's storage-retention
period that includes `stale-if-error` and `stale-while-revalidate`. Request
`max-stale` cannot extend it. No-cache, no-store, private, proxy-revalidate,
wildcard Vary and shared cookies without explicit public permission get zero
TTL. Unsupported methods/statuses, malformed/duplicate directives and invalid
delta seconds fail closed. Denials are checked by presence, and public opt-in
must be a valid bare directive. Ordinary max-age, shared s-maxage precedence,
Age, apparent response age from Date, Expires and Last-Modified heuristics remain
supported. Immutable's fallback is
24 hours only without an explicit expiry or valid modification heuristic;
immutable never extends either lifetime. Seconds are converted to milliseconds
once. These conservative
differences can cause earlier remote-image revalidation; they do not alter the
homepage or its rendering inputs.

This is scoped to build-time image freshness. Astro's existing image generator
separately persists results and may use stale images on a revalidation error;
this package does not claim to change that behavior or certify a generic cache
for sensitive responses. The current marketing pages do not use remote-image
transformation. Their complete static build is compared before and after this
change, and tests exercise the real pinned remote loader's image bytes,
validators, 304 responses, empty-body retries, error and redirect boundaries.

Sources: [Astro's pinned consumer](https://github.com/withastro/astro/blob/astro%407.3.1/packages/astro/src/assets/build/remote.ts),
[RFC 9111](https://www.rfc-editor.org/rfc/rfc9111.html), and the
[upstream report](https://github.com/kornelski/http-cache-semantics/issues/56).
Before upgrading Astro or adding an importer, rerun the consumer inventory,
loader compatibility tests, full lock/manifest preservation checks, native
dependency/license review and dependency audits. This package uses the
repository's MIT license and does not vendor upstream BSD-licensed code.
