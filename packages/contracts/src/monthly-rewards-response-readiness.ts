import { MONTHLY_REWARDS_RESPONSE_PREPARATION } from './monthly-rewards-response-preparation.ts';

export function monthlyRewardsResponseReadiness(responseVersion: unknown = MONTHLY_REWARDS_RESPONSE_PREPARATION.responseVersion) {
  const known = responseVersion === MONTHLY_REWARDS_RESPONSE_PREPARATION.responseVersion;
  return {
    state: known ? 'disabled' as const : 'unavailable' as const,
    reasonCode: known ? 'activation_not_approved' as const : 'response_version_unsupported' as const,
    responseVersion: known ? MONTHLY_REWARDS_RESPONSE_PREPARATION.responseVersion : null,
    policyVersion: known ? MONTHLY_REWARDS_RESPONSE_PREPARATION.policyVersion : null,
    catalogueHash: known ? MONTHLY_REWARDS_RESPONSE_PREPARATION.catalogueHash : null,
    dataVersion: known ? MONTHLY_REWARDS_RESPONSE_PREPARATION.dataVersion : null,
    maximumSourceMonth: known ? MONTHLY_REWARDS_RESPONSE_PREPARATION.maximumSourceMonth : null,
    preparationOnly: true as const,
    runtimeActivationAllowed: false as const,
    appliedPoints: 0 as const,
  };
}
