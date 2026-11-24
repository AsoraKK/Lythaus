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
const accessId = 'edd1c92d-bb85-4cd3-b31b-5971a7b12d13', dnsId = 'd'.repeat(32), routeId = 'e'.repeat(32);
const uiId = '2d440b64-6cde-48d7-b3cb-132129ee036f', apiId='fa6906cc-3daf-4beb-82b5-143e708eca0d';
const initialPolicies = [
  {id:'allow',name:'owner',decision:'allow',precedence:1,include:[{email:{email:owner}}]},
  {id:'deny',name:'all',decision:'deny',precedence:2,include:[{everyone:{}}]},
];
let state;
const accessApp = {id:accessId,name:'Lythaus New Core Admin Test',domain:TARGET.hostname,type:'self_hosted',
  session_duration:'1h',http_only_cookie_attribute:true,path_cookie_attribute:false,
  same_site_cookie_attribute:'lax',allowed_idps:[],aud:'a'.repeat(64)};
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
    assert.equal(body.http_only_cookie_attribute,true);assert.equal(body.path_cookie_attribute,false);
    assert.equal(body.same_site_cookie_attribute,'lax');
    state.testPolicies = body.policies.map((p,i)=>({...p,id:String(i)}));
    if (state.fault==='owner_readback') state.testPolicies[0].include=[{everyone:{}}];
    state.testApp={...body,id:accessId,aud:'a'.repeat(64)}; delete state.testApp.policies;
    if (state.fault==='cookie_readback') state.testApp.http_only_cookie_attribute=false;
    if (state.fault==='fresh_path_cookie_omitted') delete state.testApp.path_cookie_attribute;
    result=state.testApp;
  } else if (path.endsWith('/access/apps')) {
    result=[{id:uiId,name:'Lythaus Admin UI',domain:'admin.lythaus.co',type:'self_hosted'},
      {id:apiId,name:'Lythaus Admin API',domain:'admin-api.lythaus.co',type:'self_hosted'}];
    if (state.testApp) result.push(state.fault==='resume_sparse_list' ? {...state.testApp,path_cookie_attribute:undefined}
      : state.fault==='resume_list_conflict' ? {...state.testApp,path_cookie_attribute:true} : state.testApp);
    if (state.fault==='resume_duplicate_audience') result.push({id:'unrelated',domain:'unrelated.fixture.invalid',aud:accessApp.aud});
    if (state.fault==='overlap') result.push({id:'wildcard',type:'self_hosted',destinations:[{type:'public',uri:'admin-new-*.lythaus.co/path'}]});
  } else if (path.endsWith('/access/apps/'+accessId)) {
    assert.equal(method,'GET');
    result=state.fault==='resume_audience_drift' ? {...state.testApp,aud:'b'.repeat(64)} : state.testApp;
  } else if (path.endsWith('/policies')) result=path.includes(accessId) ? state.testPolicies : initialPolicies;
  else if (path.endsWith('/access/organizations')) result={auth_domain:'fixture.cloudflareaccess.com'};
  else if (path.endsWith('/pages/projects')) {
    const page = Number(u.searchParams.get('page') ?? 1);
    assert.equal(u.search, page === 1 ? '' : '?page=2');
    const collision = state.fault === 'later_pages_collision';
    const project = {id:'93ac4df5-86c3-4986-93ea-74650e9f35d4',name:'lythaus-control-panel',
      production_branch:'main',canonical_deployment:{id:'pages-fixture'},domains:['admin.lythaus.co']};
    const other = {id:'a'.repeat(32),domains:collision ? [TARGET.hostname] : []};
    result = [page === 1 ? other : project];
    if (collision) result = [page === 1 ? project : other];
    const info = {page,per_page:10,count:1,total_count:2,total_pages:2};
    return Response.json({success:true,result,result_info:state.fault === 'missing_pages_metadata' ? {} : info});
  }
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
const {inspectSetupInputs,runIsolatedSetup} = await import('../../ci/lythaus-new-core-isolated-setup.mjs');
const rejectedCookieShapes = {resume_cookie_enabled:true,resume_cookie_null:null,resume_cookie_malformed:'false'};
for (const fault of ['none','overlap','later_pages_collision','missing_pages_metadata','owner_readback','cookie_readback','restart_readback',
  'fresh_path_cookie_omitted','resume_sparse_list','resume_cookie_omitted','resume_wrong_id','resume_missing',
  ...Object.keys(rejectedCookieShapes),'resume_cookie_path_destination','resume_cookie_private_destination',
  'resume_cookie_destination_override','resume_cookie_duplicate_destination','resume_audience_drift','resume_duplicate_audience',
  'resume_wrong_owner','resume_list_conflict']) {
  state={fault,finalVerifier:0,challenges:0,stagedReads:0,deployed:false,drive:{id:TARGET.hyperdrive,
    origin:{scheme:'postgres',host:'fixture.invalid',port:5432,database:'postgres',user:'broad.'+TARGET.branch},caching:{disabled:true}}};
  const journal=[];
  const args={env:{CLOUDFLARE_API_TOKEN:token,LYTHAUS_NEW_CORE_ADMIN_DATABASE_URL:`postgres://lythaus_admin.${TARGET.branch}:${password}@fixture.invalid/postgres`},
    authorize:async()=>({privateCredentialConfirmed:true,existingPlanConfirmedByOwner:true,ownerSelectorConfirmedByOwner:true}),record:entry=>journal.push(entry)};
  if (fault.startsWith('resume_')) {
    if (fault!=='resume_missing') {
      state.testApp={...accessApp};
      state.testPolicies=structuredClone(initialPolicies);
      if (fault==='resume_wrong_id') state.testApp.id='b'.repeat(32);
      if (Object.hasOwn(rejectedCookieShapes,fault)) state.testApp.path_cookie_attribute=rejectedCookieShapes[fault];
      if (fault.startsWith('resume_cookie_') && !Object.hasOwn(rejectedCookieShapes,fault)) delete state.testApp.path_cookie_attribute;
      if (fault==='resume_cookie_path_destination') state.testApp.destinations=[{type:'public',uri:TARGET.hostname+'/flags'}];
      if (fault==='resume_cookie_private_destination') state.testApp.destinations=[{type:'private',hostname:TARGET.hostname}];
      if (fault==='resume_cookie_destination_override') state.testApp.destinations=[{type:'public',uri:TARGET.hostname,
        overrides:[{path_pattern:'/flags',behavior:'public'}]}];
      if (fault==='resume_cookie_duplicate_destination') state.testApp.destinations=Array.from({length:2},()=>({type:'public',uri:TARGET.hostname}));
      if (fault==='resume_wrong_id') delete state.testApp.path_cookie_attribute;
      if (fault==='resume_wrong_owner') state.testPolicies[0].include=[{email:{email:'other@fixture.invalid'}}];
    }
    const inspection=await inspectSetupInputs(args);
    assert.deepEqual(journal,[]);
    if (fault==='resume_sparse_list' || fault==='resume_cookie_omitted') {
      assert.equal(inspection.ready,true);
      assert.equal(inspection.existingTestAccess.listing.pathCookie,true);
      assert.equal(inspection.existingTestAccess.details.pathCookie,true);
      assert.deepEqual(inspection.existingTestAccess.cookiePathReadback,{listing:'omitted',
        details:fault==='resume_sparse_list'?'disabled':'omitted'});
      assert.equal(inspection.existingTestAccess.policies.ownerOnly,true);
      assert.equal((await runIsolatedSetup(args)).status,'ISOLATED_SETUP_BLOCKED');
      assert.deepEqual(journal,[]);
      const result=await runIsolatedSetup({...args,resumeAccess:true});
      assert.equal(result.status,'OWNER_TEST_PENDING');
      assert.equal(result.accessAppId,accessId);
      assert.equal(result.bootstrapCalled,false);
      assert.equal(journal[0].operation,'configure_hyperdrive');
      assert.equal(journal.some(j=>j.operation==='create_access'),false);
    } else {
      if (fault!=='resume_missing') assert.equal(inspection.ready,false);
      if (Object.hasOwn(rejectedCookieShapes,fault)) {
        assert.equal(inspection.existingTestAccess.details.pathCookie,false);
        assert.equal(inspection.existingTestAccess.cookiePathReadback.details,fault.slice('resume_cookie_'.length));
      }
      if (fault==='resume_list_conflict') {
        assert.equal(inspection.existingTestAccess.listing.settingsConsistent,false);
        assert.equal(inspection.existingTestAccess.details.pathCookie,true);
      }
      if (fault==='resume_wrong_owner') assert.equal(inspection.existingTestAccess.policies.ownerOnly,false);
      if (fault==='resume_audience_drift') assert.equal(inspection.existingTestAccess.details.audienceMatchesListing,false);
      if (fault==='resume_duplicate_audience') assert.equal(inspection.existingTestAccess.listing.uniqueAudience,false);
      const result=await runIsolatedSetup({...args,resumeAccess:true});
      assert.equal(result.status,'ISOLATED_SETUP_BLOCKED');
      assert.deepEqual(journal,[]);
    }
    assert.doesNotMatch(JSON.stringify(inspection),/@fixture|private-fixture|a{64}|b{64}/);
  } else if(fault==='none'){
    const inspection=await inspectSetupInputs(args);
    assert.equal(inspection.ready,true);
    assert.equal(inspection.ownerMatchesReviewedSelector,true);
    assert.equal(inspection.pagesProjectsChecked,2);
    assert.equal(state.testApp,undefined);
    const result=await runIsolatedSetup(args);
    assert.equal(result.status,'OWNER_TEST_PENDING'); assert.equal(result.bootstrapCalled,false);
    assert.equal(state.finalVerifier,1);assert.equal(state.challenges,2);
    assert.deepEqual(journal.map(j=>j.operation),['create_access','configure_hyperdrive','restart_hyperdrive','create_worker',
      'stage_version','stage_version','activate_version','create_test_dns','create_test_route']);
    assert.doesNotMatch(JSON.stringify([result,journal]),/owner@|private-fixture/);
  } else if(['overlap','later_pages_collision','missing_pages_metadata'].includes(fault)){
    const result=await runIsolatedSetup(args);assert.equal(result.status,'ISOLATED_SETUP_BLOCKED');assert.deepEqual(journal,[]);
    if(fault==='later_pages_collision') assert.ok(result.blocked.includes('setup_pages_hostname_collision'));
    if(fault==='missing_pages_metadata') assert.ok(result.blocked.includes('setup_pages_pagination_unverified'));
  } else {
    const failures = {owner_readback:/test_access_policies_readback/,cookie_readback:/test_access_app_readback/,
      fresh_path_cookie_omitted:/test_access_app_readback/,restart_readback:/pool_restart_readback/};
    await assert.rejects(runIsolatedSetup(args),failures[fault]);
    assert.deepEqual(journal.map(j=>j.operation),fault==='restart_readback'?['create_access','configure_hyperdrive','restart_hyperdrive']:['create_access']);
    assert.equal(state.deployed,false);assert.equal(state.dns,undefined);assert.equal(state.route,undefined);
  }
}
