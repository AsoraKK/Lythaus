import { stableArtifactHash } from './wp007a.ts';

export const WP007AHR4_EXECUTION_MODE = 'hr4_flux1_execute' as const;
export const WP007AHR4_EXECUTION_CONFIRMATION = 'EXECUTE_HR4_FLUX1_AMENDED' as const;
export const WP007AHR4_FLUX1_MODEL_ID = '@cf/black-forest-labs/flux-1-schnell' as const;
export const WP007AHR4_FLUX1_CONTRACT_AMENDMENT_SHA256 = '2294cfeb9220be2becf08e70abb848267dcb5db2f213411e54c8883bc753431a' as const;
export const WP007AHR4_HISTORICAL_FREEZE_SHA256 = '87982112412059bd1615bd2d36ee9cf8ad72828b4042cb93839d725b6b533514' as const;
export const WP007AHR4_FLUX1_SUBMITTED_SEED_STATE = 'NOT_SENT_ROUTE_UNSUPPORTED' as const;
export const WP007AHR4_MINIMUM_VALID_FLUX1_RECORDS = 36 as const;

export function isWp007ahr4Flux1Mode(amendmentSha256: unknown): boolean {
  return amendmentSha256 === WP007AHR4_FLUX1_CONTRACT_AMENDMENT_SHA256;
}

export function assertWp007ahr4Flux1Selector({ amendmentSha256, modelId }: { amendmentSha256: unknown; modelId: unknown }): void {
  if (amendmentSha256 !== WP007AHR4_FLUX1_CONTRACT_AMENDMENT_SHA256) throw new Error('wp007ahr4_flux1_contract_amendment_hash_invalid');
  if (modelId !== WP007AHR4_FLUX1_MODEL_ID) throw new Error('wp007ahr4_flux1_model_invalid');
}

export function assertWp007ahr4ContractAmendmentArtifact(value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('wp007ahr4_contract_amendment_invalid');
  const artifact = value as Record<string, any>;
  const { amendmentSha256, ...withoutHash } = artifact;
  if (amendmentSha256 !== WP007AHR4_FLUX1_CONTRACT_AMENDMENT_SHA256 || stableArtifactHash(withoutHash) !== amendmentSha256) throw new Error('wp007ahr4_contract_amendment_hash_mismatch');
  if (artifact.parentHistoricalFreezeSha256 !== WP007AHR4_HISTORICAL_FREEZE_SHA256) throw new Error('wp007ahr4_contract_amendment_parent_freeze_mismatch');
  if (artifact.rootCause !== 'REST_ROUTE_SEED_UNSUPPORTED') throw new Error('wp007ahr4_contract_amendment_root_cause_mismatch');
  if (artifact.exactAmendedRequestContract?.seedField !== 'OMITTED') throw new Error('wp007ahr4_contract_amendment_request_contract_mismatch');
  if (artifact.noDetectorEvidenceUsed !== true || artifact.noSuccessfulFlux1MaterialPreviouslyAvailable !== true) throw new Error('wp007ahr4_contract_amendment_evidence_policy_mismatch');
}

export function wp007ahr4MaterializationStatus({ smokeOnly, valid, requested }: { smokeOnly: boolean; valid: number; requested: number }): string {
  if (smokeOnly) return 'HR4_FLUX1_SMOKE_COMPLETE';
  return valid >= WP007AHR4_MINIMUM_VALID_FLUX1_RECORDS && requested === 40 ? 'HR4_FLUX1_MATERIALIZED' : 'HR4_FLUX1_PARTIAL';
}
