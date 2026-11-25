import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { inspectPromotionSource, transition, validateProductionDatabaseMap, verifyIsolatedAdminBeforePromotion, verifyIsolatedAdminVersions, verifyRollbackPlane } from '../ci/production-database-cutover.mjs';
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
    Object.assign(target.isolatedAdminVersions, {
      servingVersionId:'40000000-0000-4000-8000-000000000001', repairIntent:'40000000-0000-4000-8000-000000000002',
      activationIntent:'40000000-0000-4000-8000-000000000003', servingDeploymentId:'40000000-0000-4000-8000-000000000004',
    });
    Object.assign(target.ownerAccess,{issuerSha256:createHash('sha256').update('https://fixture.cloudflareaccess.com').digest('hex'),
      audienceSha256:createHash('sha256').update('a'.repeat(64)).digest('hex')});
    const admin = configs.get('apps/lythaus-admin-api/wrangler.jsonc');
    Object.assign(admin, {name:TARGET.worker, main:'src/control-worker.ts', assets:{binding:'ASSETS',run_worker_first:true}});
    Object.assign(admin.vars, {EXPECTED_HOSTNAMES:'control.lythaus.co',CORS_ALLOWED_ORIGINS:'https://control.lythaus.co',ACCESS_REQUIRE_SIGNED_SUBJECT:'true'});
    Object.assign(admin.vars, {CONTROL_ACCESS_ISSUER_SHA256:target.ownerAccess.issuerSha256,CONTROL_ACCESS_AUDIENCE_SHA256:target.ownerAccess.audienceSha256});
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
    [pins.servingVersionId,pins.repairIntent,pins.priorRepairVersionId,pins.repairSourceSha]].map(([id,intent,parent,source],i) => ({
      id, number:i+1, bindings:structuredClone(bindings),
      annotations:{'workers/tag':source,'workers/message':`lythaus-isolated ${intent} ${parent}`},
    }));
  const deployments = {deployments:[
    {id:pins.servingDeploymentId,created_on:'2026-11-25T17:00:00Z',annotations:{'workers/message':'lythaus-isolated-repair ' + pins.activationIntent},
      versions:[{version_id:pins.servingVersionId,percentage:100}]},
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

test('initial promotion requires all four isolated versions and the binding fix serving all traffic', async () => {
  const d = isolatedEvidence();
  assert.equal(d.pins.priorRepairVersionId,'193c3dcb-9238-4adc-8eab-48707fdd8b7e');
  assert.equal(d.pins.priorRepairSourceSha,'78747f85d02c69efa8a1b6f86b73b08947cdce0b');
  assert.equal(d.pins.repairSourceSha,'78958d886d72eecc6ea01001d808f1d8c505046d');
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
    e => { e.deployments[1].versions[0].version_id = e.pins.parentVersionId; },
    e => { e.deployments[1].annotations['workers/message'] = 'lythaus-isolated-repair ' + e.pins.priorRepairIntent; },
    e => { e.deployments[1].versions[0].percentage = 95; },
    e => { e.deployments[1].created_on = e.deployments[2].created_on; },
    e => { e.deployments.splice(1,1); },
    e => { e.deployments[2].id = unrelated; },
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
  const account = 'https://api.cloudflare.com/client/v4/accounts/' + TARGET.account;
  const options = {destination:d.destination,token:'fixture',fetchImpl:async (url,init) => {
    assert.ok(url.startsWith(account + '/'));
    assert.equal(init.method,'GET');
    assert.equal(init.redirect,'error');
    return Response.json({success:true,result:await d.read(url.slice(account.length))});
  }};
  await assert.rejects(inspectPromotionSource({...options,expectedVersion:d.pins.childVersionId}),/version_mismatch/);
  assert.deepEqual(d.seen,[]);
  const receipt = await inspectPromotionSource({...options,expectedVersion:d.pins.servingVersionId});
  assert.deepEqual(receipt,{status:'ISOLATED_PROMOTION_SOURCE_VERIFIED',workerId:d.pins.workerId,
    versionId:d.pins.servingVersionId,deploymentId:d.pins.servingDeploymentId,sourceSha:d.pins.repairSourceSha});
  assert.deepEqual(d.seen.sort(),[...d.replies.keys()].sort());
});

test('historical verification rechecks each source, parent, intent, redacted key and database on the same Worker', async () => {
  const d = isolatedEvidence();
  d.deployments.unshift({id:'77777777-7777-4777-8777-777777777777',versions:[{version_id:'88888888-8888-4888-8888-888888888888',percentage:100}]});
  await verifyIsolatedAdminVersions(d.destination,d.read);
  assert.deepEqual(d.seen.sort(),[...d.replies.keys()].filter(path => !path.startsWith('/workers/scripts/')).sort());
  for (const i of [0,1,2,3]) {
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
