import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { verifyPresentationScope } from './marketing-presentation-scope.mjs';

const ACCOUNT = 'e5b7ae46e04698f507b7e4b3d4ef1af0';
const PROJECT = 'lythaus-marketing';
const PROJECT_ID = 'd91f8bb3-fd6b-4a9b-b308-f400fdd9e460';
const sha = value => /^[a-f0-9]{40}$/.test(value ?? '');
const digest = value => createHash('sha256').update(value).digest('hex');
const encode = value => `${JSON.stringify(value, null, 2)}\n`;
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/pages/projects/${PROJECT}`;

export function canonicalMarketingProject(payload) {
  const project = payload?.result, deployment = project?.canonical_deployment;
  const metadata = deployment?.deployment_trigger?.metadata;
  if (payload?.success !== true || project?.id !== PROJECT_ID || project?.name !== PROJECT
    || project?.production_branch !== 'main' || deployment?.project_id !== PROJECT_ID
    || deployment?.project_name !== PROJECT || deployment?.environment !== 'production'
    || deployment?.latest_stage?.status !== 'success' || metadata?.branch !== 'main'
    || metadata?.commit_dirty !== false || !sha(metadata?.commit_hash)
    || !/^[a-f0-9-]{36}$/i.test(deployment?.id ?? '') || typeof deployment?.url !== 'string'
    || !/^https:\/\/[a-z0-9-]+\.lythaus-marketing\.pages\.dev$/i.test(deployment.url)) {
    throw new Error('marketing_canonical_deployment_unverified');
  }
  return { project: PROJECT, projectId: PROJECT_ID, branch: 'main', deploymentId: deployment.id,
    commitSha: metadata.commit_hash, deploymentUrl: deployment.url };
}

export async function readCanonical({ token, account = ACCOUNT, fetchImpl = fetch }) {
  if (account !== ACCOUNT || typeof token !== 'string' || !token) throw new Error('marketing_provider_identity_invalid');
  const response = await fetchImpl(endpoint, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' } });
  if (!response.ok || response.redirected) throw new Error(`marketing_provider_read_failed_http_${response.status}`);
  return canonicalMarketingProject(await response.json());
}

export function artifactDigest(root) {
  const files = [];
  const walk = (directory, relative = '') => {
    for (const name of fs.readdirSync(directory).sort()) {
      if (!name || name === '.' || name === '..' || /[\x00-\x1f\x7f]/.test(name)) throw new Error('marketing_artifact_name_invalid');
      const file = path.join(directory, name), subpath = relative ? `${relative}/${name}` : name;
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) throw new Error('marketing_artifact_symlink_refused');
      if (stat.isDirectory()) walk(file, subpath);
      else if (stat.isFile()) files.push({ path: subpath, size: stat.size, sha256: digest(fs.readFileSync(file)) });
      else throw new Error('marketing_artifact_entry_invalid');
    }
  };
  walk(root);
  if (!files.length || files.length > 10000) throw new Error('marketing_artifact_inventory_invalid');
  return { sha256: digest(encode(files)), fileCount: files.length };
}

export function assertCleanBuildInputs(cwd = process.cwd()) {
  try {
    execFileSync('git', ['diff', '--quiet', 'HEAD', '--'], { cwd });
    execFileSync('git', ['diff', '--cached', '--quiet', 'HEAD', '--'], { cwd });
  } catch { throw new Error('marketing_tracked_build_input_modified'); }
  const paths = ['apps/marketing-site', 'design', 'assets/brand', 'assets/fonts', 'tools/marketing',
    'packages/contracts/src', '.env', '.env.local', '.env.production', '.env.production.local', '.npmrc'];
  const untracked = execFileSync('git', ['ls-files', '--others', '-z', '--', ...paths], { cwd, maxBuffer: 8 * 1024 * 1024 })
    .toString('utf8').split('\0').filter(Boolean)
    .filter(file => !/^apps\/marketing-site\/(?:node_modules|dist|\.astro)\//.test(file));
  if (untracked.length) throw new Error('marketing_untracked_build_input_refused');
}

function assertStoredDeployment(value) {
  if (!value || value.project !== PROJECT || value.projectId !== PROJECT_ID || value.branch !== 'main'
    || !sha(value.commitSha) || !/^[a-f0-9-]{36}$/i.test(value.deploymentId ?? '')
    || !/^https:\/\/[a-z0-9-]+\.lythaus-marketing\.pages\.dev$/i.test(value.deploymentUrl ?? ''))
    throw new Error('marketing_stored_deployment_invalid');
}

export function assertSnapshotUnchanged(before, current) {
  assertStoredDeployment(before); assertStoredDeployment(current);
  if (before.deploymentId !== current.deploymentId
    || before.commitSha !== current.commitSha || before.deploymentUrl !== current.deploymentUrl)
    throw new Error('marketing_deployment_changed_since_scope');
}

export function assertCandidateBound(before, candidate, current, releaseSha) {
  assertStoredDeployment(before); assertStoredDeployment(current);
  if (!candidate) throw new Error('marketing_candidate_not_current');
  assertStoredDeployment(candidate);
  if (candidate.commitSha !== releaseSha
    || candidate.deploymentId === before.deploymentId || candidate.deploymentId !== current.deploymentId
    || candidate.commitSha !== current.commitSha || candidate.deploymentUrl !== current.deploymentUrl)
    throw new Error('marketing_candidate_not_current');
}

export async function readPublicSurfaces(fetchImpl = fetch) {
  const rows = [];
  for (const origin of ['https://lythaus.co', 'https://www.lythaus.co']) {
    const response = await fetchImpl(`${origin}/`, { redirect: 'follow', signal: AbortSignal.timeout(30000) });
    const final = new URL(response.url);
    if (response.status !== 200 || final.protocol !== 'https:' || !['lythaus.co', 'www.lythaus.co'].includes(final.hostname)
      || final.pathname !== '/' || final.search || final.hash) throw new Error('marketing_public_route_invalid');
    const headers = Object.fromEntries(['content-security-policy', 'x-content-type-options', 'x-frame-options',
      'referrer-policy', 'strict-transport-security'].map(name => [name, response.headers.get(name)]));
    if (!headers['content-security-policy'] || headers['x-content-type-options']?.toLowerCase() !== 'nosniff'
      || headers['x-frame-options']?.toLowerCase() !== 'deny' || !headers['referrer-policy']
      || !headers['strict-transport-security']) throw new Error('marketing_public_headers_invalid');
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length === 0 || body.length > 2 * 1024 * 1024 || !body.includes(Buffer.from('data-waitlist')))
      throw new Error('marketing_public_form_missing');
    rows.push({ origin, finalUrl: response.url, headers, bodySha256: digest(body) });
  }
  return rows;
}

export async function rollbackMarketing({ before, candidate, releaseSha, token, account = ACCOUNT, fetchImpl = fetch,
  sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)) }) {
  if (!candidate) throw new Error('marketing_candidate_unbound_no_rollback');
  const current = await readCanonical({ token, account, fetchImpl });
  if (before.deploymentId === current.deploymentId && before.commitSha === current.commitSha) {
    assertSnapshotUnchanged(before, current);
    return { status: 'BASELINE_UNCHANGED', before };
  }
  assertCandidateBound(before, candidate, current, releaseSha);
  const response = await fetchImpl(`${endpoint}/deployments/${encodeURIComponent(before.deploymentId)}/rollback`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { authorization: `Bearer ${token}`, accept: 'application/json', 'content-type': 'application/json' },
  });
  if (!response.ok || response.redirected || (await response.json())?.success !== true)
    throw new Error('marketing_rollback_unacknowledged_no_retry');
  for (let attempt = 0; attempt < 6; attempt++) {
    const restored = await readCanonical({ token, account, fetchImpl });
    if (restored.commitSha === before.commitSha || restored.deploymentId === before.deploymentId
      || restored.deploymentUrl === before.deploymentUrl) {
      assertSnapshotUnchanged(before, restored);
      return { status: 'ROLLED_BACK_PROVIDER_READBACK', before, restored };
    }
    assertCandidateBound(before, candidate, restored, releaseSha);
    if (attempt < 5) await sleep(2000);
  }
  throw new Error('marketing_rollback_readback_unverified');
}

async function main() {
  const operation = process.argv[2], directory = process.env.MARKETING_RELEASE_DIR;
  const releaseSha = process.env.RELEASE_SHA ?? '', token = process.env.CLOUDFLARE_API_TOKEN ?? '';
  const account = process.env.CLOUDFLARE_ACCOUNT_ID ?? '', artifact = 'apps/marketing-site/dist';
  if (!directory || !path.isAbsolute(directory) || !sha(releaseSha)) throw new Error('marketing_release_context_invalid');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = name => path.join(directory, `${name}.json`);
  const read = name => JSON.parse(fs.readFileSync(file(name), 'utf8'));
  const write = (name, value) => fs.writeFileSync(file(name), encode(value), { mode: 0o600 });
  if (operation === 'snapshot') write('before', await readCanonical({ token, account }));
  else if (operation === 'snapshot-surface') write('before-surface', await readPublicSurfaces());
  else if (operation === 'scope') {
    assertCleanBuildInputs();
    const before = read('before'), scope = verifyPresentationScope(before.commitSha, releaseSha);
    write('scope', { ...scope, baselineDeploymentId: before.deploymentId });
  } else if (operation === 'artifact') {
    assertCleanBuildInputs();
    const before = read('before'), scope = read('scope');
    if (scope.candidateSha !== releaseSha || scope.baseSha !== before.commitSha
      || scope.baselineDeploymentId !== before.deploymentId || scope.status !== 'PRESENTATION_ONLY')
      throw new Error('marketing_scope_binding_invalid');
    write('artifact', { releaseSha, baselineDeploymentId: before.deploymentId, scopeSha256: digest(encode(scope)),
      ...artifactDigest(artifact), databaseRecovery: 'NOT_APPLICABLE' });
  } else if (operation === 'predeploy') {
    assertCleanBuildInputs();
    const before = read('before'), scope = read('scope'), expected = read('artifact');
    if (scope.candidateSha !== releaseSha || expected.releaseSha !== releaseSha
      || expected.baselineDeploymentId !== before.deploymentId || expected.scopeSha256 !== digest(encode(scope))
      || expected.sha256 !== artifactDigest(artifact).sha256) throw new Error('marketing_artifact_binding_invalid');
    assertSnapshotUnchanged(before, await readCanonical({ token, account }));
  } else if (operation === 'bind') {
    const before = read('before'), candidate = await readCanonical({ token, account });
    if (candidate.commitSha !== releaseSha || candidate.deploymentId === before.deploymentId
      || candidate.deploymentUrl !== process.env.MARKETING_DEPLOYMENT_URL) throw new Error('marketing_candidate_binding_invalid');
    write('candidate', candidate);
  } else if (operation === 'verify-current') {
    const before = read('before'), candidate = read('candidate');
    assertCandidateBound(before, candidate, await readCanonical({ token, account }), releaseSha);
    const expected = read('artifact');
    if (expected.releaseSha !== releaseSha || expected.sha256 !== artifactDigest(artifact).sha256)
      throw new Error('marketing_artifact_binding_invalid');
  } else if (operation === 'rollback') {
    const before = read('before'), candidate = fs.existsSync(file('candidate')) ? read('candidate') : null;
    try { write('rollback', await rollbackMarketing({ before, candidate, releaseSha, token, account })); }
    catch (error) {
      const blocker = /^marketing_[a-z0-9_]+$/.test(error.message ?? '') ? error.message : 'marketing_rollback_unknown_outcome';
      write('rollback', { status: 'BLOCKED_OR_UNCERTAIN', blocker });
      throw error;
    }
  } else if (operation === 'verify-rollback-surface') {
    const rollback = read('rollback');
    if (!['BASELINE_UNCHANGED', 'ROLLED_BACK_PROVIDER_READBACK'].includes(rollback.status)
      || encode(await readPublicSurfaces()) !== encode(read('before-surface'))) throw new Error('marketing_rollback_surface_unverified');
    write('rollback', { ...rollback, status: rollback.status === 'BASELINE_UNCHANGED'
      ? 'BASELINE_UNCHANGED_AND_SURFACES_VERIFIED' : 'ROLLED_BACK_AND_SURFACES_VERIFIED' });
  } else throw new Error('marketing_operation_invalid');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
