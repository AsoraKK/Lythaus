import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mergeWorkerVersionMetadata } from '../ci/merge-worker-version-metadata.mjs';
import { parseProductionDeploymentState } from '../ci/resolve-production-version-state.mjs';
import { performAdminRuntimePreflight, runPassFailPreflight } from '../ci/admin-runtime-target-pass-fail.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const versionIds = {
  public: '22222222-2222-4222-8222-222222222222',
  admin: '11111111-1111-4111-8111-111111111111',
  adminRace: '33333333-3333-4333-8333-333333333333',
};
const sourceShas = {
  public: 'b'.repeat(40),
  admin: 'a'.repeat(40),
};
const bindingTargets = [
  { worker: 'lythaus-public-api-development', binding: 'DB_APP_FRESH' },
  { worker: 'lythaus-admin-api-development', binding: 'DB_ADMIN_FRESH' },
  { worker: 'lythaus-admin-api-development', binding: 'DB_PRIVACY_FRESH' },
];

function syntheticEnvironment() {
  return {
    GITHUB_REF: 'refs/heads/main',
    REF_PROTECTED: 'true',
    GITHUB_SHA: 'c'.repeat(40),
    CLOUDFLARE_API_TOKEN: 'synthetic-cloudflare-token',
    CLOUDFLARE_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
    PLANETSCALE_SCHEMA_READ_DATABASE_URL: 'postgres://synthetic-user.branch123@main.psdb.cloud/postgres',
    PSCALE_ROLE_IDENTIFIERS: JSON.stringify({
      lythaus_runtime: 'pscale_api_runtime',
      lythaus_admin: 'pscale_api_admin',
      lythaus_privacy: 'pscale_api_privacy',
    }),
    PSCALE_BRANCH_NAME: 'main',
    DATABASE_READINESS_TOKEN: 'synthetic-readiness-token',
    CF_ACCESS_CLIENT_ID: 'synthetic-access-client-id',
    CF_ACCESS_CLIENT_SECRET: 'synthetic-access-client-secret',
    EXPECTED_DATABASE_SCHEMA_FINGERPRINT: 'd'.repeat(64),
    EXPECTED_DATABASE_RELATION_COUNT: '3',
    EXPECTED_DATABASE_SCHEMA_VERSION: '0021_media_quarantine_cleanup.sql',
  };
}

function deployment(id, percentage = 100) {
  return { versions: [{ version_id: id, percentage }] };
}

function versionMetadata(id, sha) {
  return [{ id, annotations: { 'workers/tag': sha }, created_on: '2026-11-01T12:00:00.000Z' }];
}

function targetProof() {
  return {
    status: 'pass',
    targetBranch: 'main',
    bindings: bindingTargets.map((binding, index) => ({
      ...binding,
      roleClass: ['lythaus_runtime', 'lythaus_admin', 'lythaus_privacy'][index],
      roleMatches: true,
      runtimeRoleMatches: true,
      cacheDisabled: true,
      tlsMode: 'verify-full',
      caCertificatePresent: true,
    })),
  };
}

function hyperdriveResponseFetcher(manifest, wrongRoleFor = null) {
  const roleIdentifiers = {
    lythaus_runtime: 'pscale_api_runtime',
    lythaus_admin: 'pscale_api_admin',
    lythaus_privacy: 'pscale_api_privacy',
  };
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), method: options?.method });
    const id = new URL(url).pathname.split('/').at(-1);
    const entry = manifest.bindings.find((candidate) => candidate.hyperdriveId === id);
    assert.ok(entry);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        result: {
          id,
          name: entry.expectedConfigName,
          origin: {
            scheme: 'postgres',
            host: 'synthetic.invalid.psdb.cloud',
            port: 5432,
            database: 'fixturedb',
            user: `${entry.binding === wrongRoleFor ? 'pscale_api_unexpected' : roleIdentifiers[entry.expectedRoleKey]}.branch123`,
          },
          caching: { disabled: true },
          mtls: { sslmode: 'verify-full', ca_certificate_id: 'synthetic-ca-id' },
        },
      }),
    };
  };
  return { fetchImpl, calls };
}

function syntheticDependencies({ race = false, targetFailure = false, probeFailure = false } = {}) {
  const statusCounts = new Map();
  const probeEnvironments = [];
  const verifierCalls = [];
  const ancestryChecks = [];
  const runWrangler = async (args) => {
    const workerName = args[args.indexOf('--name') + 1];
    if (args[0] === 'deployments') {
      const count = (statusCounts.get(workerName) ?? 0) + 1;
      statusCounts.set(workerName, count);
      const isAdmin = workerName === 'lythaus-admin-api-development';
      const versionId = isAdmin
        ? (race && count > 1 ? versionIds.adminRace : versionIds.admin)
        : versionIds.public;
      return deployment(versionId);
    }
    if (args[0] === 'versions' && args[1] === 'list') {
      return versionMetadata(workerName.includes('admin') ? versionIds.admin : versionIds.public,
        workerName.includes('admin') ? sourceShas.admin : sourceShas.public);
    }
    if (args[0] === 'versions' && args[1] === 'view') {
      const isAdmin = workerName.includes('admin');
      return versionMetadata(args[2], isAdmin ? sourceShas.admin : sourceShas.public)[0];
    }
    throw new Error('unexpected synthetic Wrangler command');
  };
  const verifyTargets = async (options) => {
    verifierCalls.push(options);
    if (targetFailure) throw new Error('synthetic sensitive target detail');
    return targetProof();
  };
  const runProbe = async (environment) => {
    probeEnvironments.push(environment);
    return !probeFailure;
  };
  return {
    runWrangler,
    verifyTargets,
    runProbe,
    probeEnvironments,
    verifierCalls,
    statusCounts,
    ancestryChecks,
    isMainAncestor: (sha) => { ancestryChecks.push(sha); return true; },
  };
}

test('target parser maps exact active version to its source SHA', () => {
  const id = versionIds.admin;
  const merged = mergeWorkerVersionMetadata(versionMetadata(id, sourceShas.admin));
  const parsed = parseProductionDeploymentState(deployment(id), merged);
  assert.deepEqual(parsed.serving.map(({ versionId, sourceSha, percentage }) => ({ versionId, sourceSha, percentage })), [
    { versionId: id, sourceSha: sourceShas.admin, percentage: 100 },
  ]);
});

test('real Hyperdrive verifier checks synthetic Admin runtime bindings with GET only', async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lythaus-hyperdrive-pass-fail-'));
  const oldCwd = process.cwd();
  const bindings = bindingTargets.map((binding, index) => ({
    ...binding,
    hyperdriveId: String(index + 1).repeat(32),
    expectedConfigName: `synthetic-config-${index}`,
    expectedRoleKey: ['lythaus_runtime', 'lythaus_admin', 'lythaus_privacy'][index],
    configPath: `apps/synthetic-${index}/wrangler.jsonc`,
    targetBranch: 'main',
  }));
  const origin = { scheme: 'postgres', host: 'synthetic.invalid.psdb.cloud', port: 5432, database: 'fixturedb' };
  const originFingerprint = crypto.createHash('sha256').update(JSON.stringify(origin)).digest('hex');
  const manifest = {
    accountId: '0123456789abcdef0123456789abcdef',
    productionTargetBranch: 'main',
    expectedMainOriginFingerprint: originFingerprint,
    bindings,
  };
  try {
    fs.mkdirSync(path.join(temporaryRoot, 'infrastructure/cloudflare'), { recursive: true });
    fs.writeFileSync(path.join(temporaryRoot, 'infrastructure/cloudflare/native-hyperdrive-production.json'), JSON.stringify(manifest));
    for (const binding of bindings) {
      const configPath = path.join(temporaryRoot, binding.configPath);
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify({ hyperdrive: [{ binding: binding.binding, id: binding.hyperdriveId }] }));
    }

    process.chdir(temporaryRoot);
    const verifierUrl = pathToFileURL(path.join(root, 'scripts/ci/verify-cloudflare-hyperdrive-targets.mjs'));
    verifierUrl.search = `?fixture=${crypto.randomUUID()}`;
    const { verifyHyperdriveTargets } = await import(verifierUrl.href);
    const environment = {
      ...syntheticEnvironment(),
      PLANETSCALE_SCHEMA_READ_DATABASE_URL: 'postgres://synthetic-user.branch123@synthetic.invalid.psdb.cloud/fixturedb',
      CLOUDFLARE_ACCOUNT_ID: manifest.accountId,
      HYPERDRIVE_VERIFY_IDS: bindings.map(({ hyperdriveId }) => hyperdriveId).join(','),
    };
    const { fetchImpl, calls } = hyperdriveResponseFetcher(manifest);
    const proof = await verifyHyperdriveTargets({ environment, fetchImpl, readOnlyGetOnly: true });
    assert.equal(proof.status, 'pass');
    assert.equal(proof.targetBranch, 'main');
    assert.equal(calls.length, 3);
    assert.ok(calls.every((call) => call.method === 'GET'));
    assert.equal(JSON.stringify(proof).includes('pscale_api_admin'), false);
    assert.equal(JSON.stringify(proof).includes('branch123'), false);

    const wrongRole = hyperdriveResponseFetcher(manifest, 'DB_ADMIN_FRESH');
    await assert.rejects(verifyHyperdriveTargets({ environment, fetchImpl: wrongRole.fetchImpl, readOnlyGetOnly: true }));
    assert.ok(wrongRole.calls.every((call) => call.method === 'GET'));
  } finally {
    process.chdir(oldCwd);
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('older reviewed serving sources pass when they are main ancestors, without matching today main SHA', async () => {
  const dependencies = syntheticDependencies();
  const environment = syntheticEnvironment();
  const passed = await performAdminRuntimePreflight({
    environment,
    ...dependencies,
  });
  assert.equal(passed, true);
  assert.notEqual(sourceShas.public, environment.GITHUB_SHA);
  assert.notEqual(sourceShas.admin, environment.GITHUB_SHA);
  assert.deepEqual(dependencies.ancestryChecks, [sourceShas.public, sourceShas.admin]);
  assert.equal(dependencies.verifierCalls.length, 1);
  assert.equal(dependencies.verifierCalls[0].readOnlyGetOnly, true);
  assert.equal(dependencies.verifierCalls[0].environment.PSCALE_BRANCH_NAME, 'main');
  assert.equal(dependencies.verifierCalls[0].environment.HYPERDRIVE_VERIFY_IDS.split(',').length, 3);
  assert.equal(dependencies.probeEnvironments.length, 2);
  assert.equal('CLOUDFLARE_API_TOKEN' in dependencies.probeEnvironments[0], false);
  assert.equal('CLOUDFLARE_API_TOKEN' in dependencies.probeEnvironments[1], false);
  assert.equal(dependencies.probeEnvironments[0].PRODUCTION_WORKER_VERSION_ID, versionIds.public);
  assert.equal(dependencies.probeEnvironments[0].RELEASE_SHA, sourceShas.public);
  assert.equal(dependencies.probeEnvironments[1].PRODUCTION_WORKER_VERSION_ID, versionIds.admin);
  assert.equal(dependencies.probeEnvironments[1].PUBLIC_WORKER_VERSION_ID, versionIds.public);
  assert.equal(dependencies.probeEnvironments[1].RELEASE_SHA, sourceShas.admin);
  assert.equal('PRODUCTION_WORKER_EVIDENCE_PATH' in dependencies.probeEnvironments[0], false);
  assert.equal('PRODUCTION_WORKER_EVIDENCE_PATH' in dependencies.probeEnvironments[1], false);

  const lines = [];
  const outputDependencies = syntheticDependencies();
  assert.equal(await runPassFailPreflight({
    environment: syntheticEnvironment(),
    ...outputDependencies,
    writeLine: (line) => lines.push(line),
  }), true);
  assert.deepEqual(lines, ['PASS']);
});

test('preflight fails closed on a serving-version race', async () => {
  const dependencies = syntheticDependencies({ race: true });
  const passed = await performAdminRuntimePreflight({
    environment: syntheticEnvironment(),
    ...dependencies,
  });
  assert.equal(passed, false);
});

test('preflight fails closed on split traffic or non-main source provenance', async () => {
  const split = syntheticDependencies();
  split.runWrangler = async (args) => {
    if (args[0] === 'deployments') return { versions: [
      { version_id: versionIds.admin, percentage: 60 },
      { version_id: versionIds.adminRace, percentage: 40 },
    ] };
    throw new Error('unexpected command after split traffic');
  };
  assert.equal(await performAdminRuntimePreflight({ environment: syntheticEnvironment(), ...split }), false);

  const unreviewed = syntheticDependencies();
  unreviewed.isMainAncestor = (sha) => sha === sourceShas.public;
  assert.equal(await performAdminRuntimePreflight({ environment: syntheticEnvironment(), ...unreviewed }), false);
});

test('target or runtime probe failure returns only a boolean', async () => {
  const targetFailure = syntheticDependencies({ targetFailure: true });
  assert.equal(await performAdminRuntimePreflight({ environment: syntheticEnvironment(), ...targetFailure }), false);
  assert.equal(targetFailure.probeEnvironments.length, 0);

  const probeFailure = syntheticDependencies({ probeFailure: true });
  assert.equal(await performAdminRuntimePreflight({ environment: syntheticEnvironment(), ...probeFailure }), false);
});

test('unprotected refs fail before provider or runtime calls', async () => {
  const dependencies = syntheticDependencies();
  const environment = { ...syntheticEnvironment(), REF_PROTECTED: 'false' };
  assert.equal(await performAdminRuntimePreflight({ environment, ...dependencies }), false);
  assert.equal(dependencies.verifierCalls.length, 0);
  assert.equal(dependencies.probeEnvironments.length, 0);
});

test('pass/fail interface never writes synthetic identifiers or failure details', async () => {
  const lines = [];
  const dependencies = syntheticDependencies({ targetFailure: true });
  const passed = await runPassFailPreflight({
    environment: syntheticEnvironment(),
    ...dependencies,
    writeLine: (line) => lines.push(line),
  });
  assert.equal(passed, false);
  assert.deepEqual(lines, ['FAIL']);
  assert.equal(JSON.stringify(lines).includes(versionIds.admin), false);
  assert.equal(JSON.stringify(lines).includes('synthetic sensitive target detail'), false);
});

test('workflow has no artifact or identifier output channel', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/admin-runtime-target-pass-fail.yml'), 'utf8');
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /github\.ref_protected/);
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/main' && github\.ref_protected/);
  assert.doesNotMatch(workflow, /upload-artifact|GITHUB_OUTPUT|GITHUB_ENV|tee|worker_version|source_sha/);
  const credentialStep = workflow.slice(workflow.indexOf('- name: Run ephemeral read-only comparison'));
  const setupSteps = workflow.slice(0, workflow.indexOf('- name: Run ephemeral read-only comparison'));
  assert.match(credentialStep, /secrets\.DATABASE_READINESS_TOKEN/);
  assert.match(credentialStep, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.doesNotMatch(credentialStep, /CLOUDFLARE_AUDIT_API_TOKEN/);
  assert.doesNotMatch(setupSteps, /secrets\./);
});
