import { normalizeProfileName } from '@lythaus/contracts';

export interface ProfileUpdate {
  displayName?: string;
  bio?: string;
  trustPassportVisibility?: string;
  accountabilityName?: string | null;
}

export function parseProfileUpdate(input: unknown): ProfileUpdate {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid_profile_update');
  const fields = input as Record<string, unknown>;
  const allowed = ['displayName', 'bio', 'trustPassportVisibility', 'accountabilityName'];
  if (Object.keys(fields).length === 0 || Object.keys(fields).some(key => !allowed.includes(key))) {
    throw new Error('invalid_profile_update');
  }
  const result: ProfileUpdate = {};
  if ('displayName' in fields) result.displayName = normalizeProfileName(fields.displayName);
  if ('bio' in fields) {
    if (typeof fields.bio !== 'string') throw new Error('invalid_bio');
    result.bio = fields.bio.normalize('NFC').trim();
    if (result.bio.length > 2000) throw new Error('invalid_bio');
  }
  if ('trustPassportVisibility' in fields) {
    if (typeof fields.trustPassportVisibility !== 'string'
      || !['public_expanded', 'public_minimal', 'private'].includes(fields.trustPassportVisibility)) {
      throw new Error('invalid_profile_visibility');
    }
    result.trustPassportVisibility = fields.trustPassportVisibility;
  }
  if ('accountabilityName' in fields) {
    result.accountabilityName = fields.accountabilityName === null || fields.accountabilityName === ''
      ? null : normalizeProfileName(fields.accountabilityName, 'accountability_name');
  }
  return result;
}
