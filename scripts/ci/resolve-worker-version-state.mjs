#!/usr/bin/env node

import fs from 'node:fs';

const [mode, inputPath, expectedTag, variablePrefix] = process.argv.slice(2);
const githubEnv = process.env.GITHUB_ENV;

if (!['candidate', 'upload', 'rollback'].includes(mode)) throw new Error('mode must be candidate, upload, or rollback');
if (!inputPath || !variablePrefix || !/^[A-Z][A-Z0-9_]*$/.test(variablePrefix)) {
  throw new Error('input path and uppercase variable prefix are required');
}
if (!githubEnv) throw new Error('GITHUB_ENV is required');

const sourceText = fs.readFileSync(inputPath, 'utf8');
const source = mode === 'upload' ? sourceText : JSON.parse(sourceText);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function append(name, value) {
  fs.appendFileSync(githubEnv, `${name}=${value}\n`, 'utf8');
}

if (mode === 'candidate') {
  if (!expectedTag || !/^[0-9a-f]{40}$/.test(expectedTag)) throw new Error('candidate tag must be the exact release SHA');
  if (!Array.isArray(source)) throw new Error('Worker version list must be an array');
  const matches = source.filter((version) => version?.annotations?.['workers/tag'] === expectedTag);
  if (matches.length === 0) {
    throw new Error(`no candidate Worker version tagged ${expectedTag}`);
  }
  if (matches.some((version) => !uuid.test(version?.id ?? ''))) {
    throw new Error(`candidate Worker version tagged ${expectedTag} has an invalid version id`);
  }

  const ranked = matches.map((version) => ({
    version,
    createdAt: Date.parse(
      version?.metadata?.created_on
        ?? version?.metadata?.createdAt
        ?? version?.metadata?.created_at
        ?? version?.created_on
        ?? version?.createdAt
        ?? version?.created_at
        ?? '',
    ),
  }));
  if (ranked.some(({ createdAt }) => !Number.isFinite(createdAt))) {
    throw new Error(`candidate Worker versions tagged ${expectedTag} lack valid creation timestamps`);
  }
  ranked.sort((left, right) => right.createdAt - left.createdAt);
  if (ranked.length > 1 && ranked[0].createdAt === ranked[1].createdAt) {
    throw new Error(`duplicate candidate Worker versions tagged ${expectedTag} are ambiguous`);
  }

  const candidate = ranked[0].version;
  const candidateCreatedAt = ranked[0].createdAt;
  append(`${variablePrefix}_WORKER_VERSION_ID`, candidate.id);
  append(`${variablePrefix}_WORKER_CREATED_AT`, new Date(candidateCreatedAt).toISOString());
  console.log(JSON.stringify({
    mode,
    variablePrefix,
    versionId: candidate.id,
    releaseSha: expectedTag,
    matchingVersions: matches.length,
  }));
} else if (mode === 'upload') {
  if (!expectedTag || !/^[0-9a-f]{40}$/.test(expectedTag)) throw new Error('upload tag must be the exact release SHA');
  const output = source.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
  const matches = [...output.matchAll(/Worker Version ID:\s*([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/gi)]
    .map((match) => match[1]);
  if (matches.length === 0) throw new Error(`Worker upload did not return a version id for ${expectedTag}`);
  if (matches.length > 1) throw new Error(`Worker upload returned multiple version ids for ${expectedTag}`);
  append(`${variablePrefix}_WORKER_VERSION_ID`, matches[0]);
  console.log(JSON.stringify({
    mode,
    variablePrefix,
    versionId: matches[0],
    releaseSha: expectedTag,
    matchingVersions: 1,
    source: 'upload_output',
  }));
} else {
  const versions = source?.versions;
  if (!Array.isArray(versions) || versions.length === 0) throw new Error('deployment state has no rollback versions');
  const seenIds = new Set();
  const validatedVersions = versions.map((version) => {
    const id = version?.version_id;
    const rawPercentage = version?.percentage;
    const percentage = typeof rawPercentage === 'number'
      ? rawPercentage
      : typeof rawPercentage === 'string' && rawPercentage.trim() !== ''
        ? Number(rawPercentage)
        : Number.NaN;
    if (!uuid.test(id ?? '') || !Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      throw new Error('deployment state contains an invalid rollback version');
    }
    if (seenIds.has(id.toLowerCase())) throw new Error('deployment state contains duplicate rollback version IDs');
    seenIds.add(id.toLowerCase());
    return { id, percentage };
  });

  const activeVersions = validatedVersions.filter((version) => version.percentage > 0);
  const zeroTrafficVersions = validatedVersions.filter((version) => version.percentage === 0);
  const activeTrafficTotal = activeVersions.reduce((total, version) => total + version.percentage, 0);
  if (activeVersions.length === 0) throw new Error('deployment state has no active rollback versions');
  if (Math.abs(activeTrafficTotal - 100) > 0.001) {
    throw new Error(`rollback traffic totals ${activeTrafficTotal}, not 100`);
  }

  const specs = activeVersions.map(({ id, percentage }) => `${id}@${percentage}`);
  append(`${variablePrefix}_ROLLBACK_SPECS`, specs.join(' '));
  console.log(JSON.stringify({
    mode,
    variablePrefix,
    activeVersionIds: activeVersions.map((version) => version.id),
    zeroTrafficVersionIds: zeroTrafficVersions.map((version) => version.id),
    zeroTrafficVersionCount: zeroTrafficVersions.length,
    trafficTotal: activeTrafficTotal,
  }));
}
