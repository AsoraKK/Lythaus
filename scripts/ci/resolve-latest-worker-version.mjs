#!/usr/bin/env node

import fs from 'node:fs';

const [inputPath, expectedTag, variablePrefix] = process.argv.slice(2);
const githubEnv = process.env.GITHUB_ENV ?? '';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

if (!inputPath || !/^[0-9a-f]{40}$/.test(expectedTag ?? '') || !/^[A-Z][A-Z0-9_]*$/.test(variablePrefix ?? '')) {
  throw new Error('usage: resolve-latest-worker-version.mjs <versions.json> <release-sha> <VARIABLE_PREFIX>');
}
if (!githubEnv) throw new Error('GITHUB_ENV is required');

const versions = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
if (!Array.isArray(versions)) throw new Error('Worker version list must be an array');
const matches = versions.filter((version) => version?.annotations?.['workers/tag'] === expectedTag);
if (matches.length === 0) throw new Error(`no Worker version is tagged ${expectedTag}`);
const latest = [...matches].sort((left, right) => {
  const leftTime = Date.parse(left?.created_on ?? left?.createdAt ?? left?.created_at ?? '');
  const rightTime = Date.parse(right?.created_on ?? right?.createdAt ?? right?.created_at ?? '');
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return 0;
  return rightTime - leftTime;
})[0];
if (!uuid.test(latest?.id ?? '')) throw new Error('latest tagged Worker version has an invalid ID');
fs.appendFileSync(githubEnv, `${variablePrefix}_WORKER_VERSION_ID=${latest.id}\n`, 'utf8');
console.log(JSON.stringify({ status: 'pass', variablePrefix, versionId: latest.id, releaseSha: expectedTag, matchingVersions: matches.length }));
