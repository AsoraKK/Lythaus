import assert from 'node:assert/strict';
import { X509Certificate } from 'node:crypto';
import { rootCertificates } from 'node:tls';
import { mock } from 'node:test';
import * as inspector from '../../ci/lythaus-new-core-isolation-review.mjs';

const { TARGET } = inspector;
const owner='owner@fixture.invalid', token='private-fixture-token', password='private-fixture-password';
const source = new X509Certificate(rootCertificates[0]);
const ca = {id:'a'.repeat(32),pem:source.toString(),sha256:source.fingerprint256.replaceAll(':','').toLowerCase()};
const workerId = 'c'.repeat(32), versionId = '11111111-2222-4333-8444-555555555555';
const parentVersionId = 'aaaaaaaa-2222-4333-8444-555555555555';
const accessId = 'b'.repeat(32), dnsId = 'd'.repeat(32), routeId = 'e'.repeat(32);
const uiId = '2d440b64-6cde-48d7-b3cb-132129ee036f', apiId='fa6906cc-3daf-4beb-82b5-143e708eca0d';
const initialPolicies = [
  {id:'allow',name:'owner',decision:'allow',precedence:1,include:[{email:{email:owner}}]},
  {id:'deny',name:'all',decision:'deny',precedence:2,include:[{everyone:{}}]},
];
let state;
mock.module('../../ci/lythaus-new-core-isolation-review.mjs',{namedExports:{
  ...inspector,
  hyperdriveEvidence(config) {
    const real = inspector.hyperdriveEvidence(config);
    assert.equal(config.origin.host,'fixture.invalid');
    return {...real,originMatches:true};
  },
  async inspectIsolation() {
    return {worker:{exists:state.deployed},access:{overlappingApplicationCount:state.testApp ? 1 : 0},
      readiness:state.route ? 'PINNED_METADATA_CHECKS_PASS' : 'BLOCKED',
      productionSnapshot:{sha256:'ecaecf69d5fae1edfd63ed54561c12abff3ee7ac01ecac8dc034417703e2ee19'},
      checks:{servingBindingsComplete:true,exclusiveHyperdrive:true,exactRoute:!!state.route,dns:!!state.dns},
      hyperdriveConsumers:state.deployed ? [TARGET.worker] : [],nonLythausHyperdriveConsumerCount:0};
  },
}});
mock.module('../../ci/lythaus-new-core-admin-inputs.mjs',{namedExports:{
  async collectAdminInputs({expectedOwner,onVerifiedCa,previousInputs}) {
    assert.equal(expectedOwner,owner);
    if (onVerifiedCa) onVerifiedCa(ca);
    if (previousInputs) state.finalVerifier++;
    return {ready:true,admin:{verified:true},verifier:{verified:true},errors:[]};
  },
}});
mock.module('../../ci/new-core-isolated-worker.mjs',{namedExports:{
  async loadArtifacts(){return {};},
  async stageWorker({request}) {
    assert.ok(state.drive.restarted_on);
    const path = `/accounts/${TARGET.account}/workers/workers`;
    await request(path,{method:'POST',body:{name:TARGET.worker,subdomain:{enabled:false,previews_enabled:false}}});
    const stage = binding => request(`${path}/${workerId}/versions?deploy=false`, {method:'POST',body:{bindings:[binding]}});
    await stage({name:'ACCESS_SUBJECT_HMAC_KEY',type:'secret_text',text:Buffer.alloc(32).toString('base64')});
    await stage({name:'ACCESS_SUBJECT_HMAC_KEY',type:'inherit',version_id:parentVersionId});
    return {workerId,parentVersionId,versionId,tag:TARGET.candidate};
  },
  async verifyWorkerVersion(){state.stagedReads++;},
}});

globalThis.fetch = async (url,init)=>{
  const u=new URL(url), method=init.method;
  if (u.hostname===TARGET.hostname) {
    assert.equal(method,'GET'); assert.equal(init.credentials,'omit'); assert.equal(init.redirect,'manual');
    assert.ok(['/flags','/api/admin/moderation/cases'].includes(u.pathname));
    state.challenges++;
    return new Response(null,{status:302,headers:{location:'https://fixture.cloudflareaccess.com/cdn-cgi/access/login/'+TARGET.hostname}});
  }
  assert.equal(u.hostname,'api.cloudflare.com');
  assert.equal(init.redirect,'error');
  assert.equal(init.headers.get('authorization'),'Bearer '+token);
  const path=u.pathname.replace('/client/v4',''), body=init.body ? JSON.parse(init.body) : null;
  let result;
  if (method === 'POST' && path.endsWith('/access/apps')) {
    assert.equal(body.domain,TARGET.hostname); assert.equal(body.policies.length,2);
    state.testPolicies = body.policies.map((p,i)=>({...p,id:String(i)}));
    if (state.fault==='owner_readback') state.testPolicies[0].include=[{everyone:{}}];
    state.testApp={...body,id:accessId,aud:'a'.repeat(64)}; delete state.testApp.policies;
    result=state.testApp;
  } else if (path.endsWith('/access/apps')) {
    result=[{id:uiId,name:'Lythaus Admin UI',domain:'admin.lythaus.co',type:'self_hosted'},
      {id:apiId,name:'Lythaus Admin API',domain:'admin-api.lythaus.co',type:'self_hosted'}];
    if (state.testApp) result.push(state.testApp);
    if (state.fault==='overlap') result.push({id:'wildcard',type:'self_hosted',destinations:[{type:'public',uri:'admin-new-*.lythaus.co/path'}]});
  } else if (path.endsWith('/policies')) result=path.includes(accessId) ? state.testPolicies : initialPolicies;
  else if (path.endsWith('/access/organizations')) result={auth_domain:'fixture.cloudflareaccess.com'};
  else if (path.endsWith('/pages/projects')) result=[{id:'93ac4df5-86c3-4986-93ea-74650e9f35d4',name:'lythaus-control-panel',
    production_branch:'main',canonical_deployment:{id:'pages-fixture'},domains:['admin.lythaus.co']}];
  else if (path.endsWith('/workers/domains')) result=[];
  else if (path.endsWith('/ssl/certificate_packs')) result=[{id:'edge',status:'active',hosts:['*.lythaus.co']}];
  else if (path.endsWith('/dns_records')) {
    if(method==='POST') { assert.ok(state.deployed && state.stagedReads>=2); state.dns={...body,id:dnsId}; result=state.dns; }
    else if(u.searchParams.get('name')==='admin.lythaus.co') result=[{name:'admin.lythaus.co',id:'production-dns'}];
    else result=u.searchParams.get('name')===TARGET.hostname && state.dns ? [state.dns] : [];
  } else if (path.endsWith('/workers/routes')) {
    if(method==='POST') {assert.ok(state.dns); state.route={...body,id:routeId}; result=state.route;}
    else result=state.route?[state.route]:[];
  } else if (path.endsWith('/mtls_certificates/'+ca.id)) result={id:ca.id,ca:true,certificates:ca.pem};
  else if (path.endsWith('/hyperdrive/configs/'+TARGET.hyperdrive)) {
    if(method==='PATCH') {assert.equal(body.origin.password,password);assert.equal(body.caching.disabled,true);
      assert.equal(body.mtls.sslmode,'verify-full'); Object.assign(state.drive.origin,{user:body.origin.user}); state.drive.mtls=body.mtls;}
    result=state.drive;
  } else if(path.endsWith('/restart')) {
    if(state.fault!=='restart_readback')state.drive.restarted_on='2026-11-17T00:00:00Z';
    result=state.drive;
  } else if(path.endsWith('/workers/workers')) result={id:workerId,name:TARGET.worker};
  else if(path.endsWith('/versions')) result={id:body.bindings[0].type==='inherit' ? versionId : parentVersionId};
  else if(path.endsWith('/subdomain')) result={enabled:false,previews_enabled:false};
  else if(path.endsWith('/deployments')) {
    if(method==='POST'){assert.equal(body.versions[0].version_id,versionId);assert.equal(state.stagedReads,1);
      state.deployed=true;result={id:'f'.repeat(32)};}
    else result=[];
  } else assert.fail('unexpected provider path');
  return Response.json({success:true,result});
};
const {runIsolatedSetup} = await import('../../ci/lythaus-new-core-isolated-setup.mjs');
for (const fault of ['none','overlap','owner_readback','restart_readback']) {
  state={fault,finalVerifier:0,challenges:0,stagedReads:0,deployed:false,drive:{id:TARGET.hyperdrive,
    origin:{scheme:'postgres',host:'fixture.invalid',port:5432,database:'postgres',user:'broad.'+TARGET.branch},caching:{disabled:true}}};
  const journal=[];
  const args={env:{CLOUDFLARE_API_TOKEN:token,LYTHAUS_NEW_CORE_ADMIN_DATABASE_URL:`postgres://lythaus_admin.${TARGET.branch}:${password}@fixture.invalid/postgres`},
    authorize:async()=>({privateCredentialConfirmed:true,existingPlanConfirmedByOwner:true,ownerSelectorConfirmedByOwner:true}),record:entry=>journal.push(entry)};
  if(fault==='none'){
    const result=await runIsolatedSetup(args);
    assert.equal(result.status,'OWNER_TEST_PENDING'); assert.equal(result.bootstrapCalled,false);
    assert.equal(state.finalVerifier,1);assert.equal(state.challenges,2);
    assert.deepEqual(journal.map(j=>j.operation),['create_access','configure_hyperdrive','restart_hyperdrive','create_worker',
      'stage_version','stage_version','activate_version','create_test_dns','create_test_route']);
    assert.doesNotMatch(JSON.stringify([result,journal]),/owner@|private-fixture/);
  } else if(fault==='overlap'){
    const result=await runIsolatedSetup(args);assert.equal(result.status,'ISOLATED_SETUP_BLOCKED');assert.deepEqual(journal,[]);
  } else {
    await assert.rejects(runIsolatedSetup(args),fault==='owner_readback'?/test_access_policies_readback/:/pool_restart_readback/);
    assert.deepEqual(journal.map(j=>j.operation),fault==='owner_readback'?['create_access']:['create_access','configure_hyperdrive','restart_hyperdrive']);
    assert.equal(state.deployed,false);assert.equal(state.dns,undefined);assert.equal(state.route,undefined);
  }
}
