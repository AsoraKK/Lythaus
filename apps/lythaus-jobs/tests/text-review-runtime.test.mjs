import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lockActiveTextReviewAuthor } from '../src/text-review-runtime.ts';

const author = '019a0000-0000-7000-8000-000000000002';
for (const available of [false, undefined, 'true']) test(`account capability ${available} cannot authorize a lock`, async () => {
  const calls = [];
  const state = await lockActiveTextReviewAuthor({ query: async sql => {
    calls.push(sql); return { rows: [{ available }] };
  } }, author);
  assert.equal(state, 'unavailable'); assert.equal(calls.length, 1);
});
for (const status of ['locked', 'suspended', 'deleted', undefined]) test(`locked subject status ${status} cannot persist evidence`, async () => {
  const state = await lockActiveTextReviewAuthor({ query: async sql => ({ rows: [sql.includes('has_function_privilege')
    ? { available: true } : { status }] }) }, author);
  assert.equal(state, 'ineligible');
});
for (const deleted_at of [null, '2026-10-20T00:00:00Z', undefined]) test(`deletion marker ${deleted_at} is checked under the held account lock`, async () => {
  const calls = [];
  const state = await lockActiveTextReviewAuthor({ query: async (sql, values) => {
    calls.push({ sql, values });
    return { rows: [sql.includes('has_function_privilege') ? { available: true }
      : sql.includes('trust.lock_reputation_subject($1') ? { status: 'active' } : { deleted_at }] };
  } }, author);
  assert.equal(state, deleted_at === null ? 'locked' : 'ineligible');
  assert.match(calls[1].sql, /SELECT status FROM trust\.lock_reputation_subject\(\$1::pg_catalog\.uuid\)/);
  assert.deepEqual(calls[1].values, [author]); assert.match(calls[2].sql, /deleted_at FROM identity.users/);
});
test('capability denial or connection failure propagates for transaction rollback', async () => {
  const error = new Error('synthetic permission lost');
  await assert.rejects(lockActiveTextReviewAuthor({ query: async sql => {
    if (sql.includes('has_function_privilege')) return { rows: [{ available: true }] }; throw error;
  } }, author), actual => actual === error);
});
