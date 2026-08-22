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
}

const canonical = readWorkflow('production-release.yml');
if (canonical) {
  for (const name of deploymentWorkflows) {
    if (!canonical.includes(`uses: ./.github/workflows/${name}`)) {
      failures.push(`production-release.yml: missing ${name} child workflow`);
    }
  }
  for (const required of ['confirm_production', 'ci_run_id', 'origin/main', "'.conclusion'", 'success']) {
    if (!canonical.includes(required)) failures.push(`production-release.yml: missing ${required} gate`);
  }
  for (const evidenceOutput of [
    'hyperdrive_verified_main',
    'database_identity_verified',
    'budget_enforcement_verified',
    'authenticated_acceptance_proven',
    'planetscale_grants_verified',
  ]) {
    if (!canonical.includes(`needs.workers.outputs.${evidenceOutput}`)) {
      failures.push(`production-release.yml: provider evidence must come from workers.${evidenceOutput}`);
    }
  }
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log('Validated the canonical exact-SHA production release contract.');
}
