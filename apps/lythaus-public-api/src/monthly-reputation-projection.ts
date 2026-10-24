import type { MonthlyRewardSnapshotRead } from '../../../packages/db/src/monthly-reward-snapshots.ts';
import type { readOwnMonthlyRewardSelections } from '../../../packages/db/src/monthly-reward-selections.ts';

type MonthlyRewardSelectionRead = Awaited<ReturnType<typeof readOwnMonthlyRewardSelections>>;

export function projectMonthlyRewards(snapshot: MonthlyRewardSnapshotRead, selection: MonthlyRewardSelectionRead) {
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
  };
}
