import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import blake3 from 'blake3-wasm';
import { loadArtifacts, stageWorker, verifyWorkerVersion } from './new-core-isolated-worker.mjs';

const [sourceDir, artifactDir] = process.argv.slice(2);
assert(sourceDir && artifactDir, 'Pass a pinned source checkout and prepared artifacts');
const artifacts = await loadArtifacts({ sourceDir, artifactDir });
const issuer = 'https://fixture.cloudflareaccess.com';
const audience = 'a'.repeat(64);
const workerId = '89391a349e454b3994bd43299c6386ed';
const versionId = '22222222-2222-4222-b222-222222222222';
const inheritedId = '33333333-3333-4333-b333-333333333333';
const account = '/accounts/e5b7ae46e04698f507b7e4b3d4ef1af0/workers';
const name = 'lythaus-admin-api-new-core-test';
const prefix = account + '/workers/' + workerId;
const jwt = claims => 'fixture.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.fixture';
const checksum = (bytes, extension) => blake3.hash(bytes.toString('base64') + extension).toString('hex').slice(0, 32);

function fixture(mode, fault) {
  const calls = [], wanted = new Set(), uploaded = new Set();
  const versions = new Map();
  let worker, version;
  const sessionToken = jwt({ wrangler_single_asset_uploads: mode === 'single' });
  const completionToken = jwt({ complete: true });
  async function request(path, { method, body, headers }) {
    calls.push(method + ' ' + path);
    if (method === 'POST' && path === account + '/workers') {
      assert.deepEqual(body.subdomain, { enabled: false, previews_enabled: false });
      worker = { ...body, id: workerId, references: { domains: [] }, deployed_on: null };
      if (fault === 'preview') worker.subdomain.previews_enabled = true;
      return worker;
    }
    if (method === 'GET' && path === prefix) return worker;
    if (method === 'GET' && path === account + '/scripts/' + name + '/script-settings')
      return {logpush:false, observability:null, tail_consumers:[]};
    if (method === 'GET' && path === prefix + '/versions') return fault === 'existing' ? [{ id: versionId }] : [...versions.keys()].reverse().map(id=>({id}));
    if (path === account + '/scripts/' + name + '/assets-upload-session') {
      assert.equal(method, 'POST');
      const expected = [...artifacts.assets].filter(([file]) => file !== '_headers' && file !== '_redirects');
      assert.deepEqual(Object.keys(body.manifest).sort(), expected.map(([key]) => '/' + key).sort());
      const manifest = Object.keys(body.manifest).sort().map(path => [path, body.manifest[path].hash, body.manifest[path].size]);
      assert.equal(createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),
        'b291534c78b20cbf9d9937ba80cb8ef1df5d8b2fb42fc47596dfb0c006445bff');
      for (const [file, bytes] of expected) {
        const hash = checksum(bytes, file.split('.').at(-1));
        assert.deepEqual(body.manifest['/' + file], { hash, size: bytes.length });
        wanted.add(hash);
      }
      const hashes = [...wanted];
      if (fault === 'unknown_hash') hashes.push('f'.repeat(32));
      const buckets = mode === 'cached' ? [] : [hashes.slice(0, 3), hashes.slice(3)];
      if (version) return { jwt: completionToken, buckets: [] };
      return { jwt: mode === 'cached' ? completionToken : sessionToken, buckets };
    }
    if (path.startsWith(account + '/assets/upload')) {
      assert.equal(method, 'POST');
      assert.equal(headers.Authorization, 'Bearer ' + sessionToken);
      if (mode === 'single') {
        const hash = path.split('/').at(-1);
        assert(wanted.has(hash) && !uploaded.has(hash) && body instanceof Blob);
        const bytes = Buffer.from(await body.arrayBuffer());
        assert([...artifacts.assets].some(([file, actual]) => actual.equals(bytes) && checksum(actual, file.split('.').at(-1)) === hash));
        uploaded.add(hash);
      } else {
        assert.equal(path, account + '/assets/upload?base64=true');
        for (const [hash, file] of body.entries()) {
          assert(wanted.has(hash) && !uploaded.has(hash));
          const bytes = Buffer.from(await file.text(), 'base64');
          assert([...artifacts.assets].some(([path, actual]) => actual.equals(bytes) && checksum(actual, path.split('.').at(-1)) === hash));
          uploaded.add(hash);
        }
      }
      return uploaded.size === wanted.size && fault !== 'incomplete' ? { jwt: completionToken } : {};
    }
    if (method === 'POST' && path === prefix + '/versions?deploy=false') {
      assert.equal(body.assets.jwt, completionToken);
      assert(mode === 'cached' || uploaded.size === wanted.size);
      const bindings = structuredClone(body.bindings);
      const secret = bindings.find(row => row.name === 'ACCESS_SUBJECT_HMAC_KEY');
      const parent = version;
      if (parent && fault === 'child_rejection') throw new Error('child_rejected');
      if (parent) {
        assert.deepEqual(secret, { name:'ACCESS_SUBJECT_HMAC_KEY', type:'inherit', version_id:parent.id });
        if (fault !== 'inheritance_missing') secret.type = 'secret_text';
        delete secret.version_id;
      } else {
        assert.equal(secret.type, 'secret_text');
        assert.equal(Buffer.from(secret.text, 'base64').length, 32);
        delete secret.text;
      }
      const { assets, modules, ...fields } = body;
      version = { ...fields, modules: structuredClone(modules), bindings, assets: { config: assets.config },
        urls: [], number: parent ? 9 : 4, id: parent && fault !== 'same_version' ? inheritedId : versionId };
      if (fault === 'tampered_module') version.modules[0].content_base64 = 'dGFtcGVyZWQ=';
      if (fault === 'extra_binding') version.bindings.push({ type: 'plain_text', name: 'EXTRA', text: 'fixture' });
      if (fault === 'active') worker.deployed_on = '2026-01-01T00:00:00Z';
      versions.set(version.id,version);
      if (fault === 'lost_parent_ack' && !parent || fault === 'lost_child_ack' && parent) throw new Error('lost_ack');
      if (fault === 'malformed_parent_ack' && !parent) return {id:null};
      return { id: version.id };
    }
    if (method === 'GET') for (const [id,row] of versions) if (path === prefix + '/versions/' + id + '?include=modules') return row;
    throw new Error('Unexpected fixture endpoint');
  }
  return { request, calls, clearFault:()=>{fault='';} };
}

async function rehearse(mode, fault) {
  const { request, calls } = fixture(mode, fault);
  const journal = async (_step, details) => {
    assert(Object.keys(details).every(key => ['workerId','versionId','intentId','parentVersionId'].includes(key)));
  };
  const staged = await stageWorker({ artifacts, request, audience, issuer, journal });
  const readback = await verifyWorkerVersion({ ...staged, request, audience, issuer });
  assert.equal(staged.parentVersionId, versionId);
  assert.equal(readback.versionId, inheritedId);
  assert(readback.hmacBindingPresent && calls.length >= 8);
}

for (const mode of ['bulk', 'single', 'cached']) await rehearse(mode);
for (const [fault, code] of Object.entries({
  preview: 'WORKER_EXPOSURE_OR_LOGGING', existing: 'WORKER_HAS_EXISTING_VERSION',
  unknown_hash: 'WORKER_ASSET_UNKNOWN_HASH', incomplete: 'WORKER_ASSET_COMPLETION_TOKEN_MISSING',
  tampered_module: 'WORKER_VERSION_MODULES', extra_binding: 'WORKER_VERSION_BINDINGS',
  active: 'WORKER_PREMATURE_DEPLOYMENT',
  inheritance_missing: 'WORKER_VERSION_BINDINGS', same_version: 'WORKER_INHERITANCE_VERSION',
})) await assert.rejects(() => rehearse('bulk', fault), { message: code });

for (const fault of ['lost_parent_ack','malformed_parent_ack','lost_child_ack','child_rejection']) {
  const {request,calls,clearFault} = fixture('cached',fault);
  const receipts = new Map();
  const args = {artifacts,request,audience,issuer,journal:async (step,row)=>receipts.set(step,row)};
  const posts = () => calls.filter(call=>call.startsWith('POST')).length;
  await assert.rejects(stageWorker(args), {message:fault === 'child_rejection' ? 'child_rejected' :
    fault === 'malformed_parent_ack' ? 'WORKER_VERSION_ID' : 'lost_ack'});
  const afterLoss = posts();
  clearFault();
  const resume = {...args,existingWorkerId:workerId,singleStage:true,
    parentIntent:receipts.get('worker_parent_intent').intentId,
    childIntent:fault === 'lost_child_ack' ? receipts.get('worker_child_intent').intentId : undefined,
    selectLineage:(parent,child)=>{ assert.equal(parent,versionId); if (child) assert.equal(child,inheritedId); }};
  await assert.rejects(stageWorker({...resume,parentIntent:inheritedId}), /WORKER_LINEAGE_AMBIGUOUS/);
  assert.equal(posts(),afterLoss);
  const result=await stageWorker(resume);
  assert.equal(result.checkpoint,'CHILD_CREATED_AND_VERIFIED');
  assert.equal(result.parentVersionId,versionId);
  assert.equal(posts()-afterLoss,fault==='lost_child_ack' ? 0 : 2);
  const beforeRepeat=posts();
  await stageWorker({...resume,childIntent:receipts.get('worker_child_intent').intentId});
  assert.equal(posts(),beforeRepeat);
}
{
  const {request,calls}=fixture('cached');
  const parent=await stageWorker({artifacts,request,audience,issuer,journal:async()=>{},singleStage:true});
  assert.equal(parent.checkpoint,'PARENT_CREATED_AND_VERIFIED');
  assert.equal(calls.filter(call=>call.endsWith('/versions?deploy=false')).length,1);
}
for (const fault of ['extra_binding','tampered_module','active']) {
  const {request,calls}=fixture('cached',fault);
  await assert.rejects(stageWorker({artifacts,request,audience,issuer,journal:async()=>{}}));
  assert.equal(calls.filter(call=>call.endsWith('/versions?deploy=false')).length,1);
  assert.ok(!calls.some(call=>call.includes('/deployments')));
}
const altered = { ...artifacts, assets: new Map(artifacts.assets) };
altered.assets.set('_headers', Buffer.alloc(artifacts.assets.get('_headers').length));
await assert.rejects(() => stageWorker({ artifacts: altered, request: assert.fail, audience, issuer, journal: assert.fail }),
  { message: 'UI_ASSET_MANIFEST_PIN' });
console.log('Worker version inheritance and asset upload fixtures passed. No provider calls.');
