# Standard image decoder and storage acceptance follow-up

Branch: `codex/media-acceptance-20261017`

Inspected base: `da6515d13f2d46950a8211008f89909f23b64a80`

This branch adds local decoder/EXIF and byte-reservation evidence. It does not
change the production Jobs handler, migration SQL, schema, privileges, Worker
feature flags, public attachment/display routes, branding, or shared
transaction wrappers. No hosted image service, bucket, database, or detector
was activated or written.

## Implementable local evidence

The Workerd and disposable PG17 suites send a real 3×2 JPEG through the
existing upload/finalize/queue handlers. The source EXIF contains orientation
6, a Make field, and a GPS IFD with coordinates. A root-pinned local
Sharp/libvips fixture decodes and rotates it into a 2×3 WebP; the derivative
contains no EXIF/XMP metadata. The test also exercises a 6 MiB body in local
R2 and races actual PG17 per-owner quota reservations. Existing failure,
transaction-loss, derivative-reuse, retry, and cleanup tests remain active.

These checks are local fixtures, not hosted Cloudflare Images/R2/Queue
acceptance. The per-owner test is not a global physical-bucket cap or a peak
bound while quarantine source and derivative coexist. The repository has no
approved global storage ceiling, shared reservation authority, or role/schema
design for accounting transient and cross-owner physical R2 bytes. Those
contracts are prerequisites to a global cap; no value or privilege change is
inferred here.

## Production acceptance blocker

The current Jobs handler still records source dimensions after WebP
normalization and does not explicitly disable animation. The EXIF integration
test shows the actual derivative is 2×3 while the persisted variant/object
metadata remains 3×2. This is a known acceptance gap, not a passing result.

The handler lives in `apps/lythaus-jobs/src/index.ts`. The checked-in
`homepage-protection` test pins that file to blob
`7b25af78fc1e227b85d1758b0cb31fd0aec09d24` for another allocated lane. Editing
the handler changed the blob and caused exact-head CI to fail its
`image-integrity rejection survives a fresh squashed checkout` ownership
guard. This branch restores the pinned blob and does not relax or update the
guard. The missing prerequisite is release of that exact-file ownership gate
before the media handler change can land.

The Public API exposes the upload-session route only. No private media reader,
post attachment relation, or public display route exists in this path. The
processor does not emit a public URL, change review state, or publish to
feed/content. Display acceptance remains blocked on an approved attachment and
read contract.

Canonical runtime `UPDATE media.storage_ledger.bytes_rejected` and Jobs
`INSERT media.ownership` remain denied. PG17 asserts those denials; candidate
column grants are exercised only in the disposable local acceptance database
and revoked before teardown. Pixel detection remains unavailable
(`not-executed`, review required). Metadata, MIME, dimensions, checksums, and
signatures are not image-pixel detection or authorship proof. Upload and
processing flags remain disabled.

## Local validation

- Standard upload unit + Workerd/local R2: 30/30 passed.
- Disposable PostgreSQL 17.11 acceptance suite: 25/25 passed.
- Marketing/homepage protection suite: 90/90 passed, including the exact Jobs source-blob allocation guard.
- `npm run typecheck:native` passed.
- Native Worker config validation passed (4 configs, 3 generated type files).
- `git diff --check` passed.

These are local checks, not hosted exact-head CI or release acceptance. No
deployment, merge, public posting, or detector qualification is claimed.
