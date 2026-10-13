import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { exportJWK, exportPKCS8, generateKeyPair, SignJWT } from 'jose';
import { hmacLookup, signAccessToken, uuidv7 } from '@lythaus/security';
import { createPostgresIsolationDatabase } from './account-role-isolation-pg17-fixture.mjs';

const postgresMode = new URL(import.meta.url).searchParams.get('database') === 'postgres17';
const runtimeLabel = postgresMode ? 'native Workerd with real PG17' : 'native Workerd with synthetic SQL';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(new URL('../../../node_modules/wrangler/package.json', import.meta.url));
const { build } = require('esbuild');
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');

const databaseStub = `
import { env } from 'cloudflare:workers';
export * from './packages/db/src/index.ts';
async function sql(input) {
  const response = await env.AUTHZ_DATABASE.fetch('https://fixture.invalid/sql', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}
export async function query(binding, text, values = []) {
  return sql({ action: 'query', role: binding.role, text, values });
}
export async function transaction(binding, work) {
  const { transactionId } = await sql({ action: 'begin', role: binding.role });
  try {
    const result = await work({ query: (text, values = []) => sql({ action: 'query', transactionId, text, values }) });
    await sql({ action: 'commit', transactionId });
    return result;
  } catch (error) {
    await sql({ action: 'rollback', transactionId });
    throw error;
  }
}
`;

async function buildWorker(entry) {
  const result = await build({
    absWorkingDir: root,
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    external: ['cloudflare:workers'],
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire('file:///account-role-isolation.workerd.mjs');" },
    plugins: [{ name: 'synthetic-worker-database', setup(builder) {
      builder.onResolve({ filter: /^@lythaus\/db$/ }, () => ({ path: 'database', namespace: 'synthetic-database' }));
      builder.onLoad({ filter: /.*/, namespace: 'synthetic-database' }, () => ({ resolveDir: root, contents: databaseStub }));
    } }],
    stdin: { resolveDir: root, contents: `import api from './${entry}'; export default api;` },
  });
  return result.outputFiles[0].text;
}

function result(rows = [], rowCount = rows.length) {
  return { rows, rowCount };
}

function privateProfile(id, displayName, handle, bio, publicVisibility) {
  return {
    id,
    display_name: displayName,
    handle,
    bio,
    avatar_object_id: null,
    trust_passport_visibility: 'private',
    reputation_level: 1,
    reputation_status: 'active',
    reputation_policy_version: 'synthetic-policy-v1',
    subscription_tier: 'free',
    accountability_identity_declared: false,
    moderation_state: 'allowed',
    public_visibility: publicVisibility,
    presentation_preferences: { leftHandedMode: false, horizontalSwipeEnabled: true, version: 1 },
  };
}

function activityEvent(id, title) {
  return {
    id: uuidv7(),
    userId: id,
    actorUserId: id,
    eventType: 'account.email_verified',
    category: 'account',
    source: 'public_api',
    sourceEventId: uuidv7(),
    correlationId: uuidv7(),
    title,
    explanation: 'Synthetic private account activity fixture.',
    result: 'succeeded',
    reasonCode: null,
    policyVersion: 'activity-v1',
    objectType: null,
    objectId: null,
    reputationEffect: 'none',
    appealable: false,
    retentionClass: 'security',
    metadata: {},
    createdAt: new Date().toISOString(),
    retentionDays: 365,
  };
}

function createDatabase() {
  const ids = { a: uuidv7(), b: uuidv7(), staff: uuidv7(), moderator: uuidv7() };
  const requestIp = '2001:db8:' + ids.a.replaceAll('-', '').slice(-16).match(/.{4}/g).join(':') + '::1';
  const users = new Map([
    [ids.a, { status: 'active', token_version: 1 }],
    [ids.b, { status: 'active', token_version: 1 }],
    [ids.staff, { status: 'active', token_version: 1 }],
    [ids.moderator, { status: 'active', token_version: 1 }],
  ]);
  const profiles = new Map([
    [ids.a, privateProfile(ids.a, 'Synthetic Member A', 'member-a', 'Private biography for account A.', true)],
    [ids.b, privateProfile(ids.b, 'Synthetic Member B', 'member-b', 'Private biography for account B.', false)],
  ]);
  const preferences = new Map([
    [ids.a, { emailEnabled: false, pushEnabled: true, repliesEnabled: false, moderationEnabled: true, rewardsEnabled: true, updatedAt: '2026-10-13T00:00:00.000Z' }],
    [ids.b, { emailEnabled: false, pushEnabled: false, repliesEnabled: true, moderationEnabled: false, rewardsEnabled: false, updatedAt: '2026-10-13T00:00:01.000Z' }],
  ]);
  const activities = new Map([
    [ids.a, [activityEvent(ids.a, 'Private event for account A')]],
    [ids.b, [activityEvent(ids.b, 'Private event for account B')]],
  ]);
  const memberships = new Map();
  const reads = [];
  const transactionIds = new Set();
  let transactionSequence = 0;

  function query(text, values = []) {
    reads.push({ text, values });
    if (text.includes('SELECT status, token_version FROM identity.users WHERE id = $1')) {
      const user = users.get(values[0]);
      return result(user ? [user] : []);
    }
    if (text.includes('CASE WHEN $3::boolean') && text.includes('LEFT JOIN social.profiles p')) {
      const profile = profiles.get(values[0]);
      const privateView = values[2] === true;
      return result(profile && (privateView || profile.public_visibility) ? [profile] : []);
    }
    if (text.includes('FROM feed.notification_preferences WHERE user_id = $1')) {
      const row = preferences.get(values[0]);
      return result(row ? [row] : []);
    }
    if (text.includes('INSERT INTO feed.notification_preferences')) {
      const userId = values[0];
      const row = { ...(preferences.get(userId) ?? {
        emailEnabled: true, pushEnabled: true, repliesEnabled: true, moderationEnabled: true, rewardsEnabled: true,
      }) };
      ['emailEnabled', 'pushEnabled', 'repliesEnabled', 'moderationEnabled', 'rewardsEnabled'].forEach((key, index) => {
        if (typeof values[index + 1] === 'boolean') row[key] = values[index + 1];
      });
      row.updatedAt = new Date().toISOString();
      preferences.set(userId, row);
      return result([row]);
    }
    if (text.includes('INSERT INTO trust.user_activity_events')) {
      const event = {
        ...activityEvent(values[1], values[8]),
        id: values[0],
        actorUserId: values[2],
        eventType: values[3],
        category: values[4],
        source: values[5],
        sourceEventId: values[6],
        correlationId: values[7],
        explanation: values[9],
        result: values[10],
        reasonCode: values[11],
        policyVersion: values[12],
        objectType: values[13],
        objectId: values[14],
        reputationEffect: values[15],
        appealable: values[16],
        metadata: JSON.parse(values[17]),
        retentionClass: values[18],
        createdAt: values[20],
        retentionDays: values[21],
      };
      activities.set(values[1], [event, ...(activities.get(values[1]) ?? [])]);
      return result([event]);
    }
    if (text.includes('FROM trust.user_activity_events') && text.includes('WHERE user_id = $1')) {
      const rows = activities.get(values[0]) ?? [];
      return result(rows.slice(0, Number(values[1] ?? rows.length)));
    }
    if (text.includes('FROM identity.admin_memberships') && text.includes('access_subject_hmac')) {
      const membership = memberships.get(values[0]);
      return result(membership && membership.active !== false ? [membership] : []);
    }
    if (text.includes('INSERT INTO system.rate_limit_windows')) return result([{ request_count: 1 }], 1);
    if (text.includes('INSERT INTO system.audit_events')) return result([], 1);
    if (text.includes('FROM identity.users u') && text.includes('WHERE 1 = 1')) {
      return result([{
        id: ids.b,
        display_name: 'Synthetic Member B',
        status: 'active',
        created_at: '2026-10-13T00:00:00.000Z',
        cursor_timestamp: '2026-10-13T00:00:00.000000Z',
        updated_at: '2026-10-13T00:00:00.000Z',
        deleted_at: null,
        last_login_at: '2026-10-13T00:00:00.000Z',
        current_session_count: 0,
        handle: 'member-b',
        subscription_tier: 'free',
      }]);
    }
    if (text.includes('FROM identity.users u') && text.includes('h.handle_normalized ILIKE')) {
      return result([{
        id: ids.b,
        display_name: 'Synthetic Member B',
        status: 'active',
        created_at: '2026-10-13T00:00:00.000Z',
        handle: 'member-b',
        subscription_tier: 'free',
      }]);
    }
    throw new Error('unhandled_synthetic_database_query');
  }

  async function service(request) {
    const input = await request.json();
    if (input.action === 'begin') {
      const transactionId = String(++transactionSequence);
      transactionIds.add(transactionId);
      return Response.json({ transactionId });
    }
    if (input.action === 'commit' || input.action === 'rollback') {
      assert.ok(transactionIds.delete(input.transactionId), 'transaction closes only its fixture transaction');
      return Response.json({ completed: true });
    }
    if (input.action !== 'query' || (input.transactionId && !transactionIds.has(input.transactionId))) {
      return Response.json({ error: 'synthetic_database_protocol_invalid' }, { status: 400 });
    }
    try {
      return Response.json(query(input.text, input.values));
    } catch (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
  }

  return { ids, requestIp, users, profiles, preferences, activities, memberships, reads, service,
    async preferencesFor(id) { return preferences.get(id); },
    async setMembership(hmac, membership) { memberships.set(hmac, membership); },
    async revokeMembership(id) {
      for (const membership of memberships.values()) if (membership.user_id === id) membership.active = false;
    },
  };
}

async function accessAssertion(privateKey, subject) {
  return new SignJWT({ email: subject })
    .setProtectedHeader({ alg: 'RS256', kid: 'synthetic-access-key', typ: 'JWT' })
    .setIssuer('https://access-fixture.lythaus.test')
    .setAudience('synthetic-admin-audience')
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
}

function assertPrivate(response) {
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
}

let fixture;
before(async () => {
  const database = postgresMode
    ? await createPostgresIsolationDatabase(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL)
    : createDatabase();
  fixture = database;
  fixture.unexpectedOutbound = 0;
  const [{ privateKey: jwtPrivateKey, publicKey: jwtPublicKey }, { privateKey: accessPrivateKey, publicKey: accessPublicKey }] = await Promise.all([
    generateKeyPair('ES256', { extractable: true }),
    generateKeyPair('RS256', { extractable: true }),
  ]);
  const jwtKeyId = 'synthetic-account-isolation-key';
  const jwtPublicJwk = { ...await exportJWK(jwtPublicKey), kid: jwtKeyId, use: 'sig', alg: 'ES256' };
  const accessPublicJwk = { ...await exportJWK(accessPublicKey), kid: 'synthetic-access-key', use: 'sig', alg: 'RS256' };
  const accessSubjectHmacKey = Buffer.from('synthetic access-subject HMAC key').toString('base64');
  const memberSubject = 'member-a@example.invalid';
  const staffSubject = 'staff@example.invalid';
  const moderatorSubject = 'moderator@example.invalid';
  await database.setMembership(hmacLookup(staffSubject, accessSubjectHmacKey), { user_id: database.ids.staff, role: 'administrator' });
  await database.setMembership(hmacLookup(moderatorSubject, accessSubjectHmacKey), { user_id: database.ids.moderator, role: 'moderator' });

  const [publicScript, adminScript, jwtPrivateKeyPem] = await Promise.all([
    buildWorker('apps/lythaus-public-api/src/worker.ts'),
    buildWorker('apps/lythaus-admin-api/src/index.ts'),
    exportPKCS8(jwtPrivateKey),
  ]);
  const publicRuntime = new Miniflare(convertV4MiniflareOptions({ workers: [{
    name: 'account-isolation-public-api',
    modules: true,
    script: publicScript,
    compatibilityDate: '2026-07-27',
    compatibilityFlags: ['nodejs_compat'],
    bindings: {
      DB_APP_FRESH: { role: 'lythaus_runtime' },
      ENVIRONMENT: 'local',
      EXPECTED_HOSTNAMES: 'api.lythaus.test',
      CORS_ALLOWED_ORIGINS: 'https://app.lythaus.test',
      WORKER_VERSION: { id: uuidv7(), tag: 'synthetic-account-isolation' },
      JWT_KEY_ID: jwtKeyId,
      JWT_PRIVATE_KEY: jwtPrivateKeyPem,
      JWT_PUBLIC_JWKS: JSON.stringify({ keys: [jwtPublicJwk] }),
    },
    serviceBindings: { AUTHZ_DATABASE: database.service },
    outboundService: async () => {
      fixture.unexpectedOutbound += 1;
      return new Response(null, { status: 403 });
    },
  }] }));
  const publicWorker = {
    dispatchFetch(input, init = {}) {
      const headers = new Headers(init.headers);
      headers.set('cf-connecting-ip', database.requestIp);
      return publicRuntime.dispatchFetch(input, { ...init, headers });
    },
    dispose: () => publicRuntime.dispose(),
  };
  fixture.publicWorker = publicWorker;
  const adminWorker = new Miniflare(convertV4MiniflareOptions({ workers: [{
    name: 'account-isolation-admin-api',
    modules: true,
    script: adminScript,
    compatibilityDate: '2026-07-27',
    compatibilityFlags: ['nodejs_compat'],
    bindings: {
      DB_ADMIN_FRESH: { role: 'lythaus_admin' },
      EXPECTED_HOSTNAMES: 'admin-api.lythaus.test',
      CORS_ALLOWED_ORIGINS: 'https://admin.lythaus.test',
      WORKER_VERSION: { id: uuidv7(), tag: 'synthetic-account-isolation' },
      ACCESS_JWKS_URL: 'https://access-fixture.lythaus.test/certs',
      ACCESS_AUDIENCES: 'synthetic-admin-audience',
      ACCESS_TEAM_DOMAIN: 'access-fixture.lythaus.test',
      ACCESS_SUBJECT_HMAC_KEY: accessSubjectHmacKey,
    },
    serviceBindings: { AUTHZ_DATABASE: database.service },
    outboundService: async request => {
      const url = new URL(request.url);
      if (url.href === 'https://access-fixture.lythaus.test/certs') return Response.json({ keys: [accessPublicJwk] });
      fixture.unexpectedOutbound += 1;
      return new Response(null, { status: 403 });
    },
  }] }));

  fixture.adminWorker = adminWorker;
  const tokens = {
    a: await signAccessToken({ userId: database.ids.a, privateKeyPem: jwtPrivateKeyPem, keyId: jwtKeyId }),
    b: await signAccessToken({ userId: database.ids.b, privateKeyPem: jwtPrivateKeyPem, keyId: jwtKeyId }),
  };
  fixture = {
    ...database,
    publicWorker,
    adminWorker,
    tokens,
    accessPrivateKey,
    memberSubject,
    staffSubject,
    moderatorSubject,
    async accessToken(subject) { return accessAssertion(accessPrivateKey, subject); },
  };
});

after(async () => {
  const closed = await Promise.allSettled([fixture?.publicWorker?.dispose(), fixture?.adminWorker?.dispose()]);
  await fixture?.dispose?.();
  const failed = closed.find(result => result.status === 'rejected');
  if (failed) throw failed.reason;
});

test(`${runtimeLabel} isolates profile, preferences, and activity by verified account`, async () => {
  const token = fixture.tokens.a;
  const profileStart = fixture.reads.length;
  const profile = await fixture.publicWorker.dispatchFetch('https://api.lythaus.test/api/users/me?userId=' + fixture.ids.b, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(profile.status, 200);
  assertPrivate(profile);
  const profileBody = await profile.json();
  assert.equal(profileBody.user.id, fixture.ids.a);
  assert.equal(profileBody.user.displayName, 'Synthetic Member A');
  assert.equal(profileBody.user.bio, 'Private biography for account A.');
  assert.ok(!JSON.stringify(profileBody).includes('Private biography for account B.'));
  const profileQuery = fixture.reads.slice(profileStart).find(read => read.text.includes('CASE WHEN $3::boolean'));
  assert.match(profileQuery.text, /WHERE u\.id = \$1/);
  assert.equal(profileQuery.values[0], fixture.ids.a, 'the private profile query binds the verified principal, not a query parameter');

  const foreignProfile = await fixture.publicWorker.dispatchFetch(`https://api.lythaus.test/api/users/${fixture.ids.b}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(foreignProfile.status, 404);
  assertPrivate(foreignProfile);
  assert.equal((await foreignProfile.json()).error, 'not_found');

  const preferencesStart = fixture.reads.length;
  const preferences = await fixture.publicWorker.dispatchFetch('https://api.lythaus.test/api/notifications/preferences?userId=' + fixture.ids.b, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(preferences.status, 200);
  assertPrivate(preferences);
  assert.deepEqual(await preferences.json(), await fixture.preferencesFor(fixture.ids.a));
  const preferencesQuery = fixture.reads.slice(preferencesStart).find(read => read.text.includes('FROM feed.notification_preferences'));
  assert.match(preferencesQuery.text, /WHERE user_id = \$1/);
  assert.equal(preferencesQuery.values[0], fixture.ids.a, 'private preferences are selected by the verified principal');

  const updateStart = fixture.reads.length;
  const update = await fixture.publicWorker.dispatchFetch('https://api.lythaus.test/api/notifications/preferences?userId=' + fixture.ids.b, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ userId: fixture.ids.b, emailEnabled: true }),
  });
  assert.equal(update.status, 200);
  assertPrivate(update);
  assert.equal((await update.json()).emailEnabled, true);
  assert.equal((await fixture.preferencesFor(fixture.ids.a)).emailEnabled, true);
  assert.equal((await fixture.preferencesFor(fixture.ids.b)).emailEnabled, false, 'an attempted target ID cannot change another account');
  const preferenceMutation = fixture.reads.slice(updateStart).find(read => read.text.includes('INSERT INTO feed.notification_preferences'));
  assert.equal(preferenceMutation.values[0], fixture.ids.a, 'preference writes are bound to the verified principal');

  const activityStart = fixture.reads.length;
  const activity = await fixture.publicWorker.dispatchFetch('https://api.lythaus.test/api/users/me/activity?userId=' + fixture.ids.b, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(activity.status, 200);
  assertPrivate(activity);
  const activityBody = await activity.json();
  assert.deepEqual(activityBody.items.map(item => item.title), [
    'You updated notification preferences',
    'Private event for account A',
  ]);
  assert.ok(!JSON.stringify(activityBody).includes('Private event for account B'));
  const activityQuery = fixture.reads.slice(activityStart).find(read => read.text.includes('FROM trust.user_activity_events'));
  assert.match(activityQuery.text, /WHERE user_id = \$1/);
  assert.equal(activityQuery.values[0], fixture.ids.a, 'private activity is queried for the verified principal');

  const accountB = await fixture.publicWorker.dispatchFetch('https://api.lythaus.test/api/users/me', {
    headers: { authorization: `Bearer ${fixture.tokens.b}` },
  });
  assert.equal(accountB.status, 200);
  assertPrivate(accountB);
  assert.equal((await accountB.json()).user.id, fixture.ids.b);
  const accountBPreferences = await fixture.publicWorker.dispatchFetch('https://api.lythaus.test/api/notifications/preferences?userId=' + fixture.ids.a, {
    headers: { authorization: `Bearer ${fixture.tokens.b}` },
  });
  assert.equal(accountBPreferences.status, 200);
  assertPrivate(accountBPreferences);
  assert.equal((await accountBPreferences.json()).emailEnabled, false);
  const accountBActivity = await fixture.publicWorker.dispatchFetch('https://api.lythaus.test/api/users/me/activity?userId=' + fixture.ids.a, {
    headers: { authorization: `Bearer ${fixture.tokens.b}` },
  });
  assert.equal(accountBActivity.status, 200);
  assertPrivate(accountBActivity);
  assert.deepEqual((await accountBActivity.json()).items.map(item => item.title), ['Private event for account B']);
});

test(`${runtimeLabel} rejects guest and non-staff requests and keeps private failures uncacheable`, async () => {
  for (const path of ['/api/users/me', '/api/notifications/preferences', '/api/users/me/activity']) {
    const response = await fixture.publicWorker.dispatchFetch(`https://api.lythaus.test${path}`);
    assert.equal(response.status, 401, `guest cannot read ${path}`);
    assertPrivate(response);
    assert.equal((await response.json()).error, 'authentication_required');
  }

  for (const [path, method, body] of [
    ['/api/users/me', 'PATCH', { bio: 'Guest must not save this biography' }],
    ['/api/notifications/preferences', 'PUT', { userId: fixture.ids.b, emailEnabled: true }],
  ]) {
    const response = await fixture.publicWorker.dispatchFetch(`https://api.lythaus.test${path}`, {
      method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.equal(response.status, 401);
    assertPrivate(response);
    assert.equal((await response.json()).error, 'authentication_required');
  }
  assert.equal((await fixture.preferencesFor(fixture.ids.b)).emailEnabled, false);

  const adminPath = 'https://admin-api.lythaus.test/api/admin/users/search?q=' + fixture.ids.b;
  const guest = await fixture.adminWorker.dispatchFetch(adminPath);
  assert.equal(guest.status, 401);
  assertPrivate(guest);
  assert.equal((await guest.json()).error, 'access_required');

  const memberAssertion = await fixture.accessToken(fixture.memberSubject);
  const member = await fixture.adminWorker.dispatchFetch(adminPath, {
    headers: { 'cf-access-jwt-assertion': memberAssertion },
  });
  assert.equal(member.status, 403);
  assertPrivate(member);
  assert.equal((await member.json()).error, 'admin_role_required');

  const staffAssertion = await fixture.accessToken(fixture.staffSubject);
  const staff = await fixture.adminWorker.dispatchFetch(adminPath, {
    headers: { 'cf-access-jwt-assertion': staffAssertion },
  });
  assert.equal(staff.status, 200);
  assertPrivate(staff);
  const staffBody = await staff.json();
  assert.deepEqual(staffBody.items.map(user => user.id), [fixture.ids.b]);
  assert.ok(!JSON.stringify(staffBody).includes('Private biography for account B.'));

  const adminUsersPath = 'https://admin-api.lythaus.test/api/admin/users?limit=5&q=' + fixture.ids.b;
  const moderatorAssertion = await fixture.accessToken(fixture.moderatorSubject);
  const moderator = await fixture.adminWorker.dispatchFetch(adminUsersPath, {
    headers: { 'cf-access-jwt-assertion': moderatorAssertion },
  });
  assert.equal(moderator.status, 403);
  assertPrivate(moderator);
  assert.equal((await moderator.json()).error, 'admin_role_required');

  const administrator = await fixture.adminWorker.dispatchFetch(adminUsersPath, {
    headers: { 'cf-access-jwt-assertion': staffAssertion },
  });
  assert.equal(administrator.status, 200);
  assertPrivate(administrator);
  assert.deepEqual((await administrator.json()).items.map(user => user.id), [fixture.ids.b]);
  await fixture.revokeMembership(fixture.ids.staff);
  const revoked = await fixture.adminWorker.dispatchFetch(adminPath, {
    headers: { 'cf-access-jwt-assertion': staffAssertion },
  });
  assert.equal(revoked.status, 403);
  assertPrivate(revoked);
  assert.equal((await revoked.json()).error, 'admin_role_required');
});

test(`${runtimeLabel} ignores hostile account identifiers on private read routes`, async () => {
  for (const target of [fixture.ids.b, `${fixture.ids.b}' OR '1'='1`, `../../users/${fixture.ids.b}`]) {
    for (const path of ['/api/users/me', '/api/notifications/preferences', '/api/activity']) {
      const url = new URL('https://api.lythaus.test' + path);
      url.searchParams.set('userId', target);
      url.searchParams.set('subjectId', target);
      const response = await fixture.publicWorker.dispatchFetch(url, { headers: { authorization: `Bearer ${fixture.tokens.a}` } });
      assert.equal(response.status, 200);
      assertPrivate(response);
      const body = await response.json();
      if (path === '/api/users/me') assert.equal(body.user.id, fixture.ids.a);
      else if (path === '/api/notifications/preferences') assert.deepEqual(body, await fixture.preferencesFor(fixture.ids.a));
      else assert.ok(body.items.length > 0 && body.items.every(item => item.userId === fixture.ids.a));
      assert.ok(!JSON.stringify(body).includes('Private biography for account B.'));
      assert.ok(!JSON.stringify(body).includes('Private event for account B'));
    }
  }
  assert.equal(fixture.unexpectedOutbound, 0, 'only the intercepted synthetic Access JWKS destination may be fetched');
});

if (postgresMode) test('actual SQL connections use only canonical restricted runtime and admin roles', () => {
  assert.deepEqual([...new Set(fixture.roleEvidence.map(row => row.role))].sort(), ['lythaus_admin', 'lythaus_runtime']);
  assert.ok(fixture.roleEvidence.every(row => !row.rolsuper && !row.rolcreaterole && !row.rolcreatedb));
  assert.ok(fixture.reads.some(read => read.role === 'lythaus_runtime' && read.text.includes('FROM trust.user_activity_events')));
  assert.ok(fixture.reads.some(read => read.role === 'lythaus_admin' && read.text.includes('FROM identity.admin_memberships')));
  const publicRateQueries = fixture.reads.filter(read => read.values?.[0] === 'public-api');
  assert.ok(publicRateQueries.length > 0 && publicRateQueries.every(read => read.values[1] === fixture.publicRateHash));
  assert.deepEqual(fixture.databaseErrors, []);
});
