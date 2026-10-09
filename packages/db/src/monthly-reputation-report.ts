import type { Client } from 'pg';
import { MONTHLY_REPUTATION_POLICY_VERSION, MONTHLY_REPUTATION_CATALOGUE_HASH, MONTHLY_REPUTATION_LIMITS, nextReputationMonth, requireSourceMonth } from '../../contracts/src/monthly-reputation-policy.ts';
import { monthlyRewardSnapshotConfiguration, readOwnMonthlyRewardSnapshot } from './monthly-reward-snapshots.ts';
import { PROSPECTIVE_REPUTATION_POLICY_VERSION, PROSPECTIVE_REPUTATION_CATALOGUE_HASH,
  PROSPECTIVE_REPUTATION_REPORT_LIMITS, prospectiveReputationLevelForScore } from '../../contracts/src/monthly-reputation-prospective.ts';
import type { MonthlyReputationDisposablePreparation } from './monthly-reputation.ts';

type JsonObject = Record<string, unknown>;
type ReportSourceRow = {
  revision: number;
  reason_code: string;
  recorded_at: Date;
  catalogue_hash: string;
  input_digest: string;
  assembly_policy: string | null;
  assembly_digest: string | null;
  preparation_matches: boolean | null;
  assessment_policy: string | null;
  report: unknown | null;
  assessment_mode: 'shadow' | null;
  calculation: JsonObject | null;
  weekly_points: number | null;
  monthly_points: number | null;
  quarterly_points: number | null;
  source_score: number | null;
  level: number | null;
};

function requireSubjectId(value: string): void {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) {
    throw new Error('monthly_report_subject_invalid');
  }
}

function object(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function integer(value: unknown): number | null {
  return Number.isSafeInteger(value) && typeof value === 'number' ? value : null;
}

function reasonCode(value: unknown): string | null {
  const code = text(value);
  return code && /^[a-z][a-z0-9_]{0,99}$/.test(code) ? code : null;
}

function projectAction(value: unknown) {
  const action = object(value);
  const evidenceIds = array(action.evidenceIds);
  return {
    actionId: text(action.actionId),
    capGroup: text(action.capGroup),
    allowance: integer(action.allowance) ?? integer(action.maximumPoints),
    remainingInGroup: integer(action.remainingInGroup),
    points: integer(action.points) ?? 0,
    accepted: integer(action.accepted),
    pending: integer(action.pending),
    withheld: integer(action.withheld),
    state: text(action.state),
    reasonCode: reasonCode(action.reasonCode) ?? reasonCode(action.reason),
    evidenceCount: evidenceIds.length,
    validFrom: text(action.validFrom),
    validUntil: text(action.validUntil),
  };
}

function projectActions(value: unknown) {
  return array(value).map(projectAction).filter(action => action.actionId !== null);
}

function projectWeek(assessmentWeek: JsonObject | undefined, assembledWeek: JsonObject | undefined) {
  const weeklyCalculation = object(assembledWeek?.calculation);
  return {
    startsAt: text(assessmentWeek?.startsAt) ?? text(weeklyCalculation.startsAt) ?? text(assembledWeek?.startsAt),
    endsAt: text(assessmentWeek?.endsAt) ?? text(weeklyCalculation.endsAt) ?? text(assembledWeek?.endsAt),
    points: integer(assessmentWeek?.points) ?? integer(weeklyCalculation.points) ?? 0,
    revision: integer(assessmentWeek?.revision) ?? integer(assembledWeek?.revision),
    state: text(assessmentWeek?.state) ?? text(weeklyCalculation.state) ?? 'missing',
    selected: typeof assessmentWeek?.selected === 'boolean' ? assessmentWeek.selected : null,
    selectionReason: text(assessmentWeek?.selectionReason),
    actions: projectActions(weeklyCalculation.actions),
  };
}

function projectMaintenance(value: unknown) {
  const maintenance = object(value);
  const actions = projectActions(maintenance.actions);
  return {
    monthlyPoints: integer(maintenance.monthlyPoints) ?? 0,
    quarterlyPoints: integer(maintenance.quarterlyPoints) ?? 0,
    monthlyActions: actions.filter(action => action.actionId?.startsWith('monthly.') === true),
    quarterlyEmail: actions.find(action => action.actionId === 'quarterly.email_control') ?? null,
  };
}

function projectQuarterlyComponent(value: unknown, actionId: string, points: unknown, maximumPoints: number) {
  const qualification = object(value);
  return {
    actionId, maximumPoints, points: integer(points),
    qualifies: qualification.qualifies === true,
    reasonCode: reasonCode(qualification.reason),
    validFrom: text(qualification.validFrom), validUntil: text(qualification.validUntil),
    renewalRequired: typeof qualification.renewalRequired === 'boolean' ? qualification.renewalRequired : null,
  };
}

function validatePreparedAssessment(row: ReportSourceRow, sourceMonth: string, effectiveMonth: string) {
  if (!row.calculation) return;
  const calculation = object(row.calculation);
  const limits = PROSPECTIVE_REPUTATION_REPORT_LIMITS;
  const bounded = (value: unknown, maximum: number) => integer(value) !== null && (value as number) >= 0 && (value as number) <= maximum;
  if (row.assessment_policy !== PROSPECTIVE_REPUTATION_POLICY_VERSION
    || calculation.policyVersion !== PROSPECTIVE_REPUTATION_POLICY_VERSION || calculation.preparationOnly !== true
    || calculation.sourceMonth !== sourceMonth || calculation.effectiveMonth !== effectiveMonth
    || !bounded(calculation.weeklyPoints, limits.maximumSelectedWeeklyPoints)
    || !bounded(calculation.monthlyPoints, limits.monthlyMaximumPoints)
    || ![0, limits.emailMaximumPoints].includes(calculation.emailPoints as number)
    || ![0, limits.suggestionMaximumPoints].includes(calculation.suggestionPoints as number)
    || calculation.quarterlyPoints !== (calculation.emailPoints as number) + (calculation.suggestionPoints as number)
    || calculation.sourceScore !== (calculation.weeklyPoints as number) + (calculation.monthlyPoints as number) + (calculation.quarterlyPoints as number)
    || row.weekly_points !== calculation.weeklyPoints || row.monthly_points !== calculation.monthlyPoints
    || row.quarterly_points !== calculation.quarterlyPoints || row.source_score !== calculation.sourceScore
    || row.level !== calculation.level) throw new Error('monthly_report_assessment_integrity_failed');
  if (prospectiveReputationLevelForScore(calculation.sourceScore as number) !== calculation.level)
    throw new Error('monthly_report_assessment_integrity_failed');
}

export async function readOwnMonthlyReputationReport(client: Client, input: {
  subjectId: string;
  sourceMonth: string;
  snapshotRulesVersion?: string;
}, context?: MonthlyReputationDisposablePreparation) {
  requireSubjectId(input.subjectId);
  requireSourceMonth(input.sourceMonth);
  const effectiveMonth = nextReputationMonth(input.sourceMonth);
  const policyVersion = context ? PROSPECTIVE_REPUTATION_POLICY_VERSION : MONTHLY_REPUTATION_POLICY_VERSION;
  const catalogueHash = context ? PROSPECTIVE_REPUTATION_CATALOGUE_HASH : MONTHLY_REPUTATION_CATALOGUE_HASH;
  const metadata = context ? { policyVersion, catalogueHash, dataVersion: 2 as const,
    preparationOnly: true as const, runtimeActivationAllowed: false as const, appliedPoints: 0 as const } : {};
  const configuration = input.snapshotRulesVersion
    ? await monthlyRewardSnapshotConfiguration(client, input.snapshotRulesVersion, context)
    : null;
  if (!configuration) {
    return {
      reportState: 'pending' as const,
      reasonCode: 'report_unavailable',
      sourceMonth: input.sourceMonth,
      effectiveMonth,
      policyVersion,
      ...metadata,
      levelAuthority: {
        state: 'unavailable' as const,
        reasonCode: 'approval_unavailable',
        effectiveMonth,
        sourceMonth: null,
        sourceScore: null,
        level: null,
        levelKind: null,
      },
      corrections: { sourceRevisions: [], effectiveSnapshots: [] },
      report: null,
    };
  }
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
    `monthly-reputation:${input.subjectId}:${input.sourceMonth}`,
  ]);
  const authority = await readOwnMonthlyRewardSnapshot(client, {
    subjectId: input.subjectId,
    rulesVersion: input.snapshotRulesVersion,
    effectiveMonth,
  }, context);
  const authorityDetails = object(authority);
  const base = {
    sourceMonth: input.sourceMonth,
    effectiveMonth,
    policyVersion,
    ...metadata,
    levelAuthority: {
      state: authority.state,
      reasonCode: authority.reasonCode,
      effectiveMonth: authority.effectiveMonth,
      sourceMonth: text(authorityDetails.sourceMonth),
      sourceScore: integer(authorityDetails.sourceScore),
      level: integer(authorityDetails.level),
      levelKind: text(authorityDetails.levelKind),
      ...metadata,
      ...(context ? { snapshotRevision: integer(authorityDetails.revision), sourceRevision: integer(authorityDetails.sourceRevision) } : {}),
    },
    corrections: { sourceRevisions: [], effectiveSnapshots: [] },
  };
  if (authority.state === 'unavailable' && authority.reasonCode === 'approval_unavailable') {
    return { reportState: 'pending' as const, reasonCode: 'report_unavailable', ...base, report: null };
  }
  const revisions = (await client.query<ReportSourceRow>(`SELECT source.revision, source.reason_code, source.recorded_at,
      source.catalogue_hash, assembly.report, assessment.mode AS assessment_mode, assessment.calculation,
      assessment.weekly_points, assessment.monthly_points, assessment.quarterly_points,
      assessment.source_score, assessment.level, source.input_digest, assembly.policy_version AS assembly_policy,
      assembly.evidence_digest AS assembly_digest,
      ${context ? "assembly.report -> 'preparationConfiguration' = $4::jsonb" : 'NULL::boolean'} AS preparation_matches,
      ${context ? 'assessment.policy_version' : 'source.policy_version'} AS assessment_policy
    FROM trust.monthly_reputation_sources source
    LEFT JOIN trust.monthly_reputation_assemblies assembly ON assembly.source_id = source.id
    LEFT JOIN trust.monthly_reputation_assessments assessment ON assessment.source_id = source.id
    WHERE source.subject_user_id = $1 AND source.source_month = $2::date
      AND source.policy_version = $3
    ORDER BY source.revision DESC`, [input.subjectId, `${input.sourceMonth}-01`, policyVersion,
    ...(context ? [JSON.stringify(configuration.preparation_configuration)] : [])])).rows;
  if (context) for (const row of revisions) validatePreparedAssessment(row, input.sourceMonth, effectiveMonth);
  const snapshotHistory = (await client.query<{ revision: number; mode: string; source_revision: number;
    source_score: number; level: number; corrected: boolean; recorded_at: Date }>(`SELECT revision, mode,
      source_revision, source_score, level, correction_id IS NOT NULL AS corrected, recorded_at
    FROM trust.monthly_reward_snapshots
    WHERE subject_user_id = $1 AND effective_month = $2::date AND policy_version = $3
    ORDER BY mode, revision`, [input.subjectId, `${effectiveMonth}-01`, policyVersion])).rows;
  const sourceHistory = revisions.map(row => ({
    sourceRevision: row.revision,
    reasonCode: row.reason_code,
    recordedAt: row.recorded_at.toISOString(),
    sourceScore: row.source_score,
    level: row.level,
    ...metadata,
  }));
  const corrections = {
    sourceRevisions: sourceHistory.filter(row => row.sourceRevision > 1),
    effectiveSnapshots: snapshotHistory.filter(row => row.corrected).map(row => ({
      revision: row.revision,
      mode: row.mode,
      sourceRevision: row.source_revision,
      sourceScore: row.source_score,
      level: row.level,
      recordedAt: row.recorded_at.toISOString(),
      ...metadata,
    })),
  };
  const reportBase = { ...base, corrections };
  const latest = revisions[0];
  if (!latest) return { reportState: 'pending' as const, reasonCode: 'source_not_assembled', ...reportBase, report: null };
  if (latest.catalogue_hash !== catalogueHash) {
    throw new Error('monthly_report_source_integrity_failed');
  }
  const assembly = object(latest.report);
  if (!latest.report || latest.assembly_policy !== policyVersion || assembly.policyVersion !== policyVersion || assembly.sourceMonth !== input.sourceMonth) {
    return { reportState: 'pending' as const, reasonCode: 'assembly_pending', ...reportBase, report: null };
  }
  const assessment = object(latest.calculation);
  if (context && (assembly.preparationOnly !== true || assembly.runtimeActivationAllowed !== false || assembly.appliedPoints !== 0
    || assembly.catalogueHash !== catalogueHash || !latest.preparation_matches
    || assembly.weeklyRulesVersion !== configuration.weekly_rules_version || assembly.rulesVersion !== configuration.maintenance_rules_version
    || !/^[0-9a-f]{64}$/.test(latest.input_digest) || !/^[0-9a-f]{64}$/.test(latest.assembly_digest ?? '')))
    throw new Error('monthly_report_source_integrity_failed');
  if (latest.calculation && (assessment.policyVersion !== policyVersion
    || assessment.sourceMonth !== input.sourceMonth || assessment.effectiveMonth !== effectiveMonth)) {
    throw new Error('monthly_report_assessment_integrity_failed');
  }
  const assessedWeeks = array(assessment.weeks).map(value => object(value));
  const assembledWeeks = array(assembly.weeks).map(value => object(value));
  const assembledById = new Map(assembledWeeks.map(week => [text(week.weekId), week]));
  const weeks = assessedWeeks.length
    ? assessedWeeks.map(week => projectWeek(week, assembledById.get(text(week.weekId))))
    : assembledWeeks.map(week => projectWeek(undefined, week));
  const missingWeeks = array(assembly.missingWeeks).map(value => {
    const period = object(value);
    return {
      startsAt: text(period.startsAt),
      endsAt: text(period.endsAt),
      points: 0,
      revision: null,
      state: 'missing',
      selected: false,
      selectionReason: text(period.reasonCode) ?? 'no_recorded_activity',
      actions: [],
    };
  });
  const maintenance = projectMaintenance(assembly.maintenance);
  const selectedWeeks = weeks.filter(week => week.selected === true);
  const omittedWeeks = weeks.filter(week => week.selected === false);
  const quarterly = object(assembly.quarterly);
  const qualification = object(quarterly.qualification);
  if (context && (![0, PROSPECTIVE_REPUTATION_REPORT_LIMITS.emailMaximumPoints].includes(quarterly.emailPoints as number)
    || ![0, PROSPECTIVE_REPUTATION_REPORT_LIMITS.suggestionMaximumPoints].includes(quarterly.suggestionPoints as number)
    || quarterly.quarterlyPoints !== (quarterly.emailPoints as number) + (quarterly.suggestionPoints as number)
    || assembledWeeks.some(week => {
      const calculation = object(week.calculation), points = integer(calculation.points);
      return calculation.policyVersion !== MONTHLY_REPUTATION_POLICY_VERSION || points === null || points < 0
        || points > PROSPECTIVE_REPUTATION_REPORT_LIMITS.weeklyMaximumPerWeek;
    }))) throw new Error('monthly_report_source_integrity_failed');
  if (context && latest.calculation && (quarterly.emailPoints !== assessment.emailPoints
    || quarterly.suggestionPoints !== assessment.suggestionPoints || quarterly.quarterlyPoints !== assessment.quarterlyPoints))
    throw new Error('monthly_report_assessment_integrity_failed');
  const limits = PROSPECTIVE_REPUTATION_REPORT_LIMITS;
  const inheritedAction = (action: ReturnType<typeof projectAction>) => context
    ? { ...action, policyVersion: MONTHLY_REPUTATION_POLICY_VERSION, dataVersion: 1 as const } : action;
  const versionedWeeks = (values: typeof weeks) => context ? values.map(week => ({ ...week, ...metadata,
    earningPolicyVersion: MONTHLY_REPUTATION_POLICY_VERSION, rulesVersion: configuration.weekly_rules_version,
    actions: week.actions.map(inheritedAction) })) : values;
  return {
    reportState: latest.assessment_mode === 'shadow' ? 'shadow' as const : 'pending' as const,
    reasonCode: latest.assessment_mode ? null : 'assessment_pending',
    ...reportBase,
    report: {
      sourceRevision: latest.revision,
      sourceReasonCode: latest.reason_code,
      sourceRecordedAt: latest.recorded_at.toISOString(),
      assessmentMode: latest.assessment_mode,
      ...metadata,
      ...(context ? { sourceDigest: latest.input_digest, assemblyEvidenceDigest: latest.assembly_digest } : {}),
      weekly: {
        maximumPerWeek: MONTHLY_REPUTATION_LIMITS.weekly,
        selectedWeekLimit: MONTHLY_REPUTATION_LIMITS.selectedWeeks,
        maximumSelectedWeeklyPoints: MONTHLY_REPUTATION_LIMITS.weekly * MONTHLY_REPUTATION_LIMITS.selectedWeeks,
        points: integer(assessment.weeklyPoints),
        selectedWeeks: versionedWeeks(selectedWeeks),
        omittedWeeks: versionedWeeks(omittedWeeks),
        missingWeeks: versionedWeeks(missingWeeks),
        unassessedWeeks: assessment.weeks ? [] : versionedWeeks(weeks),
        ...metadata,
        ...(context ? { earningPolicyVersion: MONTHLY_REPUTATION_POLICY_VERSION, rulesVersion: configuration.weekly_rules_version } : {}),
      },
      monthly: {
        maximumPoints: MONTHLY_REPUTATION_LIMITS.monthly,
        points: integer(assessment.monthlyPoints) ?? maintenance.monthlyPoints,
        actions: maintenance.monthlyActions.map(inheritedAction),
        ...metadata,
        ...(context ? { maintenancePolicyVersion: MONTHLY_REPUTATION_POLICY_VERSION, rulesVersion: configuration.maintenance_rules_version } : {}),
      },
      quarterlyEmail: {
        maximumPoints: MONTHLY_REPUTATION_LIMITS.quarterly,
        points: context ? integer(assessment.emailPoints) ?? integer(quarterly.emailPoints) : integer(assessment.quarterlyPoints) ?? maintenance.quarterlyPoints,
        evidence: context ? projectQuarterlyComponent(qualification.email, 'quarterly.email_control',
          assessment.emailPoints ?? quarterly.emailPoints, limits.emailMaximumPoints) : maintenance.quarterlyEmail,
        ...metadata,
      },
      ...(context ? {
        quarterlySuggestion: { ...projectQuarterlyComponent(qualification.suggestion, 'quarterly.suggestion',
          assessment.suggestionPoints ?? quarterly.suggestionPoints, limits.suggestionMaximumPoints), ...metadata },
        quarterlyTotal: { points: integer(assessment.quarterlyPoints) ?? integer(quarterly.quarterlyPoints),
          maximumPoints: limits.quarterlyMaximumPoints, ...metadata },
      } : {}),
      total: assessment.sourceScore === undefined ? null : {
        weeklyPoints: integer(assessment.weeklyPoints),
        monthlyPoints: integer(assessment.monthlyPoints),
        quarterlyPoints: integer(assessment.quarterlyPoints),
        sourceScore: integer(assessment.sourceScore),
        maximumSourceMonth: context ? limits.maximumSourceMonth : MONTHLY_REPUTATION_LIMITS.sourceMonth,
        calculatedLevel: integer(assessment.level),
        ...(context ? { emailPoints: integer(assessment.emailPoints), suggestionPoints: integer(assessment.suggestionPoints), ...metadata } : {}),
      },
    },
  };
}
