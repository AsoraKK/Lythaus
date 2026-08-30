/**
 * Canonical identity states and ownership for the public email-auth flow.
 * Keep this table as the reviewable source of truth for A-J in the governing brief.
 */
export type CanonicalAuthState =
  | 'no_existing_account'
  | 'existing_unverified_account'
  | 'verified_active_account'
  | 'relink_required_account'
  | 'locked_account'
  | 'suspended_account'
  | 'deleted_account'
  | 'password_mismatch'
  | 'expired_verification_request'
  | 'superseded_verification_request';

export type AuthTransitionOwner = 'public_api' | 'jobs_relay' | 'privacy_workflow' | 'database_transaction';

export interface CanonicalAuthTransition {
  readonly state: CanonicalAuthState;
  readonly owner: AuthTransitionOwner;
  readonly publicResult: string;
  readonly mutatesIdentity: boolean;
}

export const CANONICAL_AUTH_STATE_TRANSITIONS: readonly CanonicalAuthTransition[] = Object.freeze([
  { state: 'no_existing_account', owner: 'database_transaction', publicResult: 'check_email', mutatesIdentity: true },
  { state: 'existing_unverified_account', owner: 'public_api', publicResult: 'verification_required', mutatesIdentity: true },
  { state: 'verified_active_account', owner: 'public_api', publicResult: 'authenticated_or_neutral', mutatesIdentity: false },
  { state: 'relink_required_account', owner: 'database_transaction', publicResult: 'verification_required', mutatesIdentity: true },
  { state: 'locked_account', owner: 'public_api', publicResult: 'invalid_credentials', mutatesIdentity: false },
  { state: 'suspended_account', owner: 'public_api', publicResult: 'invalid_credentials', mutatesIdentity: false },
  { state: 'deleted_account', owner: 'privacy_workflow', publicResult: 'invalid_credentials', mutatesIdentity: false },
  { state: 'password_mismatch', owner: 'public_api', publicResult: 'invalid_credentials', mutatesIdentity: false },
  { state: 'expired_verification_request', owner: 'database_transaction', publicResult: 'verification_token_invalid', mutatesIdentity: false },
  { state: 'superseded_verification_request', owner: 'database_transaction', publicResult: 'verification_token_invalid', mutatesIdentity: false },
]);

export type EmailRegistrationState =
  | 'create_account'
  | 'resend_verification'
  | 'attach_email_credential'
  | 'neutral_existing_account';

export function planCanonicalRegistration(input: {
  account?: { status: string; verifiedAt: string | null };
  contactAccount?: { status: string };
}): EmailRegistrationState {
  if (!input.account && !input.contactAccount) return 'create_account';
  if (!input.account && (input.contactAccount?.status === 'active' || input.contactAccount?.status === 'relink_required')) {
    return 'attach_email_credential';
  }
  if (input.account && !input.account.verifiedAt && (input.account.status === 'active' || input.account.status === 'relink_required')) {
    return 'resend_verification';
  }
  return 'neutral_existing_account';
}
