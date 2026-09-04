import fs from 'node:fs';

import { failureDomainEvidence } from '../release/failure-domains.mjs';

const resultFailed = (value) => ['failure', 'cancelled'].includes(String(value ?? '').toLowerCase());
const resultCancelled = (value) => String(value ?? '').toLowerCase() === 'cancelled';

function parseExisting(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function resolveUpstreamFailureDomain({
  preflightResult,
  providerResult,
  workersResult,
  marketingResult,
  webResult,
  adminResult,
  productionSmokeResult,
  rollbackResult,
  existingEvidence = [],
} = {}) {
  if (Array.isArray(existingEvidence) && existingEvidence.length > 0) return existingEvidence;
  const cancelledGate = [
    ['SOURCE', preflightResult],
    ['INFRASTRUCTURE', providerResult],
    ['CANDIDATE', workersResult],
    ['CANDIDATE', marketingResult],
    ['CANDIDATE', webResult],
    ['CANDIDATE', adminResult],
    ['ACTIVATION', productionSmokeResult],
    ['ACTIVATION', rollbackResult],
  ].find(([, result]) => resultCancelled(result));
  if (cancelledGate) {
    return [failureDomainEvidence({
      gate: cancelledGate[0],
      code: 'github_job_cancelled',
      message: 'GitHub job was cancelled before the release gate completed',
    })];
  }
  if (resultFailed(preflightResult)) {
    return [failureDomainEvidence({
      gate: 'SOURCE',
      code: 'source_preflight_failed',
      message: 'canonical release source preflight did not complete successfully',
    })];
  }
  if (resultFailed(providerResult)) {
    return [failureDomainEvidence({
      gate: 'INFRASTRUCTURE',
      code: 'provider_evidence_failed',
      message: 'exact provider or database evidence did not complete successfully',
    })];
  }
  if (resultFailed(workersResult)) {
    return [failureDomainEvidence({
      gate: 'CANDIDATE',
      code: 'native_worker_release_failed',
      message: 'native Worker release did not complete successfully',
      })];
  }
  if (resultFailed(rollbackResult)) {
    return [failureDomainEvidence({
      gate: 'ACTIVATION',
      code: 'component_rollback_failed',
      message: 'changed component rollback did not complete successfully',
    })];
  }
  const failedPages = [
    ['marketing', marketingResult],
    ['flutter-web', webResult],
    ['control-panel', adminResult],
  ].filter(([, result]) => resultFailed(result)).map(([component]) => component);
  if (failedPages.length > 0) {
    return [failureDomainEvidence({
      gate: 'CANDIDATE',
      code: 'pages_child_workflow_failed',
      message: `Pages child workflow failed for ${failedPages.join(', ')}`,
    })];
  }
  if (String(productionSmokeResult ?? '').toLowerCase() !== 'success') {
    return [failureDomainEvidence({
      gate: 'ACTIVATION',
      code: 'production_smoke_failed',
      message: 'canonical production smoke did not complete successfully',
    })];
  }
  return [];
}

function main() {
  const evidence = resolveUpstreamFailureDomain({
    preflightResult: process.env.PREFLIGHT_RESULT,
    providerResult: process.env.PROVIDER_RESULT,
    workersResult: process.env.WORKERS_RESULT,
    marketingResult: process.env.MARKETING_RESULT,
    webResult: process.env.WEB_RESULT,
    adminResult: process.env.ADMIN_RESULT,
    productionSmokeResult: process.env.PRODUCTION_SMOKE_RESULT,
    rollbackResult: process.env.ROLLBACK_RESULT,
    existingEvidence: parseExisting(process.env.FAILURE_DOMAIN_EVIDENCE_JSON),
  });
  if (process.env.GITHUB_ENV && evidence.length > 0) {
    fs.appendFileSync(process.env.GITHUB_ENV, `FAILURE_DOMAIN_EVIDENCE_JSON=${JSON.stringify(evidence)}\n`, 'utf8');
  }
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `failure_domain_evidence_json=${JSON.stringify(evidence)}\n`, 'utf8');
  }
  console.log(JSON.stringify(evidence));
}

if (process.argv[1] && process.argv[1].endsWith('resolve-release-failure-domain.mjs')) main();
