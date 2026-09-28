export interface ResolutionSignals {
  directionalEvidenceCount: number;
  supportedHypothesesCount: number;
  contradictedHypothesesCount: number;
  contradictoryEvidenceCount: number;
  contradictoryObservationsCount: number;
}

export function selectResolutionRoute(signals: ResolutionSignals, policy: 'CONSERVATIVE_GATE' | 'SELECTIVE_RESOLUTION_GATE'): 'ABSTAIN' | 'BOUNDED' | 'ESCALATE' {
  if (!signals.directionalEvidenceCount) return 'ABSTAIN';
  if (policy === 'SELECTIVE_RESOLUTION_GATE' && signals.supportedHypothesesCount === 1 && signals.contradictedHypothesesCount === 0 && signals.contradictoryEvidenceCount === 0 && signals.contradictoryObservationsCount === 0) return 'BOUNDED';
  return 'ESCALATE';
}
