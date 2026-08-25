#!/usr/bin/env node

import fs from 'node:fs';

const [mode, inputPath, expectedTag, variablePrefix] = process.argv.slice(2);
const githubEnv = process.env.GITHUB_ENV;

if (!['candidate', 'rollback'].includes(mode)) throw new Error('mode must be candidate or rollback');
if (!inputPath || !variablePrefix || !/^[A-Z][A-Z0-9_]*$/.test(variablePrefix)) {
  throw new Error('input path and uppercase variable prefix are required');
}
if (!githubEnv) throw new Error('GITHUB_ENV is required');

const source = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
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
    createdAt: Date.parse(version?.created_on ?? version?.createdAt ?? version?.created_at ?? ''),
  }));
  if (ranked.length > 1 && ranked.some(({ createdAt }) => !Number.isFinite(createdAt))) {
    throw new Error(`duplicate candidate Worker versions tagged ${expectedTag} lack comparable creation timestamps`);
  }
  ranked.sort((left, right) => right.createdAt - left.createdAt);
  if (ranked.length > 1 && ranked[0].createdAt === ranked[1].createdAt) {
    throw new Error(`duplicate candidate Worker versions tagged ${expectedTag} are ambiguous`);
  }

  const candidate = ranked[0].version;
  append(`${variablePrefix}_WORKER_VERSION_ID`, candidate.id);
  console.log(JSON.stringify({
    mode,
    variablePrefix,
    versionId: candidate.id,
    releaseSha: expectedTag,
    matchingVersions: matches.length,
  }));
} else {
  const versions = source?.versions;
  if (!Array.isArray(versions) || versions.length === 0) throw new Error('deployment state has no rollback versions');
  let total = 0;
  const specs = versions.map((version) => {
    const id = version?.version_id;
    const percentage = Number(version?.percentage);
    if (!uuid.test(id ?? '') || !Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
      throw new Error('deployment state contains an invalid rollback version');
    }
    total += percentage;
    return `${id}@${percentage}`;
  });
  if (Math.abs(total - 100) > 0.001) throw new Error(`rollback traffic totals ${total}, not 100`);
  append(`${variablePrefix}_ROLLBACK_SPECS`, specs.join(' '));
  console.log(JSON.stringify({ mode, variablePrefix, versionIds: versions.map((version) => version.version_id), trafficTotal: total }));
}
