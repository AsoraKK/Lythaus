import { describe, expect, it } from 'vitest';
import { activityPilotEvidence } from './activity-pilot.js';

import { pilotSnapshot } from './activity-pilot.fixtures.js';
describe('activity pilot evidence', () => {
  it('shows measured zero only for a complete, nonempty continuously consenting cohort', () => {
    const source = pilotSnapshot(); source.metrics.dau.value = 0;
    expect(activityPilotEvidence(source, Date.parse(source.sampledAt)).metrics.dau.text).toBe('0');
    source.metrics.dau = { ...source.metrics.dau, state: 'unavailable', value: null, cohortSize: 0, reason: 'no_observable_cohort' };
    expect(activityPilotEvidence(source, Date.parse(source.sampledAt)).metrics.dau.text).toBe('Unavailable');
  });
  it('positive partial counts are labelled lower bounds; quiet never has a lower bound', () => {
    const source = pilotSnapshot(); source.metrics.dau = { ...source.metrics.dau, state: 'partial', value: null, observedLowerBound: 2, reason: 'incomplete_measurement_coverage' };
    expect(activityPilotEvidence(source, Date.parse(source.sampledAt)).metrics.dau.text).toBe('At least 2');
    source.metrics.quiet = { ...source.metrics.quiet, state: 'partial', value: null, observedLowerBound: 1, reason: 'incomplete_measurement_coverage' };
    expect(() => activityPilotEvidence(source)).toThrow();
  });
  it('stale, future and crossed UTC boundary samples do not show counts', () => {
    const source = pilotSnapshot('2026-10-07T23:59:59.000Z');
    for (const time of ['2026-10-07T23:59:58.000Z', '2026-10-08T00:00:00.000Z', '2026-10-08T00:01:00.000Z']) expect(activityPilotEvidence(source, Date.parse(time)).metrics.mau.text).toBe('Unavailable');
  });
  it('invalid population bounds, window mismatch and disabled positive counts fail closed', () => {
    for (const mutate of [s => s.metrics.dau.value = 5001, s => s.metrics.dau.until = s.sampledAt, s => s.enabled = false]) {
      const source = pilotSnapshot(); mutate(source); expect(() => activityPilotEvidence(source)).toThrow();
    }
  });
});
