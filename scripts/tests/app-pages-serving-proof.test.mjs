import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAppPagesPriorReleaseBinding, validateAppPagesServingProof,
  verifyAppPagesServingProofReceipt, assertAppPagesServingProofNotReplayed,
  writeAppPagesServingProofConsumption } from '../release/app-pages-serving-proof.mjs';
import { recheckAppOnlyServingProof } from '../ci/recheck-app-only-serving-proof.mjs';

const accountId = 'e5b7ae46e04698f507b7e4b3d4ef1af0';
const previousSha = 'a'.repeat(40), releaseSha = 'b'.repeat(40), previousRunId = '789';
const projectId = '99999999-9999-4999-8999-999999999999';
const deploymentId = '11111111-1111-4111-8111-111111111111';
const proofId = '22222222-2222-4222-8222-222222222222';
const now = Date.parse('2026-10-31T12:15:00.000Z');
const snapshot = Object.freeze({ project: 'lythaus-web', projectId, branch: 'main', deploymentId,
  commitSha: previousSha, deploymentUrl: 'https://11111111.lythaus-web.pages.dev' });
const manifestDigest = `sha256:${'c'.repeat(64)}`;

function prior() {
  const manifest = { schemaVersion: 'lythaus-release-manifest-v2', releaseSha: previousSha,
    status: 'GO', productionStatus: 'GO', state: 'VERIFIED', capturedAt: '2026-10-31T12:00:00.000Z',
    repository: { releaseSha: previousSha }, surfaces: { web: { project: snapshot.project, branch: snapshot.branch,
      deploymentId: snapshot.deploymentId, deploymentUrl: snapshot.deploymentUrl, deployedSha: snapshot.commitSha, status: 'ACTIVATED' } } };
  const source = { manifest, previousRunId, artifactId: 321, archiveDigest: manifestDigest };
  const binding = createAppPagesPriorReleaseBinding({ prior: source, previousSha, previousRunId, appPage: snapshot });
  return { source, binding };
}

function rawProof(overrides = {}) {
  const value = { schemaVersion: 'lythaus-app-pages-serving-proof-v1', proofId,
    source: 'cloudflare-dashboard-production-panel',
    sourceUrl: `https://dash.cloudflare.com/${accountId}/pages/view/lythaus-web/${deploymentId}`,
    observedAt: '2026-10-31T12:10:00.000Z', capturedBy: 'kyle', accountId,
    hostname: 'app.lythaus.co', project: 'lythaus-web', projectId, branch: 'main', deploymentId,
    deploymentUrl: snapshot.deploymentUrl, commitSha: previousSha, environment: 'production', status: 'success',
    releaseSha, previousProductionSha: previousSha, previousProductionRunId: previousRunId,
    previousManifestArtifactId: '321', previousManifestDigest: manifestDigest };
  return { ...value, ...overrides };
}

function validate(proof = rawProof(), snapshotValue = snapshot, binding = prior().binding, at = now) {
  return validateAppPagesServingProof({ proof, snapshot: snapshotValue, priorRelease: binding, releaseSha,
    previousSha, previousRunId, actor: 'kyle', now: at });
}

test('fresh dashboard evidence must match the protected API snapshot and verified prior manifest', () => {
  const receipt = validate();
  assert.equal(receipt.proofDigest.startsWith('sha256:'), true);
  assert.equal(receipt.verifiedAt, new Date(now).toISOString());
  assert.equal(verifyAppPagesServingProofReceipt({ receipt, snapshot, priorRelease: prior().binding,
    releaseSha, previousSha, previousRunId, actor: 'kyle', now: now + 1000 }).deploymentId, deploymentId);
});

test('dashboard evidence rejects stale, future, wrong-actor, malformed-source and extra-field receipts', () => {
  const cases = [
    rawProof({ observedAt: '2026-10-31T11:40:00.000Z' }),
    rawProof({ observedAt: '2026-10-31T12:15:30.001Z' }),
    rawProof({ capturedBy: 'someone-else' }),
    rawProof({ sourceUrl: 'https://example.com/fake' }),
    { ...rawProof(), unreviewed: true },
  ];
  for (const proof of cases) assert.throws(() => validate(proof));
});

test('dashboard evidence rejects mismatched host, account, project, branch, deployment, status, or release binding', () => {
  const cases = [
    rawProof({ hostname: 'www.lythaus.co' }), rawProof({ accountId: 'f'.repeat(32) }),
    rawProof({ project: 'lythaus-marketing' }), rawProof({ branch: 'preview' }),
    rawProof({ deploymentId: '33333333-3333-4333-8333-333333333333' }),
    rawProof({ deploymentUrl: 'https://other.example/' }), rawProof({ commitSha: releaseSha }),
    rawProof({ environment: 'preview' }), rawProof({ status: 'failure' }),
    rawProof({ releaseSha: previousSha }), rawProof({ previousProductionRunId: '999' }),
    rawProof({ previousManifestArtifactId: '999' }), rawProof({ previousManifestDigest: `sha256:${'d'.repeat(64)}` }),
  ];
  for (const proof of cases) assert.throws(() => validate(proof));
  assert.throws(() => validate(rawProof(), { ...snapshot, projectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }));
  assert.throws(() => validate(rawProof(), { ...snapshot, deploymentId: '33333333-3333-4333-8333-333333333333' }));
});

test('a prior manifest proof record rejects reused IDs and digests', () => {
  const receipt = validate();
  const manifest = { ...prior().source.manifest, deployment: { pagesServingProof: {
    schemaVersion: 'lythaus-app-pages-serving-proof-v1', proofId, proofDigest: receipt.proofDigest,
  } } };
  const source = { ...prior().source, manifest };
  const binding = createAppPagesPriorReleaseBinding({ prior: source, previousSha, previousRunId, appPage: snapshot });
  assert.throws(() => validate(rawProof(), snapshot, binding), /already consumed/);
});

test('receipt integrity and post-rollback API readback must still match the same baseline proof', () => {
  const receipt = validate();
  const altered = { ...receipt, commitSha: releaseSha };
  assert.throws(() => verifyAppPagesServingProofReceipt({ receipt: altered, snapshot, priorRelease: prior().binding,
    releaseSha, previousSha, previousRunId, actor: 'kyle', now: now + 1000, requireFreshNow: false }), /integrity/);
  const restored = verifyAppPagesServingProofReceipt({ receipt, snapshot: { ...snapshot }, priorRelease: prior().binding,
    releaseSha, previousSha, previousRunId, actor: 'kyle', now: now + 60 * 60 * 1000, requireFreshNow: false });
  assert.equal(restored.proofDigest, receipt.proofDigest);
  assert.throws(() => verifyAppPagesServingProofReceipt({ receipt, snapshot: { ...snapshot, deploymentId: proofId },
    priorRelease: prior().binding, releaseSha, previousSha, previousRunId, actor: 'kyle', now: now + 60_000,
    requireFreshNow: false }), /authenticated API record/);
});

test('the pre-deploy recheck binds the raw dispatch proof to fresh authenticated Pages state', async t => {
  const { binding } = prior(), proof = rawProof(), receipt = validate(proof, snapshot, binding);
  const directory = mkdtempSync(path.join(os.tmpdir(), 'app-pages-proof-recheck-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const eventPath = path.join(directory, 'event.json');
  writeFileSync(eventPath, JSON.stringify({ inputs: { release_mode: 'app_only', release_sha: releaseSha,
    previous_production_sha: previousSha, app_pages_serving_proof_json: JSON.stringify(proof) } }));
  const preparation = { schemaVersion: 'lythaus-app-only-preparation-v1', releaseSha,
    runId: '12345', runAttempt: '1',
    previousProductionSha: previousSha, previousRunId, appPage: snapshot, priorRelease: binding, servingProof: receipt };
  const env = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'AsoraKK/Lythaus', GITHUB_REF: 'refs/heads/main',
    GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_EVENT_PATH: eventPath, GITHUB_ACTOR: 'kyle',
    GITHUB_RUN_ID: '12345', GITHUB_RUN_ATTEMPT: '1',
    APP_ONLY_CANONICAL: 'true', RELEASE_MODE: 'app_only', RELEASE_SHA: releaseSha,
    CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: 'synthetic', LYTHAUS_WEB_PAGES_BRANCH: 'main',
    APP_ONLY_PREPARATION_JSON: JSON.stringify(preparation) };
  const result = await recheckAppOnlyServingProof(env, async input => {
    assert.equal(input.token, 'synthetic'); assert.equal(input.branch, 'main'); return snapshot;
  }, now);
  assert.equal(result.status, 'APP_ONLY_SERVING_PROOF_RECHECKED');
  assert.equal(result.proofDigest, receipt.proofDigest);
  let providerReads = 0;
  await assert.rejects(() => recheckAppOnlyServingProof({ ...env, GITHUB_RUN_ATTEMPT: '2' },
    async () => { providerReads++; return snapshot; }, now), /different release/);
  assert.equal(providerReads, 0);
  await assert.rejects(() => recheckAppOnlyServingProof({ ...env, CLOUDFLARE_ACCOUNT_ID: 'f'.repeat(32) },
    async () => snapshot, now), /protected canonical release context/);
  await assert.rejects(() => recheckAppOnlyServingProof(env, async () => ({ ...snapshot, deploymentId: proofId }),
    now), /app Pages baseline changed/);
  await assert.rejects(() => recheckAppOnlyServingProof(env, async () => snapshot,
    now + 31 * 60 * 1000), /stale or from the future/);
});

test('proof replay inventory fails closed and the receipt names one immutable artifact', () => {
  const receipt = validate();
  const name = `lythaus-app-only-pages-serving-${receipt.proofDigest.slice('sha256:'.length)}`;
  assert.equal(assertAppPagesServingProofNotReplayed({ proofDigest: receipt.proofDigest, runId: '123',
    executeGh: args => { assert.match(args[0], new RegExp(name)); return JSON.stringify([{ total_count: 0, artifacts: [] }]); } }).artifactName, name);
  assert.throws(() => assertAppPagesServingProofNotReplayed({ proofDigest: receipt.proofDigest, runId: '123',
    executeGh: () => JSON.stringify([{ total_count: 1, artifacts: [{ name }] }]) }), /already consumed/);
  assert.throws(() => assertAppPagesServingProofNotReplayed({ proofDigest: receipt.proofDigest, runId: '123',
    executeGh: () => JSON.stringify([{ total_count: 1, artifacts: [] }]) }), /incomplete/);
  const directory = mkdtempSync(path.join(os.tmpdir(), 'app-pages-proof-'));
  try {
    const output = path.join(directory, 'consumed.json');
    writeAppPagesServingProofConsumption({ path: output, proof: receipt, releaseSha, runId: '123', runAttempt: '1', previousRunId });
    assert.equal(JSON.parse(readFileSync(output, 'utf8')).proofDigest, receipt.proofDigest);
    assert.equal(JSON.parse(readFileSync(output, 'utf8')).runAttempt, '1');
    assert.throws(() => writeAppPagesServingProofConsumption({ path: output, proof: receipt, releaseSha, runId: '123', runAttempt: '1', previousRunId }));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
