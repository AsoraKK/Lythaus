import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

const CASE_ID = '01990000-0000-7000-8000-000000000501';
const EVENT_ID = '01990000-0000-7000-8000-000000000502';
const queries = [];
const result = (rows = [], rowCount = rows.length) => ({ rows, rowCount });

mock.module('@lythaus/db', {
  cache: true,
  namedExports: {
    query: async (_binding, sql, values = []) => {
      queries.push({ sql, values, kind: 'query' });
      if (sql.includes('FROM system.outbox_events')) return result([{ id: EVENT_ID }]);
      return result();
    },
    transaction: async (_binding, work) => work({
      query: async (sql, values = []) => {
        queries.push({ sql, values, kind: 'transaction' });
        if (sql.includes("UPDATE moderation.authenticity_alpha SET state='analyzing'")) return result();
        return result();
      },
    }),
    purgeAlphaMedia: async () => ({ pending: 0, completed: 0, failed: 0 }),
    reconcileBudgetReservation: async () => undefined,
    scheduleAlphaPurge: async () => ({ purgeState: 'pending', keys: [] }),
  },
});
mock.module('@lythaus/security', { cache: true, namedExports: { uuidv7: () => CASE_ID } });

const { processAlphaEvent } = await import('../src/authenticity-alpha.ts');

test('duplicate delivery cannot replace an active alpha lease', async () => {
  queries.length = 0;
  await processAlphaEvent(
    { DB_JOBS_FRESH: { connectionString: 'postgres://unused' } },
    EVENT_ID,
    { caseId: CASE_ID, revision: 1, operation: 'analysis' },
  );
  const claim = queries.find((entry) => entry.kind === 'transaction' && entry.sql.includes("UPDATE moderation.authenticity_alpha SET state='analyzing'"));
  assert.ok(claim);
  assert.match(claim.sql, /state='queued' OR \(state='analyzing' AND \(lease_until IS NULL OR lease_until<=now\(\)\)\)/);
  assert.equal(claim.values[0], CASE_ID);
});
