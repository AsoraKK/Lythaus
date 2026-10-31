import { appendFileSync } from 'node:fs';
import { failureDomainEvidence } from '../release/failure-domains.mjs';

export function resolveAppOnlyFailureDomain({ preflightResult, providerResult, transactionResult, transactionStatus } = {}) {
  if (preflightResult !== 'success') return [failureDomainEvidence({ gate: 'SOURCE', code: 'source_preflight_failed',
    message: 'canonical release source preflight did not complete successfully' })];
  if (providerResult !== 'success') return [failureDomainEvidence({ gate: 'INFRASTRUCTURE', code: 'provider_evidence_failed',
    message: 'exact provider or database evidence did not complete successfully' })];
  if (transactionResult !== 'success' || transactionStatus !== 'VERIFIED') return [failureDomainEvidence({ gate: 'CANDIDATE', code: 'app_only_transaction_incomplete',
    message: 'app-only acceptance, deployment or final verification did not complete successfully' })];
  return [];
}

if (process.argv[1]?.endsWith('resolve-app-only-failure-domain.mjs')) {
  const evidence = resolveAppOnlyFailureDomain({ preflightResult: process.env.PREFLIGHT_RESULT, providerResult: process.env.PROVIDER_RESULT,
    transactionResult: process.env.APP_ONLY_RESULT, transactionStatus: process.env.APP_ONLY_STATUS });
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `failure_domain_evidence_json=${JSON.stringify(evidence)}\n`);
  console.log(JSON.stringify(evidence));
}
