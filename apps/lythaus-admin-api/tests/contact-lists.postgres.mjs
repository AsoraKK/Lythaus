import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import pg from 'pg';
import { decodeCursor } from '@lythaus/contracts';
import { encryptField, hmacLookup, uuidv7 } from '@lythaus/security';
import { listAdminUsers } from '../src/keeper-runtime.ts';
import { listWaitlist } from '../src/index.ts';

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
const target = new URL(connectionString ?? 'file:///missing');
if (!['localhost', '127.0.0.1'].includes(target.hostname)
  || !(target.pathname.startsWith('/lythaus_auth_test') || (process.env.GITHUB_ACTIONS === 'true' && target.pathname === '/postgres'))) {
  throw new Error('Contact list tests require disposable local PostgreSQL');
}

const ownerClient = new pg.Client({ connectionString, ssl: false });
const adminClient = new pg.Client({ connectionString, ssl: false });
let ownerConnected = false;
let adminConnected = false;
const sql = (text, values = []) => ownerClient.query(text, values);
const runAsAdmin = (_binding, text, values = []) => adminClient.query(text, values);
const actor = { userId: uuidv7(), role: 'administrator' };
const userIds = Array.from({ length: 3 }, () => uuidv7());
const emails = userIds.map((_, index) => `contact-list-${uuidv7()}-${index}@example.invalid`);
const createdAtValues = ['2026-10-03T12:00:00.000800Z', '2026-10-03T12:00:00.000500Z', '2026-10-03T12:00:00.000200Z'];
const key = Buffer.from(Array.from({ length: 32 }, (_, index) => index + 1)).toString('base64');
const hmacKey = `contact-list-test-${uuidv7()}`;
const tags = [uuidv7(), uuidv7(), uuidv7()];
const userMarker = `userlist-${uuidv7()}`;
const handles = tags.map(tag => `rec${tag.replaceAll('-', '').slice(-10)}`);
const source = `recovery-ci-${uuidv7()}`;
const consentVersion = `synthetic-test-${uuidv7()}`;
const userCorrelations = [];
const waitlistCorrelations = [];
const env = { DB_ADMIN_FRESH: {}, PII_ENCRYPTION_KEY_V1: key };

async function request(path) {
  return new Request(`https://admin.lythaus.co${path}`);
}

async function readBody(response) {
  assert.equal(response.status, 200);
  return response.json();
}

before(async () => {
  await ownerClient.connect();
  ownerConnected = true;
  await adminClient.connect();
  adminConnected = true;
  await adminClient.query("SET statement_timeout = '5s'");
  await adminClient.query('SET ROLE lythaus_admin');

  for (let index = 0; index < userIds.length; index += 1) {
    await sql('INSERT INTO identity.users (id, display_name, created_at) VALUES ($1, $2, $3)', [userIds[index], `Recovery Contact ${userMarker} ${tags[index]}`, createdAtValues[index]]);
    await sql('INSERT INTO identity.handles (user_id, handle, handle_normalized) VALUES ($1, $2, $2)', [userIds[index], handles[index]]);
  }
  await sql('INSERT INTO identity.user_entitlements (user_id, subscription_tier) VALUES ($1, $2)', [userIds[0], 'premium']);

  const statuses = ['waiting', 'invited', 'waiting'];
  for (let index = 0; index < emails.length; index += 1) {
    const encrypted = await encryptField(emails[index], key, 'v1');
    await sql(`INSERT INTO marketing.waitlist_signups
      (id, email_lookup_hmac, email_ciphertext, encryption_key_version, status, source, consent_version, created_at)
      VALUES ($1, decode($2, 'base64'), convert_to($3, 'utf8'), 'v1', $4, $5, $6, $7)`,
    [uuidv7(), hmacLookup(emails[index], hmacKey), encrypted.ciphertext, statuses[index], source, consentVersion, createdAtValues[index]]);
  }
});

after(async () => {
  if (ownerConnected) {
    await sql("DELETE FROM system.audit_events WHERE correlation_id = ANY($1::text[])", [[...userCorrelations, ...waitlistCorrelations]]);
    await sql('DELETE FROM marketing.waitlist_signups WHERE source = $1 AND consent_version = $2', [source, consentVersion]);
    await sql('DELETE FROM identity.handles WHERE user_id = ANY($1::uuid[])', [userIds]);
    await sql('DELETE FROM identity.users WHERE id = ANY($1::uuid[])', [userIds]);
  }
  if (adminConnected) await adminClient.end();
  if (ownerConnected) await ownerClient.end();
});

test('real lythaus_admin grants support private-minimal registered-user pages and exact account-id search', async () => {
  await assert.rejects(adminClient.query('SELECT email_ciphertext FROM identity.email_credentials LIMIT 1'), error => error.code === '42501');

  const correlation1 = `contact-users-${uuidv7()}`;
  userCorrelations.push(correlation1);
  const firstResponse = await listAdminUsers(await request(`/api/admin/users?limit=2&q=${encodeURIComponent(userMarker)}`), env, actor, correlation1, runAsAdmin);
  const first = await readBody(firstResponse);
  assert.equal(first.items.length, 2);
  assert.ok(first.nextCursor);
  assert.equal(decodeCursor(first.nextCursor).timestamp, '2026-10-03T12:00:00.000500Z');
  assert.ok(first.items.every(item => !Object.hasOwn(item, 'email') && !Object.hasOwn(item, 'verificationState')));
  assert.ok(!JSON.stringify(first).includes('@example.invalid'));

  const correlation2 = `contact-users-${uuidv7()}`;
  userCorrelations.push(correlation2);
  const secondResponse = await listAdminUsers(await request(`/api/admin/users?limit=2&cursor=${encodeURIComponent(first.nextCursor)}`), env, actor, correlation2, runAsAdmin);
  const second = await readBody(secondResponse);
  assert.equal(second.items.length, 1);
  assert.equal(second.nextCursor, null);
  assert.deepEqual([...first.items, ...second.items].map(item => item.id), userIds);

  const exactCorrelation = `contact-users-${uuidv7()}`;
  userCorrelations.push(exactCorrelation);
  const exact = await readBody(await listAdminUsers(await request(`/api/admin/users?q=${encodeURIComponent(userIds[1])}`), env, actor, exactCorrelation, runAsAdmin));
  assert.deepEqual(exact.items.map(item => item.id), [userIds[1]]);
  assert.equal(exact.items[0].subscriptionTier, 'free');

  const nameCorrelation = `contact-users-${uuidv7()}`;
  userCorrelations.push(nameCorrelation);
  const byName = await readBody(await listAdminUsers(await request(`/api/admin/users?q=${encodeURIComponent(tags[2].toLowerCase())}`), env, actor, nameCorrelation, runAsAdmin));
  assert.deepEqual(byName.items.map(item => item.id), [userIds[2]]);
  assert.equal(first.items.find(item => item.id === userIds[0])?.subscriptionTier, 'premium');
});

test('real lythaus_admin grants support bounded exact waitlist search and source-backed keyset pages', async () => {
  await assert.rejects(adminClient.query('SELECT email_lookup_hmac FROM marketing.waitlist_signups LIMIT 1'), error => error.code === '42501');

  const pageOneCorrelation = `contact-waitlist-${uuidv7()}`;
  waitlistCorrelations.push(pageOneCorrelation);
  const pageOne = await readBody(await listWaitlist(await request('/api/admin/waitlist?limit=2'), env, actor, pageOneCorrelation, runAsAdmin));
  assert.equal(pageOne.items.length, 2);
  assert.ok(pageOne.nextCursor);
  assert.equal(decodeCursor(pageOne.nextCursor).timestamp, '2026-10-03T12:00:00.000500Z');
  assert.equal(pageOne.summary.totalWaiting >= 2, true);

  const pageTwoCorrelation = `contact-waitlist-${uuidv7()}`;
  waitlistCorrelations.push(pageTwoCorrelation);
  const pageTwo = await readBody(await listWaitlist(await request(`/api/admin/waitlist?limit=2&cursor=${encodeURIComponent(pageOne.nextCursor)}`), env, actor, pageTwoCorrelation, runAsAdmin));
  assert.equal(pageTwo.items.length, 1);
  assert.equal(pageTwo.nextCursor, null);
  assert.equal(new Set([...pageOne.items, ...pageTwo.items].map(item => item.email)).size, 3);

  const searchCorrelation = `contact-waitlist-${uuidv7()}`;
  waitlistCorrelations.push(searchCorrelation);
  const exact = await readBody(await listWaitlist(await request(`/api/admin/waitlist?q=${encodeURIComponent(emails[1])}&status=invited&source=${encodeURIComponent(source)}`), env, actor, searchCorrelation, runAsAdmin));
  assert.deepEqual(exact.items.map(item => item.email), [emails[1]]);
  assert.equal(exact.nextCursor, null);
  assert.ok(exact.items.every(item => !Object.hasOwn(item, 'invitedAt') && !Object.hasOwn(item, 'convertedAt') && !Object.hasOwn(item, 'unsubscribedAt')));
  assert.equal(JSON.stringify(exact).includes('email_lookup_hmac'), false);
});
