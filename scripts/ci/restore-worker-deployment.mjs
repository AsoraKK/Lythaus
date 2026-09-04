#!/usr/bin/env node

import fs from 'node:fs';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
const apiToken = process.env.CLOUDFLARE_API_TOKEN ?? '';
const workerName = process.env.PRODUCTION_WORKER_SCOPE ?? '';
const candidateVersionId = process.env.EXPECTED_CANDIDATE_VERSION_ID ?? '';
const rollbackSpecs = process.env.ROLLBACK_SPECS ?? '';
const currentDeploymentPath = process.env.CURRENT_DEPLOYMENT_PATH ?? '';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

if (!/^[0-9a-f]{32}$/.test(accountId)) throw new Error('CLOUDFLARE_ACCOUNT_ID is invalid');
if (!apiToken) throw new Error('CLOUDFLARE_API_TOKEN is required');
if (workerName !== 'lythaus-public-api-development') throw new Error('forced restore requires the canonical public Worker');
if (!uuid.test(candidateVersionId)) throw new Error('EXPECTED_CANDIDATE_VERSION_ID is invalid');
if (!currentDeploymentPath || !fs.existsSync(currentDeploymentPath)) throw new Error('CURRENT_DEPLOYMENT_PATH is required');

function parseRollbackSpecs(value) {
  const specs = value.trim().split(/\s+/).filter(Boolean);
  if (specs.length < 1 || specs.length > 2) throw new Error('ROLLBACK_SPECS must contain one or two versions');

  const versions = specs.map((spec) => {
    const match = spec.match(/^([0-9a-f-]{36})@([0-9]+(?:\.[0-9]+)?)$/i);
    if (!match || !uuid.test(match[1])) throw new Error('ROLLBACK_SPECS contains an invalid version specification');
    const percentage = Number(match[2]);
    if (!Number.isFinite(percentage) || percentage < 0.01 || percentage > 100) {
      throw new Error('ROLLBACK_SPECS contains an invalid traffic percentage');
    }
    return { version_id: match[1], percentage };
  });

  const ids = new Set(versions.map((version) => version.version_id));
  if (ids.size !== versions.length) throw new Error('ROLLBACK_SPECS contains duplicate version IDs');
  const total = versions.reduce((sum, version) => sum + version.percentage, 0);
  if (Math.abs(total - 100) > 0.001) throw new Error(`rollback traffic totals ${total}, not 100`);
  return versions;
}

function normalizeVersions(versions, { allowZero = false } = {}) {
  if (!Array.isArray(versions) || versions.length < 1 || versions.length > 2) {
    throw new Error('deployment state must contain one or two versions');
  }
  return versions.map((version) => {
    const versionId = version?.version_id;
    const percentage = Number(version?.percentage);
    const minimum = allowZero ? 0 : 0.01;
    if (!uuid.test(versionId ?? '') || !Number.isFinite(percentage) || percentage < minimum || percentage > 100) {
      throw new Error('deployment state contains an invalid version');
    }
    return { version_id: versionId, percentage };
  });
}

function sameDeployment(left, right) {
  if (left.length !== right.length) return false;
  const sortVersions = (versions) => [...versions].sort((a, b) => a.version_id.localeCompare(b.version_id));
  const a = sortVersions(left);
  const b = sortVersions(right);
  return a.every((version, index) => version.version_id === b[index].version_id
    && Math.abs(version.percentage - b[index].percentage) <= 0.001);
}

const rollbackVersions = parseRollbackSpecs(rollbackSpecs);
const currentSource = JSON.parse(fs.readFileSync(currentDeploymentPath, 'utf8'));
const currentVersions = normalizeVersions(currentSource?.versions, { allowZero: true });
const rollbackIds = new Set(rollbackVersions.map((version) => version.version_id));
const allowedCurrentIds = new Set([...rollbackIds, candidateVersionId]);

if (sameDeployment(currentVersions, rollbackVersions)) {
  console.log(JSON.stringify({ status: 'already_restored', worker: workerName, versions: rollbackVersions }));
  process.exit(0);
}

if (!currentVersions.some((version) => version.version_id === candidateVersionId)) {
  throw new Error('refusing forced restore: the expected candidate is not present in the current deployment');
}
if (currentVersions.some((version) => !allowedCurrentIds.has(version.version_id))) {
  throw new Error('refusing forced restore: the current deployment contains an unexpected version');
}

const endpoint = new URL(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${encodeURIComponent(workerName)}/deployments`);
endpoint.searchParams.set('force', 'true');

const response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${apiToken}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    strategy: 'percentage',
    versions: rollbackVersions,
    annotations: {
      'workers/message': 'Restore exact pre-waitlist public Worker deployment',
    },
  }),
  signal: AbortSignal.timeout(20_000),
});
const payload = await response.json().catch(() => null);
if (!response.ok || payload?.success !== true) {
  const codes = Array.isArray(payload?.errors)
    ? payload.errors.map((error) => error?.code).filter((code) => code !== undefined)
    : [];
  throw new Error(`Cloudflare forced restore failed (HTTP ${response.status}; codes=${codes.join(',') || 'unknown'})`);
}

const restoredVersions = normalizeVersions(payload?.result?.versions);
if (!sameDeployment(restoredVersions, rollbackVersions)) {
  throw new Error('Cloudflare forced restore response did not match the captured predeployment state');
}

console.log(JSON.stringify({
  status: 'restored',
  worker: workerName,
  deploymentId: payload.result?.id ?? null,
  versions: restoredVersions,
}));
