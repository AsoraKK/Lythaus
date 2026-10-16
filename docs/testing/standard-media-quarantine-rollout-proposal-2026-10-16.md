# Standard-media quarantine cleanup rollout proposal

**Status:** held for database-owner and provider review. This document is a
rollout design only. It applies no migration or hosted schema change.

## Lock boundary

Migration `0021_media_quarantine_cleanup.sql` adds nullable
`media.upload_sessions.quarantine_deleted_at` and then creates a partial index
in the same file. The production migration applier starts a transaction before
executing the file and commits only after postcondition checks and manifest
recording. The `ALTER TABLE` lock therefore remains held through index creation
and the rest of the transaction. Keep migration `0021` on hold; do not run it
through the current applier.

## Staged design for review

1. Confirm the hosted schema baseline, provider DDL capabilities, and lock
   semantics with the database owner. Preserve the existing migration checksum
   and manifest history; prepare a newly reviewed staged plan rather than
   silently rewriting an applied migration.
2. Add the nullable marker column without a default in a short, separately
   committed DDL step. Confirm the lock has been released before continuing.
3. Build the partial cleanup index with the provider's supported online DDL
   mechanism. Where supported, use `CREATE INDEX CONCURRENTLY` outside a
   transaction. The current migration applier wraps every migration in a
   transaction, so this requires an explicitly reviewed staged migration path;
   do not issue the concurrent index through that applier.
4. Verify the column type/nullability, index definition and predicate, and
   successful/valid index state. Reconcile the resulting schema identity and
   manifest through a separately approved change before deploying Workers that
   read the marker.
5. If the provider cannot safely split the column and online index work, keep
   the migration held until an approved alternative is designed. Keep media
   flags disabled throughout the rollout.

## Failure handling

If an online index build fails or leaves an invalid index, stop the rollout and
have the database owner inspect and repair it through the provider-approved
path. Do not record the migration as complete, apply Worker readiness changes,
or remove the column as an automatic rollback. No hosted operation is authorized
by this proposal.
