import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashReceipt, validateBetaRelease } from '../authenticity/beta-release-policy.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const rawReceipt = process.env.AUTHENTICITY_BETA_RELEASE_RECEIPT;
if (!rawReceipt) throw new Error('beta_release_receipt_required');
const source = fs.readFileSync(path.join(root, 'apps/lythaus-authenticity-runtime/container/safe_process.py'), 'utf8').replace(/\r\n/g, '\n');
const approved = validateBetaRelease(JSON.parse(rawReceipt), {
  sourceSha: process.env.RELEASE_SHA,
  approvedReceiptHash: process.env.AUTHENTICITY_BETA_RELEASE_RECEIPT_SHA256,
  rawReceipt, preprocessingHash: hashReceipt(source),
});
const configPath = path.join(root, 'apps/lythaus-authenticity-runtime/wrangler.activation.template.jsonc');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
config.vars.RUNTIME_DIGEST = approved.runtimeDigest;
config.vars.SOURCE_SHA = approved.sourceSha;
config.containers[0].image = approved.image;
config.containers[0].instance_type = approved.instanceType;
const output = path.join(root, 'apps/lythaus-authenticity-runtime/wrangler.release.jsonc');
if (process.env.MATERIALIZE_AUTHENTICITY_BETA === 'true') {
  if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('protected_release_workflow_required');
  fs.writeFileSync(output, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
  const jobsPath = path.join(root, 'apps/lythaus-jobs/wrangler.jsonc');
  const jobs = JSON.parse(fs.readFileSync(jobsPath, 'utf8'));
  if (jobs.vars.AUTHENTICITY_BETA_ENABLED !== 'false') throw new Error('disabled_deployment_required');
  const bindings = jobs.durable_objects?.bindings ?? [];
  if (bindings.some(binding => binding.name === 'AUTHENTICITY_BETA_CONTAINER')) throw new Error('duplicate_beta_binding');
  jobs.durable_objects = { ...jobs.durable_objects, bindings: [...bindings, { name: 'AUTHENTICITY_BETA_CONTAINER', class_name: 'SafeBetaContainer', script_name: config.name }] };
  fs.writeFileSync(jobsPath, JSON.stringify(jobs, null, 2) + '\n');
  if (!process.env.RUNNER_TEMP) throw new Error('private_release_directory_required');
  const evidencePath = path.join(process.env.RUNNER_TEMP, 'production-cutover', 'authenticity-beta-disabled-release.json');
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
  fs.writeFileSync(evidencePath, JSON.stringify({ ...approved, state: 'VALIDATED_NOT_DEPLOYED' }), { mode: 0o600 });
}
console.log(JSON.stringify({ status: 'APPROVED_DISABLED_CONFIGURATION', ...approved }));
