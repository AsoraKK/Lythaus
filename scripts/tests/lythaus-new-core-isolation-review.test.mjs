import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import YAML from 'yaml';
import {TARGET,accessEvidence,hyperdriveEvidence,createReadOnlyClient,inspectIsolation} from '../ci/lythaus-new-core-isolation-review.mjs';

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
  const discovery=workflow.jobs.inspect.steps.at(-1);
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
