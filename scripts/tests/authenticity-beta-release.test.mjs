import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateBetaSmoke, validateBetaRelease, hashReceipt } from '../authenticity/beta-release-policy.mjs';

const now = Date.parse('2026-09-27T12:00:00Z');
function fixture(overrides = {}) {
  const receipt = { schemaVersion: 'lythaus-beta-release-approval-v1', sourceSha: 'a'.repeat(40), phase: 'DISABLED_DEPLOYMENT', decisionOwner: 'explicit protocol fixture', expiresAt: new Date(now + 3600000).toISOString(), checkpointSha256: 'b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e', preprocessingHash: 'b'.repeat(64), rightsEvidenceSha256: 'c'.repeat(64), runtimeEvidenceSha256: 'd'.repeat(64), budgetEvidenceSha256: 'e'.repeat(64), resourceApprovalSha256: 'f'.repeat(64), restrictedBetaHostingAuthorized: true, publicEnforcementApproved: false, authorAdminOnly: true, image: `registry.cloudflare.com/${'1'.repeat(32)}/lythaus-safe-beta@sha256:${'2'.repeat(64)}`, peakMemoryBytes: 1.5 * 2 ** 30, imageBytes: 2e9, measuredMaxPixels: 16777216, realParityPassed: true, realParityCases: 8, realSafeAttempts: 8, instanceType: 'standard-1', sharedExperimentCommittedUsd: 0, betaCommittedUsd: 0, allowanceEvidenceSha256: '3'.repeat(64), allowanceObservedAt: new Date(now).toISOString(), verifiedRemainingUnits: Object.fromEntries(['r2ClassA','r2ClassB','r2GbMonth','doRequests','doGbSeconds','doRowsRead','doRowsWritten','doGbMonth','workerRequests','workerCpuMs','queueOperations','logEvents','kvReads','kvWrites','kvGbMonth'].map(key => [key, 1e7])), safetyUpperBoundUsd: 0, imageRegistryUpperBoundUsd: 0, databaseUpperBoundUsd: 0, ...overrides };
  const rawReceipt = JSON.stringify(receipt);
  return [receipt, { sourceSha: 'a'.repeat(40), approvedReceiptHash: hashReceipt(rawReceipt), rawReceipt, preprocessingHash: 'b'.repeat(64), now }];
}
test('unknown allowances include rounded R2 and DO charges rather than assuming unused free tiers', () => {
  const estimate = estimateBetaSmoke('standard-1');
  assert.equal(estimate.services.r2ClassA, 4.5);
  assert.equal(estimate.services.doGbSeconds, 12.5);
  assert.ok(estimate.reservationUsd > 10);
  assert.equal(estimate.safetyUsd, null);
});
test('disabled runtime materialization requires exact owner-approved source, rights, size and current cost evidence', () => {
  assert.equal(validateBetaRelease(...fixture()).enabled, false);
  for (const change of [{phase:'ACTIVATE'},{realParityPassed:false},{restrictedBetaHostingAuthorized:false},{instanceType:'lite'},{publicEnforcementApproved:true},{verifiedRemainingUnits:{}},{allowanceObservedAt:'2026-09-26T00:00:00Z'},{preprocessingHash:'0'.repeat(64)},{sourceSha:'9'.repeat(40)}]) assert.throws(() => validateBetaRelease(...fixture(change)));
  const [receipt, context] = fixture(); context.approvedReceiptHash = '0'.repeat(64); assert.throws(() => validateBetaRelease(receipt, context));
});
