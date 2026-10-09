import { PROSPECTIVE_REPUTATION_POLICY_VERSION, PROSPECTIVE_REPUTATION_CATALOGUE_HASH } from '../../../packages/contracts/src/monthly-reputation-prospective.ts';

type Row = Record<string, unknown>;

const columns = [
  'rowType', 'sourceMonth', 'effectiveMonth', 'reportState', 'reportReasonCode', 'policyVersion',
  'levelState', 'levelReasonCode', 'levelKind', 'levelSourceMonth', 'levelSourceScore', 'currentLevel',
  'sourceScore', 'calculatedLevel', 'weeklyPoints', 'monthlyPoints', 'quarterlyPoints',
  'weeklyMaximumPerWeek', 'selectedWeekLimit', 'maximumSelectedWeeklyPoints', 'monthlyMaximumPoints',
  'quarterlyMaximumPoints', 'maximumSourceMonth', 'periodStart', 'periodEnd', 'periodRevision',
  'snapshotMode', 'periodState', 'selected', 'selectionReason', 'actionId', 'capGroup', 'allowance',
  'remainingInGroup', 'actionPoints', 'accepted', 'pending', 'withheld', 'actionState',
  'actionReasonCode', 'evidenceCount', 'validFrom', 'validUntil', 'sourceRevision',
  'sourceReasonCode', 'recordedAt',
] as const;
const preparationColumns = ['dataVersion', 'catalogueHash', 'preparationOnly', 'runtimeActivationAllowed', 'appliedPoints',
  'emailPoints', 'suggestionPoints', 'emailMaximumPoints', 'suggestionMaximumPoints',
  'levelPolicyVersion', 'levelDataVersion', 'levelSourceRevision', 'levelSnapshotRevision', 'sourceDigest', 'assemblyEvidenceDigest',
  'inheritedWeeklyPolicyVersion', 'inheritedMaintenancePolicyVersion'] as const;

function record(value: unknown): Row {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  if (typeof value === 'number' && !Number.isFinite(value)) return '""';
  const text = typeof value === 'string' ? value : String(value);
  const safeText = typeof value === 'string' && /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

function weekRows(rows: Row[], rowType: string, weekValue: unknown, report: Row, level: Row): void {
  const week = record(weekValue);
  const common: Row = {
    rowType,
    sourceMonth: report.sourceMonth,
    effectiveMonth: report.effectiveMonth,
    reportState: report.reportState,
    policyVersion: report.policyVersion,
    levelState: level.state,
    levelReasonCode: level.reasonCode,
    levelKind: level.levelKind,
    currentLevel: level.level,
    periodStart: week.startsAt,
    periodEnd: week.endsAt,
    periodRevision: week.revision,
    periodState: week.state,
    selected: week.selected,
    selectionReason: week.selectionReason,
    weeklyPoints: week.points,
  };
  const actions = list(week.actions).map(record);
  if (!actions.length) rows.push(common);
  for (const action of actions) {
    rows.push({
      ...common,
      actionId: action.actionId,
      capGroup: action.capGroup,
      allowance: action.allowance,
      remainingInGroup: action.remainingInGroup,
      actionPoints: action.points,
      accepted: action.accepted,
      pending: action.pending,
      withheld: action.withheld,
      actionState: action.state,
      actionReasonCode: action.reasonCode,
      evidenceCount: action.evidenceCount,
      validFrom: action.validFrom,
      validUntil: action.validUntil,
    });
  }
}

function actionRow(rows: Row[], rowType: string, actionValue: unknown, report: Row, level: Row): void {
  const action = record(actionValue);
  rows.push({
    rowType,
    sourceMonth: report.sourceMonth,
    effectiveMonth: report.effectiveMonth,
    reportState: report.reportState,
    policyVersion: report.policyVersion,
    levelState: level.state,
    currentLevel: level.level,
    actionId: action.actionId,
    capGroup: action.capGroup,
    allowance: action.allowance ?? (report.policyVersion === PROSPECTIVE_REPUTATION_POLICY_VERSION ? action.maximumPoints : undefined),
    remainingInGroup: action.remainingInGroup,
    actionPoints: action.points,
    accepted: action.accepted,
    pending: action.pending,
    withheld: action.withheld,
    actionState: action.state,
    actionReasonCode: action.reasonCode,
    evidenceCount: action.evidenceCount,
    validFrom: action.validFrom,
    validUntil: action.validUntil,
  });
}

export function serializeMonthlyReputationReportCsv(value: unknown, preparation?: { mode: 'disabled_v2_preparation' }): string {
  const report = record(value);
  const v2 = report.policyVersion === PROSPECTIVE_REPUTATION_POLICY_VERSION;
  if ((v2 && !preparation) || (preparation && (!v2 || preparation.mode !== 'disabled_v2_preparation'
    || report.dataVersion !== 2 || report.catalogueHash !== PROSPECTIVE_REPUTATION_CATALOGUE_HASH
    || report.preparationOnly !== true || report.runtimeActivationAllowed !== false || report.appliedPoints !== 0)))
    throw new Error('monthly_report_export_preparation_required');
  const level = record(report.levelAuthority);
  const rows: Row[] = [];
  const detail = report.report === null ? null : record(report.report);
  const total = record(detail?.total);
  const weekly = record(detail?.weekly);
  const monthly = record(detail?.monthly);
  const quarterly = record(detail?.quarterlyEmail);
  const suggestion = record(detail?.quarterlySuggestion);
  const quarterlyTotal = v2 ? record(detail?.quarterlyTotal) : quarterly;
  rows.push({
    rowType: 'summary',
    sourceMonth: report.sourceMonth,
    effectiveMonth: report.effectiveMonth,
    reportState: report.reportState,
    reportReasonCode: report.reasonCode,
    policyVersion: report.policyVersion,
    levelState: level.state,
    levelReasonCode: level.reasonCode,
    levelKind: level.levelKind,
    levelSourceMonth: level.sourceMonth,
    levelSourceScore: level.sourceScore,
    currentLevel: level.level,
    sourceRevision: detail?.sourceRevision,
    sourceReasonCode: detail?.sourceReasonCode,
    recordedAt: detail?.sourceRecordedAt,
    sourceScore: total.sourceScore,
    calculatedLevel: total.calculatedLevel,
    weeklyPoints: total.weeklyPoints,
    monthlyPoints: total.monthlyPoints,
    quarterlyPoints: total.quarterlyPoints,
    weeklyMaximumPerWeek: weekly.maximumPerWeek,
    selectedWeekLimit: weekly.selectedWeekLimit,
    maximumSelectedWeeklyPoints: weekly.maximumSelectedWeeklyPoints,
    monthlyMaximumPoints: monthly.maximumPoints,
    quarterlyMaximumPoints: quarterlyTotal.maximumPoints,
    maximumSourceMonth: total.maximumSourceMonth,
    ...(v2 ? { emailPoints: quarterly.points, suggestionPoints: suggestion.points,
      emailMaximumPoints: quarterly.maximumPoints, suggestionMaximumPoints: suggestion.maximumPoints } : {}),
  });

  if (detail) {
    for (const week of list(weekly.selectedWeeks)) weekRows(rows, 'weekly_selected', week, report, level);
    for (const week of list(weekly.omittedWeeks)) weekRows(rows, 'weekly_omitted', week, report, level);
    for (const week of list(weekly.missingWeeks)) weekRows(rows, 'weekly_missing', week, report, level);
    for (const week of list(weekly.unassessedWeeks)) weekRows(rows, 'weekly_unassessed', week, report, level);
    for (const action of list(monthly.actions)) actionRow(rows, 'monthly_action', action, report, level);
    actionRow(rows, 'quarterly_email', quarterly.evidence, report, level);
    if (v2) actionRow(rows, 'quarterly_suggestion', suggestion, report, level);
  }
  const corrections = record(report.corrections);
  for (const correctionValue of list(corrections.sourceRevisions)) {
    const correction = record(correctionValue);
    rows.push({ rowType: 'source_correction', sourceMonth: report.sourceMonth,
      effectiveMonth: report.effectiveMonth, reportState: report.reportState, policyVersion: report.policyVersion,
      sourceRevision: correction.sourceRevision, sourceReasonCode: correction.reasonCode,
      sourceScore: correction.sourceScore, calculatedLevel: correction.level, currentLevel: level.level,
      recordedAt: correction.recordedAt });
  }
  for (const correctionValue of list(corrections.effectiveSnapshots)) {
    const correction = record(correctionValue);
    rows.push({ rowType: 'snapshot_correction', sourceMonth: report.sourceMonth,
      effectiveMonth: report.effectiveMonth, reportState: report.reportState, policyVersion: report.policyVersion,
      sourceRevision: correction.sourceRevision, sourceScore: correction.sourceScore,
      calculatedLevel: correction.level, currentLevel: level.level, snapshotMode: correction.mode,
      periodRevision: correction.revision, recordedAt: correction.recordedAt });
  }

  const selectedColumns: readonly string[] = v2 ? [...columns, ...preparationColumns] : columns;
  const metadata: Row = v2 ? { dataVersion: report.dataVersion, catalogueHash: report.catalogueHash,
    preparationOnly: true, runtimeActivationAllowed: false, appliedPoints: 0,
    levelPolicyVersion: level.policyVersion, levelDataVersion: level.dataVersion,
    levelSourceRevision: level.sourceRevision, levelSnapshotRevision: level.snapshotRevision,
    sourceDigest: detail?.sourceDigest, assemblyEvidenceDigest: detail?.assemblyEvidenceDigest,
    inheritedWeeklyPolicyVersion: weekly.earningPolicyVersion, inheritedMaintenancePolicyVersion: monthly.maintenancePolicyVersion } : {};
  return [selectedColumns.join(','), ...rows.map(row => {
    const versioned = { ...metadata, ...row };
    return selectedColumns.map(column => cell(versioned[column])).join(',');
  })].join('\r\n') + '\r\n';
}
