import assert from 'node:assert/strict';
import { test } from 'node:test';
import { uuidv7 } from '@lythaus/security';
import { readOwnMonthlyReputationReport } from '../../../packages/db/src/monthly-reputation-report.ts';
import { approveMonthlyRewardSnapshotCorrection, applyMonthlyRewardSnapshotCorrection } from '../../../packages/db/src/monthly-reward-snapshots.ts';
import { serializeMonthlyReputationReportCsv } from '../../lythaus-public-api/src/monthly-reputation-report-export.ts';

export function registerMonthlyReportCases({ tx, sql, person, snapshot, reviewer, snapshotRulesVersion }) {
  const read = (subjectId, sourceMonth, rulesVersion = snapshotRulesVersion) =>
    tx(client => readOwnMonthlyReputationReport(client, { subjectId, sourceMonth, snapshotRulesVersion: rulesVersion }));

  test('RPT-01/02/03: owner report projects stored selected/omitted weeks and allowances without evidence identifiers', async () => {
    const member = await person();
    const privateEvidenceId = uuidv7();
    const actions = [{ actionId: 'weekly.three_human_posts', capGroup: 'posts', allowance: 250,
      remainingInGroup: 0, points: 250, accepted: 3, pending: 1, withheld: 0,
      evidenceIds: [privateEvidenceId], reason: 'earned' }];
    await snapshot(member, 9300, '2026-08', {
      weekPoints: [2500, 2300, 2100, 1800, 600], firstWeekActions: actions,
    });
    const report = await read(member, '2026-08');
    assert.equal(report.reportState, 'shadow');
    assert.equal(report.levelAuthority.state, 'confirmed');
    assert.equal(report.levelAuthority.level, 4);
    assert.equal(report.report.assessmentMode, 'shadow');
    assert.equal(report.report.weekly.selectedWeeks.length, 4);
    assert.equal(report.report.weekly.omittedWeeks.length, 1);
    assert.equal(report.report.weekly.omittedWeeks[0].points, 600);
    assert.equal(report.report.weekly.points, 8700);
    assert.equal(report.report.monthly.points, 0);
    assert.equal(report.report.quarterlyEmail.points, 0);
    assert.equal(report.report.total.maximumSourceMonth, 13500);
    assert.equal(report.report.weekly.selectedWeeks[0].actions[0].accepted, 3);
    assert.equal(report.report.weekly.selectedWeeks[0].actions[0].pending, 1);
    assert.equal(report.report.weekly.selectedWeeks[0].actions[0].reasonCode, 'earned');
    assert.equal(report.report.weekly.selectedWeeks[0].actions[0].evidenceCount, 1);
    const serialized = JSON.stringify(report);
    assert.ok(!serialized.includes(privateEvidenceId));
    for (const privateField of ['evidenceIds', 'observationIds', 'revocationIds', 'actorId', 'evidenceReference'])
      assert.ok(!serialized.includes(privateField));

    const other = await person();
    await snapshot(other, 100, '2026-08', { weekPoints: [100, 0, 0, 0, 0] });
    const otherReport = await read(other, '2026-08');
    assert.equal(otherReport.report.total.sourceScore, 100);
    assert.notEqual(otherReport.report.total.sourceScore, report.report.total.sourceScore);
  });

  test('RPT-01/REL-02: owner report keeps current authority fixed until an approved source correction publishes', async () => {
    const member = await person();
    await snapshot(member, 10000, '2026-08');
    const previous = (await sql(`SELECT id,revision FROM trust.monthly_reward_snapshots
      WHERE subject_user_id=$1 AND effective_month='2026-09-01' AND mode='confirmed'
      ORDER BY revision DESC LIMIT 1`, [member])).rows[0];
    const corrected = await snapshot(member, 1000, '2026-08');
    const pending = await read(member, '2026-08');
    assert.equal(pending.reportState, 'shadow');
    assert.equal(pending.levelAuthority.state, 'confirmed');
    assert.equal(pending.report.sourceRevision, 2);
    assert.equal(pending.report.total.sourceScore, 1000);
    assert.equal(pending.levelAuthority.level, 5);
    assert.equal(pending.corrections.sourceRevisions.length, 1);
    const shadowCsv = serializeMonthlyReputationReportCsv(pending);
    const csvHeader = shadowCsv.split('\r\n')[0].split(',');
    const sourceCorrection = shadowCsv.split('\r\n').find(line => line.startsWith('"source_correction",'));
    assert.ok(sourceCorrection);
    const sourceCorrectionCells = sourceCorrection.slice(1, -1).split('\",\"').map(cell => cell.replaceAll('\"\"', '\"'));
    assert.equal(sourceCorrectionCells[csvHeader.indexOf('currentLevel')], '5');
    assert.equal(sourceCorrectionCells[csvHeader.indexOf('sourceScore')], '1000');
    assert.equal(sourceCorrectionCells[csvHeader.indexOf('calculatedLevel')], '2');

    const correction = await tx(client => approveMonthlyRewardSnapshotCorrection(client, {
      actorId: reviewer(), subjectId: member, snapshotId: previous.id, assessmentId: corrected.assessmentId,
      rulesVersion: snapshotRulesVersion, expectedSnapshotRevision: previous.revision,
      reasonCode: 'synthetic_independent_provider_invalidation', evidenceReference: 'synthetic private correction fixture',
      idempotencyKey: uuidv7(),
    }), 'lythaus_admin');
    await tx(client => applyMonthlyRewardSnapshotCorrection(client, {
      eventId: correction.sourceEventId, rulesVersion: snapshotRulesVersion,
    }), 'lythaus_jobs');
    const report = await read(member, '2026-08');
    assert.equal(report.levelAuthority.level, 2);
    assert.equal(report.report.total.calculatedLevel, 2);
    assert.equal(report.corrections.effectiveSnapshots.length, 1);
    assert.equal(report.corrections.effectiveSnapshots[0].level, 2);
    const sourceId = (await sql('SELECT source_id FROM trust.monthly_reputation_assessments WHERE id=$1', [corrected.assessmentId])).rows[0].source_id;
    await sql('DELETE FROM trust.monthly_reputation_assemblies WHERE source_id=$1', [sourceId]);
    const incomplete = await read(member, '2026-08');
    assert.equal(incomplete.reportState, 'pending');
    assert.equal(incomplete.reasonCode, 'assembly_pending');
    assert.equal(incomplete.report, null);
    const incompleteCsv = serializeMonthlyReputationReportCsv(incomplete);
    assert.ok(incompleteCsv.includes('source_correction'));
    assert.ok(incompleteCsv.includes('snapshot_correction'));
  });

  test('RPT-01/02: absent reports remain pending, malformed months fail and deleted owners cannot read', async () => {
    const member = await person();
    const pending = await read(member, '2026-08');
    assert.equal(pending.reportState, 'pending');
    assert.equal(pending.reasonCode, 'source_not_assembled');
    assert.equal(pending.report, null);
    await assert.rejects(read('not-a-uuid', '2026-08'), /monthly_report_subject_invalid/);
    await assert.rejects(read(member, '2026-13'), /monthly_reputation_source_month_invalid/);
    const unavailable = await read(member, '2026-08', 'missing-synthetic-rules-version');
    assert.equal(unavailable.levelAuthority.state, 'unavailable');
    const future = await read(member, '2027-01');
    assert.equal(future.levelAuthority.state, 'pending');
    assert.equal(future.levelAuthority.reasonCode, 'future_month_unconfirmed');
    await sql("UPDATE identity.users SET status='deleted',deleted_at=now() WHERE id=$1", [member]);
    await assert.rejects(read(member, '2026-08'), /monthly_reward_subject_unavailable/);
  });

  test('RPT-01: assembled but unassessed source is pending and does not claim selected weeks', async () => {
    const member = await person();
    await snapshot(member, 8000, '2026-08', { weekPoints: [2400, 2200, 1800, 1000, 600], skipAssessment: true });
    const report = await read(member, '2026-08');
    assert.equal(report.reportState, 'pending');
    assert.equal(report.reasonCode, 'assessment_pending');
    assert.equal(report.report.total, null);
    assert.equal(report.report.weekly.selectedWeeks.length, 0);
    assert.equal(report.report.weekly.omittedWeeks.length, 0);
    assert.equal(report.report.weekly.unassessedWeeks.length, 5);
  });

  test('RPT-01: corrupt catalogue or assessment lineage is refused; absent assembly stays pending', async () => {
    const member = await person();
    await snapshot(member, 5000, '2026-08');
    const source = (await sql(`SELECT source.id,assessment.id AS assessment_id,source.catalogue_hash,
        assessment.calculation
      FROM trust.monthly_reputation_sources source JOIN trust.monthly_reputation_assessments assessment
        ON assessment.source_id=source.id
      WHERE source.subject_user_id=$1 AND source.source_month='2026-08-01'`, [member])).rows[0];

    await sql('ALTER TABLE trust.monthly_reputation_sources DISABLE TRIGGER monthly_reputation_sources_immutable');
    try {
      await sql("UPDATE trust.monthly_reputation_sources SET catalogue_hash=$2 WHERE id=$1", [source.id, 'f'.repeat(64)]);
      await assert.rejects(read(member, '2026-08'), /monthly_report_source_integrity_failed/);
    } finally {
      await sql('UPDATE trust.monthly_reputation_sources SET catalogue_hash=$2 WHERE id=$1', [source.id, source.catalogue_hash]);
      await sql('ALTER TABLE trust.monthly_reputation_sources ENABLE TRIGGER monthly_reputation_sources_immutable');
    }

    await sql('ALTER TABLE trust.monthly_reputation_assessments DISABLE TRIGGER monthly_reputation_assessments_immutable');
    try {
      await sql(`UPDATE trust.monthly_reputation_assessments
        SET calculation=jsonb_set(calculation,'{sourceMonth}',to_jsonb('2026-07'::text)) WHERE id=$1`, [source.assessment_id]);
      await assert.rejects(read(member, '2026-08'), /monthly_report_assessment_integrity_failed/);
    } finally {
      await sql('UPDATE trust.monthly_reputation_assessments SET calculation=$2::jsonb WHERE id=$1',
        [source.assessment_id, JSON.stringify(source.calculation)]);
      await sql('ALTER TABLE trust.monthly_reputation_assessments ENABLE TRIGGER monthly_reputation_assessments_immutable');
    }

    await sql('DELETE FROM trust.monthly_reputation_assemblies WHERE source_id=$1', [source.id]);
    const incomplete = await read(member, '2026-08');
    assert.equal(incomplete.reportState, 'pending');
    assert.equal(incomplete.reasonCode, 'assembly_pending');
    assert.equal(incomplete.report, null);
  });

  test('RPT-04: CSV preserves the report breakdown and escapes formula-leading values', async () => {
    const member = await person();
    await snapshot(member, 9300, '2026-08', {
      weekPoints: [2500, 2300, 2100, 1800, 600],
      firstWeekActions: [{ actionId: '=HYPERLINK("https://invalid.example")', capGroup: 'posts', allowance: 250,
        remainingInGroup: 0, points: 250, accepted: 3, pending: 1, withheld: 0,
        evidenceIds: [uuidv7()], reason: 'earned', validFrom: '2026-08-03T00:00:00.000Z',
        validUntil: '2026-08-10T00:00:00.000Z' }],
    });
    const report = await read(member, '2026-08');
    const csv = serializeMonthlyReputationReportCsv(report);
    assert.ok(csv.startsWith('rowType,sourceMonth,effectiveMonth'));
    assert.ok(csv.includes('weekly_selected'));
    assert.ok(csv.includes('weekly_omitted'));
    assert.ok(csv.includes('"\'=HYPERLINK(""https://invalid.example"")"'));
    assert.ok(csv.includes('"13500"'));
    assert.ok(csv.endsWith('\r\n'));
    assert.ok(!csv.includes('evidenceIds'));
    assert.ok(!csv.includes('observationIds'));

    const correctedCsv = serializeMonthlyReputationReportCsv({
      sourceMonth: '2026-08', effectiveMonth: '2026-09', reportState: 'shadow',
      policyVersion: 'lythaus-monthly-rewards-2026-10-v1', levelAuthority: { state: 'confirmed', level: 2 },
      corrections: {
        sourceRevisions: [{ sourceRevision: 2, reasonCode: 'independent_invalidation',
          sourceScore: 1000, level: 2, recordedAt: '2026-10-03T00:00:00.000Z' }],
        effectiveSnapshots: [{ revision: 2, mode: 'confirmed', sourceRevision: 2,
          sourceScore: 1000, level: 2, recordedAt: '2026-10-03T00:01:00.000Z' }],
      },
      report: { total: { sourceScore: Number.NaN }, weekly: { selectedWeeks: [], omittedWeeks: [], missingWeeks: [], unassessedWeeks: [] },
        monthly: { actions: [] }, quarterlyEmail: { evidence: null } },
    });
    assert.ok(correctedCsv.includes('source_correction'));
    assert.ok(correctedCsv.includes('snapshot_correction'));
    assert.ok(correctedCsv.includes('independent_invalidation'));
    assert.ok(!correctedCsv.includes('NaN'));

    const pendingCsv = serializeMonthlyReputationReportCsv({ sourceMonth: '2026-08', effectiveMonth: '2026-09',
      reportState: 'pending', reasonCode: 'source_not_assembled', policyVersion: 'lythaus-monthly-rewards-2026-10-v1',
      levelAuthority: { state: 'pending' }, report: null });
    assert.ok(pendingCsv.includes('source_not_assembled'));
  });
}
