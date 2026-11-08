#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { mergeWorkerVersionMetadata } from './merge-worker-version-metadata.mjs';
import { parseProductionDeploymentState, WORKER_VERSION_ID } from './resolve-production-version-state.mjs';
import { verifyHyperdriveTargets } from './verify-cloudflare-hyperdrive-targets.mjs';

const root = process.cwd();
const workerSpecs = [
  { key: 'public', name: 'lythaus-public-api-development' },
  { key: 'admin', name: 'lythaus-admin-api-development' },
];
const requiredBindings = [
  { worker: 'lythaus-public-api-development', binding: 'DB_APP_FRESH', roleClass: 'lythaus_runtime' },
  { worker: 'lythaus-admin-api-development', binding: 'DB_ADMIN_FRESH', roleClass: 'lythaus_admin' },
  { worker: 'lythaus-admin-api-development', binding: 'DB_PRIVACY_FRESH', roleClass: 'lythaus_privacy' },
];

function parseJson(value) {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

function percentage(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return Number.NaN;
}

function activeVersion(deploymentValue) {
  const deployment = parseJson(deploymentValue);
  if (!Array.isArray(deployment?.versions)) throw new Error('invalid deployment state');
  const active = deployment.versions.filter((item) => percentage(item?.percentage) > 0);
  if (active.length !== 1 || Math.abs(percentage(active[0]?.percentage) - 100) > 0.001) {
    throw new Error('ambiguous serving state');
  }
  if (!WORKER_VERSION_ID.test(active[0]?.version_id ?? '')) throw new Error('invalid serving version');
  return { versionId: active[0].version_id, percentage: 100 };
}

function operatingSystemEnvironment(environment) {
  return Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'CI']
    .filter((key) => typeof environment[key] === 'string')
    .map((key) => [key, environment[key]]));
}

function defaultRunWrangler(args, environment) {
  const result = execFileSync('npx', ['--yes', 'wrangler@4.123.0', ...args], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...operatingSystemEnvironment(environment),
      CLOUDFLARE_API_TOKEN: environment.CLOUDFLARE_API_TOKEN,
      CLOUDFLARE_ACCOUNT_ID: environment.CLOUDFLARE_ACCOUNT_ID,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  return JSON.parse(result);
}

function defaultIsMainAncestor(sourceSha) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', sourceSha, 'HEAD'], {
      cwd: root,
      stdio: 'ignore',
      timeout: 10_000,
    });
    return true;
  } catch {
    return false;
  }
}

async function readDeployment(workerName, runWrangler, environment) {
  return parseJson(await runWrangler([
    'deployments', 'status', '--name', workerName, '--json',
  ], environment));
}

async function discoverServingVersion(workerName, { runWrangler, isMainAncestor, environment }) {
  const deployment = await readDeployment(workerName, runWrangler, environment);
  const serving = activeVersion(deployment);
  const listedVersions = parseJson(await runWrangler([
    'versions', 'list', '--name', workerName, '--json',
  ], environment));
  const exactVersion = parseJson(await runWrangler([
    'versions', 'view', serving.versionId, '--name', workerName, '--json',
  ], environment));
  const metadata = mergeWorkerVersionMetadata(listedVersions, exactVersion);
  const state = parseProductionDeploymentState(deployment, metadata);
  if (state.serving.length !== 1 || state.serving[0].percentage !== 100
    || state.serving[0].versionId !== serving.versionId
    || !isMainAncestor(state.serving[0].sourceSha)) {
    throw new Error('serving version provenance check failed');
  }
  return Object.freeze({
    workerName,
    versionId: state.serving[0].versionId,
    sourceSha: state.serving[0].sourceSha,
    percentage: 100,
  });
}

function requiredHyperdriveIds() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'infrastructure/cloudflare/native-hyperdrive-production.json'), 'utf8'));
  const ids = new Set();
  for (const { worker, binding, roleClass } of requiredBindings) {
    const matches = manifest.bindings.filter((entry) => entry.worker === worker && entry.binding === binding);
    if (matches.length !== 1 || matches[0].targetBranch !== 'main' || matches[0].expectedRoleKey !== roleClass) {
      throw new Error('reviewed target manifest mismatch');
    }
    ids.add(matches[0].hyperdriveId);
  }
  return [...ids].join(',');
}

function validateEnvironment(environment) {
  const required = [
    'CLOUDFLARE_API_TOKEN', 'PLANETSCALE_SCHEMA_READ_DATABASE_URL', 'PSCALE_ROLE_IDENTIFIERS',
    'DATABASE_READINESS_TOKEN', 'CF_ACCESS_CLIENT_ID', 'CF_ACCESS_CLIENT_SECRET',
    'EXPECTED_DATABASE_SCHEMA_FINGERPRINT', 'EXPECTED_DATABASE_RELATION_COUNT',
    'EXPECTED_DATABASE_SCHEMA_VERSION', 'GITHUB_SHA',
  ];
  if (required.some((key) => typeof environment[key] !== 'string' || environment[key].length === 0)) return false;
  if (!/^[0-9a-f]{32}$/i.test(environment.CLOUDFLARE_ACCOUNT_ID ?? '')) return false;
  if (environment.PSCALE_BRANCH_NAME !== 'main'
    || environment.GITHUB_REF !== 'refs/heads/main'
    || environment.REF_PROTECTED !== 'true'
    || !/^[0-9a-f]{40}$/.test(environment.GITHUB_SHA)
    || !/^[0-9a-f]{64}$/.test(environment.EXPECTED_DATABASE_SCHEMA_FINGERPRINT)
    || !/^[1-9][0-9]*$/.test(environment.EXPECTED_DATABASE_RELATION_COUNT)) return false;
  try {
    const roleIdentifiers = JSON.parse(environment.PSCALE_ROLE_IDENTIFIERS);
    return ['lythaus_runtime', 'lythaus_admin', 'lythaus_privacy']
      .every((key) => /^pscale_api_[a-z0-9]+$/.test(roleIdentifiers[key] ?? ''));
  } catch {
    return false;
  }
}

function probeEnvironment(environment, scope, servingVersions) {
  const worker = servingVersions[scope];
  const child = {
    ...operatingSystemEnvironment(environment),
    DATABASE_READINESS_TOKEN: environment.DATABASE_READINESS_TOKEN,
    PRODUCTION_WORKER_SCOPE: worker.workerName,
    PRODUCTION_WORKER_VERSION_ID: worker.versionId,
    RELEASE_SHA: worker.sourceSha,
    EXPECTED_WORKER_SOURCE_SHA: worker.sourceSha,
    EXPECTED_DATABASE_SCHEMA_FINGERPRINT: environment.EXPECTED_DATABASE_SCHEMA_FINGERPRINT,
    EXPECTED_DATABASE_RELATION_COUNT: environment.EXPECTED_DATABASE_RELATION_COUNT,
    EXPECTED_DATABASE_SCHEMA_VERSION: environment.EXPECTED_DATABASE_SCHEMA_VERSION,
    EXPECTED_DATABASE_TARGET: 'main',
    EXPECTED_DATABASE_ROLE_CLASS: 'login_non_superuser',
    REQUIRE_BUDGET_MIGRATION: 'true',
    AUTHENTICATED_ACCEPTANCE_PROVEN: 'false',
    HYPERDRIVE_VERIFIED_MAIN: 'true',
    PRODUCTION_PUBLIC_API_BASE_URL: 'https://api.lythaus.co',
    PRODUCTION_ADMIN_API_BASE_URL: 'https://admin-api.lythaus.co',
  };
  if (scope === 'admin') {
    child.PUBLIC_WORKER_VERSION_ID = servingVersions.public.versionId;
    child.CF_ACCESS_CLIENT_ID = environment.CF_ACCESS_CLIENT_ID;
    child.CF_ACCESS_CLIENT_SECRET = environment.CF_ACCESS_CLIENT_SECRET;
  }
  return child;
}

function defaultRunProbe(environment) {
  delete environment.PRODUCTION_WORKER_EVIDENCE_PATH;
  delete environment.PRODUCTION_WORKER_PREVIOUS_DEPLOYMENT_PATH;
  delete environment.PRODUCTION_WORKER_PREVIOUS_VERSIONS_PATH;
  delete environment.PRODUCTION_WORKER_PREVIOUS_PUBLIC_DEPLOYMENT_PATH;
  delete environment.PRODUCTION_WORKER_PREVIOUS_PUBLIC_VERSIONS_PATH;
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/ci/probe-production-workers.mjs')], {
    cwd: root,
    env: environment,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 90_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  return result.error === undefined && result.status === 0;
}

function sameServingAssignment(before, after) {
  return workerSpecs.every(({ key }) => before[key].versionId === after[key].versionId
    && before[key].percentage === after[key].percentage);
}

async function readServingIds({ runWrangler, environment }) {
  const current = {};
  for (const spec of workerSpecs) {
    current[spec.key] = activeVersion(await readDeployment(spec.name, runWrangler, environment));
  }
  return current;
}

export async function performAdminRuntimePreflight({
  environment = process.env,
  fetchImpl = fetch,
  runWrangler = defaultRunWrangler,
  isMainAncestor = defaultIsMainAncestor,
  verifyTargets = verifyHyperdriveTargets,
  runProbe = defaultRunProbe,
} = {}) {
  try {
    if (!validateEnvironment(environment)) return false;

    const targetProof = await verifyTargets({
      environment: { ...environment, HYPERDRIVE_VERIFY_IDS: requiredHyperdriveIds() },
      fetchImpl,
      readOnlyGetOnly: true,
    });
    if (targetProof?.status !== 'pass' || targetProof?.targetBranch !== 'main'
      || !requiredBindings.every(({ worker, binding, roleClass }) => targetProof.bindings?.some((entry) => (
        entry.worker === worker && entry.binding === binding && entry.roleMatches === true
          && entry.roleClass === roleClass && entry.runtimeRoleMatches !== false
          && entry.cacheDisabled === true && entry.tlsMode === 'verify-full' && entry.caCertificatePresent === true
      )))) return false;

    const servingVersions = {};
    for (const spec of workerSpecs) {
      servingVersions[spec.key] = await discoverServingVersion(spec.name, { runWrangler, isMainAncestor, environment });
    }
    const beforeProbe = Object.fromEntries(workerSpecs.map(({ key }) => [key, servingVersions[key]]));

    for (const scope of ['public', 'admin']) {
      if (!await runProbe(probeEnvironment(environment, scope, servingVersions))) return false;
    }

    const afterProbeIds = await readServingIds({ runWrangler, environment });
    const afterProbe = Object.fromEntries(workerSpecs.map(({ key }) => [key, {
      ...servingVersions[key],
      versionId: afterProbeIds[key].versionId,
      percentage: afterProbeIds[key].percentage,
    }]));
    return sameServingAssignment(beforeProbe, afterProbe);
  } catch {
    return false;
  }
}

export async function runPassFailPreflight({
  writeLine = (value) => process.stdout.write(`${value}\n`),
  ...options
} = {}) {
  const passed = await performAdminRuntimePreflight(options);
  writeLine(passed ? 'PASS' : 'FAIL');
  return passed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const passed = await runPassFailPreflight();
  process.exitCode = passed ? 0 : 1;
}
