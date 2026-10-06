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

export function serializeMonthlyReputationReportCsv(value: unknown): string {
  const report = record(value);
  const level = record(report.levelAuthority);
  const rows: Row[] = [];
  const detail = report.report === null ? null : record(report.report);
  const total = record(detail?.total);
  const weekly = record(detail?.weekly);
  const monthly = record(detail?.monthly);
  const quarterly = record(detail?.quarterlyEmail);
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
    quarterlyMaximumPoints: quarterly.maximumPoints,
    maximumSourceMonth: total.maximumSourceMonth,
  });

  if (detail) {
    for (const week of list(weekly.selectedWeeks)) weekRows(rows, 'weekly_selected', week, report, level);
    for (const week of list(weekly.omittedWeeks)) weekRows(rows, 'weekly_omitted', week, report, level);
    for (const week of list(weekly.missingWeeks)) weekRows(rows, 'weekly_missing', week, report, level);
    for (const week of list(weekly.unassessedWeeks)) weekRows(rows, 'weekly_unassessed', week, report, level);
    for (const action of list(monthly.actions)) actionRow(rows, 'monthly_action', action, report, level);
    actionRow(rows, 'quarterly_email', quarterly.evidence, report, level);
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

  return [columns.join(','), ...rows.map(row => columns.map(column => cell(row[column])).join(','))].join('\r\n') + '\r\n';
}
