import { assertCompleteMigrationPostconditions, classifyMigrationState } from './planetscale-migration-reconciliation.mjs';
import { MEDIA_QUARANTINE_MIGRATION_NAME, splitMediaQuarantineMigration } from './planetscale-media-quarantine-contract.mjs';

const migrationLockKey = 'lythaus-schema-migrations';

const inspectSql = `/* migration-artifact:media_quarantine_staged_state */
WITH target AS (
  SELECT relation_entry.oid, relation_entry.relkind
    FROM pg_class relation_entry
    JOIN pg_namespace relation_namespace ON relation_namespace.oid = relation_entry.relnamespace
   WHERE relation_namespace.nspname = 'media'
     AND relation_entry.relname = 'upload_sessions'
), marker AS (
  SELECT attribute.attname, attribute.atttypid, attribute.attnotnull,
         attribute.attgenerated, attribute.attidentity, default_value.adbin
    FROM target
    JOIN pg_attribute attribute ON attribute.attrelid = target.oid
    LEFT JOIN pg_attrdef default_value ON default_value.adrelid = attribute.attrelid AND default_value.adnum = attribute.attnum
   WHERE attribute.attname = 'quarantine_deleted_at'
     AND attribute.attnum > 0
     AND NOT attribute.attisdropped
), named_object AS (
  SELECT relation_entry.oid, relation_entry.relkind
    FROM pg_class relation_entry
    JOIN pg_namespace relation_namespace ON relation_namespace.oid = relation_entry.relnamespace
   WHERE relation_namespace.nspname = 'media'
     AND relation_entry.relname = 'media_upload_quarantine_cleanup_idx'
), index_state AS (
  SELECT named_object.oid, named_object.relkind, index_entry.indrelid,
         index_entry.indisvalid, index_entry.indisready,
         index_entry.indisunique, index_entry.indisprimary, index_entry.indisexclusion,
         index_entry.indnatts, index_entry.indnkeyatts,
         access_method.amname,
         pg_get_indexdef(index_entry.indexrelid) AS definition,
         pg_get_expr(index_entry.indpred, index_entry.indrelid) AS predicate,
         EXISTS (
           SELECT 1 FROM pg_constraint constraint_entry
            WHERE constraint_entry.conindid = index_entry.indexrelid
         ) AS constraint_backed
    FROM named_object
    LEFT JOIN pg_index index_entry ON index_entry.indexrelid = named_object.oid
    LEFT JOIN pg_am access_method ON access_method.oid = (
      SELECT relation_entry.relam FROM pg_class relation_entry WHERE relation_entry.oid = named_object.oid
    )
)
SELECT target.oid IS NOT NULL AS table_exists,
       target.relkind = 'r' AS table_is_regular,
       marker.attname IS NOT NULL AS marker_exists,
       marker.attname IS NOT NULL AND marker.atttypid = 'timestamptz'::regtype AS marker_type_matches,
       marker.attname IS NOT NULL AND NOT marker.attnotnull AS marker_nullable,
       marker.attname IS NOT NULL AND marker.attgenerated = '' AND marker.attidentity = '' AND marker.adbin IS NULL AS marker_has_no_generation_or_default,
       named_object.oid IS NOT NULL AS index_object_exists,
       index_state.relkind = 'i' AS index_is_regular,
       index_state.indrelid = target.oid AS index_targets_table,
       index_state.amname = 'btree' AS index_uses_btree,
       index_state.indnatts = 2 AND index_state.indnkeyatts = 2 AS index_has_exact_key_count,
       NOT COALESCE(index_state.indisunique, true)
         AND NOT COALESCE(index_state.indisprimary, true)
         AND NOT COALESCE(index_state.indisexclusion, true) AS index_is_nonunique,
       index_state.definition = $1 AS index_definition_matches,
       index_state.predicate = $2 AS index_predicate_matches,
       NOT COALESCE(index_state.constraint_backed, true) AS index_is_not_constraint_backed,
       index_state.indisvalid AS index_is_valid,
       index_state.indisready AS index_is_ready,
       (
         COALESCE((SELECT role_entry.rolsuper FROM pg_roles role_entry WHERE role_entry.rolname = current_user), false)
         OR pg_has_role(current_user, 'pg_read_all_stats', 'USAGE')
       ) AS index_progress_visibility_complete,
       EXISTS (
         SELECT 1
           FROM pg_stat_progress_create_index progress
          WHERE progress.relid = target.oid
             OR progress.index_relid = named_object.oid
       ) AS index_build_is_active
  FROM (SELECT 1) seed
  LEFT JOIN target ON true
  LEFT JOIN marker ON true
  LEFT JOIN named_object ON true
  LEFT JOIN index_state ON index_state.oid = named_object.oid`;

function isExactColumn(state) {
  return state.marker_exists === true
    && state.marker_type_matches === true
    && state.marker_nullable === true
    && state.marker_has_no_generation_or_default === true;
}

function isExactIndexDefinition(state) {
  return state.index_object_exists === true
    && state.index_is_regular === true
    && state.index_targets_table === true
    && state.index_uses_btree === true
    && state.index_has_exact_key_count === true
    && state.index_is_nonunique === true
    && state.index_definition_matches === true
    && state.index_predicate_matches === true
    && state.index_is_not_constraint_backed === true;
}

export async function inspectMediaQuarantineMigration(client) {
  const { indexDefinition, indexPredicate } = splitMediaQuarantineMigration();
  const result = await client.query(inspectSql, [indexDefinition, indexPredicate]);
  const state = result.rows[0];
  if (!state || state.table_exists !== true || state.table_is_regular !== true) {
    return { state: 'DRIFT', reason: 'media.upload_sessions is missing or is not a regular table' };
  }

  if (state.index_object_exists !== true) {
    if (state.marker_exists !== true) return { state: 'NOT_APPLIED' };
    if (!isExactColumn(state)) return { state: 'DRIFT', reason: 'quarantine_deleted_at does not match the canonical nullable timestamptz column' };
    return { state: 'COLUMN_ONLY' };
  }

  if (!isExactColumn(state) || !isExactIndexDefinition(state)) {
    return { state: 'DRIFT', reason: 'the quarantine cleanup column or named index differs from its canonical definition' };
  }

  if (state.index_is_valid !== true || state.index_is_ready !== true) {
    if (state.index_build_is_active === true) return { state: 'INVALID_INDEX_ACTIVE', reason: 'an index build is still active' };
    if (state.index_progress_visibility_complete !== true) {
      return { state: 'INVALID_INDEX_REVIEW_REQUIRED', reason: 'the migration role cannot verify all active index builds' };
    }
    return { state: 'INVALID_INDEX_RETRYABLE' };
  }

  return { state: 'FULLY_APPLIED' };
}

export async function verifyMediaQuarantineMigration(client) {
  const state = await inspectMediaQuarantineMigration(client);
  if (state.state !== 'FULLY_APPLIED') throw new Error(`0021 exact staged postconditions failed: ${state.reason ?? state.state}`);
  const [postconditions] = await classifyMigrationState(client, [MEDIA_QUARANTINE_MIGRATION_NAME]);
  assertCompleteMigrationPostconditions(postconditions);
}

function assertRetryableState(state) {
  if (['NOT_APPLIED', 'COLUMN_ONLY', 'INVALID_INDEX_RETRYABLE', 'FULLY_APPLIED'].includes(state.state)) return;
  throw new Error(`0021 staged migration stopped: ${state.reason ?? state.state}`);
}

async function addColumnInBriefTransaction(client, columnSql) {
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SET LOCAL statement_timeout = '15min'");
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [migrationLockKey]);
    await client.query(columnSql);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

export async function applyMediaQuarantineMigration(client, migration, { afterVerified } = {}) {
  if (migration.name !== MEDIA_QUARANTINE_MIGRATION_NAME) throw new Error(`unexpected staged migration: ${migration.name}`);
  const { columnSql, concurrentIndexSql } = splitMediaQuarantineMigration(migration.contents.toString('utf8'));
  const lock = await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', [migrationLockKey]);
  if (lock.rows[0]?.locked !== true) throw new Error('another schema migration is active; retry the staged 0021 migration later');

  try {
    await client.query("SET lock_timeout = '10s'");
    await client.query("SET statement_timeout = '15min'");

    let state = await inspectMediaQuarantineMigration(client);
    assertRetryableState(state);
    if (state.state === 'NOT_APPLIED') {
      await addColumnInBriefTransaction(client, columnSql);
      state = await inspectMediaQuarantineMigration(client);
      if (state.state !== 'COLUMN_ONLY') throw new Error(`0021 column postcondition failed after commit: ${state.reason ?? state.state}`);
    }

    if (state.state === 'INVALID_INDEX_RETRYABLE') {
      await client.query('DROP INDEX CONCURRENTLY media.media_upload_quarantine_cleanup_idx');
      state = await inspectMediaQuarantineMigration(client);
      if (state.state !== 'COLUMN_ONLY') throw new Error(`0021 invalid-index cleanup did not leave the exact column-only state: ${state.reason ?? state.state}`);
    }

    if (state.state === 'COLUMN_ONLY') {
      await client.query(concurrentIndexSql);
      state = await inspectMediaQuarantineMigration(client);
    }

    if (state.state !== 'FULLY_APPLIED') throw new Error(`0021 exact staged postconditions failed: ${state.reason ?? state.state}`);
    await verifyMediaQuarantineMigration(client);
    if (afterVerified) await afterVerified();
  } finally {
    await client.query('RESET statement_timeout').catch(() => undefined);
    await client.query('RESET lock_timeout').catch(() => undefined);
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', [migrationLockKey]).catch(() => undefined);
  }
}
