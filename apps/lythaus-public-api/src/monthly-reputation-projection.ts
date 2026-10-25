import type { MonthlyRewardSnapshotRead } from '../../../packages/db/src/monthly-reward-snapshots.ts';
import type { readOwnMonthlyRewardSelections } from '../../../packages/db/src/monthly-reward-selections.ts';
import type { projectRewardsV05Candidate } from '../../../packages/contracts/src/monthly-rewards-v05.ts';

type MonthlyRewardSelectionRead = Awaited<ReturnType<typeof readOwnMonthlyRewardSelections>>;

export function projectMonthlyRewards(snapshot: MonthlyRewardSnapshotRead, selection: MonthlyRewardSelectionRead,
  prospective?: ReturnType<typeof projectRewardsV05Candidate>
    | { state: 'unavailable'; reasonCode: 'prospective_assessment_unavailable' } | null) {
  const confirmed = snapshot.state === 'confirmed' && snapshot.preparationOnly !== true;
  const ready = confirmed && selection.state === 'ready';
  return {
    state: ready ? 'ready' : 'pending',
    reasonCode: ready ? null : confirmed ? selection.reasonCode : snapshot.reasonCode,
    effectiveMonth: snapshot.effectiveMonth,
    currentLevel: confirmed ? snapshot.level : null,
    sourceMonth: confirmed ? snapshot.sourceMonth : null,
    sourceScore: confirmed ? snapshot.sourceScore : null,
    snapshot,
    selection,
    ...(prospective ? { prospective } : {}),
  };
}
