import { parseSupportServicePolicy, type SupportServicePolicy } from './support-feedback-policy.ts';

export function applyApprovedSupportCompletionLimits(candidate: unknown): SupportServicePolicy {
  const policy = parseSupportServicePolicy(candidate);
  return parseSupportServicePolicy({ ...policy,
    contract: { ...policy.contract, limits: { ...policy.contract.limits,
      titleCharacters: 160, detailCharacters: 2000, stepsCharacters: 2000, memberMessageCharacters: 2000 } },
    limits: { ...policy.limits, submissionsPerHour: 5, submissionsPerDay: 20 },
    privacy: { ...policy.privacy, retentionSeconds: 30 * 86400 },
  });
}
