import { MONTHLY_REPUTATION_POLICY_VERSION as v1 } from '../src/monthly-reputation-policy.ts';
import { MONTHLY_REWARDS_RESPONSE_PREPARATION as metadata } from '../src/monthly-rewards-response-preparation.ts';

const version = () => ({ policyVersion: metadata.policyVersion, catalogueHash: metadata.catalogueHash,
  dataVersion: 2, preparationOnly: true, runtimeActivationAllowed: false, appliedPoints: 0 });
export function preparedSnapshotFixture(overrides = {}) {
  return { ...version(), maximumSourceMonth: 13650, state: 'shadow', reasonCode: 'source_month_assessed',
    sourceMonth: '2026-12', effectiveMonth: '2027-01', sourceScore: 0, level: 1, revision: 1, sourceRevision: 1,
    snapshotId: '01900000-0000-7000-8000-000000000001', ...overrides };
}
export function preparedReportFixture() {
  const actions = [{ actionId: 'weekly.profile_access', capGroup: null, allowance: 2500, remainingInGroup: 0,
    points: 2500, accepted: 1, pending: 0, withheld: 0, state: 'accepted', reasonCode: null, evidenceCount: 1,
    validFrom: null, validUntil: null, policyVersion: v1, dataVersion: 1 }];
  const week = (selected) => ({ ...version(), startsAt: null, endsAt: null, points: 2500, revision: 1,
    state: 'assessed', selected, selectionReason: selected ? 'selected_best_four' : 'not_selected_best_four',
    earningPolicyVersion: v1, rulesVersion: 'synthetic-weekly', actions: structuredClone(actions) });
  const qualified = (maximumPoints, actionId) => ({ actionId, maximumPoints, points: maximumPoints, qualifies: true,
    reasonCode: 'qualification_candidate_activation_pending', validFrom: null, validUntil: null, renewalRequired: null });
  return { ...version(), reportState: 'shadow', reasonCode: null, sourceMonth: '2026-12', effectiveMonth: '2027-01',
    levelAuthority: { ...preparedSnapshotFixture(), snapshotRevision: 1 },
    corrections: { sourceRevisions: [{ ...version(), sourceRevision: 2, reasonCode: 'source_evidence_corrected',
      recordedAt: '2027-01-04T00:00:00.000Z', sourceScore: 13650, level: 5 }], effectiveSnapshots: [] },
    report: { ...version(), sourceRevision: 2, sourceReasonCode: 'source_evidence_corrected',
      sourceRecordedAt: '2027-01-04T00:00:00.000Z', assessmentMode: 'shadow', sourceDigest: 'a'.repeat(64),
      assemblyEvidenceDigest: 'b'.repeat(64),
      weekly: { ...version(), maximumPerWeek: 2500, selectedWeekLimit: 4, maximumSelectedWeeklyPoints: 10000,
        points: 10000, earningPolicyVersion: v1, rulesVersion: 'synthetic-weekly', selectedWeeks: Array.from({ length: 4 }, () => week(true)),
        omittedWeeks: [week(false)], missingWeeks: [], unassessedWeeks: [] },
      monthly: { ...version(), maximumPoints: 2500, points: 2500, maintenancePolicyVersion: v1,
        rulesVersion: 'synthetic-maintenance', actions: [] },
      quarterlyEmail: { ...version(), maximumPoints: 1000, points: 1000, evidence: qualified(1000, 'quarterly.email_control') },
      quarterlySuggestion: { ...version(), ...qualified(150, 'quarterly.suggestion') },
      quarterlyTotal: { ...version(), points: 1150, maximumPoints: 1150 },
      total: { ...version(), weeklyPoints: 10000, monthlyPoints: 2500, emailPoints: 1000, suggestionPoints: 150,
        quarterlyPoints: 1150, sourceScore: 13650, maximumSourceMonth: 13650, calculatedLevel: 5 } } };
}
export function pendingReportFixture(reasonCode = 'source_not_assembled') {
  return { ...version(), reportState: 'pending', reasonCode, sourceMonth: '2026-12', effectiveMonth: '2027-01',
    levelAuthority: preparedSnapshotFixture({ state: 'pending', reasonCode: 'settlement_pending', sourceMonth: null,
      sourceScore: null, level: null, revision: undefined, sourceRevision: undefined }),
    corrections: { sourceRevisions: [], effectiveSnapshots: [] }, report: null };
}
