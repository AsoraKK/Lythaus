import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import {mock} from 'node:test';
import {rootCertificates} from 'node:tls';

const issuer = 'https://fixture.cloudflareaccess.com', audience = 'a'.repeat(64);
const owner = 'owner@fixture.invalid', token = 'local-boundary-fixture';
const origin = {scheme:'postgres', host:'fixture.invalid', port:5432, database:'postgres'};
const ca = new crypto.X509Certificate(rootCertificates[0]);
const caId = 'a'.repeat(32), caSha = ca.fingerprint256.replaceAll(':', '').toLowerCase();
const baseline = 'ecaecf69d5fae1edfd63ed54561c12abff3ee7ac01ecac8dc034417703e2ee19';
const audiencePin = '41aefd1d7abc6594af51c0e1e2d7f01b1842d051b0eeb4ab84ae9ab5fc4b0a9e';
const realDigest = input => crypto.createHash('sha256').update(input).digest('hex');
// Represent private identity/provider values with exact fixture digests only.
// Every changed input still computes its ordinary digest and fails the real pin comparison.
const fixtureDigests = new Map([
  [realDigest(issuer), '3f706c248a4d0dc0950dd428a993ab52eddc52ae0e93e42376a9a11b3386bdd8'],
  [realDigest(audience), audiencePin],
  [realDigest(JSON.stringify(origin)), '30458dae9a257fc30c567ae95f44975fc766233fb11fc15d2542399bbdcd3558'],
  [realDigest(JSON.stringify({workers:[],routes:[]})), baseline],
]);
function createHash(...args) {
  const hash = crypto.createHash(...args);
  const digest = hash.digest.bind(hash);
  hash.digest = encoding => {
    const result = digest(encoding);
    return encoding === 'hex' ? fixtureDigests.get(result) ?? result : result;
  };
  return hash;
}
mock.module('node:crypto', {defaultExport:{...crypto.default, createHash}, namedExports:{...crypto, createHash}});
const {ACCOUNT, DRIVE, RECORDED_WORKER, RECORDED_WORKER_ID, SCRIPT, ZONE} = await import('../../ci/new-core-isolated-cloudflare.mjs');
const {TARGET} = await import('../../ci/lythaus-new-core-isolation-review.mjs');
const prior = {dnsId:'f934c861412f949f274856fd0282e328', routeId:'dab9759ef67e45b7bafa07e25817f7f2'};
const oldVersion = '37f36eb4-911d-4c51-b723-751329cd1b92', nextVersion = '11111111-1111-4111-8111-111111111111';
const newSource = 'c'.repeat(40);
const accessId = 'edd1c92d-bb85-4cd3-b31b-5971a7b12d13';
const controlPanel = {id:'2d440b64-6cde-48d7-b3cb-132129ee036f', name:'Lythaus Admin UI', type:'self_hosted', domain:'admin.lythaus.co'};
const productionAdmin = {id:'fa6906cc-3daf-4beb-82b5-143e708eca0d', name:'Lythaus Admin API', type:'self_hosted', domain:'admin-api.lythaus.co'};
const access = {id:accessId, name:'Lythaus New Core Admin Test', type:'self_hosted', domain:TARGET.hostname, aud:audience,
  session_duration:'1h', http_only_cookie_attribute:true, same_site_cookie_attribute:'lax', path_cookie_attribute:false};
const policies = [{id:'allow',decision:'allow',precedence:1,include:[{email:{email:owner}}]},
  {id:'deny',decision:'deny',precedence:2,include:[{everyone:{}}]}];

let state;
mock.module('../../ci/lythaus-new-core-admin-inputs.mjs', {namedExports:{
  async collectAdminInputs(options) {
    assert.equal(options.expectedOwner, owner);
    assert.equal(options.probeMembershipRead, true);
    assert.equal(options.privateCredentialConfirmed, true);
    assert.equal(options.existingPlanConfirmedByOwner, true);
    assert.equal(options.previousInputs, state.previousInputs);
    await assert.rejects(async () => options.fetchImpl('https://fixture.invalid', {method:'POST'}), /inspect_read_only/);
    state.databaseReads++;
    if (state.fault !== 'missing_ca') options.onVerifiedCa({id:caId, pem:ca.toString(), sha256:caSha});
    return state.previousInputs = {ready:state.fault !== 'inputs_failed', admin:{
      syntheticMembershipRead:state.fault === 'membership_error' ? 'permission_denied' : 'no_match'},
    verifier:{bootstrapClean:state.fault !== 'bootstrap_consumed'}};
  },
}});
const {createRepairBoundary} = await import('../../ci/lythaus-new-core-isolated-setup.mjs');

function activeBindings() {
  const vars = {EXPECTED_HOSTNAMES:TARGET.hostname, CORS_ALLOWED_ORIGINS:'https://' + TARGET.hostname,
    ACCESS_TEAM_DOMAIN:new URL(issuer).host, ACCESS_JWKS_URL:issuer + '/cdn-cgi/access/certs',
    ACCESS_AUDIENCES:audience, NEW_CORE_ACCESS_ISSUER:issuer, NEW_CORE_ACCESS_AUDIENCE_SHA256:audiencePin};
  return [...Object.entries(vars).map(([name,text]) => ({type:'plain_text', name,text})),
    {name:'DB_ADMIN_FRESH', type:'hyperdrive', id:TARGET.hyperdrive}, {name:'ACCESS_SUBJECT_HMAC_KEY', type:'secret_text'},
    {name:'WORKER_VERSION', type:'version_metadata'}];
}

globalThis.fetch = async (url, init) => {
  const u = new URL(url), headers = new Headers(init.headers);
  const path = u.pathname.replace(/^\/client\/v4/, '');
  assert.equal(init.method, 'GET');
  assert.equal(init.cache, 'no-store');
  if (u.hostname === TARGET.hostname) {
    assert.equal(init.credentials, 'omit');
    assert.equal(init.redirect, 'manual');
    assert.deepEqual([...headers.keys()], []);
    assert.ok(['/flags','/api/admin/moderation/cases'].includes(path));
    state.challenges.push(path);
    return new Response(null, {status:state.fault === 'edge_open' ? 200 : 302,
      headers:{location:issuer + '/cdn-cgi/access/login/' + TARGET.hostname}});
  }
  assert.equal(u.origin, 'https://api.cloudflare.com');
  assert.equal(init.redirect, 'error');
  assert.equal(headers.get('authorization'), 'Bearer ' + token);
  state.reads.push(path);
  const fault = state.fault;
  const testAccess = {...access, aud:fault === 'audience' ? 'b'.repeat(64) : audience};
  let result, info;
  if (path === ACCOUNT + '/access/apps') result = [testAccess,controlPanel,productionAdmin];
  else if (path === ACCOUNT + '/access/apps/' + accessId) result = testAccess;
  else if ([accessId,controlPanel.id,productionAdmin.id].some(id => path === ACCOUNT + '/access/apps/' + id + '/policies')) {
    result = fault === 'wide_access' && path.includes(accessId)
      ? [{...policies[0],include:[{everyone:{}}]},policies[1]] : policies;
  } else if (path === ACCOUNT + '/access/organizations') result = {auth_domain:fault === 'issuer' ? 'other.cloudflareaccess.com' : new URL(issuer).host};
  else if (path === ACCOUNT + '/mtls_certificates/' + caId) result = {id:caId, ca:true, certificates:ca.toString()};
  else if (path === DRIVE) result = {id:TARGET.hyperdrive, origin:{...origin, user:'lythaus_admin.' + TARGET.branch},
    caching:{disabled:true}, mtls:{sslmode:fault === 'tls_mode' ? 'require' : 'verify-full', ca_certificate_id:caId},
    restarted_on:fault === 'pool_restarted' ? '2026-11-24T01:00:00Z' : '2026-11-24T00:00:00Z'};
  else if (path === ZONE) result = {name:'lythaus.co',account:{id:TARGET.account}};
  else if (path === ZONE + '/workers/routes') {
    result = [{id:fault === 'route_id' ? 'd'.repeat(32) : prior.routeId, pattern:TARGET.hostname + '/*', script:TARGET.worker}];
    if (fault === 'production_drift') result.push({id:'c'.repeat(32), pattern:'control.lythaus.co/*', script:'lythaus-control'});
  } else if (path === ZONE + '/dns_records') {
    const name = u.searchParams.get('name');
    result = name === TARGET.hostname ? [{id:prior.dnsId,type:'A',name,content:'192.0.2.1',proxied:true,ttl:1}]
      : name === 'admin.lythaus.co' ? [{id:'e'.repeat(32),name}] : [];
  } else if (path === RECORDED_WORKER) result = {id:RECORDED_WORKER_ID, name:TARGET.worker, deployed_on:'2026-11-25T12:19:00Z',
    subdomain:{enabled:false,previews_enabled:false}, references:{domains:[]}, tail_consumers:[], logpush:false,
    observability:{enabled:false,logs:{enabled:false},traces:{enabled:false}}};
  else if (path === SCRIPT + '/script-settings') result = {logpush:fault === 'enabled_logging', observability:null};
  else if (path === ACCOUNT + '/workers/scripts') result = [{id:TARGET.worker}];
  else if (path === SCRIPT + '/settings') result = {bindings:activeBindings()};
  else if (path === SCRIPT + '/deployments') result = [{versions:[{version_id:state.version, percentage:fault === 'split' ? 50 : 100}]}];
  else if (path === SCRIPT + '/subdomain') result = {enabled:false,previews_enabled:false};
  else if (path === SCRIPT + '/versions/' + state.version) result = {resources:{
    bindings:fault === 'wrong_live_binding' ? [] : activeBindings()}, annotations:{'workers/tag':state.source}};
  else if (path === ACCOUNT + '/pages/projects') {
    result = [{id:'93ac4df5-86c3-4986-93ea-74650e9f35d4',name:'lythaus-control-panel',production_branch:'main',
      canonical_deployment:{id:fault === 'pages_deployment_changed' ? 'changed' : 'fixture'},domains:['admin.lythaus.co']}];
    info = {page:1,per_page:10,count:1,total_count:1,total_pages:1};
  } else if (path === ACCOUNT + '/workers/domains') result = [];
  else if (path === ZONE + '/ssl/certificate_packs') result = [{id:'cert',status:'active',hosts:['*.lythaus.co']}];
  else assert.fail('unexpected provider read: ' + path);
  return Response.json({success:true,result,result_info:info});
};

function start(fault) {
  state = {fault,version:oldVersion,source:TARGET.candidate,reads:[],challenges:[],databaseReads:0,reviews:0};
  return createRepairBoundary({env:{REQUESTED_OPERATION:'stage-isolated-repair',CLOUDFLARE_API_TOKEN:token},
    prior, sourceDir:'fixture', authorize:async () => {
      state.reviews++;
      return {privateCredentialConfirmed:state.fault !== 'custody', existingPlanConfirmedByOwner:true, ownerSelectorConfirmedByOwner:true};
    }, record:() => assert.fail('read boundary journaled a write')}).checkBoundary;
}

{
  const check = start();
  for (const [version, source] of [[oldVersion,TARGET.candidate],[nextVersion,newSource]]) {
    state.version = version; state.source = source;
    assert.deepEqual(await check(), {audience,issuer,servingVersionId:version,servingSourceSha:source});
    assert.ok(state.reads.includes(SCRIPT + '/versions/' + version));
  }
  assert.equal(state.reviews, 2);
  assert.equal(state.databaseReads, 2);
  assert.deepEqual(state.challenges, ['/flags','/api/admin/moderation/cases','/flags','/api/admin/moderation/cases']);
}

for (const [fault, reason] of [
  ['custody','private_custody_unconfirmed'], ['wide_access','test_access_policies_readback'],
  ['issuer','access_identity_changed'], ['audience','access_identity_changed'], ['membership_error','database_boundary_unverified'],
  ['inputs_failed','database_boundary_unverified'], ['bootstrap_consumed','database_boundary_unverified'], ['missing_ca','database_boundary_unverified'],
  ['tls_mode','scoped_hyperdrive_readback'], ['route_id','routing_changed'], ['enabled_logging','exposure_or_logging_changed'],
  ['production_drift','live_isolation_or_production_drift'], ['wrong_live_binding','serving_boundary_unverified'],
  ['split','serving_boundary_unverified'], ['edge_open','anonymous_access_challenge_unverified'],
]) {
  const check = start(fault);
  await assert.rejects(check(), new RegExp(reason), fault);
  if (fault === 'custody') assert.deepEqual(state.reads, []);
}
for (const fault of ['pool_restarted','pages_deployment_changed']) {
  const check = start();
  await check();
  state.fault = fault;
  await assert.rejects(check(), /repair_provider_boundary_changed/);
}
