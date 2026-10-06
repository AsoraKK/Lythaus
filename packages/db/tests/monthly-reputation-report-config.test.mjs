import assert from 'node:assert/strict';
import test from 'node:test';
import { readOwnMonthlyReputationReport } from '../src/monthly-reputation-report.ts';

const subjectId = '01900000-0000-7000-8000-000000000099';

function clientWith(queryResult) {
  const statements = [];
  return {
    statements,
    query: async (statement) => {
      statements.push(statement);
      return queryResult(statement);
    },
  };
}

test('an absent snapshot provider returns a server-side pending projection without database reads', async () => {
  const client = clientWith(() => assert.fail('unconfigured report must not query a database'));
  const report = await readOwnMonthlyReputationReport(client, { subjectId, sourceMonth: '2026-08' });

  assert.equal(report.reportState, 'pending');
  assert.equal(report.reasonCode, 'report_unavailable');
  assert.equal(report.report, null);
  assert.equal(report.levelAuthority.state, 'unavailable');
  assert.deepEqual(client.statements, []);
});

test('a feature-off report checks only the existing feature flag before returning pending', async () => {
  const client = clientWith(statement => {
    if (statement.includes('to_regclass(')) return { rows: [{ available: true }], rowCount: 1 };
    if (statement.includes('system.feature_flags')) return { rows: [], rowCount: 0 };
    assert.fail(`monthly data query should be gated: ${statement}`);
  });
  const report = await readOwnMonthlyReputationReport(client, {
    subjectId, sourceMonth: '2026-08', snapshotRulesVersion: 'synthetic-disabled-rules',
  });

  assert.equal(report.reportState, 'pending');
  assert.equal(report.reasonCode, 'report_unavailable');
  assert.equal(report.report, null);
  assert.equal(report.levelAuthority.reasonCode, 'approval_unavailable');
  assert.equal(client.statements.length, 2);
  assert.ok(client.statements[0].includes('to_regclass('));
  assert.equal(client.statements[1], 'SELECT 1 FROM system.feature_flags WHERE flag_key = $1 AND policy_version = $2');
});
