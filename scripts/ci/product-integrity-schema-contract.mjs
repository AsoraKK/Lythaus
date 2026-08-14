import { createHash } from 'node:crypto';
import { expectedMigrationPrefix, loadApprovedMigrations } from './planetscale-migration-manifest.mjs';

export const APPLICATION_SCHEMAS = Object.freeze([
  'identity',
  'content',
  'social',
  'feed',
  'moderation',
  'privacy',
  'trust',
  'media',
  'editorial',
  'marketing',
  'system',
]);

const applicationSchemaSet = new Set(APPLICATION_SCHEMAS);

function compare(left, right) {
  return left.localeCompare(right);
}

function normalizedRelations(relations) {
  return [...relations]
    .map(({ table_type, table_schema, table_name }) => ({ table_type, table_schema, table_name }))
    .sort((left, right) => compare(
      `${left.table_type}:${left.table_schema}.${left.table_name}`,
      `${right.table_type}:${right.table_schema}.${right.table_name}`,
    ));
}

function normalizedMigrations(migrations) {
  return [...migrations]
    .map(({ version, checksum }) => ({ version, checksum }))
    .sort((left, right) => compare(left.version, right.version));
}

export function runtimeSchemaFingerprintInput(relations, migrations) {
  const relationLines = normalizedRelations(relations)
    .map((row) => `${row.table_type}:${row.table_schema}.${row.table_name}`);
  const migrationLines = normalizedMigrations(migrations)
    .map((row) => `${row.version}=${row.checksum}`);
  return `${relationLines.join('\n')}\n--migrations--\n${migrationLines.join('\n')}`;
}

export function runtimeSchemaFingerprint(relations, migrations) {
  return createHash('sha256').update(runtimeSchemaFingerprintInput(relations, migrations)).digest('hex');
}

function relationInventory(migrations) {
  const relations = new Map();
  const patterns = [
    ['BASE TABLE', /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\b/gi],
    ['VIEW', /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\b/gi],
  ];
  for (const migration of migrations) {
    const source = migration.contents.toString('utf8');
    for (const [tableType, pattern] of patterns) {
      pattern.lastIndex = 0;
      for (const match of source.matchAll(pattern)) {
        const tableSchema = match[1];
        const tableName = match[2];
        if (!applicationSchemaSet.has(tableSchema)) continue;
        relations.set(`${tableType}:${tableSchema}.${tableName}`, {
          table_type: tableType,
          table_schema: tableSchema,
          table_name: tableName,
        });
      }
    }
  }
  return normalizedRelations(relations.values());
}

export function canonicalPost0013SchemaContract({ root = process.cwd(), committedOnly = false } = {}) {
  const manifest = loadApprovedMigrations({ root, committedOnly });
  const relations = relationInventory(manifest.migrations);
  const migrations = expectedMigrationPrefix('0013_marketing_waitlist.sql')
    .map(({ name, appliedSha256 }) => ({ version: name, checksum: appliedSha256 }));
  return Object.freeze({
    fingerprint: runtimeSchemaFingerprint(relations, migrations),
    relationCount: relations.length,
    relations: Object.freeze(relations),
    migrations: Object.freeze(migrations),
  });
}

export function approvedPost0013Expectation(configuredFingerprint = '', configuredRelationCount = '') {
  const canonical = canonicalPost0013SchemaContract({ committedOnly: process.env.CI === 'true' });
  const fingerprint = configuredFingerprint.trim() || canonical.fingerprint;
  const relationCountText = String(configuredRelationCount ?? '').trim();
  const relationCount = relationCountText ? Number(relationCountText) : canonical.relationCount;
  if (!/^[0-9a-f]{64}$/.test(fingerprint) || fingerprint !== canonical.fingerprint) {
    throw new Error('post-0013 schema fingerprint does not match the canonical migration contract');
  }
  if (!Number.isInteger(relationCount) || relationCount !== canonical.relationCount) {
    throw new Error(`post-0013 relation count must match the canonical migration contract (${canonical.relationCount})`);
  }
  return { fingerprint, relationCount, canonical };
}
