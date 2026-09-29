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
      assert.ok(['lythaus_runtime','lythaus_jobs'].includes(role));
      await client.query(`SET ROLE ${role}`);
    }
    return await work(client);
  }
  finally { await client.end(); }
}
const sql = (text, values) => withClient(client => client.query(text, values));
const databaseErrors = [];
mock.module('@lythaus/db', { namedExports: { ...database,
  query: (binding, text, values) => withClient(client => client.query(text, values), binding.role),
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
after(() => { globalThis.fetch = realFetch; });
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith('https://api.pwnedpasswords.com/range/')) return Response.json({}, { status: 503 });
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
  const unavailable = await request('email', { mode:'register', email, password, turnstileToken:'account_signup' });
  assert.equal((await expectStatus(unavailable,503)).error,'password_screening_unavailable');
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (url, init) => String(url).startsWith('https://api.pwnedpasswords.com/range/')
    ? Promise.resolve(new Response(`${'0'.repeat(35)}:0`)) : previousFetch(url,init);
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
