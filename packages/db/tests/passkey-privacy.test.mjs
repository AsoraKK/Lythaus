import assert from 'node:assert/strict';
import test from 'node:test';
import { erasePasskeyData, exportPasskeyMetadata, purgeExpiredPasskeyChallenges, reconcilePasskeyPrivacyLocations } from '../src/passkey-privacy.ts';

const functions = [exportPasskeyMetadata, reconcilePasskeyPrivacyLocations, erasePasskeyData, purgeExpiredPasskeyChallenges];
function database({ tables = 3, status = 'locked', held = false, rows = [], deleted = 1 } = {}) {
  const calls = [];
  return { calls, async query(sql, values) {
    calls.push({ sql, values });
    if (sql.includes('to_regclass')) return { rows: [{ tables }], rowCount: 1 };
    if (sql.includes('SELECT status')) return { rows: status ? [{ status }] : [], rowCount: status ? 1 : 0 };
    if (sql.startsWith('SELECT 1 FROM privacy.legal_holds')) return { rows: held ? [{}] : [], rowCount: held ? 1 : 0 };
    return { rows, rowCount: deleted };
  } };
}

test('absent optional schema preserves existing privacy workflows without querying passkey stores', async () => {
  for (const fn of functions) {
    const db = database({ tables: 0 });
    const result = await fn(db, 'synthetic-owner');
    if (fn === exportPasskeyMetadata) assert.deepEqual(result, []);
    if (fn === purgeExpiredPasskeyChallenges) assert.equal(result, 0);
    assert.equal(db.calls.length, 1);
  }
});

test('partial schema and database failures cannot silently omit privacy data', async () => {
  for (const tables of [1, 2, null]) for (const fn of functions) {
    const db = database({ tables });
    await assert.rejects(fn(db, 'synthetic-owner'), /passkey_schema_incomplete/);
    assert.equal(db.calls.length, 1);
  }
  for (const fn of functions) {
    await assert.rejects(fn({ query: async () => { throw new Error('synthetic permission denied'); } }, 'owner'), /permission denied/);
  }
});

test('metadata export and inventory reconciliation remain available independently of enrollment configuration', async () => {
  const rows = [{ id: 'synthetic', name: 'My device', rpId: 'lythaus.co', revokedAt: null }];
  const db = database({ rows });
  assert.deepEqual(await exportPasskeyMetadata(db, 'owner'), rows);
  await reconcilePasskeyPrivacyLocations(db, 'owner');
  assert.ok(db.calls.filter(call => call.values).every(call => call.values[0] === 'owner'));
});

test('erasure rejects active or missing accounts and legal holds before any deletion', async () => {
  for (const options of [{ status: 'active' }, { status: null }, { status: 'locked', held: true }]) {
    const db = database(options);
    await assert.rejects(erasePasskeyData(db, 'owner'), /passkey_erasure_blocked/);
    assert.equal(db.calls.some(call => call.sql.startsWith('DELETE')), false);
  }
});

test('locked and already deleted accounts permit retry-safe owner-scoped erasure', async () => {
  for (const status of ['locked', 'deleted']) {
    const db = database({ status });
    await erasePasskeyData(db, 'owner');
    assert.equal(db.calls.filter(call => call.sql.startsWith('DELETE')).length, 2);
    assert.ok(db.calls.filter(call => call.values).every(call => call.values[0] === 'owner'));
  }
});

test('expired challenge cleanup reports deletions and handles empty results', async () => {
  assert.equal(await purgeExpiredPasskeyChallenges(database({ deleted: 2 })), 2);
  assert.equal(await purgeExpiredPasskeyChallenges(database({ deleted: null })), 0);
});
