import { APPROVED_MIGRATIONS } from './planetscale-migration-manifest.mjs';
import { exactRegistryPrefix } from './planetscale-migration-reconciliation.mjs';
import { MIGRATION_0020, MIGRATION_0021, RETRYABLE_0021_STATES } from './planetscale-0021-only-contract.mjs';

const canonical0021 = APPROVED_MIGRATIONS.find(({ name }) => name === MIGRATION_0021);

export function classifyLocked0021State(rows, stagedState) {
  const registry = Array.isArray(rows) ? rows : [];
  if (exactRegistryPrefix(registry, MIGRATION_0021)) {
    return stagedState === 'FULLY_APPLIED'
      ? { action: 'ALREADY_RECORDED' }
      : { action: 'BLOCK', reason: '0021_registry_requires_exact_postconditions' };
  }
  if (!exactRegistryPrefix(registry, MIGRATION_0020)) return { action: 'BLOCK', reason: '0021_registry_prefix_not_exact_through_0020' };
  if (stagedState === 'FULLY_APPLIED') return { action: 'RECOVER_MARKER' };
  if (RETRYABLE_0021_STATES.includes(stagedState)) return { action: 'APPLY_DDL' };
  return { action: 'BLOCK', reason: `0021_staged_state_not_retryable:${stagedState ?? 'unknown'}` };
}

async function readRegistry(client) {
  const exists = await client.query("SELECT to_regclass('system.schema_migrations') AS registry");
  if (!exists.rows[0]?.registry) return null;
  return (await client.query('SELECT version, checksum FROM system.schema_migrations ORDER BY version')).rows;
}

export async function recordCanonical0021RegistryMarker(client, migration, verifyPostconditions) {
  if (!canonical0021 || migration?.name !== canonical0021.name || migration?.checksum !== canonical0021.appliedSha256) {
    throw new Error('0021_marker_migration_not_canonical');
  }
  if (typeof verifyPostconditions !== 'function') throw new Error('0021_marker_verifier_missing');
  await verifyPostconditions();
  await client.query('BEGIN');
  try {
    const beforeInsert = await readRegistry(client);
    if (!beforeInsert || !exactRegistryPrefix(beforeInsert, MIGRATION_0020)) throw new Error('0021_registry_prefix_changed_under_lock');
    await verifyPostconditions();
    await client.query('INSERT INTO system.schema_migrations (version, checksum) VALUES ($1, $2)', [canonical0021.name, canonical0021.appliedSha256]);
    const afterInsert = await readRegistry(client);
    if (!afterInsert || !exactRegistryPrefix(afterInsert, MIGRATION_0021)) throw new Error('0021_registry_marker_insert_did_not_create_exact_prefix');
    await client.query('COMMIT');
    return { recorded: true };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}
