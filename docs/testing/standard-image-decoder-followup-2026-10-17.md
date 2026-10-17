# Standard image decoder and storage acceptance follow-up

Review branch: `codex/media-handler-review-20261017` (draft PR #1044)

Candidate base: `da6515d13f2d46950a8211008f89909f23b64a80`
Current PR base: `main` at `96bac288e8794d0d4bf9d82db86dfbf71db73929` after PR #1039.
Scope: ordinary private image upload/processing acceptance only.

This follow-up changes the media Jobs handler and deterministic local test
fixtures. It does not change migration SQL, schema, privileges, Worker feature
flags, public attachment/display routes, branding, or shared transaction
wrappers. Upload and processing flags remain disabled. No hosted image service,
bucket, database, or detector was activated or written.

## Decoder and EXIF coverage

The Jobs handler requests WebP output with animation disabled, then asks the
Images binding to inspect the actual transformed bytes. Missing or invalid
output dimensions are retryable transform failures. Variant dimensions now
come from the normalized derivative, so EXIF orientation is reflected in the
stored metadata rather than copied from the source.

The Workerd and disposable PG17 suites send a real 3×2 JPEG through the actual
upload/finalize/queue handlers. Its EXIF contains orientation 6, a Make field,
and a GPS IFD with coordinates. A pinned local Sharp/libvips fixture performs
the decode, orientation normalization, and WebP encoding. The checks verify a
2×3 WebP derivative, no EXIF/XMP metadata in the derivative, matching object
and variant dimensions, bounded derivative bytes, and removal of the private
quarantine source after settlement. The object remains `review`; tests assert
that no `content` or `feed` write occurs.

Sharp/libvips is a deterministic local decoder/encoder fixture. It is not the
hosted Cloudflare Images service. These tests do not certify hosted decoding,
resource limits, animation behavior, billing, queue delivery, or R2 cleanup.
The detector still has no pixel input or qualified output: persisted evidence
remains `not-executed` and review-required. Metadata, MIME, dimensions,
checksums, and signatures are not image-pixel detection or authorship proof.

## Mixed-version derivative retries

New derivatives use `standard-webp-v2` metadata whose dimensions come from the
actual normalized WebP bytes. A cached `standard-webp-v1` derivative remains
eligible only after its bounded bytes, checksum, MIME, source checksum, and
reservation are verified. Because v1 dimensions may describe the pre-rotation
source, every v1 cache read re-inspects those verified WebP bytes with the
Images `info()` binding before any object or variant write. The handler does
not overwrite a valid cached object or repeat its transform. Missing or
invalid output info remains retryable.

The PG17 regression seeds a real EXIF JPEG's normalized 2×3 WebP bytes with
legacy v1 metadata claiming 3×2, forces SQL loss after the cache read, and
redelivers the queued job. Both attempts re-inspect the existing derivative;
the persisted variant is 2×3, no transform repeats, and the original legacy
R2 metadata remains unchanged. Workerd cases also cover an output-info
exception and missing, zero, fractional, NaN, and over-limit dimensions; each
retries without persisting or exposing a derivative.

## Exact-file ownership gate

The candidate changes `apps/lythaus-jobs/src/index.ts` from the base blob
`7b25af78fc1e227b85d1758b0cb31fd0aec09d24` to
`da112b2d2c869251ed48941d31d4ac854bb93fa1`. The checked-in
`apps/marketing-site/tests/homepage-protection.test.mjs` pins that file to the
main blob for another allocated lane. The guard remains unchanged. Running
`node --test --test-name-pattern='image-integrity rejection survives a fresh squashed checkout' apps/marketing-site/tests/homepage-protection.test.mjs`
fails because the nested exact-source assertion sees the new Jobs blob instead
of the pinned blob, with `Jobs diagnostic bytes must match the exact allocated
review revision`. No ownership guard was bypassed or edited. The Jobs delta is
published on draft PR #1044 for independent review. Exact-head CI and the
remaining allocation gate are recorded in the PR.

## Storage boundary

The new physical-byte test uploads a real 6 MiB body into local R2 and proves
that the existing per-owner 10 MiB fixture reservation rejects a second
reservation. The PG17 race test also proves simultaneous first reservations
cannot exceed that per-owner quota. This is evidence for the existing
per-owner ledger path only. It is not a global physical bucket cap or a bound
on the peak while quarantine source and derivative coexist.

A global cap remains unimplemented because the repository supplies no approved
global capacity value, shared reservation authority, or role/schema design for
accounting physical R2 bytes across owners and transient objects. Defining
those would be a quota and privilege contract decision. No such value or
persistent privilege change is inferred in this branch. Hosted R2 capacity and
aggregate-storage acceptance remain open.

## Display and release boundaries

The Public API exposes the upload-session route only. No private media reader,
post attachment relation, or public display route exists in this path. The
processor does not emit a public URL, change the review state, or publish into
feed/content. Display acceptance therefore remains blocked on an approved
attachment/read contract; this branch does not fabricate a publishing path.

Canonical runtime `UPDATE media.storage_ledger.bytes_rejected` and Jobs
`INSERT media.ownership` remain denied. The PG17 suite asserts those denials
and retries on the Jobs ownership failure. The two narrow candidate column
grants are exercised only in the disposable local PG17 acceptance database;
the test revokes them before teardown. No canonical or hosted role was changed.
Migration 0021 remains outside this branch. Production upload/processing flags
remain false.

## Local evidence

Validated on PostgreSQL 17.11 and local Workerd/Miniflare R2:

- `node --experimental-strip-types --test --test-concurrency=1 packages/media/tests/standard-upload.test.mjs packages/media/tests/standard-upload.workerd.mjs` — 31/31 passed, including output-info failure and invalid-dimension cases.
- `PLANETSCALE_PG17_TEST_DATABASE_URL=<loopback disposable PG17 control database> node --experimental-strip-types --test --test-concurrency=1 packages/media/tests/standard-upload.postgres.mjs` — 26/26 passed. Includes the legacy v1 cached derivative across SQL loss/retry, canonical role denials, temporary candidate grants in the disposable database, concurrent reservations, lock contention, retry reuse, and cleanup retry.
- `npm run typecheck:native` — passed.
- `XDG_CONFIG_HOME=/tmp/lythaus-media-wrangler-config npm_config_cache=/workspace/.lythaus-cache/npm npm run validate:native-workers` — validated four Worker configs and three generated Worker type files.
- `git diff --check` — passed.

These local checks do not establish live production role binding or hosted
Cloudflare R2/Images/Queue acceptance. Exact-head CI is tracked on draft PR
#1044. No deployment, merge, public posting, live privilege change, or
detector qualification is claimed.
