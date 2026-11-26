import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';
import {TARGET,accessEvidence,hyperdriveEvidence,createReadOnlyClient,inspectIsolation,inspectProductionConnectors,discoverProductionMetadata} from '../ci/lythaus-new-core-isolation-review.mjs';

const app={id:'testapp',type:'self_hosted',domain:TARGET.hostname,aud:'synthetic-audience'};
const policies=[{id:'allow-fixture',decision:'allow',precedence:1,include:[{email:{email:'fixture@example.invalid'}}]},
  {id:'deny-fixture',decision:'deny',precedence:2,include:[{everyone:{}}]}];
test('owner verification needs a private expectation and never returns the identity or its digest',()=>{
  const missing=accessEvidence([app],policies);assert.equal(missing.intendedOwnerVerified,null);
  const pass=accessEvidence([app],policies,'fixture@example.invalid');assert.equal(pass.intendedOwnerVerified,true);
  assert.equal(accessEvidence([app],policies,'another@example.invalid').intendedOwnerVerified,false);
  assert.equal(accessEvidence([app,{...app,id:'wildcard',domain:'*.lythaus.co'}],policies,'fixture@example.invalid').intendedOwnerVerified,false);
  assert.equal(accessEvidence([app],[...policies,{decision:'bypass',include:[{everyone:{}}]}],'fixture@example.invalid').soleHumanPolicy,false);
  assert.doesNotMatch(JSON.stringify(pass),/fixture@example|humanAllowEmail|ownerSha/);
});
test('the Hyperdrive evaluator accepts the exact scoped SQL login and rejects a broad or wrong-branch login',()=>{
  const config={id:TARGET.hyperdrive,origin:{user:`lythaus_admin.${TARGET.branch}`,scheme:'postgres',host:'synthetic.psdb.cloud',port:5432,database:'postgres'},caching:{disabled:true},mtls:{sslmode:'verify-full',ca_certificate_id:'fixture'}};
  const pass=hyperdriveEvidence(config);assert.equal(pass.scopedAdminLogin,true);assert.equal(pass.cacheDisabled,true);assert.equal(pass.verifyFullAndCaConfigured,true);assert.equal(pass.originMatches,false);
  for(const user of [`pscale_api_fixture.${TARGET.branch}`,'lythaus_admin.otherbranch','lythaus_migrations.'+TARGET.branch])assert.equal(hyperdriveEvidence({...config,origin:{...config.origin,user}}).scopedAdminLogin,false);
});

test('publication cannot run the inspector and existing owner review precedes Cloudflare credential injection',()=>{
  const text=fs.readFileSync('.github/workflows/lythaus-new-core-isolation-readonly.yml','utf8');const workflow=YAML.parse(text);
  assert.deepEqual(Object.keys(workflow.on),['workflow_dispatch']);assert.equal(workflow.on.workflow_dispatch.inputs.confirm_read_only.default,false);
  assert.deepEqual(workflow.permissions,{contents:'read',actions:'read'});assert.equal(workflow.jobs.inspect.needs,'verify-gate');assert.equal(workflow.jobs.inspect.environment,'production');
  const first=JSON.stringify(workflow.jobs['verify-gate']);assert.doesNotMatch(first,/CLOUDFLARE_API_TOKEN|secrets\./);
  const secrets=[...text.matchAll(/secrets\.([A-Z_]+)/g)].map(m=>m[1]);assert.deepEqual(secrets,['CLOUDFLARE_API_TOKEN','LYTHAUS_NEW_CORE_OWNER_EMAIL','CLOUDFLARE_API_TOKEN']);
  const mode = workflow.on.workflow_dispatch.inputs.production_connector_discovery_only;
  assert.equal(mode.default,false);
  assert.equal(workflow.on.workflow_dispatch.inputs.worker_source_sha.default,TARGET.candidate);
  const [approval, original, discovery] = workflow.jobs.inspect.steps.slice(-3);
  assert.match(approval.run,/verifyExistingGate\(\{env:process.env,requireApproval:true\}\)/);
  assert.equal(original.if,'${{ !inputs.production_connector_discovery_only }}');
  assert.equal(discovery.if,'${{ inputs.production_connector_discovery_only }}');
  assert.deepEqual(Object.keys(discovery.env),['GH_TOKEN','CLOUDFLARE_API_TOKEN']);
  assert.match(discovery.run,/--discover-connectors$/);
  assert.doesNotMatch(text,/DATABASE_URL|PLANETSCALE_API_TOKEN|wrangler|--apply|secrets: inherit/);
});
test('HTTP reads have a fixed scope, never follow redirects and do not leak provider response bodies',async()=>{
  const calls=[];const api=createReadOnlyClient('synthetic-token',async(url,init)=>{calls.push({url,init});return new Response('provider-private-content',{status:403});});
  await assert.rejects(api.get(`/accounts/${TARGET.account}/hyperdrive/configs/${TARGET.hyperdrive}`),/isolation_provider_hyperdrive_http_403/);
  assert.equal(calls[0].init.method,'GET');assert.equal(calls[0].init.redirect,'error');
  await assert.rejects(api.get('/accounts/other/workers/scripts'),/scope_blocked/);
  await assert.rejects(api.get(`/accounts/${TARGET.account}/hyperdrive/configs/other`),/scope_blocked/);
  assert.equal(calls.length,1);
});
test('missing test resources remain blockers while production bindings are snapshotted and never changed',async()=>{
  const account=`/accounts/${TARGET.account}`,zone=`/zones/${TARGET.zone}`,calls=[];
  const results=new Map([
    [account+'/access/apps',[]],[account+'/access/organizations',{auth_domain:'fixture.cloudflareaccess.com'}],
    [account+'/workers/scripts',[{id:'lythaus-admin-api-development'}]],
    [account+'/workers/scripts/lythaus-admin-api-development/settings',{bindings:[{type:'hyperdrive',name:'DB_ADMIN_FRESH',id:'production-id'},{type:'secret_text',name:'PRIVATE',text:'do-not-report'}]}],
    [account+'/workers/scripts/lythaus-admin-api-development/deployments',{deployments:[{versions:[{version_id:'12345678-1234-1234-8234-123456789abc',percentage:100}]}]}],
    [account+'/workers/scripts/lythaus-admin-api-development/subdomain',{enabled:false,previews_enabled:false}],
    [account+'/workers/scripts/lythaus-admin-api-development/versions/12345678-1234-1234-8234-123456789abc',
      {resources:{bindings:[{type:'hyperdrive',name:'DB_ADMIN_FRESH',id:'production-id'}]}}],
    [zone,{name:'lythaus.co',account:{id:TARGET.account}}],[zone+'/workers/routes',[{id:'prod',pattern:'admin-api.lythaus.co/*',script:'lythaus-admin-api-development'}]],
    [zone+'/dns_records',[]],
  ]);
  const report=await inspectIsolation({token:'synthetic',fetchImpl:async(url,init)=>{
    calls.push({url,method:init.method});const path=new URL(url).pathname.replace('/client/v4','');
    if(path===account+'/hyperdrive/configs/'+TARGET.hyperdrive||path===account+'/workers/scripts/'+TARGET.worker+'/settings')return new Response('{}',{status:404});
    assert.ok(results.has(path),path);return Response.json({success:true,result:results.get(path)});
  }});
  assert.equal(report.readiness,'BLOCKED');assert.equal(report.worker.exists,false);assert.equal(report.access.intendedOwnerVerified,null);
  assert.equal(report.mutationCount,0);assert.equal(report.sqlExecuted,false);assert.ok(calls.every(c=>c.method==='GET'));
  assert.equal(report.productionSnapshot.workers[0].bindings[0].id,'production-id');
  assert.doesNotMatch(JSON.stringify(report),/do-not-report|synthetic-token/);
});

test('serving version bindings, private owner match and Hyperdrive sharing are evaluated without exposing unrelated data',async()=>{
  const account=`/accounts/${TARGET.account}`,zone=`/zones/${TARGET.zone}`;
  const id='12345678-1234-1234-8234-123456789abc';
  const configuration={bindings:[{type:'hyperdrive',name:'DB_ADMIN_FRESH',id:TARGET.hyperdrive},
    {type:'secret_text',name:'ACCESS_SUBJECT_HMAC_KEY',text:'never-print-this'},
    {type:'version_metadata',name:'WORKER_VERSION'},
    ...Object.entries({ACCESS_TEAM_DOMAIN:'fixture.cloudflareaccess.com',ACCESS_JWKS_URL:'https://fixture.cloudflareaccess.com/cdn-cgi/access/certs',
      ACCESS_AUDIENCES:app.aud,NEW_CORE_ACCESS_ISSUER:'https://fixture.cloudflareaccess.com',
      NEW_CORE_ACCESS_AUDIENCE_SHA256:accessEvidence([app],policies).audienceSha256,
      EXPECTED_HOSTNAMES:TARGET.hostname,CORS_ALLOWED_ORIGINS:`https://${TARGET.hostname}`}).map(([name,text])=>({type:'plain_text',name,text}))]};
  const fetchImpl=async(url,init)=>{
    assert.equal(init.method,'GET');const path=new URL(url).pathname.replace('/client/v4','');let result;
    if(path.endsWith('/hyperdrive/configs/'+TARGET.hyperdrive))result={id:TARGET.hyperdrive,origin:{user:`lythaus_admin.${TARGET.branch}`,scheme:'postgres',host:'fixture.psdb.cloud',port:5432,database:'postgres'},caching:{disabled:true},mtls:{sslmode:'verify-full',ca_certificate_id:'fixture'}};
    else if(path===account+'/access/apps')result=[app];
    else if(path===account+'/access/apps/testapp/policies')result=policies;
    else if(path===account+'/access/organizations')result={auth_domain:'fixture.cloudflareaccess.com'};
    else if(path===account+'/workers/scripts')result=[{id:TARGET.worker},{id:'unrelated-fixture'}];
    else if(path.endsWith('/settings'))result=configuration;
    else if(path.endsWith('/deployments'))result={deployments:[{versions:[{version_id:id,percentage:100}]}]};
    else if(path.endsWith('/subdomain'))result={enabled:false,previews_enabled:false};
    else if(path.endsWith('/versions/'+id))result={annotations:{'workers/tag':TARGET.candidate},resources:{bindings:configuration.bindings}};
    else if(path===zone)result={name:'lythaus.co',account:{id:TARGET.account}};
    else if(path===zone+'/workers/routes')result=[{id:'test',pattern:TARGET.hostname+'/*',script:TARGET.worker}];
    else if(path===zone+'/dns_records')result=[{name:TARGET.hostname,proxied:true}];
    else assert.fail('unexpected read');return Response.json({success:true,result});
  };
  const r=await inspectIsolation({token:'fixture-token',expectedOwner:'fixture@example.invalid',expectedVersionId:id,fetchImpl});
  assert.equal(r.access.intendedOwnerVerified,true);assert.equal(r.worker.exactVersionPinMatches,true);assert.equal(r.worker.soleDatabaseBindingMatches,true);assert.equal(r.worker.accessVariablesMatch,true);
  assert.equal(r.checks.exclusiveHyperdrive,false);assert.equal(r.nonLythausHyperdriveConsumerCount,1);assert.equal(r.readiness,'BLOCKED');
  assert.doesNotMatch(JSON.stringify(r),/fixture@example|never-print-this|unrelated-fixture|fixture-token/);
});

test('incomplete or duplicated pagination cannot masquerade as a complete inventory',async()=>{
  const api=createReadOnlyClient('fixture',async()=>Response.json({success:true,result:[{id:'same'}],result_info:{total_pages:2}}));
  await assert.rejects(api.list(`/accounts/${TARGET.account}/access/apps`),/inventory_ambiguous/);
});

test('discovery uses only GET metadata, distinguishes incomplete listings and hides raw fields', async () => {
  const version = 'aaaaaaaa-1111-4111-8111-111111111111';
  for (const pagination of [true,false]) {
    const fetchImpl = async (url, options) => {
      assert.equal(options.method, 'GET');
      assert.equal(options.redirect, 'error');
      const parsed = new URL(url);
      assert.equal(parsed.origin, 'https://api.cloudflare.com');
      assert.ok(parsed.pathname.startsWith('/client/v4/accounts/' + TARGET.account + '/'));
      let result, result_info;
      if (parsed.pathname.endsWith('/hyperdrive/configs')) {
        result = [{id:TARGET.hyperdrive}];
        if (pagination) result_info = {page:1,count:1,total_count:1};
      } else if (parsed.pathname.endsWith(TARGET.hyperdrive)) {
        result = {id:TARGET.hyperdrive,origin:{user:'lythaus_admin.'+TARGET.branch,password:'private-fixture'}};
      } else if (parsed.pathname.endsWith('/deployments')) {
        result = [{created_on:'2026-11-18T00:00:00Z',versions:[{version_id:version,percentage:100}]}];
      } else if (parsed.pathname.endsWith('/versions/'+version)) {
        result = {id:version,resources:{bindings:[{name:'MONTHLY_REPUTATION_SHADOW_RULES',text:'private-fixture'}]}};
      } else assert.fail('unexpected discovery request');
      return Response.json({success:true,result,result_info});
    };
    const proof = await inspectProductionConnectors({token:'fixture',fetchImpl});
    assert.equal(proof.inventoryComplete,pagination);
    assert.equal(proof.matches[0].reservedForIsolation,true);
    assert.equal(proof.matches[0].exactOrigin,false);
    assert.deepEqual(proof.monthlySettings.map(row => row.monthlyRuleBindingCount),[1,1]);
    assert.ok(!JSON.stringify(proof).includes('private-fixture'));
  }
});

test('an unclassifiable connector preserves known matches and makes the consolidated inventory incomplete', async () => {
  const otherId = 'b'.repeat(32);
  const version = 'aaaaaaaa-1111-4111-8111-111111111111';
  const json = (result, result_info) => Response.json({success:true,result,result_info});
  async function discover(origin) {
    const fetchImpl = async url => {
      if (url.includes('/hyperdrive/configs?')) return json([{id:otherId},{id:TARGET.hyperdrive}],{page:1,count:2,total_count:2});
      if (url.endsWith('/hyperdrive/configs/' + otherId)) return json({id:otherId,origin});
      if (url.endsWith('/hyperdrive/configs/' + TARGET.hyperdrive)) return json({id:TARGET.hyperdrive,origin:{user:'lythaus_admin.' + TARGET.branch}});
      if (url.endsWith('/deployments')) return json([{created_on:'2026-11-25T00:00:00Z',versions:[{version_id:version,percentage:100}]}]);
      if (url.endsWith('/versions/' + version)) return json({id:version,resources:{bindings:[]}});
      if (url.includes('/rulesets/phases/')) return json({rules:[]});
      return json([],{page:1,count:0,total_count:0,total_pages:1});
    };
    return discoverProductionMetadata({token:'fixture',fetchImpl});
  }
  for (const origin of [undefined, {host:'private-fixture',password:'private-fixture'}]) {
    const report = await discover(origin);
    assert.equal(report.status,'READ_ONLY_DISCOVERY_INCOMPLETE');
    assert.equal(report.inventoryComplete,false);
    assert.equal(report.unclassifiedConnectorCount,1);
    assert.deepEqual(report.matches.map(row => row.id),[TARGET.hyperdrive]);
    assert.equal(report.monthlySettings.length,2);
    assert.deepEqual(report.hostRouting.incomplete,[]);
    assert.ok(!JSON.stringify(report).includes('private-fixture'));
  }
  const report = await discover({scheme:'postgres',host:'fixture.invalid',port:5432,database:'postgres'});
  assert.equal(report.status,'READ_ONLY_DISCOVERY');
  assert.equal(report.inventoryComplete,true);
  assert.equal(report.unclassifiedConnectorCount,undefined);
});

test('contradictory connector pagination cannot certify completeness', async () => {
  const fetchImpl = async () => Response.json({success:true,result:[{id:TARGET.hyperdrive}],
    result_info:{page:1,count:1,total_count:1,total_pages:2}});
  await assert.rejects(inspectProductionConnectors({token:'fixture',fetchImpl}), /connector_inventory_pagination_changed/);
});

test('monthly settings denial preserves the connector metadata already verified', async () => {
  const fetchImpl = async url => {
    if (url.includes('/hyperdrive/configs?')) {
      return Response.json({success:true,result:[{id:TARGET.hyperdrive}],result_info:{page:1,count:1,total_count:1}});
    }
    if (url.endsWith('/hyperdrive/configs/' + TARGET.hyperdrive)) {
      return Response.json({success:true,result:{id:TARGET.hyperdrive,origin:{user:'lythaus_admin.' + TARGET.branch}}});
    }
    assert.match(url,/lythaus-public-api-development\/deployments$/);
    return new Response('private-denial-body',{status:429});
  };
  const report = await inspectProductionConnectors({token:'fixture',fetchImpl});
  assert.equal(report.inventoryComplete,true);
  assert.equal(report.matches[0].reservedForIsolation,true);
  assert.deepEqual(report.monthlySettings,[]);
  assert.deepEqual(report.monthlySettingsErrors,[{worker:'lythaus-public-api-development',code:'isolation_provider_worker_deployments_http_429'}]);
});

test('the exact dispatch operation and owner control are required before reads', () => {
  const command = 'scripts/ci/lythaus-new-core-isolation-review.mjs';
  for (const [input, action, code] of [
    ['true','--inspect','isolation_mode_blocked'],
    ['false','--discover-connectors','isolation_mode_blocked'],
    ['true','--discover-connectors','preflight_context_blocked'],
  ]) {
    const result = spawnSync(process.execPath,[command,action],{env:{CONNECTOR_DISCOVERY_ONLY:input},encoding:'utf8'});
    assert.equal(result.status,1);
    assert.equal(result.stdout,'');
    assert.deepEqual(JSON.parse(result.stderr),{status:'READ_ONLY_ISOLATION_REVIEW_BLOCKED',code});
  }
});

test('a denied connector read preserves the independent host findings', async () => {
  const fetchImpl = async (url,init) => {
    assert.equal(init.method,'GET');
    assert.equal(init.redirect,'error');
    if (url.includes('/hyperdrive/configs?')) return new Response('private-denial-body',{status:403});
    const data = url.includes('/rulesets/phases/') ? {rules:[]} : [];
    return Response.json({success:true,result:data,...(url.includes('page=') ? {result_info:{page:1,count:0,total_count:0,total_pages:1}} : {})});
  };
  const report = await discoverProductionMetadata({token:'private-fixture-token',fetchImpl});
  assert.equal(report.status,'READ_ONLY_DISCOVERY_INCOMPLETE');
  assert.equal(report.inventoryComplete,false);
  assert.equal(report.code,'isolation_provider_hyperdrive_http_403');
  assert.equal(report.hostRouting.routingDecision,'REHEARSAL_ONLY');
  assert.ok(report.hostRouting.claims.some(row => row.host === 'control.lythaus.co'));
  assert.doesNotMatch(JSON.stringify(report),/private-denial-body|private-fixture-token/);
});

test('an account-wide denial ends the consolidated inspection without new requests', async () => {
  for (const status of [401,429]) {
    let calls=0;
    const fetchImpl = async () => {
      calls++;
      return new Response('private-denial-body',{status,headers:{'retry-after':'90'}});
    };
    const report = await discoverProductionMetadata({token:'fixture',fetchImpl});
    assert.equal(calls,1);
    assert.ok(report.hostRouting.incomplete.some(row => row.status === status));
    assert.equal(report.code,'connector_reads_skipped_after_http_' + status);
    assert.equal(report.inventoryComplete,false);
    assert.equal(report.status,'READ_ONLY_DISCOVERY_INCOMPLETE');
    assert.doesNotMatch(JSON.stringify(report),/private-denial-body/);
  }
});
