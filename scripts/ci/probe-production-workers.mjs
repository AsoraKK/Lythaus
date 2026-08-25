import fs from 'node:fs';
import { approvedPost0013Expectation } from './product-integrity-schema-contract.mjs';

const token = process.env.DATABASE_READINESS_TOKEN ?? '';
const requireBudgetMigration = process.env.REQUIRE_BUDGET_MIGRATION === 'true';
const post0013Expectation = approvedPost0013Expectation(
  process.env.EXPECTED_DATABASE_SCHEMA_FINGERPRINT ?? '',
  process.env.EXPECTED_DATABASE_RELATION_COUNT ?? '',
);
const expectedRelationCount = post0013Expectation.relationCount;
const expectedSchemaFingerprint = post0013Expectation.fingerprint;
const expectedSchemaVersion = process.env.EXPECTED_DATABASE_SCHEMA_VERSION ?? '';
const expectedBudgetLedgerApplied = requireBudgetMigration;
const expectedBranch = process.env.HYPERDRIVE_VERIFIED_MAIN === 'true' ? 'main' : 'unknown';
const authenticatedAcceptanceProven = process.env.AUTHENTICATED_ACCEPTANCE_PROVEN === 'true';
const requestedWorker = process.env.PRODUCTION_WORKER_SCOPE ?? 'all';
const releaseSha = process.env.RELEASE_SHA ?? '';
const expectedWorkerVersionId = process.env.PRODUCTION_WORKER_VERSION_ID ?? '';

if (!token) throw new Error('DATABASE_READINESS_TOKEN is required');
if (!/^[0-9a-f]{40}$/.test(releaseSha)) throw new Error('RELEASE_SHA must be the exact merged main commit');
if (!/^[0-9a-f-]{36}$/.test(expectedWorkerVersionId)) throw new Error('PRODUCTION_WORKER_VERSION_ID is required');
if (!authenticatedAcceptanceProven) throw new Error('AUTHENTICATED_ACCEPTANCE_PROVEN=true is required');
if (expectedSchemaVersion !== '0013_marketing_waitlist.sql') throw new Error('production probes require migration 0013');
if (expectedBranch !== 'main') throw new Error('HYPERDRIVE_VERIFIED_MAIN=true is required before runtime probe acceptance');

const allTargets = [
  {
    worker: 'lythaus-public-api-development',
    probe: true,
    baseUrl: process.env.PRODUCTION_PUBLIC_API_BASE_URL || 'https://api.lythaus.co',
    anonymousPaths: ['/health', '/ready'],
  },
  {
    worker: 'lythaus-admin-api-development',
    probe: true,
    baseUrl: process.env.PRODUCTION_ADMIN_API_BASE_URL || 'https://admin-api.lythaus.co',
    anonymousPaths: ['/health'],
  },
  {
    worker: 'lythaus-jobs-development',
    probe: false,
    baseUrl: process.env.PRODUCTION_JOBS_API_BASE_URL || '',
    anonymousPaths: [],
  },
];

const targets = requestedWorker === 'all'
  ? allTargets
  : allTargets.filter(({ worker }) => worker === requestedWorker);
if (targets.length === 0) throw new Error(`Unknown PRODUCTION_WORKER_SCOPE: ${requestedWorker}`);

if (targets.some(({ probe, baseUrl }) => probe && !baseUrl)) {
  throw new Error('public and admin Workers require explicit protected probe routes');
}

async function fetchJson(url, options = {}) {
  const headers = new Headers(options.headers);
  headers.set('Cloudflare-Workers-Version-Overrides', `${requestedWorker}="${expectedWorkerVersionId}"`);
  const response = await fetch(url, { ...options, headers, signal: AbortSignal.timeout(15_000) });
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
  const mismatches = [];
  if (report.schemaFingerprint !== expectedSchemaFingerprint) mismatches.push('schemaFingerprint');
  if (report.relationCount !== expectedRelationCount) mismatches.push('relationCount');
  if (report.identityContactEmails !== true) mismatches.push('identityContactEmails');
  if (report.budgetLedgerApplied !== expectedBudgetLedgerApplied) mismatches.push('budgetLedgerApplied');
  if (report.schemaVersion !== expectedSchemaVersion) mismatches.push('schemaVersion');
  if (report.roleClass !== 'login_non_superuser') mismatches.push('roleClass');
  if (report.readiness !== 'pass') mismatches.push('readiness');
  if (mismatches.length > 0) {
    const observed = Object.fromEntries([
      'databaseEnvironment', 'schemaFingerprint', 'relationCount', 'identityContactEmails',
      'budgetLedgerApplied', 'schemaVersion', 'roleClass', 'readiness', 'readyForAuthentication',
      'diagnosticCode',
    ].map((field) => [field, report[field]]));
    throw new Error(`${worker}/${label} structural identity probe failed: ${mismatches.join(',')}; observed=${JSON.stringify(observed)}`);
  }
  if (report.readyForAuthentication !== authenticatedAcceptanceProven) {
    throw new Error(`${worker}/${label} authentication readiness assertion is inconsistent`);
  }
}

const evidence = {
  releaseSha,
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
  if (!target.probe) {
    evidence.workers.push({
      worker: target.worker,
      workerVersionId: expectedWorkerVersionId,
      releaseTag: releaseSha,
      baseUrl: null,
      databaseCount: 0,
      readiness: 'not_applicable_no_public_route',
      branchFingerprint: expectedBranch,
      readyForAuthentication: authenticatedAcceptanceProven,
    });
    continue;
  }
  const base = new URL(target.baseUrl).origin;
  for (const path of target.anonymousPaths) await fetchJson(`${base}${path}`);
  const body = await fetchJson(`${base}/internal/readiness/database-identity`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  });
  if (body.workerVersionId !== expectedWorkerVersionId || body.releaseTag !== releaseSha) {
    throw new Error(`${target.worker} probe did not execute the exact reviewed Worker version`);
  }
  const reports = body.databases && typeof body.databases === 'object'
    ? Object.entries(body.databases)
    : [['primary', body]];
  for (const [label, report] of reports) assertDatabaseReport(report, target.worker, label);
  if (body.branchFingerprint !== 'unknown') throw new Error(`${target.worker} top-level probe must not self-assert a branch`);
  if (body.readyForAuthentication !== authenticatedAcceptanceProven) throw new Error(`${target.worker} top-level authentication readiness assertion is inconsistent`);
  evidence.workers.push({
    worker: target.worker,
    workerVersionId: body.workerVersionId,
    releaseTag: body.releaseTag,
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
