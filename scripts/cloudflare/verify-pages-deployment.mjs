import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizePagesSnapshot } from '../release/app-only-eligibility.mjs';
import { validateAppPagesServingProof, verifyAppPagesServingProofReceipt } from '../release/app-pages-serving-proof.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{40}$/;

export function appOnlyServingProofContextFromEnvironment(env = process.env) {
  let event;
  try { event = JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8')); }
  catch {
    if (env.RELEASE_MODE === 'app_only') {
      throw new Error('app-only serving proof dispatch event unavailable');
    }
    return undefined;
  }
  if (event?.inputs?.release_mode !== 'app_only') {
    if (env.RELEASE_MODE === 'app_only') throw new Error('app-only serving proof dispatch mode differs');
    return undefined;
  }
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY !== 'AsoraKK/Lythaus'
    || env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch'
    || env.GITHUB_WORKFLOW_REF !== 'AsoraKK/Lythaus/.github/workflows/production-release.yml@refs/heads/main'
    || env.GITHUB_REF_PROTECTED !== 'true' || env.APP_ONLY_CANONICAL !== 'true'
    || env.RELEASE_MODE !== 'app_only' || env.PAGES_ENVIRONMENT !== 'production'
    || env.PAGES_PROJECT !== 'lythaus-web' || env.PAGES_BRANCH !== 'main'
    || event.inputs.release_sha !== env.RELEASE_SHA
    || typeof event.inputs.app_pages_serving_proof_json !== 'string'
    || event.inputs.app_pages_serving_proof_json.length > 20000) {
    throw new Error('app-only Pages serving proof requires the protected canonical release context');
  }
  let preparation, rawProof;
  try {
    preparation = JSON.parse(env.APP_ONLY_PREPARATION_JSON);
    rawProof = JSON.parse(event.inputs.app_pages_serving_proof_json);
  } catch { throw new Error('app-only Pages serving proof input invalid'); }
  const receipt = preparation?.servingProof;
  if (preparation?.schemaVersion !== 'lythaus-app-only-preparation-v1' || preparation.releaseSha !== env.RELEASE_SHA
    || preparation.runId !== env.GITHUB_RUN_ID || preparation.runAttempt !== env.GITHUB_RUN_ATTEMPT
    || preparation.previousProductionSha !== event.inputs.previous_production_sha
    || !/^[1-9][0-9]*$/.test(preparation.previousRunId ?? '') || !receipt) {
    throw new Error('app-only Pages serving proof preparation differs');
  }
  const validated = validateAppPagesServingProof({ proof: rawProof, snapshot: preparation.appPage,
    priorRelease: preparation.priorRelease, releaseSha: env.RELEASE_SHA,
    previousSha: preparation.previousProductionSha, previousRunId: preparation.previousRunId,
    actor: env.GITHUB_ACTOR, now: Date.parse(receipt.verifiedAt) });
  if (validated.proofDigest !== receipt.proofDigest) throw new Error('app-only Pages serving proof differs from its protected preparation');
  return Object.freeze({ schemaVersion: 'lythaus-app-only-pages-serving-proof-context-v1',
    servingProof: receipt, baselineSnapshot: preparation.appPage, priorRelease: preparation.priorRelease,
    releaseSha: preparation.releaseSha, previousProductionSha: preparation.previousProductionSha,
    previousRunId: preparation.previousRunId, actor: env.GITHUB_ACTOR });
}

/** Keep the established Pages inventory contract for every existing route.
 * Only a protected canonical app-only production call consumes serving proof. */
export async function verifyPagesDeployment({ accountId, token, project, branch, releaseSha,
  expectedUrl, environment = 'production', appOnlyServingProofContext, fetchImpl = fetch } = {}) {
  if (!/^[0-9a-f]{32}$/i.test(accountId ?? '')) throw new Error('CLOUDFLARE_ACCOUNT_ID is required');
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN is required');
  if (!/^[A-Za-z0-9._-]+$/.test(project ?? '')) throw new Error('PAGES_PROJECT is invalid');
  if (!/^[A-Za-z0-9._/-]+$/.test(branch ?? '')) throw new Error('PAGES_BRANCH is invalid');
  if (!SHA.test(releaseSha ?? '')) throw new Error('RELEASE_SHA must be a full 40-character SHA');

  const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${encodeURIComponent(project)}`;
  if (appOnlyServingProofContext) {
    if (environment !== 'production' || project !== 'lythaus-web'
      || !new RegExp(`^https://[a-z0-9-]+\\.${project}\\.pages\\.dev$`).test(expectedUrl ?? '')) {
      throw new Error('app-only Pages deployment verification inputs invalid');
    }
    const context = appOnlyServingProofContext;
    if (context.schemaVersion !== 'lythaus-app-only-pages-serving-proof-context-v1'
      || context.releaseSha !== releaseSha || context.baselineSnapshot?.project !== project
      || context.baselineSnapshot.branch !== branch || !context.priorRelease || !context.servingProof) {
      throw new Error('app-only Pages serving proof context invalid');
    }
    verifyAppPagesServingProofReceipt({ receipt: context.servingProof, snapshot: context.baselineSnapshot,
      priorRelease: context.priorRelease, releaseSha, previousSha: context.previousProductionSha,
      previousRunId: context.previousRunId, actor: context.actor, now: Date.now(), requireFreshNow: false });
    const response = await fetchImpl(base, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      redirect: 'error', signal: AbortSignal.timeout(15000),
    });
    if (!response.ok || response.redirected) throw new Error('Pages provider read failed');
    const payload = await response.json();
    const snapshot = normalizePagesSnapshot(payload, project, branch);
    if (snapshot.commitSha !== releaseSha || snapshot.deploymentUrl !== expectedUrl) {
      throw new Error('serving Pages deployment does not match the submitted release');
    }
    return Object.freeze({ schemaVersion: 1, capturedAt: new Date().toISOString(), ...snapshot, environment });
  }

  const response = await fetchImpl(`${base}/deployments?per_page=25`, {
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  });
  let payload = {};
  try { payload = await response.json(); } catch { payload = {}; }
  if (!response.ok || payload.success === false) {
    const error = Array.isArray(payload.errors) ? payload.errors[0] : null;
    const code = error?.code == null ? 'unknown' : String(error.code).replace(/[^0-9A-Za-z_-]/g, '');
    const message = error?.message == null ? 'unknown' : String(error.message).replace(/[^0-9A-Za-z ._:/-]/g, '').slice(0, 240);
    throw new Error(`Cloudflare Pages deployment inventory failed with HTTP ${response.status}, code=${code}, message=${message}`);
  }
  const deployments = Array.isArray(payload.result) ? payload.result : [];
  const match = deployments.find(deployment => {
    const metadata = deployment?.deployment_trigger?.metadata ?? {};
    const commit = metadata.commit_hash ?? deployment?.source?.commit_hash ?? deployment?.commit_hash;
    const deploymentBranch = metadata.branch ?? deployment?.source?.branch ?? deployment?.branch;
    return commit === releaseSha && deploymentBranch === branch;
  });
  if (!match) throw new Error(`No Pages deployment matched project=${project}, branch=${branch}, release SHA=${releaseSha}`);
  const evidence = { schemaVersion: 1, capturedAt: new Date().toISOString(), project, branch, commitSha: releaseSha,
    deploymentId: String(match.id ?? match.deployment_id ?? ''), deploymentUrl: String(match.url ?? match.alias ?? ''),
    environment: match.environment === 'production' ? 'production' : 'preview' };
  if (!evidence.deploymentId || !evidence.deploymentUrl) throw new Error('Pages deployment evidence omitted deployment id or URL');
  return Object.freeze(evidence);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const appOnlyServingProofContext = appOnlyServingProofContextFromEnvironment();
    const evidence = await verifyPagesDeployment({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? '',
      token: process.env.CLOUDFLARE_API_TOKEN ?? '', project: process.env.PAGES_PROJECT ?? '',
      branch: process.env.PAGES_BRANCH ?? '', releaseSha: process.env.RELEASE_SHA ?? '',
      expectedUrl: process.env.PAGES_EXPECTED_DEPLOYMENT_URL,
      environment: process.env.PAGES_ENVIRONMENT || 'production', appOnlyServingProofContext });
    const outputPath = process.env.PAGES_DEPLOYMENT_EVIDENCE_OUTPUT ?? 'pages-deployment-evidence.json';
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(evidence));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
