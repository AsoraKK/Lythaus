import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {
  ACCOUNT, DRIVE, RECORDED_WORKER, SCRIPT, ZONE, createSetupClient,
} from '../ci/new-core-isolated-cloudflare.mjs';
import {TARGET} from '../ci/lythaus-new-core-isolation-review.mjs';

const operations = ['stage-isolated-repair', 'activate-isolated-repair', 'reconcile-isolated-repair'];
const servingChild = '37f36eb4-911d-4c51-b723-751329cd1b92';
const candidate = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const deployment = version => ({strategy:'percentage', versions:[{version_id:version, percentage:100}]});
const stagePath = RECORDED_WORKER + '/versions?deploy=false';

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
