import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createSetupClient, ACCOUNT, DRIVE, SCRIPT, ZONE } from '../ci/new-core-isolated-cloudflare.mjs';
import { inspectSetupInputs, runIsolatedSetup } from '../ci/lythaus-new-core-isolated-setup.mjs';
import { TARGET } from '../ci/lythaus-new-core-isolation-review.mjs';

const fixtureToken = 'private-fixture-token';
const workerId = 'a'.repeat(32);
const versionId = 'abababab-abab-4bab-8bab-abababababab';
const workerCreate = {name:TARGET.worker,subdomain:{enabled:false,previews_enabled:false}};
const stagePath = `${ACCOUNT}/workers/workers/${workerId}/versions?deploy=false`;
const activate = id => ({method:'POST',body:{strategy:'percentage',versions:[{version_id:id,percentage:100}]}});

test('combined setup serves the pinned UUID and retains only acknowledged partial changes on failure',()=>{
  execFileSync(process.execPath,['--experimental-test-module-mocks',
    fileURLToPath(new URL('./fixtures/new-core-combined-setup.mjs',import.meta.url))],{stdio:'pipe',timeout:15000});
});

test('read-only and setup modes separately report missing protected inputs before writing', async t=>{
  const calls=[], entries=[];
  t.mock.method(globalThis,'fetch',async (url,init)=>{
    assert.equal(init.method,'GET');
    assert.equal(init.redirect,'error');
    calls.push(url);
    return new Response('private-provider-diagnostic',{status:403});
  });
  const args = {env:{CLOUDFLARE_API_TOKEN:fixtureToken},sourceDir:'/nonexistent-fixture',
    artifactDir:'/nonexistent-fixture',authorize:async()=>({}),record:line=>entries.push(line)};
  const inspection = await inspectSetupInputs(args);
  assert.equal(inspection.ready,false);
  calls.length = 0;
  const result = await runIsolatedSetup(args);
  assert.equal(result.status,'ISOLATED_SETUP_BLOCKED');
  assert.equal(result.inputChecks.admin.verified,false);
  assert.equal(result.inputChecks.verifier.verified,false);
  assert.equal(result.inputChecks.cloudflare.bindingAccessible,true);
  assert.ok(result.inputChecks.errors.some(e=>e.startsWith('admin_')));
  assert.ok(result.inputChecks.errors.some(e=>e.startsWith('verifier_')));
  assert.ok(result.blocked.includes('setup_access_inventory_http_403'));
  assert.equal(calls.length,new Set(calls).size);
  assert.deepEqual(entries,[]);
  assert.doesNotMatch(JSON.stringify([inspection,result,entries]),/private-provider|private-fixture-token/);
});

test('owner review failure prevents provider access and writes', async t=>{
  const spy=t.mock.method(globalThis,'fetch');
  const denied=async()=>{throw new Error('fixture_review_denied');};
  await assert.rejects(runIsolatedSetup({env:{},authorize:denied,record:()=>{}}),/fixture_review_denied/);
  assert.equal(spy.mock.callCount(),0);
});

test('mutations target only the isolated route, DNS, scoped login and newly staged UUID', async ()=>{
  let calls=0;
  const api = createSetupClient({token:fixtureToken,fetchImpl:async()=>{calls++;throw new Error('unexpected');},record:()=>{}});
  const cases = [
    [`${ZONE}/workers/routes`,{method:'POST',body:{pattern:'admin.lythaus.co/*',script:TARGET.worker}}],
    [`${ZONE}/dns_records`,{method:'POST',body:{type:'A',name:'admin.lythaus.co',content:'192.0.2.1',ttl:1,proxied:true}}],
    [DRIVE,{method:'PATCH',body:{origin:{user:'broad_secret',password:'private'},mtls:{sslmode:'require'}}}],
    [`${ACCOUNT}/access/apps`,{method:'POST',body:{domain:'admin.lythaus.co',type:'self_hosted'}}],
    [`${ACCOUNT}/mtls_certificates`,{method:'POST',body:{ca:true,certificates:'PRIVATE KEY'}}],
    [`${SCRIPT}/deployments`,activate(versionId)],
    [stagePath,{method:'POST',body:{}}],
    [`${SCRIPT}/secrets`,{method:'PUT',body:{}}],
    ['https://another-host.invalid/',{method:'GET'}],
    [`${ZONE}/workers/routes`,{headers:{authorization:'Bearer another'}}],
  ];
  for (const [path,options] of cases) await assert.rejects(api.request(path,options),/^Error: setup_/);
  assert.equal(calls,0);
});

test('version activation is pinned to the version returned for the newly created Worker', async()=>{
  const journal=[], calls=[];
  const api = createSetupClient({token:fixtureToken, record:entry=>journal.push(entry),fetchImpl:async(url,init)=>{
    const path = new URL(url).pathname;
    assert.equal(init.headers.get('authorization'),'Bearer '+fixtureToken);
    assert.equal(init.redirect,'error');
    calls.push(path);
    if (path.endsWith('/workers/workers')) return Response.json({success:true,result:{id:workerId,name:TARGET.worker}});
    if (path.endsWith('/versions')) return Response.json({success:true,result:{id:versionId,providerPrivate:'private-output'}});
    return Response.json({success:true,result:{id:'b'.repeat(32)}});
  }});
  await api.request(`${ACCOUNT}/workers/workers`,{method:'POST',body:workerCreate});
  await api.request(stagePath,{method:'POST',body:{fixture:true}});
  await assert.rejects(api.request(`${SCRIPT}/deployments`,activate('b'.repeat(32))),/deployment_target/);
  await api.request(`${SCRIPT}/deployments`,activate(versionId));
  assert.equal(calls.length,3);
  assert.deepEqual(journal.map(r=>r.operation),['create_worker','stage_version','activate_version']);
  assert.deepEqual(journal[1],{operation:'stage_version',id:versionId});
  assert.doesNotMatch(JSON.stringify(journal),/private-output|private-fixture-token/);
});

test('provider denial has an operation and status without private content or retry', async()=>{
  let called=0;
  const api=createSetupClient({token:fixtureToken,record:()=>assert.fail(),fetchImpl:async()=>{
    called++;
    return new Response('private-policy-selector',{status:403});
  }});
  await assert.rejects(api.request(`${ACCOUNT}/workers/workers`,{method:'POST',body:workerCreate}),
    {message:'setup_create_worker_http_403'});
  assert.equal(called,1);
});
