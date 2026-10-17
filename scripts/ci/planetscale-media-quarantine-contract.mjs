export const MEDIA_QUARANTINE_MIGRATION_NAME = '0021_media_quarantine_cleanup.sql';

export const MEDIA_QUARANTINE_INDEX_PREDICATE = "((purpose = 'standard'::text) AND (status = ANY (ARRAY['pending'::text, 'queued'::text, 'approved'::text, 'rejected'::text, 'expired'::text, 'cancelled'::text])) AND (quarantine_deleted_at IS NULL))";

export const MEDIA_QUARANTINE_INDEX_DEFINITION = `CREATE INDEX media_upload_quarantine_cleanup_idx ON media.upload_sessions USING btree (expires_at, id) WHERE ${MEDIA_QUARANTINE_INDEX_PREDICATE}`;

const canonicalColumnSql = `ALTER TABLE media.upload_sessions
  ADD COLUMN quarantine_deleted_at timestamptz;`;

const canonicalIndexSql = `CREATE INDEX media_upload_quarantine_cleanup_idx
  ON media.upload_sessions (expires_at, id)
  WHERE purpose = 'standard'
    AND status IN ('pending', 'queued', 'approved', 'rejected', 'expired', 'cancelled')
    AND quarantine_deleted_at IS NULL;`;

const canonicalMigration = `${canonicalColumnSql}

${canonicalIndexSql}
`;

export function splitMediaQuarantineMigration(contents = canonicalMigration) {
  const normalized = String(contents).replace(/\r\n/g, '\n');
  if (normalized !== canonicalMigration) {
    throw new Error('0021 migration bytes do not match the staged migration contract');
  }
  return {
    columnSql: canonicalColumnSql,
    concurrentIndexSql: canonicalIndexSql.replace('CREATE INDEX ', 'CREATE INDEX CONCURRENTLY '),
    indexPredicate: MEDIA_QUARANTINE_INDEX_PREDICATE,
    indexDefinition: MEDIA_QUARANTINE_INDEX_DEFINITION,
  };
}
