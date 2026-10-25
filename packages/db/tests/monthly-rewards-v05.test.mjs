import assert from 'node:assert/strict';
import test from 'node:test';
import { monthlyRewardsV05Configuration, readOwnRewardsV05Candidate } from '../src/monthly-rewards-v05.ts';
import { calculateMonthlyRewardsV05, REWARDS_V05_CONFIGURATION } from '../../contracts/src/monthly-rewards-v05.ts';
import { PROPOSED_MONTHLY_MAINTENANCE_RULES } from '../../contracts/src/monthly-maintenance-policy.ts';
import { handleMonthlyReputationRead } from '../../../apps/lythaus-public-api/src/monthly-reputation-routes.ts';

const owner = '01900000-0000-7000-8000-000000000001';
const other = '01900000-0000-7000-8000-000000000002';
const configuration = { ...REWARDS_V05_CONFIGURATION, prospectiveFrom: '2026-11-01T00:00:00.000Z', firstSourceMonth: '2026-11',
  weeklyRulesVersion: 'weekly', maintenanceRulesVersion: PROPOSED_MONTHLY_MAINTENANCE_RULES.version };
const candidate = calculateMonthlyRewardsV05({ subjectUserId: owner, sourceMonth: '2026-11',
  evaluatedAt: '2026-12-04T00:00:00.000Z', configuration, weeks: [], maintenanceRules: PROPOSED_MONTHLY_MAINTENANCE_RULES,
  evidence: [], securityCoverage: [], suggestionRevisions: [], ingestionComplete: false });

function client({ installed = true, enabled = true, report = candidate } = {}) {
  const calls = [];
  return { calls, async query(sql, values) {
    calls.push({ sql, values });
    if (sql.includes('to_regclass')) return { rows: [{ available: installed }], rowCount: 1 };
    if (sql.includes('lock_monthly_rewards_v05_configuration')) return { rows: enabled ? [{ configuration }] : [], rowCount: enabled ? 1 : 0 };
    if (sql.includes('SELECT candidate.report')) return { rows: report ? [{ report }] : [], rowCount: report ? 1 : 0 };
    assert.fail(`unexpected query: ${sql}`);
  } };
}
test('unconfigured, unknown, missing schema and disabled candidate readers fail closed', async () => {
  for (const version of [undefined, 'unknown']) {
    assert.equal(await monthlyRewardsV05Configuration({ query: () => assert.fail('unconfigured read') }, version), null);
  }
  for (const options of [{ installed: false }, { enabled: false }]) {
    const db = client(options);
    assert.equal(await readOwnRewardsV05Candidate(db, { subjectId: owner, version: configuration.version }), null);
    assert.ok(!db.calls.some(call => call.sql.includes('SELECT candidate.report')));
  }
});
test('private reader binds canonical subject and current source month and strips evidence', async () => {
  const db = client({ report: { ...candidate, privateEvidenceId: 'private', secret: 'private' } });
  const value = await readOwnRewardsV05Candidate(db, { subjectId: owner, version: configuration.version });
  assert.equal(value.state, 'provisional'); assert.equal(value.redeemable, false);
  assert.equal(value.privateEvidenceId, undefined); assert.equal(value.security, undefined);
  const read = db.calls.find(call => call.sql.includes('SELECT candidate.report'));
  assert.equal(read.values[0], owner); assert.match(read.sql, /clock_timestamp\(\) AT TIME ZONE 'UTC'/);
});
test('candidate-only configured route is visible without configured snapshot selection authority', async () => {
  const db = client();
  const response = await handleMonthlyReputationRead(new Request(`https://api.lythaus.test/api/rewards/me/monthly?subjectId=${other}`), {
    authenticate: async () => ({ userId: owner }), transaction: async work => work(db),
    prospectiveRulesVersion: configuration.version,
    respond: (body, status) => Response.json(body, { status }),
  });
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const value = await response.json();
  assert.equal(value.prospective.state, 'provisional'); assert.equal(value.state, 'pending');
  assert.equal(value.currentLevel, null); assert.equal(value.sourceScore, null);
  assert.equal(value.selection.state, 'unavailable');
  assert.ok(db.calls.every(call => !call.values?.includes(other)));
});
test('candidate-only route authenticates before reading and ignores client-selected policy', async () => {
  const noRead = () => assert.fail('must not read');
  const denied = await handleMonthlyReputationRead(new Request('https://api.lythaus.test/api/rewards/me/monthly'), {
    authenticate: async () => { throw new Error('authentication_required'); }, transaction: noRead,
    prospectiveRulesVersion: configuration.version, respond: (body, status) => Response.json(body, { status }),
  });
  assert.equal(denied.status, 401);
  const pending = await handleMonthlyReputationRead(new Request(`https://api.lythaus.test/api/rewards/me/monthly?snapshotRulesVersion=${configuration.version}`), {
    authenticate: async () => ({ userId: owner }), transaction: noRead,
    respond: (body, status) => Response.json(body, { status }),
  });
  assert.equal((await pending.json()).prospective, undefined);
});
test('persisted malformed, finalised or redeemable candidates cannot become display authority', async () => {
  for (const patch of [{ state: 'finalised' }, { redeemable: true }, { runtimeActivationAllowed: true },
    { sourceScore: 13651 }, { effectiveMonth: '2026-11' }, { level: 5 }]) {
    await assert.rejects(readOwnRewardsV05Candidate(client({ report: { ...candidate, ...patch } }), {
      subjectId: owner, version: configuration.version,
    }), /projection_invalid/);
  }
});
test('candidate-only configuration, query and projection failures return safe unavailable status without fabricated authority', async () => {
  for (const phase of ['configuration', 'query', 'projection']) {
    const db = client({ report: phase === 'projection' ? { ...candidate, redeemable: true } : candidate });
    const read = db.query;
    db.query = (sql, values) => {
      if (phase === 'configuration' && sql.startsWith('SELECT configuration')
        || phase === 'query' && sql.includes('SELECT candidate.report')) throw new Error('private database detail');
      return read(sql, values);
    };
    const response = await handleMonthlyReputationRead(new Request('https://api.lythaus.test/api/rewards/me/monthly'), {
      authenticate: async () => ({ userId: owner }), transaction: work => work(db),
      prospectiveRulesVersion: configuration.version, respond: (body, status) => Response.json(body, { status }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.prospective, { state: 'unavailable', reasonCode: 'prospective_assessment_unavailable' });
    assert.equal(body.currentLevel, null); assert.equal(body.sourceScore, null);
    assert.ok(!JSON.stringify(body).includes('private database detail'));
  }
});
