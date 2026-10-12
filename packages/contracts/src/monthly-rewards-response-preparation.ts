import { MONTHLY_REPUTATION_POLICY_VERSION, nextReputationMonth, requireSourceMonth } from './monthly-reputation-policy.ts';
import { PROSPECTIVE_REPUTATION_POLICY_VERSION, PROSPECTIVE_REPUTATION_CATALOGUE_HASH,
  prospectiveReputationLevelForScore } from './monthly-reputation-prospective.ts';
import { PROPOSED_CLOSING_SUNDAY_CALENDAR, proposedClosingSundayWeek } from './monthly-reputation-decisions.ts';

export const MONTHLY_REWARDS_RESPONSE_PREPARATION = Object.freeze({
  responseVersion: 'monthly-rewards-response-v2-preparation' as const,
  policyVersion: PROSPECTIVE_REPUTATION_POLICY_VERSION,
  catalogueHash: PROSPECTIVE_REPUTATION_CATALOGUE_HASH,
  dataVersion: 2 as const, preparationOnly: true as const,
  runtimeActivationAllowed: false as const, appliedPoints: 0 as const,
  maximumSourceMonth: 13_650 as const,
});

type ObjectValue = Record<string, unknown>;
function invalid(): never { throw new Error('monthly_rewards_response_preparation_invalid'); }
function object(value: unknown): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as ObjectValue;
}
function metadata(value: ObjectValue) {
  for (const key of ['policyVersion', 'catalogueHash', 'dataVersion', 'preparationOnly', 'runtimeActivationAllowed', 'appliedPoints'] as const)
    if (value[key] !== MONTHLY_REWARDS_RESPONSE_PREPARATION[key]) invalid();
}
function integer(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) invalid();
  return value;
}
function nullableInteger(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER) {
  return value === null || value === undefined ? null : integer(value, minimum, maximum);
}
function text(value: unknown, maximum = 128): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum) invalid();
  return value;
}
function code(value: unknown) {
  if (value === null || value === undefined) return null;
  const result = text(value, 100);
  if (!/^[a-z][a-z0-9_]{0,99}$/.test(result)) invalid();
  return result;
}
function instant(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const result = text(value, 24);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(result)
    || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString() !== result) invalid();
  return result;
}
function digest(value: unknown) {
  const result = text(value, 64);
  if (!/^[0-9a-f]{64}$/.test(result)) invalid();
  return result;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) invalid();
  return value;
}
function scoreLevel(score: unknown, level: unknown) {
  const sourceScore = integer(score, 0, 13_650);
  if (prospectiveReputationLevelForScore(sourceScore) !== integer(level, 1, 5)) invalid();
  return { sourceScore, level: level as number };
}
function nullableScoreLevel(score: unknown, level: unknown) {
  if (score === null && level === null) return { sourceScore: null, level: null };
  return scoreLevel(score, level);
}

export function validatePreparedMonthlyWeekEvidence(values: unknown[], input: {
  sourceMonth: string; periodPolicyVersion: unknown;
}) {
  requireSourceMonth(input.sourceMonth);
  const periodPolicyVersion = input.periodPolicyVersion == null ? null : text(input.periodPolicyVersion);
  if (periodPolicyVersion !== null && periodPolicyVersion !== PROPOSED_CLOSING_SUNDAY_CALENDAR.version) invalid();
  const identities = new Set<string>(), starts = new Set<string>(), ends = new Set<string>();
  const periods = values.map(value => {
    const row = object(value), startsAt = instant(row.startsAt), endsAt = instant(row.endsAt);
    if (row.weekId != null) {
      const id = text(row.weekId);
      if (identities.has(id)) invalid();
      identities.add(id);
    }
    if (startsAt !== null) {
      if (starts.has(startsAt)) invalid();
      starts.add(startsAt);
    }
    if (endsAt !== null) {
      if (ends.has(endsAt)) invalid();
      ends.add(endsAt);
    }
    if (startsAt !== null && endsAt !== null && startsAt >= endsAt) invalid();
    return { startsAt, endsAt };
  });
  const complete = periods.filter((row): row is { startsAt: string; endsAt: string } => row.startsAt !== null && row.endsAt !== null)
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  for (let index = 1; index < complete.length; index++)
    if (complete[index].startsAt < complete[index - 1].endsAt) invalid();
  const canonicalPeriods = new Set<string>();
  for (const row of periods) {
    if (row.startsAt === null && row.endsAt === null) continue;
    if (periodPolicyVersion === null) invalid();
    const expected = proposedClosingSundayWeek(row.startsAt ?? new Date(Date.parse(row.endsAt!) - 1).toISOString());
    if ((row.startsAt !== null && row.startsAt !== expected.startsAt)
      || (row.endsAt !== null && row.endsAt !== expected.endsAt) || expected.ownerMonth !== input.sourceMonth) invalid();
    if (canonicalPeriods.has(expected.startsAt)) invalid();
    canonicalPeriods.add(expected.startsAt);
  }
  return { periodPolicyVersion, periodPolicyStatus: periodPolicyVersion === null
    ? 'unavailable' as const : PROPOSED_CLOSING_SUNDAY_CALENDAR.status };
}

function snapshotProjection(value: unknown, effectiveMonth: string) {
  const snapshot = object(value);
  if (snapshot.effectiveMonth !== effectiveMonth || !['unavailable', 'pending', 'shadow'].includes(snapshot.state as string)) invalid();
  const state = snapshot.state as 'unavailable' | 'pending' | 'shadow';
  const reasonCode = code(snapshot.reasonCode);
  if (state === 'unavailable' && !('policyVersion' in snapshot)) {
    if (reasonCode !== 'approval_unavailable') invalid();
  } else metadata(snapshot);
  if (state !== 'shadow') {
    if (snapshot.sourceScore != null || snapshot.sourceMonth != null
      || (snapshot.level != null && !(snapshot.level === 1 && snapshot.levelKind === 'unassessed_default'))) invalid();
    return { state, reasonCode, sourceMonth: null, effectiveMonth, sourceScore: null, level: null,
      sourceRevision: null, snapshotRevision: null };
  }
  const sourceMonth = text(snapshot.sourceMonth, 7);
  requireSourceMonth(sourceMonth);
  if (nextReputationMonth(sourceMonth) !== effectiveMonth) invalid();
  return { state, reasonCode, sourceMonth, effectiveMonth, ...scoreLevel(snapshot.sourceScore, snapshot.level),
    sourceRevision: integer(snapshot.sourceRevision, 1),
    snapshotRevision: integer(snapshot.snapshotRevision ?? snapshot.revision, 1) };
}

function action(value: unknown) {
  const row = object(value);
  if (row.policyVersion !== MONTHLY_REPUTATION_POLICY_VERSION || row.dataVersion !== 1) invalid();
  return { actionId: text(row.actionId), capGroup: row.capGroup == null ? null : text(row.capGroup),
    allowance: nullableInteger(row.allowance, 0, 2_500), remainingInGroup: nullableInteger(row.remainingInGroup, 0, 2_500),
    points: integer(row.points, 0, 2_500), accepted: nullableInteger(row.accepted, 0),
    pending: nullableInteger(row.pending, 0), withheld: nullableInteger(row.withheld, 0),
    state: row.state == null ? null : text(row.state), reasonCode: code(row.reasonCode),
    evidenceCount: integer(row.evidenceCount, 0), validFrom: instant(row.validFrom), validUntil: instant(row.validUntil),
    policyVersion: MONTHLY_REPUTATION_POLICY_VERSION, dataVersion: 1 as const };
}
function week(value: unknown) {
  const row = object(value); metadata(row);
  if (row.earningPolicyVersion !== MONTHLY_REPUTATION_POLICY_VERSION
    || ![true, false, null].includes(row.selected as boolean | null)) invalid();
  return { startsAt: instant(row.startsAt), endsAt: instant(row.endsAt), points: integer(row.points, 0, 2_500),
    revision: nullableInteger(row.revision, 1), state: text(row.state), selected: row.selected as boolean | null,
    selectionReason: code(row.selectionReason), earningPolicyVersion: MONTHLY_REPUTATION_POLICY_VERSION,
    rulesVersion: text(row.rulesVersion), actions: array(row.actions).map(action) };
}
function qualification(value: unknown, maximum: 1_000 | 150, actionId: string) {
  const row = object(value);
  if (row.actionId !== actionId || row.maximumPoints !== maximum || typeof row.qualifies !== 'boolean'
    || (row.renewalRequired !== null && typeof row.renewalRequired !== 'boolean')) invalid();
  const points = integer(row.points, 0, maximum);
  if (![0, maximum].includes(points) || row.qualifies !== (points === maximum)) invalid();
  const validFrom = instant(row.validFrom), validUntil = instant(row.validUntil);
  if (validFrom !== null && validUntil !== null && validFrom >= validUntil) invalid();
  return { actionId, maximumPoints: maximum, points, qualifies: row.qualifies,
    reasonCode: code(row.reasonCode), validFrom, validUntil,
    renewalRequired: row.renewalRequired as boolean | null };
}
function detail(value: unknown, sourceMonth: string) {
  if (value === null) return null;
  const report = object(value); metadata(report);
  const weekly = object(report.weekly), monthly = object(report.monthly), email = object(report.quarterlyEmail),
    suggestion = object(report.quarterlySuggestion), quarterly = object(report.quarterlyTotal);
  for (const row of [weekly, monthly, email, suggestion, quarterly]) metadata(row);
  if (weekly.maximumPerWeek !== 2_500 || weekly.selectedWeekLimit !== 4 || weekly.maximumSelectedWeeklyPoints !== 10_000
    || weekly.earningPolicyVersion !== MONTHLY_REPUTATION_POLICY_VERSION
    || monthly.maximumPoints !== 2_500 || monthly.maintenancePolicyVersion !== MONTHLY_REPUTATION_POLICY_VERSION
    || email.maximumPoints !== 1_000 || quarterly.maximumPoints !== 1_150
    || ![null, 'shadow'].includes(report.assessmentMode as null | string)) invalid();
  const selected = array(weekly.selectedWeeks), omitted = array(weekly.omittedWeeks),
    missing = array(weekly.missingWeeks), unassessed = array(weekly.unassessedWeeks);
  const periodConvention = validatePreparedMonthlyWeekEvidence([...selected, ...omitted, ...missing, ...unassessed],
    { sourceMonth, periodPolicyVersion: weekly.periodPolicyVersion });
  const selectedWeeks = selected.map(week), omittedWeeks = omitted.map(week),
    missingWeeks = missing.map(week), unassessedWeeks = unassessed.map(week);
  if (selectedWeeks.length > 4 || selectedWeeks.some(row => row.selected !== true)
    || [...omittedWeeks, ...missingWeeks].some(row => row.selected !== false)
    || unassessedWeeks.some(row => row.selected !== null)) invalid();
  const emailEvidence = qualification(email.evidence, 1_000, 'quarterly.email_control');
  const suggestionEvidence = qualification(suggestion, 150, 'quarterly.suggestion');
  if (email.points !== emailEvidence.points || quarterly.points !== emailEvidence.points + suggestionEvidence.points) invalid();
  const weeklyPoints = nullableInteger(weekly.points, 0, 10_000), monthlyPoints = integer(monthly.points, 0, 2_500);
  let total = null;
  if (report.total !== null) {
    const row = object(report.total); metadata(row);
    const scored = scoreLevel(row.sourceScore, row.calculatedLevel);
    if (report.assessmentMode !== 'shadow' || row.maximumSourceMonth !== 13_650 || row.weeklyPoints !== weeklyPoints
      || row.monthlyPoints !== monthlyPoints || row.emailPoints !== emailEvidence.points
      || row.suggestionPoints !== suggestionEvidence.points || row.quarterlyPoints !== quarterly.points
      || weeklyPoints === null || scored.sourceScore !== weeklyPoints + monthlyPoints + (quarterly.points as number)
      || weeklyPoints !== selectedWeeks.reduce((sum, row) => sum + row.points, 0)) invalid();
    total = { weeklyPoints, monthlyPoints, emailPoints: emailEvidence.points, suggestionPoints: suggestionEvidence.points,
      quarterlyPoints: quarterly.points as number, sourceScore: scored.sourceScore, calculatedLevel: scored.level,
      maximumSourceMonth: 13_650 as const };
  } else if (report.assessmentMode !== null || weeklyPoints !== null) invalid();
  return { sourceRevision: integer(report.sourceRevision, 1), sourceReasonCode: code(report.sourceReasonCode),
    sourceRecordedAt: instant(report.sourceRecordedAt), assessmentMode: report.assessmentMode as 'shadow' | null,
    sourceDigest: digest(report.sourceDigest), assemblyEvidenceDigest: digest(report.assemblyEvidenceDigest),
    weekly: { maximumPerWeek: 2_500 as const, selectedWeekLimit: 4 as const, maximumSelectedWeeklyPoints: 10_000 as const,
      points: weeklyPoints, earningPolicyVersion: MONTHLY_REPUTATION_POLICY_VERSION, rulesVersion: text(weekly.rulesVersion), ...periodConvention,
      selectedWeeks, omittedWeeks, missingWeeks, unassessedWeeks },
    monthly: { maximumPoints: 2_500 as const, points: monthlyPoints, maintenancePolicyVersion: MONTHLY_REPUTATION_POLICY_VERSION,
      rulesVersion: text(monthly.rulesVersion), actions: array(monthly.actions).map(action) },
    quarterlyEmail: emailEvidence, quarterlySuggestion: suggestionEvidence,
    quarterlyTotal: { points: quarterly.points as number, maximumPoints: 1_150 as const }, total };
}

function corrections(value: unknown) {
  const history = object(value);
  return {
    sourceRevisions: array(history.sourceRevisions).map(value => {
      const row = object(value); metadata(row);
      return { sourceRevision: integer(row.sourceRevision, 2), reasonCode: code(row.reasonCode),
        recordedAt: instant(row.recordedAt), ...nullableScoreLevel(row.sourceScore, row.level) };
    }),
    effectiveSnapshots: array(history.effectiveSnapshots).map(value => {
      const row = object(value); metadata(row);
      if (row.mode !== 'shadow') invalid();
      return { revision: integer(row.revision, 2), mode: 'shadow' as const,
        sourceRevision: integer(row.sourceRevision, 1), recordedAt: instant(row.recordedAt), ...scoreLevel(row.sourceScore, row.level) };
    }),
  };
}

export function prepareMonthlyReputationReportResponse(value: unknown) {
  const report = object(value); metadata(report);
  const sourceMonth = text(report.sourceMonth, 7); requireSourceMonth(sourceMonth);
  const effectiveMonth = nextReputationMonth(sourceMonth);
  if (report.effectiveMonth !== effectiveMonth || !['pending', 'shadow'].includes(report.reportState as string)) invalid();
  const projectedReport = detail(report.report, sourceMonth);
  if ((report.reportState === 'shadow') !== (projectedReport?.assessmentMode === 'shadow')) invalid();
  return { ...MONTHLY_REWARDS_RESPONSE_PREPARATION, responseKind: 'monthly_reputation_report' as const,
    reportState: report.reportState as 'pending' | 'shadow', reasonCode: code(report.reasonCode), sourceMonth, effectiveMonth,
    levelAuthority: { state: 'unavailable' as const, reasonCode: 'activation_not_approved' as const,
      effectiveMonth, sourceMonth: null, sourceScore: null, level: null },
    snapshotProjection: snapshotProjection(report.levelAuthority, effectiveMonth),
    corrections: corrections(report.corrections), report: projectedReport };
}

export function prepareMonthlyRewardsResponse(value: unknown) {
  const snapshot = object(value); metadata(snapshot);
  if (snapshot.maximumSourceMonth !== 13_650) invalid();
  const effectiveMonth = text(snapshot.effectiveMonth, 7); requireSourceMonth(effectiveMonth);
  return { ...MONTHLY_REWARDS_RESPONSE_PREPARATION, responseKind: 'monthly_rewards' as const,
    state: 'pending' as const, reasonCode: 'activation_not_approved' as const, effectiveMonth,
    currentLevel: null, sourceMonth: null, sourceScore: null,
    snapshot: { state: 'unavailable' as const, reasonCode: 'activation_not_approved' as const },
    selection: { state: 'unavailable' as const, reasonCode: 'approval_unavailable' as const },
    snapshotProjection: snapshotProjection(snapshot, effectiveMonth) };
}

export type MonthlyReputationReportResponsePreparation = ReturnType<typeof prepareMonthlyReputationReportResponse>;
export type MonthlyRewardsResponsePreparation = ReturnType<typeof prepareMonthlyRewardsResponse>;
