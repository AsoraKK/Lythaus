import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import blake3 from 'blake3-wasm';
import { scriptLoggingEvidence,workerBoundaryEvidence } from './new-core-isolated-worker-boundary.mjs';
import { RECORDED_WORKER_ID,SCRIPT } from './new-core-isolated-cloudflare.mjs';

import {originalArtifactPins} from './new-core-isolated-repair-state.mjs';
export {originalArtifactPins} from './new-core-isolated-repair-state.mjs';
const {sourceSha,workerSha,assetsSha} = originalArtifactPins;
const configSha = '0056b85f1b4b2ab10c01db76ea7a587744ef6224ff274afdfc835d5fa3c4a6ac';
const moduleName = 'new-core-test-worker.js';
const entryName = 'isolated-entry.js';
const entryBytes = Buffer.from("export { default } from './new-core-test-worker.js';\n");
const configPath = 'apps/lythaus-admin-api/wrangler.new-core-test.jsonc';
const host = 'admin-new-core-test.lythaus.co';
const name = 'lythaus-admin-api-new-core-test';
const account = '/accounts/e5b7ae46e04698f507b7e4b3d4ef1af0/workers';
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/;
const workerIdPattern = /^(?:[a-f\d]{32}|[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12})$/;
const controlHashes = {
  _headers: '7ac87b1130bcb67b1a6c6a8064e0b64b73ef5f561af7fe474c9bab7575b427b1',
  _redirects: '6036983e5fc00f0169c9e939b1816ed771eee00e27f2fcc517b819041460b9ef',
};

function requireGate(condition, code) {
  if (!condition) throw new Error(code);
}

const sha256 = value => createHash('sha256').update(value).digest('hex');

async function sourceConfig(sourceDir, pins) {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceDir, encoding: 'utf8' }).trim();
  requireGate(head === pins.sourceSha, 'WORKER_SOURCE_PIN');
  const bytes = await readFile(join(sourceDir, configPath));
  requireGate(sha256(bytes) === configSha, 'WORKER_CONFIG_PIN');
  return bytes;
}

export async function readAssets(dir, prefix = '') {
  const entries = [];
  for (const file of await readdir(dir, { withFileTypes: true })) {
    const path = prefix + file.name;
    const full = join(dir, file.name);
    if (file.isDirectory()) entries.push(...await readAssets(full, path + '/'));
    else {
      requireGate(file.isFile(), 'NON_REGULAR_UI_ASSET');
      entries.push([path, await readFile(full)]);
    }
  }
  return entries;
}

function checkArtifactBytes({ worker, assets }, pins) {
  requireGate(Buffer.isBuffer(worker) && worker.length === pins.workerBytes && sha256(worker) === pins.workerSha, 'WORKER_JS_PIN');
  requireGate(assets instanceof Map && assets.size === pins.assetCount, 'UI_ASSET_COUNT');
  const files = [...assets].sort(([a], [b]) => a.localeCompare(b, 'en-US'))
    .map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: sha256(bytes) }));
  requireGate(files.reduce((sum, file) => sum + file.bytes, 0) === pins.assetBytes &&
    sha256(JSON.stringify(files) + '\n') === pins.assetsSha, 'UI_ASSET_MANIFEST_PIN');
}

export async function loadArtifacts({ sourceDir, artifactDir, pins = originalArtifactPins }) {
  await sourceConfig(sourceDir,pins);
  const js = join(artifactDir, 'portable-worker', moduleName);
  const ui = join(artifactDir, 'assets');
  requireGate((await lstat(js)).isFile() && (await lstat(ui)).isDirectory(), 'SEALED_ARTIFACT_LAYOUT');
  const artifacts = { worker: await readFile(js), assets: new Map(await readAssets(ui)) };
  checkArtifactBytes(artifacts,pins);
  return artifacts;
}

export async function prepareArtifacts({ sourceDir, artifactDir, pins = originalArtifactPins }) {
  sourceDir = await realpath(sourceDir);
  artifactDir = resolve(artifactDir);
  await sourceConfig(sourceDir,pins);
  execFileSync('git', ['diff', '--exit-code', 'HEAD', '--'], { cwd: sourceDir, stdio: 'ignore' });
  requireGate(execFileSync('git',['ls-files','--others','--exclude-standard'],{cwd:sourceDir}).length === 0,'WORKER_SOURCE_DIRTY');
  requireGate(process.versions.node === '22.23.4', 'WORKER_BUILD_NODE_PIN');
  const wrangler = join(sourceDir, 'node_modules/wrangler');
  requireGate(JSON.parse(await readFile(join(wrangler, 'package.json'))).version === '4.129.1', 'WORKER_BUILD_WRANGLER_PIN');
  const ui = join(sourceDir, 'apps/control-panel');
  const dist = join(ui, 'dist');
  // Vite cleans this directory; only build in a fresh checkout.
  requireGate(!await lstat(dist).catch(e => { if (e.code !== 'ENOENT') throw e; }), 'WORKER_BUILD_REQUIRES_FRESH_DIST');
  await mkdir(artifactDir, { recursive: true });
  requireGate((await readdir(artifactDir)).length === 0, 'WORKER_BUILD_OUTPUT_EXISTS');
  const scratch = await mkdtemp(join(tmpdir(), 'isolated-worker-build-'));
  const env = { PATH: process.env.PATH, HOME: scratch, CI: 'true', WRANGLER_SEND_METRICS: 'false' };
  try {
    const bundleDir = join(scratch,'bundle');
    execFileSync(process.execPath, [join(ui, 'node_modules/vite/bin/vite.js'), 'build'], { cwd: ui, env, stdio: 'inherit' });
    execFileSync(process.execPath, [join(wrangler, 'bin/wrangler.js'), 'deploy', '--dry-run',
      '--config', 'wrangler.new-core-test.jsonc', '--outdir', bundleDir], { cwd: join(sourceDir, 'apps/lythaus-admin-api'), env, stdio: 'inherit' });
    const outputs = await readdir(bundleDir,{withFileTypes:true});
    requireGate(outputs.every(file=>file.isFile() && [moduleName,moduleName+'.map','README.md'].includes(file.name)),
      'WORKER_UNREVIEWED_MODULE');
    const artifacts = { worker: await readFile(join(bundleDir, moduleName)), assets: new Map(await readAssets(dist)) };
    checkArtifactBytes(artifacts,pins);
    await mkdir(join(artifactDir, 'portable-worker'));
    await writeFile(join(artifactDir, 'portable-worker', moduleName), artifacts.worker, { flag: 'wx' });
    await cp(dist, join(artifactDir, 'assets'), { recursive: true, force: false, errorOnExist: true });
    return await loadArtifacts({ sourceDir, artifactDir, pins });
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

export function expectedBindings(audience, issuer) {
  requireGate(typeof audience === 'string' && /^[a-f0-9]{64}$/.test(audience) &&
    typeof issuer === 'string' && /^https:\/\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.cloudflareaccess\.com$/.test(issuer), 'WORKER_ACCESS_BINDING_INPUT');
  const vars = {
    ENVIRONMENT: 'owner-testing', EXPECTED_HOSTNAMES: host, CORS_ALLOWED_ORIGINS: 'https://' + host,
    HYPERDRIVE_QUERY_CACHE_MODE: 'disabled', ACCESS_AUDIENCES: audience, ACCESS_TEAM_DOMAIN: new URL(issuer).host,
    ACCESS_JWKS_URL: issuer + '/cdn-cgi/access/certs', NEW_CORE_ACCESS_ISSUER: issuer,
    NEW_CORE_ACCESS_AUDIENCE_SHA256: sha256(audience),
  };
  return [
    ...Object.entries(vars).map(([name, text]) => ({ type: 'plain_text', name, text })),
    { type: 'hyperdrive', name: 'DB_ADMIN_FRESH', id: '7e39fc4a286147988ed12df7a6322616' },
    { type: 'assets', name: 'ASSETS' }, { type: 'version_metadata', name: 'WORKER_VERSION' },
    { type: 'secret_text', name: 'ACCESS_SUBJECT_HMAC_KEY' },
  ];
}

async function checkWorker(request, worker, id) {
  const evidence = workerBoundaryEvidence(worker,id,name);
  requireGate(Object.values(evidence.checks).every(Boolean), 'WORKER_EXPOSURE_OR_LOGGING');
  if (id === RECORDED_WORKER_ID) requireGate(
    scriptLoggingEvidence(await request(`${SCRIPT}/script-settings`, { method:'GET' }),evidence).disabled,
    'WORKER_SCRIPT_LOGGING_READBACK');
}

const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.ico': 'image/vnd.microsoft.icon', '.svg': 'image/svg+xml',
};

function tokenPayload(token) {
  requireGate(typeof token === 'string' && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(token), 'WORKER_ASSET_TOKEN');
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')); }
  catch { throw new Error('WORKER_ASSET_TOKEN'); }
}

export async function uploadAssets(assets, request, journal) {
  const manifest = {};
  const blobs = new Map();
  for (const [path, bytes] of assets) {
    if (Object.hasOwn(controlHashes, path)) continue;
    const extension = extname(path);
    const type = contentTypes[extension];
    requireGate(type, 'WORKER_ASSET_MIME');
    const hash = blake3.hash(bytes.toString('base64') + extension.slice(1)).toString('hex').slice(0, 32);
    manifest['/' + path] = { hash, size: bytes.length };
    blobs.set(hash, { type, bytes });
  }
  const session = await request(account + '/scripts/' + name + '/assets-upload-session', { method: 'POST', body: { manifest } });
  await journal('worker_asset_session', {});
  const claims = tokenPayload(session?.jwt);
  requireGate(Array.isArray(session.buckets) && session.buckets.every(bucket => Array.isArray(bucket) && bucket.length > 0), 'WORKER_ASSET_BUCKETS');
  const hashes = session.buckets.flat();
  requireGate(new Set(hashes).size === hashes.length && hashes.every(hash => blobs.has(hash)), 'WORKER_ASSET_UNKNOWN_HASH');
  if (!hashes.length) return session.jwt;
  const single = claims.wrangler_single_asset_uploads === true;
  const buckets = single ? hashes.map(hash => [hash]) : session.buckets;
  let completion;
  for (const bucket of buckets) {
    let body, path;
    const headers = { Authorization: 'Bearer ' + session.jwt };
    if (single) {
      const { bytes, type } = blobs.get(bucket[0]);
      path = '/assets/upload/' + bucket[0];
      body = new Blob([bytes], { type });
      headers['Content-Type'] = type;
    } else {
      path = '/assets/upload?base64=true';
      body = new FormData();
      for (const hash of bucket) {
        const { bytes, type } = blobs.get(hash);
        body.append(hash, new Blob([bytes.toString('base64')], { type }), hash);
      }
    }
    const result = await request(account + path, { method: 'POST', body, headers });
    await journal('worker_asset_upload', {});
    if (result?.jwt) { tokenPayload(result.jwt); completion = result.jwt; }
  }
  requireGate(completion, 'WORKER_ASSET_COMPLETION_TOKEN_MISSING');
  return completion;
}

function asModule(name, bytes, content_type) {
  return { name, content_type, content_base64: bytes.toString('base64') };
}

export function workerVersionCode(artifacts, pins = originalArtifactPins) {
  checkArtifactBytes(artifacts,pins);
  // Pages needs this source file; Workers Assets rejects its sole index rewrite.
  requireGate(sha256(artifacts.assets.get('_redirects')) === controlHashes._redirects, 'WORKER_REDIRECTS_PIN');
  requireGate(sha256(artifacts.assets.get('_headers')) === controlHashes._headers, 'WORKER_HEADERS_PIN');
  return { main_module: entryName, modules: [
    asModule(entryName, entryBytes, 'application/javascript+module'),
    asModule(moduleName, artifacts.worker, 'application/javascript+module'),
    asModule('_headers', artifacts.assets.get('_headers'), 'text/plain'),
  ] };
}

export async function readLineage({ request, workerId, audience, issuer, versions, parentIntent, childIntent, ackParent, ackChild, childParent }) {
  requireGate(Array.isArray(versions) && versions.length <= 2, 'WORKER_LINEAGE_AMBIGUOUS');
  requireGate((!versions.length || parentIntent) && (versions.length !== 2 || childIntent) && (!childIntent || parentIntent) &&
    (!parentIntent || uuid.test(parentIntent)) && (!childIntent || uuid.test(childIntent) && childIntent !== parentIntent),
    'WORKER_HAS_EXISTING_VERSION');
  // The two intent IDs originate in previous protected job summaries, before
  // each POST. A caller's version number or the newest row cannot select a key.
  const checked = [];
  for (const row of versions) {
    checked.push(await verifyWorkerVersion({ request, workerId, versionId:row.id, audience, issuer }));
  }
  const parent = checked.find(row => row.intentId === parentIntent && !row.parentVersionId);
  const child = checked.find(row => row.intentId === childIntent && parent && row.parentVersionId === parent.versionId);
  requireGate((!versions.length || parent) && (versions.length !== 2 || child && child.number > parent.number) &&
    (!ackParent || parent?.versionId === ackParent) && (!ackChild || child?.versionId === ackChild) &&
    (!childParent || parent?.versionId === childParent) && (versions.length || !childIntent), 'WORKER_LINEAGE_AMBIGUOUS');
  return { parent, child };
}

export async function stageWorker({ artifacts, request, audience, issuer, journal, existingWorkerId,
  parentIntent, childIntent, ackParent, ackChild, childParent, selectLineage, singleStage = false, listVersions, activeVersionId }) {
  const code = workerVersionCode(artifacts);
  const bindings = expectedBindings(audience, issuer);
  const workers = account + '/workers';
  requireGate(existingWorkerId === undefined || existingWorkerId === RECORDED_WORKER_ID,'WORKER_RESUME_ID');
  const created = existingWorkerId ? {id:existingWorkerId} : await request(workers, { method: 'POST', body: {
    name, subdomain: { enabled: false, previews_enabled: false }, logpush: false, tail_consumers: [],
    observability: { enabled: false, logs: { enabled: false, invocation_logs: false }, traces: { enabled: false } },
  } });
  const workerId = created?.id;
  requireGate(typeof workerId === 'string' && workerIdPattern.test(workerId), 'WORKER_CREATE_ID');
  if (!existingWorkerId) await journal('worker_created', { workerId });
  const workerPath = workers + '/' + workerId;
  const worker = await request(workerPath, { method: 'GET' });
  await checkWorker(request, worker, workerId);
  requireGate(activeVersionId ? childIntent && Number.isFinite(Date.parse(worker.deployed_on)) : worker.deployed_on === null,
    'WORKER_ALREADY_DEPLOYED');
  const inventory = listVersions ?? (()=>request(workerPath + '/versions',{method:'GET'}));
  const versions = await inventory();
  const args = { request, workerId, audience, issuer };
  let {parent,child} = await readLineage({...args, versions, parentIntent, childIntent, ackParent, ackChild, childParent});
  const expectedIds = versions.map(row=>row.id);
  async function checkInventory() {
    const live = await inventory();
    requireGate(Array.isArray(live) && live.length === expectedIds.length &&
      expectedIds.every(id=>live.some(row=>row.id === id)), 'WORKER_VERSION_INVENTORY_CHANGED');
  }
  if (activeVersionId) requireGate(child?.versionId === activeVersionId, 'WORKER_ACTIVE_LINEAGE');
  if (parent) {
    selectLineage(parent.versionId,child?.versionId);
    await journal('worker_parent_verified',{workerId,versionId:parent.versionId,intentId:parent.intentId});
    if (child) await journal('worker_child_verified',{workerId,versionId:child.versionId,intentId:child.intentId});
  }
  async function stage(bindings, parentVersionId) {
    const jwt = await uploadAssets(artifacts.assets, request, journal);
    const shell = await request(workerPath,{method:'GET'});
    await checkWorker(request,shell,workerId);
    requireGate(shell.deployed_on === null,'WORKER_PREMATURE_DEPLOYMENT');
    await checkInventory();
    const intentId = randomUUID();
    await journal(parentVersionId ? 'worker_child_intent' : 'worker_parent_intent',
      { workerId, intentId, ...(parentVersionId ? {parentVersionId} : {}) });
    const version = await request(workerPath + '/versions?deploy=false', { method: 'POST', body: {
      annotations: { 'workers/tag': sourceSha, 'workers/message': `lythaus-isolated ${intentId} ${parentVersionId ?? 'parent'}` }, ...code, bindings,
      compatibility_date: '2026-07-27', compatibility_flags: ['nodejs_compat'],
      assets: { jwt, config: { run_worker_first: true, not_found_handling: 'single-page-application' } },
    } });
    const versionId = version?.id;
    requireGate(typeof versionId === 'string' && uuid.test(versionId), 'WORKER_VERSION_ID');
    requireGate(!expectedIds.includes(versionId),'WORKER_INHERITANCE_VERSION');
    expectedIds.push(versionId);
    const stagedWorker = await request(workerPath, { method: 'GET' });
    await checkWorker(request, stagedWorker, workerId);
    requireGate(stagedWorker.deployed_on === null, 'WORKER_PREMATURE_DEPLOYMENT');
    const verified = await verifyWorkerVersion({...args, versionId});
    await checkInventory();
    requireGate(verified.intentId === intentId && verified.parentVersionId === parentVersionId, 'WORKER_LINEAGE_AMBIGUOUS');
    await journal(parentVersionId ? 'worker_child_verified' : 'worker_parent_verified', {workerId,versionId,intentId});
    return verified;
  }
  if (!parent) {
    const key = randomBytes(32);
    try {
      bindings.at(-1).text = key.toString('base64');
      parent = await stage(bindings);
    } finally {
      delete bindings.at(-1).text;
      key.fill(0);
    }
    if (singleStage) return {workerId,parentVersionId:parent.versionId,tag:sourceSha,checkpoint:'PARENT_CREATED_AND_VERIFIED'};
  }
  if (!child) {
    const inherited = bindings.map(binding => binding.name === 'ACCESS_SUBJECT_HMAC_KEY'
      ? { name:binding.name, type:'inherit', version_id:parent.versionId } : binding);
    child = await stage(inherited,parent.versionId);
  }
  requireGate(child.versionId !== parent.versionId && child.number > parent.number, 'WORKER_INHERITANCE_VERSION');
  return { workerId, parentVersionId:parent.versionId, versionId:child.versionId, tag:sourceSha, checkpoint:'CHILD_CREATED_AND_VERIFIED' };
}

export async function verifyWorkerVersion({ request, workerId, versionId, audience, issuer, pins = originalArtifactPins }) {
  requireGate(workerIdPattern.test(workerId) && uuid.test(versionId), 'WORKER_READBACK_IDS');
  const path = account + '/workers/' + workerId;
  await checkWorker(request, await request(path, { method: 'GET' }), workerId);
  const version = await request(path + '/versions/' + versionId + '?include=modules', { method: 'GET' });
  requireGate(version?.id === versionId && Number.isSafeInteger(version.number) && version.number > 0 && version.annotations?.['workers/tag'] === pins.sourceSha &&
    version.main_module === entryName && version.compatibility_date === '2026-07-27' &&
    JSON.stringify(version.compatibility_flags) === '["nodejs_compat"]' &&
    Array.isArray(version.urls) && version.urls.length === 0 &&
    version.assets?.config?.run_worker_first === true &&
    version.assets.config.not_found_handling === 'single-page-application', 'WORKER_VERSION_CONFIGURATION');
  const expected = expectedBindings(audience, issuer);
  const actual = version.bindings;
  requireGate(Array.isArray(actual) && actual.length === expected.length &&
    expected.every(binding => actual.some(value => Object.keys(value).length === Object.keys(binding).length &&
      Object.entries(binding).every(([key, val]) => value[key] === val))), 'WORKER_VERSION_BINDINGS');
  const expectedModules = { [entryName]: sha256(entryBytes), [moduleName]: pins.workerSha, _headers: controlHashes._headers };
  requireGate(Array.isArray(version.modules) && version.modules.length === Object.keys(expectedModules).length && Object.entries(expectedModules).every(([name, hash]) =>
    version.modules.some(mod => mod.name === name && mod.content_type === (name === '_headers' ? 'text/plain' : 'application/javascript+module') &&
      typeof mod.content_base64 === 'string' && sha256(Buffer.from(mod.content_base64, 'base64')) === hash)), 'WORKER_VERSION_MODULES');
  const marker = version.annotations?.['workers/message']?.split(' ');
  requireGate(marker?.length === 3 && marker[0] === 'lythaus-isolated' && uuid.test(marker[1]) &&
    (marker[2] === 'parent' || uuid.test(marker[2])), 'WORKER_LINEAGE_AMBIGUOUS');
  return { workerId, versionId, tag: pins.sourceSha, hmacBindingPresent: true, number:version.number,
    intentId:marker[1], parentVersionId:marker[2] === 'parent' ? undefined : marker[2] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [action, sourceDir, artifactDir] = process.argv.slice(2);
  requireGate((action === 'prepare' || action === 'verify') && sourceDir && artifactDir && process.argv.length === 5,
    'Usage: node ' + basename(process.argv[1]) + ' prepare|verify SOURCE_DIR ARTIFACT_DIR');
  const operation = action === 'prepare' ? prepareArtifacts : loadArtifacts;
  await operation({ sourceDir, artifactDir });
  console.log(JSON.stringify({ sourceSha, workerSha, assetsSha, configSha, assetCount: 30, assetBytes: 392398 }));
}
