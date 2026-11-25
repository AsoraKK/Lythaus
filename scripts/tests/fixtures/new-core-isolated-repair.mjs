import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {mock} from 'node:test';
import {
  RECORDED_WORKER, RECORDED_WORKER_ID, SCRIPT, ZONE, createSetupClient,
} from '../../ci/new-core-isolated-cloudflare.mjs';
import * as sealedWorker from '../../ci/new-core-isolated-worker.mjs';
import {TARGET} from '../../ci/lythaus-new-core-isolation-review.mjs';
import {priorRepairPins, priorRepairState as predecessor} from '../../ci/new-core-isolated-repair-state.mjs';

const prior = {
  parentIntent:'d340cb66-cb62-4c87-ab64-400a7cf79c01', ackParent:'44cd6e04-15d7-467c-9d93-ff59d5d4fe0c',
  childIntent:'49503582-9aff-4d20-a6f2-888d10d1a92a', childParent:'44cd6e04-15d7-467c-9d93-ff59d5d4fe0c',
  ackChild:'37f36eb4-911d-4c51-b723-751329cd1b92', activationTarget:'37f36eb4-911d-4c51-b723-751329cd1b92',
  deploymentId:'307f3dcc-41f3-42e2-be4b-ad2a519ec51c', dnsId:'f934c861412f949f274856fd0282e328',
  routeId:'dab9759ef67e45b7bafa07e25817f7f2',
};
const candidate = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const deploymentId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const unexpectedId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const audience = 'a'.repeat(64);
const issuer = 'https://fixture.cloudflareaccess.com';
const digest = input => createHash('sha256').update(input).digest('hex');
const artifactRoot = new URL('../../../apps/control-panel/public/', import.meta.url);
const worker = Buffer.from('export default {fetch(){return new Response("isolated repair fixture")}}');
const assets = new Map([['_headers', await readFile(new URL('_headers', artifactRoot))],
  ['_redirects', await readFile(new URL('_redirects', artifactRoot))], ['index.html', Buffer.from('<p>fixture</p>')] ]);
const files = [...assets].sort(([a], [b]) => a.localeCompare(b, 'en-US'))
  .map(([path, bytes]) => ({path, bytes:bytes.length, sha256:digest(bytes)}));
const pins = {sourceSha:'e'.repeat(40), workerSha:digest(worker), workerBytes:worker.length,
  assetsSha:digest(JSON.stringify(files) + '\n'), assetCount:files.length, assetBytes:files.reduce((n, f) => n + f.bytes, 0)};
const artifacts = {worker, assets};
const originalSource = '3fbaea846f67fe5ad452d53c456b5355069757ca';
const originalDeployment = {id:prior.deploymentId, created_on:'2026-11-25T12:19:00Z',
  annotations:{}, strategy:'percentage', versions:[{version_id:prior.ackChild, percentage:100}]};
const precedingDeployment = {id:predecessor.deploymentId, created_on:'2026-11-25T19:00:00Z', strategy:'percentage',
  annotations:{'workers/message':'lythaus-isolated-repair ' + predecessor.activationIntent},
  versions:[{version_id:predecessor.versionId, percentage:100}]};
const baseline = [precedingDeployment,originalDeployment];
const shell = {id:RECORDED_WORKER_ID, name:TARGET.worker, deployed_on:precedingDeployment.created_on,
  subdomain:{enabled:false, previews_enabled:false}, logpush:false, tail_consumers:[], references:{domains:[]},
  observability:{enabled:false, logs:{enabled:false, invocation_logs:false}, traces:{enabled:false}}};

// Passing the two retained bundles also checks their real historical module hashes.
const oldWorker = process.argv[2] ? await readFile(process.argv[2]) : null;
const precedingWorker = process.argv[3] ? await readFile(process.argv[3]) : Buffer.from('synthetic previously activated module');
if (!oldWorker || !process.argv[3]) mock.module('../../ci/new-core-isolated-worker.mjs', {namedExports:{...sealedWorker,
  async verifyWorkerVersion(args) {
    if (!process.argv[3] && args.versionId === predecessor.versionId) {
      assert.deepEqual(args.pins,priorRepairPins);
      return sealedWorker.verifyWorkerVersion({...args,pins:{...args.pins,workerSha:digest(precedingWorker)}});
    }
    return sealedWorker.verifyWorkerVersion(args);
  },
  async readLineage(args) {
    if (oldWorker) return sealedWorker.readLineage(args);
    const {request, versions} = args;
    assert.equal(args.workerId, RECORDED_WORKER_ID);
    assert.deepEqual(versions.map(v => v.id).sort(), [prior.ackParent, prior.ackChild].sort());
    assert.equal((await request(RECORDED_WORKER, {method:'GET'})).id, RECORDED_WORKER_ID);
    const [parent, child] = await Promise.all([prior.ackParent, prior.ackChild]
      .map(id => request(RECORDED_WORKER + '/versions/' + id + '?include=modules', {method:'GET'})));
    return {parent:{versionId:parent.id, number:parent.number, intentId:prior.parentIntent},
      child:{versionId:child.id, number:child.number, intentId:prior.childIntent, parentVersionId:parent.id}};
  },
}});
const {runIsolatedRepair, assertRoutedLineage} = await import('../../ci/new-core-isolated-repair.mjs');

function fixture() {
  const module = (name, bytes, content_type) => ({name, content_base64:bytes.toString('base64'), content_type});
  function originalVersion(id, number, message, bytes=oldWorker, source=originalSource) {
    if (!bytes) return {id, number};
    return {id, number, urls:[], main_module:'isolated-entry.js', compatibility_date:'2026-07-27',
      compatibility_flags:['nodejs_compat'], annotations:{'workers/tag':source, 'workers/message':message},
      bindings:sealedWorker.expectedBindings(audience, issuer), assets:{config:{run_worker_first:true, not_found_handling:'single-page-application'}},
      modules:[module('isolated-entry.js', Buffer.from("export { default } from './new-core-test-worker.js';\n"), 'application/javascript+module'),
        module('new-core-test-worker.js', bytes, 'application/javascript+module'),
        module('_headers', assets.get('_headers'), 'text/plain')]};
  }
  const state = {
    versions:new Map([[prior.ackParent, originalVersion(prior.ackParent, 1, 'lythaus-isolated ' + prior.parentIntent + ' parent')],
      [prior.ackChild, originalVersion(prior.ackChild, 2, 'lythaus-isolated ' + prior.childIntent + ' ' + prior.ackParent)],
      [predecessor.versionId, originalVersion(predecessor.versionId, 3, 'lythaus-isolated ' + predecessor.intentId + ' ' + prior.ackChild,
        precedingWorker,predecessor.sourceSha)]]),
    deployments:structuredClone(baseline), receipts:[], writes:[], boundaries:[], fault:null,
  };
  const deploymentPath = SCRIPT + '/deployments';
  const stagePath = RECORDED_WORKER + '/versions?deploy=false';
  async function transport(url, options) {
    const endpoint = new URL(url);
    assert.equal(endpoint.origin, 'https://api.cloudflare.com');
    const path = endpoint.pathname.slice('/client/v4'.length) + endpoint.search;
    const method = options.method;
    const body = options.body ? JSON.parse(options.body) : null;
    let result;
    if (method === 'GET') {
      if (path === RECORDED_WORKER) result = shell;
      else if (path === SCRIPT + '/script-settings') result = {logpush:false, observability:null, tail_consumers:null};
      else if (path === SCRIPT + '/subdomain') result = {enabled:false, previews_enabled:false};
      else if (path === deploymentPath) result = {deployments:state.deployments};
      else if (path === RECORDED_WORKER + '/versions?per_page=100&page=1') {
        result = [...state.versions.keys()].map(id => ({id}));
      } else if (path.startsWith(RECORDED_WORKER + '/versions/') && endpoint.search === '?include=modules') {
        result = state.versions.get(endpoint.pathname.split('/').at(-1));
      } else if (path === ZONE + '/workers/routes') {
        result = [{id:prior.routeId, pattern:TARGET.hostname + '/*', script:TARGET.worker}];
      } else if (path === ZONE + '/dns_records?name=' + TARGET.hostname + '&per_page=100&page=1') {
        result = [{id:prior.dnsId, name:TARGET.hostname, type:'A', content:'192.0.2.1', proxied:true, ttl:1}];
      } else assert.fail('unexpected repair read ' + path);
    } else {
      state.writes.push(path);
      assert.equal(method, 'POST');
      if (path === SCRIPT + '/assets-upload-session') {
        assert.ok(body.manifest['/index.html']);
        if (state.fault === 'inventory_after_assets') state.versions.set(unexpectedId, {id:unexpectedId});
        if (state.fault === 'deployment_after_assets') state.deployments[0].id = unexpectedId;
        result = {buckets:[], jwt:'a.e30.b'};
      } else if (path === stagePath) {
        assert.equal(state.deployments[0].id, predecessor.deploymentId);
        assert.equal(state.deployments[0].versions[0].version_id, predecessor.versionId);
        const name = 'ACCESS_SUBJECT_HMAC_KEY';
        assert.deepEqual(body.bindings.filter(binding => binding.name === name),
          [{name, type:'inherit', version_id:predecessor.versionId}]);
        assert.equal(body.annotations['workers/message'].split(' ')[2],predecessor.versionId);
        assert.equal(body.annotations['workers/tag'], pins.sourceSha);
        assert.equal(body.main_module, 'isolated-entry.js');
        assert.equal(body.assets.config.run_worker_first, true);
        const bindings = body.bindings.map(binding => binding.name === name ? {name, type:'secret_text'} : binding);
        const version = {...body, bindings, id:candidate, number:4, urls:[], assets:{config:body.assets.config}};
        state.versions.set(candidate, version);
        if (state.fault === 'version_ack_lost') throw new Error('private fixture transport detail');
        result = {id:candidate};
      } else if (path === deploymentPath) {
        assert.deepEqual(body.versions, [{version_id:candidate, percentage:100}]);
        assert.equal(body.strategy, 'percentage');
        assert.match(body.annotations['workers/message'], /^lythaus-isolated-repair [a-f0-9-]{36}$/);
        state.deployments.unshift({...body, id:deploymentId, created_on:'2026-11-25T20:00:00Z'});
        if (state.fault === 'deployment_ack_lost') throw new Error('private fixture transport detail');
        result = {id:deploymentId};
      } else assert.fail('unexpected repair write ' + path);
    }
    return Response.json({success:true, result});
  }
  async function run(operation, repairReceipt, overrides = {}) {
    const api = createSetupClient({token:'fixture-origin', record:() => {}, repairOperation:operation, fetchImpl:transport});
    const checkBoundary = async () => {
      const id = state.deployments[0].versions[0].version_id;
      state.boundaries.push(id);
      return {audience, issuer, servingVersionId:id, servingSourceSha:id === predecessor.versionId ? predecessor.sourceSha : pins.sourceSha};
    };
    return runIsolatedRepair({operation, api, artifacts, pins, prior, predecessor, repairReceipt, checkBoundary,
      journal:async receipt => state.receipts.push(structuredClone(receipt)), ...overrides});
  }
  return {state, run, stagePath, deploymentPath};
}

const stage = 'stage-isolated-repair';
const activate = 'activate-isolated-repair';
const reconcile = 'reconcile-isolated-repair';

{
  const {run, state} = fixture();
  assert.deepEqual(await run(reconcile), {status:'REPAIR_BASELINE_VERIFIED', workerId:RECORDED_WORKER_ID,
    servingVersionId:predecessor.versionId, servingDeploymentId:predecessor.deploymentId, bootstrapCalled:false});
  assert.deepEqual(state.boundaries, [predecessor.versionId]);
  assert.deepEqual(state.receipts, []);
  assert.deepEqual(state.writes, []);
}
for (const drift of [
  state => state.versions.set(unexpectedId, {id:unexpectedId}),
  state => { state.versions.delete(prior.ackParent); },
  state => { state.versions.delete(predecessor.versionId); },
  state => { state.versions.get(predecessor.versionId).number = 2; },
  state => { state.versions.get(predecessor.versionId).annotations['workers/message'] = 'lythaus-isolated ' + predecessor.intentId + ' ' + prior.ackParent; },
  state => { state.versions.get(predecessor.versionId).annotations['workers/tag'] = originalSource; },
  state => { state.deployments[0].annotations['workers/message'] = 'lythaus-isolated-repair ' + unexpectedId; },
  state => { state.deployments[0].created_on = originalDeployment.created_on; },
  state => { state.deployments.pop(); },
  state => { state.deployments[0].versions[0].percentage = 99; },
  state => { state.deployments[0].versions[0].version_id = prior.ackParent; },
  state => { state.deployments[0].id = unexpectedId; },
]) {
  const {run, state} = fixture();
  drift(state);
  await assert.rejects(run(reconcile));
  assert.deepEqual(state.receipts, []);
  assert.deepEqual(state.writes, []);
}

// No field in the previously protected routed receipt can select an alternate resource.
assert.doesNotThrow(() => assertRoutedLineage(prior));
for (const key of Object.keys(prior)) {
  assert.throws(() => assertRoutedLineage({...prior, [key]:unexpectedId}), undefined, 'modified prior ' + key);
}
for (const changed of [undefined, {...predecessor,sourceSha:pins.sourceSha}, {...predecessor,versionId:prior.ackChild},
  {...predecessor,intentId:prior.childIntent}, {...predecessor,activationVerified:false}]) {
  const {run,state} = fixture();
  await assert.rejects(run(stage, undefined, {predecessor:changed}), /repair_predecessor_receipt/);
  assert.deepEqual(state.writes, []);
}
for (const changed of [priorRepairPins, {...pins,workerSha:priorRepairPins.workerSha}]) {
  const {run,state} = fixture();
  await assert.rejects(run(stage, undefined, {pins:changed}), /repair_artifact_pins/);
  assert.deepEqual(state.writes, []);
}

{
  const {run, state, stagePath, deploymentPath} = fixture();
  await run(stage);
  const staged = state.receipts.at(-1);
  assert.equal(staged.versionId, candidate);
  assert.equal(staged.stageVerified, true);
  assert.deepEqual(state.writes, [SCRIPT + '/assets-upload-session', stagePath]);
  assert.deepEqual(state.deployments, baseline);
  assert.deepEqual(new Set(state.boundaries), new Set([predecessor.versionId]));

  await run(activate, staged);
  const active = state.receipts.at(-1);
  assert.equal(active.activationVerified, true);
  assert.equal(active.deploymentId, deploymentId);
  assert.deepEqual(state.writes, [SCRIPT + '/assets-upload-session', stagePath, deploymentPath]);
  assert.deepEqual(state.deployments.slice(1), baseline);
  assert.deepEqual(state.deployments[0].versions, [{version_id:candidate, percentage:100}]);
  assert.deepEqual(new Set(state.boundaries), new Set([predecessor.versionId, candidate]));
  const writes = state.writes.length;
  assert.equal((await run(reconcile, active)).status, 'REPAIR_ACTIVE_OWNER_TEST_PENDING');
  assert.equal(state.writes.length, writes);
  assert.doesNotMatch(JSON.stringify(state.receipts), /ACCESS_SUBJECT_HMAC_KEY|fixture-origin|fixture.cloudflareaccess.com|private fixture/);
}

for (const fault of ['deployment_after_assets', 'inventory_after_assets']) {
  const {run, state, stagePath} = fixture();
  state.fault = fault;
  await assert.rejects(run(stage), undefined, fault);
  assert.ok(!state.writes.includes(stagePath), fault);
}

{
  const {run, state} = fixture();
  await assert.rejects(run(stage, undefined, {checkBoundary:async () => ({
    audience, issuer, servingVersionId:predecessor.versionId, servingSourceSha:'0'.repeat(40),
  })}));
  assert.deepEqual(state.writes, []);
  await assert.rejects(run(stage, undefined, {artifacts:{...artifacts, worker:Buffer.from('changed Worker')}}));
  assert.deepEqual(state.writes, []);
}

{
  const {run, state, stagePath, deploymentPath} = fixture();
  state.fault = 'version_ack_lost';
  await assert.rejects(run(stage));
  const intent = state.receipts.at(-1);
  assert.ok(intent.intentId);
  assert.ok(!intent.stageVerified);
  assert.equal(state.versions.size, 4);
  assert.equal(state.deployments[0].id, predecessor.deploymentId);
  const writes = state.writes.length;
  await assert.rejects(run(activate, intent));
  await assert.rejects(run(stage));
  assert.equal(state.writes.length, writes);
  await run(reconcile, intent);
  const stageReadback = state.receipts.at(-1);
  assert.equal(stageReadback.versionId, candidate);
  assert.equal(stageReadback.stageVerified, true);
  assert.equal(state.writes.length, writes);

  state.fault = 'deployment_ack_lost';
  await assert.rejects(run(activate, stageReadback));
  const activationIntent = state.receipts.at(-1);
  assert.ok(activationIntent.activationIntent);
  assert.ok(!activationIntent.activationVerified);
  assert.equal(state.deployments[0].versions[0].version_id, candidate);
  await assert.rejects(run(activate, activationIntent));
  const attempted = [SCRIPT + '/assets-upload-session', stagePath, deploymentPath];
  assert.deepEqual(state.writes, attempted);
  await run(reconcile, activationIntent);
  const readback = state.receipts.at(-1);
  assert.equal(readback.deploymentId, deploymentId);
  assert.equal(readback.activationVerified, true);
  assert.deepEqual(state.writes, attempted);
}

// A saved intent alone cannot prove either POST took effect. A negative
// readback keeps the prior traffic assignment and grants no retry.
{
  const {run, state} = fixture();
  await assert.rejects(run(stage, undefined, {journal:async partial => {
    state.receipts.push(partial);
    throw new Error('fixture receipt persistence interrupted');
  }}));
  const writes = state.writes.length;
  const intent = state.receipts.at(-1);
  assert.equal((await run(reconcile, intent)).status, 'REPAIR_STAGE_UNCONFIRMED');
  await assert.rejects(run(activate, intent));
  assert.equal(state.writes.length, writes);
}

{
  const {run, state} = fixture();
  await run(stage);
  await assert.rejects(run(activate, state.receipts.at(-1), {journal:async partial => {
    state.receipts.push(partial);
    throw new Error('fixture receipt persistence interrupted');
  }}));
  const intent = state.receipts.at(-1);
  const writes = state.writes.length;
  assert.equal((await run(reconcile, intent)).status, 'REPAIR_ACTIVATION_UNCONFIRMED');
  await assert.rejects(run(activate, intent));
  assert.equal(state.writes.length, writes);
  assert.deepEqual(state.deployments, baseline);
}

for (const change of [
  row => { row.annotations['workers/message'] = 'lythaus-isolated-repair ' + unexpectedId; },
  row => { row.created_on = precedingDeployment.created_on; },
  row => { row.versions[0].percentage = 99; },
]) {
  const {run, state} = fixture();
  await run(stage);
  state.fault = 'deployment_ack_lost';
  await assert.rejects(run(activate, state.receipts.at(-1)));
  const intent = state.receipts.at(-1);
  const writes = state.writes.length;
  change(state.deployments[0]);
  await assert.rejects(run(reconcile, intent));
  assert.equal(state.writes.length, writes);
}

for (const mutate of [
  ({state}) => { state.versions.get(candidate).modules[1].content_base64 = Buffer.from('changed').toString('base64'); },
  ({state}) => { state.versions.get(candidate).number = 2; },
  ({state}) => { state.versions.get(candidate).bindings.find(b => b.name === 'DB_ADMIN_FRESH').id = 'b'.repeat(32); },
  ({state}) => { state.versions.get(candidate).annotations['workers/message'] = 'lythaus-isolated ' + unexpectedId + ' ' + prior.ackChild; },
  ({state}) => { state.versions.set(unexpectedId, {id:unexpectedId}); },
  ({state}) => { state.deployments[0].versions[0].percentage = 50; },
  ({state}) => { state.deployments[0].id = unexpectedId; },
]) {
  const f = fixture();
  await f.run(stage);
  const receipt = f.state.receipts.at(-1);
  const writes = f.state.writes.length;
  mutate(f);
  await assert.rejects(f.run(activate, receipt));
  assert.equal(f.state.writes.length, writes);
}
