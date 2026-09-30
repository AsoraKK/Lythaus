import assert from 'node:assert/strict';
import test from 'node:test';
import { idempotentAuthIntake } from '../src/auth-intake-runtime.ts';

function fixture() {
  let row, runs = 0;
  const input = {
    request: new Request('https://api.lythaus.test/auth', { headers: { 'idempotency-key': 'synthetic-operation-0001' } }),
    payload: { mode: 'register', email: 'synthetic@example.invalid', password: 'synthetic password' },
    scope: 'register', candidateVersion: 'synthetic-candidate', key: 'synthetic-key-not-production', database: {},
    work: async () => { runs++; return Response.json({ state: 'verification_required' }, { status: 202 }); },
  };
  const statements = [];
  const query = async (_binding, sql, values) => {
    statements.push({ sql, values });
    if (sql.startsWith('INSERT')) {
      if (row) return { rowCount: 0, rows: [] };
      row = { response: JSON.parse(values[2]), recent: true }; return { rowCount: 1, rows: [{ key: values[1] }] };
    }
    if (sql.startsWith('SELECT')) return { rows: row ? [row] : [] };
    row.response = JSON.parse(values[2]); return { rowCount: 1, rows: [] };
  };
  return { input, query, statements, get row() { return row; }, get runs() { return runs; } };
}

test('intake replays a completed neutral result without replaying Turnstile or storing credentials', async () => {
  const f = fixture();
  assert.equal((await idempotentAuthIntake(f.input, f.query)).status, 202);
  assert.equal((await idempotentAuthIntake(f.input, f.query)).status, 202);
  assert.equal(f.runs, 1);
  assert.deepEqual(Object.keys(f.row.response).sort(), ['requestHash', 'state']);
  const stored = JSON.stringify(f.statements);
  for (const secret of [f.input.payload.email, f.input.payload.password]) assert.ok(!stored.includes(secret));
  assert.ok(!stored.includes(f.input.key));
});

test('password reset replays neutral reset state and missing key preserves older client compatibility', async () => {
  const f = fixture(); f.input.scope = 'password_reset';
  await idempotentAuthIntake(f.input, f.query);
  assert.deepEqual(await (await idempotentAuthIntake(f.input, f.query)).json(), { state: 'reset_if_eligible' });
  f.input.request = new Request('https://api.lythaus.test/auth');
  await idempotentAuthIntake(f.input, f.query);
  assert.equal(f.runs, 2);
});

test('accepted reset retries retain the server operation reference without repeating recovery', async () => {
  const f = fixture();
  f.input.scope = 'password_reset';
  const reference = '3b8a5c5c-07c8-4b55-a0a5-7a66235648cc';
  f.input.work = async () => Response.json({state:'reset_if_eligible',correlationId:reference},{status:202});
  const first = await (await idempotentAuthIntake(f.input, f.query)).json();
  f.input.request.headers.set('x-correlation-id','57b98e96-7109-4a9b-a716-77ca7c5fc8dd');
  f.input.work = async () => { throw new Error('must not repeat recovery'); };
  const replay = await (await idempotentAuthIntake(f.input, f.query)).json();
  assert.deepEqual(first, {state:'reset_if_eligible',correlationId:reference});
  assert.deepEqual(replay, first);
  assert.equal(f.row.response.correlationId, reference);
  assert.deepEqual(Object.keys(f.row.response).sort(), ['correlationId','requestHash','state']);
});

test('payload, candidate, run and expiry bindings cannot be reused', async () => {
  for (const change of [f => { f.input.payload.password += '!'; }, f => { f.input.candidateVersion += 'other'; },
    f => { f.input.request.headers.set('x-lythaus-acceptance-run-id', 'another-run'); }, f => { f.row.recent = false; }]) {
    const f = fixture(); await idempotentAuthIntake(f.input, f.query); change(f);
    await assert.rejects(idempotentAuthIntake(f.input, f.query), /idempotency_key_conflict/);
    assert.equal(f.runs, 1);
  }
});

test('in-progress and ambiguous failures never execute a second domain operation', async () => {
  const f = fixture(); f.input.work = async () => { throw new Error('synthetic-timeout'); };
  await assert.rejects(idempotentAuthIntake(f.input, f.query), /synthetic-timeout/);
  assert.equal(f.row.response.state, 'outcome_unknown');
  await assert.rejects(idempotentAuthIntake(f.input, f.query), /idempotency_outcome_unknown/);
  f.row.response.state = 'processing';
  await assert.rejects(idempotentAuthIntake(f.input, f.query), /idempotency_outcome_unknown/);
});

test('invalid result, unavailable finalization, missing row and configuration fail closed', async () => {
  const f = fixture(); f.input.work = async () => new Response(null, { status: 500 });
  await assert.rejects(idempotentAuthIntake(f.input, f.query), /auth_intake_response_invalid/);
  const g = fixture();
  await assert.rejects(idempotentAuthIntake(g.input, async (...args) => {
    if (args[1].startsWith('UPDATE')) throw new Error('database-unavailable');
    return g.query(...args);
  }), /database-unavailable/);
  const h = fixture();
  await assert.rejects(idempotentAuthIntake(h.input, async () => ({ rowCount: 0, rows: [] })), /idempotency_key_conflict/);
  h.input.key = '';
  await assert.rejects(idempotentAuthIntake(h.input, h.query), /authentication_not_configured/);
});
