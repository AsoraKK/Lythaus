import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { planetScaleServiceTokenAuthorizationHeader } from '../planetscale/service-token-auth.mjs';
import { assess0021ExecutionConsent, assess0021RegistryState, assessOperatorCostEstimate, assessPlanetScaleBackupEvidence, MIGRATION_0020, MIGRATION_0021, resolve0021BackupId, serialize0021PlanReadyOutput } from './planetscale-0021-only-contract.mjs';
import { branchQualifiedDatabaseTarget, buildPlanetScaleTargetIdentity } from './planetscale-0021-target-identity.mjs';
import { inspectMediaQuarantineMigration, verifyMediaQuarantineMigration } from './planetscale-media-quarantine-migration.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const now = Date.now();
const blockers = [];
const evidence = {
  mode: 'read-only-0021-plan',
  targetBranch: 'main',
  migration: MIGRATION_0021,
  databaseWrites: false,
  providerMutations: false,
  generatedAt: new Date(now).toISOString(),
  sourceMainSha: process.env.RELEASE_SHA ?? null,
};

function addBlockers(items) {
  for (const blocker of items) if (!blockers.includes(blocker)) blockers.push(blocker);
}

function read0021RestoreEvidenceRecord(backupId) {
  if (typeof backupId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(backupId)) return { record: null, recordPath: null };
  const relativePath = path.join('docs/evidence/production-cutover/0021-restore-evidence', `${backupId}.json`);
  try {
    return {
      record: JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8')),
      recordPath: relativePath,
    };
  } catch {
    return { record: null, recordPath: relativePath };
  }
}

function report() {
  const output = {
    ...evidence,
    executionEligibility: blockers.length === 0 ? 'ready_for_protected_execution_review' : 'blocked_pending_prerequisites',
    blockers,
    readyForProtectedExecutionReview: blockers.length === 0,
  };
  const serialized = `${JSON.stringify(output, null, 2)}\n`;
  const reportPath = process.env.MIGRATION_PLAN_REPORT_FILE ?? '';
  if (reportPath) {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, serialized, { mode: 0o600 });
  }
  console.log(serialized.trimEnd());
  if (process.env.GITHUB_OUTPUT) {
    const outputs = [`ready=${serialize0021PlanReadyOutput(blockers)}`];
    if (evidence.targetIdentity) outputs.push(`target_identity=${JSON.stringify(evidence.targetIdentity)}`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${outputs.join('\n')}\n`, 'utf8');
  }
  return output;
}

async function planetscaleGet(resourcePath, authorization) {
  const response = await fetch(`https://api.planetscale.com/v1${resourcePath}`, {
    method: 'GET',
    headers: { Authorization: authorization, Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`provider_http_${response.status}`);
  return response.json();
}

async function inspectProviderEvidence() {
  const token = process.env.PLANETSCALE_API_TOKEN ?? '';
  const backupId = resolve0021BackupId(process.env.PLANETSCALE_0021_BACKUP_ID, process.env.PLANETSCALE_PRODUCTION_BACKUP_ID);
  const restoreEvidenceInput = read0021RestoreEvidenceRecord(backupId);
  const assessProviderEvidence = (branch, backup) => {
    const assessment = assessPlanetScaleBackupEvidence({
      branch,
      backup,
      backupId,
      restoreEvidenceRecord: restoreEvidenceInput.record,
      restoreEvidenceRecordPath: restoreEvidenceInput.recordPath,
      now,
    });
    evidence.planetscale = assessment;
    addBlockers(assessment.blockers);
  };
  if (!token) {
    blockers.push('PLANETSCALE_API_TOKEN_missing_for_read_branch_and_backup_evidence');
    assessProviderEvidence(null, null);
    return;
  }
  if (!backupId) blockers.push('PLANETSCALE_0021_BACKUP_ID_or_PLANETSCALE_PRODUCTION_BACKUP_ID_missing');
  let authorization;
  try {
    authorization = planetScaleServiceTokenAuthorizationHeader(token);
  } catch {
    blockers.push('PLANETSCALE_API_TOKEN_invalid_format');
    assessProviderEvidence(null, null);
    return;
  }
  const base = `/organizations/${encodeURIComponent(process.env.PLANETSCALE_ORGANIZATION ?? 'lythaus')}/databases/${encodeURIComponent(process.env.PLANETSCALE_DATABASE ?? 'lythaus-core')}/branches/main`;
  const [branchResult, backupResult] = await Promise.allSettled([
    planetscaleGet(base, authorization),
    backupId ? planetscaleGet(`${base}/backups/${encodeURIComponent(backupId)}`, authorization) : Promise.reject(new Error('backup_id_missing')),
  ]);
  if (branchResult.status !== 'fulfilled') {
    blockers.push(`planetscale_branch_read_failed:${branchResult.reason?.message === 'provider_http_403' ? 'http_403' : branchResult.reason?.message === 'provider_http_401' ? 'http_401' : 'unavailable'}`);
  }
  if (backupResult.status !== 'fulfilled') {
    blockers.push(`planetscale_backup_read_failed:${backupResult.reason?.message === 'provider_http_403' ? 'http_403' : backupResult.reason?.message === 'provider_http_401' ? 'http_401' : 'unavailable'}`);
  }
  assessProviderEvidence(
    branchResult.status === 'fulfilled' ? branchResult.value : null,
    backupResult.status === 'fulfilled' ? backupResult.value : null,
  );
}

function connectionConfig(raw, purpose) {
  if (!raw) throw new Error(`${purpose}_database_url_missing`);
  const url = new URL(raw);
  if (url.searchParams.get('sslmode') !== 'verify-full') throw new Error(`${purpose}_database_url_requires_sslmode_verify_full`);
  if (url.searchParams.get('sslrootcert') === 'system') url.searchParams.delete('sslrootcert');
  return { connectionString: url.toString(), ssl: { rejectUnauthorized: true } };
}

async function inspectDatabaseReadOnly() {
  let client;
  try {
    const target = branchQualifiedDatabaseTarget(process.env.PLANETSCALE_SCHEMA_READ_DATABASE_URL ?? '');
    const providerBranchId = evidence.planetscale?.branch?.id ?? '';
    if (!providerBranchId || target.branchId !== providerBranchId) throw new Error('schema_read_database_branch_id_mismatch');
    const database = connectionConfig(process.env.PLANETSCALE_SCHEMA_READ_DATABASE_URL ?? '', 'PLANETSCALE_SCHEMA_READ');
    const { default: pg } = await import('pg');
    client = new pg.Client(database);
    await client.connect();
    await client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
    const readOnly = await client.query('SHOW transaction_read_only');
    if (readOnly.rows[0]?.transaction_read_only !== 'on') throw new Error('read_only_session_not_confirmed');
    const session = await client.query('SELECT current_database() AS database_name, current_user AS user_name');
    const sessionRow = session.rows[0] ?? {};
    if (sessionRow.database_name !== target.sqlDatabaseName || ![target.username, target.role].includes(sessionRow.user_name)) {
      throw new Error('schema_read_database_session_target_mismatch');
    }
    const registryExists = await client.query("SELECT to_regclass('system.schema_migrations') AS registry");
    const registry = registryExists.rows[0]?.registry
      ? await client.query('SELECT version, checksum FROM system.schema_migrations ORDER BY version')
      : { rows: [] };
    const staged = await inspectMediaQuarantineMigration(client);
    const migration = assess0021RegistryState(registry.rows, staged.state);
    if (['COMPLETE', 'RECOVERY_REQUIRED'].includes(migration.state)) await verifyMediaQuarantineMigration(client);
    evidence.database = {
      readOnly: true,
      branch: 'main',
      target: { branchId: target.branchId, sqlDatabaseName: target.sqlDatabaseName, originFingerprint: target.originFingerprint },
      registryHead: registry.rows.at(-1)?.version ?? null,
      registryCount: registry.rows.length,
      stagedState: staged.state,
      migration,
    };
    addBlockers(migration.blockers);
  } catch {
    evidence.database = { readOnly: false, status: 'unavailable' };
    blockers.push('PLANETSCALE_SCHEMA_READ_DATABASE_URL_catalog_reconciliation_failed_or_unavailable');
  } finally {
    if (client) await client.end().catch(() => undefined);
  }
}

function finalizeTargetIdentity() {
  const providerBranch = evidence.planetscale?.branch;
  const databaseTarget = evidence.database?.target;
  const hyperdrive = evidence.hyperdriveOrigins;
  if (!providerBranch?.id || !databaseTarget || hyperdrive?.status !== 'pass') {
    blockers.push('main_target_identity_evidence_incomplete');
    return;
  }
  if (providerBranch.id !== databaseTarget.branchId || hyperdrive.originFingerprint !== databaseTarget.originFingerprint) {
    blockers.push('main_target_identity_evidence_mismatch');
    return;
  }
  try {
    evidence.targetIdentity = buildPlanetScaleTargetIdentity({
      provider: {
        organization: process.env.PLANETSCALE_ORGANIZATION ?? 'lythaus',
        database: process.env.PLANETSCALE_DATABASE ?? 'lythaus-core',
        branchName: 'main',
        branchId: providerBranch.id,
      },
      sql: {
        databaseName: databaseTarget.sqlDatabaseName,
        originFingerprint: databaseTarget.originFingerprint,
      },
    });
  } catch {
    blockers.push('main_target_identity_invalid');
  }
}

function inspectCostEstimate() {
  const assessment = assessOperatorCostEstimate({
    estimateUsd: process.env.PLANETSCALE_0021_OPERATOR_COST_ESTIMATE_USD,
    reference: process.env.PLANETSCALE_0021_COST_ESTIMATE_REFERENCE,
    ceilingUsd: process.env.PLANETSCALE_MIGRATION_USAGE_MAX_USD,
  });
  evidence.costReview = assessment;
  addBlockers(assessment.blockers);
}

function verifyHyperdriveOriginsReadOnly() {
  const required = ['CLOUDFLARE_API_TOKEN', 'PLANETSCALE_SCHEMA_READ_DATABASE_URL', 'PSCALE_ROLE_IDENTIFIERS'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    blockers.push(`hyperdrive_origin_verification_inputs_missing:${missing.join(',')}`);
    evidence.hyperdriveOrigins = { status: 'unavailable', missing };
    return;
  }
  const childEnv = {
    PATH: process.env.PATH ?? '',
    CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
    ...(process.env.CLOUDFLARE_ACCOUNT_ID ? { CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID } : {}),
    PLANETSCALE_SCHEMA_READ_DATABASE_URL: process.env.PLANETSCALE_SCHEMA_READ_DATABASE_URL,
    PSCALE_ROLE_IDENTIFIERS: process.env.PSCALE_ROLE_IDENTIFIERS,
    PSCALE_BRANCH_NAME: 'main',
  };
  const result = spawnSync(process.execPath, ['scripts/ci/verify-cloudflare-hyperdrive-targets.mjs'], {
    cwd: root,
    env: childEnv,
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 1_000_000,
  });
  if (result.status !== 0) {
    blockers.push('cloudflare_hyperdrive_origin_verification_failed_or_unavailable');
    evidence.hyperdriveOrigins = { status: 'failed', exitCode: result.status ?? null };
    return;
  }
  try {
    const payload = JSON.parse(result.stdout.trim());
    if (payload.status !== 'pass' || payload.targetBranch !== 'main' || !Array.isArray(payload.bindings) || payload.bindings.length === 0) throw new Error('invalid_report');
    if (payload.bindings.some(({ roleMatches, runtimeRoleMatches, cacheDisabled, tlsMode, caCertificatePresent }) => (
      roleMatches !== true || runtimeRoleMatches !== true || cacheDisabled !== true || tlsMode !== 'verify-full' || caCertificatePresent !== true
    ))) throw new Error('invalid_binding_report');
    evidence.hyperdriveOrigins = {
      status: 'pass',
      targetBranch: payload.targetBranch,
      originFingerprint: payload.originFingerprint,
      bindings: payload.bindings.map(({ worker, binding, roleClass, roleMatches, runtimeRoleMatches, cacheDisabled, tlsMode, caCertificatePresent }) => ({
        worker, binding, roleClass, roleMatches, runtimeRoleMatches, cacheDisabled, tlsMode, caCertificatePresent,
      })),
    };
  } catch {
    blockers.push('cloudflare_hyperdrive_origin_report_invalid');
    evidence.hyperdriveOrigins = { status: 'failed' };
  }
}

if (process.env.PSCALE_BRANCH_NAME !== 'main') blockers.push('PSCALE_BRANCH_NAME_must_be_main');
if (!/^[0-9a-f]{40}$/.test(evidence.sourceMainSha ?? '')) blockers.push('release_sha_missing_or_invalid');
evidence.ownerExecutionConsent = assess0021ExecutionConsent({
  releaseSha: evidence.sourceMainSha,
  approvedSha: process.env.PLANETSCALE_0021_EXECUTION_APPROVED_SHA,
  approvalReference: process.env.PLANETSCALE_0021_EXECUTION_APPROVAL_REFERENCE,
});
addBlockers(evidence.ownerExecutionConsent.blockers);
inspectCostEstimate();
await inspectProviderEvidence();
await inspectDatabaseReadOnly();
verifyHyperdriveOriginsReadOnly();
finalizeTargetIdentity();
report();
