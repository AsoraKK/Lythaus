import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { uuidv7 } from '@lythaus/security';
import { lockLoginAccount, lockRefreshSession } from '../src/auth-account-transaction.ts';
import { applyTransactionalEmailLifecycle, lockDeliverableEmail } from '../../lythaus-jobs/src/transactional-email-runtime.ts';
import { claimRegistrationAddress, establishVerifiedCredential, findRecoveryUser, lockRecoveryAccount, recoveryPlan } from '../src/auth-recovery-policy.ts';

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
if (!connectionString) throw new Error('Local PostgreSQL auth tests require PLANETSCALE_PG17_TEST_DATABASE_URL');
const target = new URL(connectionString);
const disposableDatabase = target.pathname.startsWith('/lythaus_auth_test')
  || (process.env.GITHUB_ACTIONS === 'true' && target.pathname === '/postgres');
if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) || !disposableDatabase) {
  throw new Error('Auth race tests refuse non-local or non-disposable databases');
}
const oldHash = { algorithm: 'argon2id', version: 1, pepperVersion: 'v1', salt: 'fixture', digest: 'old' };
const newHash = { ...oldHash, digest: 'new' };

async function fixture(t) {
  const clients = await Promise.all([0, 1, 2].map(async () => {
    const client = new pg.Client({ connectionString, ssl: false });
    await client.connect();
    await client.query("SET statement_timeout = '5s'");
    return client;
  }));
  const [control, first, second] = clients;
  const userId = uuidv7();
  const familyId = uuidv7();
  const sessionId = uuidv7();
  const tokenHash = Buffer.from(randomUUID()).toString('base64');
  await control.query('INSERT INTO identity.users (id) VALUES ($1)', [userId]);
  await control.query(`INSERT INTO identity.contact_emails
    (user_id,email_ciphertext,email_lookup_hmac,encryption_key_version,source_provider,verified_at)
    VALUES($1,'synthetic',decode($2,'base64'),'v1','email',now())`, [userId,tokenHash]);
  await control.query(`INSERT INTO identity.email_credentials
    (user_id, email_ciphertext, email_lookup_hmac, encryption_key_version, hmac_key_version, password_hash, verified_at)
    VALUES ($1, 'synthetic', decode($2, 'base64'), 'v1', 'v1', $3::jsonb, now())`, [userId, tokenHash, JSON.stringify(oldHash)]);
  await control.query('INSERT INTO identity.refresh_token_families (id, user_id) VALUES ($1, $2)', [familyId, userId]);
  await control.query(`INSERT INTO identity.auth_sessions (id,user_id,refresh_family_id,refresh_token_hash,expires_at)
    VALUES ($1,$2,$3,decode($4,'base64'),now()+interval '1 day')`, [sessionId,userId,familyId,tokenHash]);
  t.after(async () => {
    try {
      await Promise.all([first, second].map(client => client.query('ROLLBACK')));
      await control.query('DELETE FROM identity.auth_sessions WHERE user_id = $1', [userId]);
      await control.query('DELETE FROM identity.refresh_token_families WHERE user_id = $1', [userId]);
      await control.query('DELETE FROM identity.email_credentials WHERE user_id = $1', [userId]);
      await control.query('DELETE FROM identity.contact_emails WHERE user_id = $1', [userId]);
      await control.query('DELETE FROM identity.users WHERE id = $1', [userId]);
    } finally {
      await Promise.all(clients.map(client => client.end()));
    }
  });
  async function reset(client) {
    await client.query('SELECT id FROM identity.users WHERE id = $1 FOR UPDATE', [userId]);
    await client.query('UPDATE identity.email_credentials SET password_hash=$2::jsonb WHERE user_id=$1', [userId, JSON.stringify(newHash)]);
    await client.query('UPDATE identity.auth_sessions SET revoked_at=now() WHERE user_id=$1', [userId]);
    await client.query('UPDATE identity.refresh_token_families SET revoked_at=now() WHERE user_id=$1', [userId]);
    await client.query('UPDATE identity.users SET token_version=token_version+1 WHERE id=$1', [userId]);
  }
  async function blocked(client) {
    const deadline = Date.now()+3000;
    while (Date.now()<deadline) {
      const result = await control.query('SELECT cardinality(pg_blocking_pids($1)) > 0 AS blocked', [client.processID]);
      if (result.rows[0].blocked) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.fail('Expected a real PostgreSQL row-lock wait');
  }
  return { control, first, second, userId, familyId, tokenHash, reset, blocked };
}

test('reset before login rejects a previously verified password snapshot', async t => {
  const f = await fixture(t);
  await f.first.query('BEGIN');
  await f.reset(f.first);
  await f.second.query('BEGIN');
  const login = lockLoginAccount(f.second, f.userId, oldHash);
  await f.blocked(f.second);
  await f.first.query('COMMIT');
  assert.equal(await login, undefined);
  assert.equal((await lockLoginAccount(f.second, f.userId, newHash)).tokenVersion, 2);
});

test('login serialization prevents reset from missing newly issued sessions', async t => {
  const f = await fixture(t);
  await f.first.query('BEGIN');
  assert.equal((await lockLoginAccount(f.first, f.userId, oldHash)).tokenVersion, 1);
  await f.second.query('BEGIN');
  const reset = f.reset(f.second);
  await f.blocked(f.second);
  await f.first.query(`INSERT INTO identity.auth_sessions(id,user_id,refresh_family_id,refresh_token_hash,expires_at)
    VALUES($1,$2,$3,decode($4,'base64'),now()+interval '1 day')`, [uuidv7(), f.userId, f.familyId, Buffer.from(randomUUID()).toString('base64')]);
  await f.first.query('COMMIT');
  await reset;
  await f.second.query('COMMIT');
  const count = await f.control.query('SELECT count(*)::int AS count FROM identity.auth_sessions WHERE user_id=$1 AND revoked_at IS NULL', [f.userId]);
  assert.equal(count.rows[0].count, 0);
});

test('refresh queued behind reset sees the revoked family, never a new token version', async t => {
  const f = await fixture(t);
  await f.first.query('BEGIN');
  await f.reset(f.first);
  await f.second.query('BEGIN');
  const refresh = lockRefreshSession(f.second, f.tokenHash);
  await f.blocked(f.second);
  await f.first.query('COMMIT');
  assert.equal((await refresh).tokenState, 'family_revoked');
});

test('restricted or unverified credentials cannot issue a session', async t => {
  const f = await fixture(t);
  await f.first.query('BEGIN');
  await f.first.query('UPDATE identity.email_credentials SET verified_at=NULL WHERE user_id=$1', [f.userId]);
  assert.equal(await lockLoginAccount(f.first, f.userId, oldHash), undefined);
  await f.first.query("UPDATE identity.users SET status='suspended' WHERE id=$1", [f.userId]);
  assert.equal(await lockLoginAccount(f.first, f.userId, oldHash), undefined);
  assert.equal(await lockLoginAccount(f.first, randomUUID(), oldHash), undefined);
  assert.equal(await lockRefreshSession(f.first, Buffer.from('unknown').toString('base64')), undefined);
});

test('real outbox lifecycle is monotonic and duplicate delivery preserves its first observation', async t => {
  const f = await fixture(t);
  const id = uuidv7();
  const messageId = `synthetic-${id}`;
  await f.first.query('BEGIN');
  await f.first.query(`INSERT INTO system.transactional_email_outbox
    (id,purpose,template_version,correlation_id,state,provider,provider_message_id,accepted_at)
    VALUES($1,'verification','v1','synthetic-fixture','provider_accepted','cloudflare-email',$2,now())`, [id, messageId]);
  assert.equal(await applyTransactionalEmailLifecycle(f.first, { eventType: 'message.delivered', messageId }), true);
  const before = (await f.first.query('SELECT state, delivered_at, updated_at FROM system.transactional_email_outbox WHERE id=$1', [id])).rows[0];
  for (const eventType of ['message.deferred', 'message.delivered']) {
    assert.equal(await applyTransactionalEmailLifecycle(f.first, { eventType, messageId }), true);
    assert.deepEqual((await f.first.query('SELECT state, delivered_at, updated_at FROM system.transactional_email_outbox WHERE id=$1', [id])).rows[0], before);
  }
  assert.equal(await applyTransactionalEmailLifecycle(f.first, { eventType: 'message.complained', messageId }), true);
  assert.equal(await applyTransactionalEmailLifecycle(f.first, { eventType: 'message.delivered', messageId }), true);
  assert.equal((await f.first.query('SELECT state FROM system.transactional_email_outbox WHERE id=$1', [id])).rows[0].state, 'complained');
  assert.equal(await applyTransactionalEmailLifecycle(f.first, { eventType: 'message.delivered', messageId: 'unknown-fixture' }), false);
});

test('legacy setup preserves the trusted user, requires the original contact, and revokes old sessions', async t => {
  const f = await fixture(t);
  await f.first.query('BEGIN');
  await f.first.query('DELETE FROM identity.email_credentials WHERE user_id=$1', [f.userId]);
  await f.first.query("UPDATE identity.users SET status='relink_required' WHERE id=$1", [f.userId]);
  assert.equal(await findRecoveryUser(f.first, f.tokenHash), f.userId);
  const account = await lockRecoveryAccount(f.first, f.userId);
  assert.equal(recoveryPlan(account), 'credential_setup');
  await establishVerifiedCredential(f.first, account, newHash);
  assert.equal((await lockLoginAccount(f.first, f.userId, newHash)).tokenVersion, 2);
  assert.equal((await lockRefreshSession(f.first, f.tokenHash)).tokenState, 'family_revoked');
  assert.equal((await lockRecoveryAccount(f.first, f.userId)).credential_lookup, account.contact_lookup);
  await assert.rejects(establishVerifiedCredential(f.first, await lockRecoveryAccount(f.first, f.userId), oldHash), /verification_token_invalid/);
});

test('mailbox setup replaces the pending pre-registrant password, never legitimizes it', async t => {
  const f = await fixture(t);
  await f.first.query('BEGIN');
  await f.first.query('UPDATE identity.email_credentials SET verified_at=NULL WHERE user_id=$1', [f.userId]);
  await f.first.query('UPDATE identity.contact_emails SET verified_at=NULL WHERE user_id=$1', [f.userId]);
  assert.equal(await lockLoginAccount(f.first, f.userId, oldHash), undefined);
  await establishVerifiedCredential(f.first, await lockRecoveryAccount(f.first, f.userId), newHash);
  assert.equal(await lockLoginAccount(f.first, f.userId, oldHash), undefined);
  assert.equal((await lockLoginAccount(f.first, f.userId, newHash)).tokenVersion, 2);
});

test('untrusted or conflicting linkage and restricted accounts cannot acquire a usable credential', async t => {
  const f = await fixture(t);
  await f.first.query('BEGIN');
  await f.first.query('DELETE FROM identity.email_credentials WHERE user_id=$1', [f.userId]);
  await f.first.query('UPDATE identity.contact_emails SET verified_at=NULL WHERE user_id=$1', [f.userId]);
  assert.equal(recoveryPlan(await lockRecoveryAccount(f.first, f.userId)), 'support_required');
  await f.first.query('UPDATE identity.contact_emails SET verified_at=now() WHERE user_id=$1', [f.userId]);
  await f.first.query("UPDATE identity.users SET status='suspended' WHERE id=$1", [f.userId]);
  await assert.rejects(establishVerifiedCredential(f.first, await lockRecoveryAccount(f.first, f.userId), newHash), /verification_token_invalid/);
  assert.equal((await f.first.query('SELECT count(*)::int AS n FROM identity.email_credentials WHERE user_id=$1', [f.userId])).rows[0].n, 0);
});

test('concurrent registration claims serialize and never overwrite a committed canonical address', async t => {
  const f = await fixture(t);
  const lookup = Buffer.from(randomUUID()).toString('base64');
  await f.first.query('BEGIN');
  assert.equal(await claimRegistrationAddress(f.first, lookup), true);
  await f.second.query('BEGIN');
  const contender = claimRegistrationAddress(f.second, lookup);
  await f.blocked(f.second);
  await f.first.query("UPDATE identity.contact_emails SET email_lookup_hmac=decode($2,'base64') WHERE user_id=$1", [f.userId, lookup]);
  await f.first.query('COMMIT');
  assert.equal(await contender, false);
  assert.equal((await f.control.query('SELECT password_hash FROM identity.email_credentials WHERE user_id=$1', [f.userId])).rows[0].password_hash.digest, 'old');
});

test('Jobs rechecks expiry, consumption and supersession using only authorized token metadata', async t => {
  const f = await fixture(t);
  await f.first.query('BEGIN');
  const challenge = uuidv7();
  await f.first.query(`INSERT INTO identity.email_verification_tokens(id,user_id,token_hash,expires_at)
    VALUES($1,$2,decode($3,'base64'),now()+interval '30 minutes')`, [challenge, f.userId, f.tokenHash]);
  const row = uuidv7();
  await f.first.query(`INSERT INTO system.transactional_email_outbox
    (id,user_id,purpose,challenge_id,template_version,correlation_id,state,delivery_envelope_ciphertext,delivery_envelope_encryption_key_version)
    VALUES($1,$2,'verification',$3,'v1','synthetic-fixture','processing','encrypted-fixture','v1')`, [row, f.userId, challenge]);
  await f.first.query('SET LOCAL ROLE lythaus_jobs');
  assert.equal(await lockDeliverableEmail(f.first, row, f.userId), true);
  await f.first.query('RESET ROLE');
  await f.first.query('UPDATE identity.email_verification_tokens SET superseded_at=now() WHERE id=$1', [challenge]);
  await f.first.query('SET LOCAL ROLE lythaus_jobs');
  assert.equal(await lockDeliverableEmail(f.first, row, f.userId), false);
  const cancelled = (await f.first.query('SELECT state,delivery_envelope_ciphertext FROM system.transactional_email_outbox WHERE id=$1',[row])).rows[0];
  assert.deepEqual(cancelled, { state: 'cancelled', delivery_envelope_ciphertext: null });
  await f.first.query('RESET ROLE');
  for (const update of ["consumed_at=now(), superseded_at=NULL", "consumed_at=NULL, expires_at=now()", "expires_at=now()-interval '1 day'"]) {
    await f.first.query(`UPDATE identity.email_verification_tokens SET ${update} WHERE id=$1`, [challenge]);
    await f.first.query("UPDATE system.transactional_email_outbox SET state='processing',terminal_at=NULL WHERE id=$1",[row]);
    assert.equal(await lockDeliverableEmail(f.first,row,f.userId),false);
  }
});

test('security notification has no challenge/bearer dependency and expires after its short delivery window', async t => {
  const f = await fixture(t);
  await f.first.query('BEGIN');
  const id = uuidv7();
  await f.first.query(`INSERT INTO system.transactional_email_outbox(id,user_id,purpose,template_version,correlation_id,state)
    VALUES($1,$2,'password_changed','v1','synthetic-fixture','processing')`,[id,f.userId]);
  assert.equal(await lockDeliverableEmail(f.first,id,f.userId),true);
  await f.first.query("UPDATE system.transactional_email_outbox SET created_at=now()-interval '2 days' WHERE id=$1",[id]);
  assert.equal(await lockDeliverableEmail(f.first,id,f.userId),false);
});
