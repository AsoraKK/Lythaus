import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createSetupClient, ACCOUNT, DRIVE, RECORDED_WORKER_ID, SCRIPT, ZONE } from '../ci/new-core-isolated-cloudflare.mjs';
import { inspectSetupInputs, runIsolatedSetup } from '../ci/lythaus-new-core-isolated-setup.mjs';
import { TARGET } from '../ci/lythaus-new-core-isolation-review.mjs';
import { verifyFlagsSession } from '../ci/verify-new-core-flags-session.mjs';

test('flags acceptance requires the normal page and exact same-origin versioned cases JSON', async () => {
  const candidate = {hostname:TARGET.hostname, versionId:'11111111-1111-4111-8111-111111111111', sourceSha:TARGET.candidate};
  const frame = {};
  const pageUrl = 'https://' + candidate.hostname + '/flags';
  const response = (url, type) => ({
    url:()=>url, status:()=>200, fromServiceWorker:()=>false, frame:()=>frame,
    request:()=>({frame:()=>frame, method:()=>'GET', redirectedFrom:()=>null}),
    headerValue:async key => ({'content-type':type, 'x-lythaus-worker-version':candidate.versionId,
      'x-lythaus-source-sha':candidate.sourceSha})[key], json:async()=>({items:[]}),
  });
  const doc = response(pageUrl,'text/html');
  const api = response('https://' + candidate.hostname + '/api/admin/moderation/cases','application/json');
  const page = {url:()=>pageUrl, mainFrame:()=>frame, reload:async()=>doc,
    waitForResponse:async pred=>{assert.ok(pred(api)); return api;},
    getByRole:()=>({waitFor:async()=>{}}), locator:()=>({count:async()=>0})};
  assert.equal((await verifyFlagsSession(page,candidate)).sameOriginCasesJson,true);
  for (const bad of [{status:()=>403}, {fromServiceWorker:()=>true}, {json:async()=>({healthy:true})},
    {url:()=>'https://admin.lythaus.co/api/admin/moderation/cases'},
    {headerValue:async key => key === 'content-type' ? 'text/html' : api.headerValue(key)},
    {headerValue:async key => key === 'x-lythaus-worker-version' ? null : api.headerValue(key)}]) {
    await assert.rejects(verifyFlagsSession({...page, waitForResponse:async()=>({...api,...bad})},candidate));
  }
});

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

test('version verification accepts dormant invocation flags only with fresh explicit disabled parents', async ()=>{
  const {verifyWorkerVersion} = await import('../ci/new-core-isolated-worker.mjs');
  const reads=[];
  const worker={id:RECORDED_WORKER_ID,name:TARGET.worker,subdomain:{enabled:false,previews_enabled:false},
    logpush:false,observability:{enabled:false,logs:{enabled:false,invocation_logs:true},traces:{enabled:false}},
    references:{domains:[]},tail_consumers:[]};
  await assert.rejects(verifyWorkerVersion({request:async (path,opts)=>{
    assert.equal(opts.method,'GET');
    reads.push(path);
    return path.endsWith('/script-settings') ? {logpush:false,observability:null,tail_consumers:null} : worker;
  },workerId:RECORDED_WORKER_ID,versionId}),/WORKER_VERSION_CONFIGURATION/);
  assert.deepEqual(reads,[`${ACCOUNT}/workers/workers/${RECORDED_WORKER_ID}`,`${SCRIPT}/script-settings`,
    `${ACCOUNT}/workers/workers/${RECORDED_WORKER_ID}/versions/${versionId}?include=modules`]);
  for (const badScript of [
    {logpush:false,observability:{enabled:false,logs:{enabled:true}}},
    {logpush:false,observability:{enabled:false,logs:{invocation_logs:true}}},
    {logpush:false,observability:{enabled:false,agents:{enabled:'false'}}},
    {logpush:false,observability:{enabled:false,issues:{enabled:true}}},
    {logpush:false,observability:{enabled:false,traces:{destinations:['export']}}},
    {logpush:false,observability:{logs:null}},
    {logpush:false,observability:false},
    {logpush:'false',observability:null},
    {logpush:false,observability:null,tail_consumers:[{}]},
    {logpush:false,tail_consumers:[{}]},
  ]) await assert.rejects(verifyWorkerVersion({request:async path=>path.endsWith('/script-settings') ? badScript : worker,
    workerId:RECORDED_WORKER_ID,versionId}),/WORKER_SCRIPT_LOGGING_READBACK/);
  for (const value of [undefined,true,'false',null]) {
    const contradictory=structuredClone(worker);
    if (value === undefined) delete contradictory.observability.logs.enabled;
    else contradictory.observability.logs.enabled=value;
    await assert.rejects(verifyWorkerVersion({request:async path=>path.endsWith('/script-settings') ? {logpush:false,observability:null} : contradictory,
      workerId:RECORDED_WORKER_ID,versionId}),/WORKER_EXPOSURE_OR_LOGGING/);
  }
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
  const resume = createSetupClient({token:fixtureToken,resumeWorker:true,fetchImpl:async()=>assert.fail(),record:()=>assert.fail()});
  assert.throws(resume.selectRecordedWorker,/recorded_worker_not_verified/);
  await assert.rejects(resume.request(`${SCRIPT}/script-settings`,{method:'PATCH',body:{}}),/provider_scope_blocked/);
});

test('version activation is pinned to the version returned for the newly created Worker', async()=>{
  const journal=[], calls=[];
  const parent = 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd';
  const key = {name:'ACCESS_SUBJECT_HMAC_KEY',type:'secret_text',text:Buffer.alloc(32).toString('base64')};
  const stage = binding => ({method:'POST',body:{bindings:[binding]}});
  const api = createSetupClient({token:fixtureToken, record:entry=>journal.push(entry),fetchImpl:async(url,init)=>{
    const path = new URL(url).pathname;
    assert.equal(init.headers.get('authorization'),'Bearer '+fixtureToken);
    assert.equal(init.redirect,'error');
    calls.push(path);
    if (path.endsWith('/workers/workers')) return Response.json({success:true,result:{id:workerId,name:TARGET.worker}});
    if (path.endsWith('/versions')) return Response.json({success:true,result:{id:JSON.parse(init.body).bindings[0].type === 'inherit' ? versionId : parent,providerPrivate:'private-output'}});
    return Response.json({success:true,result:{id:'b'.repeat(32)}});
  }});
  await api.request(`${ACCOUNT}/workers/workers`,{method:'POST',body:workerCreate});
  await api.request(stagePath,stage(key));
  await assert.rejects(api.request(`${SCRIPT}/deployments`,activate(parent)),/deployment_target/);
  await assert.rejects(api.request(stagePath,stage(key)),/subject_key_lineage/);
  await assert.rejects(api.request(stagePath,stage({name:key.name,type:'inherit',version_id:versionId})),/subject_key_lineage/);
  await api.request(stagePath,stage({name:key.name,type:'inherit',version_id:parent}));
  await assert.rejects(api.request(`${SCRIPT}/deployments`,activate('b'.repeat(32))),/deployment_target/);
  await api.request(`${SCRIPT}/deployments`,activate(versionId));
  assert.equal(calls.length,4);
  assert.deepEqual(journal.map(r=>r.operation),['create_worker','stage_version','stage_version','activate_version']);
  assert.deepEqual(journal[1],{operation:'stage_version',id:parent});
  assert.doesNotMatch(JSON.stringify(journal),/private-output|private-fixture-token/);
});

test('first-version rejection exposes only a safe diagnosis and blocks further writes', async()=>{
  let posts=0;
  const journal=[];
  const api=createSetupClient({token:fixtureToken,record:entry=>journal.push(entry),fetchImpl:async(url,init)=>{
    const path=new URL(url).pathname;
    if (init.method === 'GET') return Response.json({success:true,result:[]});
    posts++;
    if (path.endsWith('/workers/workers')) return Response.json({success:true,result:{id:workerId,name:TARGET.worker}});
    return Response.json({success:false,errors:[{code:10021,message:'fixture-secret',
      source:{pointer:'/bindings/11/text/fixture-secret'},documentation_url:'https://fixture-secret.invalid'}]}, {status:400});
  }});
  await api.request(`${ACCOUNT}/workers/workers`,{method:'POST',body:workerCreate});
  const upload={method:'POST',body:{bindings:[{name:'ACCESS_SUBJECT_HMAC_KEY',type:'secret_text',text:Buffer.alloc(32).toString('base64')}]}};
  await assert.rejects(api.request(stagePath,upload),{message:'setup_stage_version_initial_http_400_cf_10021_bindings'});
  await assert.rejects(api.request(stagePath,upload),{message:'setup_stage_version_reconciliation_required'});
  await assert.rejects(api.request(`${SCRIPT}/deployments`,activate(versionId)),{message:'setup_stage_version_reconciliation_required'});
  assert.deepEqual(await api.request(stagePath.split('?')[0]),[]);
  assert.equal(posts,2);
  assert.deepEqual(journal.map(row=>row.operation),['create_worker']);
});

test('inheritance rejection handles malformed, oversized and unexpected provider errors without logging them', async()=>{
  const parent='cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd';
  const variants=[
    [()=>Response.json({errors:[{code:10999,source:{pointer:'/fixture_secret/value'}}]},{status:400}), '_cf_10999_unknown_field'],
    [()=>Response.json({errors:[{code:'fixture-secret'}]},{status:400}), ''],
    [()=>new Response('{fixture-secret',{status:400,headers:{'content-type':'application/json'}}), ''],
    [()=>Response.json({errors:[{code:10999,message:'x'.repeat(20_000)}]},{status:400}), ''],
    [()=>new Response('fixture-secret',{status:400}), ''],
  ];
  for (const [response,suffix] of variants) {
    let sent=0;
    const api=createSetupClient({token:fixtureToken,record:()=>{},fetchImpl:async()=>{
      if (++sent === 1) return Response.json({success:true,result:{id:workerId,name:TARGET.worker}});
      if (sent === 2) return Response.json({success:true,result:{id:parent}});
      return response();
    }});
    await api.request(`${ACCOUNT}/workers/workers`,{method:'POST',body:workerCreate});
    const stage=binding=>api.request(stagePath,{method:'POST',body:{bindings:[{name:'ACCESS_SUBJECT_HMAC_KEY',...binding}]}});
    await stage({type:'secret_text',text:Buffer.alloc(32).toString('base64')});
    await assert.rejects(stage({type:'inherit',version_id:parent}),{message:'setup_stage_version_inherit_http_400'+suffix});
    await assert.rejects(stage({type:'inherit',version_id:parent}),{message:'setup_stage_version_reconciliation_required'});
    assert.equal(sent,3);
  }
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

test('Pages verifies provider totals before returning inventory or reporting a sanitized failure', async () => {
  const project = n => ({id:String(n).padStart(32,'0')});
  const page = (n, info = {}) => ({success:true,result:[project(n)],result_info:{
    page:n,per_page:10,count:1,total_count:2,total_pages:2,...info}});
  async function read(responses) {
    let calls = 0;
    const api = createSetupClient({token:fixtureToken,record:()=>assert.fail(),fetchImpl:async (url,init)=>{
      assert.equal(init.method,'GET');
      assert.equal(init.redirect,'error');
      const response = responses[calls++];
      assert.ok(response, 'unexpected request');
      assert.equal(new URL(url).search, calls === 1 ? '' : '?page='+calls);
      return response instanceof Response ? response : Response.json(response);
    }});
    return api.listPagesProjects();
  }
  for (const totals of [{},{total_count:undefined},{total_pages:undefined}]) {
    assert.deepEqual(await read([page(1,totals),page(2,totals)]),[project(1),project(2)]);
  }
  assert.deepEqual(await read([{success:true,result:[],result_info:{page:1,per_page:10,count:0,total_count:0,total_pages:0}}]),[]);
  for (const [responses,reason] of [
    [[{success:true,result:[project(1)]}],'pages_pagination_unverified'],
    [[page(1,{total_count:undefined,total_pages:undefined})],'pages_pagination_unverified'],
    [[page(1),page(1)],'pages_pagination_unverified'],
    [[page(1),{...page(2),result:[project(1)]}],'pages_project_identity'],
    [[page(1),page(2,{per_page:1})],'pages_pagination_changed'],
    [[page(1),page(2,{total_count:3})],'pages_pagination_changed'],
    [[page(1,{total_count:1})],'pages_total_inconsistent'],
    [[page(1),page(2,{count:2})],'pages_pagination_unverified'],
    [[...Array.from({length:10},(_,i)=>page(i+1,{total_pages:11,total_count:11}))],'pages_inventory_incomplete'],
    [[page(1),new Response('private response',{status:400})],'pages_inventory_http_400'],
  ]) await assert.rejects(read(responses),{message:'setup_'+reason});
});
