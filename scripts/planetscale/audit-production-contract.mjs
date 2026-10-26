import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { APPLICATION_SCHEMAS, canonicalReleaseSchemaContract, REQUIRED_RELEASE_SCHEMA_VERSION, runtimeSchemaFingerprint } from '../ci/product-integrity-schema-contract.mjs';

const { Client } = pg;
const databaseUrl = process.env.PLANETSCALE_SCHEMA_READ_DATABASE_URL ?? '';
const outputPath = process.env.PLANETSCALE_CONTRACT_AUDIT_OUTPUT ?? '.artifacts/provider-inventory/planetscale-production-contract.json';
const releaseVersionNumber = REQUIRED_RELEASE_SCHEMA_VERSION.slice(0, 4);
const releaseLabel = 'post-' + releaseVersionNumber;
const releaseRequirementKey = 'post' + releaseVersionNumber + 'Required';

if (!databaseUrl) throw new Error('PLANETSCALE_SCHEMA_READ_DATABASE_URL is required');
const connection = new URL(databaseUrl);
if (connection.searchParams.get('sslmode') !== 'verify-full') throw new Error('PlanetScale contract audit requires sslmode=verify-full');
if (connection.searchParams.get('sslrootcert') === 'system') connection.searchParams.delete('sslrootcert');

const canonical = canonicalReleaseSchemaContract({ committedOnly: process.env.CI === 'true' });
const fingerprintText = (process.env.EXPECTED_DATABASE_SCHEMA_FINGERPRINT ?? '').trim();
const relationCountText = (process.env.EXPECTED_DATABASE_RELATION_COUNT ?? '').trim();
const configuredFingerprint = fingerprintText || canonical.fingerprint;
const configuredRelationCount = relationCountText ? Number(relationCountText) : canonical.relationCount;
const configuredMatchesRequired = configuredFingerprint === canonical.fingerprint
  && Number.isInteger(configuredRelationCount) && configuredRelationCount === canonical.relationCount;
const verifier = spawnSync(process.execPath, ['scripts/ci/verify-planetscale-production-schema.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PLANETSCALE_SCHEMA_READ_DATABASE_URL: connection.toString(),
    PSCALE_BRANCH_NAME: 'main',
    REQUIRE_PRODUCT_INTEGRITY_MIGRATION: 'true',
  },
  encoding: 'utf8',
});
const report = {
  schemaVersion: 4,
  capturedAt: new Date().toISOString(),
  branch: 'main',
  evidenceClass: 'BASELINE_ONLY_NOT_RELEASE_EVIDENCE',
  baselineStatus: 'UNKNOWN/BLOCKED',
  transactionReadOnly: false,
  verifierPassed: false,
  [releaseRequirementKey]: false,
  releaseIdentity: {
    configured: {
      fingerprint: /^[a-f0-9]{64}$/.test(configuredFingerprint) ? configuredFingerprint : null,
      relationCount: Number.isInteger(configuredRelationCount) ? configuredRelationCount : null,
    },
    required: {
      schemaVersion: REQUIRED_RELEASE_SCHEMA_VERSION,
      fingerprint: canonical.fingerprint,
      relationCount: canonical.relationCount,
    },
    configuredMatchesRequired,
  },
  verifierDiagnostic: {
    exitCode: Number.isInteger(verifier.status) ? verifier.status : null,
    reason: !configuredMatchesRequired ? 'configured_release_identity_mismatch'
      : verifier.status !== 0 ? 'production_schema_verifier_failed' : null,
  },
  verifierOutput: [],
};

let client;
let connected = false;
let transactionStarted = false;
let phase = 'connect';
try {
  client = new Client({ connectionString: connection.toString(), ssl: { rejectUnauthorized: true } });
  await client.connect();
  connected = true;
  phase = 'begin_read_only';
  await client.query('BEGIN READ ONLY');
  transactionStarted = true;
  const readOnlyResult = await client.query('SHOW transaction_read_only');
  if (readOnlyResult.rows[0]?.transaction_read_only !== 'on') {
    throw Object.assign(new Error('audit_read_only_transaction_required'), { code: 'AUDIT_TRANSACTION_NOT_READ_ONLY' });
  }
  report.transactionReadOnly = true;
  phase = 'catalog';
  const versionResult = await client.query('SHOW server_version');
  const extensionsResult = await client.query('SELECT extname, extversion FROM pg_extension ORDER BY extname');
  const migrationsResult = await client.query('SELECT version, checksum FROM system.schema_migrations ORDER BY version');
  if (!Array.isArray(migrationsResult.rows)) {
    throw Object.assign(new Error('audit_registry_rows_invalid'), { code: 'AUDIT_REGISTRY_ROWS_INVALID' });
  }
  const relationsResult = await client.query('SELECT table_type, table_schema, table_name FROM information_schema.tables WHERE table_schema = ANY($1::text[]) ORDER BY table_type, table_schema, table_name', [APPLICATION_SCHEMAS]);
  const grantsResult = await client.query('SELECT privilege_type, COUNT(*)::int AS grant_count FROM information_schema.role_table_grants WHERE table_schema NOT IN (\'pg_catalog\', \'information_schema\') GROUP BY privilege_type ORDER BY privilege_type');
  const roleCountResult = await client.query('SELECT COUNT(DISTINCT grantee)::int AS role_count FROM information_schema.role_table_grants WHERE table_schema NOT IN (\'pg_catalog\', \'information_schema\')');
  phase = 'rollback';
  await client.query('ROLLBACK');
  transactionStarted = false;

  const valueKind = (value, present = true) => !present ? 'MISSING'
    : value === null ? 'NULL' : Array.isArray(value) ? 'ARRAY' : typeof value === 'object' ? 'OBJECT' : typeof value === 'string' ? 'STRING'
      : typeof value === 'number' ? 'NUMBER' : typeof value === 'boolean' ? 'BOOLEAN' : 'OTHER';
  const approvedByVersion = new Map(canonical.migrations.map(entry => [entry.version, entry]));
  const entryDiagnostics = migrationsResult.rows.map((entry, index) => {
    const record = entry !== null && typeof entry === 'object' && !Array.isArray(entry);
    const versionPresent = record && Object.hasOwn(entry, 'version');
    const checksumPresent = record && Object.hasOwn(entry, 'checksum');
    const approved = versionPresent && typeof entry.version === 'string' ? approvedByVersion.get(entry.version) : null;
    return {
      index,
      rowKind: valueKind(entry),
      versionKind: valueKind(versionPresent ? entry.version : undefined, versionPresent),
      checksumKind: valueKind(checksumPresent ? entry.checksum : undefined, checksumPresent),
      versionRecognized: Boolean(approved),
      checksumMatchesApproved: Boolean(approved && checksumPresent && entry.checksum === approved.checksum),
    };
  });
  const safeMigrations = migrationsResult.rows.map((entry, index) => ({
    version: entryDiagnostics[index].versionRecognized ? approvedByVersion.get(entry.version).version : null,
    checksum: entryDiagnostics[index].checksumMatchesApproved ? approvedByVersion.get(entry.version).checksum : null,
  }));
  const invalidEntryCount = entryDiagnostics.filter(entry => !entry.checksumMatchesApproved).length;
  const reportedRowCount = Number.isInteger(migrationsResult.rowCount) && migrationsResult.rowCount >= 0 ? migrationsResult.rowCount : null;
  const rowsComplete = reportedRowCount === safeMigrations.length;
  const allEntriesApproved = invalidEntryCount === 0;
  const matchesRequiredReleaseRegistry = rowsComplete && allEntriesApproved && safeMigrations.length === canonical.migrations.length
    && safeMigrations.every((entry, index) => entry.version === canonical.migrations[index].version && entry.checksum === canonical.migrations[index].checksum);
  const migrationsPayload = safeMigrations.map(({ version, checksum }) => version + ':' + checksum).join('\n');
  report.postgresVersion = versionResult.rows[0]?.server_version ?? null;
  report.extensions = extensionsResult.rows;
  report.migrationLedger = {
    count: safeMigrations.length,
    reportedRowCount,
    reportedRowCountKind: valueKind(migrationsResult.rowCount, Object.hasOwn(migrationsResult, 'rowCount')),
    rowsComplete,
    expectedReleaseCount: canonical.migrations.length,
    first: safeMigrations[0]?.version ?? null,
    last: safeMigrations.at(-1)?.version ?? null,
    entries: safeMigrations,
    invalidEntryCount,
    allEntriesApproved,
    matchesRequiredReleaseRegistry,
    entryDiagnostics,
    ledgerSha256: rowsComplete && allEntriesApproved ? createHash('sha256').update(migrationsPayload).digest('hex') : null,
  };
  const fingerprint = rowsComplete && allEntriesApproved ? runtimeSchemaFingerprint(relationsResult.rows, safeMigrations) : null;
  report.observedSchema = {
    fingerprint,
    relationCount: relationsResult.rows.length,
    matchesRequiredIdentity: matchesRequiredReleaseRegistry && fingerprint === canonical.fingerprint && relationsResult.rows.length === canonical.relationCount,
    note: 'Baseline relation and registry identity only; full catalog, extensions and effective privileges require the release verifier.',
  };
  report.visibleGrantMetadata = {
    distinctGrantees: roleCountResult.rows[0]?.role_count ?? 0,
    byPrivilege: grantsResult.rows.map(({ privilege_type, grant_count }) => ({ privilege: privilege_type, count: grant_count })),
    note: 'Visible grant counts are not effective least-privilege acceptance.',
  };
  report.baselineStatus = rowsComplete && allEntriesApproved ? 'CAPTURED' : 'CAPTURED_WITH_INVALID_REGISTRY';
} catch (error) {
  report.baselineFailure = {
    phase,
    code: typeof error?.code === 'string' && /^[A-Z0-9_]{3,40}$/.test(error.code) ? error.code : 'UNCLASSIFIED',
  };
  if (connected && transactionStarted) await client.query('ROLLBACK').catch(() => undefined);
} finally {
  if (client) await client.end().catch(() => undefined);
}

report.verifierPassed = verifier.status === 0 && configuredMatchesRequired && report.baselineStatus === 'CAPTURED'
  && report.migrationLedger.matchesRequiredReleaseRegistry && report.observedSchema.matchesRequiredIdentity;
report[releaseRequirementKey] = report.verifierPassed;
if (report.verifierPassed) {
  report.evidenceClass = 'RELEASE_CONTRACT';
  report.verifierOutput = String(verifier.stdout ?? '')
    .split(/\r?\n/)
    .filter((line) => line.startsWith('Observed ' + releaseLabel + ' schema fingerprint:')
      || line.startsWith('Observed ' + releaseLabel + ' relation count:')
      || line.startsWith('Observed ' + releaseLabel + ' catalog SHA-256:')
      || line.startsWith('Approved migration-set SHA-256:')
      || line.startsWith('Verified read-only PlanetScale migration registry'));
}
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log('Wrote sanitized PlanetScale production contract audit to ' + outputPath + '.');
if (!report.verifierPassed) {
  console.error('PlanetScale production contract remains UNKNOWN/BLOCKED; baseline evidence does not certify release readiness.');
  process.exitCode = 1;
}
