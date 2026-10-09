import { normalizeProfileName } from '@lythaus/contracts';

export interface ProfileUpdate {
  displayName?: string;
  bio?: string;
  trustPassportVisibility?: string;
  accountabilityName?: string | null;
  presentationPreferences?: PresentationPreferencesUpdate;
}

export interface PresentationPreferences {
  leftHandedMode: boolean;
  horizontalSwipeEnabled: boolean;
  version: number;
}

export interface PresentationPreferencesUpdate {
  leftHandedMode: boolean;
  horizontalSwipeEnabled: boolean;
  expectedVersion: number;
}

export function readPresentationPreferences(input: unknown): PresentationPreferences | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as Record<string, unknown>;
  if (typeof value.leftHandedMode !== 'boolean' || typeof value.horizontalSwipeEnabled !== 'boolean'
    || !Number.isSafeInteger(value.version) || Number(value.version) < 1) return null;
  return { leftHandedMode: value.leftHandedMode, horizontalSwipeEnabled: value.horizontalSwipeEnabled, version: Number(value.version) };
}

export function parseProfileUpdate(input: unknown): ProfileUpdate {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid_profile_update');
  const fields = input as Record<string, unknown>;
  const allowed = ['displayName', 'bio', 'trustPassportVisibility', 'accountabilityName', 'presentationPreferences'];
  if (Object.keys(fields).length === 0 || Object.keys(fields).some(key => !allowed.includes(key))) {
    throw new Error('invalid_profile_update');
  }
  const result: ProfileUpdate = {};
  if ('presentationPreferences' in fields) {
    const value = fields.presentationPreferences;
    if (Object.keys(fields).length !== 1 || !value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('invalid_profile_update');
    }
    const preferences = value as Record<string, unknown>;
    if (Object.keys(preferences).length !== 3
      || Object.keys(preferences).some(key => !['leftHandedMode', 'horizontalSwipeEnabled', 'expectedVersion'].includes(key))
      || typeof preferences.leftHandedMode !== 'boolean' || typeof preferences.horizontalSwipeEnabled !== 'boolean'
      || !Number.isSafeInteger(preferences.expectedVersion) || Number(preferences.expectedVersion) < 1
      || Number(preferences.expectedVersion) >= 2147483647) throw new Error('invalid_profile_update');
    result.presentationPreferences = {
      leftHandedMode: preferences.leftHandedMode,
      horizontalSwipeEnabled: preferences.horizontalSwipeEnabled,
      expectedVersion: Number(preferences.expectedVersion),
    };
  }
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
