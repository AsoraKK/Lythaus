import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appOnlyServingProofContextFromEnvironment, verifyPagesDeployment } from '../cloudflare/verify-pages-deployment.mjs';
import { createAppPagesPriorReleaseBinding, validateAppPagesServingProof } from '../release/app-pages-serving-proof.mjs';

const accountId = 'e5b7ae46e04698f507b7e4b3d4ef1af0';
const previousSha = 'a'.repeat(40), releaseSha = 'b'.repeat(40), previousRunId = '789';
const projectId = '99999999-9999-4999-8999-999999999999';
const baselineDeploymentId = '11111111-1111-4111-8111-111111111111';
const proofId = '22222222-2222-4222-8222-222222222222';
const baseline = Object.freeze({ project: 'lythaus-web', projectId, branch: 'main', deploymentId: baselineDeploymentId,
  commitSha: previousSha, deploymentUrl: 'https://11111111.lythaus-web.pages.dev' });
const manifestDigest = `sha256:${'c'.repeat(64)}`;

function appOnlyFixture() {
  const manifest = { schemaVersion: 'lythaus-release-manifest-v2', releaseSha: previousSha, status: 'GO',
    productionStatus: 'GO', state: 'VERIFIED', capturedAt: '2026-10-31T12:00:00.000Z',
    repository: { releaseSha: previousSha }, surfaces: { web: { project: baseline.project, branch: baseline.branch,
      deploymentId: baseline.deploymentId, deploymentUrl: baseline.deploymentUrl,
      deployedSha: baseline.commitSha, status: 'ACTIVATED' } } };
  const priorRelease = createAppPagesPriorReleaseBinding({
    prior: { manifest, previousRunId, artifactId: 321, archiveDigest: manifestDigest },
    previousSha, previousRunId, appPage: baseline,
  });
  const proof = { schemaVersion: 'lythaus-app-pages-serving-proof-v1', proofId,
    source: 'cloudflare-dashboard-production-panel',
    sourceUrl: `https://dash.cloudflare.com/${accountId}/pages/view/lythaus-web/${baselineDeploymentId}`,
    observedAt: '2026-10-31T12:10:00.000Z', capturedBy: 'kyle', accountId,
    hostname: 'app.lythaus.co', project: 'lythaus-web', projectId, branch: 'main',
    deploymentId: baselineDeploymentId, deploymentUrl: baseline.deploymentUrl, commitSha: previousSha,
    environment: 'production', status: 'success', releaseSha, previousProductionSha: previousSha,
    previousProductionRunId: previousRunId, previousManifestArtifactId: '321', previousManifestDigest: manifestDigest };
  const receipt = validateAppPagesServingProof({ proof, snapshot: baseline, priorRelease, releaseSha,
    previousSha, previousRunId, actor: 'kyle', now: Date.parse('2026-10-31T12:15:00.000Z') });
  const preparation = { schemaVersion: 'lythaus-app-only-preparation-v1', releaseSha, runId: '12345', runAttempt: '1',
    previousProductionSha: previousSha, previousRunId, appPage: baseline, priorRelease, servingProof: receipt };
  return { proof, preparation, context: { schemaVersion: 'lythaus-app-only-pages-serving-proof-context-v1',
    servingProof: receipt, baselineSnapshot: baseline, priorRelease, releaseSha,
    previousProductionSha: previousSha, previousRunId, actor: 'kyle' } };
}

function response(payload) {
  return { ok: true, redirected: false, json: async () => payload };
}

function deployment(environment) {
  return { id: '11111111-1111-4111-8111-111111111112', environment,
    url: 'https://11111112.lythaus-web.pages.dev',
    deployment_trigger: { metadata: { commit_hash: releaseSha, branch: 'main' } } };
}

test('existing production and preview routes keep the main deployment-inventory request', async () => {
  for (const environment of ['production', 'preview']) {
    let call;
    const result = await verifyPagesDeployment({ accountId, token: 'synthetic', project: 'lythaus-web', branch: 'main',
      releaseSha, expectedUrl: 'unused-on-main-route', environment,
      fetchImpl: async (url, options) => { call = { url, options }; return response({ success: true, result: [deployment(environment)] }); } });
    assert.equal(call.url, `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/lythaus-web/deployments?per_page=25`);
    assert.deepEqual(call.options.headers, { Authorization: 'Bearer synthetic', 'content-type': 'application/json' });
    assert.equal(result.deploymentId, deployment(environment).id);
    assert.equal(result.environment, environment);
  }
});

test('app-only dispatch context fails closed without changing non-app-only dispatch handling', (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'pages-verification-context-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const eventPath = path.join(directory, 'event.json');
  const { proof, preparation, context } = appOnlyFixture();
  writeFileSync(eventPath, JSON.stringify({ inputs: { release_mode: 'app_only', release_sha: releaseSha,
    previous_production_sha: previousSha, release_resume_context_json: JSON.stringify({ app_pages_serving_proof_json: JSON.stringify(proof) }) } }));
  const env = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'AsoraKK/Lythaus', GITHUB_REF: 'refs/heads/main',
    GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_EVENT_PATH: eventPath, GITHUB_REF_PROTECTED: 'true',
    GITHUB_WORKFLOW_REF: 'AsoraKK/Lythaus/.github/workflows/production-release.yml@refs/heads/main',
    GITHUB_ACTOR: 'kyle', GITHUB_RUN_ID: '12345', GITHUB_RUN_ATTEMPT: '1',
    APP_ONLY_CANONICAL: 'true', RELEASE_MODE: 'app_only', PAGES_ENVIRONMENT: 'production',
    PAGES_PROJECT: 'lythaus-web', PAGES_BRANCH: 'main', RELEASE_SHA: releaseSha,
    APP_ONLY_PREPARATION_JSON: JSON.stringify(preparation) };
  assert.equal(appOnlyServingProofContextFromEnvironment(env).servingProof.proofDigest, context.servingProof.proofDigest);
  assert.throws(() => appOnlyServingProofContextFromEnvironment({ ...env, PAGES_BRANCH: 'preview' }), /protected canonical release context/);
  assert.throws(() => appOnlyServingProofContextFromEnvironment({ ...env, RELEASE_MODE: 'automatic' }), /protected canonical release context/);
  assert.equal(appOnlyServingProofContextFromEnvironment({ APP_ONLY_CANONICAL: 'true', RELEASE_MODE: 'automatic',
    GITHUB_EVENT_PATH: path.join(directory, 'missing-event.json') }), undefined);
});

test('app-only production checks the authenticated canonical project record and proof receipt', async () => {
  const { context } = appOnlyFixture();
  const currentUrl = 'https://11111112.lythaus-web.pages.dev';
  let call;
  const result = await verifyPagesDeployment({ accountId, token: 'synthetic', project: 'lythaus-web', branch: 'main',
    releaseSha, expectedUrl: currentUrl, environment: 'production', appOnlyServingProofContext: context,
    fetchImpl: async (url, options) => {
      call = { url, options };
      return response({ success: true, result: { name: 'lythaus-web', id: projectId, production_branch: 'main',
        canonical_deployment: { id: '33333333-3333-4333-8333-333333333333', project_id: projectId,
          project_name: 'lythaus-web', environment: 'production', is_skipped: false,
          latest_stage: { name: 'deploy', status: 'success' },
          deployment_trigger: { metadata: { branch: 'main', commit_dirty: false, commit_hash: releaseSha } }, url: currentUrl } } });
    } });
  assert.equal(call.url, `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/lythaus-web`);
  assert.equal(call.options.redirect, 'error');
  assert.equal(result.commitSha, releaseSha);
  assert.equal(result.deploymentUrl, currentUrl);
});
