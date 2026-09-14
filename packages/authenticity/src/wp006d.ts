import {
  assertBlindDecodedPixels,
  type Wp006cDecodedPixels,
} from './wp006c.ts';
import { stableArtifactHash } from './wp006c.ts';

export const WP006D_PLAN_SCHEMA_VERSION = 'lythaus-wp006d-ef2-plan-v1' as const;
export const WP006D_ARCHIVE_AUDIT_SCHEMA_VERSION = 'lythaus-wp006d-csafe-archive-audit-v1' as const;
export const WP006D_SUBSET_PLAN_SCHEMA_VERSION = 'lythaus-wp006d-csafe-subset-plan-v1' as const;
export const WP006D_REPLICATION_MANIFEST_SCHEMA_VERSION = 'lythaus-wp006d-csafe-replication-manifest-v1' as const;
export const WP006D_CONTROL_MANIFEST_SCHEMA_VERSION = 'lythaus-wp006d-non-camera-control-manifest-v1' as const;
export const WP006D_RESULT_SCHEMA_VERSION = 'lythaus-wp006d-v0-replication-result-v1' as const;
export const WP006D_BENCHMARK_VERSION = 'lythaus-forensic-microbench-wp006d-csafe-v1' as const;
export const WP006D_EXPECTED_BASE_SHA = '2b70158f70fd78c9a100e55b85816f40703997dc' as const;
export const WP006D_EXPECTED_WP006C_BENCHMARK_FINGERPRINT = '1d3244ff464118904768acdeeb80561253dd7dccf65fff445148b26b9a6d77fb' as const;
export const WP006D_EXPECTED_WP006C_SPECIALIST_ID = 'lythaus-ef2-pixel-acquisition-v0' as const;
export const WP006D_EXPECTED_WP006C_SPECIALIST_VERSION = '0' as const;
export const WP006D_MAX_REPLICATION_DEVICES = 6 as const;
export const WP006D_MAX_FUTURE_HOLDOUT_DEVICES = 4 as const;
export const WP006D_MAX_SELECTED_IMAGES = 120 as const;
export const WP006D_MAX_SELECTED_BYTES = 2 * 1024 * 1024 * 1024;
export const WP006D_REQUIRED_NEW_CONTROL_FAMILIES = 24 as const;
export const WP006D_CANONICAL_CROP_CANDIDATES = Object.freeze([1024, 768, 512]);
export const WP006D_LGE_DEVICE = 'LGE LM-G710' as const;

export const WP006D_REPLICATION_DEVICES = Object.freeze([
  'iPhone11_1',
  'iPhone12_1',
  'iPhone14_1',
  'note10_1',
  's20_1',
  's21_1',
]);

export const WP006D_FUTURE_HOLDOUT_DEVICES = Object.freeze([
  'iPhone11_2',
  'iPhone12_2',
  'iPhone14_2',
  'note10_2',
]);

export type Wp006dCanonicalCropSize = (typeof WP006D_CANONICAL_CROP_CANDIDATES)[number];

export interface Wp006dDimensionRecord {
  width: number;
  height: number;
}

export interface Wp006dArchiveSelectionRecord {
  outerMember: string;
  member: string;
  deviceFamilyId: string;
  model: string;
  sceneType: string;
  lens: string;
  declaredSizeBytes: number;
}

export interface Wp006dSubsetPlan {
  schemaVersion: typeof WP006D_SUBSET_PLAN_SCHEMA_VERSION;
  benchmarkVersion: typeof WP006D_BENCHMARK_VERSION;
  replicationDevices: readonly string[];
  futureHoldoutDevices: readonly string[];
  selectedReplicationMembers: readonly Wp006dArchiveSelectionRecord[];
  selectedControlSampleIds: readonly string[];
  scenePolicy: string;
  sourceFamilyPolicy: string;
  holdoutPolicy: string;
  selectionUsesEf2Scores: false;
  futureHoldoutPixelsOpened: false;
  maximumSelectedImages: number;
  maximumSelectedBytes: number;
  declaredSelectedBytes: number;
  selectionStatus: 'FROZEN_BEFORE_EF2_SCORES';
}

function isSafeRelativeMember(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\\')) return false;
  if (value.startsWith('/') || /^[A-Za-z]:/u.test(value)) return false;
  return value.split('/').every((part) => part.length > 0 && part !== '..');
}

export function assertSafeArchiveMember(value: unknown): asserts value is string {
  if (!isSafeRelativeMember(value)) throw new Error('wp006d_archive_member_unsafe');
}

export function selectCanonicalCropSize(dimensions: readonly Wp006dDimensionRecord[], minimumCoverage = 0.9): Wp006dCanonicalCropSize {
  if (!Array.isArray(dimensions) || dimensions.length === 0) throw new Error('wp006d_crop_dimensions_empty');
  if (!Number.isFinite(minimumCoverage) || minimumCoverage <= 0 || minimumCoverage > 1) throw new Error('wp006d_crop_coverage_invalid');
  for (const size of WP006D_CANONICAL_CROP_CANDIDATES) {
    const covered = dimensions.filter((dimension) => Number.isInteger(dimension.width) && Number.isInteger(dimension.height)
      && dimension.width >= size && dimension.height >= size).length;
    if (covered / dimensions.length >= minimumCoverage) return size;
  }
  throw new Error('wp006d_no_canonical_crop_size_covers_required_fraction');
}

export function centeredNativeCrop(input: Wp006cDecodedPixels, cropSize: Wp006dCanonicalCropSize): Wp006cDecodedPixels {
  assertBlindDecodedPixels(input);
  if (!WP006D_CANONICAL_CROP_CANDIDATES.includes(cropSize)) throw new Error('wp006d_crop_size_invalid');
  if (input.width < cropSize || input.height < cropSize) throw new Error('wp006d_crop_not_applicable');
  const left = Math.floor((input.width - cropSize) / 2);
  const top = Math.floor((input.height - cropSize) / 2);
  const pixels = new Uint8Array(cropSize * cropSize * input.channels);
  for (let y = 0; y < cropSize; y += 1) {
    const sourceStart = ((top + y) * input.width + left) * input.channels;
    const targetStart = y * cropSize * input.channels;
    pixels.set(input.pixels.subarray(sourceStart, sourceStart + cropSize * input.channels), targetStart);
  }
  return { width: cropSize, height: cropSize, channels: input.channels, pixels };
}

export function assertWp006dSubsetPlan(value: unknown): asserts value is Wp006dSubsetPlan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('wp006d_subset_plan_invalid');
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== WP006D_SUBSET_PLAN_SCHEMA_VERSION) throw new Error('wp006d_subset_plan_schema_invalid');
  if (record.benchmarkVersion !== WP006D_BENCHMARK_VERSION) throw new Error('wp006d_subset_plan_version_invalid');
  if (!Array.isArray(record.replicationDevices) || record.replicationDevices.length !== WP006D_MAX_REPLICATION_DEVICES) throw new Error('wp006d_replication_device_count_invalid');
  if (!Array.isArray(record.futureHoldoutDevices) || record.futureHoldoutDevices.length !== WP006D_MAX_FUTURE_HOLDOUT_DEVICES) throw new Error('wp006d_future_holdout_device_count_invalid');
  const replication = new Set(record.replicationDevices.filter((item): item is string => typeof item === 'string'));
  const holdout = new Set(record.futureHoldoutDevices.filter((item): item is string => typeof item === 'string'));
  if (replication.size !== record.replicationDevices.length || holdout.size !== record.futureHoldoutDevices.length) throw new Error('wp006d_device_ids_not_unique');
  if ([...replication].some((device) => holdout.has(device))) throw new Error('wp006d_replication_holdout_device_overlap');
  if (!Array.isArray(record.selectedReplicationMembers) || record.selectedReplicationMembers.length === 0 || record.selectedReplicationMembers.length > WP006D_MAX_SELECTED_IMAGES) throw new Error('wp006d_selected_member_count_invalid');
  if (!Array.isArray(record.selectedControlSampleIds) || record.selectedControlSampleIds.length < WP006D_REQUIRED_NEW_CONTROL_FAMILIES) throw new Error('wp006d_control_count_below_floor');
  if (record.selectionUsesEf2Scores !== false) throw new Error('wp006d_selection_used_ef2_scores');
  if (record.futureHoldoutPixelsOpened !== false) throw new Error('wp006d_future_holdout_pixels_opened');
  if (record.selectionStatus !== 'FROZEN_BEFORE_EF2_SCORES') throw new Error('wp006d_subset_plan_not_frozen');
  const members = record.selectedReplicationMembers as Array<Record<string, unknown>>;
  const memberKeys = members.map((member) => `${String(member.outerMember)}::${String(member.member)}`);
  if (new Set(memberKeys).size !== memberKeys.length) throw new Error('wp006d_selected_member_duplicate');
  for (const member of members) {
    if (typeof member.deviceFamilyId !== 'string' || !replication.has(member.deviceFamilyId)) throw new Error('wp006d_member_outside_replication_devices');
    assertSafeArchiveMember(member.member);
    if (typeof member.outerMember !== 'string' || !member.outerMember.endsWith('.zip')) throw new Error('wp006d_outer_member_invalid');
    const memberSize = Number(member.declaredSizeBytes);
    if (!Number.isSafeInteger(memberSize) || memberSize < 0) throw new Error('wp006d_member_size_invalid');
  }
  const selectedBytes = Number(record.declaredSelectedBytes);
  if (!Number.isSafeInteger(selectedBytes) || selectedBytes < 0 || selectedBytes > WP006D_MAX_SELECTED_BYTES) throw new Error('wp006d_selected_byte_cap_exceeded');
  if (members.reduce((sum, member) => sum + Number(member.declaredSizeBytes), 0) !== Number(record.declaredSelectedBytes)) throw new Error('wp006d_selected_byte_total_mismatch');
}

export function assertWp006dPlan(value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('wp006d_plan_invalid');
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== WP006D_PLAN_SCHEMA_VERSION) throw new Error('wp006d_plan_schema_invalid');
  if (record.baseSha !== WP006D_EXPECTED_BASE_SHA) throw new Error('wp006d_plan_base_sha_invalid');
  if (record.wp006cBenchmarkFingerprint !== WP006D_EXPECTED_WP006C_BENCHMARK_FINGERPRINT) throw new Error('wp006d_plan_wp006c_fingerprint_invalid');
  if (record.planStatus !== 'FROZEN_BEFORE_EF2_SCORES') throw new Error('wp006d_plan_not_frozen');
  if (record.lgeHoldoutStatus !== 'SEALED' || record.csafeFutureHoldoutStatus !== 'SEALED') throw new Error('wp006d_holdout_not_sealed');
  if (record.selectionUsesEf2Scores !== false || record.thresholdRetuned !== false) throw new Error('wp006d_plan_selection_or_threshold_invalid');
  if (typeof record.planHash !== 'undefined') throw new Error('wp006d_plan_hash_self_reference');
}

export function hashWp006dPlan(value: unknown): string {
  assertWp006dPlan(value);
  return stableArtifactHash(value);
}

export function assertWp006dBenchmarkFingerprint(value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('wp006d_fingerprint_invalid');
  const record = value as Record<string, unknown>;
  if (record.benchmarkVersion !== WP006D_BENCHMARK_VERSION) throw new Error('wp006d_fingerprint_version_invalid');
  if (typeof record.fingerprintSha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(record.fingerprintSha256)) throw new Error('wp006d_fingerprint_hash_invalid');
  if (record.lgeHoldoutStatus !== 'SEALED' || record.csafeFutureHoldoutStatus !== 'SEALED') throw new Error('wp006d_fingerprint_holdout_invalid');
}
