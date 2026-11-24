import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import blake3 from 'blake3-wasm';
import { workerBoundaryEvidence } from './new-core-isolated-worker-boundary.mjs';

const sourceSha = '276b43265584ec0dc158e67cbdb13cb58ece75db';
const workerSha = '6a276e4b4ed3883b2c00c8b089149b7b14cfebf3ce3811f0a799ff686e9101b3';
const assetsSha = '5c3969463149d5611e50b73fc030e1ae46e84aa08b27222c3122f9a17a9565c0';
const configSha = '0056b85f1b4b2ab10c01db76ea7a587744ef6224ff274afdfc835d5fa3c4a6ac';
const moduleName = 'new-core-test-worker.js';
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

async function sourceConfig(sourceDir) {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceDir, encoding: 'utf8' }).trim();
  requireGate(head === sourceSha, 'WORKER_SOURCE_PIN');
  const bytes = await readFile(join(sourceDir, configPath));
  requireGate(sha256(bytes) === configSha, 'WORKER_CONFIG_PIN');
  return bytes;
}

async function readAssets(dir, prefix = '') {
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

function checkArtifactBytes({ worker, assets }) {
  requireGate(Buffer.isBuffer(worker) && worker.length === 649612 && sha256(worker) === workerSha, 'WORKER_JS_PIN');
  requireGate(assets instanceof Map && assets.size === 30, 'UI_ASSET_COUNT');
  const files = [...assets].sort(([a], [b]) => a.localeCompare(b, 'en-US'))
    .map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: sha256(bytes) }));
  requireGate(files.reduce((sum, file) => sum + file.bytes, 0) === 392398 &&
    sha256(JSON.stringify(files) + '\n') === assetsSha, 'UI_ASSET_MANIFEST_PIN');
}

export async function loadArtifacts({ sourceDir, artifactDir }) {
  await sourceConfig(sourceDir);
  const js = join(artifactDir, 'portable-worker', moduleName);
  const ui = join(artifactDir, 'assets');
  requireGate((await lstat(js)).isFile() && (await lstat(ui)).isDirectory(), 'SEALED_ARTIFACT_LAYOUT');
  const artifacts = { worker: await readFile(js), assets: new Map(await readAssets(ui)) };
  checkArtifactBytes(artifacts);
  return artifacts;
}

export async function prepareArtifacts({ sourceDir, artifactDir }) {
  sourceDir = await realpath(sourceDir);
  artifactDir = resolve(artifactDir);
  await sourceConfig(sourceDir);
  execFileSync('git', ['diff', '--exit-code', 'HEAD', '--'], { cwd: sourceDir, stdio: 'ignore' });
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
    execFileSync(process.execPath, [join(ui, 'node_modules/vite/bin/vite.js'), 'build'], { cwd: ui, env, stdio: 'inherit' });
    execFileSync(process.execPath, [join(wrangler, 'bin/wrangler.js'), 'deploy', '--dry-run',
      '--config', 'wrangler.new-core-test.jsonc', '--outdir', scratch], { cwd: join(sourceDir, 'apps/lythaus-admin-api'), env, stdio: 'inherit' });
    const artifacts = { worker: await readFile(join(scratch, moduleName)), assets: new Map(await readAssets(dist)) };
    checkArtifactBytes(artifacts);
    await mkdir(join(artifactDir, 'portable-worker'));
    await writeFile(join(artifactDir, 'portable-worker', moduleName), artifacts.worker, { flag: 'wx' });
    await cp(dist, join(artifactDir, 'assets'), { recursive: true, force: false, errorOnExist: true });
    return await loadArtifacts({ sourceDir, artifactDir });
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

function expectedBindings(audience, issuer) {
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

function checkWorker(worker, id) {
  requireGate(Object.values(workerBoundaryEvidence(worker,id,name).checks).every(Boolean), 'WORKER_EXPOSURE_OR_LOGGING');
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

async function uploadAssets(assets, request, journal) {
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

export async function stageWorker({ artifacts, request, audience, issuer, journal }) {
  checkArtifactBytes(artifacts);
  const bindings = expectedBindings(audience, issuer);
  const workers = account + '/workers';
  const created = await request(workers, { method: 'POST', body: {
    name, subdomain: { enabled: false, previews_enabled: false }, logpush: false, tail_consumers: [],
    observability: { enabled: false, logs: { enabled: false, invocation_logs: false }, traces: { enabled: false } },
  } });
  const workerId = created?.id;
  requireGate(typeof workerId === 'string' && workerIdPattern.test(workerId), 'WORKER_CREATE_ID');
  await journal('worker_created', { workerId });
  const workerPath = workers + '/' + workerId;
  const worker = await request(workerPath, { method: 'GET' });
  checkWorker(worker, workerId);
  requireGate(worker.deployed_on == null, 'WORKER_ALREADY_DEPLOYED');
  const versions = await request(workerPath + '/versions', { method: 'GET' });
  requireGate(Array.isArray(versions) && versions.length === 0, 'WORKER_HAS_EXISTING_VERSION');
  const modules = [asModule(moduleName, artifacts.worker, 'application/javascript+module'),
    ...Object.keys(controlHashes).map(key => asModule(key, artifacts.assets.get(key), 'text/plain'))];
  async function stage(bindings) {
    const jwt = await uploadAssets(artifacts.assets, request, journal);
    const version = await request(workerPath + '/versions?deploy=false', { method: 'POST', body: {
      annotations: { 'workers/tag': sourceSha }, main_module: moduleName, modules, bindings,
      compatibility_date: '2026-07-27', compatibility_flags: ['nodejs_compat'],
      assets: { jwt, config: { run_worker_first: true, not_found_handling: 'single-page-application' } },
    } });
    const versionId = version?.id;
    requireGate(typeof versionId === 'string' && uuid.test(versionId), 'WORKER_VERSION_ID');
    await journal('worker_version_staged', { workerId, versionId });
    const stagedWorker = await request(workerPath, { method: 'GET' });
    checkWorker(stagedWorker, workerId);
    requireGate(stagedWorker.deployed_on === null, 'WORKER_PREMATURE_DEPLOYMENT');
    return versionId;
  }
  const key = randomBytes(32);
  let parentVersionId;
  try {
    bindings.at(-1).text = key.toString('base64');
    parentVersionId = await stage(bindings);
  } finally {
    delete bindings.at(-1).text;
    key.fill(0);
  }
  await verifyWorkerVersion({ request, workerId, versionId:parentVersionId, audience, issuer, versionNumber:1 });
  const inherited = bindings.map(binding => binding.name === 'ACCESS_SUBJECT_HMAC_KEY'
    ? { name:binding.name, type:'inherit', version_id:parentVersionId } : binding);
  const versionId = await stage(inherited);
  requireGate(versionId !== parentVersionId, 'WORKER_INHERITANCE_VERSION');
  return { workerId, parentVersionId, versionId, tag:sourceSha };
}

export async function verifyWorkerVersion({ request, workerId, versionId, audience, issuer, versionNumber = 2 }) {
  requireGate(workerIdPattern.test(workerId) && uuid.test(versionId), 'WORKER_READBACK_IDS');
  const path = account + '/workers/' + workerId;
  checkWorker(await request(path, { method: 'GET' }), workerId);
  const version = await request(path + '/versions/' + versionId + '?include=modules', { method: 'GET' });
  requireGate(version?.id === versionId && version.number === versionNumber && version.annotations?.['workers/tag'] === sourceSha &&
    version.main_module === moduleName && version.compatibility_date === '2026-07-27' &&
    JSON.stringify(version.compatibility_flags) === '["nodejs_compat"]' &&
    Array.isArray(version.urls) && version.urls.length === 0 &&
    version.assets?.config?.run_worker_first === true &&
    version.assets.config.not_found_handling === 'single-page-application', 'WORKER_VERSION_CONFIGURATION');
  const expected = expectedBindings(audience, issuer);
  const actual = version.bindings;
  requireGate(Array.isArray(actual) && actual.length === expected.length &&
    expected.every(binding => actual.some(value => Object.keys(value).length === Object.keys(binding).length &&
      Object.entries(binding).every(([key, val]) => value[key] === val))), 'WORKER_VERSION_BINDINGS');
  const expectedModules = { [moduleName]: workerSha, ...controlHashes };
  requireGate(Array.isArray(version.modules) && version.modules.length === 3 && Object.entries(expectedModules).every(([name, hash]) =>
    version.modules.some(mod => mod.name === name && mod.content_type === (name === moduleName ? 'application/javascript+module' : 'text/plain') &&
      typeof mod.content_base64 === 'string' && sha256(Buffer.from(mod.content_base64, 'base64')) === hash)), 'WORKER_VERSION_MODULES');
  return { workerId, versionId, tag: sourceSha, hmacBindingPresent: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [action, sourceDir, artifactDir] = process.argv.slice(2);
  requireGate((action === 'prepare' || action === 'verify') && sourceDir && artifactDir && process.argv.length === 5,
    'Usage: node ' + basename(process.argv[1]) + ' prepare|verify SOURCE_DIR ARTIFACT_DIR');
  const operation = action === 'prepare' ? prepareArtifacts : loadArtifacts;
  await operation({ sourceDir, artifactDir });
  console.log(JSON.stringify({ sourceSha, workerSha, assetsSha, configSha, assetCount: 30, assetBytes: 392398 }));
}
