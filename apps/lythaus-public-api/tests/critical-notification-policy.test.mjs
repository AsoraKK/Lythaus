import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeNotificationDevice,
  normalizeNotificationPreferences,
} from '../src/notification-policy.ts';

test('notification preferences only persist explicit boolean changes', () => {
  assert.deepEqual(normalizeNotificationPreferences({ emailEnabled: false, moderationEnabled: true }), {
    emailEnabled: false,
    pushEnabled: null,
    repliesEnabled: null,
    moderationEnabled: true,
    rewardsEnabled: null,
    changedKeys: ['emailEnabled', 'moderationEnabled'],
  });
  assert.deepEqual(normalizeNotificationPreferences({ pushEnabled: true, ignored: 'accepted for compatibility' }).changedKeys, ['pushEnabled']);
  assert.throws(() => normalizeNotificationPreferences(null), /notification_preference_required/);
  assert.throws(() => normalizeNotificationPreferences([]), /notification_preference_required/);
  assert.throws(() => normalizeNotificationPreferences({ emailEnabled: 'false' }), /notification_preference_required/);
  assert.throws(() => normalizeNotificationPreferences({}), /notification_preference_required/);
});

test('notification device policy accepts supported platforms and rejects malformed tokens', () => {
  for (const platform of ['android', 'ios', 'web']) {
    assert.deepEqual(normalizeNotificationDevice({ token: `${platform}-device-token`, platform }), {
      token: `${platform}-device-token`,
      platform,
    });
  }
  assert.throws(() => normalizeNotificationDevice(null), /invalid_notification_device/);
  assert.throws(() => normalizeNotificationDevice([]), /invalid_notification_device/);
  assert.throws(() => normalizeNotificationDevice({ token: '', platform: 'web' }), /invalid_notification_device/);
  assert.throws(() => normalizeNotificationDevice({ token: 1, platform: 'web' }), /invalid_notification_device/);
  assert.throws(() => normalizeNotificationDevice({ token: 'device', platform: 'desktop' }), /invalid_notification_device/);
});
