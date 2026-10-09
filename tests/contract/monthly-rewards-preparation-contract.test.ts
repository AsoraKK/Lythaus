import * as fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import jp = require('jsonpointer');

const spec = JSON.parse(fs.readFileSync('api/openapi/dist/openapi.json', 'utf8'));
function deref(value: any): any {
  if (!value || typeof value !== 'object') return value;
  if (value.$ref) return deref(jp.get(spec, value.$ref.substring(1)));
  if (Array.isArray(value)) return value.map(deref);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, deref(item)]));
}
const ajv = new Ajv({ strict: false, allErrors: true }); addFormats(ajv);
const schema = (name: string) => ajv.compile(deref(spec.components.schemas[name]));
const result = spawnSync(process.execPath, ['--experimental-strip-types', 'tests/contract/fixtures/monthly-rewards-preparation-wire.mjs'], { encoding: 'utf8' });
if (result.error || result.status !== 0) throw result.error ?? new Error(result.stderr);
const fixture = JSON.parse(result.stdout);
const legacyReport = { reportState: 'pending', sourceMonth: '2026-12', effectiveMonth: '2027-01',
  policyVersion: 'lythaus-monthly-rewards-2026-10-v1', levelAuthority: { state: 'confirmed', effectiveMonth: '2027-01',
    sourceMonth: '2026-12', sourceScore: 13500, level: 5 }, corrections: { sourceRevisions: [], effectiveSnapshots: [] }, report: null };
const legacyRewards = { state: 'ready', reasonCode: null, effectiveMonth: '2027-01', currentLevel: 5,
  sourceMonth: '2026-12', sourceScore: 13500, snapshot: {}, selection: {} };

describe('canonical disabled monthly rewards preparation', () => {
  test('v1 wire fields, generated return types and historical 13500 limits remain compatible', () => {
    const report = schema('MonthlyReputationReportResponse'), rewards = schema('MonthlyRewardsMeResponse');
    expect(report(legacyReport)).toBe(true); expect(rewards(legacyRewards)).toBe(true);
    expect(rewards({ ...legacyRewards, sourceScore: 13650 })).toBe(false);
    expect(report({ ...legacyReport, levelAuthority: { ...legacyReport.levelAuthority, sourceScore: 13650 } })).toBe(false);
    expect(report({ ...legacyReport, sourceMonth: '2026-13' })).toBe(false);
    for (const [file, model, method] of [['reputation', 'MonthlyReputationReportResponse', 'getMyMonthlyReputationReport'],
      ['rewards', 'MonthlyRewardsMeResponse', 'getMyMonthlyRewards']]) {
      const generated = fs.readFileSync(`lib/generated/api_client/lib/src/api/${file}_api.dart`, 'utf8');
      expect(generated).toContain(`Future<Response<${model}>> ${method}(`);
    }
  });

  test('existing own-member operations retain authentication and expose no version, subject or preparation selector', () => {
    const report = spec.paths['/reputation/me/reports/monthly/{sourceMonth}'].get;
    const rewards = spec.paths['/rewards/me/monthly'].get;
    for (const operation of [report, rewards]) {
      expect(operation.security).toEqual([{ bearerAuth: [] }]);
      expect(operation.requestBody).toBeUndefined();
      expect(operation.responses['200'].headers['Cache-Control'].schema.example).toBe('private, no-store');
      expect((operation.parameters ?? []).every((parameter: any) => deref(parameter).in === 'path')).toBe(true);
    }
    expect(report.parameters.map((parameter: any) => deref(parameter).name)).toEqual(['sourceMonth']);
  });

  test('known and unknown readiness stay disabled or unavailable without scores or defaults', () => {
    const validate = schema('MonthlyResponsePreparationReadiness');
    expect(validate(fixture.readiness)).toBe(true); expect(validate(fixture.unknownReadiness)).toBe(true);
    for (const patch of [{ state: 'ready' }, { runtimeActivationAllowed: true }, { preparationOnly: false },
      { sourceScore: 0 }, { maximumSourceMonth: 13500 }, { dataVersion: 1 }, { responseVersion: 'future-v3' }, { appliedPoints: 1 }])
      expect(validate({ ...fixture.readiness, ...patch })).toBe(false);
    expect(validate({ ...fixture.unknownReadiness, dataVersion: 2 })).toBe(false);
  });

  test('reviewed builders produce canonical typed DTOs with progress distinct from the immutable projection', () => {
    const report = schema('MonthlyReputationReportResponsePreparation'), rewards = schema('MonthlyRewardsResponsePreparation');
    for (const value of [fixture.report, fixture.partialReport, fixture.yearBoundaryReport, fixture.pendingReport]) {
      expect(report(value)).toBe(true);
      expect(schema('MonthlyReputationReportResponse')({ ...legacyReport, responsePreparation: fixture.readiness, preparedResponse: value })).toBe(true);
    }
    expect(rewards(fixture.rewards)).toBe(true);
    expect(schema('MonthlyRewardsMeResponse')({ ...legacyRewards, responsePreparation: fixture.readiness, preparedResponse: fixture.rewards })).toBe(true);
    expect(fixture.report.report.total.sourceScore).toBe(13650); expect(fixture.report.snapshotProjection.sourceScore).toBe(0);
    expect(fixture.report.levelAuthority.sourceScore).toBeNull(); expect(fixture.rewards.currentLevel).toBeNull();
    expect(fixture.yearBoundaryReport.effectiveMonth).toBe('2027-01');
    expect(fixture.report.report.weekly.periodPolicyStatus).toBe('pending_owner_approval');
  });

  test('canonical DTOs reject entitlement promotion, private identifiers, policy mixing and cap or level contradictions', () => {
    const rewards = schema('MonthlyRewardsResponsePreparation'), report = schema('MonthlyReputationReportResponsePreparation');
    for (const patch of [{ state: 'ready' }, { currentLevel: 1 }, { sourceScore: 0 }, { sourceMonth: '2026-12' },
      { dataVersion: 1 }, { responseVersion: 'future-v3' }, { runtimeActivationAllowed: true }, { privateEvidenceIds: [] }])
      expect(rewards({ ...fixture.rewards, ...patch })).toBe(false);
    const raw = structuredClone(fixture.report); raw.report.total.sourceScore = 13651; expect(report(raw)).toBe(false);
    raw.report.total.sourceScore = 13650; raw.report.total.calculatedLevel = 1; expect(report(raw)).toBe(false);
    const privateWeek = structuredClone(fixture.report); privateWeek.report.weekly.selectedWeeks[0].weekId = 'private'; expect(report(privateWeek)).toBe(false);
    const mixedAction = structuredClone(fixture.report); mixedAction.report.weekly.selectedWeeks[0].actions[0].dataVersion = 2; expect(report(mixedAction)).toBe(false);
    const wrongQualification = structuredClone(fixture.report); wrongQualification.report.quarterlySuggestion.qualifies = false; expect(report(wrongQualification)).toBe(false);
  });

  test('semantic period guards reject malformed and complementary duplicate evidence while valid partials stay null', () => {
    expect(Object.keys(fixture.rejectedEvidence)).toHaveLength(5);
    expect(Object.values(fixture.rejectedEvidence).every(value => value === true)).toBe(true);
    const weeks = fixture.partialReport.report.weekly.selectedWeeks;
    expect(weeks[0].endsAt).toBeNull(); expect(weeks[1].startsAt).toBeNull();
    expect(weeks[2].startsAt).toBeNull(); expect(weeks[2].endsAt).toBeNull();
    expect(weeks.every((week: any) => !('weekId' in week))).toBe(true);
  });
});
