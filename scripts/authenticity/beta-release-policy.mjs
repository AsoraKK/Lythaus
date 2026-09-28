import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const PRICING_DATE = '2026-09-27';
export const INSTANCE_TYPES = Object.freeze({
  lite: { gib: 0.25, cpu: 1 / 16, diskGb: 2 },
  basic: { gib: 1, cpu: 0.25, diskGb: 4 },
  'standard-1': { gib: 4, cpu: 0.5, diskGb: 8 },
  'standard-2': { gib: 6, cpu: 1, diskGb: 12 },
  'standard-3': { gib: 8, cpu: 2, diskGb: 16 },
  'standard-4': { gib: 12, cpu: 4, diskGb: 20 },
});
const sha = value => /^[a-f0-9]{64}$/.test(value ?? '');
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export const hashReceipt = text => createHash('sha256').update(text).digest('hex');

export function memoryFits(peakMemoryBytes, capacityBytes) {
  assert.ok(Number.isSafeInteger(peakMemoryBytes) && peakMemoryBytes > 0 && Number.isSafeInteger(capacityBytes) && capacityBytes > 0, 'whole_container_integer_byte_measurement_required');
  return BigInt(peakMemoryBytes) * 4n < BigInt(capacityBytes) * 3n;
}

export function incrementalCharge(usage, unit, price, account, rounded = true) {
  assert.ok([usage, unit, price].every(finite) && unit > 0, 'invalid_meter');
  const bill = quantity => (rounded ? Math.ceil(quantity / unit) : quantity / unit) * price;
  if (!account) return bill(usage);
  assert.ok(finite(account.used) && finite(account.included), 'invalid_account_meter');
  return Math.max(0, bill(Math.max(0, account.used + usage - account.included)) - bill(Math.max(0, account.used - account.included)));
}

export function feasibleCaseCapacity(reservationUsd, betaCommittedUsd, sharedCommittedUsd) {
  assert.ok(finite(reservationUsd) && reservationUsd > 0 && finite(betaCommittedUsd) && finite(sharedCommittedUsd), 'measured_reservation_required');
  return Math.max(0, Math.floor(Math.min(1.6 - betaCommittedUsd, 8 - sharedCommittedUsd) / reservationUsd + 1e-9));
}

export function estimateBetaSmoke(instanceType, remaining = {}, account = {}, envelope = null) {
  const instance = INSTANCE_TYPES[instanceType];
  assert.ok(instance, 'measured_instance_required');
  const smokeUnits = {
    r2ClassA: [64, 1e6, 4.5], r2ClassB: [256, 1e6, 0.36], r2GbMonth: [1, 1, 0.015],
    doRequests: [128, 1e6, 0.15], doGbSeconds: [1800 * 0.128, 1e6, 12.5],
    doRowsRead: [10000, 1e6, 0.001], doRowsWritten: [1000, 1e6, 1], doGbMonth: [0.01, 1, 0.2],
    workerRequests: [5000, 1e6, 0.3], workerCpuMs: [60000, 1e6, 0.02],
    queueOperations: [128, 1e6, 0.4], logEvents: [5000, 1e6, 0.6],
    kvReads: [10000, 1e6, 0.5], kvWrites: [1, 1e6, 5], kvGbMonth: [0.001, 1, 0.5],
  };
  const units = Object.fromEntries(Object.entries(smokeUnits).map(([name, [usage, unit, price]]) => {
    const boundedUsage = envelope ? envelope.units?.[name] : usage;
    assert.ok(finite(boundedUsage), `bounded_${name}_required`);
    return [name, [name === 'doGbSeconds' ? Math.max(boundedUsage, 1800 * 0.128) : boundedUsage, unit, price]];
  }));
  const services = {};
  for (const [name, [usage, unit, price]] of Object.entries(units)) {
    assert.ok(remaining[name] === undefined || finite(remaining[name]), 'invalid_verified_allowance');
    const rounded = !['workerRequests','workerCpuMs','queueOperations','kvReads','kvWrites','kvGbMonth','logEvents'].includes(name);
    services[name] = account[name] ? incrementalCharge(usage, unit, price, account[name], rounded) : incrementalCharge(Math.max(0, usage - (remaining[name] ?? 0)), unit, price, null, rounded);
  }
  const activeSeconds = envelope?.activeSeconds ?? 1800;
  assert.ok(finite(activeSeconds) && activeSeconds === 1800, 'full_runtime_lifetime_bound_required');
  services.container = Math.ceil(activeSeconds * 100) / 100 * (instance.gib * 0.0000025 + instance.cpu * 0.000020 + instance.diskGb * 0.00000007);
  services.containerEgress = (envelope ? 1 : 16) * 8 * 1024 * 1024 / 1e9 * 0.05;
  services.adviser = ((envelope ? 1 : 2) * (16000 * 0.20 + 2400 * 0.30)) / 1e6;
  const subtotal = Object.values(services).reduce((sum, amount) => sum + amount, 0);
  return { pricingDate: PRICING_DATE, kind: 'CONSERVATIVE_ESTIMATE_NOT_BILL', services, subtotalUsd: subtotal, reservationUsd: Math.ceil(subtotal / 0.8 * 100) / 100, safetyUsd: null, imageRegistryUsd: null, databaseIncrementalUsd: null };
}

export function measuredCaseAdmission(receipt) {
  const envelope = receipt.caseEnvelope;
  assert.ok(envelope?.schemaVersion === 'lythaus-beta-case-envelope-v1' && sha(envelope.measurementReceiptSha256), 'measured_case_envelope_required');
  assert.ok(finite(envelope.observedWholeCaseSeconds) && envelope.observedWholeCaseSeconds > 0 && envelope.observedWholeCaseSeconds <= 120, 'whole_case_measurement_required');
  const estimate = estimateBetaSmoke(receipt.instanceType, receipt.verifiedRemainingUnits, receipt.accountMeters, envelope);
  for (const field of ['safetyUpperBoundUsd','imageRegistryUpperBoundUsd','databaseUpperBoundUsd']) assert.ok(finite(envelope[field]), `${field}_required`);
  const caseReservationUsd = Math.ceil((estimate.subtotalUsd + envelope.safetyUpperBoundUsd + envelope.imageRegistryUpperBoundUsd + envelope.databaseUpperBoundUsd) / 0.8 * 100) / 100;
  assert.ok(caseReservationUsd > 0 && caseReservationUsd <= 1.6, 'BLOCKED_CASE_BUDGET');
  return { caseReservationUsd, feasibleCases: feasibleCaseCapacity(caseReservationUsd, receipt.betaCommittedUsd, receipt.sharedExperimentCommittedUsd) };
}

export function validateBetaRelease(receipt, { sourceSha, approvedReceiptHash, rawReceipt, preprocessingHash, now = Date.now() }) {
  assert.ok(sha(approvedReceiptHash) && hashReceipt(rawReceipt) === approvedReceiptHash, 'owner_receipt_hash_required');
  assert.equal(receipt.schemaVersion, 'lythaus-beta-release-approval-v1');
  assert.match(sourceSha, /^[a-f0-9]{40}$/);
  assert.equal(receipt.sourceSha, sourceSha, 'exact_release_source_required');
  assert.ok(['DISABLED_DEPLOYMENT', 'RESTRICTED_ACTIVATION'].includes(receipt.phase), 'unknown_release_phase');
  const enabled = receipt.phase === 'RESTRICTED_ACTIVATION';
  if (enabled) {
    assert.ok(sha(receipt.disabledDeploymentReceiptSha256) && sha(receipt.rollbackPlanSha256), 'disabled_deployment_and_rollback_evidence_required');
    assert.ok(Array.isArray(receipt.allowlist) && receipt.allowlist.length > 0 && receipt.allowlist.length <= 20 && receipt.allowlist.every(id => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)), 'bounded_owner_allowlist_required');
    assert.ok(Array.isArray(receipt.sourceHistoryHashes) && receipt.sourceHistoryHashes.length <= 16 && receipt.sourceHistoryHashes.every(sha), 'explicit_fixture_support_list_required');
  }
  assert.ok(typeof receipt.decisionOwner === 'string' && receipt.decisionOwner.length > 0);
  const expiry = Date.parse(receipt.expiresAt);
  assert.ok(Number.isFinite(expiry) && expiry > now && expiry <= now + 7 * 86400000, 'approval_expired_or_unbounded');
  assert.equal(receipt.checkpointSha256, 'b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e');
  assert.equal(receipt.preprocessingHash, preprocessingHash);
  for (const field of ['rightsEvidenceSha256', 'runtimeEvidenceSha256', 'budgetEvidenceSha256', 'resourceApprovalSha256']) assert.ok(sha(receipt[field]), `${field}_required`);
  assert.equal(receipt.restrictedBetaHostingAuthorized, true);
  assert.equal(receipt.publicEnforcementApproved, false);
  assert.equal(receipt.authorAdminOnly, true);
  assert.match(receipt.image, /^registry\.cloudflare\.com\/[a-f0-9]{32}\/lythaus-safe-beta@sha256:[a-f0-9]{64}$/);
  assert.ok(finite(receipt.peakMemoryBytes) && receipt.peakMemoryBytes > 0);
  assert.equal(receipt.memoryMeasurementScope, 'WHOLE_CONTAINER_POST_RESPONSE', 'supervisor_node_python_decode_scratch_and_response_peak_required');
  assert.ok(finite(receipt.imageBytes) && receipt.imageBytes > 0);
  assert.equal(receipt.measuredMaxPixels, 16777216, 'maximum_pixel_memory_measurement_required');
  assert.equal(receipt.realParityPassed, true);
  assert.ok(Number.isInteger(receipt.realParityCases) && receipt.realParityCases >= 8 && Number.isInteger(receipt.realSafeAttempts) && receipt.realSafeAttempts >= receipt.realParityCases && receipt.realSafeAttempts <= 16);
  const smallest = Object.entries(INSTANCE_TYPES).find(([, spec]) => memoryFits(receipt.peakMemoryBytes, spec.gib * 2 ** 30) && receipt.imageBytes * 2 + 128 * 1024 * 1024 <= spec.diskGb * 1e9)?.[0];
  assert.equal(receipt.instanceType, smallest, 'smallest_measured_fit_with_headroom_required');
  assert.ok(finite(receipt.sharedExperimentCommittedUsd) && finite(receipt.betaCommittedUsd));
  assert.ok(sha(receipt.allowanceEvidenceSha256), 'current_account_allowance_evidence_required');
  assert.ok(Date.parse(receipt.allowanceObservedAt) <= now && Date.parse(receipt.allowanceObservedAt) >= now - 3600000, 'account_usage_receipt_stale');
  const estimate = estimateBetaSmoke(receipt.instanceType, receipt.verifiedRemainingUnits, receipt.accountMeters);
  for (const field of ['safetyUpperBoundUsd', 'imageRegistryUpperBoundUsd', 'databaseUpperBoundUsd']) assert.ok(finite(receipt[field]), `${field}_required`);
  const reservation = Math.ceil((estimate.subtotalUsd + receipt.safetyUpperBoundUsd + receipt.imageRegistryUpperBoundUsd + receipt.databaseUpperBoundUsd) / 0.8 * 100) / 100;
  assert.ok(reservation <= 0.5 && receipt.sharedExperimentCommittedUsd + reservation <= 8 && receipt.betaCommittedUsd + reservation <= 1.6, 'BLOCKED_BUDGET');
  const admission = enabled ? measuredCaseAdmission(receipt) : { caseReservationUsd: null, feasibleCases: 0 };
  if (enabled) assert.ok(admission.feasibleCases >= 1, 'BLOCKED_CASE_CAPACITY');
  const admissionExpiresAt = new Date(Math.min(expiry, Date.parse(receipt.allowanceObservedAt) + 3600000)).toISOString();
  return { sourceSha, receiptSha256: approvedReceiptHash, image: receipt.image, runtimeDigest: receipt.image.split('@')[1], instanceType: receipt.instanceType, preprocessingHash, reservedUpperBoundUsd: reservation, ...admission, admissionExpiresAt, enabled, publicEnforcementApproved: false };
}

export function withBetaConfiguration(plan, approved) {
  const components = approved.enabled ? ['public', 'admin', 'jobs'] : ['jobs'];
  const changedComponents = [...new Set([...plan.changedComponents, ...components])].sort();
  return { ...plan, releaseClass: 'AUTH_CRITICAL_RELEASE', changedComponents,
    reusedComponents: plan.reusedComponents.filter(component => !changedComponents.includes(component)),
    criticalReasons: [...plan.criticalReasons, { rule: 'approved-beta-configuration', receiptSha256: approved.receiptSha256 }],
    configurationChanges: { schemaVersion: 'lythaus-beta-configuration-plan-v1', components, receiptSha256: approved.receiptSha256, enabled: approved.enabled },
  };
}
