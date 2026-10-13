import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { inspectJobsReputationSession, handleJobsReputationSessionDiagnostic, JOBS_SESSION_CATALOG_QUERIES } from '../src/reputation-session-diagnostic.ts';
import { handleJobsReputationSessionBridge } from '../../lythaus-public-api/src/jobs-reputation-session-bridge.ts';
import { JOBS_SESSION_PATH, JOBS_SESSION_SCHEMA, JOBS_SESSION_RECEIPT_BYTES, observedJobsSession, sanitizedJobsSessionReceipt } from '../../../packages/contracts/src/jobs-reputation-session.ts';
import { version, otherVersion, release, metadata, rows } from './reputation-session-fixture.mjs';
import { pinnedDriverFixture } from './reputation-session-driver-fixture.mjs';

const binding = { connectionString: 'postgres://synthetic:SYNTHETIC_CREDENTIAL@fixture.psdb.cloud/postgres?sslmode=verify-full' };
const worker = { id: version, tag: release };
const request = (options = {}) => new Request('https://api.synthetic.invalid' + JOBS_SESSION_PATH, {
  headers: { authorization: 'Bearer synthetic-readiness', 'Cloudflare-Workers-Version-Overrides': `lythaus-public-api-development="${version}", lythaus-jobs-development="${version}"` }, ...options,
});
function fixture(override = {}) {
  const trace = [];
  let index = 0, config;
  const client = new EventEmitter();
  let resolveClosed;
  const transport = { closed: false, destroyCalls: 0, closeCalls: 0 };
  client.connection = new EventEmitter();
  client.connection.stream = new EventEmitter();
  const socket = { closed: new Promise(resolve => { resolveClosed = resolve; }), close() {
    transport.closeCalls++; transport.closed = true; resolveClosed(); client.connection.emit('end');
  } };
  client.connection.stream._cfSocket = socket;
  client.connection.stream.destroy = () => { transport.destroyCalls++; if (override.destroy) return override.destroy(); socket.close(); };
  client.connect = async () => { trace.push('connect'); return override.connect?.(); };
  client.query = async sql => {
    trace.push(sql);
    if (override.query) return override.query(sql, index++);
    if (sql === 'BEGIN READ ONLY') return { rows: [], command: 'BEGIN' };
    if (sql === 'ROLLBACK') return { rows: [], command: 'ROLLBACK' };
    assert.equal(sql, JOBS_SESSION_CATALOG_QUERIES[index]);
    return { command: 'SELECT', rows: [{ ...rows[index++], secret: 'SYNTHETIC_CREDENTIAL' }] };
  };
  client.end = async () => { trace.push('end'); await override.end?.(); socket.close(); };
  return { client, trace, transport, get config() { return config; }, dependencies: {
    createClient: value => { config = value; return client; }, timeoutMs: 5_000, cleanupMs: 10,
  } };
}

test('one actual-client-shaped read-only transaction performs only four fixed catalog reads and rolls back', async () => {
  const f = fixture();
  const result = await inspectJobsReputationSession(binding, f.dependencies);
  assert.equal(result.status, 'observed'); assert.equal(result.prerequisitesMet, true);
  assert.equal(result.rollbackConfirmed, true);
  assert.equal(f.transport.closed, true);
  assert.deepEqual(f.trace, ['connect', 'BEGIN READ ONLY', ...JOBS_SESSION_CATALOG_QUERIES, 'ROLLBACK', 'end']);
  assert.equal(new URL(f.config.connectionString).searchParams.get('sslmode'), 'verify-full');
  assert.equal(f.config.connectionTimeoutMillis, 5_000); assert.equal(f.config.query_timeout, 5_000);
  assert.ok(!JSON.stringify(result).includes('SYNTHETIC_CREDENTIAL'));
  assert.ok(JOBS_SESSION_CATALOG_QUERIES.every(sql => /^SELECT /.test(sql)));
  assert.ok(JOBS_SESSION_CATALOG_QUERIES.every(sql => !/FROM identity\.users|lock_reputation_subject|COMMIT|SET ROLE/i.test(sql)));
});

test('catalog errors remain sanitized and force rollback and close', async () => {
  for (const code of ['42501', '42P01', 'unknown']) {
    const f = fixture({ query: async sql => {
      if (sql === 'BEGIN READ ONLY' || sql === 'ROLLBACK') return { command: sql.split(' ')[0], rows: [] };
      throw Object.assign(new Error('SYNTHETIC_CREDENTIAL secret host SQL'), { code });
    } });
    const result = await inspectJobsReputationSession(binding, f.dependencies);
    assert.deepEqual(result, { schemaVersion: JOBS_SESSION_SCHEMA, status: 'unavailable',
      diagnosticCode: code === '42501' ? 'insufficient_privilege' : 'catalog_unavailable' });
    assert.deepEqual(f.trace.slice(-2), ['ROLLBACK', 'end']);
  }
});

test('rollback failure never produces a successful receipt', async () => {
  let index = 0;
  const f = fixture({ query: async sql => {
    if (sql === 'ROLLBACK') throw new Error('SYNTHETIC_CREDENTIAL');
    return sql === 'BEGIN READ ONLY' ? { command: 'BEGIN', rows: [] } : { command: 'SELECT', rows: [rows[index++]] };
  } });
  const receipt = await inspectJobsReputationSession(binding, f.dependencies);
  assert.equal(receipt.status, 'unavailable'); assert.equal(receipt.diagnosticCode, 'rollback_unconfirmed');
  assert.equal(f.trace.at(-1), 'end');
});

test('an unconfirmed BEGIN cannot run catalog queries or yield observed evidence', async () => {
  const f = fixture({ query: async sql => ({ command: sql === 'ROLLBACK' ? 'ROLLBACK' : 'COMMIT', rows: [] }) });
  assert.equal((await inspectJobsReputationSession(binding, f.dependencies)).status, 'unavailable');
  assert.deepEqual(f.trace, ['connect', 'BEGIN READ ONLY', 'ROLLBACK', 'end']);
});

for (const phase of ['connect', 'begin', 'catalog', 'rollback', 'end']) {
  test(`a stalled ${phase} is bounded and cannot claim observation`, async () => {
    let index = 0;
    const stall = () => new Promise(() => {});
    const f = fixture({ connect: phase === 'connect' ? stall : undefined, end: phase === 'end' ? stall : undefined,
      query: async sql => {
        if ((phase === 'begin' && sql === 'BEGIN READ ONLY') || (phase === 'rollback' && sql === 'ROLLBACK')
          || (phase === 'catalog' && sql.startsWith('SELECT'))) return stall();
        if (sql === 'BEGIN READ ONLY' || sql === 'ROLLBACK') return { command: sql.split(' ')[0], rows: [] };
        return { command: 'SELECT', rows: [rows[index++]] };
      } });
    const receipt = await inspectJobsReputationSession(binding, { ...f.dependencies, timeoutMs: 10, cleanupMs: 5, now: () => 0 });
    assert.equal(receipt.status, 'unavailable'); assert.equal(receipt.diagnosticCode, 'timeout');
    assert.ok(f.trace.includes('end')); assert.ok(!f.trace.includes('COMMIT'));
    assert.equal(f.transport.closed, true, 'the deadline must close the transport, not just stop awaiting');
    if (phase !== 'connect') assert.ok(f.trace.includes('ROLLBACK'));
    if (phase === 'end') assert.doesNotThrow(() => f.client.emit('error', new Error('late synthetic transport error')));
  });
}

test('the cumulative deadline prevents additional catalog reads after budget exhaustion', async () => {
  let now = 0;
  const f = fixture({ query: async sql => {
    if (sql === 'BEGIN READ ONLY' || sql === 'ROLLBACK') return { command: sql.split(' ')[0], rows: [] };
    now = 101;
    return { command: 'SELECT', rows: [rows[0]] };
  } });
  const receipt = await inspectJobsReputationSession(binding, { ...f.dependencies, timeoutMs: 100, now: () => now });
  assert.equal(receipt.status, 'unavailable'); assert.equal(receipt.diagnosticCode, 'timeout');
  assert.deepEqual(f.trace, ['connect', 'BEGIN READ ONLY', JOBS_SESSION_CATALOG_QUERIES[0], 'ROLLBACK', 'end']);
});

test('deadline exhaustion after rollback still closes the connection', async () => {
  let now = 0, index = 0;
  const f = fixture({ query: async sql => {
    if (sql === 'ROLLBACK') { now = 101; return { command: 'ROLLBACK', rows: [] }; }
    if (sql === 'BEGIN READ ONLY') return { command: 'BEGIN', rows: [] };
    return { command: 'SELECT', rows: [rows[index++]] };
  } });
  const receipt = await inspectJobsReputationSession(binding, { ...f.dependencies, timeoutMs: 100, now: () => now });
  assert.equal(receipt.status, 'unavailable'); assert.equal(receipt.diagnosticCode, 'timeout');
  assert.equal(f.trace.at(-1), 'end');
  assert.equal(f.transport.closed, true);
});

test('successful close retains a retired client sink and retires delayed transport events', async () => {
  const f = fixture();
  assert.equal((await inspectJobsReputationSession(binding, f.dependencies)).status, 'observed');
  assert.equal(f.transport.closed, true);
  assert.doesNotThrow(() => f.client.emit('error', new Error('SYNTHETIC_CREDENTIAL late close')));
  assert.equal(f.client.connection.stream.emit('error', new Error('SYNTHETIC_CREDENTIAL late read')), false);
  assert.equal(f.client.connection.stream.emit('data', Buffer.from('late data')), false);
});

for (const phase of ['throw', 'reject', 'destroy-throw']) test(`failed ${phase} end forces actual native transport close`, async () => {
  const f = fixture({ end: () => {
    if (phase === 'reject') return Promise.reject(new Error('SYNTHETIC_CREDENTIAL'));
    throw new Error('SYNTHETIC_CREDENTIAL');
  }, destroy: phase === 'destroy-throw' ? () => { throw new Error('synthetic pg-cloudflare destroy/write exception'); } : undefined });
  const receipt = await inspectJobsReputationSession(binding, f.dependencies);
  assert.equal(receipt.status, 'unavailable');
  assert.equal(f.transport.closed, true); assert.ok(f.transport.destroyCalls > 0); assert.ok(f.transport.closeCalls > 0);
  assert.doesNotThrow(() => f.client.emit('error', new Error('delayed synthetic error')));
  assert.ok(!JSON.stringify(receipt).includes('SYNTHETIC_CREDENTIAL'));
});

test('pinned pg and pg-cloudflare transport retire delayed read and prior closed errors after successful end', async () => {
  const f = pinnedDriverFixture();
  const receipt = await inspectJobsReputationSession(binding, f.dependencies);
  assert.equal(receipt.status, 'observed', JSON.stringify({ receipt, state: f.state })); assert.equal(receipt.rollbackConfirmed, true);
  assert.equal(f.state.nativeClosed, true); assert.equal(f.state.closeCalls, 1);
  assert.equal(f.state.reads, 1);
  await f.delayedErrors();
  assert.doesNotThrow(() => f.client.emit('error', new Error('late retired client error')));
  assert.equal(f.stream.emit('error', new Error('late retired transport error')), false);
});

for (const mode of ['hang', 'reject', 'write-throw', 'destroy-throw']) {
  test(`pinned driver ${mode} cleanup forces native close and retires late failures`, async () => {
    const f = pinnedDriverFixture(mode);
    const receipt = await inspectJobsReputationSession(binding, f.dependencies);
    assert.equal(receipt.status, 'unavailable'); assert.equal(f.state.nativeClosed, true);
    assert.ok(f.state.closeCalls > 0); assert.ok(f.state.destroyCalls > 0);
    await f.delayedErrors();
    assert.ok(!JSON.stringify(receipt).includes('SYNTHETIC_CREDENTIAL'));
  });
}

test('missing or malformed catalog data cannot become observed evidence', async () => {
  const f = fixture({ query: async sql => ({ command: sql === 'BEGIN READ ONLY' ? 'BEGIN' : sql === 'ROLLBACK' ? 'ROLLBACK' : 'SELECT', rows: [] }) });
  assert.equal((await inspectJobsReputationSession(binding, f.dependencies)).status, 'unavailable');
  assert.equal(observedJobsSession({ ...metadata, readOnly: true, memberships: '0' }), null);
  assert.equal(observedJobsSession({ ...metadata, readOnly: true, usersUpdate: 'false' }), null);
  assert.equal(observedJobsSession({ ...metadata, readOnly: true, sessionRole: undefined }), null);
});

test('role isolation path and privilege mismatches stay observable failures with unknown strings masked', () => {
  const valid = { ...metadata, readOnly: true };
  for (const change of [{ sessionRole: 'SYNTHETIC_CREDENTIAL' }, { currentRole: 'postgres' },
    { searchPath: 'SYNTHETIC_CREDENTIAL' }, { isolation: 'repeatable read' }, { defaultIsolation: 'serializable' },
    { superuser: true }, { bypassRls: true }, { memberships: 1 }, { usersUpdate: true },
    { usersIdSelect: false }, { usersStatusSelect: false }, { trustUsage: false }, { trustCreate: true },
    { usersRls: true }, { usersForceRls: true }, { readOnly: false }]) {
    const receipt = observedJobsSession({ ...valid, ...change, extra: 'SYNTHETIC_CREDENTIAL' });
    assert.equal(receipt.status, 'observed'); assert.equal(receipt.prerequisitesMet, false);
    assert.ok(!JSON.stringify(receipt).includes('SYNTHETIC_CREDENTIAL'));
  }
  const forged = { ...observedJobsSession({ ...valid, usersUpdate: true }), prerequisitesMet: true, secret: 'SYNTHETIC_CREDENTIAL' };
  assert.equal(sanitizedJobsSessionReceipt(forged).prerequisitesMet, false);
  assert.equal(sanitizedJobsSessionReceipt({ ...forged, rollbackConfirmed: false }), null);
});

test('Jobs handler denies unauthorized disabled wrong-method malformed and unpinned requests before connecting', async () => {
  let calls = 0;
  const env = { DB_JOBS_FRESH: binding, WORKER_VERSION: worker, JOBS_REPUTATION_SESSION_DIAGNOSTIC_ENABLED: 'true' };
  const dependencies = { createClient: () => { calls++; assert.fail('must not connect'); } };
  const cases = [[request(), false, env, 404], [request(), true, { ...env, JOBS_REPUTATION_SESSION_DIAGNOSTIC_ENABLED: undefined }, 404],
    [request({ method: 'POST' }), true, env, 404], [request({ headers: {} }), true, env, 409],
    [request({ headers: { 'Cloudflare-Workers-Version-Overrides': `lythaus-jobs-development="${otherVersion}"` } }), true, env, 409],
    [new Request('https://jobs.synthetic.invalid' + JOBS_SESSION_PATH + '?sql=DELETE'), true, env, 400]];
  for (const [req, authorized, config, status] of cases) assert.equal((await handleJobsReputationSessionDiagnostic(req, config, authorized, dependencies)).status, status);
  assert.equal(calls, 0);
});

function bridge(body, fetchOverride) {
  const calls = [];
  return { calls, env: { WORKER_VERSION: worker, JOBS_REPUTATION_SESSION_DIAGNOSTIC_ENABLED: 'true',
    JOBS_COMPATIBILITY: { fetch: async (url, init) => { calls.push({ url, init }); return fetchOverride ? fetchOverride(init) : Response.json(body); } } } };
}
const envelope = () => ({ service: 'lythaus-jobs', workerVersionId: version, releaseTag: release,
  receipt: observedJobsSession({ ...metadata, readOnly: true }), secret: 'SYNTHETIC_CREDENTIAL' });

test('bridge sends one fixed private GET and returns only the verified sanitized receipt', async () => {
  const f = bridge(envelope());
  const response = await handleJobsReputationSessionBridge(request({ headers: {
    authorization: 'Bearer synthetic-readiness', 'x-arbitrary': 'SYNTHETIC_CREDENTIAL',
    'Cloudflare-Workers-Version-Overrides': `lythaus-public-api-development="${version}", lythaus-jobs-development="${version}"`,
  } }), f.env, true);
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal((await response.json()).receipt.prerequisitesMet, true);
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].url, 'https://lythaus-jobs.internal' + JOBS_SESSION_PATH);
  assert.equal(f.calls[0].init.method, 'GET'); assert.equal(f.calls[0].init.redirect, 'manual');
  assert.deepEqual(Object.keys(f.calls[0].init.headers).sort(), ['Cloudflare-Workers-Version-Overrides', 'accept', 'authorization']);
});

test('bridge authorization flag methods overrides and SQL inputs cannot contact Jobs', async () => {
  const f = bridge(envelope());
  for (const [req, env, auth, status] of [[request(), f.env, false, 404],
    [request(), { ...f.env, JOBS_REPUTATION_SESSION_DIAGNOSTIC_ENABLED: 'false' }, true, 404],
    [request({ method: 'POST' }), f.env, true, 404], [request({ headers: {} }), f.env, true, 409],
    [request({ headers: { 'Cloudflare-Workers-Version-Overrides': `unrelated-worker="${version}"` } }), f.env, true, 409],
    [new Request('https://api.synthetic.invalid' + JOBS_SESSION_PATH + '?role=postgres&sql=DROP'), f.env, true, 400]]) {
    assert.equal((await handleJobsReputationSessionBridge(req, env, auth)).status, status);
  }
  assert.equal(f.calls.length, 0);
});

test('missing malformed mismatched or duplicate Public pins reject before contacting Jobs', async () => {
  const f = bridge(envelope());
  for (const pins of [`lythaus-jobs-development="${version}"`,
    `lythaus-public-api-development="invalid", lythaus-jobs-development="${version}"`,
    `lythaus-public-api-development="${otherVersion}", lythaus-jobs-development="${version}"`,
    `lythaus-public-api-development="${version}", lythaus-public-api-development="${version}", lythaus-jobs-development="${version}"`]) {
    const response = await handleJobsReputationSessionBridge(request({ headers: { authorization: 'Bearer synthetic-readiness',
      'Cloudflare-Workers-Version-Overrides': pins } }), f.env, true);
    assert.equal(response.status, 409); assert.deepEqual(await response.json(), { error: 'diagnostic_version_unavailable' });
  }
  assert.equal(f.calls.length, 0);
});

test('bridge rejects unbound malformed redirects oversized receipts and raw service errors', async () => {
  const cases = [() => Response.json({ ...envelope(), workerVersionId: otherVersion }),
    () => Response.json({ ...envelope(), receipt: { status: 'observed', rollbackConfirmed: true } }),
    () => new Response('SYNTHETIC_CREDENTIAL', { status: 302, headers: { location: 'https://unrelated.invalid' } }),
    () => Response.json({ secret: 'SYNTHETIC_CREDENTIAL'.repeat(JOBS_SESSION_RECEIPT_BYTES) }),
    () => { throw new Error('SYNTHETIC_CREDENTIAL'); }];
  for (const fetch of cases) {
    const f = bridge(null, fetch), response = await handleJobsReputationSessionBridge(request(), f.env, true);
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: 'diagnostic_unavailable' });
  }
});

for (const phase of ['fetch', 'body']) test(`bridge bounds stalled ${phase} and aborts the private request`, async () => {
  let signal;
  const f = bridge(null, init => {
    signal = init.signal;
    return phase === 'fetch' ? new Promise(() => {}) : new Response(new ReadableStream({ start() {} }), { headers: { 'content-type': 'application/json' } });
  });
  const response = await handleJobsReputationSessionBridge(request(), f.env, true, 10);
  assert.equal(response.status, 504); assert.deepEqual(await response.json(), { error: 'diagnostic_timeout' });
  assert.equal(signal.aborted, true);
});

test('a fetch that resolves after timeout cannot consume a late receipt', async () => {
  let resolveFetch, reads = 0;
  const f = bridge(null, () => new Promise(resolve => { resolveFetch = resolve; }));
  assert.equal((await handleJobsReputationSessionBridge(request(), f.env, true, 10)).status, 504);
  resolveFetch({ status: 200, headers: new Headers({ 'content-type': 'application/json' }),
    body: { getReader() { reads++; assert.fail('late receipt must not be read'); } } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(reads, 0);
});
