import assert from 'node:assert/strict';
import test from 'node:test';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { prepareMonthlyReputationReportResponse as reportDto, prepareMonthlyRewardsResponse as rewardsDto,
  MONTHLY_REWARDS_RESPONSE_PREPARATION as metadata } from '../src/monthly-rewards-response-preparation.ts';
import { MONTHLY_REWARDS_RESPONSE_PREPARATION_SCHEMA as schema } from '../src/monthly-rewards-response-preparation-schema.ts';
import { preparedReportFixture, preparedSnapshotFixture, pendingReportFixture } from '../fixtures/monthly-rewards-response-preparation.mjs';

const ajv = new Ajv({ strict: true, allErrors: true }); addFormats(ajv);
const validate = ajv.compile(schema);
const conforms = (dto) => assert.equal(validate(dto), true, JSON.stringify(validate.errors));
const invalid = (work) => assert.throws(work, /monthly_rewards_response_preparation_invalid|source_month_invalid/);

test('v2 response preparation separates corrected progress, immutable shadow snapshot and unavailable entitlement', () => {
  const dto = reportDto(preparedReportFixture()); conforms(dto);
  assert.equal(dto.report.total.sourceScore, 13650); assert.equal(dto.report.sourceRevision, 2);
  assert.equal(dto.snapshotProjection.sourceScore, 0); assert.equal(dto.snapshotProjection.sourceRevision, 1);
  assert.equal(dto.levelAuthority.sourceScore, null); assert.equal(dto.levelAuthority.level, null);
  assert.equal(dto.levelAuthority.state, 'unavailable'); assert.equal(dto.levelAuthority.reasonCode, 'activation_not_approved');
  assert.equal(dto.effectiveMonth, '2027-01'); assert.equal(dto.report.weekly.selectedWeeks.length, 4);
  assert.equal(dto.report.weekly.omittedWeeks.length, 1); assert.equal(dto.report.quarterlyTotal.maximumPoints, 1150);
  assert.equal(dto.report.quarterlySuggestion.points, 150); assert.equal(dto.report.quarterlySuggestion.validFrom, null);
  assert.equal(dto.report.quarterlySuggestion.validUntil, null); assert.equal(dto.appliedPoints, 0);
});

test('rewards DTO never places projection/default levels in currentLevel or grants selections', () => {
  for (const snapshot of [preparedSnapshotFixture({ sourceScore: 13650, level: 5 }),
    preparedSnapshotFixture({ state: 'pending', reasonCode: 'no_previous_assessment', sourceMonth: null,
      sourceScore: null, level: 1, levelKind: 'unassessed_default', revision: 0, sourceRevision: undefined }),
    preparedSnapshotFixture({ state: 'pending', reasonCode: 'future_month_unconfirmed', sourceMonth: null,
      sourceScore: null, level: null }),
    preparedSnapshotFixture({ state: 'unavailable', reasonCode: 'approval_unavailable', sourceMonth: null,
      sourceScore: null, level: null })]) {
    const dto = rewardsDto(snapshot); conforms(dto);
    assert.equal(dto.state, 'pending'); assert.equal(dto.currentLevel, null); assert.equal(dto.sourceScore, null);
    assert.equal(dto.sourceMonth, null); assert.equal(dto.snapshot.state, 'unavailable'); assert.equal(dto.selection.state, 'unavailable');
    assert.equal(dto.runtimeActivationAllowed, false);
    if (snapshot.state !== 'shadow') assert.equal(dto.snapshotProjection.level, null);
  }
  conforms(reportDto(pendingReportFixture()));
});

test('allowlisted report/snapshot DTOs omit private evidence, actor, event, snapshot identifiers and unknown nested objects', () => {
  const raw = preparedReportFixture();
  const secret = 'synthetic-private-evidence-sentinel';
  for (const row of [raw, raw.levelAuthority, raw.report, raw.report.weekly,
    raw.report.weekly.selectedWeeks[0], raw.report.weekly.selectedWeeks[0].actions[0], raw.report.quarterlySuggestion,
    raw.corrections.sourceRevisions[0]]) Object.assign(row, { reviewerId: secret, evidenceIds: [secret], payload: { content: secret } });
  const before = structuredClone(raw), dto = reportDto(raw); conforms(dto);
  assert.ok(!JSON.stringify(dto).includes(secret)); assert.ok(!JSON.stringify(dto).includes(raw.levelAuthority.snapshotId));
  assert.deepEqual(raw, before);
  const snapshot = preparedSnapshotFixture({ eventId: secret, subjectId: secret, partnerEvidence: { secret } });
  assert.ok(!JSON.stringify(rewardsDto(snapshot)).includes(secret));
});

test('unknown/mixed policy, data and catalogue versions or activation flags cannot enter prepared responses', () => {
  for (const patch of [{ policyVersion: 'lythaus-monthly-rewards-2026-10-v1' }, { dataVersion: 1 },
    { catalogueHash: '0'.repeat(64) }, { preparationOnly: false }, { runtimeActivationAllowed: true }, { appliedPoints: 1 }]) {
    invalid(() => rewardsDto(preparedSnapshotFixture(patch)));
    for (const pick of [row => row, row => row.levelAuthority, row => row.report, row => row.report.total,
      row => row.report.quarterlySuggestion, row => row.corrections.sourceRevisions[0]]) {
      const raw = preparedReportFixture(); Object.assign(pick(raw), patch); invalid(() => reportDto(raw));
    }
  }
  const raw = preparedReportFixture(); raw.report.weekly.selectedWeeks[0].actions[0].dataVersion = 2;
  invalid(() => reportDto(raw));
});

test('an assembled but unassessed report preserves nullable totals and unresolved windows without granting authority', () => {
  const raw = preparedReportFixture(); raw.reportState = 'pending'; raw.reasonCode = 'assessment_pending';
  raw.report.assessmentMode = null; raw.report.total = null; raw.report.weekly.points = null;
  raw.report.weekly.unassessedWeeks = raw.report.weekly.selectedWeeks.map(row => ({ ...row, selected: null, selectionReason: null }));
  raw.report.weekly.selectedWeeks = []; raw.report.weekly.omittedWeeks = [];
  const dto = reportDto(raw); conforms(dto);
  assert.equal(dto.report.total, null); assert.equal(dto.report.weekly.unassessedWeeks.length, 4);
  assert.equal(dto.report.quarterlySuggestion.validFrom, null); assert.equal(dto.levelAuthority.level, null);
});

test('integer/cap, whole-week, digest and component integrity are enforced at the response boundary', () => {
  const edits = [row => row.report.total.sourceScore = 13651, row => row.report.total.sourceScore = 13649,
    row => row.report.total.sourceScore = 13650.5, row => row.report.total.calculatedLevel = 4,
    row => row.report.total.suggestionPoints = 149, row => row.report.quarterlySuggestion.points = 149,
    row => row.report.weekly.selectedWeeks.push(structuredClone(row.report.weekly.selectedWeeks[0])),
    row => row.report.weekly.selectedWeeks[0].points = 2499, row => row.report.weekly.selectedWeeks[0].selected = false,
    row => row.report.weekly.omittedWeeks[0].selected = true, row => row.report.weekly.unassessedWeeks = row.report.weekly.selectedWeeks,
    row => row.report.sourceRevision = Number.MAX_SAFE_INTEGER + 1, row => row.report.sourceDigest = 'invalid',
    row => row.report.quarterlySuggestion.validFrom = '2026-02-30T00:00:00.000Z',
    row => row.report.quarterlyEmail.evidence.qualifies = false, row => row.report.quarterlyTotal.points = 1000,
    row => row.report.monthly.actions = [{ ...row.report.weekly.selectedWeeks[0].actions[0], points: -1 }],
    row => row.report.assessmentMode = 'confirmed', row => row.reportState = 'pending'];
  for (const edit of edits) { const raw = preparedReportFixture(); edit(raw); invalid(() => reportDto(raw)); }
  for (const score of [-1, 13651, 1.5, '13650', NaN, Infinity]) invalid(() => rewardsDto(preparedSnapshotFixture({ sourceScore: score })));
});

test('fixed following-month binding rejects wrong periods and confirmed or malformed projection authority', () => {
  for (const patch of [{ effectiveMonth: '2027-02' }, { sourceMonth: '2026-11' }, { state: 'confirmed' },
    { sourceRevision: 0 }, { revision: 1.5 }, { level: 2 }]) invalid(() => rewardsDto(preparedSnapshotFixture(patch)));
  const raw = preparedReportFixture(); raw.effectiveMonth = '2027-02'; invalid(() => reportDto(raw));
  raw.effectiveMonth = '2027-01'; raw.levelAuthority.effectiveMonth = '2026-12'; invalid(() => reportDto(raw));
  invalid(() => rewardsDto(preparedSnapshotFixture({ state: 'pending' })));
});

test('same-policy corrected snapshot history remains shadow and source revisions can remain unassessed', () => {
  const raw = preparedReportFixture(); raw.corrections.effectiveSnapshots = [{ ...metadata, revision: 2, mode: 'shadow',
    sourceRevision: 2, sourceScore: 150, level: 1, recordedAt: '2027-01-05T00:00:00.000Z' }];
  conforms(reportDto(raw)); raw.corrections.sourceRevisions[0].sourceScore = null; raw.corrections.sourceRevisions[0].level = null;
  conforms(reportDto(raw)); raw.corrections.effectiveSnapshots[0].mode = 'confirmed'; invalid(() => reportDto(raw));
});

test('schema rejects legacy/unversioned output, extra properties and entitlement promotion', () => {
  assert.equal(validate({ state: 'pending', currentLevel: 5, sourceScore: 13500 }), false);
  const valid = rewardsDto(preparedSnapshotFixture());
  for (const patch of [{ state: 'ready' }, { currentLevel: 1 }, { sourceScore: 0 }, { dataVersion: 1 },
    { maximumSourceMonth: 13500 }, { privateEvidenceIds: [] }, { snapshot: { state: 'confirmed', reasonCode: null } },
    { selection: { state: 'ready', reasonCode: null } }, { responseVersion: 'unknown' }]) assert.equal(validate({ ...valid, ...patch }), false);
  assert.equal(validate({ ...valid, snapshotProjection: { ...valid.snapshotProjection, level: 5 } }), false);
  const report = reportDto(preparedReportFixture()); report.report.quarterlySuggestion.qualifies = false;
  assert.equal(validate(report), false);
});
