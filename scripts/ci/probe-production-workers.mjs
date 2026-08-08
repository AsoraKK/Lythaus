import fs from 'node:fs';

const token = process.env.DATABASE_READINESS_TOKEN ?? '';
const requireBudgetMigration = process.env.REQUIRE_BUDGET_MIGRATION === 'true';
const expectedRelationCount = Number(process.env.EXPECTED_DATABASE_RELATION_COUNT ?? (requireBudgetMigration ? 82 : 78));
const expectedSchemaFingerprint = process.env.EXPECTED_DATABASE_SCHEMA_FINGERPRINT ?? (requireBudgetMigration
  ? ''
  : '86ff272e09dbd195f18d262c354449ececdb907663615786c90a0d630b8f8625');
const expectedSchemaVersion = process.env.EXPECTED_DATABASE_SCHEMA_VERSION ?? (requireBudgetMigration
  ? '0009_cost_budget_enforcement.sql'
  : '0008_legacy_relink_status.sql');
const expectedBudgetLedgerApplied = requireBudgetMigration;
const expectedBranch = process.env.HYPERDRIVE_VERIFIED_MAIN === 'true' ? 'main' : 'unknown';
const authenticatedAcceptanceProven = process.env.AUTHENTICATED_ACCEPTANCE_PROVEN === 'true';
const requestedWorker = process.env.PRODUCTION_WORKER_SCOPE ?? 'all';

if (!token) throw new Error('DATABASE_READINESS_TOKEN is required');
if (!Number.isInteger(expectedRelationCount) || expectedRelationCount <= 0) throw new Error('EXPECTED_DATABASE_RELATION_COUNT is invalid');
if (!expectedSchemaFingerprint) throw new Error('EXPECTED_DATABASE_SCHEMA_FINGERPRINT is required for post-budget probes');
if (expectedBranch !== 'main') throw new Error('HYPERDRIVE_VERIFIED_MAIN=true is required before runtime probe acceptance');

const allTargets = [
  {
    worker: 'lythaus-public-api-development',
    baseUrl: process.env.PRODUCTION_PUBLIC_API_BASE_URL || 'https://api.lythaus.co',
    anonymousPaths: ['/health', '/ready'],
  },
  {
    worker: 'lythaus-admin-api-development',
    baseUrl: process.env.PRODUCTION_ADMIN_API_BASE_URL || 'https://admin-api.lythaus.co',
    anonymousPaths: ['/health'],
  },
  {
    worker: 'lythaus-jobs-development',
    baseUrl: process.env.PRODUCTION_JOBS_API_BASE_URL || '',
    anonymousPaths: [],
  },
];

const targets = requestedWorker === 'all'
  ? allTargets
  : allTargets.filter(({ worker }) => worker === requestedWorker);
if (targets.length === 0) throw new Error(`Unknown PRODUCTION_WORKER_SCOPE: ${requestedWorker}`);

if (targets.some(({ baseUrl }) => !baseUrl)) throw new Error('PRODUCTION_JOBS_API_BASE_URL is required; jobs must have an explicit protected probe route');

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15_000) });
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* response details are not evidence */ }
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  if (!body || typeof body !== 'object') throw new Error(`${url} returned a non-object response`);
  return body;
}

function assertDatabaseReport(report, worker, label) {
  for (const field of ['databaseEnvironment', 'branchFingerprint', 'schemaFingerprint', 'relationCount', 'identityContactEmails', 'budgetLedgerApplied', 'roleClass', 'readiness', 'readyForAuthentication']) {
    if (!(field in report)) throw new Error(`${worker}/${label} readiness is missing ${field}`);
  }
  if (report.branchFingerprint !== 'unknown') throw new Error(`${worker}/${label} must not self-assert a PlanetScale branch`);
  if (report.schemaFingerprint !== expectedSchemaFingerprint
    || report.relationCount !== expectedRelationCount
    || report.identityContactEmails !== true
    || report.budgetLedgerApplied !== expectedBudgetLedgerApplied
    || report.schemaVersion !== expectedSchemaVersion
    || report.roleClass !== 'login_non_superuser'
    || report.readiness !== 'pass') {
    throw new Error(`${worker}/${label} structural identity probe failed`);
  }
  if (report.readyForAuthentication !== authenticatedAcceptanceProven) {
    throw new Error(`${worker}/${label} authentication readiness assertion is inconsistent`);
  }
}

const evidence = {
  capturedAt: new Date().toISOString(),
  branchFingerprint: expectedBranch,
  readyForAuthentication: authenticatedAcceptanceProven,
  expected: {
    relationCount: expectedRelationCount,
    schemaFingerprint: expectedSchemaFingerprint,
    schemaVersion: expectedSchemaVersion,
    budgetLedgerApplied: expectedBudgetLedgerApplied,
  },
  workers: [],
};

for (const target of targets) {
  const base = new URL(target.baseUrl).origin;
  for (const path of target.anonymousPaths) await fetchJson(`${base}${path}`);
  const body = await fetchJson(`${base}/internal/readiness/database-identity`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  });
  const reports = body.databases && typeof body.databases === 'object'
    ? Object.entries(body.databases)
    : [['primary', body]];
  for (const [label, report] of reports) assertDatabaseReport(report, target.worker, label);
  if (body.branchFingerprint !== 'unknown') throw new Error(`${target.worker} top-level probe must not self-assert a branch`);
  if (body.readyForAuthentication !== authenticatedAcceptanceProven) throw new Error(`${target.worker} top-level authentication readiness assertion is inconsistent`);
  evidence.workers.push({
    worker: target.worker,
    baseUrl: base,
    databaseCount: reports.length,
    readiness: body.readiness,
    branchFingerprint: expectedBranch,
    readyForAuthentication: body.readyForAuthentication === true,
  });
}

const outputPath = process.env.PRODUCTION_WORKER_EVIDENCE_PATH;
if (outputPath) fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: 'pass', workers: evidence.workers, branchFingerprint: evidence.branchFingerprint, readyForAuthentication: evidence.readyForAuthentication }));
