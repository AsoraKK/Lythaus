import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {
  ACCOUNT, DRIVE, RECORDED_WORKER, SCRIPT, ZONE, createSetupClient,
} from '../ci/new-core-isolated-cloudflare.mjs';
import {TARGET} from '../ci/lythaus-new-core-isolation-review.mjs';

const operations = ['stage-isolated-repair', 'activate-isolated-repair', 'reconcile-isolated-repair'];
const originalParent = '44cd6e04-15d7-467c-9d93-ff59d5d4fe0c';
const originalChild = '37f36eb4-911d-4c51-b723-751329cd1b92';
const priorRepair = '193c3dcb-9238-4adc-8eab-48707fdd8b7e';
const servingChild = '1ac91b08-7caa-4d31-aa7d-ad8e8bd6301f';
const servingSource = '78958d886d72eecc6ea01001d808f1d8c505046d';
const servingMarker = 'lythaus-isolated a1bba168-fcda-4240-9170-c8e7b13a3dee ' + priorRepair;
const newIntent = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const newMarker = 'lythaus-isolated ' + newIntent + ' ' + servingChild;
const candidate = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const deployment = version => ({strategy:'percentage', versions:[{version_id:version, percentage:100}]});
const stagePath = RECORDED_WORKER + '/versions?deploy=false';

async function observedRepairClient(operation, {tag = servingSource, marker = servingMarker, childMarker = newMarker} = {}) {
  const api = createSetupClient({token:'local-fixture', repairOperation:operation, record:()=>assert.fail(), fetchImpl:async (url,options) => {
    assert.equal(options.method,'GET');
    const id = new URL(url).pathname.split('/').at(-1);
    const result = url.endsWith(RECORDED_WORKER) ? {id, name:TARGET.worker} :
      {id,annotations:{'workers/tag':id === servingChild ? tag : 'e'.repeat(40),
        'workers/message':id === servingChild ? marker : childMarker}};
    return Response.json({success:true,result});
  }});
  await api.request(RECORDED_WORKER);
  api.selectRecordedWorker();
  for (const id of [originalParent,originalChild,priorRepair,servingChild,candidate])
    await api.request(RECORDED_WORKER + '/versions/' + id + '?include=modules');
  return api;
}

test('the repair client requires the fourth version and its annotated fifth child', async () => {
  for (const [op, parent, target, readback] of [
    [operations[0],priorRepair,undefined,{}],
    [operations[0],servingChild,undefined,{marker:'wrong marker'}],
    [operations[0],servingChild,undefined,{tag:'e'.repeat(40)}],
    [operations[1],servingChild,originalParent,{}],
    [operations[1],servingChild,originalChild,{}],
    [operations[1],servingChild,priorRepair,{}],
    [operations[1],servingChild,candidate,{childMarker:'lythaus-isolated ' + newIntent + ' ' + priorRepair}],
  ]) {
    const api = await observedRepairClient(op,readback);
    assert.throws(() => api.selectLineage(parent,target));
  }
});

test('selected lineage still rejects a wrong stage annotation, secret source or activation target', async () => {
  const stage = await observedRepairClient(operations[0]);
  stage.selectLineage(servingChild);
  const key = {name:'ACCESS_SUBJECT_HMAC_KEY', type:'inherit', version_id:servingChild};
  for (const [annotation, binding] of [
    ['lythaus-isolated ' + newIntent + ' ' + priorRepair, key],
    [newMarker, {...key, version_id:priorRepair}],
    [newMarker, {name:key.name,type:'secret_text',text:'synthetic fixture'}],
  ]) {
    await assert.rejects(stage.request(stagePath, {method:'POST',body:{
      annotations:{'workers/message':annotation},bindings:[binding],
    }}), /setup_(repair_version_annotation|subject_key_lineage)/);
  }
  const activate = await observedRepairClient(operations[1]);
  activate.selectLineage(servingChild,candidate);
  const wrong = {...deployment(servingChild),annotations:{'workers/message':'lythaus-isolated-repair ' + newIntent}};
  await assert.rejects(activate.request(SCRIPT + '/deployments',{method:'POST',body:wrong}), /setup_deployment/);
});

test('staging, activating and reconciling a routed correction on the same Worker', () => {
  execFileSync(process.execPath, ['--experimental-test-module-mocks',
    fileURLToPath(new URL('./fixtures/new-core-isolated-repair.mjs', import.meta.url))],
    {timeout:20000, stdio:'inherit'});
});

test('read-only repair boundary rechecks the account, database and actual serving Worker', () => {
  execFileSync(process.execPath, ['--experimental-test-module-mocks',
    fileURLToPath(new URL('./fixtures/new-core-repair-boundary.mjs', import.meta.url))],
    {timeout:20000, stdio:'inherit'});
});

test('repair operations reject writes to routing, identities, databases, production and other Workers', async () => {
  const expectedOutOfScope = [
    ['POST', ACCOUNT + '/access/apps', {type:'self_hosted', domain:TARGET.hostname}],
    ['POST', ACCOUNT + '/mtls_certificates', {ca:true, certificates:'fixture public certificate'}],
    ['POST', ACCOUNT + '/workers/workers', {name:TARGET.worker, subdomain:{enabled:false, previews_enabled:false}}],
    ['POST', ZONE + '/dns_records', {type:'A', name:TARGET.hostname, content:'192.0.2.1', ttl:1, proxied:true}],
    ['POST', ZONE + '/workers/routes', {pattern:TARGET.hostname + '/*', script:TARGET.worker}],
    ['PATCH', DRIVE, {origin:{user:'lythaus_admin.' + TARGET.branch, password:'fixture'},
      caching:{disabled:true}, mtls:{sslmode:'verify-full', ca_certificate_id:'b'.repeat(32)}}],
    ['POST', DRIVE + '/restart', {}],
    ['PATCH', SCRIPT + '/script-settings', {}],
    ['POST', ACCOUNT + '/workers/scripts/lythaus-admin-api/deployments', deployment(candidate)],
    ['POST', ACCOUNT + '/workers/workers/' + 'b'.repeat(32) + '/versions?deploy=false', {}],
    ['POST', RECORDED_WORKER + '/versions?deploy=true', {}],
  ];
  for (const operation of operations) {
    const sent = [];
    const api = createSetupClient({token:'local-fixture', repairOperation:operation,
      record:() => assert.fail('out-of-scope write was journaled'),
      fetchImpl:async (url, options) => {
        const target = new URL(url);
        sent.push([options.method, target.pathname]);
        return Response.json({success:true, result:{}});
      }});
    const calls = [...expectedOutOfScope];
    if (operation !== 'activate-isolated-repair') calls.push(['POST', SCRIPT + '/deployments', deployment(candidate)]);
    if (operation !== 'stage-isolated-repair') {
      calls.push(['POST', SCRIPT + '/assets-upload-session', {manifest:{}}],
        ['POST', stagePath, {bindings:[{type:'inherit', name:'ACCESS_SUBJECT_HMAC_KEY', version_id:servingChild}]}]);
    }
    for (const [method, path, body] of calls) {
      await assert.rejects(api.request(path, {method, body}), undefined, operation + ' ' + path);
    }
    assert.deepEqual(sent, [], operation);
  }
});
