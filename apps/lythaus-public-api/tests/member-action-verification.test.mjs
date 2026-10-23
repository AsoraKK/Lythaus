import assert from 'node:assert/strict';
import test from 'node:test';
import { hashPassword, hashResetToken } from '../../../packages/security/src/index.ts';
import { createRecentAccountProof, consumeRecentAccountProof } from '../src/member-action-verification-db.ts';
import { knownSensitiveOperation, sensitiveOperationDigest } from '../../../packages/security/src/member-action-verification.ts';
import { classifyPublicError, rateLimitPlan } from '../src/auth-runtime-policy.ts';
import { readSensitiveOperation, recentVerificationRefreshCredential, verifyAccountActionRequest } from '../src/member-action-verification-http.ts';

const userId = '019a0000-0000-7000-8000-000000000001', familyId = '019a0000-0000-7000-8000-000000000002';
const user = { userId, tokenVersion: 3, roles: [] };
const refreshCredential = 'r'.repeat(64);
const operation = knownSensitiveOperation('POST', '/api/rewards/synthetic-reward/redeem', '{}');
const passwordHash = hashPassword('existing correct password', 'synthetic-pepper');

class Database {
  now = Date.parse('2026-10-23T12:00:00.000Z');
  rows = new Map(); calls = []; active = true; version = 3; familyActive = true; credential = true;
  available = true; tail = Promise.resolve();
  refreshCredential = refreshCredential; bindingFamilyId = familyId; sessionActive = true;
  async query(sql, values = []) {
    this.calls.push([sql, values]);
    if (!this.available) throw new Error('synthetic schema/privilege unavailable');
    const reply = rows => ({ rows, rowCount: rows.length });
    if (sql.includes('SELECT user_id FROM identity.auth_sessions')) {
      return reply(values[0] === hashResetToken(this.refreshCredential) ? [{ user_id: userId }] : []);
    }
    if (sql.includes('FROM identity.users')) return reply(this.active && (values.length === 1 || values[1] === this.version) ? [{ id: userId }] : []);
    if (sql.includes('FROM identity.auth_sessions s')) {
      assert.match(sql, /family_revoked/); assert.match(sql, /s.expires_at <= now\(\)/);
      return reply([{ session_id: 'existing-session', user_id: userId, family_id: this.bindingFamilyId,
        status: this.active ? 'active' : 'suspended', token_state: !this.familyActive ? 'family_revoked' : !this.sessionActive ? 'revoked' : 'active' }]);
    }
    if (sql.includes('FROM identity.email_credentials')) return reply(this.credential ? [{ user_id: userId, password_hash: passwordHash }] : []);
    if (sql.includes('INSERT INTO identity.account_action_verifications')) {
      const [id, user_id, refresh_family_id, token_version, action, operation_hash, secret_hash, credential_id] = values;
      const row = { id, user_id, refresh_family_id, token_version, action, operation_hash, secret_hash, credential_id,
        verified_at: new Date(this.now), expires_at: new Date(this.now + 300000), consumed_at: null };
      this.rows.set(id, row); return reply([row]);
    }
    if (sql.includes('FROM identity.account_action_verifications')) {
      assert.match(sql, /FOR UPDATE/);
      const row = this.rows.get(values[0]); return reply(row ? [{ ...row, evaluated_at: new Date(this.now) }] : []);
    }
    if (sql.includes('UPDATE identity.account_action_verifications')) {
      assert.match(sql, /consumed_at IS NULL/); assert.match(sql, /expires_at > clock_timestamp\(\)/);
      const row = this.rows.get(values[0]);
      if (!row || row.consumed_at || this.now < +row.verified_at || this.now >= +row.expires_at) return reply([]);
      row.consumed_at = new Date(this.now); return reply([{ id: row.id }]);
    }
    throw new Error(`Unexpected synthetic query: ${sql}`);
  }
  async transaction(work) {
    const prior = this.tail;
    let release;
    this.tail = new Promise(resolve => { release = resolve; });
    await prior;
    const snapshot = structuredClone(this.rows);
    try { return await work(this); } catch (error) { this.rows = snapshot; throw error; } finally { release(); }
  }
  async issue(password = 'existing correct password') {
    return this.transaction(client => createRecentAccountProof(client,
      { enabled: true, user, password, operation, pepper: 'synthetic-pepper', bindingKey: 'synthetic-binding-key', refreshCredential: this.refreshCredential }));
  }
  async consume(proof, override = {}, work = async () => 'effect') {
    return this.transaction(async client => {
      await consumeRecentAccountProof(client, { enabled: true, user, operation, proof, bindingKey: 'synthetic-binding-key', refreshCredential: this.refreshCredential, ...override });
      return work();
    });
  }
}

test('disabled consume performs no database I/O; explicitly enabled missing operation fails closed', async () => {
  const db = new Database();
  await consumeRecentAccountProof(db, { enabled: false, user: {}, operation: undefined, proof: null });
  assert.deepEqual(db.calls, []);
  await assert.rejects(consumeRecentAccountProof(db, { enabled: true, user, operation: undefined, proof: null }), /unavailable/);
  assert.deepEqual(db.calls, []);
});

test('real existing password verifier must succeed; unknown credentials/schema and wrong password fail closed', async () => {
  const db = new Database();
  await assert.rejects(db.issue('incorrect'), /recent_authentication_failed/);
  assert.equal(db.rows.size, 0);
  db.credential = false;
  await assert.rejects(db.issue(), /recent_authentication_unavailable/);
  db.credential = true; db.available = false;
  await assert.rejects(db.issue(), /recent_authentication_unavailable/);
});

test('action and nonce are single-use; concurrent transactions have only one successful effect', async () => {
  const db = new Database(); const ticket = await db.issue(); let effects = 0;
  const outcomes = await Promise.allSettled([0, 1].map(() => db.consume(ticket.proof, {}, async () => ++effects)));
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(effects, 1);
  await assert.rejects(db.consume(ticket.proof), /recent_authentication_required/);
});

test('protected mutation rollback restores proof; a retry may commit once before expiry', async () => {
  const db = new Database(); const ticket = await db.issue();
  await assert.rejects(db.consume(ticket.proof, {}, async () => { throw new Error('action_rolled_back'); }), /action_rolled_back/);
  assert.equal([...db.rows.values()][0].consumed_at, null);
  assert.equal(await db.consume(ticket.proof), 'effect');
});

test('server-time expiry, family/account revocation, token version and binding mismatches deny effects', async () => {
  for (const change of [
    db => { db.now += 300000; }, db => { db.now -= 1; }, db => { db.familyActive = false; },
    db => { db.active = false; }, db => { db.version++; }, db => { db.bindingFamilyId = userId; }, db => { db.sessionActive = false; },
  ]) {
    const db = new Database(); const ticket = await db.issue(); change(db);
    await assert.rejects(db.consume(ticket.proof));
  }
  for (const override of [
    { refreshCredential: 'z'.repeat(64) }, { user: { ...user, userId: familyId } },
    { operation: { ...operation, body: '{"different":true}' } }, { operation: { ...operation, action: 'account_delete' } },
    { proof: `${userId}.${'f'.repeat(64)}` },
  ]) {
    const db = new Database(); const ticket = await db.issue();
    await assert.rejects(db.consume(ticket.proof, override));
  }
});

test('read-only binding survives a rotated credential in the same family without resetting verification age', async () => {
  const db = new Database();
  const ticket = await db.issue();
  db.refreshCredential = 's'.repeat(64);
  db.now += 120000;
  assert.equal(await db.consume(ticket.proof), 'effect');
  assert.equal([...db.rows.values()][0].verified_at.toISOString(), ticket.verifiedAt);
  assert.equal(db.calls.some(([sql]) => /(?:UPDATE|INSERT INTO) identity\.(?:auth_sessions|refresh_token_families)/.test(sql)), false);
  const second = new Database(); const expires = await second.issue();
  second.refreshCredential = 's'.repeat(64); second.now += 300000;
  await assert.rejects(second.consume(expires.proof), /recent_authentication_required/);
});

test('step-up failures use 403/503 rather than triggering existing 401 refresh handling', () => {
  for (const code of ['recent_authentication_required', 'recent_authentication_failed']) assert.equal(classifyPublicError(new Error(code)).status, 403);
  assert.equal(classifyPublicError(new Error('recent_authentication_unavailable')).status, 503);
  assert.equal(rateLimitPlan('/api/auth/recent-verification').limit, 10);
});

test('actual verification request uses only the server principal and isolates monthly collection failure', async () => {
  const db = new Database(); const seen = [];
  const request = new Request('https://api.example.invalid/api/auth/recent-verification', { method: 'POST', body: JSON.stringify({
    password: 'existing correct password', operation: { method: operation.method, path: operation.path, body: operation.body },
    userId: familyId, sessionFamilyId: userId, locallyUnlocked: true, verifiedAt: '2099-01-01T00:00:00.000Z',
  }) });
  const result = await verifyAccountActionRequest(request, true, {
    authenticate: async () => user,
    limitUser: async id => seen.push(id),
    issue: input => db.transaction(client => createRecentAccountProof(client, {
      enabled: true, ...input, pepper: 'synthetic-pepper', bindingKey: 'synthetic-binding-key', refreshCredential,
    })),
    recordMaintenance: async () => { throw new Error('monthly store unavailable'); },
  });
  assert.deepEqual(seen, [userId]);
  assert.equal([...db.rows.values()][0].user_id, userId);
  assert.equal([...db.rows.values()][0].refresh_family_id, familyId);
  assert.equal(result.verifiedAt, '2026-10-23T12:00:00.000Z');
  assert.deepEqual(result.maintenanceEvidence, { state: 'unavailable', reason: 'monthly_evidence_not_confirmed' });
  assert.equal(await db.consume(result.proof), 'effect');
});

test('disabled HTTP path, unsupported operations and offline failures never mint proof', async () => {
  const request = body => new Request('https://api.example.invalid/api/auth/recent-verification', { method: 'POST', body: JSON.stringify(body) });
  let calls = 0;
  const dependencies = { authenticate: async () => { calls++; return user; }, limitUser: async () => {},
    issue: async () => { throw new Error('must not issue'); } };
  await assert.rejects(verifyAccountActionRequest(request({ biometric: true }), false, dependencies), /unavailable/);
  assert.equal(calls, 0);
  await assert.rejects(verifyAccountActionRequest(request({ password: 'existing correct password',
    operation: { method: 'POST', path: '/api/account/email', body: '{}' } }), true, dependencies), /operation_unavailable/);
  await assert.rejects(verifyAccountActionRequest(request({}), true, { ...dependencies,
    authenticate: async () => { throw new Error('offline'); } }), /offline/);
});

test('existing cookie/native refresh credential supplies binding without changing its transport or rotating it', () => {
  const native = new Request('https://api.example.invalid/api/auth/recent-verification', { method: 'POST',
    headers: { 'x-lythaus-session-binding': refreshCredential } });
  assert.equal(recentVerificationRefreshCredential(native, '', false), undefined);
  assert.equal(recentVerificationRefreshCredential(native, '', true), refreshCredential);
  const cookie = new Request('https://api.example.invalid/api/auth/recent-verification', { method: 'POST',
    headers: { origin: 'https://app.example.invalid', 'x-lythaus-auth-transport': 'cookie-v1', cookie: `__Host-lythaus_refresh=${refreshCredential}` } });
  assert.equal(recentVerificationRefreshCredential(cookie, 'https://app.example.invalid', true), refreshCredential);
  assert.throws(() => recentVerificationRefreshCredential(cookie, 'https://different.example.invalid', true), /auth_origin_not_allowed/);
  const conflicting = new Request(cookie, { headers: { ...Object.fromEntries(cookie.headers), 'x-lythaus-session-binding': 's'.repeat(64) } });
  assert.throws(() => recentVerificationRefreshCredential(conflicting, 'https://app.example.invalid', true), /required/);
  assert.throws(() => recentVerificationRefreshCredential(new Request(native.url, { method: 'POST' }), '', true), /unavailable/);
});

test('actual request binding includes query/body; disabled reads do not consume the request', async () => {
  const request = new Request('https://api.example.invalid/api/privacy/requests?entry=settings', {
    method: 'POST', body: '{"requestType":"delete"}',
  });
  assert.equal(await readSensitiveOperation(request, false), undefined);
  assert.equal(request.bodyUsed, false);
  const parsed = await readSensitiveOperation(request, true);
  assert.equal(parsed.action, 'account_delete');
  assert.equal(parsed.path, '/api/privacy/requests?entry=settings');
  assert.equal(request.bodyUsed, false);
  const long = new Request(`https://api.example.invalid/api/rewards/synthetic-reward/redeem?q=${'a'.repeat(300)}`, { method: 'POST', body: '{}' });
  const absent = await readSensitiveOperation(long, true);
  assert.equal(absent, undefined);
  await assert.rejects(consumeRecentAccountProof(new Database(), { enabled: true, user,
    operation: absent, proof: null, bindingKey: 'synthetic-binding-key' }), /operation_unavailable/);
});

test('exact body binding rejects malformed UTF-8 and preserves valid bytes at the boundary', async () => {
  const request = body => new Request('https://api.example.invalid/api/rewards/synthetic-reward/redeem', { method: 'POST', body });
  for (const bytes of [[0xff], [0xfe], [0xc0, 0xaf], [0xc3], [0xed, 0xa0, 0x80]]) {
    await assert.rejects(readSensitiveOperation(request(new Uint8Array(bytes)), true), /invalid_json/);
  }
  const plain = await readSensitiveOperation(request('{}'), true);
  const bom = await readSensitiveOperation(request(new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d])), true);
  assert.equal(bom.body, '\ufeff{}');
  assert.notEqual(await sensitiveOperationDigest(plain, 'synthetic-key'), await sensitiveOperationDigest(bom, 'synthetic-key'));
  const replacement = await readSensitiveOperation(request('\ufffd'), true);
  assert.equal(replacement.body, '\ufffd');
  const boundary = await readSensitiveOperation(request('é'.repeat(4096)), true);
  assert.equal(new TextEncoder().encode(boundary.body).length, 8192);
  const disabled = request(new Uint8Array([0xff]));
  assert.equal(await readSensitiveOperation(disabled, false), undefined);
  assert.equal(disabled.bodyUsed, false);
});

test('oversized cloned bodies reject promptly with absent or misleading Content-Length', { timeout: 2000 }, async () => {
  for (const length of [undefined, '1', '8193']) {
    const request = new Request('https://api.example.invalid/api/rewards/synthetic-reward/redeem', {
      method: 'POST', body: 'é'.repeat(4096) + 'x', headers: length ? { 'content-length': length } : {},
    });
    await assert.rejects(readSensitiveOperation(request, true), /request_too_large/);
  }
});
