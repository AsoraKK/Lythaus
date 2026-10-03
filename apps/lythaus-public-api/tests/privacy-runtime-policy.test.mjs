import assert from 'node:assert/strict';
import test from 'node:test';

import {
  optionalPrivacyRequestType,
  privacyExportAccessActivity,
  privacyExportRetryAfter,
  privacyRequestPlan,
  requirePrivacyExportDependencies,
  requirePrivacyExportObject,
  retentionRulePlan,
} from '../src/privacy-runtime-policy.ts';
import { PLATFORM_SAFETY_LIMITS } from '../../../packages/contracts/src/tier-policy.ts';

test('export cooldown uses the creation timestamp and canonical policy independently of processing state', () => {
  const now = Date.parse('2026-10-02T12:00:00Z');
  const days = PLATFORM_SAFETY_LIMITS.exportCooldownDays;
  assert.equal(privacyExportRetryAfter(null, now, days), 0);
  assert.equal(privacyExportRetryAfter('2026-10-01T12:00:00Z', now, days), 29 * 86400);
  assert.equal(privacyExportRetryAfter('2026-09-02T12:00:00Z', now, days), 0);
  assert.equal(privacyExportRetryAfter('2026-09-01T12:00:00Z', now, days), 0);
  assert.equal(privacyExportRetryAfter('2026-09-02T12:00:00.001Z', now, days), 1);
  assert.equal(privacyExportRetryAfter(new Date('2026-09-02T12:00:00.001Z'), now, days), 1);
  assert.throws(() => privacyExportRetryAfter('invalid', now, days), /privacy_timestamp_invalid/);
});

test('privacy request plans select the real request, cooldown, and audit activity', () => {
  assert.deepEqual(privacyRequestPlan('export'), {
    requestType: 'export', requiresExportCooldown: true,
    activityEvent: 'privacy.export_requested', activityTitle: 'You requested a data export',
  });
  assert.deepEqual(privacyRequestPlan('delete'), {
    requestType: 'delete', requiresExportCooldown: false,
    activityEvent: 'privacy.deletion_requested', activityTitle: 'You requested account deletion',
  });
  assert.deepEqual(privacyRequestPlan('rectify'), {
    requestType: 'rectify', requiresExportCooldown: false,
    activityEvent: 'privacy.rectification_requested', activityTitle: 'You requested data rectification',
  });
  assert.equal(optionalPrivacyRequestType(null), undefined);
  assert.equal(optionalPrivacyRequestType(undefined), undefined);
  assert.equal(optionalPrivacyRequestType('delete'), 'delete');
  assert.throws(() => privacyRequestPlan('erase'), /invalid_privacy_request/);
  assert.throws(() => optionalPrivacyRequestType('erase'), /invalid_privacy_request/);
});

test('retention rules preserve aliases and reject invalid type or duration', () => {
  assert.deepEqual(retentionRulePlan({ contentType: 'posts', retentionDays: 30 }), { contentType: 'post', retentionDays: 30 });
  assert.deepEqual(retentionRulePlan({ contentType: 'media', retentionDays: 3650 }), { contentType: 'media', retentionDays: 3650 });
  assert.throws(() => retentionRulePlan({ contentType: 'comment', retentionDays: 30 }), /invalid_retention_content_type/);
  assert.throws(() => retentionRulePlan({ contentType: 'post', retentionDays: 29 }), /invalid_retention_period/);
  assert.throws(() => retentionRulePlan({ contentType: 'post', retentionDays: 3651 }), /invalid_retention_period/);
  assert.throws(() => retentionRulePlan({ contentType: 'post', retentionDays: 30.5 }), /invalid_retention_period/);
});

test('export access fails before storage reads unless every required artifact exists', () => {
  assert.throws(() => requirePrivacyExportDependencies({ manifest: undefined, storage: {} }), /export_not_found/);
  assert.throws(() => requirePrivacyExportDependencies({ manifest: { key: 'manifest' }, storage: undefined }), /export_not_configured/);
  assert.deepEqual(requirePrivacyExportDependencies({ manifest: { key: 'manifest' }, storage: { get: true } }), {
    manifest: { key: 'manifest' }, storage: { get: true },
  });
  assert.throws(() => requirePrivacyExportObject(undefined), /export_unavailable/);
  assert.throws(() => requirePrivacyExportObject(null), /export_unavailable/);
  assert.equal(requirePrivacyExportObject('object'), 'object');
});

test('export audit inclusion records the completed export request only', () => {
  assert.deepEqual(privacyExportAccessActivity('request-1'), {
    eventType: 'privacy.export_accessed', title: 'You accessed your data export',
    objectType: 'privacy_request', objectId: 'request-1', requestType: 'export', requestState: 'completed',
  });
});
