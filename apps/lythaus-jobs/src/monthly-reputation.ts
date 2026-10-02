import { transaction, type HyperdriveBinding } from '@lythaus/db';
import { assessMonthlyReputationSource } from '../../../packages/db/src/monthly-reputation.ts';
import { uuidv7 } from '@lythaus/security';

export async function processMonthlyReputationAssessment(
  env: { DB_JOBS_FRESH: HyperdriveBinding },
  eventId: string,
) {
  return transaction(env.DB_JOBS_FRESH, (client) => assessMonthlyReputationSource(client, {
    eventId,
    assessmentId: uuidv7(),
    resultEventId: uuidv7(),
    evaluatedAt: new Date().toISOString(),
  }));
}
