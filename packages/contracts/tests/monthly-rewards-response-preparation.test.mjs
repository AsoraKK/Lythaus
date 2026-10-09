import assert from 'node:assert/strict';
import test from 'node:test';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { prepareMonthlyReputationReportResponse as reportDto, prepareMonthlyRewardsResponse as rewardsDto,
  MONTHLY_REWARDS_RESPONSE_PREPARATION as metadata } from '../src/monthly-rewards-response-preparation.ts';
import { MONTHLY_REWARDS_RESPONSE_PREPARATION_SCHEMA as schema } from '../src/monthly-rewards-response-preparation-schema.ts';
import { preparedReportFixture, preparedSnapshotFixture, pendingReportFixture } from '../fixtures/monthly-rewards-response-preparation.mjs';
import { MONTHLY_REPUTATION_ACTIVATION } from '../src/monthly-reputation-decisions.ts';
import { monthlyRewardsResponseReadiness } from '../src/monthly-rewards-response-readiness.ts';

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
  assert.equal(dto.effectiveMonth, '2026-12'); assert.equal(dto.report.weekly.selectedWeeks.length, 4);
  assert.equal(dto.report.weekly.omittedWeeks.length, 1); assert.equal(dto.report.quarterlyTotal.maximumPoints, 1150);
  assert.ok(!('weekId' in dto.report.weekly.selectedWeeks[0]));
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

test('distinct whole weeks follow the captured proposal convention and December rolls into January without approving D01', () => {
  const november = reportDto(preparedReportFixture()); conforms(november);
  assert.equal(november.report.weekly.selectedWeeks[0].startsAt, '2026-10-26T00:00:00.000Z');
  assert.equal(november.report.weekly.selectedWeeks[0].endsAt, '2026-11-02T00:00:00.000Z');
  assert.equal(november.report.weekly.omittedWeeks[0].startsAt, '2026-11-23T00:00:00.000Z');
  assert.equal(november.report.weekly.periodPolicyStatus, 'pending_owner_approval');
  const december = reportDto(preparedReportFixture('2026-12')); conforms(december);
  assert.equal(december.effectiveMonth, '2027-01'); assert.equal(december.report.weekly.selectedWeeks.length, 4);
  assert.ok(MONTHLY_REPUTATION_ACTIVATION.pendingDecisions.includes('D01'));
});

test('weekly preparation rejects reversed/zero/malformed ranges, wrong calendar boundaries and unknown conventions', () => {
  for (const patch of [{ endsAt: '2026-10-25T00:00:00.000Z' }, { endsAt: '2026-10-26T00:00:00.000Z' },
    { endsAt: '2026-11-01T00:00:00.000Z' }, { endsAt: '2026-11-03T00:00:00.000Z' },
    { startsAt: '2026-10-27T00:00:00.000Z', endsAt: '2026-11-03T00:00:00.000Z' },
    { startsAt: '2026-10-26T01:00:00.000Z', endsAt: '2026-11-02T01:00:00.000Z' },
    { startsAt: '2026-10-19T00:00:00.000Z', endsAt: '2026-10-26T00:00:00.000Z' }]) {
    const raw = preparedReportFixture(); Object.assign(raw.report.weekly.selectedWeeks[0], patch); invalid(() => reportDto(raw));
  }
  for (const periodPolicyVersion of [null, 'unknown', 'owner-approved-by-default']) {
    const raw = preparedReportFixture(); raw.report.weekly.periodPolicyVersion = periodPolicyVersion; invalid(() => reportDto(raw));
  }
});

test('weekly preparation rejects duplicate known IDs, periods and overlaps across selected, omitted and missing rows', () => {
  const edits = [
    row => row.report.weekly.selectedWeeks[1].weekId = row.report.weekly.selectedWeeks[0].weekId,
    row => Object.assign(row.report.weekly.selectedWeeks[1], { startsAt: row.report.weekly.selectedWeeks[0].startsAt,
      endsAt: row.report.weekly.selectedWeeks[0].endsAt }),
    row => row.report.weekly.omittedWeeks[0].weekId = row.report.weekly.selectedWeeks[0].weekId,
    row => Object.assign(row.report.weekly.selectedWeeks[1], { startsAt: '2026-10-30T00:00:00.000Z', endsAt: '2026-11-06T00:00:00.000Z' }),
    row => row.report.weekly.missingWeeks.push({ ...row.report.weekly.selectedWeeks[0], selected: false, points: 0 }),
  ];
  for (const edit of edits) { const raw = preparedReportFixture(); edit(raw); invalid(() => reportDto(raw)); }
});

test('partial and unavailable reader evidence stays null without inferred dates, and known IDs still cannot repeat', () => {
  const raw = preparedReportFixture(); raw.report.weekly.selectedWeeks[0].startsAt = null;
  raw.report.weekly.selectedWeeks[1].endsAt = null;
  raw.report.weekly.omittedWeeks[0].startsAt = null; raw.report.weekly.omittedWeeks[0].endsAt = null;
  const dto = reportDto(raw); conforms(dto);
  assert.equal(dto.report.weekly.selectedWeeks[0].startsAt, null); assert.equal(dto.report.weekly.selectedWeeks[1].endsAt, null);
  assert.equal(dto.report.weekly.omittedWeeks[0].startsAt, null); assert.equal(dto.report.total.sourceScore, 13650);
  for (const row of [...raw.report.weekly.selectedWeeks, ...raw.report.weekly.omittedWeeks]) {
    row.startsAt = null; row.endsAt = null;
  }
  raw.report.weekly.periodPolicyVersion = null;
  const unavailable = reportDto(raw); conforms(unavailable);
  assert.equal(unavailable.report.weekly.periodPolicyVersion, null); assert.equal(unavailable.report.weekly.periodPolicyStatus, 'unavailable');
  raw.report.weekly.selectedWeeks[1].weekId = raw.report.weekly.selectedWeeks[0].weekId;
  invalid(() => reportDto(raw));
});

test('complementary partial endpoints cannot represent the same canonical week under distinct IDs', () => {
  for (const complementary of ['selected', 'omitted', 'reversed']) {
    const raw = preparedReportFixture(), first = raw.report.weekly.selectedWeeks[0];
    const second = complementary === 'omitted' ? raw.report.weekly.omittedWeeks[0] : raw.report.weekly.selectedWeeks[1];
    const startsAt = first.startsAt, endsAt = first.endsAt;
    assert.notEqual(first.weekId, second.weekId);
    Object.assign(first, complementary === 'reversed' ? { startsAt: null, endsAt } : { startsAt, endsAt: null });
    Object.assign(second, complementary === 'reversed' ? { startsAt, endsAt: null } : { startsAt: null, endsAt });
    const before = structuredClone(raw); invalid(() => reportDto(raw)); assert.deepEqual(raw, before);
  }
});

test('distinct canonical partial weeks and unavailable periods preserve nulls and omit inferred dates or IDs', () => {
  const raw = preparedReportFixture(), weeks = raw.report.weekly.selectedWeeks;
  weeks[0].endsAt = null; weeks[1].startsAt = null;
  weeks[2].startsAt = null; weeks[2].endsAt = null;
  const before = structuredClone(raw), dto = reportDto(raw); conforms(dto);
  assert.equal(dto.report.weekly.selectedWeeks[0].startsAt, '2026-10-26T00:00:00.000Z');
  assert.equal(dto.report.weekly.selectedWeeks[0].endsAt, null);
  assert.equal(dto.report.weekly.selectedWeeks[1].startsAt, null);
  assert.equal(dto.report.weekly.selectedWeeks[1].endsAt, '2026-11-09T00:00:00.000Z');
  assert.equal(dto.report.weekly.selectedWeeks[2].startsAt, null); assert.equal(dto.report.weekly.selectedWeeks[2].endsAt, null);
  assert.ok(dto.report.weekly.selectedWeeks.every(row => !('weekId' in row)));
  assert.equal(dto.report.weekly.periodPolicyStatus, 'pending_owner_approval');
  assert.equal(dto.report.total.sourceScore, 13650); assert.equal(dto.runtimeActivationAllowed, false);
  assert.deepEqual(raw, before);
});

test('qualification validity rejects reversed or zero known windows while preserving null/partial evidence', () => {
  for (const [pick, projected] of [[row => row.report.quarterlyEmail.evidence, row => row.report.quarterlyEmail],
    [row => row.report.quarterlySuggestion, row => row.report.quarterlySuggestion]]) {
    for (const validUntil of ['2026-11-15T00:00:00.000Z', '2026-11-14T00:00:00.000Z']) {
      const raw = preparedReportFixture(); Object.assign(pick(raw), { validFrom: '2026-11-15T00:00:00.000Z', validUntil });
      invalid(() => reportDto(raw));
    }
    for (const patch of [{ validFrom: null, validUntil: '2027-01-01T00:00:00.000Z' },
      { validFrom: '2026-11-15T00:00:00.000Z', validUntil: null },
      { validFrom: '2026-11-15T00:00:00.000Z', validUntil: '2027-01-01T00:00:00.000Z' }]) {
      const raw = preparedReportFixture(); Object.assign(pick(raw), patch); const dto = reportDto(raw); conforms(dto);
      const result = projected(dto); assert.equal(result.validFrom, patch.validFrom); assert.equal(result.validUntil, patch.validUntil);
    }
  }
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
  const inconsistent = reportDto(preparedReportFixture()); inconsistent.report.weekly.periodPolicyStatus = 'unavailable';
  assert.equal(validate(inconsistent), false);
});

test('known preparation readiness is disabled metadata, never assessed progress or authority', () => {
  const value = monthlyRewardsResponseReadiness();
  assert.deepEqual(value, { state: 'disabled', reasonCode: 'activation_not_approved', ...metadata });
  assert.ok(!['sourceScore', 'sourceMonth', 'effectiveMonth', 'level', 'selection', 'snapshot'].some(key => key in value));
});

test('unknown or missing response versions have honest unavailable metadata without invented policy defaults', () => {
  for (const version of [null, '', 'monthly-rewards-response-v3', {}, true]) {
    assert.deepEqual(monthlyRewardsResponseReadiness(version), {
      state: 'unavailable', reasonCode: 'response_version_unsupported', responseVersion: null,
      policyVersion: null, catalogueHash: null, dataVersion: null, maximumSourceMonth: null,
      preparationOnly: true, runtimeActivationAllowed: false, appliedPoints: 0,
    });
  }
});
