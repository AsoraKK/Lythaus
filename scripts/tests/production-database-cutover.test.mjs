import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { transition, validateProductionDatabaseMap, verifyRollbackPlane } from '../ci/production-database-cutover.mjs';
import { inspectProductionConnectors, TARGET } from '../ci/lythaus-new-core-isolation-review.mjs';
import { monthlyReputationShadowEnabled } from '../../packages/db/src/monthly-reputation.ts';

test('the optional monthly Jobs path reads no flag on a clean schema', async () => {
  const queries = [];
  const client = {query:async sql => {
    queries.push(sql);
    assert.match(sql, /to_regclass\('trust\.monthly_reputation_sources'\)/);
    return {rows:[{installed:false}]};
  }};
  assert.equal(await monthlyReputationShadowEnabled(client),false);
  assert.equal(queries.length,1);
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
    for (const [i, role] of Object.keys(target.connectors).entries()) target.connectors[role] = String(i + 1).repeat(32);
    Object.assign(manifest, { planetScaleDatabase:target.database, planetScaleDatabaseId:target.databaseId,
      productionBranchId:target.branchId, expectedMainOriginFingerprint:target.originSha256 });
    for (const row of manifest.bindings) {
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
});

test('rejects partial, wrong, ambiguous and unreviewed cutover pins', () => {
  for (const change of [
    ({manifest}) => { manifest.bindings = manifest.bindings.filter(row => !row.worker.includes('coordinator')); },
    ({manifest}) => { manifest.bindings.push(manifest.bindings[0]); },
    ({manifest,plan}) => { manifest.productionBranchId = plan.rollback.branchId; },
    ({manifest}) => { manifest.planetScaleDatabaseId = 'other'; },
    ({manifest}) => { manifest.bindings[0].expectedRoleKey = 'lythaus_admin'; },
    ({plan}) => { plan.destination.connectors.lythaus_runtime = null; },
    ({plan}) => { plan.destination.connectors.lythaus_jobs = plan.destination.connectors.lythaus_privacy; },
    ({plan}) => { plan.destination.connectors.lythaus_admin = plan.destination.isolatedAdminConnector; },
    ({plan}) => { plan.destination.connectors.lythaus_jobs = plan.rollback.connectors.lythaus_jobs; },
    ({manifest,configs,plan}) => { configs.get(manifest.bindings[0].configPath).hyperdrive[0].id = plan.rollback.connectors.lythaus_runtime; },
    ({configs}) => { configs.set('apps/unreviewed/wrangler.jsonc',{name:'unreviewed',hyperdrive:[{binding:'DB_APP_FRESH'}]}); },
    ({configs}) => { configs.get('apps/lythaus-jobs/wrangler.jsonc').env.other = {hyperdrive:[{binding:'DB_JOBS_FRESH'}]}; },
    ({configs}) => { configs.get('apps/lythaus-jobs/wrangler.jsonc').vars.MONTHLY_REPUTATION_MAINTENANCE_RULES = 'unexpected'; },
    ({configs}) => { configs.get('apps/lythaus-public-api/wrangler.jsonc').keep_vars = true; },
  ]) {
    const candidate = fixture(true);
    change(candidate);
    assert.throws(() => validateProductionDatabaseMap(candidate.manifest,candidate.configs,candidate.plan,true));
  }
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
