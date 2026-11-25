import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createSetupClient } from './new-core-isolated-cloudflare.mjs';
import { loadArtifacts, stageWorker } from './new-core-isolated-worker.mjs';

// Independent protocol anchors. The Cloudflare Worker-ID JSON API stages a first
// version and creates a deployment separately. Wrangler's script API is distinct.
// cloudflare/api-schemas@10837344ff6c5abd1d5602f1aeebe82ef353fa32
//   openapi.json: createWorkerVersion, workers_Version, workers_bindings
// cloudflare/cloudflare-typescript@0eb9ef0ea40c1fe38e4b19be92f41bd7466bc1d6
//   src/resources/workers/beta/workers/versions.ts: VersionCreateParams
// cloudflare/workers-sdk@87fd28ce586693e50aa17d410f121394c5fef24c
//   packages/workers-shared/utils/tests/parseRedirects.invalid.test.ts:288
// cloudflare/cloudflare-docs@ba6cea1c73a2f88328b6325d90c3fd3dcc618778
//   workers/platform/infrastructure-as-code.mdx:592; static-assets/direct-upload.mdx:142
const [sourceDir, artifactDir, mode] = process.argv.slice(2);
assert.ok(sourceDir && artifactDir && process.argv.length <= 5 && (!mode || mode === '--repair'),
  'Pass pinned source and prepared artifact directories, optionally followed by --repair');
const repair = mode === '--repair';
const pins = repair ? (await import('./new-core-isolated-repair-pins.mjs')).REPAIR_PINS : undefined;
if (repair) assert.ok(pins, 'Repair source and artifacts require a reviewed pin');
const artifacts = await loadArtifacts({ sourceDir, artifactDir, pins });
const sha = value => createHash('sha256').update(value).digest('hex');
const tag = pins?.sourceSha ?? '3fbaea846f67fe5ad452d53c456b5355069757ca';
const issuer = 'https://fixture.cloudflareaccess.com';
const audience = 'a'.repeat(64);
const hostname = 'admin-new-core-test.lythaus.co';
const workerName = 'lythaus-admin-api-new-core-test';
const workerId = repair ? '89391a349e454b3994bd43299c6386ed' : 'd'.repeat(32);
const parentId = repair ? '37f36eb4-911d-4c51-b723-751329cd1b92' : '22222222-2222-4222-b222-222222222222';
const childId = '33333333-3333-4333-b333-333333333333';
const api = 'https://api.cloudflare.com/client/v4/accounts/e5b7ae46e04698f507b7e4b3d4ef1af0/workers';
const versions = `${api}/workers/${workerId}/versions`;
const sessionToken = 'fixture.e30.session';
const completedToken = 'fixture.e30.complete';
const accountToken = 'only-a-fixture-account-token';
const entry = 'isolated-entry.js';
const app = 'new-core-test-worker.js';
const subjectKey = 'ACCESS_SUBJECT_HMAC_KEY';
const assetsConfig = { run_worker_first: true, not_found_handling: 'single-page-application' };
const moduleBodies = new Map([
  [entry, Buffer.from("export { default } from './new-core-test-worker.js';\n")],
  [app, artifacts.worker], ['_headers', artifacts.assets.get('_headers')],
]);
assert.equal(sha(moduleBodies.get(app)), pins?.workerSha ?? '6a276e4b4ed3883b2c00c8b089149b7b14cfebf3ce3811f0a799ff686e9101b3');
assert.equal(sha(moduleBodies.get('_headers')), '7ac87b1130bcb67b1a6c6a8064e0b64b73ef5f561af7fe474c9bab7575b427b1');
assert.equal(artifacts.assets.get('_redirects').toString(), '/* /index.html 200\n');
const modules = [...moduleBodies].map(([name, bytes]) => ({
  name, content_type: name === '_headers' ? 'text/plain' : 'application/javascript+module',
  content_base64: bytes.toString('base64'),
}));
const bindings = [
  ...Object.entries({ ENVIRONMENT: 'owner-testing', EXPECTED_HOSTNAMES: hostname,
    CORS_ALLOWED_ORIGINS: `https://${hostname}`, HYPERDRIVE_QUERY_CACHE_MODE: 'disabled',
    ACCESS_AUDIENCES: audience, ACCESS_TEAM_DOMAIN: new URL(issuer).host,
    ACCESS_JWKS_URL: `${issuer}/cdn-cgi/access/certs`, NEW_CORE_ACCESS_ISSUER: issuer,
    NEW_CORE_ACCESS_AUDIENCE_SHA256: sha(audience) }).map(([name, text]) => ({ name, text, type: 'plain_text' })),
  { name: 'ASSETS', type: 'assets' }, { name: 'WORKER_VERSION', type: 'version_metadata' },
  { name: 'DB_ADMIN_FRESH', type: 'hyperdrive', id: '7e39fc4a286147988ed12df7a6322616' },
  { name: subjectKey, type: 'secret_text' },
];

function requireWire(test, category) {
  if (!test) throw new Error(category);
}
const exactKeys = (value, keys) => Object.keys(value).sort().join('|') === keys.slice().sort().join('|');
function verifyWire(url, request, child) {
  requireWire(url === `${versions}?deploy=false` && request.method === 'POST', 'nonserving_version_request');
  requireWire(request.redirect === 'error' && request.headers.get('content-type') === 'application/json'
    && request.headers.get('authorization') === `Bearer ${accountToken}`, 'request_transport');
  const body = JSON.parse(request.body);
  requireWire(exactKeys(body, ['annotations','main_module','modules','bindings','compatibility_date','compatibility_flags','assets']),
    'version_body_fields');
  requireWire(body.annotations?.['workers/tag'] === tag && Buffer.byteLength(tag) <= 100, 'version_tag');
  requireWire(body.main_module === entry && body.compatibility_date === '2026-07-27'
    && JSON.stringify(body.compatibility_flags) === '["nodejs_compat"]', 'runtime_contract');
  requireWire(body.modules?.length === modules.length && modules.every(expected =>
    body.modules.some(row => exactKeys(row, Object.keys(expected)) && Object.entries(expected).every(([k,v]) => row[k] === v))),
  'module_contract');
  requireWire(body.assets?.jwt === completedToken && exactKeys(body.assets.config, Object.keys(assetsConfig))
    && Object.entries(assetsConfig).every(([k,v]) => body.assets.config[k] === v), 'assets_contract');
  requireWire(body.bindings?.length === bindings.length && bindings.filter(b => b.name !== subjectKey).every(expected =>
    body.bindings.some(b => exactKeys(b, Object.keys(expected)) && Object.entries(expected).every(([k,v]) => b[k] === v))),
  'bindings_contract');
  const key = body.bindings.find(b => b.name === subjectKey);
  requireWire(child
    ? key?.type === 'inherit' && key.version_id === parentId && exactKeys(key, ['name','type','version_id'])
    : key?.type === 'secret_text' && exactKeys(key, ['name','type','text']) && /^[A-Za-z0-9+/]{43}=$/.test(key.text),
  'key_lineage');
}

// Simulate only the documented HTTP operations. Never call a native fetch.
const shell = { id: workerId, name: workerName, deployed_on: null, subdomain: { enabled: false, previews_enabled: false },
  logpush: false, tail_consumers: [], references: { domains: [] },
  observability: { enabled: false, logs: { enabled: false, invocation_logs: false }, traces: { enabled: false } } };
const reply = result => Response.json({ success: true, result });
let versionCount = 0;
let indexHash;
let lastAsset = 'none';
let wireFailure;
const versionMessages = new Map();
const apiClient = createSetupClient({ token: accountToken, record: async () => {},
  ...(repair ? {repairOperation: 'stage-isolated-repair'} : {}), fetchImpl: async (url, request) => {
  try {
    if (request.method === 'GET') {
      if (url === `${api}/workers/${workerId}`) return reply(repair ? {...shell, deployed_on: '2026-11-25T12:19:30Z'} : shell);
      if (repair && url === `${versions}/${parentId}?include=modules`) return reply({id: parentId});
      if (url === versions) return reply([...versionMessages.keys()].map(id=>({id})));
      const id = [parentId,childId].find(id => url === `${versions}/${id}?include=modules`);
      if (id && versionMessages.has(id)) return reply({
        id, number: id === parentId ? 4 : 7, urls: [], annotations: { 'workers/tag': tag, 'workers/message': versionMessages.get(id) }, main_module: entry,
        modules, bindings, assets: { config: assetsConfig }, compatibility_date: '2026-07-27', compatibility_flags: ['nodejs_compat'],
      });
    }
    if (!repair && request.method === 'POST' && url === `${api}/workers`) return reply(shell);
    if (request.method === 'POST' && url === `${api}/scripts/${workerName}/assets-upload-session`) {
      const {manifest} = JSON.parse(request.body);
      requireWire(!Object.hasOwn(manifest, '/_headers') && !Object.hasOwn(manifest, '/_redirects'), 'control_files_in_asset_manifest');
      const rows = Object.keys(manifest).sort().map(k => [k, manifest[k].hash, manifest[k].size]);
      if (repair) {
        const {default: blake3} = await import('blake3-wasm');
        const expected = [...artifacts.assets.keys()].filter(path => !['_headers','_redirects'].includes(path)).sort().map(path => {
          const bytes = artifacts.assets.get(path);
          const hash = blake3.hash(bytes.toString('base64') + path.split('.').at(-1)).toString('hex').slice(0, 32);
          return ['/' + path, hash, bytes.length];
        });
        assert.deepEqual(rows, expected);
      } else {
        requireWire(sha(JSON.stringify(rows)) === 'b291534c78b20cbf9d9937ba80cb8ef1df5d8b2fb42fc47596dfb0c006445bff', 'static_manifest');
      }
      indexHash = manifest['/index.html'].hash;
      lastAsset = 'session';
      return reply({ jwt: sessionToken, buckets: [[indexHash]] });
    }
    if (request.method === 'POST' && url === `${api}/assets/upload?base64=true`) {
      const file = request.body.get(indexHash);
      requireWire(lastAsset === 'session' && request.headers.get('authorization') === `Bearer ${sessionToken}`
        && file?.name === indexHash && file.type === 'text/html; charset=utf-8'
        && (await file.text()) === artifacts.assets.get('index.html').toString('base64'), 'asset_upload');
      lastAsset = 'complete';
      return Response.json({ success: true, result: { jwt: completedToken } }, { status: 201 });
    }
    if (request.method === 'POST' && url.startsWith(versions)) {
      requireWire(lastAsset === 'complete' && versionCount < (repair ? 1 : 2), 'stage_sequence');
      const child = repair || versionCount === 1;
      verifyWire(url, request, child);
      const message = JSON.parse(request.body).annotations['workers/message'];
      assert.match(message, new RegExp('^lythaus-isolated [a-f0-9-]{36} ' + (child ? parentId : 'parent') + '$'));
      versionMessages.set(child ? childId : parentId, message);
      for (const [category, corrupt] of [
        ['runtime_contract', b => { b.main_module = app; }],
        ['module_contract', b => { b.modules[0].content_type = 'text/plain'; }],
        ['module_contract', b => { b.modules.push({ name: '_redirects', content_type: 'text/plain', content_base64: 'YWJj' }); }],
        ['assets_contract', b => { b.assets.jwt = sessionToken; }],
        ['key_lineage', b => { b.bindings.find(binding => binding.name === subjectKey).version_id = childId; }],
      ]) {
        const invalid = JSON.parse(request.body);
        corrupt(invalid);
        assert.throws(() => verifyWire(url, { ...request, body: JSON.stringify(invalid) }, child), { message: category });
      }
      assert.throws(() => verifyWire(`${versions}?deploy=true`, request, child), {message: 'nonserving_version_request'});
      lastAsset = 'none';
      versionCount++;
      return reply({ id: child ? childId : parentId });
    }
    throw new Error('unexpected_provider_operation');
  } catch (error) {
    wireFailure = error;
    throw error;
  }
} });
try {
  if (repair) {
    const {uploadAssets} = await import('./new-core-isolated-worker.mjs');
    const {repairVersionBody} = await import('./new-core-isolated-repair.mjs');
    const workerPath = '/accounts/e5b7ae46e04698f507b7e4b3d4ef1af0/workers/workers/' + workerId;
    await apiClient.request(workerPath);
    await apiClient.request(workerPath + '/versions/' + parentId + '?include=modules');
    apiClient.selectRecordedWorker();
    apiClient.selectLineage(parentId);
    const jwt = await uploadAssets(artifacts.assets, apiClient.request, async () => {});
    const body = repairVersionBody({artifacts, pins, audience, issuer, intentId:'44444444-4444-4444-8444-444444444444', jwt});
    await apiClient.request(workerPath + '/versions?deploy=false', {method:'POST', body});
  } else {
    await stageWorker({ artifacts, request: apiClient.request, audience, issuer, journal: async () => {} });
  }
} catch (error) { throw wireFailure ?? error; }
assert.equal(versionCount, repair ? 1 : 2);
console.log(repair ? 'Verified the serialized repair upload inherited the serving child key. Provider requests: 0.' :
  'Worker write-contract test passed for the serialized parent and inherited child. Provider requests: 0.');
