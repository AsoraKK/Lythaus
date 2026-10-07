import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { generateKeyPair, exportJWK, exportPKCS8, SignJWT } from 'jose';
import { uuidv7, signAccessToken, hmacLookup } from '@lythaus/security';
import { loadApprovedMigrations } from '../../../scripts/ci/planetscale-migration-manifest.mjs';
import { nativePostgresActivityFixture } from './native-postgres-activity-fixture.mjs';
import { nativePostgresPrivacyWorkflowFixture } from '../../../apps/lythaus-public-api/tests/native-postgres-workflow-fixture.mjs';

const supplied = new URL(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL ?? 'file:///missing');
assert.ok(['127.0.0.1','localhost'].includes(supplied.hostname));
assert.ok(supplied.pathname.startsWith('/lythaus_auth_test') || (process.env.GITHUB_ACTIONS === 'true' && supplied.pathname === '/postgres'));
const name = 'lythaus_auth_test_activity_integration_' + uuidv7().replaceAll('-','');
const local = new URL(supplied); local.pathname = '/' + name;
let control, bootstrap, publicApi, adminApi, workflow, jwksServer, created = false;
let privateKey, privateKeyPem, jwks, accessToken;
const keyId = 'synthetic-activity-integration', accessSubject = 'synthetic-activity-owner';
const hmacKey = randomBytes(32).toString('base64');
const actorA = uuidv7(), actorB = uuidv7(), owner = uuidv7();
const sql = (text, values = []) => control.query(text, values);
before(async () => {
  bootstrap = new pg.Client({ connectionString: supplied.toString(), ssl: false }); await bootstrap.connect();
  assert.match((await bootstrap.query('SHOW server_version_num')).rows[0].server_version_num, /^17/);
  await bootstrap.query(`CREATE DATABASE ${name}`); created = true;
  control = new pg.Client({ connectionString: local.toString(), ssl: false }); await control.connect();
  for (const migration of loadApprovedMigrations().migrations) await sql(migration.contents.toString());
  await sql(readFileSync('database/planetscale/grants/roles.sql','utf8'));
  await sql(readFileSync('database/planetscale/proposals/profile-presentation-preferences.sql','utf8'));
  const pair = await generateKeyPair('ES256', { extractable: true }); privateKey = pair.privateKey;
  privateKeyPem = await exportPKCS8(privateKey);
  jwks = { keys: [{ ...await exportJWK(pair.publicKey), kid: keyId, alg: 'ES256', use: 'sig' }] };
  jwksServer = createServer((_request,response) => { response.setHeader('Content-Type','application/json'); response.end(JSON.stringify(jwks)); });
  await new Promise(resolve => jwksServer.listen(0,'127.0.0.1',resolve));
  const bindings = { ENVIRONMENT: 'local', EXPECTED_HOSTNAMES: 'api.lythaus.test', CORS_ALLOWED_ORIGINS: 'https://app.lythaus.test',
    PII_HMAC_KEY_V1: hmacKey, JWT_PUBLIC_JWKS: JSON.stringify(jwks), ACCESS_SUBJECT_HMAC_KEY: hmacKey,
    ACCESS_JWKS_URL: `http://127.0.0.1:${jwksServer.address().port}/jwks`, ACCESS_AUDIENCES: 'synthetic-activity-admin',
    ACCESS_TEAM_DOMAIN: 'synthetic-access.invalid' };
  publicApi = await nativePostgresActivityFixture(local.toString(),'public',bindings);
  adminApi = await nativePostgresActivityFixture(local.toString(),'admin',bindings);
  workflow = await nativePostgresPrivacyWorkflowFixture(local.toString());
  for (const id of [actorA,actorB,owner]) await sql('INSERT INTO identity.users(id) VALUES($1)',[id]);
  await sql("INSERT INTO identity.admin_memberships(user_id,access_subject_hmac,role,active) VALUES($1,decode($2,'base64'),'owner',true)",[owner,hmacLookup(accessSubject,hmacKey)]);
  accessToken = await new SignJWT({}).setProtectedHeader({alg:'ES256',kid:keyId}).setSubject(accessSubject)
    .setAudience('synthetic-activity-admin').setIssuer('https://synthetic-access.invalid').setIssuedAt().setExpirationTime('1h').sign(privateKey);
});
after(async () => {
  await publicApi?.dispose(); await adminApi?.dispose(); await workflow?.dispose();
  if (jwksServer) await new Promise(resolve => jwksServer.close(resolve));
  await control?.end();
  if (created) await bootstrap.query(`DROP DATABASE ${name}`);
  await bootstrap?.end();
});
async function call(actor, method='GET', body, path='/api/analytics/activity-consent', extra={}) {
  const token = actor ? await signAccessToken({userId:actor,privateKeyPem,keyId}) : undefined;
  return publicApi.dispatchFetch('https://api.lythaus.test'+path,{method,headers:{
    ...(token ? {authorization:'Bearer '+token}:{}), ...(body === undefined ? {} : {'content-type':'application/json'}),
    origin:'https://app.lythaus.test', ...extra }, ...(body === undefined ? {} : {body:JSON.stringify(body)})});
}
const admin = (extra={}) => adminApi.dispatchFetch('https://api.lythaus.test/api/admin/activity-measurement',{
  headers:{'cf-access-jwt-assertion':accessToken,'x-correlation-id':'synthetic-repeatable-correlation',...extra}});
async function choice(actor, enabled) {
  const state = await (await call(actor)).json();
  const response = await call(actor,'PUT',{enabled,expectedRevision:state.revision,expectedEpoch:state.epoch,accountScope:state.accountScope,noticeVersion:state.noticeVersion});
  assert.equal(response.status,200,await response.clone().text()); return response.json();
}
const renderBody = state => ({signal:'foreground_app_render',consentRevision:state.revision,consentEpoch:state.epoch,accountScope:state.accountScope,noticeVersion:state.noticeVersion});
async function privacyRequest(subjectId, kind) {
  const requestId=uuidv7(); await sql('INSERT INTO privacy.requests(id,subject_id,request_type) VALUES($1,$2,$3)',[requestId,subjectId,kind]);
  return {subjectId,requestId};
}

test('native Workflow uninstalled pilot is explicitly not collected and does not break profile export',async()=>{
  const params=await privacyRequest(actorB,'export'), result=await workflow.run('export',params);
  assert.equal(result.status,'complete',JSON.stringify(result));
  const bucket=await workflow.bucket('PRIVATE_EXPORTS'), objects=await bucket.list();
  const passport=JSON.parse(await (await bucket.get(objects.objects[0].key)).text());
  assert.deepEqual(passport.accountActivityMeasurement,{status:'not_collected',noticeVersion:'activity-account-day-v1'});
  assert.equal(passport.profile.id, actorB);
});

test('actual public dispatcher enforces JWT, origins, scope, disabled activation and canonical dedupe',async()=>{
  await sql(readFileSync('database/planetscale/proposals/opt-in-activity-measurement.sql','utf8'));
  assert.equal((await call(null)).status,401);
  const forbiddenOrigin = await call(actorA,'PUT',{},undefined,{origin:'https://untrusted.invalid'});
  assert.equal(forbiddenOrigin.status,403);
  assert.equal((await forbiddenOrigin.json()).error,'auth_origin_not_allowed');
  const unknown=await call(actorA); assert.equal(unknown.status,200); assert.match(unknown.headers.get('cache-control'),/private.*no-store/);
  const state=await unknown.json(); assert.equal(state.granted,false); assert.equal(state.pilotEnabled,false);
  await sql("UPDATE privacy.activity_measurement_configuration SET cutover_at=now()-interval '90 days',retention_terms_approved=true");
  await sql("UPDATE system.feature_flags SET enabled=true WHERE flag_key='analytics.account_daily_activity_pilot'");
  const a=await choice(actorA,true); await choice(actorB,true);
  assert.equal((await call(actorB,'POST',renderBody(a),'/api/analytics/activity')).status,409);
  const first=await call(actorA,'POST',renderBody(a),'/api/analytics/activity'); assert.equal(first.status,200);
  assert.equal((await first.json()).inserted,true);
  assert.equal((await (await call(actorA,'POST',renderBody(a),'/api/analytics/activity')).json()).inserted,false);
  await choice(actorA,false);
  assert.equal((await call(actorA,'POST',renderBody(a),'/api/analytics/activity')).status,409);
  assert.equal((await sql('SELECT count(*)::integer AS count FROM privacy.account_active_days WHERE user_id=$1',[actorA])).rows[0].count,0);
  await choice(actorA,true);
});

test('actual Access-authenticated Admin route audits repeated correlation and refuses revoked owner and rate exhaustion',async()=>{
  assert.equal((await admin({'cf-access-jwt-assertion':'invalid'})).status,401);
  for(let index=0;index<2;index++) { const response=await admin(); assert.equal(response.status,200,await response.clone().text());
    const snapshot=await response.json(); assert.equal(snapshot.metrics.dau.value,null); assert.equal(snapshot.metrics.dau.reason,'no_observable_cohort'); }
  assert.equal((await sql("SELECT count(*)::integer AS count FROM system.audit_events WHERE actor_id=$1 AND correlation_id='synthetic-repeatable-correlation'",[owner])).rows[0].count,2);
  await sql('UPDATE identity.admin_memberships SET active=false WHERE user_id=$1',[owner]); assert.equal((await admin()).status,403);
  await sql('UPDATE identity.admin_memberships SET active=true WHERE user_id=$1',[owner]);
  await sql("UPDATE system.rate_limit_windows SET request_count=120 WHERE scope='admin-api'"); assert.equal((await admin()).status,429);
  await sql("DELETE FROM system.rate_limit_windows WHERE scope='admin-api'");
  await sql('REVOKE INSERT ON system.audit_events FROM lythaus_admin');
  const before=(await sql('SELECT count(*)::integer AS count FROM system.audit_events WHERE actor_id=$1',[owner])).rows[0].count;
  assert.equal((await admin()).status,503);
  assert.equal((await sql('SELECT count(*)::integer AS count FROM system.audit_events WHERE actor_id=$1',[owner])).rows[0].count,before);
  await sql('GRANT INSERT ON system.audit_events TO lythaus_admin');
});

test('actual public rate exhaustion and revoked token version cannot enter the analytics handler',async()=>{
  await sql("UPDATE system.rate_limit_windows SET request_count=10000 WHERE scope <> 'admin-api'");
  assert.equal((await call(actorA)).status,429);
  await sql('DELETE FROM system.rate_limit_windows');
  await sql('UPDATE identity.users SET token_version=token_version+1 WHERE id=$1',[actorB]);
  assert.equal((await call(actorB)).status,401);
});

test('native export includes subject dates, retention preserves holds, and deletion removes only its own purpose',async()=>{
  const state=await (await call(actorA)).json();
  assert.equal((await call(actorA,'POST',renderBody(state),'/api/analytics/activity')).status,200);
  const params=await privacyRequest(actorA,'export'), result=await workflow.run('export',params);
  assert.equal(result.status,'complete',JSON.stringify(result));
  const passport=JSON.parse(await (await (await workflow.bucket('PRIVATE_EXPORTS')).get(`exports/${actorA}/${params.requestId}.json`)).text());
  assert.deepEqual(passport.accountActivityMeasurement.activeDates,[new Date().toISOString().slice(0,10)]);
  assert.equal(passport.profile.id, actorA);
  await sql(`INSERT INTO privacy.account_active_days(user_id,active_day,consent_id,expires_at)
    SELECT $1,(now() AT TIME ZONE 'UTC')::date-61,$2,((now() AT TIME ZONE 'UTC')::date::timestamp AT TIME ZONE 'UTC')`,[actorA,state.epoch]);
  const held=uuidv7(); await sql("INSERT INTO privacy.legal_holds(id,subject_id,reason) VALUES($1,$2,'Synthetic Workflow hold')",[held,actorA]);
  let retention=await workflow.run('retention',{runId:uuidv7()}); assert.equal(retention.status,'complete',JSON.stringify(retention));
  assert.equal((await sql('SELECT count(*)::integer AS count FROM privacy.account_active_days WHERE user_id=$1',[actorA])).rows[0].count,2);
  await sql('UPDATE privacy.legal_holds SET active=false WHERE id=$1',[held]);
  retention=await workflow.run('retention',{runId:uuidv7()}); assert.equal(retention.status,'complete',JSON.stringify(retention));
  assert.equal((await sql('SELECT count(*)::integer AS count FROM privacy.account_active_days WHERE user_id=$1',[actorA])).rows[0].count,1);
  const deletion=await workflow.run('delete',await privacyRequest(actorA,'delete')); assert.equal(deletion.status,'complete',JSON.stringify(deletion));
  assert.equal((await sql('SELECT count(*)::integer AS count FROM privacy.account_active_days WHERE user_id=$1',[actorA])).rows[0].count,0);
  assert.equal((await sql('SELECT count(*)::integer AS count FROM privacy.activity_measurement_consents WHERE user_id=$1',[actorA])).rows[0].count,0);
  assert.ok((await sql('SELECT count(*)::integer AS count FROM privacy.activity_measurement_consents WHERE user_id=$1',[actorB])).rows[0].count>0);
  assert.ok(workflow.steps.some(step=>step.name==='purge-account-activity-for-deletion'&&step.state==='succeeded'));
});

test('native delete blocks active holds and fails safely during activation, then retries after release',async()=>{
  const subject=uuidv7(),hold=uuidv7(); await sql('INSERT INTO identity.users(id) VALUES($1)',[subject]);
  const consent=await choice(subject,true);
  assert.equal((await call(subject,'POST',renderBody(consent),'/api/analytics/activity')).status,200);
  await sql("INSERT INTO privacy.legal_holds(id,subject_id,reason) VALUES($1,$2,'Synthetic native hold race')",[hold,subject]);
  const params=await privacyRequest(subject,'delete');
  const blocked=await workflow.run('delete',params); assert.equal(blocked.status,'complete',JSON.stringify(blocked));
  assert.equal(blocked.output.state,'blocked');
  assert.equal((await sql('SELECT count(*)::integer AS count FROM privacy.account_active_days WHERE user_id=$1',[subject])).rows[0].count,1);
  await sql('UPDATE privacy.legal_holds SET active=false WHERE id=$1',[hold]);
  const activating=new pg.Client({connectionString:local.toString(),ssl:false}); await activating.connect();
  try {
    await activating.query('BEGIN'); await activating.query('UPDATE privacy.legal_holds SET active=true WHERE id=$1',[hold]);
    const contended=await workflow.run('delete',params); assert.equal(contended.status,'errored',JSON.stringify(contended));
    assert.equal((await sql('SELECT count(*)::integer AS count FROM privacy.account_active_days WHERE user_id=$1',[subject])).rows[0].count,1);
    await activating.query('COMMIT');
  } finally {await activating.query('ROLLBACK');await activating.end();}
  await sql('UPDATE privacy.legal_holds SET active=false WHERE id=$1',[hold]);
  const retried=await workflow.run('delete',params); assert.equal(retried.status,'complete',JSON.stringify(retried));
  assert.equal(retried.output.state,'completed');
  assert.equal((await sql('SELECT count(*)::integer AS count FROM privacy.account_active_days WHERE user_id=$1',[subject])).rows[0].count,0);
});

test('native privacy workflows fail closed on partial installation and do not publish an incomplete export',async()=>{
  const subject=uuidv7(); await sql('INSERT INTO identity.users(id) VALUES($1)',[subject]);
  const params=await privacyRequest(subject,'export');
  await sql('DROP FUNCTION privacy.expire_activity_measurement(integer)');
  const result=await workflow.run('export',params); assert.equal(result.status,'errored',JSON.stringify(result));
  assert.equal((await sql('SELECT count(*)::integer AS count FROM privacy.export_manifests WHERE request_id=$1',[params.requestId])).rows[0].count,0);
});
