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

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log('Validated the canonical exact-SHA production release contract.');
}
