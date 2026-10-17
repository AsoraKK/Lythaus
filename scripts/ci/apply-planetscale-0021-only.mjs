import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadApprovedMigrations } from './planetscale-migration-manifest.mjs';
import { exactRegistryPrefix } from './planetscale-migration-reconciliation.mjs';
import { assess0021RegistryState, is0021PlanReadyOutput, MIGRATION_0020, MIGRATION_0021 } from './planetscale-0021-only-contract.mjs';
import { adminDatabaseConnectionConfig, assertConnectedAdminDatabaseTarget } from './planetscale-0021-target-identity.mjs';
import { classifyLocked0021State, recordCanonical0021RegistryMarker } from './planetscale-0021-registry-marker.mjs';
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
  if (!is0021PlanReadyOutput(process.env.PLANETSCALE_0021_PLAN_READY)) throw new Error('read_only_plan_not_ready');
  let plannedTarget;
  try { plannedTarget = JSON.parse(process.env.PLANETSCALE_0021_PLAN_TARGET_IDENTITY ?? ''); } catch { plannedTarget = null; }
  if (plannedTarget?.provider?.organization !== 'lythaus'
    || plannedTarget.provider.database !== 'lythaus-core'
    || plannedTarget.provider.branchName !== 'main'
    || !/^[a-z0-9]+$/.test(plannedTarget.provider.branchId ?? '')
    || typeof plannedTarget.sql?.databaseName !== 'string'
    || plannedTarget.sql.databaseName.trim() === ''
    || !/^[a-f0-9]{64}$/.test(plannedTarget.sql.originFingerprint ?? '')
    || !/^[a-f0-9]{64}$/.test(plannedTarget.sha256 ?? '')) {
    throw new Error('plan_target_identity_missing_or_invalid');
  }
  return plannedTarget;
}

function adminConnection(raw) {
  return adminDatabaseConnectionConfig(raw);
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
    'PLANETSCALE_ADMIN_DATABASE_URL_missing', 'admin_database_url_requires_sslmode_verify_full',
    'database_target_url_missing', 'database_target_url_scheme_invalid', 'database_target_url_requires_verify_full',
    'database_target_query_parameter_not_allowed', 'database_target_duplicate_query_parameter', 'database_target_query_parameter_value_invalid',
    'database_target_sql_name_missing', 'database_target_sql_name_invalid',
    'plan_target_identity_missing_or_invalid', 'database_target_username_not_branch_qualified',
    'database_target_branch_id_invalid', 'database_target_origin_fingerprint_invalid',
    'admin_database_branch_id_mismatch', 'admin_database_sql_name_mismatch', 'admin_database_origin_mismatch',
    'admin_database_target_identity_mismatch', 'admin_database_session_name_mismatch', 'admin_database_session_role_mismatch',
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
  const plannedTarget = assertExecutionGate();
  const manifest = loadApprovedMigrations({ root, committedOnly: process.env.CI === 'true' });
  const migration = manifest.migrations.find(({ name }) => name === MIGRATION_0021);
  if (!migration) throw new Error('canonical_0021_migration_missing');
  const client = new Client(adminConnection(process.env.PLANETSCALE_ADMIN_DATABASE_URL ?? ''));
  await client.connect();
  try {
    const target = await assertConnectedAdminDatabaseTarget(client, {
      connectionString: process.env.PLANETSCALE_ADMIN_DATABASE_URL,
      plannedTarget,
    });
    report.target = target;
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
    let recoveryPending = false;
    let registryRecorded = false;
    await applyMediaQuarantineMigration(client, migration, {
      beforeApply: async () => {
        const lockedRegistry = await readRegistry(client);
        const lockedStage = await inspectMediaQuarantineMigration(client);
        const lockedState = classifyLocked0021State(lockedRegistry, lockedStage.state);
        if (lockedState.action === 'BLOCK') throw new Error(lockedState.reason);
        if (lockedState.action === 'ALREADY_RECORDED') {
          await verifyMediaQuarantineMigration(client);
          alreadyAppliedUnderLock = true;
          return false;
        }
        if (lockedState.action === 'RECOVER_MARKER') {
          await verifyMediaQuarantineMigration(client);
          recoveryPending = true;
          return false;
        }
        if (lockedState.action !== 'APPLY_DDL') throw new Error('0021_locked_state_unknown');
        return true;
      },
      afterVerified: async ({ applied }) => {
        if (!applied && !recoveryPending) return;
        await recordCanonical0021RegistryMarker(client, migration, () => verifyMediaQuarantineMigration(client));
        registryRecorded = true;
      },
    });

    const finalRegistry = await readRegistry(client);
    if (!exactRegistryPrefix(finalRegistry, MIGRATION_0021)) throw new Error('0021_registry_marker_insert_did_not_create_exact_prefix');
    await verifyMediaQuarantineMigration(client);
    report.status = alreadyAppliedUnderLock ? 'already_applied_verified' : recoveryPending ? 'registry_marker_recovered' : 'applied_and_verified';
    report.registryHead = MIGRATION_0021;
    report.databaseWrites = registryRecorded;
    report.schemaDdlApplied = !recoveryPending && !alreadyAppliedUnderLock;
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
