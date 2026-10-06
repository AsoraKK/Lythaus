import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import test, { after, before, mock } from 'node:test';
import pg from 'pg';
import { encryptField, hmacLookup, uuidv7 } from '@lythaus/security';

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
const target = new URL(connectionString ?? 'file:///missing');
const enabled = ['localhost', '127.0.0.1'].includes(target.hostname)
  && (target.pathname.startsWith('/lythaus_auth_test') || (process.env.GITHUB_ACTIONS === 'true' && target.pathname === '/postgres'));
const skipIfUnavailable = enabled ? false : 'Requires disposable local PostgreSQL 17 via PLANETSCALE_PG17_TEST_DATABASE_URL';
const state = { assertionSubjects: new Map(), connectionString: connectionString ?? '' };

async function clientFor(work, role = 'lythaus_admin', transactional = false) {
  const client = new pg.Client({ connectionString: state.connectionString, ssl: false });
  await client.connect();
  try {
    await client.query("SET statement_timeout = '5s'");
    await client.query(`SET ROLE ${role}`);
    if (transactional) await client.query('BEGIN');
    try {
      const result = await work(client);
      if (transactional) await client.query('COMMIT');
      return result;
    } catch (error) {
      if (transactional) await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
  } finally { await client.end(); }
}

const mockDatabase = {
  databaseExpectationsFromEnv: () => ({}), databaseReadinessResponse: () => ({}),
  buildSchemaFingerprint: () => '', classifyDatabaseIdentityError: () => 'unknown', classifyRole: () => 'unknown',
  createSupportFeedbackRuntime: async () => null,
  handleSupportFeedbackRequest: async () => new Response(null, { status: 404 }),
  isSupportFeedbackPath: () => false,
  supportAuthentication: () => ({ member: async () => { throw new Error('not reached'); }, owner: async () => { throw new Error('not reached'); } }),
  enqueueTransactionalEmailIntent: async () => undefined, lockAuthDelivery: async () => undefined,
  inspectDatabaseIdentity: async () => ({ readiness: 'pass', budgetLedgerApplied: true }),
  isDatabaseIdentityReady: () => true, listUserActivity: async () => ({ items: [], nextCursor: null }),
  recordUserActivity: async () => undefined, refreshReputationProfile: async () => undefined,
  recordReputationSignal: async () => undefined, reserveBudget: async () => undefined,
  reserveBudgetInTransaction: async () => undefined, settleBudgetReservation: async () => undefined,
  releaseBudgetReservation: async () => undefined, reconcileBudgetReservation: async () => undefined,
  expireBudgetReservations: async () => undefined, purgeAlphaMedia: async () => undefined,
  scheduleAlphaPurge: async () => undefined,
  query: (binding, sql, values = []) => clientFor(client => client.query(sql, values), binding.role ?? 'lythaus_admin'),
  transaction: (binding, work) => clientFor(client => work({ query: (sql, values = []) => client.query(sql, values) }), binding.role ?? 'lythaus_admin', true),
};
mock.module('@lythaus/db', { cache: true, namedExports: mockDatabase });
mock.module('@lythaus/observability', { cache: true, namedExports: {
  assertExpectedHostname: () => undefined,
  correlationId: () => uuidv7(),
  logEvent: () => undefined,
  json: (body, options = {}) => new Response(JSON.stringify(body), { status: options.status, headers: { 'content-type': 'application/json', ...(options.headers ?? {}) } }),
} });
mock.module(new URL('../src/admin-access-runtime-policy.ts', import.meta.url), { cache: true, namedExports: {
  requireActiveAdminMembership: membership => ({ userId: membership.user_id, role: membership.role }),
  verifiedAccessSubject: async request => {
    const assertion = request.headers.get('cf-access-jwt-assertion');
    const subject = state.assertionSubjects.get(assertion);
    if (!subject) throw new Error(assertion === 'expired' ? 'access_assertion_invalid' : 'access_assertion_invalid');
    return subject;
  },
} });

const { hmacLookup: expectedHmac } = await import('@lythaus/security');
const { default: worker } = await import('../src/index.ts');
const { handleEmailEnvelope } = await import('../../lythaus-public-api/src/email-envelope-entrypoint.ts');

const ids = {
  owner: uuidv7(), administrator: uuidv7(), member: uuidv7(),
  accounts: Array.from({ length: 51 }, () => uuidv7()),
  waitlist: Array.from({ length: 51 }, () => uuidv7()),
};
const emails = ids.waitlist.map((_, index) => `synthetic-waitlist-${String(index).padStart(3, '0')}@example.invalid`);
const accountEmail = emails[0];
const actorHmacKey = randomBytes(32).toString('base64');
const emailHmacKey = randomBytes(32).toString('base64');
const piiEncryptionKey = randomBytes(32).toString('base64');
const version = uuidv7();
const actors = [
  { id: ids.owner, assertion: 'owner', subject: 'synthetic-owner-subject', role: 'owner' },
  { id: ids.administrator, assertion: 'administrator', subject: 'synthetic-administrator-subject', role: 'administrator' },
];

for (const actor of actors) state.assertionSubjects.set(actor.assertion, actor.subject);
state.assertionSubjects.set('member', 'synthetic-member-subject');
const runTransaction = (binding, work) => clientFor(client => work({ query: (sql, values = []) => client.query(sql, values) }), binding.role ?? 'lythaus_runtime', true);
const publicEnv = {
  DB_APP_FRESH: { connectionString: connectionString ?? '', role: 'lythaus_runtime' },
  PII_HMAC_KEY_V1: emailHmacKey,
  WORKER_VERSION: { id: version },
};

function env() {
  return {
    ACCESS_SUBJECT_HMAC_KEY: actorHmacKey,
    CORS_ALLOWED_ORIGINS: 'https://admin.lythaus.co',
    DB_ADMIN_FRESH: { connectionString: connectionString ?? '', role: 'lythaus_admin' },
    DB_PRIVACY_FRESH: { connectionString: connectionString ?? '', role: 'lythaus_privacy' },
    EXPECTED_HOSTNAMES: 'admin.lythaus.co',
    PII_ENCRYPTION_KEY_V1: piiEncryptionKey,
    PII_HMAC_KEY_V1: emailHmacKey,
    WORKER_VERSION: { id: version },
    AUTH_EMAIL_ENVELOPE: {
      fetch: (url, init) => handleEmailEnvelope(new Request(url, init), publicEnv, (binding, work) => runTransaction({ ...binding, role: 'lythaus_runtime' }, work)),
    },
  };
}

function request(path, { assertion = 'owner', method = 'GET', body, headers = {} } = {}) {
  return new Request(`https://admin.lythaus.co${path}`, {
    method,
    headers: {
      'cf-access-jwt-assertion': assertion,
      ...(body !== undefined ? { origin: 'https://admin.lythaus.co', 'content-type': 'application/json' } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function privileged(sql, values = []) {
  return clientFor(client => client.query(sql, values), 'postgres');
}

before(async () => {
  if (!enabled) return;
  await privileged('SELECT 1');
  for (const actor of actors) {
    await privileged('INSERT INTO identity.users (id, display_name) VALUES ($1, $2)', [actor.id, `Synthetic ${actor.role}`]);
    const subjectHmac = expectedHmac(actor.subject, actorHmacKey);
    await privileged('INSERT INTO identity.admin_memberships (user_id, access_subject_hmac, role, active) VALUES ($1, decode($2, \'base64\'), $3, true)', [actor.id, subjectHmac, actor.role]);
  }
  await privileged('INSERT INTO identity.users (id, display_name) VALUES ($1, $2)', [ids.member, 'Fixture without admin membership']);
  for (let index = 0; index < ids.accounts.length; index += 1) {
    const id = ids.accounts[index];
    const created = new Date(Date.now() - (ids.accounts.length - index) * 60_000).toISOString();
    await privileged('INSERT INTO identity.users (id, display_name, status, created_at, updated_at) VALUES ($1, $2, \'active\', $3, $3)', [id, `Synthetic member ${String(index).padStart(3, '0')}`, created]);
    await privileged('INSERT INTO identity.handles (user_id, handle, handle_normalized) VALUES ($1, $2, lower($2))', [id, `synthetic_${String(index).padStart(3, '0')}`]);
  }
  const linkedCiphertext = await encryptField(accountEmail, piiEncryptionKey, 'v1');
  await privileged(`INSERT INTO identity.contact_emails (user_id, email_ciphertext, email_lookup_hmac, encryption_key_version, source_provider, verified_at)
    VALUES ($1, convert_to($2, 'utf8'), decode($3, 'base64'), 'v1', 'email', now())`, [ids.accounts[0], linkedCiphertext.ciphertext, expectedHmac(accountEmail, emailHmacKey)]);
  await privileged(`INSERT INTO identity.email_credentials (user_id, email_ciphertext, email_lookup_hmac, encryption_key_version, hmac_key_version, password_hash, verified_at)
    VALUES ($1, convert_to($2, 'utf8'), decode($3, 'base64'), 'v1', 'v1', '{"algorithm":"synthetic"}'::jsonb, now())`,
  [ids.accounts[0], linkedCiphertext.ciphertext, expectedHmac(accountEmail, emailHmacKey)]);
  for (let index = 0; index < ids.waitlist.length; index += 1) {
    const email = emails[index];
    const encrypted = await encryptField(email, piiEncryptionKey, 'v1');
    const created = new Date(Date.now() - (ids.waitlist.length - index) * 60_000).toISOString();
    const status = ['waiting', 'invited', 'converted', 'unsubscribed'][index % 4];
    await privileged(`INSERT INTO marketing.waitlist_signups
      (id, email_lookup_hmac, email_ciphertext, encryption_key_version, status, source, consent_version, created_at)
      VALUES ($1, decode($2, 'base64'), convert_to($3, 'utf8'), 'v1', $4, $5, 'synthetic-v1', $6)`,
    [ids.waitlist[index], expectedHmac(email, emailHmacKey), encrypted.ciphertext, status, index % 2 ? 'keeper' : 'lythaus.co', created]);
  }
});

after(async () => {
  if (!enabled) return;
  const allUserIds = [ids.owner, ids.administrator, ids.member, ...ids.accounts];
  const subjectHashes = actors.map(actor => createHash('sha256').update(`admin:${actor.id}`).digest('hex'));
  await privileged(`DELETE FROM system.audit_events WHERE actor_id = ANY($1::uuid[])
    OR (target_type = 'user' AND target_id = ANY($1::uuid[]))`, [allUserIds]);
  await privileged('DELETE FROM system.rate_limit_windows WHERE scope = \'admin-api\' AND subject_hash = ANY($1::text[])', [subjectHashes]);
  await privileged('DELETE FROM marketing.waitlist_signups WHERE id = ANY($1::uuid[])', [ids.waitlist]);
  for (const table of ['identity.contact_emails', 'identity.email_credentials', 'identity.account_events', 'identity.auth_sessions', 'identity.refresh_token_families', 'identity.handles', 'identity.user_entitlements', 'identity.admin_memberships']) {
    await privileged(`DELETE FROM ${table} WHERE user_id = ANY($1::uuid[])`, [allUserIds]);
  }
  await privileged('DELETE FROM identity.users WHERE id = ANY($1::uuid[])', [allUserIds]);
});

test('native Worker routes read real synthetic waitlist/account rows under current admin grants', { skip: skipIfUnavailable }, async () => {
  const ownerStored = await privileged(`SELECT encode(access_subject_hmac, 'base64') AS stored FROM identity.admin_memberships WHERE user_id = $1`, [ids.owner]);
  assert.equal(ownerStored.rows[0]?.stored, expectedHmac('synthetic-owner-subject', actorHmacKey));
  const ownerRole = await clientFor(client => client.query(`SELECT user_id, role FROM identity.admin_memberships
    WHERE access_subject_hmac = decode($1, 'base64') AND active = true`, [expectedHmac('synthetic-owner-subject', actorHmacKey)]), 'lythaus_admin');
  assert.equal(ownerRole.rowCount, 1);
  const firstWaitlistResponse = await worker.fetch(request('/api/admin/waitlist?limit=50'), env());
  assert.equal(firstWaitlistResponse.status, 200, await firstWaitlistResponse.clone().text());
  assert.equal(firstWaitlistResponse.headers.get('cache-control'), 'private, no-store');
  const firstWaitlistPage = await firstWaitlistResponse.json();
  assert.equal(firstWaitlistPage.items.length, 50);
  assert.equal(firstWaitlistPage.totalMatching, 51);
  assert.ok(firstWaitlistPage.nextCursor);
  assert.ok(firstWaitlistPage.items.every(item => ['waiting', 'invited', 'converted', 'unsubscribed'].includes(item.status)));
  assert.ok(firstWaitlistPage.items.every(item => !('linkedAccount' in item)));
  const secondWaitlistResponse = await worker.fetch(request(`/api/admin/waitlist?limit=50&cursor=${encodeURIComponent(firstWaitlistPage.nextCursor)}`), env());
  const secondWaitlistPage = await secondWaitlistResponse.json();
  assert.equal(secondWaitlistResponse.status, 200);
  assert.equal(secondWaitlistPage.items.length, 1);
  assert.equal(secondWaitlistPage.totalMatching, 51);
  assert.equal(secondWaitlistPage.nextCursor, null);

  const searchedWaitlist = await worker.fetch(request('/api/admin/waitlist/search', {
    method: 'POST', body: { q: accountEmail.toUpperCase(), source: 'lythaus.co', status: 'waiting', limit: 50 },
  }), env());
  assert.equal(searchedWaitlist.status, 200);
  const searchedWaitlistBody = await searchedWaitlist.json();
  assert.equal(searchedWaitlistBody.totalMatching, 1);
  assert.equal(searchedWaitlistBody.items[0].id, ids.waitlist[0]);
  assert.equal(searchedWaitlistBody.items[0].email, accountEmail);
  const noWaitlistMatch = await worker.fetch(request('/api/admin/waitlist/search', {
    method: 'POST', body: { q: 'no-synthetic-match@example.invalid', limit: 50 },
  }), env());
  assert.equal(noWaitlistMatch.status, 200);
  assert.equal((await noWaitlistMatch.json()).totalMatching, 0);

  const explicitLink = await worker.fetch(request('/api/admin/account-support/lookup', {
    method: 'POST', body: { email: accountEmail, reasonCode: 'WAITLIST_ACCOUNT_MATCH' },
  }), env());
  assert.equal(explicitLink.status, 200);
  const linkBody = await explicitLink.json();
  assert.equal(linkBody.state, 'found');
  assert.equal(linkBody.account.id, ids.accounts[0]);

  const ownerSupportAccess = await worker.fetch(request('/api/admin/account-support/access', { method: 'GET' }), env());
  assert.equal(ownerSupportAccess.status, 200);
  assert.deepEqual(await ownerSupportAccess.json(), { available: true, profileCorrectionsAvailable: false });
  const profileBefore = (await privileged('SELECT display_name, updated_at FROM identity.users WHERE id = $1', [ids.accounts[0]])).rows;
  const gatedProfile = await worker.fetch(request(`/api/admin/account-support/users/${ids.accounts[0]}/profile`, {
    method: 'PATCH', body: { displayName: 'Must not be written', expectedUserUpdatedAt: new Date().toISOString(),
      expectedProfileUpdatedAt: null, reasonCode: 'SUPPORT_REQUEST', confirmation: 'UPDATE MEMBER PROFILE' },
  }), env());
  assert.equal(gatedProfile.status, 503);
  assert.equal((await gatedProfile.json()).error, 'account_support_unavailable');
  assert.deepEqual((await privileged('SELECT display_name, updated_at FROM identity.users WHERE id = $1', [ids.accounts[0]])).rows, profileBefore);

  const firstAccountsResponse = await worker.fetch(request('/api/admin/users?limit=50&q=synthetic%20member'), env());
  assert.equal(firstAccountsResponse.status, 200);
  assert.equal(firstAccountsResponse.headers.get('cache-control'), 'private, no-store');
  const firstAccountsPage = await firstAccountsResponse.json();
  assert.equal(firstAccountsPage.items.length, 50);
  assert.equal(firstAccountsPage.totalMatching, 51);
  assert.ok(firstAccountsPage.nextCursor);
  assert.ok(firstAccountsPage.items.every(item => !('email' in item) && !('passwordHash' in item) && !('token' in item)));
  const secondAccountsResponse = await worker.fetch(request(`/api/admin/users?limit=50&q=synthetic%20member&cursor=${encodeURIComponent(firstAccountsPage.nextCursor)}`), env());
  const secondAccountsPage = await secondAccountsResponse.json();
  assert.equal(secondAccountsResponse.status, 200);
  assert.equal(secondAccountsPage.items.length, 1);
  assert.equal(secondAccountsPage.totalMatching, 51);
  assert.equal(secondAccountsPage.nextCursor, null);
  const allIds = [...firstAccountsPage.items, ...secondAccountsPage.items].map(item => item.id);
  assert.equal(new Set(allIds).size, 51);
  const noAccountMatch = await worker.fetch(request('/api/admin/users?q=no-synthetic-account', { assertion: 'owner' }), env());
  assert.equal(noAccountMatch.status, 200);
  assert.equal((await noAccountMatch.json()).totalMatching, 0);

  const exactAccountRequest = request('/api/admin/users/search-by-email', {
    method: 'POST', body: { q: accountEmail.toUpperCase(), limit: 50 },
  });
  assert.equal(new URL(exactAccountRequest.url).searchParams.has('q'), false);
  const exactAccountResponse = await worker.fetch(exactAccountRequest, env());
  assert.equal(exactAccountResponse.status, 200);
  const exactAccountPage = await exactAccountResponse.json();
  assert.equal(exactAccountPage.totalMatching, 1);
  assert.equal(exactAccountPage.items[0].id, ids.accounts[0]);
  assert.equal(exactAccountPage.items[0].verificationState, 'verified');
  assert.equal(JSON.stringify(exactAccountPage).includes(accountEmail), false);

  const adminExactLookup = await worker.fetch(request('/api/admin/users/search-by-email', {
    assertion: 'administrator', method: 'POST', body: { q: accountEmail },
  }), env());
  assert.equal(adminExactLookup.status, 403);
  const memberList = await worker.fetch(request('/api/admin/users?limit=50', { assertion: 'member' }), env());
  assert.equal(memberList.status, 403);
  const invalidAccess = await worker.fetch(request('/api/admin/users?limit=50', { assertion: 'expired' }), env());
  assert.equal(invalidAccess.status, 401);

  await privileged('UPDATE identity.admin_memberships SET active = false WHERE user_id = $1', [ids.owner]);
  const staleMembership = await worker.fetch(request('/api/admin/waitlist?limit=50', { assertion: 'owner' }), env());
  assert.equal(staleMembership.status, 403);
  await privileged('UPDATE identity.admin_memberships SET active = true WHERE user_id = $1', [ids.owner]);
});
