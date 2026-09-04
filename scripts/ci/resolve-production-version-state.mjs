#!/usr/bin/env node

import fs from 'node:fs';

export const WORKER_VERSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sourceShaFromVersion(value) {
  const candidate = value?.source_sha
    ?? value?.sourceSha
    ?? value?.annotations?.['workers/tag']
    ?? value?.metadata?.annotations?.['workers/tag']
    ?? value?.metadata?.tag
    ?? null;
  return typeof candidate === 'string' && /^[0-9a-f]{40}$/i.test(candidate) ? candidate.toLowerCase() : null;
}

function createdAtFromVersion(value) {
  const candidate = value?.created_at
    ?? value?.createdAt
    ?? value?.created_on
    ?? value?.createdOn
    ?? value?.metadata?.created_at
    ?? value?.metadata?.createdAt
    ?? value?.metadata?.created_on
    ?? value?.metadata?.createdOn
    ?? null;
  return typeof candidate === 'string' && Number.isFinite(Date.parse(candidate))
    ? new Date(candidate).toISOString()
    : null;
}

function versionsById(value) {
  const payload = typeof value === 'string' ? JSON.parse(value) : value;
  const list = Array.isArray(payload) ? payload : Array.isArray(payload?.result) ? payload.result : [];
  return new Map(list.map((item) => [String(item?.id ?? item?.version_id ?? '').toLowerCase(), item]));
}

export function parseProductionDeploymentState(value, versionList = undefined) {
  const payload = typeof value === 'string' ? JSON.parse(value) : value;
  const metadata = versionList === undefined ? new Map() : versionsById(versionList);
  if (!Array.isArray(payload?.versions) || payload.versions.length < 1) throw new Error('deployment state has no versions');
  const seen = new Set();
  const versions = payload.versions.map((item) => {
    const id = item?.version_id;
    const rawPercentage = item?.percentage;
    const percentage = typeof rawPercentage === 'number'
      ? rawPercentage
      : typeof rawPercentage === 'string' && rawPercentage.trim() !== ''
        ? Number(rawPercentage)
        : Number.NaN;
    if (!WORKER_VERSION_ID.test(id ?? '') || !Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      throw new Error('deployment state contains an invalid version');
    }
    const key = id.toLowerCase();
    if (seen.has(key)) throw new Error('deployment state contains duplicate version IDs');
    seen.add(key);
    const sourceSha = sourceShaFromVersion(item) ?? sourceShaFromVersion(metadata.get(String(id).toLowerCase()));
    const createdAt = createdAtFromVersion(item) ?? createdAtFromVersion(metadata.get(String(id).toLowerCase()));
    return { versionId: id, percentage, sourceSha, createdAt };
  });
  const serving = versions.filter((item) => item.percentage > 0);
  if (serving.length === 0) throw new Error('deployment state has no positive serving traffic');
  if (serving.some((item) => item.sourceSha === null || item.createdAt === null)) {
    throw new Error('positive serving versions lack exact source or creation provenance');
  }
  const trafficTotal = serving.reduce((sum, item) => sum + item.percentage, 0);
  if (Math.abs(trafficTotal - 100) > 0.001) throw new Error(`serving traffic totals ${trafficTotal}, not 100`);
  return Object.freeze({
    versions: Object.freeze(versions),
    serving: Object.freeze(serving),
    zeroTraffic: Object.freeze(versions.filter((item) => item.percentage === 0)),
    trafficTotal,
    rollbackSpecs: serving.map((item) => `${item.versionId}@${item.percentage}`).join(' '),
    reusedVersionIds: serving.map((item) => item.versionId),
    reusedSourceShas: Object.freeze(serving.map((item) => item.sourceSha)),
    reusedCreatedAts: Object.freeze(serving.map((item) => item.createdAt)),
  });
}

function main() {
  const [inputPath, variablePrefix, versionsPath] = process.argv.slice(2);
  const githubEnv = process.env.GITHUB_ENV;
  if (!inputPath || !variablePrefix || !/^[A-Z][A-Z0-9_]*$/.test(variablePrefix)) throw new Error('input path and uppercase variable prefix are required');
  if (!githubEnv) throw new Error('GITHUB_ENV is required');
  const state = parseProductionDeploymentState(
    fs.readFileSync(inputPath, 'utf8'),
    versionsPath ? fs.readFileSync(versionsPath, 'utf8') : undefined,
  );
  fs.appendFileSync(githubEnv, `${variablePrefix}_REUSED_PRODUCTION_VERSION_IDS_JSON=${JSON.stringify(state.reusedVersionIds)}\n`, 'utf8');
  fs.appendFileSync(githubEnv, `${variablePrefix}_REUSED_PRODUCTION_VERSION_ID=${state.reusedVersionIds[0]}\n`, 'utf8');
  fs.appendFileSync(githubEnv, `${variablePrefix}_REUSED_PRODUCTION_SPECS=${state.rollbackSpecs}\n`, 'utf8');
  if (state.reusedSourceShas.length === 1) fs.appendFileSync(githubEnv, `${variablePrefix}_REUSED_PRODUCTION_SOURCE_SHA=${state.reusedSourceShas[0]}\n`, 'utf8');
  fs.appendFileSync(githubEnv, `${variablePrefix}_REUSED_PRODUCTION_SOURCE_SHAS_JSON=${JSON.stringify(state.reusedSourceShas)}\n`, 'utf8');
  if (state.reusedCreatedAts.length === 1) fs.appendFileSync(githubEnv, `${variablePrefix}_REUSED_PRODUCTION_CREATED_AT=${state.reusedCreatedAts[0]}\n`, 'utf8');
  fs.appendFileSync(githubEnv, `${variablePrefix}_REUSED_PRODUCTION_CREATED_ATS_JSON=${JSON.stringify(state.reusedCreatedAts)}\n`, 'utf8');
  console.log(JSON.stringify({ mode: 'production', variablePrefix, ...state }));
}

if (process.argv[1] && process.argv[1].endsWith('resolve-production-version-state.mjs')) main();
