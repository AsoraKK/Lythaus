import assert from 'node:assert/strict';
import { after, mock, test } from 'node:test';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { exportJWK, exportPKCS8, generateKeyPair } from 'jose';
import * as database from '@lythaus/db';
import * as telemetry from '@lythaus/observability';
import { encryptField, hashAuthToken, hashPassword, hmacLookup, uuidv7 } from '@lythaus/security';

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
const target = new URL(connectionString ?? 'file:///missing');
if (!['localhost', '127.0.0.1'].includes(target.hostname)
  || !(target.pathname.startsWith('/lythaus_auth_test') || (process.env.GITHUB_ACTIONS === 'true' && target.pathname === '/postgres'))) {
  throw new Error('Full auth journey tests require an explicitly local disposable PostgreSQL database');
}
async function withClient(work, role) {
  const client = new pg.Client({ connectionString, ssl: false, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    await client.query("SET statement_timeout='5s'");
    if (role) {
      assert.ok(['lythaus_runtime','lythaus_jobs','lythaus_admin'].includes(role));
      await client.query(`SET ROLE ${role}`);
    }
    return await work(client);
  }
  finally { await client.end(); }
}
const sql = (text, values) => withClient(client => client.query(text, values));
const databaseErrors = [];
mock.module('@lythaus/db', { namedExports: { ...database,
  query: (binding, text, values) => withClient(client => client.query(text, values), binding.role).catch(error=>{
    databaseErrors.push({code:error.code,reason:/^[a-zA-Z0-9_:-]{1,120}$/.test(error.message)?error.message:undefined});throw error;
  }),
  transaction: (binding, work) => withClient(async client => {
    await client.query('BEGIN');
    try { const result = await work(client); await client.query('COMMIT'); return result; }
    catch(error) { await client.query('ROLLBACK'); databaseErrors.push({ code:error.code, constraint:error.constraint,
      reason:/^[a-zA-Z0-9_:-]{1,120}$/.test(error.message)?error.message:undefined }); throw error; }
  }, binding.role),
} });
const logs = [];
mock.module('@lythaus/observability', { namedExports: { ...telemetry, logEvent: event => logs.push(event) } });
const { default: worker } = await import('../src/index.ts');
mock.module('../../lythaus-auth-acceptance-coordinator/src/access-policy.ts', { namedExports: {
  accessSubject: async request => {
    if (request.headers.get('cf-access-jwt-assertion') !== 'local-synthetic-human') throw new Error('access_required');
    return 'local-synthetic-human';
  },
} });
const { default: coordinator } = await import('../../lythaus-auth-acceptance-coordinator/src/index.ts');
const { parseRealEmailAcceptanceEvidence } = await import('../../../scripts/ci/real-email-acceptance-evidence.mjs');
const { relayTransactionalEmailOutbox, applyTransactionalEmailLifecycle } = await import('../../lythaus-jobs/src/transactional-email-runtime.ts');
const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
const keyId = 'local-auth-fixture';
const publicJwk = { ...await exportJWK(publicKey), kid: keyId, use: 'sig', alg: 'ES256' };
const env = {
  ENVIRONMENT: 'local', EXPECTED_HOSTNAMES: 'api.lythaus.test',
  CORS_ALLOWED_ORIGINS: 'https://app.lythaus.test',
  WORKER_VERSION: { id: uuidv7(), tag: 'synthetic-local-test' },
  DB_APP_FRESH: {role:'lythaus_runtime'}, DB_JOBS_FRESH: {role:'lythaus_jobs'},
  AUTH_PASSWORD_PEPPER_V1: randomBytes(32).toString('base64'),
  PII_ENCRYPTION_KEY_V1: randomBytes(32).toString('base64'), PII_HMAC_KEY_V1: randomBytes(32).toString('base64'),
  TRANSACTIONAL_EMAIL_ENCRYPTION_KEY_V1: randomBytes(32).toString('base64'),
  JWT_KEY_ID: keyId, JWT_PRIVATE_KEY: await exportPKCS8(privateKey), JWT_PUBLIC_JWKS: JSON.stringify({ keys: [publicJwk] }),
  TURNSTILE_REQUIRED: 'true', TURNSTILE_SECRET_KEY: 'local-only-fixture', TURNSTILE_EXPECTED_HOSTNAMES: 'lythaus.co',
  EMAIL_PROVIDER_MODE: 'cloudflare', EMAIL_FROM: 'no-reply@mail.lythaus.test',
  EMAIL_VERIFICATION_BASE_URL: 'https://lythaus.co/verify-email?token=',
  EMAIL_PASSWORD_RESET_BASE_URL: 'https://lythaus.co/reset-password?token=',
};
const mailbox = [];
let fixtureIp = `2001:db8::${randomBytes(2).toString('hex')}`;
env.EMAIL = { send: async message => { const messageId = `synthetic-${uuidv7()}`; mailbox.push({ ...message, messageId }); return { messageId }; } };
const realFetch = globalThis.fetch;
let screeningUnavailable = false;
after(() => { globalThis.fetch = realFetch; });
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith('https://api.pwnedpasswords.com/range/')) return screeningUnavailable
    ? Response.json({}, { status: 503 }) : new Response(`${'0'.repeat(35)}:0`);
  if (String(url) === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {
    const body = JSON.parse(init.body);
    return Response.json({ success: true, hostname: 'lythaus.co', action: body.response });
  }
  throw new Error('No external network is allowed in local auth fixtures');
};

async function request(path, body, { cookie, access, headers = {}, method } = {}) {
  return worker.fetch(new Request(`https://api.lythaus.test/api/auth/${path}`, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': fixtureIp,
      'x-correlation-id': uuidv7(), ...(cookie ? {cookie, origin:'https://app.lythaus.test','x-lythaus-auth-transport':'cookie-v1'} : {}),
      ...(access ? {authorization:`Bearer ${access}`} : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), env);
}
function cookieOf(response) { return response.headers.get('set-cookie')?.split(';')[0]; }
function tokenOf(message) { const url = new URL(message.text.match(/https:\/\/\S+/)[0]); assert.equal(url.search,''); return new URLSearchParams(url.hash.slice(1)).get('token'); }
async function expectStatus(response, expected) {
  const body = await response.json();
  assert.equal(response.status, expected, `Expected HTTP ${expected}; received ${response.status} (${body.error ?? body.state ?? 'response'}); database codes ${JSON.stringify(databaseErrors)}`);
  assert.match(response.headers.get('cache-control'), /no-store/);
  return body;
}

test('real PostgreSQL + real API handler: signup, mailbox-owned setup, cookie session, reset and revocation', async t => {
  const email = `synthetic-${uuidv7()}@example.invalid`;
  const preregisteredPassword = 'synthetic attacker passphrase';
  const password = 'synthetic mailbox owner passphrase';
  const newPassword = 'synthetic changed owner passphrase';
  screeningUnavailable = true;
  try {
    const unavailable = await request('email', { mode:'register', email, password, turnstileToken:'account_signup' });
    assert.equal((await expectStatus(unavailable,503)).error,'password_screening_unavailable');
  } finally { screeningUnavailable = false; }
  await expectStatus(await request('email',{mode:'register',email,password:preregisteredPassword,turnstileToken:'account_signup'}),202);
  const lookup = hmacLookup(email,env.PII_HMAC_KEY_V1);
  const record = (await sql("SELECT u.id,c.verified_at FROM identity.users u JOIN identity.email_credentials c ON c.user_id=u.id WHERE c.email_lookup_hmac=decode($1,'base64')",[lookup])).rows[0];
  assert.equal(record.verified_at,null);
  assert.equal((await expectStatus(await request('email',{mode:'login',email,password:preregisteredPassword}),400)).error,'email_verification_required');
  await relayTransactionalEmailOutbox(env);
  const initial = mailbox.find(message => message.to === email && message.subject.includes('Verify'));
  assert.ok(initial,'Local provider capture received verification');
  const token = tokenOf(initial);
  const providerRow = (await sql('SELECT state,delivery_envelope_ciphertext FROM system.transactional_email_outbox WHERE provider_message_id=$1',[initial.messageId])).rows[0];
  assert.deepEqual(providerRow,{state:'provider_accepted',delivery_envelope_ciphertext:null});
  await withClient(client => applyTransactionalEmailLifecycle(client,{eventType:'message.delivered',messageId:initial.messageId}));
  await expectStatus(await request(`email/verify?token=${token}`,undefined),404);
  await expectStatus(await request('email/verify',{token,password:'too short'}),400);
  assert.equal((await sql("SELECT consumed_at FROM identity.email_verification_tokens WHERE token_hash=decode($1,'base64')",[hashAuthToken(token,'verification')])).rows[0].consumed_at,null);
  await expectStatus(await request('email/verify',{token,password}),200);
  await expectStatus(await request('email/verify',{token,password}),400);
  await expectStatus(await request('email',{mode:'login',email,password:preregisteredPassword}),401);
  const login = await request('email',{mode:'login',email,password},{headers:{origin:'https://app.lythaus.test','x-lythaus-auth-transport':'cookie-v1'}});
  const session = await expectStatus(login,200);
  assert.equal(session.refreshToken,undefined);
  assert.match(login.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);
  const info = await expectStatus(await request('userinfo',undefined,{access:session.accessToken}),200);
  assert.equal(info.id,record.id);
  const refresh = await request('refresh',{}, {cookie:cookieOf(login)});
  const refreshed = await expectStatus(refresh,200);
  await expectStatus(await request('password/reset/request',{email,turnstileToken:'password_reset_request'}),202);
  await relayTransactionalEmailOutbox(env);
  const resetMessage = mailbox.find(message=>message.to===email&&message.subject.includes('Reset'));
  assert.ok(resetMessage,'Local provider capture received reset');
  assert.notEqual(resetMessage.messageId,initial.messageId);
  const resetToken = tokenOf(resetMessage);
  await expectStatus(await request('password/reset/complete',{token:resetToken,password:newPassword}),200);
  await expectStatus(await request('password/reset/complete',{token:resetToken,password:newPassword}),400);
  await expectStatus(await request('email',{mode:'login',email,password}),401);
  await expectStatus(await request('refresh',{}, {cookie:cookieOf(refresh)}),401);
  await expectStatus(await request('userinfo',undefined,{access:refreshed.accessToken}),401);
  const relogin=await request('email',{mode:'login',email,password:newPassword},{headers:{origin:'https://app.lythaus.test','x-lythaus-auth-transport':'cookie-v1'}});
  await expectStatus(relogin,200);
  await expectStatus(await request('logout',{}, {cookie:cookieOf(relogin)}),200);
  await expectStatus(await request('refresh',{}, {cookie:cookieOf(relogin)}),401);
  await relayTransactionalEmailOutbox(env);
  const notice=mailbox.find(message=>message.to===email&&message.subject==='Your Lythaus password changed');
  assert.ok(notice);
  assert.ok(!notice.text.includes(newPassword));
  const serializedLogs=JSON.stringify(logs);
  for(const secret of [email,token,resetToken,password,newPassword,session.accessToken]) assert.ok(!serializedLogs.includes(secret),'Operational logs must exclude identity and credentials');
});

test('real handler idempotency, concurrent registration and resend preserve identity and one current challenge', async () => {
  fixtureIp=`2001:db8::${randomBytes(2).toString('hex')}`;
  const email=`synthetic-${uuidv7()}@example.invalid`,password='synthetic pending passphrase';
  const input={mode:'register',email,password,turnstileToken:'account_signup'};
  const key=uuidv7();
  await expectStatus(await request('email',input,{headers:{'idempotency-key':key}}),202);
  await expectStatus(await request('email',{...input,turnstileToken:'fresh-challenge-not-revalidated'},{headers:{'idempotency-key':key}}),202);
  await expectStatus(await request('email',{...input,password:'different synthetic passphrase'},{headers:{'idempotency-key':key}}),409);
  for(const response of await Promise.all([request('email',input),request('email',input)]))await expectStatus(response,202);
  const lookup=hmacLookup(email,env.PII_HMAC_KEY_V1);
  const rows=(await sql("SELECT user_id,password_hash FROM identity.email_credentials WHERE email_lookup_hmac=decode($1,'base64')",[lookup])).rows;
  assert.equal(rows.length,1);
  const id=rows[0].user_id;
  assert.equal((await sql('SELECT count(*)::int AS n FROM system.transactional_email_outbox WHERE contact_email_user_id=$1',[id])).rows[0].n,1);
  await relayTransactionalEmailOutbox(env);
  const first=mailbox.find(message=>message.to===email);
  assert.ok(first);
  await sql("UPDATE identity.email_verification_tokens SET created_at=now()-interval '31 seconds' WHERE user_id=$1",[id]);
  await expectStatus(await request('email',{mode:'resend_verification',email,turnstileToken:'verification_resend'}),202);
  await relayTransactionalEmailOutbox(env);
  const second=mailbox.filter(message=>message.to===email).at(-1);
  assert.notEqual(second.messageId,first.messageId);
  await expectStatus(await request('email/verify',{token:tokenOf(first),password}),400);
  await expectStatus(await request('email/verify',{token:tokenOf(second),password}),200);
  await expectStatus(await request('email/verify',{token:tokenOf(second),password}),400);
  const login=await expectStatus(await request('email',{mode:'login',email,password}),200);
  assert.equal((await expectStatus(await request('userinfo',undefined,{access:login.accessToken}),200)).id,id);
  const persisted=(await sql('SELECT response FROM system.idempotency_keys WHERE key=$1',[key])).rows[0].response;
  assert.deepEqual(Object.keys(persisted).sort(),['requestHash','state']);
  assert.equal(persisted.state,'completed');
  await expectStatus(await request('logout',{refreshToken:login.refreshToken},{access:'expired-or-unusable-access'}),200);
  await expectStatus(await request('refresh',{refreshToken:login.refreshToken}),401);
  await expectStatus(await request('userinfo',undefined,{access:login.accessToken}),401);
});

test('legacy mailbox setup preserves the original user and restricted/unknown intake remains neutral', async () => {
  fixtureIp=`2001:db8::${randomBytes(2).toString('hex')}`;
  const email=`synthetic-${uuidv7()}@example.invalid`,id=uuidv7();
  const encrypted=await encryptField(email,env.PII_ENCRYPTION_KEY_V1,'v1');
  await sql("INSERT INTO identity.users(id,status) VALUES($1,'relink_required')",[id]);
  await sql(`INSERT INTO identity.contact_emails(user_id,email_ciphertext,email_lookup_hmac,encryption_key_version,source_provider,verified_at)
    VALUES($1,convert_to($2,'utf8'),decode($3,'base64'),'v1','email',now())`,[id,encrypted.ciphertext,hmacLookup(email,env.PII_HMAC_KEY_V1)]);
  const neutral=await expectStatus(await request('password/reset/request',{email:`unknown-${uuidv7()}@example.invalid`,turnstileToken:'password_reset_request'}),202);
  assert.deepEqual(await expectStatus(await request('password/reset/request',{email,turnstileToken:'password_reset_request'}),202),neutral);
  assert.equal((await sql('SELECT count(*)::int AS n FROM identity.email_credentials WHERE user_id=$1',[id])).rows[0].n,0);
  await relayTransactionalEmailOutbox(env);
  const mail=mailbox.find(message=>message.to===email);
  assert.ok(mail.subject.includes('Verify'));
  const password='synthetic recovered passphrase';
  await expectStatus(await request('email/verify',{token:tokenOf(mail),password}),200);
  const login=await expectStatus(await request('email',{mode:'login',email,password}),200);
  assert.equal((await expectStatus(await request('userinfo',undefined,{access:login.accessToken}),200)).id,id);
  for(const olderPassword of ['olderpass12!','olderpass123!','olderpass1234!']) {
    await sql('UPDATE identity.email_credentials SET password_hash=$2::jsonb WHERE user_id=$1',[id,JSON.stringify(hashPassword(olderPassword,env.AUTH_PASSWORD_PEPPER_V1))]);
    await expectStatus(await request('email',{mode:'login',email,password:olderPassword}),200);
  }
  await sql("UPDATE identity.users SET status='suspended' WHERE id=$1",[id]);
  await expectStatus(await request('email',{mode:'login',email,password:'olderpass1234!'}),401);
  const before=mailbox.length;
  assert.deepEqual(await expectStatus(await request('password/reset/request',{email,turnstileToken:'password_reset_request'}),202),neutral);
  await relayTransactionalEmailOutbox(env);
  assert.equal(mailbox.length,before);
  assert.equal((await sql('SELECT status FROM identity.users WHERE id=$1',[id])).rows[0].status,'suspended');
});

test('corrupt account delivery data remains neutral and persists a failed intake without partial issuance',async()=>{
  fixtureIp=`2001:db8::${randomBytes(2).toString('hex')}`;
  const email=`synthetic-${uuidv7()}@example.invalid`,id=uuidv7();
  await sql("INSERT INTO identity.users(id,status) VALUES($1,'relink_required')",[id]);
  await sql(`INSERT INTO identity.contact_emails(user_id,email_ciphertext,email_lookup_hmac,encryption_key_version,source_provider,verified_at)
    VALUES($1,convert_to('invalid-encrypted-fixture','utf8'),decode($2,'base64'),'v1','email',now())`,[id,hmacLookup(email,env.PII_HMAC_KEY_V1)]);
  const correlation=uuidv7();
  const failed=await expectStatus(await request('password/reset/request',{email,turnstileToken:'password_reset_request'},{headers:{'x-correlation-id':correlation}}),202);
  assert.deepEqual(failed,await expectStatus(await request('password/reset/request',{email:`unknown-${uuidv7()}@example.invalid`,turnstileToken:'password_reset_request'}),202));
  assert.equal((await sql("SELECT reason_code FROM system.audit_events WHERE correlation_id=$1 AND action='auth.recovery.intake'",[correlation])).rows[0].reason_code,'failed');
  assert.equal((await sql('SELECT count(*)::int n FROM identity.email_verification_tokens WHERE user_id=$1',[id])).rows[0].n,0);
  assert.equal((await sql('SELECT count(*)::int n FROM system.transactional_email_outbox WHERE contact_email_user_id=$1',[id])).rows[0].n,0);
});

test('real coordinator + restricted PostgreSQL roles: opaque email, legacy fixture, exact candidate and v2 observer', async () => {
  const previousFetch=globalThis.fetch;
  const releaseSha='e'.repeat(40),version=uuidv7();
  const publicEnv={...env,WORKER_VERSION:{id:version,tag:releaseSha},DATABASE_READINESS_TOKEN:randomBytes(32).toString('hex')};
  const coordinatorEnv={WORKER_VERSION:{id:uuidv7(),tag:releaseSha},DB_ADMIN_FRESH:{role:'lythaus_admin'},
    AUTH_ACCEPTANCE_STATE_ENCRYPTION_KEY_V1:randomBytes(32).toString('base64'),DATABASE_READINESS_TOKEN:publicEnv.DATABASE_READINESS_TOKEN,
    AUTH_ACCEPTANCE_EMAIL_BASE:`fixture-${uuidv7()}@example.invalid`,AUTH_ACCEPTANCE_PUBLIC_API_URL:'https://api.lythaus.test',
    AUTH_ACCEPTANCE_SECONDARY_EMAIL_BASE:`fixture-${uuidv7()}@second.invalid`,
    AUTH_ACCEPTANCE_ROUTE_BASE_URL:'https://admin.lythaus.co',CLOUDFLARE_ACCOUNT_ID:'synthetic',CLOUDFLARE_EMAIL_LIFECYCLE_READ_TOKEN:'synthetic-local-only'};
  publicEnv.AUTH_ACCEPTANCE_EMAIL_LINK_BASE_URL='https://admin.lythaus.co/api/admin/production-auth-acceptance/email';
  const events=['message.delivered','message.deferred','message.bounced','message.failed','message.rejected','message.complained'];
  const base='https://admin.lythaus.co/api/admin/production-auth-acceptance';
  globalThis.fetch=async(url,init)=>{
    if(String(url).startsWith('https://cloudflare-dns.com/dns-query'))return Response.json({Status:0,Answer:[{type:15,data:`10 ${String(url).includes('second.invalid')?'fixture.mail.protection.outlook.com':'smtp.google.com'}.`}]});
    if(String(url).startsWith('https://api.lythaus.test/')) {
      assert.equal(new Headers(init.headers).get('Cloudflare-Workers-Version-Overrides'),`lythaus-public-api-development="${version}"`);
      return worker.fetch(new Request(url,init),publicEnv);
    }
    if(String(url).includes('/accounts/synthetic/queues'))return Response.json({success:true,result:[{queue_name:'lythaus-email-lifecycle-dev',queue_id:'synthetic-queue'}]});
    if(String(url).includes('/accounts/synthetic/event_subscriptions'))return Response.json({success:true,result:[{destination:{queue_id:'synthetic-queue'},source:{type:'email.sending',domain:'mail.lythaus.co'},enabled:true,events}]});
    return previousFetch(url,init);
  };
  const call=(path,body,{service=false,method}={})=>coordinator.fetch(new Request(`${base}${path}`,{
    method:method??(body===undefined?'GET':'POST'),headers:{'content-type':'application/json',...(service?{'x-lythaus-readiness-token':publicEnv.DATABASE_READINESS_TOKEN}:{'cf-access-jwt-assertion':'local-synthetic-human'})},
    ...(body===undefined?{}:{body:JSON.stringify(body)})}),coordinatorEnv);
  const checked=async(response,status)=>{const body=await response.json();assert.equal(response.status,status,`${body.error?.code??'coordinator response'}; database codes ${JSON.stringify(databaseErrors)}`);return body;};
  try {
    const staged=new Date(Date.now()-1000).toISOString();
    const candidateDependencies=Object.fromEntries(['public','admin','jobs','coordinator'].map(component=>[component,{
      workerName:component==='coordinator'?'lythaus-auth-acceptance-coordinator-development':`lythaus-${component==='jobs'?'jobs':`${component}-api`}-development`,
      versionId:component==='public'?version:component==='coordinator'?coordinatorEnv.WORKER_VERSION.id:uuidv7(),
      sourceSha:releaseSha,status:'NEW_CANDIDATE',provenance:'BUILT_FROM_RELEASE_SHA',
    }]));
    const rollbackSnapshot={schemaVersion:'lythaus-acceptance-rollback-v1',workers:Object.fromEntries(Object.keys(candidateDependencies).map(component=>[component,{versions:[{versionId:uuidv7(),percentage:100}]}])),
      routes:{adminApi:{id:'local-route',pattern:'admin-api.lythaus.co/*',script:'lythaus-admin-api-development'},coordinator:null}};
    const input={releaseSha,candidateWorker:'lythaus-public-api-development',candidateVersion:version,candidateUploadedAt:staged,candidateStagedAt:staged,candidateDependencies,rollbackSnapshot};
    const invalidChanges=[
      value=>{value.releaseSha='invalid';},value=>{value.candidateWorker='unrelated';},value=>{value.candidateVersion='invalid';},
      value=>{value.candidateUploadedAt='invalid';},value=>{value.candidateStagedAt='invalid';},
      value=>{value.candidateStagedAt=new Date(Date.now()+60000).toISOString();},value=>{value.candidateUploadedAt=new Date().toISOString();},
      value=>{value.candidateDependencies=null;},value=>{value.candidateDependencies={};},value=>{value.candidateDependencies.public=null;},
      value=>{value.candidateDependencies.public.workerName='unrelated';},value=>{value.candidateDependencies.public.versionId='invalid';},
      value=>{value.candidateDependencies.public.sourceSha='invalid';},value=>{value.candidateDependencies.public.status='invalid';},
      value=>{value.candidateDependencies.public.provenance='invalid';},value=>{value.candidateDependencies.public.provenance='REUSED_KNOWN_GOOD_PRODUCTION_VERSION';},
      value=>{value.candidateDependencies.public.status='REUSED_PRODUCTION';},value=>{value.candidateDependencies.public.sourceSha='a'.repeat(40);},
      value=>{value.candidateDependencies.admin.sourceSha='a'.repeat(40);},value=>{value.candidateDependencies.public.versionId=uuidv7();},
      value=>{value.candidateDependencies.coordinator.versionId=uuidv7();},value=>{delete value.rollbackSnapshot;},
      value=>{value.rollbackSnapshot=null;},value=>{value.rollbackSnapshot.extra=true;},value=>{value.rollbackSnapshot.schemaVersion='invalid';},
      value=>{value.rollbackSnapshot.workers=null;},value=>{value.rollbackSnapshot.workers={};},value=>{value.rollbackSnapshot.workers.public=null;},
      value=>{value.rollbackSnapshot.workers.public.versions=[];},value=>{value.rollbackSnapshot.workers.public.versions=[null];},
      value=>{value.rollbackSnapshot.workers.public.versions[0].extra=true;},value=>{value.rollbackSnapshot.workers.public.versions[0].versionId='invalid';},
      value=>{value.rollbackSnapshot.workers.public.versions.push({...value.rollbackSnapshot.workers.public.versions[0]});},
      ...[0,-1,101,'100',99].map(percentage=>value=>{value.rollbackSnapshot.workers.public.versions[0].percentage=percentage;}),
      value=>{value.rollbackSnapshot.routes=null;},value=>{value.rollbackSnapshot.routes={};},value=>{value.rollbackSnapshot.routes.adminApi=[];},
      value=>{value.rollbackSnapshot.routes.adminApi.extra=true;},value=>{value.rollbackSnapshot.routes.adminApi.id='';},
      value=>{value.rollbackSnapshot.routes.adminApi.pattern='';},value=>{value.rollbackSnapshot.routes.adminApi.script='invalid script';},
    ];
    for(const change of invalidChanges){const invalid=structuredClone(input);change(invalid);const response=await call('/runs',invalid,{service:true});assert.ok(response.status>=400);assert.ok((await response.json()).error.code);}
    for(const payload of ['null','[]','{','x'.repeat(20001)]) {
      const response=await coordinator.fetch(new Request(`${base}/runs`,{method:'POST',headers:{'content-type':'application/json','x-lythaus-readiness-token':publicEnv.DATABASE_READINESS_TOKEN},body:payload}),coordinatorEnv);
      await checked(response,400);
    }
    await checked(await coordinator.fetch(new Request(`${base}/runs`,{method:'POST',headers:{'x-lythaus-readiness-token':publicEnv.DATABASE_READINESS_TOKEN},body:'{}'}),coordinatorEnv),400);
    await checked(await coordinator.fetch(new Request(`${base}/runs`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'}),coordinatorEnv),401);
    assert.equal((await coordinator.fetch(new Request(`${base}/email`),coordinatorEnv)).status,200);
    await checked(await call('/not-found'),404);
    await checked(await call('/turnstile',undefined,{service:true}),400);
    coordinatorEnv.AUTH_ACCEPTANCE_TURNSTILE_SITE_KEY='synthetic-local-site-key';
    await checked(await call('/turnstile',undefined,{service:true}),200);
    const run=await checked(await call('/runs',input,{service:true}),201);
    const prefix=`/runs/${run.acceptanceRunId}`;
    await checked(await call(prefix,undefined,{service:true}),200);
    await checked(await call(`/runs/${uuidv7()}`,undefined,{service:true}),404);
    const observerUrl=`${base}/observer?releaseSha=${releaseSha}&candidateWorker=lythaus-public-api-development&candidateVersion=${version}`;
    const observerRequest=()=>new Request(observerUrl,{headers:{'x-lythaus-readiness-token':publicEnv.DATABASE_READINESS_TOKEN,'x-lythaus-acceptance-run-id':run.acceptanceRunId}});
    assert.equal((await checked(await coordinator.fetch(observerRequest(),coordinatorEnv),428)).status,'HUMAN_ACCEPTANCE_REQUIRED');
    const mismatch=new Request(observerUrl.replace(releaseSha,'a'.repeat(40)),observerRequest());
    await checked(await coordinator.fetch(mismatch,coordinatorEnv),400);
    const password='synthetic keeper first passphrase',changed='synthetic keeper changed passphrase';
    await checked(await call(`${prefix}/session-proof`,{oldPassword:password,newPassword:changed}),400);
    for(const path of ['register','resend','reset'])await checked(await call(`${prefix}/${path}`,{password}),400);
    const originalVersion=publicEnv.WORKER_VERSION;
    publicEnv.WORKER_VERSION={...originalVersion,id:uuidv7()};
    await checked(await call(`${prefix}/register`,{password,turnstileToken:'account_signup'}),502);
    publicEnv.WORKER_VERSION=originalVersion;
    await checked(await call(`${prefix}/register`,{password,turnstileToken:'account_signup'},{service:true}),401);
    await checked(await call(`${prefix}/register`,{password,turnstileToken:'account_signup'}),202);
    const deliver=async(purpose)=>{
      const start=mailbox.length;
      await relayTransactionalEmailOutbox(publicEnv);
      const message=mailbox.slice(start).find(item=>item.to.includes(run.acceptanceRunId.replace(/-/g,''))&&(purpose==='password_reset'?item.subject.includes('Reset'):item.subject.includes('Verify')));
      assert.ok(message,'Synthetic local provider captured the coordinator message');
      const url=new URL(message.text.match(/https:\/\/\S+/)[0]);
      assert.equal(url.hostname,'admin.lythaus.co');assert.equal(url.search,'');
      const parameters=new URLSearchParams(url.hash.slice(1));
      assert.match(parameters.get('context'),/^[a-f0-9]{64}$/);
      assert.ok(!message.text.includes(version));assert.ok(!message.text.includes(releaseSha));
      await withClient(client=>applyTransactionalEmailLifecycle(client,{eventType:'message.delivered',messageId:message.messageId}), 'lythaus_jobs');
      return parameters;
    };
    const complete=async(parameters,newPassword)=>{
      const form=new FormData();for(const [key,value]of parameters)form.set(key,value);
      form.set('password',newPassword);form.set('passwordConfirmation',newPassword);
      const response=await coordinator.fetch(new Request(`${base}/email/complete`,{method:'POST',headers:{origin:'https://admin.lythaus.co','cf-access-jwt-assertion':'local-synthetic-human'},body:form}),coordinatorEnv);
      if(response.status!==200)assert.fail(`Completion failed: ${response.status} ${(await response.json()).error?.code}`);
    };
    const first=await deliver('verification');await complete(first,password);
    await checked(await call(`${prefix}/initial-session`,{password}),200);
    const cooldown=await checked(await call(`${prefix}/resend`,{turnstileToken:'verification_resend'}),202);
    assert.equal(cooldown.state,'resend_fixture_cooldown');assert.ok(cooldown.retryAfterSeconds>0);
    const fixture=(await sql('SELECT resend_fixture_user_id FROM system.production_auth_acceptance_runs WHERE id=$1',[run.acceptanceRunId])).rows[0].resend_fixture_user_id;
    assert.equal((await sql('SELECT count(*)::integer n FROM identity.email_credentials WHERE user_id=$1',[fixture])).rows[0].n,0);
    await new Promise(resolve=>setTimeout(resolve,(cooldown.retryAfterSeconds+1)*1000));
    await checked(await call(`${prefix}/resend`,{turnstileToken:'verification_resend'}),202);
    await complete(await deliver('verification'),password);
    assert.equal((await sql('SELECT u.status,c.verified_at FROM identity.users u JOIN identity.email_credentials c ON c.user_id=u.id WHERE u.id=$1',[fixture])).rows[0].status,'active');
    await checked(await call(`${prefix}/reset`,{turnstileToken:'password_reset_request'}),202);
    await complete(await deliver('password_reset'),changed);
    await checked(await call(`${prefix}/session-proof`,{oldPassword:password,newPassword:changed}),200);
    const evidence=await checked(await coordinator.fetch(observerRequest(),coordinatorEnv),200);
    await checked(await call(prefix),200);
    assert.equal(parseRealEmailAcceptanceEvidence(evidence,releaseSha,{workerVersionId:version,sourceReleaseSha:releaseSha}).status,'PASSED');
    const serialized=JSON.stringify(evidence);
    for(const secret of [password,changed,first.get('context'),first.get('token'),coordinatorEnv.AUTH_ACCEPTANCE_EMAIL_BASE])assert.ok(!serialized.includes(secret));
    await sql("UPDATE system.production_auth_acceptance_runs SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE id=$1",[run.acceptanceRunId]);
    await checked(await coordinator.fetch(observerRequest(),coordinatorEnv),410);
    await checked(await call(`${prefix}/initial-session`,{password:changed}),410);
    await sql("UPDATE system.production_auth_acceptance_runs SET status='in_progress' WHERE id=$1",[run.acceptanceRunId]);
    assert.equal((await checked(await call(prefix),200)).status,'expired');
  } finally {globalThis.fetch=previousFetch;}
});
