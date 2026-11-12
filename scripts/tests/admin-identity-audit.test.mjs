import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { collectAdminIdentityAudit } from '../ci/collect-admin-identity-audit.mjs';

const account = 'e5b7ae46e04698f507b7e4b3d4ef1af0';
const base = `https://api.cloudflare.com/client/v4/accounts/${account}`;
const ui = '1'.repeat(32); const api = '2'.repeat(32);
const currentEmail = 'current-operator@example.invalid';
const oldEmail = 'previous-operator@example.invalid';
const currentId = '11111111-1111-4111-8111-111111111111';
const oldId = '22222222-2222-4222-8222-222222222222';
const token = 'synthetic-provider-credential-canary';
const sensitive = 'synthetic-secret-value-never-emitted';
const now = Date.parse('2026-11-12T20:00:00.000Z');
const environment = {
  CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: token,
  EXPECTED_ADMIN_API_AUDIENCE_SNAPSHOT: 'synthetic-audience', GITHUB_SHA: 'a'.repeat(40),
  GITHUB_REPOSITORY_ID: '1010752912', GITHUB_REF: 'refs/heads/main', REF_PROTECTED: 'true',
};
const allow = email => ({ decision: 'allow', include: [{ email: { email } }], exclude: [], require: [] });
const json = (result, extra = {}) => new Response(JSON.stringify({ success: true, result, ...extra }), { status: 200 });
const list = result => json(result, { result_info: { total_count: result.length } });
function event(id, at, uri, request = null, extra = {}) {
  return { id, account: { id: account }, action: { time: at, result: 'success', type: 'update' },
    raw: { method: 'PUT', uri, user_agent: sensitive },
    actor: { email: currentEmail, token_id: sensitive }, resource: { request, response: { secret: sensitive } }, ...extra };
}
function events() {
  return [
    event('upload', '2026-10-27T20:30:00Z', `${base}/workers/scripts/lythaus-admin-api-development/versions`, { secret: sensitive }),
    event('secret', '2026-10-26T12:00:00Z', `${base}/workers/scripts/lythaus-admin-api-development/secrets`, { name: 'ACCESS_SUBJECT_HMAC_KEY', text: sensitive }),
    event('named-secret', '2026-10-25T12:00:00Z', `/accounts/${account}/workers/scripts/lythaus-admin-api-development/secrets/ACCESS_SUBJECT_HMAC_KEY`),
    event('other-worker', '2026-10-24T12:00:00Z', `${base}/workers/scripts/unrelated-worker/secrets/ACCESS_SUBJECT_HMAC_KEY`, { text: sensitive }),
    event('old-ui', '2026-08-02T12:00:00Z', `${base}/access/apps/${ui}/policies/${'3'.repeat(32)}`, allow(oldEmail)),
    event('old-api', '2026-08-01T12:00:00Z', `${base}/access/apps/${api}/policies/${'4'.repeat(32)}`, { body: JSON.stringify(allow(oldEmail)) }),
  ];
}
function fixture({ auditEvents = events(), auditPages, intercept = () => undefined } = {}) {
  const calls = [];
  const fetchImpl = async (input, options) => {
    const url = new URL(input); calls.push(url);
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store'); assert.equal(options.headers.authorization, `Bearer ${token}`);
    assert.ok(url.href.startsWith(`${base}/`));
    const overridden = intercept(url, options, calls);
    if (overridden !== undefined) return overridden;
    if (url.pathname.endsWith('/access/apps')) return list([
      { id: ui, name: 'Lythaus Admin UI', domain: 'admin.lythaus.co' },
      { id: api, name: 'Lythaus Admin API', domain: 'admin-api.lythaus.co', aud: 'synthetic-audience' },
    ]);
    if (url.pathname.endsWith('/policies')) return list([allow(currentEmail), { decision: 'deny', include: [{ everyone: {} }] }]);
    if (url.pathname.endsWith('/access/users')) {
      assert.equal(url.searchParams.get('page'), '1');
      const email = url.searchParams.get('email');
      assert.ok([currentEmail, oldEmail].includes(email));
      const current = email === currentEmail;
      return list([{ email, uid: current ? currentId : oldId, id: current ? currentId : oldId,
        created_at: current ? '2026-11-07T12:00:00Z' : '2026-08-01T12:00:00Z', secret: sensitive }]);
    }
    if (url.pathname.endsWith('/logs/audit')) {
      assert.equal(url.searchParams.get('since'), '2026-07-27T00:00:00.000Z');
      assert.equal(url.searchParams.get('before'), new Date(now).toISOString());
      const page = url.searchParams.get('cursor') ? 1 : 0;
      const selected = auditPages?.[page] ?? { rows: auditEvents, after: null };
      return json(selected.rows, { result_info: { cursors: { after: selected.after } } });
    }
    throw new Error(`unexpected synthetic path ${url.pathname}`);
  };
  return { calls, fetchImpl };
}
async function run(options = {}, changes = {}) {
  const mock = fixture(options);
  const report = await collectAdminIdentityAudit({ environment, fetchImpl: mock.fetchImpl, now, ...changes });
  return { report, calls: mock.calls };
}
function sanitized(report) {
  const text = JSON.stringify(report);
  for (const value of [token, sensitive, currentEmail, oldEmail, currentId, oldId, 'synthetic-audience']) assert.ok(!text.includes(value));
  assert.equal(report.providerMutations, false); assert.equal(report.databaseWrites, false);
  assert.equal(report.rootCauseCertified, false); assert.equal(report.rawIdentitiesEmitted, false);
}

test('compares only policy-derived identities and projects audit metadata without exporting identity or secret bodies', async () => {
  const { report, calls } = await run();
  assert.equal(report.status, 'READ_ONLY_METADATA_COLLECTED_NOT_ROOT_CAUSE_CERTIFICATION');
  assert.deepEqual(report.currentIdentity, { exists: true, createdAfterBootstrap: true });
  assert.deepEqual(report.previousIdentity, { historicalSoleAllowlistObserved: true, exists: true, createdBeforeBootstrap: true });
  assert.equal(report.identityIdentifiersDiffer, true);
  assert.equal(report.auditHistory.workerUploadEventsObserved, 1);
  assert.equal(report.auditHistory.policyWriteEventsObserved, 2);
  assert.deepEqual(report.auditHistory.secretWriteEvents.map(row => row.subjectKeyNamedInMetadata), [false, true]);
  assert.equal(report.keyValueContinuity, 'NOT_ESTABLISHED_FROM_METADATA');
  assert.equal(report.auditHistory.providerRetentionCoversWindow, 'NOT_ESTABLISHED');
  assert.equal(calls.length, 6); sanitized(report);
});

test('empty retained history never certifies key continuity or invents a former identity', async () => {
  const { report, calls } = await run({ auditEvents: [] });
  assert.equal(report.auditHistory.paginationExhausted, true);
  assert.equal(report.identityIdentifiersDiffer, null);
  assert.equal(report.previousIdentity.exists, null);
  assert.equal(report.keyValueContinuity, 'NOT_ESTABLISHED_FROM_METADATA');
  assert.equal(calls.filter(url => url.pathname.endsWith('/access/users')).length, 1); sanitized(report);
});

test('a changed email with the same provider user ID is reported as identity continuity rather than a new subject', async () => {
  const { report } = await run({ intercept: url => url.pathname.endsWith('/access/users')
    ? list([{ email: url.searchParams.get('email'), id: oldId, uid: oldId, created_at: '2026-08-01T12:00:00Z' }]) : undefined });
  assert.equal(report.identityIdentifiersDiffer, false);
  assert.equal(report.currentIdentity.createdAfterBootstrap, false); sanitized(report);
});

test('only a unique former sole human email shared by both exact applications can trigger a previous-identity read', async () => {
  const rows = events(); rows[5].resource.request = allow('someone-else@example.invalid');
  const { report, calls } = await run({ auditEvents: rows });
  assert.equal(report.previousIdentity.historicalSoleAllowlistObserved, false);
  assert.equal(calls.filter(url => url.pathname.endsWith('/access/users')).length, 1); sanitized(report);
});

test('follows cursors exactly once and preserves chronological provenance across pages', async () => {
  const rows = events();
  const { report } = await run({ auditPages: [{ rows: rows.slice(0, 3), after: 'synthetic-next' }, { rows: rows.slice(3), after: null }] });
  assert.equal(report.auditHistory.pages, 2); assert.equal(report.auditHistory.records, 6);
  assert.equal(report.auditHistory.paginationExhausted, true); sanitized(report);
});

test('a denied metadata read stops without a retry or subsequent endpoint probes', async () => {
  const { report, calls } = await run({ intercept: url => url.pathname.endsWith('/access/users')
    ? new Response(JSON.stringify({ errors: [{ message: `${sensitive} ${token}` }] }), { status: 403 }) : undefined });
  assert.equal(report.status, 'BLOCKED'); assert.equal(report.providerHttpStatus, 403);
  assert.deepEqual(report.blockers, ['audit_provider_read_failed']); assert.equal(calls.length, 4); sanitized(report);
});

test('retains the current identity observation if the separate audit-log permission is denied', async () => {
  const { report, calls } = await run({ intercept: url => url.pathname.endsWith('/logs/audit')
    ? new Response(sensitive, { status: 403 }) : undefined });
  assert.equal(report.currentIdentity.createdAfterBootstrap, true);
  assert.equal(report.providerHttpStatus, 403); assert.equal(calls.length, 5); sanitized(report);
});

test('transport exception text and invalid source context are never copied into the report', async () => {
  const { report } = await run({ intercept: () => { throw new Error(`${token} ${sensitive}`); } });
  assert.deepEqual(report.blockers, ['audit_transport_failed']); sanitized(report);
  const invalid = await run({}, { environment: { ...environment, GITHUB_SHA: sensitive } });
  assert.equal(invalid.report.sourceSha, null); assert.equal(invalid.calls.length, 0); sanitized(invalid.report);
});

test('rejects truncated Access policy inventories before any user lookup', async () => {
  const { report, calls } = await run({ intercept: url => url.pathname.endsWith('/policies')
    ? json([allow(currentEmail)], { result_info: { total_count: 2 } }) : undefined });
  assert.deepEqual(report.blockers, ['access_policy_pagination_unverified']); assert.equal(calls.length, 2); sanitized(report);
});

test('rejects ignored identity filters, ambiguous IDs, missing creation dates and incomplete user inventories', async () => {
  for (const [row, count] of [
    [{ email: oldEmail, uid: currentId, created_at: '2026-11-07T12:00:00Z' }, 1],
    [{ email: currentEmail, uid: currentId, id: oldId, created_at: '2026-11-07T12:00:00Z' }, 1],
    [{ email: currentEmail, uid: currentId }, 1],
    [{ email: currentEmail, uid: currentId, created_at: '2026-11-07T12:00:00Z' }, 2],
  ]) {
    const { report } = await run({ intercept: url => url.pathname.endsWith('/access/users')
      ? json([row], { result_info: { total_count: count } }) : undefined });
    assert.equal(report.status, 'BLOCKED'); sanitized(report);
  }
});

test('rejects duplicate, cross-account, out-of-window and out-of-order audit rows', async () => {
  const rows = events();
  for (const auditEvents of [[rows[0], rows[0]],
    [{ ...rows[0], account: { id: 'other-account' } }],
    [event('future', '2026-12-01T00:00:00Z', '/')],
    [rows[1], rows[0]],
  ]) {
    const { report } = await run({ auditEvents });
    assert.deepEqual(report.blockers, ['audit_event_provenance_invalid']); sanitized(report);
  }
});

test('documented terminal cursor omission is accepted without claiming retention or key continuity', async () => {
  for (const result_info of [{ cursors: {} }, {}]) {
    const { report } = await run({ intercept: url => url.pathname.endsWith('/logs/audit')
      ? json(events(), { result_info }) : undefined });
    assert.equal(report.status, 'READ_ONLY_METADATA_COLLECTED_NOT_ROOT_CAUSE_CERTIFICATION');
    assert.equal(report.auditHistory.terminalCursorForm, 'DOCUMENTED_CURSOR_OMISSION');
    assert.equal(report.auditHistory.providerRetentionCoversWindow, 'NOT_ESTABLISHED');
    assert.equal(report.keyValueContinuity, 'NOT_ESTABLISHED_FROM_METADATA'); sanitized(report);
  }
});

test('flat Cloudflare cursor pages are bounded and record their actual terminal form', async () => {
  let pages = 0;
  const { report } = await run({ intercept: url => {
    if (!url.pathname.endsWith('/logs/audit')) return undefined;
    pages++;
    const rows = events();
    return json(pages === 1 ? rows.slice(0, 3) : rows.slice(3),
      { result_info: { cursor: pages === 1 ? 'flat-next' : null } });
  } });
  assert.equal(pages, 2); assert.equal(report.auditHistory.records, 6);
  assert.equal(report.auditHistory.terminalCursorForm, 'FLAT_CURSOR_END'); sanitized(report);
});

test('missing or conflicting pagination containers, contradictory totals and cursor replay remain blocked', async () => {
  for (const extra of [{}, { result_info: { cursors: null } },
    { result_info: { cursors: {}, cursor: 'ambiguous' } }, { result_info: { total_count: 100 } }]) {
    const { report } = await run({ intercept: url => url.pathname.endsWith('/logs/audit') ? json([], extra) : undefined });
    assert.equal(report.status, 'BLOCKED'); assert.equal(report.auditHistory.paginationExhausted, false); sanitized(report);
    assert.equal(report.lastReadKind, 'ACCOUNT_AUDIT_HISTORY');
  }
  const repeated = await run({ auditPages: [{ rows: [events()[0]], after: 'repeat' }, { rows: [events()[1]], after: 'repeat' }] });
  assert.deepEqual(repeated.report.blockers, ['audit_cursor_invalid']);
  assert.equal(repeated.report.auditHistory.paginationExhausted, false); sanitized(repeated.report);
});

test('the history page cap stops collection without an unbounded query or a coverage claim', async () => {
  let pages = 0;
  const { report, calls } = await run({ intercept: url => {
    if (!url.pathname.endsWith('/logs/audit')) return undefined;
    pages++;
    return json([event(`bounded-${pages}`, new Date(now - pages).toISOString(), '/')],
      { result_info: { cursors: { after: `bounded-cursor-${pages}` } } });
  } });
  assert.equal(pages, 20); assert.equal(calls.length, 24);
  assert.deepEqual(report.blockers, ['audit_page_limit_reached']);
  assert.equal(report.auditHistory.paginationExhausted, false); sanitized(report);
});

test('redirected or oversized provider responses stop before their contents can enter a report', async () => {
  for (const response of [new Response('x'.repeat(2 * 1024 * 1024 + 1)),
    Object.defineProperty(new Response('{}'), 'redirected', { value: true })]) {
    const { report, calls } = await run({ intercept: () => response });
    assert.equal(report.status, 'BLOCKED'); assert.equal(calls.length, 1); sanitized(report);
  }
});

test('unprotected contexts and wrong accounts cannot reach the provider', async () => {
  for (const change of [{ REF_PROTECTED: 'false' }, { GITHUB_REF: 'refs/heads/other' },
    { GITHUB_REPOSITORY_ID: 'other' }, { CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32) }]) {
    const { report, calls } = await run({}, { environment: { ...environment, ...change } });
    assert.deepEqual(report.blockers, ['protected_lythaus_audit_context_required']); assert.equal(calls.length, 0);
  }
});

test('workflow uses existing credentials on protected main and uploads only the bounded sanitized report', () => {
  const source = fs.readFileSync('.github/workflows/cloudflare-admin-access-readonly.yml', 'utf8');
  assert.match(source, /audit_identity_history:/); assert.match(source, /default: false/);
  assert.match(source, /secrets\.CLOUDFLARE_API_TOKEN/); assert.match(source, /REF_PROTECTED:/);
  assert.match(source, /ADMIN_IDENTITY_AUDIT_REPORT: \$\{\{ runner\.temp \}\}\/admin-identity-audit\.json/);
  assert.match(source, /if: always\(\) && inputs\.audit_identity_history == true/);
  assert.doesNotMatch(source, /PLANETSCALE|secrets\.ACCESS_SUBJECT_HMAC_KEY|contents: write|actions: write/);
});
