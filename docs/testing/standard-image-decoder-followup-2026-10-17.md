# Standard image decoder and storage acceptance follow-up

Branch: `codex/media-acceptance-20261017`

Inspected base: `da6515d13f2d46950a8211008f89909f23b64a80`
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

## Exact-file ownership gate

The candidate changes `apps/lythaus-jobs/src/index.ts` from the main blob
`7b25af78fc1e227b85d1758b0cb31fd0aec09d24` to
`c09e6ac96b366ef36ff63f153f58c8b5d025dd3a`. The checked-in
`apps/marketing-site/tests/homepage-protection.test.mjs` pins that file to the
main blob for another allocated lane. Running
`node --test --test-name-pattern='image-integrity rejection survives a fresh squashed checkout' apps/marketing-site/tests/homepage-protection.test.mjs`
fails with `Jobs diagnostic bytes must match the exact allocated review
revision`. This candidate keeps the guard unchanged and is not pushed. Its
source delta needs independent review before the parent can arrange a narrowly
scoped allocation update with provenance and the existing negative controls.

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

- `node --experimental-strip-types --test --test-concurrency=1 packages/media/tests/standard-upload.test.mjs packages/media/tests/standard-upload.workerd.mjs` — 31/31 passed.
- `PLANETSCALE_PG17_TEST_DATABASE_URL=<loopback disposable PG17 control database> node --experimental-strip-types --test --test-concurrency=1 packages/media/tests/standard-upload.postgres.mjs` — 25/25 passed. Includes canonical role denials, temporary candidate grants in the disposable database, concurrent reservations, lock contention, lost transaction recovery, retry reuse, and cleanup retry.
- `npm run typecheck:native` — passed.
- `XDG_CONFIG_HOME=/tmp/lythaus-media-wrangler-config npm_config_cache=/workspace/.lythaus-cache/npm npm run validate:native-workers` — validated four Worker configs and three generated Worker type files.
- `git diff --check` — passed.

These are local checks, not hosted exact-head CI or release acceptance. No
deployment, merge, public posting, or detector qualification is claimed.
