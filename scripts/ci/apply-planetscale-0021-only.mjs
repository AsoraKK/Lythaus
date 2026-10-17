import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadApprovedMigrations } from './planetscale-migration-manifest.mjs';
import { exactRegistryPrefix } from './planetscale-migration-reconciliation.mjs';
import { assess0021RegistryState, MIGRATION_0020, MIGRATION_0021, RETRYABLE_0021_STATES } from './planetscale-0021-only-contract.mjs';
import { applyMediaQuarantineMigration, inspectMediaQuarantineMigration, verifyMediaQuarantineMigration } from './planetscale-media-quarantine-migration.mjs';

const { Client } = pg;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = process.env.PLANETSCALE_0021_EXECUTION_REPORT_FILE ?? '';
const report = {
  mode: 'scoped-0021-execution',
  targetBranch: 'main',
  migration: MIGRATION_0021,
  broadMigrationWorkflowChanged: false,
  grantsReconciled: false,
  ephemeralRoleCreated: false,
  status: 'blocked',
};

function writeReport() {
  const body = `${JSON.stringify(report, null, 2)}\n`;
  if (reportPath) {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, body, { mode: 0o600 });
  }
  console.log(body.trimEnd());
}

function assertExecutionGate() {
  if (process.env.PLANETSCALE_0021_EXECUTION_APPROVED !== 'approved') throw new Error('execution_gate_not_approved');
  if (process.env.PSCALE_BRANCH_NAME !== 'main') throw new Error('target_branch_not_main');
  if (process.env.PLANETSCALE_0021_PLAN_READY !== 'ready') throw new Error('read_only_plan_not_ready');
  if (!process.env.COMPATIBLE_WORKER_RELEASE_SHA || !/^[0-9a-f]{40}$/.test(process.env.COMPATIBLE_WORKER_RELEASE_SHA)) throw new Error('compatible_worker_release_sha_missing_or_invalid');
  if (!/^https:\/\/github\.com\/AsoraKK\/Lythaus\/actions\/runs\/[0-9]+$/.test(process.env.COMPATIBLE_WORKER_DEPLOYMENT_RUN_URL ?? '')) throw new Error('compatible_worker_deployment_run_url_missing_or_invalid');
}

function adminConnection(raw) {
  if (!raw) throw new Error('PLANETSCALE_ADMIN_DATABASE_URL_missing');
  const url = new URL(raw);
  if (url.searchParams.get('sslmode') !== 'verify-full') throw new Error('admin_database_url_requires_sslmode_verify_full');
  if (url.searchParams.get('sslrootcert') === 'system') url.searchParams.delete('sslrootcert');
  return { connectionString: url.toString(), ssl: { rejectUnauthorized: true } };
}

async function readRegistry(client) {
  const exists = await client.query("SELECT to_regclass('system.schema_migrations') AS registry");
  if (!exists.rows[0]?.registry) throw new Error('migration_registry_missing');
  return (await client.query('SELECT version, checksum FROM system.schema_migrations ORDER BY version')).rows;
}

function safeFailureCode(error) {
  const message = error instanceof Error ? error.message : '';
  const controlled = new Set([
    'execution_gate_not_approved', 'target_branch_not_main', 'read_only_plan_not_ready',
    'compatible_worker_release_sha_missing_or_invalid', 'compatible_worker_deployment_run_url_missing_or_invalid',
    'PLANETSCALE_ADMIN_DATABASE_URL_missing', 'admin_database_url_requires_sslmode_verify_full',
    'database_connection_is_read_only', 'migration_registry_missing',
    '0021_registry_prefix_changed_before_lock_acquisition', '0021_registry_prefix_changed_under_lock',
    '0021_staged_schema_not_safe_to_apply_under_lock', '0021_schema_fully_applied_without_registry_marker',
    '0021_registry_marker_insert_did_not_create_exact_prefix',
  ]);
  if (controlled.has(message)) return message;
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : '';
  return /^[A-Z0-9]{2,8}$/.test(code) ? `database_error_${code}` : 'migration_execution_failed';
}

async function execute() {
  assertExecutionGate();
  const manifest = loadApprovedMigrations({ root, committedOnly: process.env.CI === 'true' });
  const migration = manifest.migrations.find(({ name }) => name === MIGRATION_0021);
  if (!migration) throw new Error('canonical_0021_migration_missing');
  const client = new Client(adminConnection(process.env.PLANETSCALE_ADMIN_DATABASE_URL ?? ''));
  await client.connect();
  try {
    const readOnly = await client.query('SHOW transaction_read_only');
    if (readOnly.rows[0]?.transaction_read_only === 'on') throw new Error('database_connection_is_read_only');
    const initialRegistry = await readRegistry(client);
    const initialStage = await inspectMediaQuarantineMigration(client);
    const initialAssessment = assess0021RegistryState(initialRegistry, initialStage.state);
    if (!initialAssessment.ok) throw new Error(initialAssessment.blockers[0] ?? '0021_registry_prefix_changed_before_lock_acquisition');
    if (initialAssessment.state === 'COMPLETE') {
      report.status = 'already_applied_verified';
      report.registryHead = MIGRATION_0021;
      report.databaseWrites = false;
      await verifyMediaQuarantineMigration(client);
      return;
    }

    let alreadyAppliedUnderLock = false;
    let registryRecorded = false;
    await applyMediaQuarantineMigration(client, migration, {
      beforeApply: async () => {
        const lockedRegistry = await readRegistry(client);
        const lockedStage = await inspectMediaQuarantineMigration(client);
        if (exactRegistryPrefix(lockedRegistry, MIGRATION_0021)) {
          if (lockedStage.state !== 'FULLY_APPLIED') throw new Error('0021_registry_prefix_changed_under_lock');
          await verifyMediaQuarantineMigration(client);
          alreadyAppliedUnderLock = true;
          return false;
        }
        if (!exactRegistryPrefix(lockedRegistry, MIGRATION_0020)) throw new Error('0021_registry_prefix_changed_under_lock');
        if (!RETRYABLE_0021_STATES.includes(lockedStage.state)) {
          throw new Error(lockedStage.state === 'FULLY_APPLIED'
            ? '0021_schema_fully_applied_without_registry_marker'
            : '0021_staged_schema_not_safe_to_apply_under_lock');
        }
        return true;
      },
      afterVerified: async ({ applied }) => {
        if (!applied) return;
        await client.query('BEGIN');
        try {
          const beforeInsert = await readRegistry(client);
          if (!exactRegistryPrefix(beforeInsert, MIGRATION_0020)) throw new Error('0021_registry_prefix_changed_under_lock');
          await client.query('INSERT INTO system.schema_migrations (version, checksum) VALUES ($1, $2)', [migration.name, migration.checksum]);
          const afterInsert = await readRegistry(client);
          if (!exactRegistryPrefix(afterInsert, MIGRATION_0021)) throw new Error('0021_registry_marker_insert_did_not_create_exact_prefix');
          await client.query('COMMIT');
          registryRecorded = true;
        } catch (error) {
          await client.query('ROLLBACK').catch(() => undefined);
          throw error;
        }
      },
    });

    const finalRegistry = await readRegistry(client);
    if (!exactRegistryPrefix(finalRegistry, MIGRATION_0021)) throw new Error('0021_registry_marker_insert_did_not_create_exact_prefix');
    await verifyMediaQuarantineMigration(client);
    report.status = alreadyAppliedUnderLock ? 'already_applied_verified' : 'applied_and_verified';
    report.registryHead = MIGRATION_0021;
    report.databaseWrites = registryRecorded;
  } finally {
    await client.end();
  }
}

try {
  await execute();
  writeReport();
} catch (error) {
  report.status = 'failed_closed';
  report.failureCode = safeFailureCode(error);
  writeReport();
  process.exitCode = 1;
}
