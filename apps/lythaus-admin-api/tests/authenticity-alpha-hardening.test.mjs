import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

const id = '01990000-0000-7000-8000-000000000601';
const queries = [];
mock.module('@lythaus/db', { cache: true, namedExports: {
  query: async (_binding, sql) => {
    queries.push(sql);
    return { rows: [{ case_id: id }], rowCount: 1 };
  },
  transaction: async () => { throw new Error('unbudgeted_admin_mutation'); },
} });
mock.module('@lythaus/security', { cache: true, namedExports: { uuidv7: () => id } });
const { handleAdminAlpha } = await import('../src/authenticity-alpha.ts');
const request = () => new Request(`https://admin.lythaus.co/api/admin/authenticity/alpha/cases/${id}/advice`, { method: 'POST' });

test('an unprivileged role cannot read or request private alpha advice', async () => {
  queries.length = 0;
  assert.equal((await handleAdminAlpha(request(), {}, { userId: id, role: 'support' })).status, 403);
  assert.deepEqual(queries, []);
});

test('authorized admin advice directs the owner to the measured path without consuming an attempt', async () => {
  queries.length = 0;
  const response = await handleAdminAlpha(request(), {}, { userId: id, role: 'operations' });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: 'alpha_owner_advice_required' });
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.ok(queries.every((sql) => sql.startsWith('SELECT')));
});
