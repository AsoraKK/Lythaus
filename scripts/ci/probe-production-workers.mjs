import fs from 'node:fs';
import { setTimeout } from 'node:timers/promises';
import { approvedReleaseExpectation } from './product-integrity-schema-contract.mjs';
import { parseProductionDeploymentState } from './resolve-production-version-state.mjs';

const token = process.env.DATABASE_READINESS_TOKEN ?? '';
const requireBudgetMigration = process.env.REQUIRE_BUDGET_MIGRATION === 'true';
const releaseExpectation = approvedReleaseExpectation(
  process.env.EXPECTED_DATABASE_SCHEMA_FINGERPRINT ?? '',
  process.env.EXPECTED_DATABASE_RELATION_COUNT ?? '',
);
const expectedRelationCount = releaseExpectation.relationCount;
const expectedSchemaFingerprint = releaseExpectation.fingerprint;
const expectedSchemaVersion = process.env.EXPECTED_DATABASE_SCHEMA_VERSION ?? '';
const expectedBudgetLedgerApplied = requireBudgetMigration;
const expectedBranch = process.env.HYPERDRIVE_VERIFIED_MAIN === 'true' ? 'main' : 'unknown';
const authenticatedAcceptanceProven = process.env.AUTHENTICATED_ACCEPTANCE_PROVEN === 'true';
const requestedWorker = process.env.PRODUCTION_WORKER_SCOPE ?? 'all';
const releaseSha = process.env.RELEASE_SHA ?? '';
const expectedWorkerSourceSha = process.env.EXPECTED_WORKER_SOURCE_SHA ?? releaseSha;
const expectedWorkerVersionId = process.env.PRODUCTION_WORKER_VERSION_ID ?? '';
const expectedPublicVersion = process.env.PUBLIC_WORKER_VERSION_ID ?? '';
const accessClientId = process.env.CF_ACCESS_CLIENT_ID ?? '';
const accessClientSecret = process.env.CF_ACCESS_CLIENT_SECRET ?? '';
const outputPath = process.env.PRODUCTION_WORKER_EVIDENCE_PATH;
const previousDeploymentPath = process.env.PRODUCTION_WORKER_PREVIOUS_DEPLOYMENT_PATH;
const previousVersionsPath = process.env.PRODUCTION_WORKER_PREVIOUS_VERSIONS_PATH;
const propagationDelays = [2_000, 4_000, 6_000, 8_000];
const safeErrorCodes = new Set([
  'auth_email_dispatch_unavailable', 'auth_data_unavailable', 'admin_request_failed',
  'access_required', 'access_assertion_invalid', 'access_subject_missing',
  'access_verification_not_configured', 'admin_subject_key_not_configured',
  'rate_limit_exceeded',
]);
const safeResponseMediaTypes = new Set(['application/json', 'text/html', 'text/plain']);

function redact(value) {
  let text = String(value);
  for (const secret of [token, accessClientId, accessClientSecret]) {
    if (secret) text = text.replaceAll(secret, '[REDACTED]');
  }
  return text;
}

function writeEvidence() {
  if (outputPath) fs.writeFileSync(outputPath, `${redact(JSON.stringify(evidence, null, 2))}\n`, 'utf8');
}

function identity(value, pattern) {
  return typeof value === 'string' && pattern.test(value) ? value : null;
}

if (!token) throw new Error('DATABASE_READINESS_TOKEN is required');
if (!/^[0-9a-f]{40}$/.test(releaseSha)) throw new Error('RELEASE_SHA must be the exact merged main commit');
if (!/^[0-9a-f]{40}$/.test(expectedWorkerSourceSha)) throw new Error('EXPECTED_WORKER_SOURCE_SHA must be a full source SHA');
if (!/^[0-9a-f-]{36}$/.test(expectedWorkerVersionId)) throw new Error('PRODUCTION_WORKER_VERSION_ID is required');
if (requestedWorker === 'lythaus-admin-api-development' && !/^[0-9a-f-]{36}$/.test(expectedPublicVersion)) throw new Error('PUBLIC_WORKER_VERSION_ID is required for the private Admin email binding proof');
if (expectedSchemaVersion !== '0020_auth_recovery_delivery.sql') throw new Error('production probes require migration 0020');
if (expectedBranch !== 'main') throw new Error('HYPERDRIVE_VERIFIED_MAIN=true is required before runtime probe acceptance');

const allTargets = [
  {
    worker: 'lythaus-public-api-development',
    probe: true,
    baseUrl: process.env.PRODUCTION_PUBLIC_API_BASE_URL || 'https://api.lythaus.co',
    routePrefix: '/api',
    anonymousPaths: ['/health', '/ready'],
  },
  {
    worker: 'lythaus-admin-api-development',
    probe: true,
    baseUrl: process.env.PRODUCTION_ADMIN_API_BASE_URL || 'https://admin-api.lythaus.co',
    routePrefix: '',
    anonymousPaths: ['/health'],
  },
  {
    worker: 'lythaus-jobs-development',
    probe: false,
    baseUrl: process.env.PRODUCTION_JOBS_API_BASE_URL || '',
    routePrefix: '',
    anonymousPaths: [],
  },
];

const targets = requestedWorker === 'all'
  ? allTargets
  : allTargets.filter(({ worker }) => worker === requestedWorker);
if (targets.length === 0) throw new Error(`Unknown PRODUCTION_WORKER_SCOPE: ${requestedWorker}`);
if (requestedWorker === 'lythaus-admin-api-development' && (!accessClientId || !accessClientSecret)) {
  throw new Error('CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET are required for the admin candidate probe');
}

if (targets.some(({ probe, baseUrl }) => probe && !baseUrl)) {
  throw new Error('public and admin Workers require explicit protected probe routes');
}

async function fetchJson(url, options = {}, service = requestedWorker) {
  const headers = new Headers(options.headers);
  headers.set('Cloudflare-Workers-Version-Overrides', `${requestedWorker}="${expectedWorkerVersionId}"${requestedWorker === 'lythaus-admin-api-development' ? `, lythaus-public-api-development="${expectedPublicVersion}"` : ''}`);
  if (requestedWorker === 'lythaus-admin-api-development') {
    headers.set('CF-Access-Client-Id', accessClientId);
    headers.set('CF-Access-Client-Secret', accessClientSecret);
  }
  const observation = {
    service,
    path: new URL(url).pathname,
    httpStatus: null,
    cfRay: null,
    expected: {
      workerVersionId: expectedWorkerVersionId,
      releaseTag: expectedWorkerSourceSha,
      ...(service === 'lythaus-admin-api-development' ? { publicWorkerVersion: expectedPublicVersion } : {}),
    },
    observed: { service: null, workerVersionId: null, releaseTag: null },
  };
  evidence.requests.push(observation);
  writeEvidence();
  let response;
  let text;
  try {
    response = await fetch(url, { ...options, headers, signal: AbortSignal.timeout(15_000) });
    observation.httpStatus = response.status;
    observation.cfRay = identity(response.headers.get('cf-ray'), /^[a-f0-9]{16}-[A-Z]{3}$/);
    text = await response.text();
  } catch {
    throw new Error(`${service}${observation.path} probe request failed`);
  }
  let body = null;
  observation.responseFormat = 'non_json';
  try {
    body = JSON.parse(text);
    observation.responseFormat = Array.isArray(body) ? 'json_array'
      : body !== null && typeof body === 'object' ? 'json_object' : 'json_primitive';
  } catch { /* raw response details are not evidence */ }
  const mediaType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  observation.responseMediaType = safeResponseMediaTypes.has(mediaType) ? mediaType : null;
  observation.observed = {
    errorCode: safeErrorCodes.has(body?.error) ? body.error : null,
    service: identity(body?.service, /^lythaus-(public-api|admin-api|jobs)$/),
    workerVersionId: identity(body?.workerVersionId, /^[0-9a-f-]{36}$/),
    releaseTag: identity(body?.releaseTag, /^[0-9a-f]{40}$/),
    ...(service === 'lythaus-admin-api-development' ? {
      emailBinding: {
        bindingVerified: typeof body?.emailBinding?.bindingVerified === 'boolean' ? body.emailBinding.bindingVerified : null,
        publicWorkerVersion: identity(body?.emailBinding?.publicWorkerVersion, /^[0-9a-f-]{36}$/),
      },
    } : {}),
  };
  writeEvidence();
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  if (!body || typeof body !== 'object') throw new Error(`${url} returned a non-object response`);
  return body;
}

function assertDatabaseReport(report, worker, label) {
  for (const field of ['databaseEnvironment', 'branchFingerprint', 'schemaFingerprint', 'relationCount', 'identityContactEmails', 'budgetLedgerApplied', 'roleClass', 'readiness', 'readyForAuthentication']) {
    if (!(field in report)) throw new Error(`${worker}/${label} readiness is missing ${field}`);
  }
  if (typeof report.readyForAuthentication !== 'boolean') {
    throw new Error(`${worker}/${label} readiness has an invalid authentication readiness value`);
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
  if (authenticatedAcceptanceProven && report.readyForAuthentication !== true) {
    throw new Error(`${worker}/${label} authentication readiness assertion is inconsistent`);
  }
}

function assertReadiness(body, target) {
  if (target.worker === 'lythaus-admin-api-development'
    && (body.emailBinding?.bindingVerified !== true || body.emailBinding?.publicWorkerVersion !== expectedPublicVersion)) {
    throw new Error('Admin private email binding did not execute the exact Public candidate');
  }
  const reports = body.databases && typeof body.databases === 'object'
    ? Object.entries(body.databases)
    : [['primary', body]];
  for (const [label, report] of reports) assertDatabaseReport(report, target.worker, label);
  const primaryReport = reports[0]?.[1];
  if (!primaryReport) throw new Error(`${target.worker} candidate probe returned no database report`);
  if (body.branchFingerprint !== 'unknown') throw new Error(`${target.worker} top-level probe must not self-assert a branch`);
  if (typeof body.readyForAuthentication !== 'boolean') throw new Error(`${target.worker} top-level authentication readiness is invalid`);
  if (authenticatedAcceptanceProven && body.readyForAuthentication !== true) throw new Error(`${target.worker} top-level authentication readiness assertion is inconsistent`);
  return { reports, primaryReport };
}

function previousServingVersions() {
  if (!previousDeploymentPath && !previousVersionsPath) return [];
  if (requestedWorker !== 'lythaus-admin-api-development' || !previousDeploymentPath || !previousVersionsPath) {
    throw new Error('Admin propagation retries require both exact predeployment snapshot paths');
  }
  return parseProductionDeploymentState(
    fs.readFileSync(previousDeploymentPath, 'utf8'),
    fs.readFileSync(previousVersionsPath, 'utf8'),
  ).serving;
}

async function fetchCandidateReadiness(base, target, previousVersions) {
  for (let attempt = 1; ; attempt += 1) {
    const body = await fetchJson(`${base}/internal/readiness/database-identity`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    }, target.worker);
    const observation = evidence.requests.at(-1);
    observation.attempt = attempt;
    writeEvidence();
    if (body.workerVersionId === expectedWorkerVersionId && body.releaseTag === expectedWorkerSourceSha) return body;
    const previousVersion = target.worker === 'lythaus-admin-api-development'
      && body.service === 'lythaus-admin-api'
      && previousVersions.some(({ versionId, sourceSha }) => body.workerVersionId === versionId && body.releaseTag === sourceSha);
    if (!previousVersion) throw new Error(`${target.worker} probe did not execute the exact reviewed Worker version`);
    assertReadiness(body, target);
    if (attempt > propagationDelays.length) {
      throw new Error(`${target.worker} probe did not execute the exact reviewed Worker version after ${attempt} bounded propagation attempts`);
    }
    const delayMs = propagationDelays[attempt - 1];
    observation.retry = { reason: 'known_predeployment_version', nextAttempt: attempt + 1, delayMs };
    writeEvidence();
    console.error(`${target.worker} observed the verified predeployment version on attempt ${attempt}; retrying the exact candidate in ${delayMs}ms`);
    await setTimeout(delayMs);
  }
}

const evidence = {
  status: 'pending',
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
  requests: [],
};

async function probeTargets() {
  const previousVersions = previousServingVersions();
  for (const target of targets) {
    if (!target.probe) {
      evidence.workers.push({
        worker: target.worker,
        workerVersionId: expectedWorkerVersionId,
        releaseTag: expectedWorkerSourceSha,
        sourceSha: expectedWorkerSourceSha,
        baseUrl: null,
        databaseCount: 0,
        readiness: 'not_applicable_no_public_route',
        branchFingerprint: expectedBranch,
        readyForAuthentication: authenticatedAcceptanceProven,
      });
      continue;
    }
    const base = `${new URL(target.baseUrl).origin}${target.routePrefix}`;
    for (const path of target.anonymousPaths) await fetchJson(`${base}${path}`, {}, target.worker);
    const body = await fetchCandidateReadiness(base, target, previousVersions);
    const { reports, primaryReport } = assertReadiness(body, target);
    evidence.workers.push({
      worker: target.worker,
      workerVersionId: body.workerVersionId,
      releaseTag: body.releaseTag,
      sourceSha: body.releaseTag,
      ...(target.worker === 'lythaus-admin-api-development' ? { emailBinding: { bindingVerified: true, publicWorkerVersion: expectedPublicVersion } } : {}),
      baseUrl: base,
      databaseCount: reports.length,
      databaseEnvironment: primaryReport.databaseEnvironment,
      schemaFingerprint: primaryReport.schemaFingerprint,
      relationCount: primaryReport.relationCount,
      identityContactEmails: primaryReport.identityContactEmails,
      budgetLedgerApplied: primaryReport.budgetLedgerApplied,
      schemaVersion: primaryReport.schemaVersion,
      roleClass: primaryReport.roleClass,
      readiness: body.readiness,
      branchFingerprint: expectedBranch,
      readyForAuthentication: body.readyForAuthentication === true,
    });
  }
}

try {
  await probeTargets();
  evidence.status = 'pass';
  writeEvidence();
  console.log(redact(JSON.stringify({ status: 'pass', workers: evidence.workers, branchFingerprint: evidence.branchFingerprint, readyForAuthentication: evidence.readyForAuthentication })));
} catch (error) {
  evidence.status = 'fail';
  evidence.failure = redact(String(error.message));
  writeEvidence();
  console.error(redact(JSON.stringify({ status: 'fail', failure: evidence.failure, requests: evidence.requests })));
  process.exitCode = 1;
}
