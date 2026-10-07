import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

const state = { sql: '', rows: [], error: null };
mock.module(new URL('../src/index.ts', import.meta.url), { cache: true, namedExports: {
  query: async (_binding, sql) => { state.sql = sql; if (state.error) throw state.error; return { rows: state.rows }; },
  transaction: async (_binding, work) => work({ query: async () => ({ rows: [], rowCount: 0 }) }),
} });

const { supportFeedbackSchemaReady, createSupportFeedbackRuntime } = await import('../src/support-feedback-runtime.ts');
const { supportFeedbackPrivacyIsReady, supportFeedbackPrivacySchemaState } = await import('../src/support-feedback-privacy-runtime.ts');
const policy = { version: 'fixture_v1', contract: {
  limits: { titleBytes: 32, detailBytes: 32, stepsBytes: 32, contextBytes: 32, memberMessageBytes: 32 },
  categories: { problem: ['other'], suggestion: ['other'] }, states: { problem: ['new', 'closed'], suggestion: ['new', 'closed'] },
}, initial: { problem: 'new', suggestion: 'new' }, transitions: [
  { kind: 'problem', from: 'new', to: 'closed', terminal: true, reasons: ['done'], evidenceTypes: ['verification'] },
  { kind: 'suggestion', from: 'new', to: 'closed', terminal: true, reasons: ['done'], evidenceTypes: ['verification'] },
], evidenceTypes: ['verification'], limits: {
  page: 10, messages: 10, privateItems: 10, messageBytes: 32, noteBytes: 32,
  evidenceBytes: 32, referenceBytes: 32, rateWindowSeconds: 60, memberMutations: 10, ownerMutations: 10,
}, privacy: { retentionSeconds: 3600, batch: 10, requestStates: ['processing'], deleteAudit: true } };

test('member readiness requires every request and message table privilege', async () => {
  state.rows = [{ requests: true, messages: true, operation_refs: true, request_access: true, message_access: true, operation_ref_access: false }];
  assert.equal(await supportFeedbackSchemaReady({}, 'member'), false);
  assert.match(state.sql, /has_table_privilege\(current_user,to_regclass\('support\.requests'\),'SELECT'\)/);
  assert.match(state.sql, /has_table_privilege\(current_user,to_regclass\('support\.requests'\),'INSERT'\)/);
  assert.match(state.sql, /has_table_privilege\(current_user,to_regclass\('support\.requests'\),'UPDATE'\)/);
  assert.match(state.sql, /has_table_privilege\(current_user,to_regclass\('support\.messages'\),'SELECT'\)/);
  assert.match(state.sql, /has_table_privilege\(current_user,to_regclass\('support\.messages'\),'INSERT'\)/);
  assert.match(state.sql, /has_table_privilege\(current_user,to_regclass\('support\.operation_refs'\),'INSERT'\)/);
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

test('privacy readiness requires the support, identity lock, legal-hold and scrub-target capabilities', async () => {
  const allReady = {
    requests: true, messages: true, notes: true, evidence: true, decisions: true, operation_refs: true,
    privacy_requests: true, legal_holds: true, identity_users: true, audit_events: true, outbox_events: true, idempotency_keys: true,
    request_access: true, message_access: true, note_access: true, evidence_access: true, decision_access: true,
    operation_ref_access: true, privacy_request_access: true, legal_hold_access: true, identity_user_lock_access: true,
    audit_delete_access: true, outbox_delete_access: true, idempotency_delete_access: true,
  };
  state.rows = [{ ...allReady, outbox_delete_access: false }];
  assert.equal(await supportFeedbackPrivacySchemaState({}), 'incomplete');
  assert.match(state.sql, /system\.outbox_events/);
  assert.match(state.sql, /system\.idempotency_keys/);
  assert.match(state.sql, /identity\.users/);
  state.rows = [allReady];
  assert.equal(await supportFeedbackPrivacySchemaState({}), 'ready');
  assert.equal(await supportFeedbackPrivacyIsReady({}), true);
  state.rows = [{ ...allReady, requests: false, messages: false, notes: false, evidence: false, decisions: false, operation_refs: false }];
  assert.equal(await supportFeedbackPrivacySchemaState({}), 'absent');
  assert.equal(await supportFeedbackPrivacyIsReady({}), false);
  state.rows = [{ ...allReady, outbox_delete_access: false }];
  await assert.rejects(supportFeedbackPrivacyIsReady({}), { message: 'support_privacy_schema_unavailable' });
  state.rows = [];
  assert.equal(await supportFeedbackPrivacySchemaState({}), 'unavailable');
  await assert.rejects(supportFeedbackPrivacyIsReady({}), { message: 'support_privacy_schema_unavailable' });
  state.error = new Error('database unavailable');
  assert.equal(await supportFeedbackPrivacySchemaState({}), 'unavailable');
  state.error = null;
});

test('enabled runtime treats an absent optional proposal schema as unavailable', async () => {
  let readinessCalls = 0;
  const runtime = await createSupportFeedbackRuntime({ binding: {}, policy: JSON.stringify(policy), authentication: { member: async () => ({}), owner: async () => '' },
    channel: 'member', ready: async () => { readinessCalls += 1; return false; } });
  assert.equal(runtime, null);
  assert.equal(readinessCalls, 1);
});

test('valid serialized policy reaches readiness and creates both runtime channels without authenticating', async () => {
  for (const channel of ['member', 'owner']) {
    const binding = {}, calls = [];
    const runtime = await createSupportFeedbackRuntime({ binding, policy: JSON.stringify(policy),
      authentication: { member: async () => assert.fail('No request yet'), owner: async () => assert.fail('No request yet') },
      channel, ready: async (...args) => { calls.push(args); return true; } });
    assert.deepEqual(calls, [[binding, channel]]);
    assert.equal(typeof runtime?.supportOptions, 'function');
    assert.equal(typeof runtime?.submit, 'function');
    assert.equal(typeof runtime?.ownerDecision, 'function');
  }
});

test('runtime fails closed on readiness exceptions and rejects missing, oversized or invalid policies before database access', async () => {
  let readinessCalls = 0;
  const input = { binding: {}, authentication: { member: async () => ({}), owner: async () => '' }, channel: 'member',
    ready: async () => { readinessCalls += 1; throw new Error('PRIVATE_SENTINEL'); } };
  assert.equal(await createSupportFeedbackRuntime({ ...input, policy: JSON.stringify(policy) }), null);
  assert.equal(readinessCalls, 1);
  for (const invalid of [undefined, policy, '', '{', ' '.repeat(32 * 1024 + 1),
    JSON.stringify({ ...policy, initial: { problem: 'unknown', suggestion: 'new' } })]) {
    assert.equal(await createSupportFeedbackRuntime({ ...input, policy: invalid }), null);
  }
  assert.equal(readinessCalls, 1);
});
