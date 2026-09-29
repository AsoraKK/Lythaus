import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import * as database from '@lythaus/db';
import { decryptField, hmacLookup, uuidv7 } from '@lythaus/security';

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
const target = new URL(connectionString ?? 'file:///missing');
if (!['localhost', '127.0.0.1'].includes(target.hostname)
  || !(target.pathname.startsWith('/lythaus_auth_test') || (process.env.GITHUB_ACTIONS === 'true' && target.pathname === '/postgres'))) throw new Error('Admin mail tests require disposable local PostgreSQL');
async function clientFor(work, role) {
  const client = new pg.Client({ connectionString, ssl: false });
  await client.connect();
  try {
    await client.query("SET statement_timeout='5s'");
    if (role) await client.query('SET ROLE lythaus_runtime');
    return await work(client);
  } finally { await client.end(); }
}
const sql = (text, values) => clientFor(client => client.query(text, values));
mock.module('@lythaus/db', { namedExports: { ...database,
  transaction: (_binding, work) => clientFor(async client => {
    await client.query('BEGIN');
    try { const result = await work(client); await client.query('COMMIT'); return result; }
    catch(error) { await client.query('ROLLBACK'); throw error; }
  }, true),
} });
const { inviteAdminUser, resendAdminVerification } = await import('../src/keeper-runtime.ts');
const { handleEmailEnvelope } = await import('../../lythaus-public-api/src/email-envelope-entrypoint.ts');
const env = {
  DB_APP_FRESH: {}, PII_ENCRYPTION_KEY_V1: randomBytes(32).toString('base64'),
  PII_HMAC_KEY_V1: randomBytes(32).toString('base64'), AUTH_PASSWORD_PEPPER_V1: randomBytes(32).toString('base64'),
};
const publicEnv = { ...env, WORKER_VERSION: { id: uuidv7() }, TRANSACTIONAL_EMAIL_ENCRYPTION_KEY_V1: randomBytes(32).toString('base64') };
const binding = { fetch: (url, init) => handleEmailEnvelope(new Request(url, init), publicEnv) };
const request = body => new Request('https://admin.lythaus.co/api/admin/users', { method: 'POST', body: JSON.stringify(body) });

test('admin invitation/resend commit scoped delivery atomically; dependency failure leaves no pending identity', async () => {
  const actor = { userId: uuidv7(), role: 'administrator' };
  await sql('INSERT INTO identity.users(id) VALUES($1)', [actor.userId]);
  await sql("INSERT INTO identity.admin_memberships(user_id,access_subject_hmac,role,active) VALUES($1,decode($2,'base64'),'administrator',true)", [actor.userId, randomBytes(32).toString('base64')]);
  const email = `synthetic-admin-${uuidv7()}@example.invalid`;
  const input = { email, reasonCode: 'SUPPORT_REQUEST', confirmation: 'INVITE ACCOUNT' };
  const lookup = hmacLookup(email, env.PII_HMAC_KEY_V1);
  await assert.rejects(inviteAdminUser(request(input), env, actor, uuidv7()), /auth_email_dispatch_unavailable/);
  assert.equal((await sql("SELECT count(*)::int AS n FROM identity.contact_emails WHERE email_lookup_hmac=decode($1,'base64')", [lookup])).rows[0].n, 0);
  const adminEnv = { AUTH_EMAIL_ENVELOPE: binding };
  const response = await inviteAdminUser(request(input), adminEnv, actor, uuidv7());
  assert.equal(response.status, 201);
  const { userId } = await response.json();
  const first = (await sql('SELECT delivery_envelope_ciphertext,delivery_envelope_encryption_key_version,secret_ciphertext,challenge_id FROM system.transactional_email_outbox WHERE user_id=$1', [userId])).rows[0];
  assert.equal(first.secret_ciphertext, null);
  const opened = JSON.parse(await decryptField({ ciphertext: first.delivery_envelope_ciphertext, encryptionKeyVersion: first.delivery_envelope_encryption_key_version }, publicEnv.TRANSACTIONAL_EMAIL_ENCRYPTION_KEY_V1));
  assert.equal(opened.to, email);
  assert.match(opened.token, /^[0-9a-f]{64}$/);
  const resend = { reasonCode: 'SUPPORT_REQUEST', confirmation: 'RESEND VERIFICATION' };
  await assert.rejects(resendAdminVerification(request(resend), env, actor, userId, uuidv7()), /auth_email_dispatch_unavailable/);
  assert.equal((await sql('SELECT superseded_at FROM identity.email_verification_tokens WHERE id=$1', [first.challenge_id])).rows[0].superseded_at, null);
  assert.equal((await (await resendAdminVerification(request(resend), adminEnv, actor, userId, uuidv7())).json()).deliveryState, 'cooldown');
  await sql("UPDATE identity.email_verification_tokens SET created_at=now()-interval '31 seconds' WHERE user_id=$1", [userId]);
  assert.equal((await resendAdminVerification(request(resend), adminEnv, actor, userId, uuidv7())).status, 200);
  assert.ok((await sql('SELECT superseded_at FROM identity.email_verification_tokens WHERE id=$1', [first.challenge_id])).rows[0].superseded_at);
  assert.equal((await sql('SELECT count(*)::int AS n FROM system.transactional_email_outbox WHERE user_id=$1', [userId])).rows[0].n, 2);
  await sql("UPDATE identity.users SET status='suspended' WHERE id=$1", [userId]);
  await assert.rejects(resendAdminVerification(request(resend), adminEnv, actor, userId, uuidv7()), /invalid_account_status/);
  await assert.rejects(inviteAdminUser(request(input), env, { ...actor, role: 'user' }, uuidv7()), /admin_role_required/);
  await sql('UPDATE identity.admin_memberships SET active=false WHERE user_id=$1', [actor.userId]);
  await assert.rejects(inviteAdminUser(request({ ...input, email: `new-${email}` }), adminEnv, actor, uuidv7()), /admin_role_required/);
});
