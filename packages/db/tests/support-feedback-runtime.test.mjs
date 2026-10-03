import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

const state = { sql: '', rows: [] };
mock.module(new URL('../src/index.ts', import.meta.url), { cache: true, namedExports: {
  query: async (_binding, sql) => { state.sql = sql; return { rows: state.rows }; },
  transaction: async (_binding, work) => work({ query: async () => ({ rows: [], rowCount: 0 }) }),
} });

const { supportFeedbackSchemaReady } = await import('../src/support-feedback-runtime.ts');

test('member readiness requires every request and message table privilege', async () => {
  state.rows = [{ requests: true, messages: true, request_access: false, message_access: true }];
  assert.equal(await supportFeedbackSchemaReady({}, 'member'), false);
  assert.match(state.sql, /has_table_privilege\(current_user,to_regclass\('support\.requests'\),'SELECT'\)/);
  assert.match(state.sql, /has_table_privilege\(current_user,to_regclass\('support\.requests'\),'INSERT'\)/);
  assert.match(state.sql, /has_table_privilege\(current_user,to_regclass\('support\.requests'\),'UPDATE'\)/);
  assert.match(state.sql, /has_table_privilege\(current_user,to_regclass\('support\.messages'\),'SELECT'\)/);
  assert.match(state.sql, /has_table_privilege\(current_user,to_regclass\('support\.messages'\),'INSERT'\)/);
});

test('owner readiness remains fail closed when any private table permission is missing', async () => {
  state.rows = [{ requests: true, messages: true, notes: true, evidence: true, decisions: true, operation_refs: true,
    request_access: true, message_access: true, note_access: false, evidence_access: true, decision_access: true,
    operation_ref_access: true, owner_lock: true, owner_idempotency_claim: true, owner_idempotency_finish: true }];
  assert.equal(await supportFeedbackSchemaReady({}, 'owner'), false);
  assert.match(state.sql, /has_table_privilege\(current_user,to_regclass\('support\.notes'\),'SELECT'\)/);
  assert.match(state.sql, /has_table_privilege\(current_user,to_regclass\('support\.notes'\),'INSERT'\)/);
  assert.match(state.sql, /has_function_privilege\(current_user,to_regprocedure\('support\.lock_owner\(bytea\)'\),'EXECUTE'\)/);
});
