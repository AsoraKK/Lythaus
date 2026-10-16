import { preparedReportFixture, preparedSnapshotFixture, pendingReportFixture } from '../../../packages/contracts/fixtures/monthly-rewards-response-preparation.mjs';
import { prepareMonthlyReputationReportResponse as report, prepareMonthlyRewardsResponse as rewards } from '../../../packages/contracts/src/monthly-rewards-response-preparation.ts';
import { monthlyRewardsResponseReadiness } from '../../../packages/contracts/src/monthly-rewards-response-readiness.ts';

const partial = preparedReportFixture();
partial.report.weekly.selectedWeeks[0].endsAt = null;
partial.report.weekly.selectedWeeks[1].startsAt = null;
partial.report.weekly.selectedWeeks[2].startsAt = null;
partial.report.weekly.selectedWeeks[2].endsAt = null;
const rejectedEvidence = {};
for (const [name, change] of Object.entries({
  zeroWeek: raw => { raw.report.weekly.selectedWeeks[0].endsAt = raw.report.weekly.selectedWeeks[0].startsAt; },
  shortWeek: raw => { raw.report.weekly.selectedWeeks[0].endsAt = '2026-11-01T00:00:00.000Z'; },
  duplicatePartials: raw => {
    const [first, second] = raw.report.weekly.selectedWeeks;
    second.startsAt = null; second.endsAt = first.endsAt; first.endsAt = null;
  },
  duplicateSelectedOmittedPartials: raw => {
    const first = raw.report.weekly.selectedWeeks[0], second = raw.report.weekly.omittedWeeks[0];
    second.startsAt = null; second.endsAt = first.endsAt; first.endsAt = null;
  },
  reversedQualification: raw => {
    raw.report.quarterlySuggestion.validFrom = '2027-01-01T00:00:00.000Z';
    raw.report.quarterlySuggestion.validUntil = '2026-11-01T00:00:00.000Z';
  },
})) {
  const raw = preparedReportFixture(); change(raw);
  try { report(raw); rejectedEvidence[name] = false; }
  catch (error) {
    if (error.message !== 'monthly_rewards_response_preparation_invalid') throw error;
    rejectedEvidence[name] = true;
  }
}
process.stdout.write(JSON.stringify({ readiness: monthlyRewardsResponseReadiness(),
  unknownReadiness: monthlyRewardsResponseReadiness('unknown-version'),
  report: report(preparedReportFixture()), partialReport: report(partial),
  yearBoundaryReport: report(preparedReportFixture('2026-12')), pendingReport: report(pendingReportFixture()),
  rewards: rewards(preparedSnapshotFixture({ sourceScore: 13650, level: 5 })), rejectedEvidence,
}));
