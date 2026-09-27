import fs from 'node:fs';
import path from 'node:path';
import { hashReceipt, validateBetaRelease } from '../authenticity/beta-release-policy.mjs';

const command = process.argv[2];
if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('protected_release_workflow_required');
if (command === 'dispatch-secret') {
  const secret = process.env.AUTHENTICITY_BETA_DISPATCH_SECRET;
  if (!secret || secret.length < 32 || secret.length > 256) throw new Error('bounded_dispatch_secret_required');
  const file = path.resolve(process.argv[3] ?? '');
  const privateRoot = path.resolve(process.env.RUNNER_TEMP ?? '');
  if (!file.startsWith(privateRoot + path.sep)) throw new Error('private_runner_file_required');
  const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  fs.writeFileSync(file, JSON.stringify({ ...existing, AUTHENTICITY_BETA_DISPATCH_SECRET: secret }), { mode: 0o600 });
} else if (command === 'activate' || command === 'disable') {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const jobs = JSON.parse(fs.readFileSync('apps/lythaus-jobs/wrangler.jsonc', 'utf8'));
  const namespace = jobs.kv_namespaces.find(binding => binding.binding === 'LYTHAUS_CONFIG')?.id;
  if (!/^[a-f0-9]{32}$/.test(account ?? '') || !/^[a-f0-9]{32}$/.test(namespace ?? '') || !token) throw new Error('approved_config_binding_required');
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${account}/storage/kv/namespaces/${namespace}/values/authenticity-beta-v1`;
  let config;
  if (command === 'activate') {
    const rawReceipt = process.env.AUTHENTICITY_BETA_RELEASE_RECEIPT;
    const receipt = JSON.parse(rawReceipt ?? '{}');
    const approved = validateBetaRelease(receipt, { sourceSha: process.env.RELEASE_SHA, approvedReceiptHash: process.env.AUTHENTICITY_BETA_RELEASE_RECEIPT_SHA256, rawReceipt, preprocessingHash: hashReceipt(fs.readFileSync('apps/lythaus-authenticity-runtime/container/safe_process.py', 'utf8').replace(/\r\n/g, '\n')) });
    if (!approved.enabled) {
      console.log(JSON.stringify({ status: 'DISABLED_DEPLOYMENT_NOT_ACTIVATED' }));
      process.exit(0);
    }
    if (approved.image.split('/')[1] !== account) throw new Error('approved_image_account_mismatch');
    if (!['PUBLIC','ADMIN','JOBS'].every(prefix => process.env[`${prefix}_WORKER_SOURCE_SHA`] === approved.sourceSha && process.env[`${prefix}_WORKER_STATUS`] === 'ACTIVATED')) throw new Error('exact_workers_must_be_active');
    if (!process.env.GITHUB_ENV) throw new Error('protected_release_environment_required');
    fs.appendFileSync(process.env.GITHUB_ENV, 'AUTHENTICITY_BETA_ACTIVATION_ATTEMPTED=true\n');
    config = { enabled: true, expiresAt: receipt.expiresAt, allowlist: receipt.allowlist, safeEnabled: true, adviserEnabled: true, rightsApproval: receipt.rightsEvidenceSha256, budgetApproval: receipt.budgetEvidenceSha256, runtimeApproval: receipt.runtimeEvidenceSha256, runtimeDigest: approved.runtimeDigest, preprocessingHash: approved.preprocessingHash, caseReservationUsd: 0.5, sourceHistoryHashes: receipt.sourceHistoryHashes };
  } else {
    const prior = await fetch(endpoint, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
    if (!prior.ok && prior.status !== 404) throw new Error('config_read_failed');
    config = { ...(prior.ok ? await prior.json() : {}), enabled: false, safeEnabled: false, adviserEnabled: false };
  }
  const response = await fetch(endpoint, { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'text/plain' }, body: JSON.stringify(config), signal: AbortSignal.timeout(10000) });
  const result = await response.json();
  if (!response.ok || result.success !== true) throw new Error('config_write_failed_or_ambiguous');
  console.log(JSON.stringify({ schemaVersion: 'lythaus-beta-config-receipt-v1', command, sourceSha: process.env.RELEASE_SHA, configSha256: hashReceipt(JSON.stringify(config)), observedAt: new Date().toISOString(), liveAppAcceptance: false }));
} else throw new Error('unsupported_beta_release_command');
