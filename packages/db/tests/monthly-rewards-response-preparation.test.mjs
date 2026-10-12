import assert from 'node:assert/strict';
import test from 'node:test';
import { readOwnMonthlyReputationReportResponsePreparation as report,
  readOwnMonthlyRewardsResponsePreparation as rewards } from '../src/monthly-rewards-response-preparation.ts';

const context = { mode: 'disposable_local_pg17' };
const subjectId = '01900000-0000-7000-8000-000000000099';
function client({ host = '127.0.0.1', database = 'lythaus_monthly_test', version = 170011, capability = true } = {}) {
  const statements = [];
  return { statements, connectionParameters: { host, database }, query: async (sql, values) => {
    statements.push({ sql, values });
    if (sql.includes('current_database()')) return { rows: [{ database, version }] };
    if (sql.includes('pg_attribute')) return { rows: [{ available: capability }] };
    assert.fail(`unconfigured preparation must not query source, snapshot or selection data: ${sql}`);
  } };
}

test('disabled API adapters call actual own-member readers and keep unconfigured responses private-field-free', async () => {
  const reportClient = client(), dto = await report(reportClient, { subjectId, sourceMonth: '2026-12' }, context);
  assert.equal(dto.sourceMonth, '2026-12'); assert.equal(dto.effectiveMonth, '2027-01'); assert.equal(dto.report, null);
  assert.equal(dto.reportState, 'pending'); assert.equal(dto.levelAuthority.sourceScore, null);
  assert.equal(reportClient.statements.length, 2);
  const rewardsClient = client(), rewardsDto = await rewards(rewardsClient, { subjectId, effectiveMonth: '2027-01' }, context);
  assert.equal(rewardsDto.state, 'pending'); assert.equal(rewardsDto.currentLevel, null); assert.equal(rewardsDto.sourceScore, null);
  assert.equal(rewardsDto.snapshotProjection.reasonCode, 'approval_unavailable'); assert.equal(rewardsDto.selection.state, 'unavailable');
  assert.ok(!JSON.stringify([dto, rewardsDto]).includes(subjectId));
});

test('adapters cannot be invoked through missing, remote, non-PG17 or missing-capability contexts even when unconfigured', async () => {
  for (const read of [db => report(db, { subjectId, sourceMonth: '2026-12' }, undefined),
    db => rewards(db, { subjectId, effectiveMonth: '2027-01' }, undefined)]) {
    const db = client(); await assert.rejects(read(db), /requires_disposable_context/); assert.equal(db.statements.length, 0);
  }
  for (const options of [{ host: 'database.example.invalid' }, { database: 'production' }, { version: 160011 },
    { version: 180000 }, { capability: false }]) {
    await assert.rejects(report(client(options), { subjectId, sourceMonth: '2026-12' }, context), /requires_disposable/);
    await assert.rejects(rewards(client(options), { subjectId, effectiveMonth: '2027-01' }, context), /requires_disposable/);
  }
});

test('actual reader validation rejects caller identity or period forgery before producing a DTO', async () => {
  await assert.rejects(report(client(), { subjectId: 'invalid', sourceMonth: '2026-12' }, context), /subject_invalid/);
  await assert.rejects(rewards(client(), { subjectId: 'invalid', effectiveMonth: '2027-01' }, context), /id_invalid/);
  await assert.rejects(report(client(), { subjectId, sourceMonth: '2026-13' }, context), /source_month_invalid/);
  await assert.rejects(rewards(client(), { subjectId, effectiveMonth: '2027-13' }, context), /source_month_invalid/);
});
