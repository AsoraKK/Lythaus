import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { bootstrapFirstAdmin, FIRST_ADMIN_BOOTSTRAP_CONFIRMATION } from '../src/first-admin-bootstrap.ts';

function fixture({ created = true, transactionError = null, resultRows = null } = {}) {
  const queries = [];
  let transactionCalls = 0;
  let committed = false;
  let idIndex = 0;
  const ids = [
    '018f2c4e-8c2b-7b4e-8d2a-2e2f0b7e4b70',
    '018f2c4e-8c2b-7b4e-8d2a-2e2f0b7e4b71',
  ];
  const dependencies = {
    newId: () => ids[idIndex++] ?? assert.fail('unexpected id allocation'),
    transaction: async (work) => {
      transactionCalls += 1;
      if (transactionError) throw transactionError;
      const outcome = await work({
        query: async (sql, values) => {
          queries.push({ sql, values });
          if (resultRows) return resultRows;
          return { rowCount: 1, rows: [{ created }] };
        },
      });
      committed = true;
      return outcome;
    },
  };
  return {
    dependencies,
    queries,
    transactionCalls: () => transactionCalls,
    committed: () => committed,
  };
}

const input = {
  accessSubjectHmac: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  correlationId: 'bootstrap-correlation',
};

test('bootstrap confirmation is explicit and stable', () => {
  assert.equal(FIRST_ADMIN_BOOTSTRAP_CONFIRMATION, 'BOOTSTRAP FIRST ADMINISTRATOR');
});

test('missing digest or correlation fails before database access', async () => {
  for (const invalid of [
    { ...input, accessSubjectHmac: '' },
    { ...input, correlationId: '' },
  ]) {
    const f = fixture();
    await assert.rejects(bootstrapFirstAdmin(invalid, f.dependencies), /bootstrap_binding_unavailable/);
    assert.equal(f.transactionCalls(), 0);
  }
});

test('calls only the fixed database bootstrap function with generated identifiers', async () => {
  const f = fixture();
  assert.deepEqual(await bootstrapFirstAdmin(input, f.dependencies), { created: true, role: 'administrator' });
  assert.equal(f.queries.length, 1);
  assert.match(f.queries[0].sql, /identity\.bootstrap_first_administrator/);
  assert.deepEqual(f.queries[0].values, [
    '018f2c4e-8c2b-7b4e-8d2a-2e2f0b7e4b70',
    input.accessSubjectHmac,
    '018f2c4e-8c2b-7b4e-8d2a-2e2f0b7e4b71',
    input.correlationId,
  ]);
  assert.equal(f.committed(), true);
});

test('durable database closure commits before bootstrap_closed is surfaced', async () => {
  const f = fixture({ created: false });
  await assert.rejects(bootstrapFirstAdmin(input, f.dependencies), /bootstrap_closed/);
  assert.equal(f.committed(), true);
  assert.equal(f.queries.length, 1);
});

test('database errors are sanitized', async () => {
  const f = fixture({ transactionError: new Error('sensitive database details') });
  await assert.rejects(bootstrapFirstAdmin(input, f.dependencies), /^Error: bootstrap_transaction_failed$/);
  assert.equal(f.committed(), false);
});

test('malformed database success evidence fails closed and is sanitized', async () => {
  for (const resultRows of [
    { rowCount: 0, rows: [] },
    { rowCount: 1, rows: [{}] },
    { rowCount: 2, rows: [{ created: true }, { created: true }] },
  ]) {
    const f = fixture({ resultRows });
    await assert.rejects(bootstrapFirstAdmin(input, f.dependencies), /^Error: bootstrap_transaction_failed$/);
    assert.equal(f.committed(), false);
  }
});

test('bootstrap source contains no committed personal email or Access subject identifier', async () => {
  const source = await fs.readFile('apps/lythaus-admin-api/src/first-admin-bootstrap.ts', 'utf8');
  assert.doesNotMatch(source, /@[a-z0-9.-]+\.[a-z]{2,}/i);
  assert.doesNotMatch(source, /FIRST_ADMIN_(?:EMAIL|ACCESS_SUBJECT)/);
  assert.doesNotMatch(source, /[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}/i);
});
