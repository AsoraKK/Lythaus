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
and detector-evidence records for the authenticated owner; the client must not
provide evidence, hashes, state, or policy values. The pure checker in this
branch does not establish that trust boundary. Missing, failed, stale, or
unbound evidence must block.

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
