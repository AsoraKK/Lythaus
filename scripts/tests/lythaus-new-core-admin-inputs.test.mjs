import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import tls from 'node:tls';
import { collectAdminInputs, verifiedOriginIssuers } from '../ci/lythaus-new-core-admin-inputs.mjs';
import { TARGET } from '../ci/lythaus-new-core-isolation-review.mjs';
import { branchQualifiedDatabaseTarget } from '../ci/planetscale-0021-target-identity.mjs';

const now = Date.parse('2026-11-17T12:00:00Z');
const issuer = new X509Certificate(tls.rootCertificates[0]);
const makeUrl = role => `postgresql://${role}.${TARGET.branch}:fixture-only@origin.invalid/postgres?sslmode=verify-full`;
const id = 'a'.repeat(32);
const user = { id:'fixture-user', email:'owner@example.invalid', access_seat:true, gateway_seat:false };
const subscription = { rate_plan:{public_name:'Workers Paid'}, state:'Paid',
  current_period_start:'2026-11-01', current_period_end:'2026-12-01' };
const usage = ['requests','milliseconds'].map(unit => ({ ServiceName:'Workers', BillingAccountId:TARGET.account,
  ConsumedUnit:unit, ConsumedQuantity:5, BillingPeriodStart:'2026-11-01', ChargePeriodEnd:'2026-11-17' }));
const ca = { id, ca:true, certificates:issuer.toString() };

function fixture({ providers={}, rowOverride={}, connectorError, changedGrant=false, clean=true }={}) {
  const queries = [], reads = [], clients = [], delivered = [];
  const env = { LYTHAUS_NEW_CORE_ADMIN_DATABASE_URL:makeUrl('lythaus_admin'), LYTHAUS_NEW_CORE_VERIFIER_DATABASE_URL:makeUrl('lythaus_verifier'),
    LYTHAUS_NEW_CORE_OWNER_EMAIL:user.email, CLOUDFLARE_API_TOKEN:'fixture-binding' };
  const data = { subscriptions:[subscription], 'billable-usage':usage, 'access/users?per_page=100&page=1':[user],
    entitlements:[], mtls_certificates:[ca], ...providers };
  const run = options => collectAdminInputs({env, now,
    parseTarget(raw) { return {...branchQualifiedDatabaseTarget(raw),originFingerprint:TARGET.origin}; },
    readIssuers(_stream,host) { assert.equal(host,'origin.invalid'); return [issuer]; },
    createClient(config) {
      assert.equal(config.ssl.rejectUnauthorized,true);
      assert.match(config.options,/default_transaction_read_only=on/);
      const isAdmin = branchQualifiedDatabaseTarget(config.connectionString).role === 'lythaus_admin';
      const client = { connection:{stream:{}}, ended:false, async end() { this.ended = true; },
        async connect() { if (isAdmin && connectorError) throw Object.assign(new Error(env.CLOUDFLARE_API_TOKEN), {code:connectorError}); },
        async query(sql) {
          queries.push(sql);
          assert.match(sql,/^SELECT /);
          return { rows:[sql.includes('FROM pg_roles r') ? {session_matches:true, read_only:true, restricted_role:true,
            ddl_denied:true, direct_inserts_denied:true, bootstrap_execute:isAdmin, verifier_execute:!isAdmin,
            ...(isAdmin ? rowOverride : {})} : {clean}] };
        } };
      clients.push(client);
      return client;
    },
    fingerprintReaders:{
      schemaDefinitionFingerprint:async () => ({sha256:'69769fb59964a84355d5cc24e8f6c1a23595076a3d1d5f39e45add3e58dff90e'}),
      schemaGrantFingerprint:async () => ({sha256:changedGrant ? 'changed' : '65ae6c5e98cacafdd1de5fd58703bd5358a65b9f73781881ee35383debbb4513'}),
    },
    fetchImpl:async (url,init) => {
      const base = `https://api.cloudflare.com/client/v4/accounts/${TARGET.account}/`;
      assert.ok(url.startsWith(base));
      const route = url.slice(base.length);
      assert.equal(init.method,'GET'); assert.equal(init.redirect,'error'); assert.equal(init.cache,'no-store');
      assert.equal(init.headers.authorization,`Bearer ${env.CLOUDFLARE_API_TOKEN}`);
      assert.ok(!url.includes('@')); assert.ok(Object.hasOwn(data,route));
      reads.push(route);
      return data[route] instanceof Response ? new Response(await data[route].clone().text(),{status:data[route].status})
        : Response.json({success:true, result:data[route]});
    },
    privateCredentialConfirmed:true, onVerifiedCa:value => delivered.push(value), ...options });
  return {env,run,reads,queries,clients,delivered};
}

test('private inputs verified by role, TLS, immutable receipt and current account GETs',async () => {
  const f=fixture(), report=await f.run();
  assert.deepEqual(report.errors,[]);
  assert.equal(report.ready,true);
  assert.equal(report.verifier.receiptFingerprintsMatch,true);
  assert.equal(report.verifier.bootstrapClean,true);
  assert.equal(report.cloudflare.matchingUploadedCa,true);
  assert.equal(report.cloudflare.ownerAttestationUsed,false);
  const sha256=issuer.fingerprint256.replaceAll(':','').toLowerCase();
  assert.deepEqual(f.delivered,[{id,pem:issuer.toString(),sha256,caFingerprints:[sha256]}]);
  assert.ok(f.clients.every(c => c.ended));
  assert.ok(f.queries.every(sql => !/FROM identity\.bootstrap_first_administrator/i.test(sql)));
  const json=JSON.stringify(report);
  for (const privateValue of [...Object.values(f.env),id,issuer.toString(),'fixture-only']) assert.ok(!json.includes(privateValue));
});

test('inaccessible, invalid, wrong target, wrong role and rejected login are distinct',async () => {
  const unconfirmed=fixture();
  const readOnly=await unconfirmed.run({privateCredentialConfirmed:false});
  assert.equal(readOnly.admin.bindingAccessible,true);
  assert.equal(readOnly.admin.authenticated,false);
  assert.ok(readOnly.errors.includes('admin_private_custody_unconfirmed'));
  assert.equal(readOnly.verifier.verified,true);
  assert.equal(unconfirmed.clients.length,1);
  for (const [raw, code] of [['','binding_inaccessible'],['bad','url_invalid'],
    [makeUrl('lythaus_admin').replace(TARGET.branch,'wrongbranch'),'target_mismatch'],
    [makeUrl('lythaus_migrations'),'role_mismatch']]) {
    const f=fixture();
    f.env.LYTHAUS_NEW_CORE_ADMIN_DATABASE_URL = raw;
    const report = await f.run();
    assert.ok(report.errors.includes('admin_'+code));
    assert.equal(f.clients.length,1);
    assert.equal(f.delivered.length,0);
  }
  const f=fixture({connectorError:'28P01'});
  assert.ok((await f.run()).errors.includes('admin_authentication_rejected'));
});

test('role drift, changed grants and consumed bootstrap state each block',async () => {
  for (const key of ['ddl_denied','direct_inserts_denied','bootstrap_execute','restricted_role','read_only']) {
    const result=await fixture({rowOverride:{[key]:false}}).run();
    assert.ok(result.errors.includes('admin_database_boundary_mismatch'));
  }
  const f=fixture({changedGrant:true});
  assert.ok((await f.run()).errors.includes('verifier_schema_or_grants_changed'));
  assert.ok(!f.queries.some(sql => sql.includes('FROM system.read_first_admin_bootstrap_state()')));
  assert.ok((await fixture({clean:false}).run()).errors.includes('verifier_bootstrap_state_changed'));
});

test('owner attestation covers unavailable telemetry only and CA inventory stays mandatory',async () => {
  const providers={subscriptions:new Response('private diagnostic',{status:403}), 'billable-usage':[], 'access/users?per_page=100&page=1':[]};
  const f=fixture({providers});
  assert.equal((await f.run()).ready,false);
  const result = await f.run({existingPlanConfirmedByOwner:true});
  assert.equal(result.ready,true); assert.equal(result.cloudflare.ownerAttestationUsed,true);
  const before=f.reads.length;
  assert.equal((await f.run({existingPlanConfirmedByOwner:true,previousInputs:result})).ready,true);
  assert.deepEqual(f.reads.slice(before),['mtls_certificates']);
  for (const [overrides,code] of [[{subscriptions:[{...subscription,rate_plan:{public_name:'Workers Free'}}]},'paidPlanVerified_not_covered'],
    [{'billable-usage':[{...usage[0],ConsumedQuantity:1e7}]},'includedCapacityVerified_not_covered'],
    [{'billable-usage':[{...usage[1],ConsumedQuantity:3e7-1}]},'includedCapacityVerified_not_covered'],
    [{'access/users?per_page=100&page=1':[],entitlements:[{allocation:{type:'max_count',value:0},feature:{name:'Access Seats'}}]},'seatCovered_not_covered'],
    [{mtls_certificates:new Response(null,{status:403})},'ca_read_denied']]) {
    const blocked=fixture({providers:overrides});
    assert.ok((await blocked.run({existingPlanConfirmedByOwner:true})).errors.includes(code));
    assert.equal(blocked.delivered.length,0);
  }
});

test('a verified issuer may be uploaded only after a complete empty matching CA inventory',async () => {
  const f=fixture({providers:{mtls_certificates:[]}});
  const result=await f.run();
  assert.equal(result.ready,true);
  assert.equal(result.cloudflare.matchingUploadedCa,false);
  assert.equal(f.delivered[0].id,null);
  assert.equal(f.delivered[0].pem,issuer.toString());
  const incomplete=fixture({providers:{mtls_certificates:Response.json({success:true,result:[],result_info:{total_pages:2,total_count:10}})}});
  assert.ok((await incomplete.run()).errors.includes('ca_inventory_incomplete'));
});

test('billing visibility, mismatched billing period or old usage cannot establish allowance',async () => {
  for (const providers of [{subscriptions:[]},
    {'billable-usage':usage.map(row => ({...row,BillingPeriodStart:'2026-10-28'}))},
    {'billable-usage':usage.map(row => ({...row,ChargePeriodEnd:'2026-11-05'}))}]) {
    const f=fixture({providers});
    assert.equal((await f.run()).ready,false);
    assert.equal((await f.run({existingPlanConfirmedByOwner:true})).ready,true);
  }
});

test('standalone command checks the recorded control gate before using any provider binding',() => {
  const result=spawnSync(process.execPath,['scripts/ci/lythaus-new-core-admin-inputs.mjs'],{encoding:'utf8',env:{}});
  assert.equal(result.status,1);
  assert.equal(result.stdout,'');
  assert.deepEqual(JSON.parse(result.stderr),{ready:false,errors:['input_preflight_unavailable']});
});

test('rejects an unverified TLS transport or a missing hostname match',() => {
  assert.throws(() => verifiedOriginIssuers({encrypted:true,authorized:false},'origin.invalid'), /tls_unverified/);
  assert.throws(() => verifiedOriginIssuers({encrypted:true,authorized:true,getPeerCertificate:() => issuer.toLegacyObject()},'origin.invalid'), /tls_hostname_unverified/);
  const src=readFileSync(new URL('../ci/lythaus-new-core-admin-inputs.mjs',import.meta.url),'utf8');
  assert.ok(!/process\.env\.(?:PLANETSCALE_ADMIN_DATABASE_URL|LYTHAUS_NEW_CORE_MIGRATION_DATABASE_URL)/.test(src));
});
