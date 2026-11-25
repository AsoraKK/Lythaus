import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { transition, validateProductionDatabaseMap, verifyIsolatedAdminVersions, verifyRollbackPlane } from '../ci/production-database-cutover.mjs';
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
    Object.assign(target.ownerAccess,{applicationId:'33333333-3333-4333-8333-333333333333',
      issuerSha256:createHash('sha256').update('https://fixture.cloudflareaccess.com').digest('hex'),
      audienceSha256:createHash('sha256').update('a'.repeat(64)).digest('hex')});
    Object.assign(target.isolatedAdminVersions,{workerId:'d'.repeat(32),parentVersionId:'11111111-1111-4111-8111-111111111111',
      servingVersionId:'22222222-2222-4222-8222-222222222222',
      parentIntent:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',childIntent:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'});
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
});

test('rejects partial, wrong, ambiguous and unreviewed cutover pins', () => {
  for (const change of [
    ({manifest}) => { manifest.bindings = manifest.bindings.filter(row => !row.worker.includes('coordinator')); },
    ({manifest}) => { manifest.bindings.push(manifest.bindings[0]); },
    ({manifest,plan}) => { manifest.productionBranchId = plan.rollback.branchId; },
    ({manifest}) => { manifest.planetScaleDatabaseId = 'other'; },
    ({manifest}) => { manifest.bindings[0].expectedRoleKey = 'lythaus_admin'; },
    ({plan}) => { plan.destination.connectors.lythaus_runtime = null; },
    ({plan}) => { plan.destination.isolatedAdminVersions.workerId = null; },
    ({plan}) => { plan.destination.isolatedAdminVersions.childIntent = null; },
    ({plan}) => { plan.destination.isolatedAdminVersions.childIntent = plan.destination.isolatedAdminVersions.parentIntent; },
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

test('replacement reads the immutable Worker and both previously staged versions', async () => {
  const {plan:{destination}} = fixture(true);
  const pins = destination.isolatedAdminVersions;
  for (const fault of ['none','wrong_service','wrong_source','extra_db','missing_key','swapped_version','wrong_parent',
    'wrong_intent','unmarked_parent','new_access_app','issuer_drift','isolated_audience_drift']) {
    const seen = [];
    const check = () => verifyIsolatedAdminVersions(destination,async path=>{
      seen.push(path);
      if (path === '/access/apps/' + destination.ownerAccess.applicationId) return {
        id:destination.ownerAccess.applicationId,type:'self_hosted',aud:(fault==='new_access_app'?'b':'a').repeat(64)};
      if (path === '/access/organizations') return {auth_domain:fault==='issuer_drift'?'other.cloudflareaccess.com':'fixture.cloudflareaccess.com'};
      const worker = '/workers/workers/' + pins.workerId;
      if (path === worker) return {id:pins.workerId,name:fault==='wrong_service'?'other':TARGET.worker,subdomain:{enabled:false,previews_enabled:false}};
      const id = path.split('/').at(-1);
      const bindings = [{name:'DB_ADMIN_FRESH',type:'hyperdrive',id:destination.isolatedAdminConnector}];
      bindings.push({name:'NEW_CORE_ACCESS_ISSUER',type:'plain_text',text:'https://fixture.cloudflareaccess.com'},
        {name:'ACCESS_AUDIENCES',type:'plain_text',text:(fault==='isolated_audience_drift'?'b':'a').repeat(64)},
        {name:'NEW_CORE_ACCESS_AUDIENCE_SHA256',type:'plain_text',text:destination.ownerAccess.audienceSha256});
      if (fault !== 'missing_key') bindings.push({name:'ACCESS_SUBJECT_HMAC_KEY',type:'secret_text'});
      if (fault === 'extra_db') bindings.push({name:'DB_OTHER',type:'hyperdrive',id:'0'.repeat(32)});
      const isParent = id === pins.parentVersionId;
      const number = isParent ? 7 : fault === 'swapped_version' ? 6 : 12;
      const intent = isParent || fault === 'wrong_intent' ? pins.parentIntent : pins.childIntent;
      const parent = isParent || fault === 'wrong_parent' ? 'parent' : pins.parentVersionId;
      const annotations = {'workers/tag':fault==='wrong_source'?'other':pins.sourceSha};
      if (!isParent || fault !== 'unmarked_parent') annotations['workers/message'] = `lythaus-isolated ${intent} ${parent}`;
      return {id,number,annotations,bindings};
    });
    if (fault === 'none') { await check(); assert.equal(seen.length,5); }
    else await assert.rejects(check,/isolated (Admin|owner Access)/);
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
