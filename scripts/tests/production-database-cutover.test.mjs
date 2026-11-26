import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { firstFullStage, loadFirstFullAdminReceipt } from '../ci/first-full-admin-receipt.mjs';
import { stageFullAdminVersion, verifyStageGate } from '../ci/new-core-full-admin-stage.mjs';
import { PINS, REPOSITORY } from '../ci/lythaus-new-core-schema-install-control.mjs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { inspectPromotionSource, prepareReplacementAdminUpload, verifyReplacementAdminUpload, transition, validateProductionDatabaseMap, verifyIsolatedAdminBeforePromotion, verifyIsolatedAdminVersions, verifyRollbackPlane } from '../ci/production-database-cutover.mjs';
import { verifyAdminZeroStage } from '../ci/verify-cloudflare-hyperdrive-targets.mjs';
import { bindingRepairState } from '../ci/new-core-isolated-repair-state.mjs';
import { inspectProductionConnectors, TARGET } from '../ci/lythaus-new-core-isolation-review.mjs';
import { coversHost, inspectControlRouting } from '../ci/control-host-routing.mjs';
import { createControlWorker } from '../../apps/lythaus-admin-api/src/control-worker.ts';
import { verifiedAccessSubject } from '../../apps/lythaus-admin-api/src/admin-access-runtime-policy.ts';
import { monthlyReputationShadowEnabled } from '../../packages/db/src/monthly-reputation.ts';

test('the optional monthly Jobs path reads no flag on a clean schema', async () => {
  const queries = [];
  const client = {query:async sql => {
    queries.push(sql);
    if (queries.length === 1) {
      assert.match(sql, /has_column_privilege/);
      return {rows:[{readable:false}]};
    }
    assert.match(sql, /to_regclass\('trust\.monthly_reputation_sources'\)/);
    return {rows:[{installed:false}]};
  }};
  assert.equal(await monthlyReputationShadowEnabled(client),false);
  assert.equal(queries.length,2);
});

test('an installed monthly schema with missing flag privileges surfaces the database error', async () => {
  const client = {query:async sql => {
    if (sql.includes('has_column_privilege')) return {rows:[{readable:false}]};
    if (sql.includes('to_regclass')) return {rows:[{installed:true}]};
    throw new Error('permission denied for table feature_flags');
  }};
  await assert.rejects(() => monthlyReputationShadowEnabled(client), /permission denied/);
});

function fixture(destination = false) {
  const plan = structuredClone(transition);
  const manifest = JSON.parse(fs.readFileSync('infrastructure/cloudflare/native-hyperdrive-production.json'));
  const configs = new Map();
  for (const file of new Set(manifest.bindings.map(row => row.configPath))) {
    configs.set(file, JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/,\s*([}\]])/g, '$1')));
  }
  if (destination) {
    const target = plan.destination;
    Object.assign(target.ownerAccess,{issuerSha256:createHash('sha256').update('https://fixture.cloudflareaccess.com').digest('hex'),
      audienceSha256:createHash('sha256').update('a'.repeat(64)).digest('hex')});
    const admin = configs.get('apps/lythaus-admin-api/wrangler.jsonc');
    Object.assign(admin, {name:TARGET.worker, main:'src/control-worker.ts', assets:{binding:'ASSETS',run_worker_first:true}});
    Object.assign(admin.vars, {EXPECTED_HOSTNAMES:'control.lythaus.co',CORS_ALLOWED_ORIGINS:'https://control.lythaus.co',ACCESS_REQUIRE_SIGNED_SUBJECT:'true'});
    Object.assign(admin.vars, {ACCESS_TEAM_DOMAIN:'fixture.cloudflareaccess.com',ACCESS_AUDIENCES:'a'.repeat(64),
      ACCESS_JWKS_URL:'https://fixture.cloudflareaccess.com/cdn-cgi/access/certs',CONTROL_ACCESS_ISSUER_SHA256:target.ownerAccess.issuerSha256,CONTROL_ACCESS_AUDIENCE_SHA256:target.ownerAccess.audienceSha256});
    for (const [i, role] of Object.keys(target.connectors).entries()) target.connectors[role] = String(i + 1).repeat(32);
    Object.assign(manifest, { planetScaleDatabase:target.database, planetScaleDatabaseId:target.databaseId,
      productionBranchId:target.branchId, expectedMainOriginFingerprint:target.originSha256 });
    for (const row of manifest.bindings) {
      if (row.configPath === 'apps/lythaus-admin-api/wrangler.jsonc') row.worker = TARGET.worker;
      row.hyperdriveId = target.connectors[row.expectedRoleKey];
      configs.get(row.configPath).hyperdrive.find(binding => binding.binding === row.binding).id = row.hyperdriveId;
    }
  }
  return { manifest, configs, plan };
}

test('checks six production references on the serving and proposed maps', () => {
  for (const replacement of [false, true]) {
    const {manifest, configs, plan} = fixture(replacement);
    assert.equal(validateProductionDatabaseMap(manifest,configs,plan,replacement), replacement ? plan.destination : plan.rollback);
  }
  const {manifest, configs, plan} = fixture();
  assert.throws(() => validateProductionDatabaseMap(manifest,configs,plan,true), /pins are pending/);
  const next = fixture(true);
  assert.throws(() => validateProductionDatabaseMap(next.manifest,next.configs,next.plan,true,'lythaus-admin-api-development'), /different physical Admin/);
  assert.equal(validateProductionDatabaseMap(next.manifest,next.configs,next.plan,true,TARGET.worker),next.plan.destination);
  for (const role of Object.keys(next.plan.destination.connectors)) {
    const partial = structuredClone(next.plan);
    partial.destination.connectors[role] = null;
    assert.throws(() => validateProductionDatabaseMap(next.manifest,next.configs,partial,true), {message:'missing, shared across roles, or wrong-plane production connector for ' + role});
  }
});

test('rejects partial, wrong, ambiguous and unreviewed cutover pins', () => {
  for (const change of [
    ({manifest}) => { manifest.bindings = manifest.bindings.filter(row => !row.worker.includes('coordinator')); },
    ({manifest}) => { manifest.bindings.push(manifest.bindings[0]); },
    ({manifest,plan}) => { manifest.productionBranchId = plan.rollback.branchId; },
    ({manifest}) => { manifest.planetScaleDatabaseId = 'other'; },
    ({plan}) => { plan.destination.isolatedAdminVersions.sourceSha = 'f'.repeat(40); },
    ({plan}) => { plan.destination.isolatedAdminVersions.repairSourceSha = plan.destination.isolatedAdminVersions.sourceSha; },
    ({plan}) => { plan.destination.isolatedAdminVersions.repairSourceSha = bindingRepairState.sourceSha; },
    ...['servingVersionId','repairIntent','activationIntent','servingDeploymentId'].map(field =>
      ({plan}) => { plan.destination.isolatedAdminVersions[field] = '77777777-7777-4777-8777-777777777777'; }),
    ({manifest}) => { manifest.bindings[0].expectedRoleKey = 'lythaus_admin'; },
    ({plan}) => { plan.destination.isolatedAdminVersions.workerId = null; },
    ({plan}) => { plan.destination.isolatedAdminVersions.workerId = 'e'.repeat(32); },
    ({plan}) => { plan.destination.isolatedAdminVersions.childIntent = null; },
    ({plan}) => { plan.destination.isolatedAdminVersions.childIntent = plan.destination.isolatedAdminVersions.parentIntent; },
    ({plan}) => { plan.destination.isolatedAdminVersions.repairIntent = plan.destination.isolatedAdminVersions.childIntent; },
    ({plan}) => { plan.destination.isolatedAdminVersions.servingVersionId = plan.destination.isolatedAdminVersions.childVersionId; },
    ({plan}) => { plan.destination.isolatedAdminVersions.servingVersionId = plan.destination.isolatedAdminVersions.priorRepairVersionId; },
    ({plan}) => { plan.destination.isolatedAdminVersions.priorRepairIntent = plan.destination.isolatedAdminVersions.repairIntent; },
    ({plan}) => { plan.destination.isolatedAdminVersions.priorRepairSourceSha = plan.destination.isolatedAdminVersions.repairSourceSha; },
    ({plan}) => { plan.destination.isolatedAdminVersions.repairIntent = plan.destination.isolatedAdminVersions.priorRepairActivationIntent; },
    ({plan}) => { plan.destination.isolatedAdminVersions.servingDeploymentId = plan.destination.isolatedAdminVersions.priorRepairDeploymentId; },
    ({plan}) => { plan.destination.connectors.lythaus_jobs = plan.destination.connectors.lythaus_privacy; },
    ({plan}) => { plan.destination.connectors.lythaus_admin = plan.destination.isolatedAdminConnector; },
    ({plan}) => { plan.destination.connectors.lythaus_jobs = plan.rollback.connectors.lythaus_jobs; },
    ({manifest,configs,plan}) => { configs.get(manifest.bindings[0].configPath).hyperdrive[0].id = plan.rollback.connectors.lythaus_runtime; },
    ({configs}) => { configs.set('apps/unreviewed/wrangler.jsonc',{name:'unreviewed',hyperdrive:[{binding:'DB_APP_FRESH'}]}); },
    ({configs}) => { configs.get('apps/lythaus-jobs/wrangler.jsonc').env.other = {hyperdrive:[{binding:'DB_JOBS_FRESH'}]}; },
    ({configs}) => { configs.get('apps/lythaus-jobs/wrangler.jsonc').vars.MONTHLY_REPUTATION_MAINTENANCE_RULES = 'unexpected'; },
    ({configs}) => { configs.get('apps/lythaus-public-api/wrangler.jsonc').keep_vars = true; },
    ({configs}) => { configs.get('apps/lythaus-admin-api/wrangler.jsonc').preview_urls = true; },
    ({configs}) => { configs.get('apps/lythaus-admin-api/wrangler.jsonc').assets.run_worker_first = false; },
  ]) {
    const candidate = fixture(true);
    change(candidate);
    assert.throws(() => validateProductionDatabaseMap(candidate.manifest,candidate.configs,candidate.plan,true));
  }
});

function isolatedEvidence() {
  const {plan:{destination}} = fixture(true);
  const pins = destination.isolatedAdminVersions;
  const workerPath = '/workers/workers/' + pins.workerId;
  const scriptPath = '/workers/scripts/' + TARGET.worker;
  const app = {id:destination.ownerAccess.applicationId,type:'self_hosted',aud:'a'.repeat(64)};
  const org = {auth_domain:'fixture.cloudflareaccess.com'};
  const shell = {id:pins.workerId,name:TARGET.worker,subdomain:{enabled:false,previews_enabled:false}};
  const bindings = [{name:'DB_ADMIN_FRESH',type:'hyperdrive',id:destination.isolatedAdminConnector},
    {name:'NEW_CORE_ACCESS_ISSUER',type:'plain_text',text:'https://' + org.auth_domain},
    {name:'ACCESS_AUDIENCES',type:'plain_text',text:app.aud},
    {name:'NEW_CORE_ACCESS_AUDIENCE_SHA256',type:'plain_text',text:destination.ownerAccess.audienceSha256},
    {name:'ACCESS_SUBJECT_HMAC_KEY',type:'secret_text'}];
  const rows = [[pins.parentVersionId,pins.parentIntent,'parent',pins.sourceSha],
    [pins.childVersionId,pins.childIntent,pins.parentVersionId,pins.sourceSha],
    [pins.priorRepairVersionId,pins.priorRepairIntent,pins.childVersionId,pins.priorRepairSourceSha],
    [bindingRepairState.versionId,bindingRepairState.intentId,pins.priorRepairVersionId,bindingRepairState.sourceSha],
    [pins.servingVersionId,pins.repairIntent,bindingRepairState.versionId,pins.repairSourceSha]].map(([id,intent,parent,source],i) => ({
      id, number:i+1, bindings:structuredClone(bindings),
      annotations:{'workers/tag':source,'workers/message':`lythaus-isolated ${intent} ${parent}`},
    }));
  const deployments = {deployments:[
    {id:pins.servingDeploymentId,created_on:'2026-11-26T08:00:00Z',annotations:{'workers/message':'lythaus-isolated-repair ' + pins.activationIntent},
      versions:[{version_id:pins.servingVersionId,percentage:100}]},
    {id:bindingRepairState.deploymentId,created_on:'2026-11-25T17:00:00Z',annotations:{'workers/message':'lythaus-isolated-repair ' + bindingRepairState.activationIntent},
      versions:[{version_id:bindingRepairState.versionId,percentage:100}]},
    {id:pins.priorRepairDeploymentId,created_on:'2026-11-25T15:00:00Z',annotations:{'workers/message':'lythaus-isolated-repair ' + pins.priorRepairActivationIntent},
      versions:[{version_id:pins.priorRepairVersionId,percentage:100}]},
    {id:pins.childDeploymentId,created_on:'2026-11-25T12:19:00Z',versions:[{version_id:pins.childVersionId,percentage:100}]},
  ]};
  const current = {id:pins.servingVersionId,metadata:{annotations:{'workers/tag':pins.repairSourceSha}},resources:{bindings:structuredClone(bindings)}};
  const replies = new Map([['/access/apps/' + app.id,app],['/access/organizations',org],[workerPath,shell],
    ...rows.map(row => [workerPath + '/versions/' + row.id,row]),[scriptPath + '/deployments',deployments],
    [scriptPath + '/versions/' + pins.servingVersionId,current]]);
  const seen = [];
  const read = async path => {
    assert.ok(replies.has(path), 'unexpected provider read ' + path);
    seen.push(path);
    return replies.get(path);
  };
  return {destination,pins,app,org,shell,rows,deployments:deployments.deployments,current,replies,seen,read};
}

test('initial promotion requires five isolated versions and the wrapped binding fix serving all traffic', async () => {
  const d = isolatedEvidence();
  assert.equal(d.pins.priorRepairVersionId,'193c3dcb-9238-4adc-8eab-48707fdd8b7e');
  assert.equal(d.pins.priorRepairSourceSha,'78747f85d02c69efa8a1b6f86b73b08947cdce0b');
  assert.equal(bindingRepairState.versionId,'1ac91b08-7caa-4d31-aa7d-ad8e8bd6301f');
  assert.equal(bindingRepairState.deploymentId,'0993b439-654e-4243-9340-a810f727f142');
  assert.equal(d.pins.repairSourceSha,'fc1dce9683219edee3312cf339526b2850385aa2');
  assert.equal(d.pins.servingVersionId,'260d15e3-dd61-47db-bbf4-5dd3839141a5');
  assert.equal(d.pins.repairIntent,'f0a8c80e-b953-45ea-95f2-989d2b54baf8');
  assert.equal(d.pins.activationIntent,'217ba70a-1eac-4712-ac15-32020541d2d2');
  assert.equal(d.pins.servingDeploymentId,'9a2ebdb2-33e2-4c8c-8315-010140aeb6c0');
  await verifyIsolatedAdminBeforePromotion(d.destination,d.read);
  assert.deepEqual(d.seen.sort(),[...d.replies.keys()].sort());
  const unrelated = '77777777-7777-4777-8777-777777777777';
  for (const change of [
    e => { e.deployments.shift(); },
    e => { e.deployments[0].versions = [{version_id:e.pins.servingVersionId,percentage:95},{version_id:e.pins.childVersionId,percentage:5}]; },
    e => { e.deployments[0].versions[0].version_id = unrelated; },
    e => { e.deployments[0].id = unrelated; },
    e => { e.deployments[0].annotations['workers/message'] = 'lythaus-isolated-repair ' + unrelated; },
    e => { e.deployments[0].created_on = e.deployments[1].created_on; },
    e => { e.deployments[0].versions = [{version_id:e.pins.servingVersionId,percentage:0},{version_id:bindingRepairState.versionId,percentage:100}]; },
    e => { e.deployments[1].versions[0].version_id = e.pins.parentVersionId; },
    e => { e.deployments[1].annotations['workers/message'] = 'lythaus-isolated-repair ' + e.pins.priorRepairIntent; },
    e => { e.deployments[1].versions[0].percentage = 95; },
    e => { e.deployments[1].created_on = e.deployments[2].created_on; },
    e => { e.deployments.splice(1,1); },
    e => { e.deployments[2].id = unrelated; },
    e => { e.deployments[2].annotations['workers/message'] = 'lythaus-isolated-repair ' + e.pins.activationIntent; },
    e => { e.deployments[2].created_on = e.deployments[3].created_on; },
    e => { e.deployments[3].id = unrelated; },
    e => { e.current.id = unrelated; },
    e => { e.current.metadata.annotations['workers/tag'] = e.pins.sourceSha; },
    e => { e.current.metadata.annotations['workers/tag'] = e.pins.priorRepairSourceSha; },
    e => { e.current.annotations = {'workers/tag':e.pins.sourceSha}; },
    e => { e.current.resources.bindings[0].id = 'd'.repeat(32); },
    e => { e.current.resources.bindings.pop(); },
  ]) {
    const e = isolatedEvidence();
    change(e);
    await assert.rejects(verifyIsolatedAdminBeforePromotion(e.destination,e.read), /isolated Admin/);
  }
});

test('a missing staging or activation pin blocks promotion before provider access', async () => {
  for (const field of ['servingVersionId','repairIntent','activationIntent','servingDeploymentId']) {
    const {destination,pins} = isolatedEvidence();
    pins[field] = null;
    await assert.rejects(inspectPromotionSource({destination,fetchImpl:() => assert.fail('unexpected provider read')}),{code:'lineage_receipt_invalid'});
  }
});

test('the protected pre-promotion inspection reads the pinned metadata and reports only the verified identifiers', async () => {
  const d = isolatedEvidence();
  const listed = d.rows.map(({id,number}) => ({id,number}));
  d.replies.set('/workers/workers/' + d.pins.workerId + '/versions?per_page=100&page=1',listed);
  const account = 'https://api.cloudflare.com/client/v4/accounts/' + TARGET.account;
  const options = {destination:d.destination,token:'fixture',fetchImpl:async (url,init) => {
    assert.ok(url.startsWith(account + '/'));
    assert.equal(init.method,'GET');
    assert.equal(init.redirect,'error');
    const result = await d.read(url.slice(account.length));
    return Response.json({success:true,result,...(result === listed ?
      {result_info:{page:1,total_pages:1,count:listed.length,total_count:listed.length}} : {})});
  }};
  await assert.rejects(inspectPromotionSource({...options,expectedVersion:d.pins.childVersionId}),/version_mismatch/);
  assert.deepEqual(d.seen,[]);
  const receipt = await inspectPromotionSource({...options,expectedVersion:d.pins.servingVersionId});
  assert.deepEqual(receipt,{status:'ISOLATED_PROMOTION_SOURCE_VERIFIED',workerId:d.pins.workerId,
    versionId:d.pins.servingVersionId,deploymentId:d.pins.servingDeploymentId,sourceSha:d.pins.repairSourceSha});
  assert.deepEqual(d.seen.sort(),[...d.replies.keys()].sort());
  listed.push({id:'55555555-5555-4555-8555-555555555555',number:listed.length+1});
  const unrecognized = {code:'isolated_inventory_reconciliation_required',message:'isolated Admin version inventory requires read-only reconciliation'};
  await assert.rejects(inspectPromotionSource(options),unrecognized);
  listed.splice(0,1);
  await assert.rejects(inspectPromotionSource(options),unrecognized);
});

test('only an acknowledged owner-reviewed first full upload at this release can become an adoption receipt', async () => {
  const sha = 'f'.repeat(40), runId = '12345', owner = 211295889;
  const env = {RELEASE_SHA:sha,GITHUB_REPOSITORY:REPOSITORY,GITHUB_REPOSITORY_ID:'1010752912'};
  const receipt = {schema:'lythaus-first-full-admin-stage-v1',runId,runAttempt:1,
    operation:firstFullStage.operation,baselineRun:firstFullStage.baselineRun,sourceSha:sha,status:'REPLACEMENT_ADMIN_NON_SERVING',
    workerId:'1'.repeat(32),versionId:'55555555-5555-4555-8555-555555555555',servingVersionId:transition.destination.isolatedAdminVersions.servingVersionId,
    previousDeploymentId:transition.destination.isolatedAdminVersions.servingDeploymentId,subjectKeySourceVersionId:transition.destination.isolatedAdminVersions.servingVersionId,
    servingTrafficPercent:100,moduleSha256:'a'.repeat(64),assetsSha256:'b'.repeat(64)};
  const archive = execFileSync('python3',['-I','-c',`import io,sys,zipfile
out=io.BytesIO()
with zipfile.ZipFile(out,'w') as z: z.writestr('first-full-admin.json',sys.stdin.buffer.read())
sys.stdout.buffer.write(out.getvalue())`],{input:JSON.stringify(receipt)});
  const run = {id:Number(runId),repository:{id:1010752912},path:firstFullStage.workflow,event:'workflow_dispatch',
    head_branch:'main',head_sha:sha,status:'completed',conclusion:'success',run_attempt:1,actor:{id:owner},triggering_actor:{id:owner},
    display_title:firstFullStage.operation+' at '+sha};
  const history = {total_count:1,workflow_runs:[run]};
  const approvals = [{state:'approved',user:{id:owner},environments:[{id:18972418184}]}];
  const jobs = {total_count:1,jobs:[{name:'Stage full Admin without traffic',conclusion:'success',steps:[
    {name:'Upload the full Admin version without assigning traffic',conclusion:'success'},
    {name:'Retain the protected first full Admin upload receipt',conclusion:'success'}]}]};
  const artifacts = {total_count:1,artifacts:[{id:444,expired:false,name:'first-full-admin-'+sha,
    digest:'sha256:'+createHash('sha256').update(archive).digest('hex')}]};
  const base = '/actions/runs/'+runId;
  const routes = new Map([
    ['/actions/workflows/new-core-full-admin-stage.yml/runs?event=workflow_dispatch&branch=main&head_sha='+sha+'&per_page=100',history],
    [base,run],[base+'/approvals',approvals],[base+'/attempts/1/jobs?per_page=100',jobs],[base+'/artifacts?per_page=100',artifacts],
  ]);
  const load = (map=routes) => loadFirstFullAdminReceipt(env, async path => {
    assert.ok(map.has(path),'unexpected GitHub request');return map.get(path);
  }, async options => { assert.deepEqual(options,{artifactId:'444',runId});return archive; });
  assert.deepEqual(await load(),receipt);
  const search = [...routes.keys()][0];
  assert.equal(await load(new Map([[search,{total_count:0,workflow_runs:[]}]])),null);
  for (const [path,value] of [[search,{total_count:2,workflow_runs:[run]}],[search,{total_count:2,workflow_runs:[run,run]}],
    [base,{...run,head_sha:'b'.repeat(40)}],[base,{...run,status:'in_progress'}],[base,{...run,conclusion:'failure'}],
    [base,{...run,run_attempt:2}],[base,{...run,path:'.github/workflows/other.yml'}],[base+'/approvals',[]],
    [base+'/attempts/1/jobs?per_page=100',{total_count:0,jobs:[]}],[base+'/artifacts?per_page=100',{total_count:0,artifacts:[]}],
    [base+'/artifacts?per_page=100',{...artifacts,artifacts:[{...artifacts.artifacts[0],digest:'sha256:'+'0'.repeat(64)}]}]]) {
    await assert.rejects(load(new Map(routes).set(path,value)));
  }
});

test('the canonical full Admin upload binds the attested key without reading it', async () => {
  const d = isolatedEvidence();
  const {configs} = fixture(true);
  const config = configs.get('apps/lythaus-admin-api/wrangler.jsonc');
  const account = 'https://api.cloudflare.com/client/v4/accounts/' + TARGET.account;
  let countOverride;
  const fetchImpl = async (url,init) => {
    assert.equal(init.method,'GET');
    assert.ok(url.startsWith(account + '/'));
    const result = await d.read(url.slice(account.length));
    return Response.json({success:true,result,...(Array.isArray(result) ? {result_info:{page:1,total_pages:1,count:result.length,
      total_count:countOverride ?? result.length}} : {})});
  };
  const snapshot = (id,sha,deploymentId=d.pins.servingDeploymentId) => ({
    observedDeployment:{id:deploymentId,versions:[{version_id:id,percentage:100}]},
    deployment:{versions:[{version_id:id,percentage:100,source_sha:sha,created_on:'2026-11-25T17:00:00Z'}]}});
  const secretNames = ['DATABASE_READINESS_TOKEN','CLOUDFLARE_ACCOUNT_ID','PII_ENCRYPTION_KEY_V1','PII_HMAC_KEY_V1'];
  const args = {config,destination:d.destination,releaseSha:'f'.repeat(40),token:'fixture',fetchImpl,secretNames,
    snapshot:snapshot(d.pins.servingVersionId,d.pins.repairSourceSha)};
  const immutable = '/workers/workers/' + d.pins.workerId + '/versions';
  const list = d.rows.map(row => ({id:row.id,number:row.number,annotations:row.annotations}));
  d.replies.set(immutable + '?per_page=100&page=1',list);
  const upload = await prepareReplacementAdminUpload(args);
  const anchor = {name:'ACCESS_SUBJECT_HMAC_KEY',type:'inherit',version_id:d.pins.servingVersionId};
  assert.deepEqual(upload.config.unsafe.bindings,[anchor]);
  assert.equal(upload.config.account_id,TARGET.account);
  assert.equal(upload.config.main,'src/control-worker.ts');
  assert.equal(config.unsafe,undefined);
  assert.equal(upload.message,'lythaus-admin ' + d.pins.servingVersionId + ' ' + d.pins.servingDeploymentId);
  countOverride = 41;
  await assert.rejects(prepareReplacementAdminUpload(args),{code:'admin_version_inventory_unverified'});
  countOverride = undefined;
  list.push({id:'55555555-5555-4555-8555-555555555555',number:list.length+1});
  await assert.rejects(prepareReplacementAdminUpload(args),{code:'isolated_inventory_reconciliation_required'});
  list.pop();
  for (const overrides of [
    {secretNames:[...secretNames,anchor.name]}, {secretNames:[...secretNames,'JWT_PRIVATE_KEY']}, {secretNames:[]},
    {config:{...config,name:'other-script'}}, {config:{...config,account_id:'other-account'}},
    {config:{...config,vars:{...config.vars,[anchor.name]:'fixture'}}},
    {config:{...config,unsafe:{bindings:[{...anchor,version_id:'latest'}]}}},
    {config:{...config,unsafe:{metadata:{bindings:[]}}}}, {config:{...config,main:'src/new-core-test-worker.ts'}},
    {snapshot:snapshot(d.pins.servingVersionId,'0'.repeat(40))}, {config:{...config,vars:{...config.vars,ACCESS_AUDIENCES:'old-audience'}}},
  ]) await assert.rejects(prepareReplacementAdminUpload({...args,...overrides}));

  const id = '55555555-5555-4555-8555-555555555555';
  const path = '/workers/scripts/' + TARGET.worker;
  const bindings = [{name:'DB_ADMIN_FRESH',type:'hyperdrive',id:d.destination.connectors.lythaus_admin},
    {name:'DB_PRIVACY_FRESH',type:'hyperdrive',id:d.destination.connectors.lythaus_privacy},
    {name:'ASSETS',type:'assets'}, {name:'WORKER_VERSION',type:'version_metadata'},
    {name:'AUTH_EMAIL_ENVELOPE',type:'service',service:config.services[0].service,entrypoint:'AuthEmailEnvelope'},
    ...config.r2_buckets.map(b => ({name:b.binding,type:'r2_bucket',bucket_name:b.bucket_name})),
    ...Object.entries({EXPECTED_HOSTNAMES:'control.lythaus.co',ACCESS_REQUIRE_SIGNED_SUBJECT:'true',CORS_ALLOWED_ORIGINS:'https://control.lythaus.co',
      ACCESS_TEAM_DOMAIN:d.org.auth_domain,ACCESS_JWKS_URL:'https://' + d.org.auth_domain + '/cdn-cgi/access/certs',ACCESS_AUDIENCES:d.app.aud,
      CONTROL_ACCESS_AUDIENCE_SHA256:d.destination.ownerAccess.audienceSha256,
      CONTROL_ACCESS_ISSUER_SHA256:d.destination.ownerAccess.issuerSha256}).map(([name,text]) => ({name,text,type:'plain_text'})),
    ...[anchor.name,...secretNames].map(name => ({name,type:'secret_text'}))];
  const version = {id,metadata:{annotations:{'workers/tag':args.releaseSha,'workers/message':upload.message}},resources:{bindings}};
  d.replies.set(path + '/versions/' + id,version);
  const ack = {id,number:list.length+1,bindings:structuredClone(bindings),annotations:{...version.metadata.annotations}};
  list.push(ack);
  d.replies.set(immutable + '/' + id,ack);
  const verify = {...args,versionId:id};
  assert.deepEqual(await verifyReplacementAdminUpload(verify),{status:'REPLACEMENT_ADMIN_NON_SERVING',workerId:d.pins.workerId,
    versionId:id,sourceSha:args.releaseSha,subjectKeySourceVersionId:d.pins.servingVersionId,servingVersionId:d.pins.servingVersionId,previousDeploymentId:d.pins.servingDeploymentId});
  const fullModule = Buffer.from('export default {}');
  const fullRecord = {...await verifyReplacementAdminUpload(verify),servingTrafficPercent:100,
    moduleSha256:createHash('sha256').update(fullModule).digest('hex'),assetsSha256:'b'.repeat(64)};
  const body = {id,main_module:'control-worker.js',modules:[{name:'control-worker.js',content_type:'application/javascript+module',
    content_base64:fullModule.toString('base64')}],assets:{config:{run_worker_first:true}}};
  d.replies.set(immutable + '/' + id + '?include=modules',body);
  const adopt = record => prepareReplacementAdminUpload({...args,secretNames:['DATABASE_READINESS_TOKEN','CLOUDFLARE_ACCOUNT_ID'],
    loadFirstFullReceipt:async () => record});
  assert.deepEqual(await adopt(fullRecord),{adoptedVersionId:id});
  for (const change of [{versionId:d.pins.parentVersionId},{workerId:'1'.repeat(32)},{sourceSha:'c'.repeat(40)},
    {moduleSha256:'0'.repeat(64)},{previousDeploymentId:d.pins.childDeploymentId},{subjectKeySourceVersionId:d.pins.childVersionId}]) {
    await assert.rejects(adopt({...fullRecord,...change}));
  }
  body.modules.push({...body.modules[0],name:'unverified.js'});
  await assert.rejects(adopt(fullRecord),/module or assets/);
  body.modules.pop();
  const sourceTag = d.rows[0].annotations['workers/tag'];
  d.rows[0].annotations['workers/tag'] = args.releaseSha;
  await assert.rejects(adopt(fullRecord),{code:'immutable_version_mismatch'});
  d.rows[0].annotations['workers/tag'] = sourceTag;
  await assert.rejects(verifyReplacementAdminUpload({...verify,requireZeroTraffic:true}), /zero-traffic stage is required/);
  const sibling = {id:'66666666-6666-4666-8666-666666666666',number:ack.number+1};
  list.push(sibling);
  await assert.rejects(verifyReplacementAdminUpload(verify),{code:'isolated_inventory_reconciliation_required'});
  await assert.rejects(adopt(fullRecord),{code:'isolated_inventory_reconciliation_required'});
  list.pop();
  await assert.rejects(prepareReplacementAdminUpload(args),/read-only reconciliation/);
  for (const other of ['',...d.rows.map(row => row.id)]) {
    await assert.rejects(verifyReplacementAdminUpload({...verify,versionId:other}),/acknowledgement/);
  }
  for (const name of ['AUTH_EMAIL_ENVELOPE','PRIVATE_EXPORTS','AUDIT_ARCHIVE','ACCESS_AUDIENCES','DATABASE_READINESS_TOKEN']) {
    const bindings = ack.bindings;
    ack.bindings = bindings.filter(b => b.name !== name);
    await assert.rejects(verifyReplacementAdminUpload(verify),/bindings are unverified/);
    ack.bindings = bindings;
  }
  ack.bindings.push({name:'JWT_PRIVATE_KEY',type:'secret_text'});
  await assert.rejects(verifyReplacementAdminUpload(verify),/bindings are unverified/);
  ack.bindings.pop();
  const savedKey = ack.bindings.find(b => b.name === anchor.name);
  savedKey.type = 'inherit';
  await assert.rejects(verifyReplacementAdminUpload(verify),/inheritance/);
  savedKey.type = 'secret_text';
  version.metadata.annotations['workers/message'] = 'other';
  await assert.rejects(verifyReplacementAdminUpload(verify),/inheritance/);
  version.metadata.annotations['workers/message'] = upload.message;
  const staged = {id:'77777777-7777-4777-8777-777777777777',created_on:'2026-11-26T08:01:00Z',
    annotations:{'workers/message':'Stage reviewed Lythaus admin candidate at zero traffic'},
    versions:[{version_id:id,percentage:0},{version_id:d.pins.servingVersionId,percentage:100}]};
  d.deployments.unshift(staged);
  await assert.rejects(verifyReplacementAdminUpload(verify), /serving deployment/);
  const resume = {...verify,resumeZeroTraffic:true,snapshot:{...verify.snapshot,observedDeployment:staged}};
  assert.equal((await verifyReplacementAdminUpload(resume)).versionId,id);
  for (const resumed of [false, true]) {
    const options = resumed ? resume : verify;
    const originalSnapshot = structuredClone(options.snapshot);
    const scope = {options, versionId: id, resumed, fetchImpl,loadFirstFullReceipt:async () => {
      assert.equal(resumed,true);return fullRecord;
    }};
    if (resumed) await assert.rejects(verifyAdminZeroStage({...scope,action:'--record-admin-zero-stage',
      loadFirstFullReceipt:async () => ({...fullRecord,versionId:sibling.id})}),/differs from the reviewed/);
    const receipt = await verifyAdminZeroStage({...scope, action: '--record-admin-zero-stage'});
    assert.equal(receipt.zeroDeploymentId, staged.id);
    assert.equal(receipt.previousDeploymentId, d.pins.servingDeploymentId);
    const final = {...scope, action: '--recheck-admin-zero-stage', receipt};
    assert.deepEqual(await verifyAdminZeroStage(final), receipt);
    await assert.rejects(verifyAdminZeroStage({...final, receipt: null}), /receipt differs/);
    await assert.rejects(verifyAdminZeroStage({...final, receipt: {...receipt, sourceSha: 'a'.repeat(40)}}), /receipt differs/);
    await assert.rejects(verifyAdminZeroStage({...final, receipt: {...receipt, previousDeploymentId: sibling.id}}), /receipt changed/);
    list.push(sibling);
    await assert.rejects(verifyAdminZeroStage(final), {code: 'isolated_inventory_reconciliation_required'});
    list.pop();
    const recordedId = staged.id;
    staged.id = '99999999-9999-4999-8999-999999999999';
    await assert.rejects(verifyAdminZeroStage(final), /same-run observation/);
    staged.id = recordedId;
    assert.deepEqual(options.snapshot, originalSnapshot);
  }
  const beforeActivation = {...verify,requireZeroTraffic:true,snapshot:{...verify.snapshot,observedDeployment:{id:staged.id}}};
  assert.equal((await verifyReplacementAdminUpload(beforeActivation)).versionId,id);
  staged.id = '99999999-9999-4999-8999-999999999999';
  await assert.rejects(verifyReplacementAdminUpload(beforeActivation), /serving deployment differs/);
  staged.id = beforeActivation.snapshot.observedDeployment.id;
  list.push(sibling);
  await assert.rejects(verifyReplacementAdminUpload(resume),{code:'isolated_inventory_reconciliation_required'});
  await assert.rejects(verifyReplacementAdminUpload(beforeActivation),{code:'isolated_inventory_reconciliation_required'});
  list.pop();
  staged.versions[0].percentage = 1;
  await assert.rejects(verifyReplacementAdminUpload(resume), /zero-traffic stage/);
  await assert.rejects(verifyReplacementAdminUpload(beforeActivation), /zero-traffic stage/);
  staged.versions[0].percentage = 0;
  staged.versions[0].version_id = d.pins.childVersionId;
  await assert.rejects(verifyReplacementAdminUpload(resume), /zero-traffic stage/);
  d.deployments.shift();
  const fullDeployment = {id:staged.id,versions:[{version_id:id,percentage:100}]};
  d.replies.set(path + '/deployments',{deployments:[fullDeployment]});
  await assert.rejects(verifyReplacementAdminUpload(verify), /serving deployment/);
  const next = {...args,releaseSha:'c'.repeat(40),snapshot:snapshot(id,args.releaseSha,fullDeployment.id),secretNames:['DATABASE_READINESS_TOKEN','CLOUDFLARE_ACCOUNT_ID']};
  assert.deepEqual((await prepareReplacementAdminUpload(next)).config.unsafe.bindings,[anchor,
    ...['PII_ENCRYPTION_KEY_V1','PII_HMAC_KEY_V1'].map(name => ({name,type:'inherit',version_id:id}))]);
  const nextAnnotations = {'workers/tag':next.releaseSha,'workers/message':'lythaus-admin ' + anchor.version_id + ' ' + fullDeployment.id};
  const nextAck = {...sibling,annotations:nextAnnotations,bindings};
  d.replies.set(immutable + '/' + nextAck.id,nextAck);
  d.replies.set(path + '/versions/' + nextAck.id,{id:nextAck.id,metadata:{annotations:nextAnnotations},resources:{bindings}});
  list.push(nextAck);
  const nextVerify = {...next,versionId:nextAck.id};
  assert.equal((await verifyReplacementAdminUpload(nextVerify)).versionId,nextAck.id);
  list.push({id:'88888888-8888-4888-8888-888888888888',number:nextAck.number+1});
  await assert.rejects(verifyReplacementAdminUpload(nextVerify),{code:'admin_version_reconciliation_required'});
  nextAck.number += 2;
  await assert.rejects(verifyReplacementAdminUpload(nextVerify),{code:'admin_version_reconciliation_required'});
  list.pop();
  const originalTag = list[0].annotations['workers/tag'];
  list[0].annotations['workers/tag'] = next.releaseSha;
  await assert.rejects(verifyReplacementAdminUpload(nextVerify),{code:'admin_version_reconciliation_required'});
  list[0].annotations['workers/tag'] = originalTag;
  list.pop();
  await assert.rejects(verifyReplacementAdminUpload(nextVerify),{code:'admin_version_reconciliation_required'});
  await assert.rejects(prepareReplacementAdminUpload({...next,secretNames}),/PII bindings must be inherited/);
  list[0].annotations['workers/tag'] = next.releaseSha;
  await assert.rejects(prepareReplacementAdminUpload(next),/reconciliation/);
  version.metadata.annotations['workers/message'] = 'unverified candidate';
  await assert.rejects(prepareReplacementAdminUpload(next), /replacement Admin version/);
});

test('the full Admin stage uploads exactly one version without deployment writes and refuses a second stage', async () => {
  const d = isolatedEvidence();
  const {configs} = fixture(true);
  const script = '/workers/scripts/' + TARGET.worker;
  const immutable = '/workers/workers/' + d.pins.workerId + '/versions';
  const policyPath = '/access/apps/' + d.destination.ownerAccess.applicationId + '/policies?per_page=100&page=1';
  const owner = 'operator@example.test';
  Object.assign(d.app,{domain:TARGET.hostname});
  d.replies.set(policyPath,[{decision:'allow',precedence:1,include:[{email:{email:owner}}]},
    {decision:'deny',precedence:2,include:[{everyone:{}}]}]);
  const origin = {scheme:'postgres',host:'fixture.example.test',port:5432,database:'postgres'};
  d.destination.originSha256 = createHash('sha256').update(JSON.stringify(origin)).digest('hex');
  for (const role of ['lythaus_admin','lythaus_privacy']) {
    const id = d.destination.connectors[role];
    d.replies.set('/hyperdrive/configs/' + id,{id,origin:{...origin,user:role+'.'+d.destination.branchId},
      caching:{disabled:true},mtls:{sslmode:'verify-full',ca_certificate_id:'a'.repeat(32)}});
  }
  const versions = [...d.rows];
  d.replies.set(immutable + '?per_page=100&page=1',versions);
  d.replies.set(immutable + '/' + d.pins.servingVersionId + '?include=modules',
    {...versions.at(-1),created_on:d.deployments[0].created_on});
  const stageId = '55555555-5555-4555-8555-555555555555';
  const writes = [];
  const fetchImpl = async (url,init) => {
    const path = url.replace('https://api.cloudflare.com/client/v4/accounts/' + TARGET.account,'');
    assert.equal(init.redirect,'error');
    if (init.method === 'POST') {
      writes.push(path);
      const body = JSON.parse(init.body);
      if (path === script + '/assets-upload-session') {
        assert.deepEqual(Object.keys(body.manifest),['/index.html']);
        return Response.json({success:true,result:{jwt:'eyJ0eXAiOiJKV1QifQ.e30.test',buckets:[]}});
      }
      assert.equal(path,immutable+'?deploy=false');
      assert.deepEqual(body.bindings.filter(b => b.name === 'ACCESS_SUBJECT_HMAC_KEY'),
        [{type:'inherit',name:'ACCESS_SUBJECT_HMAC_KEY',version_id:d.pins.servingVersionId}]);
      assert.equal(body.assets.config.run_worker_first,true);
      assert.equal(body.main_module,'control-worker.js');
      const bindings = body.bindings.map(b => ['secret_text','inherit'].includes(b.type) ?
        {type:'secret_text',name:b.name} : b);
      const recorded = {id:stageId,number:versions.length+1,annotations:body.annotations,bindings};
      versions.push(recorded);
      d.replies.set(immutable + '/' + stageId,recorded);
      d.replies.set(script + '/versions/' + stageId,{id:stageId,metadata:{annotations:body.annotations},resources:{bindings}});
      d.replies.set(immutable + '/' + stageId + '?include=modules',{
        ...recorded,main_module:body.main_module,modules:body.modules,assets:{config:body.assets.config},
      });
      return Response.json({success:true,result:{id:stageId}},{status:201});
    }
    assert.equal(init.method,'GET');
    const result = await d.read(path);
    return Response.json({success:true,result,...(Array.isArray(result) ? {
      result_info:{page:1,per_page:100,total_pages:1,count:result.length,total_count:result.length},
    } : {})});
  };
  const journal = [];
  const args = {
    config:configs.get('apps/lythaus-admin-api/wrangler.jsonc'),destination:d.destination,fetchImpl,
    token:'fixture',expectedOwner:owner,releaseSha:'f'.repeat(40),runId:'123',
    module:Buffer.from('export default {}'),assets:new Map([['index.html',Buffer.from('<html></html>')],
      ['_headers',Buffer.from('/*\n  X-Content-Type-Options: nosniff')],['_redirects',Buffer.from('/* /index.html 200')]]),
    secrets:{CLOUDFLARE_ACCOUNT_ID:TARGET.account,DATABASE_READINESS_TOKEN:'fixture',
      PII_ENCRYPTION_KEY_V1:'fixture',PII_HMAC_KEY_V1:'fixture'},
    journal:(status,evidence) => journal.push({status,evidence}),
  };
  await assert.rejects(stageFullAdminVersion({...args,expectedOwner:'other@example.test'}),/owner_access_unverified/);
  assert.deepEqual(writes,[]);
  const receipt = await stageFullAdminVersion(args);
  assert.equal(receipt.versionId,stageId);
  assert.equal(receipt.servingVersionId,d.pins.servingVersionId);
  assert.equal(receipt.servingTrafficPercent,100);
  assert.equal(receipt.subjectKeySourceVersionId,d.pins.servingVersionId);
  assert.equal(journal.at(-2).status,'full_admin_upload_intent');
  assert.deepEqual(journal.at(-1),{status:'full_admin_provider_acknowledged',
    evidence:{operation:'stage_version',id:stageId}});
  assert.deepEqual(writes,[script+'/assets-upload-session',immutable+'?deploy=false']);
  await assert.rejects(stageFullAdminVersion(args),{code:'isolated_inventory_reconciliation_required'});
  assert.equal(writes.length,2);
});

test('full Admin staging requires the exact owner, protected main and an approved first attempt', async () => {
  const sha = 'a'.repeat(40);
  const id = 123;
  const owner = PINS.ownerId;
  const actor = REPOSITORY.split('/')[0];
  const env = {GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REPOSITORY:REPOSITORY,
    GITHUB_REPOSITORY_ID:'1010752912',GITHUB_REF:'refs/heads/main',GITHUB_REF_PROTECTED:'true',GITHUB_RUN_ATTEMPT:'1',
    GITHUB_ACTOR_ID:String(owner),GITHUB_ACTOR:actor,GITHUB_TRIGGERING_ACTOR:actor,GITHUB_RUN_ID:String(id),
    GITHUB_SHA:sha,REQUESTED_CONTROL_SHA:sha,CONFIRM_STAGE_ONLY:'true'};
  const runPath = '/actions/runs/' + id;
  const calls = new Map([[runPath,{id,repository:{id:1010752912},path:firstFullStage.workflow,event:'workflow_dispatch',
    head_branch:'main',head_sha:sha,run_attempt:1,status:'in_progress',actor:{id:owner},triggering_actor:{id:owner},
    display_title:firstFullStage.operation+' at '+sha}],
  ['/branches/main',{protected:true,commit:{sha}}],
  ['/environments/production',{id:18972418184,name:'production',protection_rules:[
    {type:'required_reviewers',prevent_self_review:false,reviewers:[{type:'User',reviewer:{id:owner}}]},
    {type:'branch_policy'}],deployment_branch_policy:{protected_branches:false,custom_branch_policies:true}}],
  ['/environments/production/deployment-branch-policies?per_page=100',
    {total_count:1,branch_policies:[{name:'main',type:'branch'}]}],
  [runPath+'/approvals',[{state:'approved',user:{id:owner},environments:[{id:18972418184}]}]]]);
  await verifyStageGate(env,async path => calls.get(path));
  await assert.rejects(verifyStageGate({...env,GITHUB_RUN_ATTEMPT:'2'},async () => assert.fail('unexpected API call')),
    /protected_context_required/);
  await assert.rejects(verifyStageGate(env,async path => path==='/branches/main' ? {protected:true,commit:{sha:'b'.repeat(40)}} : calls.get(path)),
    /protected_run_required/);
  await assert.rejects(verifyStageGate(env,async path => path.endsWith('/approvals') ? [] : calls.get(path)),/owner_approval_missing/);
});

test('historical verification rechecks each source, parent, intent, redacted key and database on the same Worker', async () => {
  const d = isolatedEvidence();
  d.deployments.unshift({id:'77777777-7777-4777-8777-777777777777',versions:[{version_id:'88888888-8888-4888-8888-888888888888',percentage:100}]});
  await verifyIsolatedAdminVersions(d.destination,d.read);
  assert.deepEqual(d.seen.sort(),[...d.replies.keys()].filter(path => !path.startsWith('/workers/scripts/')).sort());
  for (const i of d.rows.keys()) {
    for (const change of [
      row => { row.id = '77777777-7777-4777-8777-777777777777'; },
      row => { row.annotations['workers/tag'] = 'f'.repeat(40); },
      row => { row.annotations['workers/message'] = 'lythaus-isolated ' + d.pins.activationIntent + ' ' + (i === 0 ? 'parent' : d.rows[i-1].id); },
      row => { row.bindings.at(-1).type = 'plain_text'; },
      row => { row.bindings.at(-1).text = 'synthetic'; },
      row => { row.bindings[0].id = 'c'.repeat(32); },
    ]) {
      const e = isolatedEvidence();
      change(e.rows[i]);
      await assert.rejects(verifyIsolatedAdminVersions(e.destination,e.read), /isolated Admin/);
    }
  }
  for (const change of [
    e => { e.shell.id = 'd'.repeat(32); }, e => { e.shell.name = 'unrelated-worker'; },
    e => { e.app.aud = 'b'.repeat(64); }, e => { e.org.auth_domain = 'other.cloudflareaccess.com'; },
    e => { e.rows[2].annotations['workers/message'] = `lythaus-isolated ${e.pins.repairIntent} ${e.pins.parentVersionId}`; },
    e => { e.rows[2].number = e.rows[1].number; },
    e => { e.rows[3].annotations['workers/message'] = 'lythaus-isolated ' + e.pins.repairIntent + ' ' + e.pins.childVersionId; },
    e => { e.rows[3].number = e.rows[2].number; },
    e => { e.rows[4].annotations['workers/message'] = 'lythaus-isolated ' + e.pins.repairIntent + ' ' + e.pins.priorRepairVersionId; },
    e => { e.rows[4].number = e.rows[3].number; },
    e => { e.rows[2].bindings.find(b => b.name === 'ACCESS_AUDIENCES').text = 'b'.repeat(64); },
    e => { e.rows[2].bindings.push({name:'DB_OTHER',type:'hyperdrive',id:'b'.repeat(32)}); },
  ]) {
    const e = isolatedEvidence();
    change(e);
    await assert.rejects(verifyIsolatedAdminVersions(e.destination,e.read), /isolated (Admin|owner Access)/);
  }
});

test('control routing inventory covers wildcard and path claims and redacts private selectors', async () => {
  const id = n => n.toString(16).padStart(32,'0');
  const wildcard = '*.lythaus.co';
  assert.equal(coversHost('https://' + wildcard + '/flags','control.lythaus.co'),true);
  assert.equal(coversHost('control.lythaus.co.invalid','control.lythaus.co'),false);
  const fetchImpl = async (url, opts) => {
    assert.equal(opts.method,'GET');
    assert.equal(opts.redirect,'error');
    const u = new URL(url);
    assert.equal(u.origin,'https://api.cloudflare.com');
    assert.match(u.pathname, /^\/client\/v4\/(?:accounts\/e5b7ae46e04698f507b7e4b3d4ef1af0|zones\/7bc572c8b7cd3c00be9c655176c29382)\//);
    let rows;
    if (u.pathname.endsWith('/dns_records')) rows=[{id:id(1),type:'CNAME',name:wildcard,content:'sensitive-fixture',proxied:true}];
    else if (u.pathname.endsWith('/domains')) rows=[];
    else if (u.pathname.endsWith('/routes')) rows=[{id:id(2),pattern:wildcard+'/sensitive-fixture',script:'lythaus-control-test'}];
    else if (u.pathname.endsWith('/projects')) rows=[{id:id(3),name:'lythaus-control-panel',domains:['admin.lythaus.co'],canonical_deployment:{id:id(4)}}];
    else if (u.pathname.endsWith('/apps')) rows=[{id:id(5),type:'self_hosted',destinations:[{type:'public',uri:'control.lythaus.co/flags'}]}];
    else if (u.pathname.endsWith('/policies')) rows=[{id:id(6),decision:'allow',include:[{email:'sensitive-fixture'}]}];
    else if (u.pathname.endsWith('/pagerules')) rows=[{id:id(7),status:'active',targets:[{target:'url',constraint:{value:wildcard+'/*'}}],actions:[{id:'forwarding_url'}]}];
    else if (u.pathname.endsWith('/subdomain')) return Response.json({success:true,result:{enabled:false,previews_enabled:false}});
    else if (u.pathname.includes('http_request_dynamic_redirect')) return Response.json({success:true,result:{rules:[{expression:'sensitive-fixture'}]}});
    else if (u.pathname.includes('http_request_redirect')) return new Response(null,{status:403});
    else assert.fail('unexpected host inspection endpoint');
    return Response.json({success:true,result:rows,...(u.searchParams.has('page')?{result_info:{page:1,count:rows.length,total_count:rows.length}}:{})});
  };
  const report = await inspectControlRouting({token:'fixture',fetchImpl});
  const [control,admin] = report.claims;
  assert.equal(control.dns[0].wildcard,true);
  assert.equal(control.routes[0].path,'other');
  assert.equal(control.access[0].decisions.allow,1);
  assert.deepEqual(control.access[0].paths,['/flags']);
  assert.equal(control.defaults[0].previews,false);
  assert.equal(control.pageRules[0].forwarding,true);
  assert.equal(admin.pages[0].deploymentId,id(4));
  assert.ok(report.incomplete.some(v=>v.label==='bulk' && v.status===403));
  assert.ok(report.incomplete.some(v=>v.label==='single' && v.status==='review_active_redirect_destinations'));
  assert.ok(!JSON.stringify(report).includes('sensitive-fixture'));
  const empty = await inspectControlRouting({token:'fixture',fetchImpl:async()=>Response.json({success:true,result:[]})});
  assert.ok(empty.incomplete.some(v=>v.label==='dns' && v.status==='pagination_unverified'));
  assert.equal(empty.routingDecision,'REHEARSAL_ONLY');
});

test('replacement serves checked assets and the ordinary Admin handler behind exact signed Access', async () => {
  const hostname = 'control.lythaus.co', origin = 'https://' + hostname, aud = 'a'.repeat(64);
  const ui = [], api = [];
  const env = {EXPECTED_HOSTNAMES:hostname,CORS_ALLOWED_ORIGINS:origin,ACCESS_TEAM_DOMAIN:'fixture.cloudflareaccess.com',
    ACCESS_JWKS_URL:'https://fixture.cloudflareaccess.com/cdn-cgi/access/certs',ACCESS_AUDIENCES:aud,
    CONTROL_ACCESS_ISSUER_SHA256:createHash('sha256').update('https://fixture.cloudflareaccess.com').digest('hex'),
    CONTROL_ACCESS_AUDIENCE_SHA256:createHash('sha256').update(aud).digest('hex'),ACCESS_REQUIRE_SIGNED_SUBJECT:'true',
    WORKER_VERSION:{tag:'a'.repeat(40),id:'11111111-1111-4111-8111-111111111111'},
    ASSETS:{fetch:async req=>{ui.push(req.url);return new Response('fixture UI');}}};
  const worker = createControlWorker(async req => {if (!req.headers.has('x-fixture-auth')) throw new Error();return 'fixture';},
    async req=>{api.push(req.url);return Response.json({items:[]});});
  const signed = path=>new Request(origin+path,{headers:{'x-fixture-auth':'fixture'}});
  const flags = await worker.fetch(signed('/flags'),env);
  assert.equal(flags.headers.get('x-lythaus-worker-version'),env.WORKER_VERSION.id);
  assert.equal(flags.headers.get('cache-control'),'private, no-store');
  const cases = await worker.fetch(signed('/api/admin/moderation/cases'),env);
  assert.deepEqual(await cases.json(),{items:[]});
  for (const path of ['/api/admin/recovery/subject-rebind','/api/admin/bootstrap/first-administrator','/api/admin/production-auth-acceptance/email','/api/waitlist','/invite/example','/verify-email','/reset-password']) {
    assert.equal((await worker.fetch(signed(path),env)).status,404);
  }
  for (const path of ['/flags','/api/admin/moderation/cases']) {
    assert.equal((await worker.fetch(new Request(origin+path),env)).status,401);
    assert.equal((await worker.fetch(signed(path),{...env,CONTROL_ACCESS_AUDIENCE_SHA256:'b'.repeat(64)})).status,503);
    assert.equal((await worker.fetch(signed(path),{...env,CONTROL_ACCESS_ISSUER_SHA256:'b'.repeat(64)})).status,503);
    assert.equal((await worker.fetch(new Request('https://admin.lythaus.co'+path),env)).status,404);
  }
  assert.deepEqual(ui,[origin+'/flags']);
  assert.deepEqual(api,[origin+'/api/admin/moderation/cases']);
  const req = new Request(origin+'/flags',{headers:{'cf-access-jwt-assertion':'fixture'}});
  for (const configuration of [env, {...env, ACCESS_REQUIRE_SIGNED_SUBJECT: undefined}]) {
    for (const sub of [undefined, '', ' ']) {
      await assert.rejects(verifiedAccessSubject(req, configuration, async () => ({
        sub, email: 'fixture@example.invalid',
      })), /access_subject_missing/);
    }
    assert.equal(await verifiedAccessSubject(req, configuration, async () => ({
      sub: 'signed-subject', email: 'fixture@example.invalid',
    })), 'signed-subject');
  }
  assert.equal((await createControlWorker().fetch(new Request(origin+'/flags'),env)).status,401);
});

test('both rollback workflows require the prior serving versions to use verified new-core connections', async () => {
  const {manifest,plan} = fixture(true);
  const origin = {scheme:'postgres',host:'fixture.psdb.cloud',port:5432,database:'postgres'};
  plan.destination.originSha256 = createHash('sha256').update(JSON.stringify(origin)).digest('hex');
  const id='aaaaaaaa-1111-4111-8111-111111111111';
  const snapshot = () => ({deployment:{versions:[{version_id:id,percentage:100,source_sha:'a'.repeat(40),created_on:'2026-11-18T00:00:00Z'}]}});
  for (const scenario of ['valid','old','wrongRole','tls']) {
    const fetchImpl = async (url,options) => {
      assert.equal(options.method,'GET');
      const path = new URL(url).pathname.split('/');
      if (path.at(-2)==='versions') {
        const rows = manifest.bindings.filter(row=>row.worker===path.at(-3));
        return Response.json({success:true,result:{id,resources:{bindings:rows.map(row=>({type:'hyperdrive',name:row.binding,
          id:scenario==='old' && row.worker.includes('coordinator') ? plan.rollback.connectors.lythaus_admin : row.hyperdriveId}))}}});
      }
      const row=manifest.bindings.find(entry=>entry.hyperdriveId===path.at(-1));
      assert.ok(row);
      const role=scenario==='wrongRole' ? 'lythaus_migrations' : row.expectedRoleKey;
      return Response.json({success:true,result:{id:row.hyperdriveId,origin:{...origin,user:role+'.'+plan.destination.branchId},
        caching:{disabled:true},mtls:{sslmode:scenario==='tls'?'require':'verify-full',ca_certificate_id:'fixture'}}});
    };
    const exercise=()=>verifyRollbackPlane({manifest,destination:plan.destination,token:'fixture',snapshot,fetchImpl});
    if (scenario==='valid') await exercise();
    else await assert.rejects(exercise,/rollback/);
  }
  for (const workflow of ['native-workers-deploy','production-release']) {
    assert.match(fs.readFileSync('.github/workflows/'+workflow+'.yml','utf8'),/if ! node scripts\/ci\/verify-cloudflare-hyperdrive-targets\.mjs --rollback-database/);
  }
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
