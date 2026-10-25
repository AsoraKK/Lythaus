import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPair, exportJWK, exportPKCS8 } from 'jose';
import { hashPassword, hashResetToken, signAccessToken } from '@lythaus/security';

const actualDatabase = await import('@lythaus/db');
test.mock.module('@lythaus/db', { namedExports: { ...actualDatabase,
  query: (binding, sql, values) => binding.fixture.query(sql, values),
  transaction: (binding, work) => binding.fixture.transaction(work),
  recordUserActivity: async (client, input) => { client.activities.push(input); },
} });
const { default: api } = await import('../src/index.ts');

const userId = '019a0000-0000-7000-8000-000000000001';
const familyId = '019a0000-0000-7000-8000-000000000002';
const refreshCredential = 'r'.repeat(64), password = 'existing synthetic password';
const passwordHash = hashPassword(password, 'synthetic-pepper');
const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
const privateKeyPem = await exportPKCS8(privateKey);
const accessToken = await signAccessToken({ userId, privateKeyPem, keyId: 'synthetic-route-test' });
const jwks = JSON.stringify({ keys: [{ ...await exportJWK(publicKey), kid: 'synthetic-route-test', alg: 'ES256', use: 'sig' }] });
const operations = [
  { name: 'reward', path: '/api/rewards/level-1-learning/redeem', body: '{}', status: 201 },
  { name: 'deletion', path: '/api/privacy/requests', body: '{"requestType":"delete"}', status: 202 },
];

class Database {
  now = Date.now(); proofs = new Map(); idempotency = new Map(); rewards = []; privacy = []; activities = [];
  calls = []; tail = Promise.resolve(); failFinalization = false;
  env = { DB_APP_FRESH: { fixture: this }, MEMBER_RECENT_AUTH_ENABLED: 'true',
    EXPECTED_HOSTNAMES: 'api.lythaus.test', CORS_ALLOWED_ORIGINS: 'https://app.lythaus.test',
    JWT_PUBLIC_JWKS: jwks, JWT_PRIVATE_KEY: privateKeyPem, JWT_KEY_ID: 'synthetic-route-test',
    AUTH_PASSWORD_PEPPER_V1: 'synthetic-pepper', PII_HMAC_KEY_V1: 'synthetic-binding-key',
    PII_ENCRYPTION_KEY_V1: Buffer.alloc(32, 7).toString('base64'),
    WORKER_VERSION: { id: 'synthetic-worker', tag: 'synthetic-route-test' } };
  async query(sql, values = []) {
    this.calls.push([sql, values]); const reply = rows => ({ rows, rowCount: rows.length });
    const key = `${values[0]}:${values[1]}`;
    if (sql.includes('INSERT INTO system.idempotency_keys')) {
      if (this.idempotency.has(key)) return reply([]);
      const row = { actor_id: values[2], response: JSON.parse(values[3]), created_at: new Date().toISOString() };
      this.idempotency.set(key, row); return reply([structuredClone(row)]);
    }
    if (sql.includes('SELECT actor_id, response, created_at FROM system.idempotency_keys')) {
      return reply(this.idempotency.has(key) ? [structuredClone(this.idempotency.get(key))] : []);
    }
    if (sql.includes('UPDATE system.idempotency_keys')) {
      const row = this.idempotency.get(key), next = JSON.parse(values[3]);
      if (next.state === 'completed' && this.failFinalization) { this.failFinalization = false; throw new Error('synthetic_finalize_ack_lost'); }
      if (!row || row.actor_id !== values[2] || row.response.requestHash !== values[4]
        || !['processing', ...(next.state === 'completed' ? ['outcome_unknown'] : [])].includes(row.response.state)) return reply([]);
      row.response = next; return { rows: [], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO system.rate_limit_windows')) return reply([{ request_count: 1 }]);
    if (sql.includes('COALESCE(profile.current_level')) return reply([{ current_level: 1, created_at: new Date(Date.now() - 9 * 86400000).toISOString() }]);
    if (sql.includes('SELECT user_id FROM identity.auth_sessions')) {
      return reply(values[0] === hashResetToken(refreshCredential) ? [{ user_id: userId }] : []);
    }
    if (sql.includes('FROM identity.auth_sessions s')) return reply([{ session_id: 'existing-session', user_id: userId,
      family_id: familyId, status: 'active', token_state: 'active' }]);
    if (sql.includes('FROM identity.users')) return reply([{ id: userId, status: 'active', token_version: 1 }]);
    if (sql.includes('FROM identity.email_credentials')) return reply([{ user_id: userId, password_hash: passwordHash }]);
    if (sql.includes('INSERT INTO identity.account_action_verifications')) {
      const [id, user_id, refresh_family_id, token_version, action, operation_hash, secret_hash, credential_id] = values;
      const row = { id, user_id, refresh_family_id, token_version, action, operation_hash, secret_hash, credential_id,
        verified_at: new Date(this.now), expires_at: new Date(this.now + 300000), consumed_at: null };
      this.proofs.set(id, row); return reply([structuredClone(row)]);
    }
    if (sql.includes('FROM identity.account_action_verifications')) {
      assert.match(sql, /FOR UPDATE/);
      const row = this.proofs.get(values[0]); return reply(row ? [{ ...structuredClone(row), evaluated_at: new Date(this.now) }] : []);
    }
    if (sql.includes('UPDATE identity.account_action_verifications')) {
      assert.match(sql, /consumed_at IS NULL/); assert.match(sql, /expires_at > clock_timestamp\(\)/);
      const row = this.proofs.get(values[0]);
      if (!row || row.consumed_at || this.now < +row.verified_at || this.now >= +row.expires_at) return reply([]);
      row.consumed_at = new Date(this.now); return reply([{ id: row.id }]);
    }
    if (sql.includes('INSERT INTO trust.reward_redemptions')) {
      if (this.rewards.length) return reply([]);
      this.rewards.push(values[0]); return reply([{ redeemed_at: new Date(this.now).toISOString() }]);
    }
    if (sql.includes('SELECT 1 FROM privacy.requests')) return reply(this.privacy.length ? [{}] : []);
    if (sql.includes('INSERT INTO privacy.requests')) {
      this.privacy.push(values[0]); return reply([{ created_at: new Date(this.now).toISOString() }]);
    }
    if (sql.includes('INSERT INTO system.outbox_events')) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected synthetic query: ${sql}`);
  }
  async transaction(work) {
    const prior = this.tail; let release;
    this.tail = new Promise(resolve => { release = resolve; }); await prior;
    const snapshot = structuredClone({ proofs: this.proofs, rewards: this.rewards, privacy: this.privacy, activities: this.activities });
    try { return await work(this); } catch (error) { Object.assign(this, snapshot); throw error; } finally { release(); }
  }
  effectCount() { return this.rewards.length + this.privacy.length; }
  fetch(path, body, key, proof) {
    return api.fetch(new Request('https://api.lythaus.test' + path, { method: 'POST', body,
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json',
        'x-lythaus-session-binding': refreshCredential, ...(key ? { 'idempotency-key': key } : {}),
        ...(proof ? { 'x-lythaus-action-verification': proof } : {}) } }), this.env);
  }
  mutate(operation, key, proof, body = operation.body) { return this.fetch(operation.path, body, key, proof); }
  async verify(operation, suppliedPassword = password) {
    const response = await this.fetch('/api/auth/recent-verification', JSON.stringify({ password: suppliedPassword,
      operation: { method: 'POST', path: operation.path, body: operation.body } }));
    const result = await response.json(); assert.equal(response.status, 200, JSON.stringify(result)); return result;
  }
  consumed() { return [...this.proofs.values()].filter(row => row.consumed_at !== null).length; }
}

for (const operation of operations) {
  test(`${operation.name}: confirmed challenge → real verification → new-key recovery; old-key denial remains stable`, async () => {
    const db = new Database(), key = `${operation.name}-challenge-key`;
    const denied = await db.mutate(operation, key);
    assert.equal(denied.status, 403); const challenge = await denied.json();
    assert.equal(challenge.error, 'recent_authentication_required'); assert.equal(db.effectCount(), 0);
    const ticket = await db.verify(operation);
    const replay = await db.mutate(operation, key, ticket.proof);
    assert.equal(replay.status, 403); assert.deepEqual(await replay.json(), challenge);
    assert.equal(db.effectCount(), 0); assert.equal(db.consumed(), 0);
    const recovered = await db.mutate(operation, `${key}-verified`, ticket.proof);
    assert.equal(recovered.status, operation.status); const result = await recovered.json();
    assert.equal(db.effectCount(), 1); assert.equal(db.consumed(), 1);
    db.now += 300000;
    const successfulReplay = await db.mutate(operation, `${key}-verified`);
    assert.equal(successfulReplay.status, operation.status); assert.deepEqual(await successfulReplay.json(), result);
    assert.equal(db.effectCount(), 1); assert.equal(db.consumed(), 1);
  });

  test(`${operation.name}: expired proof denial recovers only after renewal and a fresh operation key`, async () => {
    const db = new Database(), key = `${operation.name}-expired-key`;
    const expired = await db.verify(operation); db.now += 300000;
    const denied = await db.mutate(operation, key, expired.proof);
    assert.equal(denied.status, 403); assert.equal((await denied.json()).error, 'recent_authentication_required');
    assert.equal(db.effectCount(), 0); assert.equal(db.consumed(), 0);
    const renewed = await db.verify(operation);
    assert.equal((await db.mutate(operation, key, renewed.proof)).status, 403);
    assert.equal((await db.mutate(operation, `${key}-renewed`, renewed.proof)).status, operation.status);
    assert.equal(db.effectCount(), 1); assert.equal(db.consumed(), 1);
    assert.equal(db.proofs.get(expired.proof.split('.')[0]).consumed_at, null);
  });

  test(`${operation.name}: concurrent same-key success replays once; another key cannot reuse its proof`, async () => {
    const db = new Database(), key = `${operation.name}-concurrent-key`, ticket = await db.verify(operation);
    const responses = await Promise.all([db.mutate(operation, key, ticket.proof), db.mutate(operation, key, ticket.proof)]);
    assert.ok(responses.some(response => response.status === operation.status));
    for (const response of responses) {
      assert.ok([operation.status, 409].includes(response.status));
      if (response.status === 409) assert.equal((await response.json()).error, 'idempotency_in_progress');
    }
    const first = await (await db.mutate(operation, key)).json();
    const second = await (await db.mutate(operation, key, ticket.proof)).json();
    assert.deepEqual(first, second); assert.equal(db.effectCount(), 1); assert.equal(db.consumed(), 1);
    const reused = await db.mutate(operation, `${key}-other`, ticket.proof);
    assert.equal(reused.status, 403); assert.equal((await reused.json()).error, 'recent_authentication_required');
    assert.equal(db.effectCount(), 1); assert.equal(db.consumed(), 1);
    const conflict = await db.mutate(operation, key, ticket.proof, '{"different":true}');
    assert.equal(conflict.status, 409); assert.equal((await conflict.json()).error, 'idempotency_key_conflict');
  });

  test(`${operation.name}: unknown finalization remains quarantined after one committed effect`, async () => {
    const db = new Database(), key = `${operation.name}-uncertain-key`, ticket = await db.verify(operation);
    db.failFinalization = true;
    const uncertain = await db.mutate(operation, key, ticket.proof);
    assert.equal(uncertain.status, 409); assert.equal((await uncertain.json()).error, 'idempotency_outcome_unknown');
    const replay = await db.mutate(operation, key, ticket.proof);
    assert.equal(replay.status, 409); assert.equal((await replay.json()).error, 'idempotency_outcome_unknown');
    assert.equal(db.effectCount(), 1); assert.equal(db.consumed(), 1);
    assert.ok([...db.idempotency.values()].some(row => row.response.state === 'outcome_unknown'));
  });
}

test('disabled actual routes preserve optional-key behavior without reading or consuming proof schema', async () => {
  const db = new Database(); delete db.env.MEMBER_RECENT_AUTH_ENABLED;
  assert.equal((await db.mutate(operations[0], 'disabled-route-key')).status, 201);
  assert.equal(db.effectCount(), 1); assert.equal(db.proofs.size, 0);
  assert.equal(db.calls.some(([sql]) => sql.includes('account_action_verifications') || sql.includes('auth_sessions')), false);
});

test('actual route rejects malformed body bytes before any proof consumption or protected effect', async () => {
  const db = new Database(), operation = { ...operations[0], body: '{"memo":"\ufffd"}' };
  const ticket = await db.verify(operation);
  const invalidBytes = new Uint8Array([...new TextEncoder().encode('{"memo":"'), 0xff, ...new TextEncoder().encode('"}')]);
  const invalid = await db.mutate(operation, 'invalid-body-key', ticket.proof, invalidBytes);
  assert.equal(invalid.status, 400); assert.equal((await invalid.json()).error, 'invalid_json');
  assert.equal(db.effectCount(), 0); assert.equal(db.consumed(), 0);
  assert.equal((await db.mutate(operation, 'valid-body-key', ticket.proof)).status, 201);
});
