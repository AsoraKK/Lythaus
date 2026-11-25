import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {
  ACCOUNT, DRIVE, RECORDED_WORKER, SCRIPT, ZONE, createSetupClient,
} from '../ci/new-core-isolated-cloudflare.mjs';
import {TARGET} from '../ci/lythaus-new-core-isolation-review.mjs';

const operations = ['stage-isolated-repair', 'activate-isolated-repair', 'reconcile-isolated-repair'];
const servingChild = '193c3dcb-9238-4adc-8eab-48707fdd8b7e';
const candidate = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const deployment = version => ({strategy:'percentage', versions:[{version_id:version, percentage:100}]});
const stagePath = RECORDED_WORKER + '/versions?deploy=false';

test('the repair client requires the activated predecessor and the new annotated child', async () => {
  const old = '37f36eb4-911d-4c51-b723-751329cd1b92';
  const predecessorMarker = 'lythaus-isolated c231d250-f91c-4626-bc7e-31fb2c8e1321 ' + old;
  for (const [op, parent, marker, target] of [
    [operations[0],old,predecessorMarker,undefined],
    [operations[0],servingChild,'wrong marker',undefined],
    [operations[1],servingChild,predecessorMarker,old],
    [operations[1],servingChild,predecessorMarker,candidate],
  ]) {
    const api = createSetupClient({token:'local-fixture', repairOperation:op, record:()=>assert.fail(), fetchImpl:async (url,options) => {
      assert.equal(options.method,'GET');
      const path = new URL(url).pathname;
      const id = path.split('/').at(-1);
      const result = url.endsWith(RECORDED_WORKER) ? {id, name:TARGET.worker} :
        {id,annotations:{'workers/message':id === servingChild ? marker : 'lythaus-isolated c231d250-f91c-4626-bc7e-31fb2c8e1321 ' + old}};
      return Response.json({success:true,result});
    }});
    await api.request(RECORDED_WORKER);
    api.selectRecordedWorker();
    for (const id of new Set([old,servingChild,...(target ? [target] : [])]))
      await api.request(RECORDED_WORKER + '/versions/' + id + '?include=modules');
    assert.throws(() => api.selectLineage(parent,target));
  }
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
