import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const workflowDir = path.join(root, '.github', 'workflows');
const failures = [];

const readWorkflow = (name) => {
  const file = path.join(workflowDir, name);
  if (!fs.existsSync(file)) {
    failures.push(`missing production workflow: ${name}`);
    return '';
  }
  return fs.readFileSync(file, 'utf8');
};

const deploymentWorkflows = [
  'deploy-marketing.yml',
  'deploy-alpha-web.yml',
  'deploy-control-panel.yml',
  'native-workers-deploy.yml',
];

const authAcceptanceCollector = path.join(root, 'scripts', 'ci', 'collect-auth-acceptance-evidence.mjs');
if (!fs.existsSync(authAcceptanceCollector)) {
  failures.push('auth acceptance collector is missing');
}

for (const name of deploymentWorkflows) {
  const source = readWorkflow(name);
  if (!source) continue;
  if (!source.includes('release_sha:')) failures.push(`${name}: release_sha input is missing`);
  if (!source.includes('workflow_dispatch:')) failures.push(`${name}: manual dispatch contract is missing`);
  if (!source.includes('^[0-9a-f]{40}$')) failures.push(`${name}: full SHA validation is missing`);
  if (!source.includes('origin/main')) failures.push(`${name}: current main assertion is missing`);
  if (!source.includes('wrangler@4.123.0')) failures.push(`${name}: Wrangler 4.123.0 pin is missing`);
  if (name !== 'native-workers-deploy.yml' && !source.includes('ref: ${{ inputs.release_sha }}')) {
    failures.push(`${name}: checkout does not use release_sha`);
  }
  if (name !== 'native-workers-deploy.yml' && !source.includes('verify-pages-deployment.mjs')) {
    failures.push(`${name}: actual Pages deployment evidence is missing`);
  }
}

const canonical = readWorkflow('production-release.yml');
if (canonical) {
  for (const name of deploymentWorkflows) {
    if (!canonical.includes(`uses: ./.github/workflows/${name}`)) {
      failures.push(`production-release.yml: missing ${name} child workflow`);
    }
  }
  for (const required of ['confirm_production', 'ci_run_id', 'previous_production_sha', 'origin/main', '.conclusion', 'success']) {
    if (!canonical.includes(required)) failures.push(`production-release.yml: missing ${required} gate`);
  }
  for (const required of ['provider_evidence', 'CLOUDFLARE_INVENTORY_STATUS', 'PLANETSCALE_INVENTORY_STATUS', 'MARKETING_DEPLOYMENT_ID', 'WEB_DEPLOYMENT_ID', 'ADMIN_DEPLOYMENT_ID']) {
    if (!canonical.includes(required)) failures.push(`production-release.yml: missing ${required} evidence wiring`);
  }
  if (canonical.includes('CLOUDFLARE_INVENTORY_STATUS: PARTIAL') || canonical.includes('PLANETSCALE_INVENTORY_STATUS: VERIFIED')) {
    failures.push('production-release.yml: provider status must come from exact-run evidence');
  }
  const dispatchHeader = canonical.slice(0, canonical.indexOf('\npermissions:'));
  if (/^\s{6}(admin_pages_project|web_pages_branch):/m.test(dispatchHeader)) {
    failures.push('production-release.yml: canonical Pages ownership must not be a free-form dispatch input');
  }
  for (const evidenceOutput of [
    'hyperdrive_verified_main',
    'database_identity_verified',
    'budget_enforcement_verified',
    'authenticated_acceptance_proven',
  ]) {
    if (!canonical.includes(`needs.workers.outputs.${evidenceOutput}`)) {
      failures.push(`production-release.yml: provider evidence must come from workers.${evidenceOutput}`);
    }
  }
  if (!canonical.includes('needs.provider_evidence.outputs.planetscale_grants_verified')) {
    failures.push('production-release.yml: provider evidence must include exact PlanetScale grant verification');
  }
  for (const required of ['release_governance_compensating_controls', 'candidate_merged_pr_number', 'reviewThreads', 'git rev-list --min-parents=2', 'git merge-base --is-ancestor', 'release-manifest.sha256']) {
    if (!canonical.includes(required)) failures.push(`production-release.yml: missing compensating governance control ${required}`);
  }
  if (!canonical.includes('REF_PROTECTED')) {
    failures.push('production-release.yml: native branch protection verification is missing');
  }
  if (!canonical.includes('native_branch_protection_status=ACTIVE')) {
    failures.push('production-release.yml: active native branch protection evidence is missing');
  }
  if (canonical.includes('UNAVAILABLE_BY_PLAN')) {
    failures.push('production-release.yml: stale unavailable-by-plan metadata remains');
  }
}

const nativeWorkers = readWorkflow('native-workers-deploy.yml');
const nativeAcceptance = readWorkflow('native-adr003-acceptance.yml');
const authScripts = [
  path.join(root, 'scripts', 'ci', 'real-email-acceptance-evidence.mjs'),
  path.join(root, 'scripts', 'ci', 'run-adr003-authenticated-acceptance.mjs'),
];
for (const file of authScripts) {
  if (!fs.existsSync(file)) {
    failures.push(`missing auth acceptance script: ${path.relative(root, file)}`);
  } else if (/real_email_evidence_json|ADR003_REAL_EMAIL_EVIDENCE_JSON|providerAccepted|messageObserved/u.test(fs.readFileSync(file, 'utf8'))) {
    failures.push(`${path.relative(root, file)}: manually asserted auth evidence remains`);
  }
}
for (const [name, source] of [['native-workers-deploy.yml', nativeWorkers], ['native-adr003-acceptance.yml', nativeAcceptance]]) {
  if (!source) continue;
  for (const required of [
    'collect-auth-acceptance-evidence.mjs',
    'HUMAN_ACCEPTANCE_REQUIRED',
    '.status == "PASSED"',
    'ADR003_AUTH_ACCEPTANCE_EVIDENCE_SOURCE: protected_probe',
    'mail.lythaus.co',
    'cloudflare_email_sending_queue_subscription_observation',
    'provider_configuration_missing',
    'delivered',
    'deferred',
    'bounced',
    'failed',
    'rejected',
    'complained',
  ]) {
    if (!source.includes(required)) failures.push(`${name}: missing generated auth evidence control ${required}`);
  }
  if (source.includes('real_email_evidence_json') || source.includes('ADR003_REAL_EMAIL_EVIDENCE_JSON')) {
    failures.push(`${name}: manual auth evidence input remains`);
  }
}
if (fs.existsSync(authAcceptanceCollector)) {
  const collector = fs.readFileSync(authAcceptanceCollector, 'utf8');
  for (const required of ['protected_probe', 'read_only_query_artifact', 'ADR003_AUTH_ACCEPTANCE_QUERY_OUTPUT_PATH', 'Cloudflare-Workers-Version-Overrides']) {
    if (!collector.includes(required)) failures.push(`auth acceptance collector: missing ${required}`);
  }
  if (collector.includes('/internal/readiness/auth-acceptance')) {
    failures.push('auth acceptance collector: implicit public evidence endpoint remains');
  }
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log('Validated the canonical exact-SHA production release contract.');
}
