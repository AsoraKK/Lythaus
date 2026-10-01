import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

const CASE_ID = '01990000-0000-7000-8000-000000000301';
const OWNER = '01990000-0000-7000-8000-000000000302';
const state = { hold: false, purgeFailure: true, queries: [], transactions: 0, mode: 'purge' };
const result = (rows = [], rowCount = rows.length) => ({ rows, rowCount });

function purgeRow() {
  return {
    case_id: CASE_ID,
    owner_id: OWNER,
    state: 'cancelled',
    object_id: CASE_ID,
    upload_session_id: CASE_ID,
    original_key: `alpha-original/${OWNER}/${CASE_ID}/1`,
    upload_key: `quarantine/${OWNER}/${CASE_ID}`,
    purge_state: 'pending',
    purge_attempts: 0,
    storage_released_at: null,
    byte_size: '128',
  };
}

mock.module(new URL('../src/index.ts', import.meta.url), { cache: true, namedExports: {
  query: async (_binding, sql) => {
    state.queries.push(sql);
    if (sql.includes('FROM moderation.authenticity_alpha a') && sql.includes('a.deleted_at IS NOT NULL')) return result([{ ...purgeRow(), purge_state: state.mode === 'blocked' ? 'blocked' : 'pending' }]);
    if (sql.includes('SELECT count(*)::text AS count')) return result([{ count: '1' }]);
    return result();
  },
  transaction: async (_binding, work) => {
    state.transactions += 1;
    const client = {
      query: async (sql) => {
        state.queries.push(sql);
        if (sql.includes('SELECT a.case_id,a.owner_id,a.state,a.object_id,a.upload_session_id,a.original_key')) {
          return result([{ ...purgeRow(), purge_state: state.mode === 'schedule' ? 'not_requested' : state.mode === 'blocked' ? 'blocked' : 'pending', deleted_at: state.mode === 'blocked' ? new Date() : null }]);
        }
        if (sql.includes('privacy.alpha_subject_has_hold')) return result([{ active: state.hold }]);
        if (sql.includes('SELECT expected_bytes,status FROM media.upload_sessions')) return result([{ expected_bytes: '128', status: 'pending' }]);
        if (sql.includes('SELECT case_id,owner_id,state,object_id,upload_session_id,original_key,purge_state')) return result([{ ...purgeRow(), deleted_at: new Date(), storage_released_at: null }]);
        if (sql.includes('SELECT byte_size,state FROM media.objects')) return result([{ byte_size: '128', state: 'deleted' }]);
        return result();
      },
    };
    return work(client);
  },
} });

const { scheduleAlphaPurge, purgeAlphaMedia } = await import('../src/authenticity-alpha.ts');

test('schedule scrubs content and leaves provider references pending', async () => {
  state.hold = false;
  state.mode = 'schedule';
  state.queries = [];
  const scheduled = await scheduleAlphaPurge({ connectionString: 'postgres://unused' }, OWNER, CASE_ID, 'deleted');
  assert.equal(scheduled.purgeState, 'pending');
  assert.ok(state.queries.some((sql) => sql.includes('result=NULL') && sql.includes('text_body=NULL')));
  assert.ok(state.queries.some((sql) => sql.includes("state=CASE WHEN state='started' THEN 'ambiguous' ELSE state END")));
  assert.ok(state.queries.some((sql) => sql.includes("purge_state='pending'")));
  assert.ok(state.queries.some((sql) => sql.includes('DELETE FROM moderation.authenticity_alpha_feedback')));
  assert.ok(state.queries.some((sql) => sql.includes("status='released'")));
  assert.equal(state.queries.some((sql) => sql.includes('purged_at=now()')), false);
});

test('R2 failure retains pending state and a later retry finalizes physical purge', async () => {
  state.mode = 'purge';
  state.purgeFailure = true;
  state.queries = [];
  const bucket = { delete: async () => { if (state.purgeFailure) { state.purgeFailure = false; throw new Error('r2_unavailable'); } } };
  const first = await purgeAlphaMedia({ connectionString: 'postgres://unused' }, bucket, CASE_ID);
  assert.equal(first.failed, 1);
  assert.ok(state.queries.some((sql) => sql.includes('purge_attempts=purge_attempts+1')));
  const second = await purgeAlphaMedia({ connectionString: 'postgres://unused' }, bucket, CASE_ID);
  assert.equal(second.completed, 1);
  assert.ok(state.queries.some((sql) => sql.includes("purge_state='completed'")));
});

test('legal hold blocks physical purge without deleting the retained payload', async () => {
  state.mode = 'schedule';
  state.hold = true;
  await assert.rejects(() => scheduleAlphaPurge({ connectionString: 'postgres://unused' }, OWNER, CASE_ID, 'deleted'), /alpha_retention_hold/);
  state.hold = false;
});

test('a cleared legal hold requeues a blocked purge and missing R2 records a retryable failure', async () => {
  state.hold = false;
  state.mode = 'blocked';
  state.queries = [];
  const requeued = await scheduleAlphaPurge({ connectionString: 'postgres://unused' }, OWNER, CASE_ID, 'deleted');
  assert.equal(requeued.purgeState, 'pending');
  assert.ok(state.queries.some((sql) => sql.includes("purge_state='pending'")));

  state.mode = 'purge';
  state.queries = [];
  const failed = await purgeAlphaMedia({ connectionString: 'postgres://unused' }, undefined, CASE_ID);
  assert.equal(failed.failed, 1);
  assert.ok(state.queries.some((sql) => sql.includes("R2_BINDING_UNAVAILABLE")));
});

test('cleanup worker retries a blocked purge after the legal hold clears', async () => {
  state.hold = false;
  state.mode = 'blocked';
  state.queries = [];
  const bucket = { delete: async () => undefined };
  const retried = await purgeAlphaMedia({ connectionString: 'postgres://unused' }, bucket, CASE_ID);
  assert.equal(retried.completed, 1);
  assert.ok(state.queries.some((sql) => sql.includes("SET purge_state='pending'")));
});
