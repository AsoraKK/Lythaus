# Post image attachment preparation

Status: disabled preparation only, rebased onto main at
`a8133eeb677e1934f2888b139d491133135888e0`. This work adds no active migration,
grant, API route, queue consumer, feed projection, flag change, provider resource,
or public posting behavior. Public posting remains held until the complete
pipeline is validated and separately released.

## What this adds

`database/planetscale/proposals/post_media_attachments.sql.proposal` sketches an
additive post-to-media link outside the migration manifest. It uses opaque UUID
references, composite owner foreign keys, source upload-session provenance,
duplicate/order constraints, and a media-state version that changes when the
linked object's identity, bytes, state, or deletion marker changes. The insert
guard locks and rechecks the media object and upload session before recording
the expected version. It does not add a public detector authorization relation,
role grants, or feed visibility. It is an INSERT guard only: the proposal has
no UPDATE guard and does not establish effective INSERT-only permissions or
relation immutability. That insert check alone does not make later updates safe.
Before any integration, either enforce immutable attachment rows for the
runtime role (with a separately designed delete/tombstone path), or add and test
UPDATE guards that recheck ownership, source, state version, and evidence
bindings. Every row is constrained to `publication_eligible = false`. The
proposal must not be applied as-is or used to infer that an attachment is
publishable.

`packages/db/src/post-attachment-preparation.ts` is a pure typed preparation
contract. It accepts only UUID media references, compares both media and upload
owners to the authenticated owner supplied by a future caller, rejects missing,
duplicate, rejected, pending, unknown, private-purpose, stale, or unverified
media, and requires separate bound safety and image-authenticity evidence. A
user's `human` declaration remains a user claim; it does not satisfy either
detector check. Safety-only, generic evaluation, and private alpha/beta results
cannot substitute for public image-authenticity evidence. The module is not
exported from the package entrypoint and has no active caller. Its hard release
constant keeps both relation writes and publication eligibility false even
when synthetic test inputs satisfy the prospective shape.

The checker also requires source and stored-byte format-inspection evidence
bound to each corresponding SHA-256 and current media-state version. Declared
MIME metadata must be canonical, match the inspected format, and appear in the
explicit capability allowlist. Safety and image-authenticity evidence bind to
the exact stored-object digest and version. The checker validates these
synthetic evidence shapes; it does not inspect bytes or establish who produced
the evidence.

The parser's 32-reference limit is an engineering request-size bound only. It
does not set the product's attachment entitlement. The proposal's ordinal range
uses the same hard engineering bound. `UNRESOLVED_POST_ATTACHMENT_CAPABILITIES`
leaves attachment count, source/stored formats and byte limits, pixel limit,
human-image declaration version, alt-text policy, original retention, and
attachment tombstone policy unset. Those inputs must be resolved before any
activation; the synthetic values used in unit tests are not product policy.

The PostgreSQL fixtures use only synthetic rows and apply the proposal in a
fresh disposable PG17 database created by the publication test runner. They do
not contain image samples and make no detector-accuracy claim.

## Disabled server-owned byte boundary (13 October)

`packages/db/src/post-attachment-byte-boundary.ts` adds an uncalled factory
whose server-held dependencies are a database client, two private R2 buckets,
the existing Images binding, and explicit format/bounds configuration. Its
request accepts one opaque media ID only: caller-provided owner, object key,
format verdict, detector pass, or evidence fields are rejected. The separate
owner argument must come from the authenticated server principal. These
dependencies and configuration must never be deserialized from a client body.
The earlier pure preparation checker still accepts structural values and must
not become runtime authority for caller-created snapshots.

The fixed lookup selects the media object and source upload session with both
owners scoped to that principal. A defensive owner/purpose/state check follows.
It requires the source-session linkage and state-version fields in the unapplied
proposal; their absence returns `attachment_metadata_schema_unavailable`.
Neither this factory nor its tests apply that proposal to a hosted database.
The current Jobs flow deletes source quarantine bytes after processing, so
unavailable originals return `private_bytes_unavailable`; this work does not
change retention or recreate originals.

Object keys come only from the authoritative rows. Reads use private-bucket
HEAD metadata, conditional ETags, configured byte bounds, exact byte counts,
and recomputed source/stored SHA-256 values. Records and storage versions are
reloaded after inspection. This is optimistic read revalidation, not a lock
covering a later attachment write or publication transition; the transaction
requirements below still apply.

The factory reuses the generic `media-intake.ts` signature detection and bounded
stream reader plus `forensics.ts` header inspection and digest helper. The
existing JPEG header parser's swapped width/height is corrected and covered by
a non-square real-byte fixture. Complete PNG chunk/CRC, JPEG ending, WebP RIFF,
and bounded AVIF box checks precede the Images binding's metadata read and full
RGBA decode. Decode output is counted and discarded under the existing caller
decoded-byte limit. Decoder errors, incomplete pixels, unknown container variants,
and recognized animations remain blocked or unavailable. No claim about
authorship, authenticity, safety, orientation, or EXIF/GPS removal follows from
these format checks.

There are no attachment format defaults. Explicit allowed formats must be a
subset of the existing standard upload configuration, and configured byte/pixel
bounds cannot exceed its engineering caps. That existing list is not public
attachment policy approval. Missing configuration or decoder returns
unavailable before any lookup or storage read. All success results are immutable
`inspected` snapshots with no locators, null modality/privacy evidence,
`runtimeAuthority = false`, and false relation/publication eligibility. Feeding
such a snapshot to the preparation checker remains blocked. The new module is
not exported from the package entrypoint or imported by a runtime entrypoint.

The isolated suite generates synthetic PNG/JPEG/WebP/AVIF bytes locally and uses
a Sharp-backed fake Images binding, fake database, and in-memory private buckets.
The production module does not import Sharp. This verifies local byte handling,
not the hosted Images decoder's behavior, service budgets, or a public release.
Real-byte tests and an added disposable PG17 owner-lookup test supplement the
existing attachment ownership, idempotency, and state-race cases. After the
explicit clarification permitting disposable local fixture DDL/grants, canonical
baseline/role validation and all six attachment PG17 tests passed on PostgreSQL
17.11 in a fresh loopback-only container; the container was removed afterward.
Its database suffix fits PostgreSQL's identifier limit and the fixture checks
actual database identity before any proposal application. No hosted schema or
permissions were changed, and this does not certify the hosted Images decoder.
No detector is invoked and no fixture certifies detector accuracy.

The uncalled factory has a shared asynchronous operation deadline: the server
may configure `inspectionTimeoutMs` from 1 through 30,000 (default 30,000) and
`cleanupTimeoutMs` from 1 through 1,000 (default 250). These follow the existing
provider-wait and database-cleanup timer conventions, not attachment policy.
Lookups, storage waits, Images info/output, hashes, and stream reads share one
deadline. Timeout errors supplied input streams, cancels/releases owned readers,
and bounds cleanup even when a cancellation hook hangs. Late returned bodies
are canceled and late promise rejections are handled. APIs without supported
abort operations may continue internally: caller deadlines do not preempt
synchronous parsing or bound hosted decoder memory, CPU, billing, or cost.
They cannot forcibly release readers owned by another consumer. Hosted abort
behavior and service resource/cost limits remain separate acceptance gates;
mock-clock stalled-operation tests establish only the caller-side cleanup.

## Existing lifecycle and storage follow-up

- The standard finalizer checks byte count and SHA-256 from the server-side
  session row. On size/hash mismatch it marks the session rejected and releases
  the reservation, but does not delete the quarantine object. It also does not
  select `expires_at` when loading a session. Add a separately reviewed,
  bounded cleanup design and fake-R2 tests before enabling uploads; cleanup must
  recheck a locked, terminal session and delete only the exact stored object
  key after the state transition commits. Do not infer client keys or delete by
  broad prefix.
- Standard abandoned sessions have no bounded cleanup path in the inspected
  upload/finalization flow. The queue worker deletes quarantine bytes on its
  terminal processing paths, but this is not a general expired-session sweeper.
  Future cleanup needs a batch bound, deterministic claim, status/version fence,
  retry behavior, and a race test against finalization and processing.
- The Jobs transform requests WebP output but does not explicitly request or
  assert orientation normalization or GPS/EXIF removal. Before image activation,
  use synthetic metadata-bearing fixtures to assert normalized output pixels,
  absent GPS/EXIF metadata, and fail-closed handling. Keep original uploads in
  private quarantine; this preparation creates no public URLs or storage keys.
- Account deletion checks active legal holds before redacting posts and purging
  media. Its privacy locator currently enumerates posts, media objects, and
  upload sessions but not a post/media association. A real relation needs an
  owner/hold-aware locator and deletion/export reconciliation path. Retention,
  original disposal, and relation tombstone duration are unresolved, so this
  proposal adds no cascade, cleanup, retention job, or hold rule.

## Integration gates

The current public create-post input and feed projection remain unchanged. A
later integration must be coordinated with the active composer/feed lane after
`#1005`. Before then, keep `MEDIA_UPLOADS_ENABLED` and
`MEDIA_PROCESSING_ENABLED` false. An approved upload session describes private
integrity/processing progress only; the inspected Jobs path leaves the media
object in review and stores generic evaluation metadata, so neither state may
admit a public post. The private authenticity alpha/beta workflows remain
purpose- and consent-bound.

The future API should accept opaque media IDs and the user's declaration only.
A trusted server-side loader must retrieve authoritative media, upload-session,
byte-format-inspection, and detector-evidence records for the authenticated
owner; the client must not provide MIME validation results, evidence, hashes,
state, or policy values. The byte-format inspector must read the exact source
and stored bytes and bind each result to its digest and media-state revision;
declared MIME strings alone are not evidence. The pure checker in this branch
does not establish that trust boundary or inspect bytes. Missing, failed, stale,
or unbound evidence must block.

Attachment creation must revalidate the loaded owner, purpose, state version,
source identity, bytes, and evidence bindings under transaction locks in the
same transaction that records the relation. Any later publication transition
must perform its own current-state and eligibility check in its transaction.
`revalidatePostAttachmentSnapshot` is a pure comparison helper; calling it does
not by itself provide transactional consistency or authorize a write.

The proposal's `BEFORE INSERT` guard does not cover UPDATE or DELETE. A future
integration must enforce relation immutability with effective runtime-role
permissions and a separately specified deletion/tombstone flow, or implement
equivalent UPDATE guards and race tests. Do not claim the INSERT guard alone
makes row updates safe.

The future validated path must bind separate safety and authenticity results
to current media bytes/state, and validate derivatives for explicit orientation
normalization plus GPS/EXIF removal. Keep originals private and define their
retention and relation tombstone policy before activation. UI, Create Post/API,
and feed projection integration remain separate gates owned by the composer
and feed lane after `#1005`; this preparation wires none of them. Preserve
human-image-only policy, block AI-assisted/generated public images, and defer
video. No fixture or this structural contract certifies detector accuracy or
permits activation.
