import assert from 'node:assert/strict';
import test from 'node:test';
import { handleMonthlyReputationRead } from '../src/monthly-reputation-routes.ts';
import { MONTHLY_REPUTATION_CATALOGUE_HASH, MONTHLY_REPUTATION_POLICY_VERSION } from '../../../packages/contracts/src/monthly-reputation-policy.ts';
import { MONTHLY_REPUTATION_DECISIONS } from '../../../packages/contracts/src/monthly-reputation-decisions.ts';
import { REWARDS_V05_CONFIGURATION, calculateMonthlyRewardsV05 } from '../../../packages/contracts/src/monthly-rewards-v05.ts';
import { PROPOSED_MONTHLY_MAINTENANCE_RULES } from '../../../packages/contracts/src/monthly-maintenance-policy.ts';

const owner = '01900000-0000-7000-8000-000000000001';
const other = '01900000-0000-7000-8000-000000000002';
const snapshotId = '01900000-0000-7000-8000-000000000010';
const sourceId = '01900000-0000-7000-8000-000000000011';
const assessmentId = '01900000-0000-7000-8000-000000000012';
const candidateConfiguration = { ...REWARDS_V05_CONFIGURATION,
  prospectiveFrom: '2026-09-01T00:00:00.000Z', firstSourceMonth: '2026-09' };
const prospectiveCandidate = calculateMonthlyRewardsV05({ subjectUserId: owner, sourceMonth: '2026-09',
  evaluatedAt: '2026-10-04T00:00:00.000Z', configuration: candidateConfiguration,
  weeks: [], maintenanceRules: PROPOSED_MONTHLY_MAINTENANCE_RULES,
  evidence: [], securityCoverage: [], suggestionRevisions: [], ingestionComplete: false });

const snapshot = {
  id: snapshotId, subject_user_id: owner, source_month: new Date('2026-08-01T00:00:00Z'),
  effective_month: new Date('2026-09-01T00:00:00Z'), mode: 'confirmed', revision: 1,
  assessment_id: assessmentId, source_id: sourceId, source_revision: 1,
  source_score: 500, level: 1, rules_version: 'synthetic-snapshot-rules',
  policy_version: MONTHLY_REPUTATION_POLICY_VERSION,
};
const assessment = {
  policyVersion: MONTHLY_REPUTATION_POLICY_VERSION, sourceMonth: '2026-08', effectiveMonth: '2026-09',
  weeks: [], weeklyPoints: 500, monthlyPoints: 0, quarterlyPoints: 0, sourceScore: 500, level: 1,
};
const assembly = {
  policyVersion: MONTHLY_REPUTATION_POLICY_VERSION, sourceMonth: '2026-08', weeks: [], missingWeeks: [],
  maintenance: { monthlyPoints: 0, quarterlyPoints: 0, actions: [] },
};

function reportClient({ sourceReasonCode = 'assembled' } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.includes('to_regclass(')) return { rows: [{ available: true }], rowCount: 1 };
      if (sql.includes('SELECT 1 FROM system.feature_flags WHERE flag_key')) return { rows: [{}], rowCount: 1 };
      if (sql.includes('SELECT * FROM trust.lock_monthly_reward_configuration')) return { rows: [
        { enabled: true, policy_version: MONTHLY_REPUTATION_POLICY_VERSION },
        { enabled: true, policy_version: MONTHLY_REPUTATION_POLICY_VERSION },
      ], rowCount: 2 };
      if (sql.includes('SELECT version,mode,first_source_month')) return { rows: [{
        version: 'synthetic-snapshot-rules', policy_version: MONTHLY_REPUTATION_POLICY_VERSION, mode: 'confirmed', first_source_month: new Date('2026-08-01T00:00:00Z'),
        weekly_rules_version: 'synthetic-weekly-rules', maintenance_rules_version: 'synthetic-maintenance-rules',
        decision_approvals: Object.fromEntries(MONTHLY_REPUTATION_DECISIONS.map(id => [id, 'synthetic approval'])),
      }], rowCount: 1 };
      if (sql.includes("to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM')")) return { rows: [{ month: '2026-10' }], rowCount: 1 };
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [], rowCount: 1 };
      if (sql.includes('trust.lock_monthly_reward_subject')) return { rows: [{ allowed: true }], rowCount: 1 };
      if (sql.includes('SELECT * FROM trust.monthly_reward_snapshots')) return { rows: [snapshot], rowCount: 1 };
      if (sql.includes('FROM trust.monthly_reputation_sources source')) return { rows: [{
        revision: 1, reason_code: sourceReasonCode, recorded_at: new Date('2026-09-01T00:00:00Z'),
        catalogue_hash: MONTHLY_REPUTATION_CATALOGUE_HASH, report: assembly, assessment_mode: 'shadow',
        assembly_policy: MONTHLY_REPUTATION_POLICY_VERSION,
        calculation: assessment, weekly_points: 500, monthly_points: 0, quarterly_points: 0,
        source_score: 500, level: 1,
      }], rowCount: 1 };
      if (sql.includes('SELECT revision, mode')) return { rows: [{ revision: 1, mode: 'confirmed', source_revision: 1,
        source_score: 500, level: 1, corrected: false, recorded_at: new Date('2026-09-02T00:00:00Z') }], rowCount: 1 };
      assert.fail(`unexpected query: ${sql}`);
    },
  };
}

function dependencies(changes = {}) {
  const calls = { auth: [], transactions: 0 };
  const deps = {
    calls,
    authenticate: async request => { calls.auth.push(request); return { userId: owner }; },
    transaction: async work => { calls.transactions++; return work(reportClient()); },
    snapshotRulesVersion: 'synthetic-snapshot-rules',
    respond: (body, status, headers = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'content-type': typeof body === 'string' ? 'text/plain' : 'application/json', ...headers },
    }),
    ...changes,
  };
  return deps;
}

const request = (path, method = 'GET') => new Request(`https://api.lythaus.test${path}`, { method });

test('monthly report route authenticates and binds report reads to the fresh principal', async () => {
  const client = reportClient();
  const deps = dependencies({
    transaction: async work => { deps.calls.transactions++; return work(client); },
  });
  const response = await handleMonthlyReputationRead(request(`/api/reputation/me/reports/monthly/2026-08?subjectId=${other}`), deps);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.match(response.headers.get('content-type'), /application\/json/);
  const body = await response.json();
  assert.equal(body.sourceMonth, '2026-08');
  assert.equal(body.report.total.sourceScore, 500);
  assert.equal(body.levelAuthority.level, 1);
  assert.equal(deps.calls.auth.length, 1);
  assert.equal(client.calls.some(call => call.values.includes(other)), false);
  assert.ok(client.calls.some(call => call.sql.includes('trust.lock_monthly_reward_subject') && call.values[0] === owner));
  assert.ok(client.calls.some(call => call.sql.includes('FROM trust.monthly_reputation_sources source') && call.values[0] === owner));
});

test('monthly report CSV is private, formula-safe and remains owner scoped', async () => {
  const client = reportClient({ sourceReasonCode: ' =HYPERLINK("https://example.test","open")' });
  const deps = dependencies({ transaction: async work => work(client) });
  const response = await handleMonthlyReputationRead(request(
    `/api/reputation/me/reports/monthly/2026-08/export.csv?userId=${other}`), deps);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.match(response.headers.get('content-type'), /text\/csv/);
  assert.equal(response.headers.get('content-disposition'), 'attachment; filename="monthly-reputation-2026-08.csv"');
  const csv = await response.text();
  assert.match(csv, /' =HYPERLINK/);
  assert.ok(client.calls.every(call => !call.values.includes(other)));
});

test('monthly report accepts explicit JSON format and does not overload its typed response with CSV', async () => {
  const response = await handleMonthlyReputationRead(request('/api/reputation/me/reports/monthly/2026-08?format=json'), dependencies());
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.equal((await response.json()).report.total.sourceScore, 500);
  const invalid = await handleMonthlyReputationRead(request('/api/reputation/me/reports/monthly/2026-08?format=csv'), dependencies());
  assert.equal(invalid.status, 400);
});

test('invalid report months and formats fail before querying monthly data', async () => {
  const client = reportClient();
  const deps = dependencies({ transaction: async work => work(client) });
  const invalidMonth = await handleMonthlyReputationRead(request('/api/reputation/me/reports/monthly/2026-13'), deps);
  assert.equal(invalidMonth.status, 400);
  assert.equal(client.calls.length, 0);
  const invalidFormat = await handleMonthlyReputationRead(request('/api/reputation/me/reports/monthly/2026-08?format=xml'), deps);
  assert.equal(invalidFormat.status, 400);
  assert.equal(client.calls.length, 0);
});

test('anonymous monthly reads are rejected before any report query', async () => {
  const deps = dependencies({
    authenticate: async () => { throw new Error('authentication_required'); },
    transaction: async () => assert.fail('anonymous owner data must not be queried'),
  });
  const response = await handleMonthlyReputationRead(request('/api/reputation/me/reports/monthly/2026-08'), deps);
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});

test('monthly rewards stays pending without approved server configuration and performs no monthly query', async () => {
  const deps = dependencies({ snapshotRulesVersion: undefined, selectionRulesVersion: undefined,
    transaction: async () => assert.fail('unconfigured monthly reward route must not query'), });
  const response = await handleMonthlyReputationRead(request(`/api/rewards/me/monthly?subjectId=${other}`), deps);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const body = await response.json();
  assert.equal(body.state, 'pending');
  assert.equal(body.reasonCode, 'approval_unavailable');
  assert.equal(body.currentLevel, null);
  assert.deepEqual(body.selection, { state: 'unavailable', reasonCode: 'approval_unavailable' });
  assert.equal(deps.calls.transactions, 0);
});

for (const mode of ['confirmed', 'shadow', 'pending']) for (const prospective of [false, true, 'configuration', 'query', 'projection']) test(`monthly ${mode} projection preserves authority under the selection period lock with candidate=${prospective}`, async () => {
  const calls = [];
  let locked = false;
  let current = { ...snapshot, source_month: new Date('2026-09-01T00:00:00Z'),
    effective_month: new Date('2026-10-01T00:00:00Z'), mode: mode === 'pending' ? 'confirmed' : mode,
    revision: 1, source_revision: 1, source_score: 500, level: 1 };
  const client = { async query(sql, values = []) {
    calls.push({ sql, values });
    if (sql.includes('SELECT configuration FROM trust.lock_monthly_rewards_v05_configuration')) {
      if (prospective === 'configuration') throw new Error('monthly_rewards_v05_configuration_invalid private detail');
      return { rows: [{ configuration: candidateConfiguration }], rowCount: 1 };
    }
    if (sql.includes('SELECT candidate.report')) {
      if (prospective === 'query') throw new Error('private database detail');
      return { rows: [{ report: prospective === 'projection' ? { ...prospectiveCandidate, redeemable: true } : prospectiveCandidate }], rowCount: 1 };
    }
    if (sql.includes('SELECT pg_advisory_xact_lock')) {
      if (values[0] === `monthly-reputation:${owner}:2026-09` && !locked) {
        // Model a writer that commits immediately before the request obtains its
        // period lock. Reads made before the lock see revision 1; reads made after
        // it must see revision 2 for the rest of this transaction.
        locked = true;
        current = { ...current, revision: 2, source_revision: 2, source_score: 2000, level: 2 };
      }
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('to_regclass(')) return { rows: [{ available: true }], rowCount: 1 };
    if (sql.includes('SELECT 1 FROM system.feature_flags')) return { rows: [{}], rowCount: 1 };
    if (sql.includes('trust.lock_monthly_reward_selection_configuration')) return { rows: [
      { enabled: true, policy_version: MONTHLY_REPUTATION_POLICY_VERSION },
      { enabled: true, policy_version: MONTHLY_REPUTATION_POLICY_VERSION },
      { enabled: true, policy_version: MONTHLY_REPUTATION_POLICY_VERSION },
    ], rowCount: 3 };
    if (sql.includes('FROM trust.monthly_reward_selection_rule_sets')) return { rows: [{
      version: 'synthetic-selection-rules', snapshot_rules_version: 'synthetic-snapshot-rules',
      switching_mode: 'blocked_pending_D12',
    }], rowCount: 1 };
    if (sql.includes("date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC')"))
      return { rows: [{ month: '2026-09' }], rowCount: 1 };
    if (sql.includes('trust.lock_monthly_reward_selection_member'))
      return { rows: [{ subscription_tier: 'premium' }], rowCount: 1 };
    if (sql.includes("to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM')"))
      return { rows: [{ month: '2026-10' }], rowCount: 1 };
    if (sql.includes('trust.lock_monthly_reward_configuration')) return { rows: [
      { enabled: true, policy_version: MONTHLY_REPUTATION_POLICY_VERSION },
      { enabled: true, policy_version: MONTHLY_REPUTATION_POLICY_VERSION },
    ], rowCount: 2 };
    if (sql.includes('SELECT version,mode,first_source_month')) return { rows: [{
      version: 'synthetic-snapshot-rules', policy_version: MONTHLY_REPUTATION_POLICY_VERSION,
      mode: mode === 'pending' ? 'confirmed' : mode, first_source_month: new Date('2026-08-01T00:00:00Z'),
      weekly_rules_version: 'weekly', maintenance_rules_version: 'maintenance',
      decision_approvals: Object.fromEntries(MONTHLY_REPUTATION_DECISIONS.map(id => [id, 'synthetic approval'])),
    }], rowCount: 1 };
    if (sql.includes('trust.lock_monthly_reward_subject')) return { rows: [{ allowed: true }], rowCount: 1 };
    if (sql.includes('FROM trust.monthly_reward_snapshots')) return mode === 'pending'
      ? { rows: [], rowCount: 0 } : { rows: [{ ...current }], rowCount: 1 };
    if (sql.includes('SELECT 1 FROM trust.monthly_reputation_sources')) return { rows: [], rowCount: 0 };
    if (sql.includes('FROM trust.monthly_reward_selection_revisions')) return { rows: [], rowCount: 0 };
    assert.fail(`unexpected query: ${sql}`);
  } };
  const deps = dependencies({ selectionRulesVersion: 'synthetic-selection-rules',
    prospectiveRulesVersion: prospective ? candidateConfiguration.version : undefined,
    transaction: async work => work(client) });
  const response = await handleMonthlyReputationRead(request('/api/rewards/me/monthly'), deps);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const body = await response.json();
  assert.equal(body.prospective?.state, typeof prospective === 'string' ? 'unavailable' : prospective ? 'provisional' : undefined);
  assert.ok(!JSON.stringify(body).includes('private detail'));
  assert.ok(!JSON.stringify(body).includes('database detail'));
  assert.equal(locked, true);
  assert.equal(body.snapshot.state, mode);
  if (mode === 'pending') {
    assert.equal(body.snapshot.level, 1);
    assert.equal(body.snapshot.levelKind, 'unassessed_default');
    assert.equal(body.reasonCode, 'no_previous_assessment');
  } else {
    assert.equal(body.snapshot.revision, 2);
    assert.equal(body.snapshot.sourceScore, 2000);
  }
  if (mode === 'confirmed') {
    assert.equal(body.state, 'ready');
    assert.equal(body.currentLevel, 2);
    assert.equal(body.sourceScore, 2000);
    assert.equal(body.selection.profileLevel, 2);
  } else {
    assert.equal(body.state, 'pending');
    assert.equal(body.currentLevel, null);
    assert.equal(body.sourceScore, null);
    assert.equal(body.sourceMonth, null);
    assert.equal(body.selection.profileLevel, null);
  }
  const periodLock = calls.findIndex(call => call.sql.includes('pg_advisory_xact_lock')
    && call.values[0] === `monthly-reputation:${owner}:2026-09`);
  const firstSnapshotRead = calls.findIndex(call => call.sql.includes('FROM trust.monthly_reward_snapshots'));
  assert.ok(periodLock >= 0 && firstSnapshotRead > periodLock);
});

test('feature-off monthly readers return a pending route projection without reading proposal tables', async () => {
  const calls = [];
  const client = { async query(sql, values = []) {
    calls.push({ sql, values });
    if (sql.includes('to_regclass(')) return { rows: [{ available: true }], rowCount: 1 };
    if (sql.includes("to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM')")) return { rows: [{ month: '2026-10' }], rowCount: 1 };
    if (sql.includes('FROM system.feature_flags WHERE flag_key')) return { rows: [], rowCount: 0 };
    assert.fail(`feature-off readers accessed a monthly relation: ${sql}`);
  } };
  const deps = dependencies({ selectionRulesVersion: 'synthetic-selection-rules',
    transaction: async work => work(client) });
  const response = await handleMonthlyReputationRead(request('/api/rewards/me/monthly'), deps);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.state, 'pending');
  assert.equal(body.snapshot.state, 'unavailable');
  assert.equal(body.selection.state, 'unavailable');
  assert.equal(calls.some(call => /FROM trust\.monthly_(?:reputation|reward)/.test(call.sql)), false);
  assert.ok(calls.every(call => !call.values.includes(other)));
});

test('unrelated paths and methods are left to the main dispatcher', async () => {
  const deps = dependencies({ authenticate: async () => assert.fail('unmatched request authenticated') });
  assert.equal(await handleMonthlyReputationRead(request('/api/rewards/me'), deps), undefined);
  assert.equal(await handleMonthlyReputationRead(request('/api/rewards/me/monthly', 'POST'), deps), undefined);
});

test('source overflow returns the published private unavailable error with fresh server correlation and no partial report', async () => {
  for (const suffix of ['', '/export.csv']) {
    const client = reportClient();
    const query = client.query.bind(client);
    client.query = async (sql, values) => {
      const result = await query(sql, values);
      if (sql.includes('FROM trust.monthly_reputation_sources source')) {
        assert.equal(values[3], 2);
        assert.equal(values[4], 1);
        return { rows: [result.rows[0], { ...result.rows[0], revision: 2 }] };
      }
      return result;
    };
    const deps = dependencies({ reportBounds: { maximumSourceRevisions: 1 }, transaction: async work => work(client) });
    const response = await handleMonthlyReputationRead(request(
      `/api/reputation/me/reports/monthly/2026-08${suffix}?subjectId=${other}&limit=99999&maximumSourceRevisions=99999`), deps);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const body = await response.json();
    assert.deepEqual(Object.keys(body).sort(), ['correlationId', 'error']);
    assert.equal(body.error, 'monthly_report_resource_limit_exceeded');
    assert.match(body.correlationId, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.ok(![owner, other, sourceId, snapshotId, assessmentId].includes(body.correlationId));
    assert.equal(response.headers.get('content-disposition'), null);
    assert.equal(client.calls.some(({ values }) => values.includes(other)), false);
    assert.equal(client.calls.some(({ sql }) => sql.includes('SELECT revision, mode')), false);
  }
});

test('JSON and CSV output bounds return a private error instead of emitting an oversized successful response', async () => {
  for (const suffix of ['', '/export.csv']) {
    const response = await handleMonthlyReputationRead(request(`/api/reputation/me/reports/monthly/2026-08${suffix}`),
      dependencies({ reportBounds: { maximumOutputBytes: 1 } }));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal((await response.json()).error, 'monthly_report_resource_limit_exceeded');
  }
});

test('unavailable reports preserve their exact private v1 JSON and CSV shapes', async () => {
  for (const suffix of ['', '/export.csv']) {
    const deps = dependencies({ snapshotRulesVersion: undefined,
      transaction: async work => work({ query: () => assert.fail('unavailable report must not query monthly data') }) });
    const response = await handleMonthlyReputationRead(request(`/api/reputation/me/reports/monthly/2026-08${suffix}`), deps);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(deps.calls.auth.length, 1);
    if (!suffix) {
      const body = await response.json();
      assert.equal(body.reasonCode, 'report_unavailable');
      assert.equal(body.report, null);
      assert.deepEqual(body.corrections, { sourceRevisions: [], effectiveSnapshots: [] });
      assert.equal(body.dataVersion, undefined);
    } else assert.ok((await response.text()).includes('"report_unavailable"'));
  }
});

test('each monthly request refreshes the principal and never accepts a request-supplied owner or bound', async () => {
  const clients = [];
  const principals = [owner, other];
  const deps = dependencies({ authenticate: async () => ({ userId: principals.shift() }), transaction: async work => {
    const client = reportClient(); clients.push(client); return work(client);
  } });
  for (const ignoredSubject of [other, owner]) {
    const response = await handleMonthlyReputationRead(request(
      `/api/reputation/me/reports/monthly/2026-08?subjectId=${ignoredSubject}&limit=1&maximumOutputBytes=1`), deps);
    assert.equal(response.status, 200);
  }
  for (const [index, principal] of [owner, other].entries()) {
    const call = clients[index].calls.find(({ sql }) => sql.includes('FROM trust.monthly_reputation_sources source'));
    assert.equal(call.values[0], principal);
    assert.equal(call.values[3], 129);
  }
});
