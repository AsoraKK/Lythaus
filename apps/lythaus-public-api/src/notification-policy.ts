export const NOTIFICATION_PREFERENCE_KEYS = [
  'emailEnabled',
  'pushEnabled',
  'repliesEnabled',
  'moderationEnabled',
  'rewardsEnabled',
] as const;

export type NotificationPreferenceKey = (typeof NOTIFICATION_PREFERENCE_KEYS)[number];
export type NotificationDevicePlatform = 'android' | 'ios' | 'web';

export interface NotificationPreferenceUpdate {
  emailEnabled: boolean | null;
  pushEnabled: boolean | null;
  repliesEnabled: boolean | null;
  moderationEnabled: boolean | null;
  rewardsEnabled: boolean | null;
  changedKeys: readonly NotificationPreferenceKey[];
}

export function normalizeNotificationPreferences(input: unknown): NotificationPreferenceUpdate {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('notification_preference_required');
  const candidate = input as Record<string, unknown>;
  const changedKeys = NOTIFICATION_PREFERENCE_KEYS.filter((key) => typeof candidate[key] === 'boolean');
  if (changedKeys.length === 0) throw new Error('notification_preference_required');
  return Object.freeze({
    emailEnabled: typeof candidate.emailEnabled === 'boolean' ? candidate.emailEnabled : null,
    pushEnabled: typeof candidate.pushEnabled === 'boolean' ? candidate.pushEnabled : null,
    repliesEnabled: typeof candidate.repliesEnabled === 'boolean' ? candidate.repliesEnabled : null,
    moderationEnabled: typeof candidate.moderationEnabled === 'boolean' ? candidate.moderationEnabled : null,
    rewardsEnabled: typeof candidate.rewardsEnabled === 'boolean' ? candidate.rewardsEnabled : null,
    changedKeys: Object.freeze(changedKeys),
  });
}

export function normalizeNotificationDevice(input: unknown): { token: string; platform: NotificationDevicePlatform } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid_notification_device');
  const candidate = input as Record<string, unknown>;
  if (typeof candidate.token !== 'string' || !candidate.token) throw new Error('invalid_notification_device');
  if (candidate.platform !== 'android' && candidate.platform !== 'ios' && candidate.platform !== 'web') {
    throw new Error('invalid_notification_device');
  }
  return Object.freeze({ token: candidate.token, platform: candidate.platform });
}
