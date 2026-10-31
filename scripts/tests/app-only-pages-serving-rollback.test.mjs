import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { rollbackAppOnlyPagesDeployment } from '../ci/rollback-app-only-pages-deployment.mjs';
import { createAppPagesPriorReleaseBinding, validateAppPagesServingProof } from '../release/app-pages-serving-proof.mjs';

const accountId = 'e5b7ae46e04698f507b7e4b3d4ef1af0';
const token = 'synthetic-token';
const projectId = '99999999-9999-4999-8999-999999999999';
const id = digit => `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;
const sha = digit => digit.repeat(40);
const snapshot = (digit) => ({ project: 'lythaus-web', projectId, branch: 'main', deploymentId: id(digit),
  commitSha: sha(digit), deploymentUrl: `https://${digit.repeat(8)}.lythaus-web.pages.dev` });
const before = snapshot('1'), candidate = snapshot('2');
const digest = `sha256:${'c'.repeat(64)}`;
const providerDeployment = value => ({ id: value.deploymentId, project_id: value.projectId, project_name: value.project,
  environment: 'production', is_skipped: false, latest_stage: { name: 'deploy', status: 'success' }, url: value.deploymentUrl,
  deployment_trigger: { metadata: { branch: value.branch, commit_hash: value.commitSha, commit_dirty: false } } });
const deploymentResponse = value => ({ success: true, result: providerDeployment(value) });
const projectResponse = value => ({ success: true, result: { id: value.projectId, name: value.project,
  production_branch: value.branch, canonical_deployment: providerDeployment(value) } });

function prepared(directory) {
  const priorManifest = { schemaVersion: 'lythaus-release-manifest-v2', releaseSha: before.commitSha,
    status: 'GO', productionStatus: 'GO', state: 'VERIFIED', capturedAt: '2026-10-31T12:00:00.000Z',
    repository: { releaseSha: before.commitSha }, surfaces: { web: { ...before, deployedSha: before.commitSha, status: 'ACTIVATED' } } };
  const priorRelease = createAppPagesPriorReleaseBinding({ prior: { manifest: priorManifest, previousRunId: '789',
    artifactId: 321, archiveDigest: digest }, previousSha: before.commitSha, previousRunId: '789', appPage: before });
  const rawProof = { schemaVersion: 'lythaus-app-pages-serving-proof-v1',
    proofId: '55555555-5555-4555-8555-555555555555', source: 'cloudflare-dashboard-production-panel',
    sourceUrl: `https://dash.cloudflare.com/${accountId}/pages/view/lythaus-web/${before.deploymentId}`,
    observedAt: '2026-10-31T12:10:00.000Z', capturedBy: 'tester', accountId, hostname: 'app.lythaus.co',
    project: 'lythaus-web', projectId, branch: 'main', deploymentId: before.deploymentId,
    deploymentUrl: before.deploymentUrl, commitSha: before.commitSha, environment: 'production', status: 'success',
    releaseSha: candidate.commitSha, previousProductionSha: before.commitSha, previousProductionRunId: '789',
    previousManifestArtifactId: '321', previousManifestDigest: digest };
  const servingProof = validateAppPagesServingProof({ proof: rawProof, snapshot: before, priorRelease,
    releaseSha: candidate.commitSha, previousSha: before.commitSha, previousRunId: '789', actor: 'tester',
    now: Date.parse('2026-10-31T12:15:00.000Z') });
  const preparation = { schemaVersion: 'lythaus-app-only-preparation-v1', releaseSha: candidate.commitSha,
    runId: '12345', runAttempt: '1', previousProductionSha: before.commitSha, previousRunId: '789',
    artifact: { ciRunId: '456' }, appPage: before, priorRelease, servingProof };
  const eventPath = path.join(directory, 'event.json');
  writeFileSync(eventPath, JSON.stringify({ inputs: { release_mode: 'app_only', release_sha: candidate.commitSha,
    previous_production_sha: before.commitSha, ci_run_id: '456', confirm_production: 'true',
    release_resume_context_json: JSON.stringify({ app_pages_serving_proof_json: JSON.stringify(rawProof) }) } }));
  const env = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'AsoraKK/Lythaus', GITHUB_REF: 'refs/heads/main',
    GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_EVENT_PATH: eventPath, GITHUB_REF_PROTECTED: 'true',
    GITHUB_ACTOR: 'tester', GITHUB_RUN_ID: '12345', GITHUB_RUN_ATTEMPT: '1', RUNNER_TEMP: directory,
    APP_ONLY_CANONICAL: 'true', RELEASE_MODE: 'app_only', RELEASE_SHA: candidate.commitSha, CI_RUN_ID: '456',
    PREVIOUS_PRODUCTION_SHA: before.commitSha, PREVIOUS_PRODUCTION_RUN_ID: '789', CLOUDFLARE_ACCOUNT_ID: accountId,
    CLOUDFLARE_API_TOKEN: token, APP_ONLY_DEPLOYMENT_STATUS: 'success', APP_ONLY_DEPLOYMENT_PROJECT: candidate.project,
    APP_ONLY_DEPLOYMENT_BRANCH: candidate.branch, APP_ONLY_DEPLOYMENT_SHA: candidate.commitSha,
    APP_ONLY_DEPLOYMENT_ID: candidate.deploymentId, APP_ONLY_DEPLOYMENT_URL: candidate.deploymentUrl,
    APP_ONLY_PREPARATION_JSON: JSON.stringify(preparation) };
  return { preparation, env };
}

test('app-only rollback validates the protected proof before mutation and after exact baseline readback', async t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'app-only-pages-rollback-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const { preparation, env } = prepared(directory);
  const rows = [deploymentResponse(before), projectResponse(candidate), deploymentResponse(before), projectResponse(before)];
  const calls = [];
  const result = await rollbackAppOnlyPagesDeployment({ env, preparation, accountId, token, before, candidate,
    fetchImpl: async (url, options) => {
      calls.push({ url, method: options.method ?? 'GET' });
      const payload = rows.shift();
      return { ok: true, redirected: false, json: async () => payload };
    }, delay: async () => {} });
  assert.equal(result.status, 'ROLLED_BACK');
  assert.equal(result.servingProofDigest, preparation.servingProof.proofDigest);
  assert.deepEqual(calls.map(call => call.method), ['GET', 'GET', 'POST', 'GET']);
});

test('app-only rollback rejects replayed preparation and mismatched readback without claiming success', async t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'app-only-pages-rollback-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const { preparation, env } = prepared(directory);
  let providerCalls = 0;
  await assert.rejects(() => rollbackAppOnlyPagesDeployment({ env: { ...env, GITHUB_RUN_ATTEMPT: '2' },
    preparation, accountId, token, before, candidate, fetchImpl: async () => { providerCalls++; } }), /preparation provenance differs/);
  assert.equal(providerCalls, 0);

  const badReadback = projectResponse({ ...before, deploymentId: '33333333-3333-4333-8333-333333333333' });
  const responses = [deploymentResponse(before), projectResponse(candidate), deploymentResponse(before), badReadback];
  let writes = 0;
  await assert.rejects(() => rollbackAppOnlyPagesDeployment({ env, preparation, accountId, token, before, candidate,
    fetchImpl: async (_url, options) => {
      if (options.method === 'POST') writes++;
      return { ok: true, redirected: false, json: async () => responses.shift() };
    }, delay: async () => {} }), /outcome is uncertain/);
  assert.equal(writes, 1);
});
