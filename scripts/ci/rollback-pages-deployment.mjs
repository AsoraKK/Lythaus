#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const argument = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
const token = process.env.CLOUDFLARE_API_TOKEN ?? '';
const project = argument('--project') ?? '';
const deploymentId = argument('--deployment-id') ?? '';
const expectedCommitSha = argument('--expected-commit-sha') ?? '';
const outputPath = argument('--output') ?? path.join(process.cwd(), 'pages-rollback-evidence.json');

if (!/^[0-9a-f]{32}$/i.test(accountId)) throw new Error('CLOUDFLARE_ACCOUNT_ID must be a 32-character account ID');
if (!token) throw new Error('CLOUDFLARE_API_TOKEN is required');
if (!/^[A-Za-z0-9._-]{1,100}$/.test(project)) throw new Error('Pages project is invalid');
if (!/^[A-Za-z0-9._:-]{6,200}$/.test(deploymentId)) throw new Error('Pages deployment ID is invalid');
if (!/^[0-9a-f]{40}$/i.test(expectedCommitSha)) throw new Error('expected commit SHA must be a full 40-character SHA');

const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${encodeURIComponent(project)}/deployments/${encodeURIComponent(deploymentId)}/rollback`;
const response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    accept: 'application/json',
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'user-agent': 'Lythaus-component-scoped-rollback',
  },
});
const payload = await response.json().catch(() => ({}));
if (!response.ok || payload?.success !== true) {
  const error = Array.isArray(payload?.errors) ? payload.errors[0] : null;
  const code = error?.code == null ? 'unknown' : String(error.code).replace(/[^0-9A-Za-z_-]/g, '');
  const message = error?.message == null ? 'unknown' : String(error.message).replace(/[^A-Za-z0-9 ._:/-]/g, '').slice(0, 240);
  throw new Error(`Pages rollback failed with HTTP ${response.status}, code=${code}, message=${message}`);
}

const evidence = {
  schemaVersion: 1,
  status: 'ROLLED_BACK',
  project,
  deploymentId,
  restoredCommitSha: expectedCommitSha.toLowerCase(),
  completedAt: new Date().toISOString(),
};
fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(evidence));
