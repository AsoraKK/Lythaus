import { createHash } from 'node:crypto';
import { dirname, isAbsolute, parse, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const MAX_ACQUISITION_COUNT = 80;
export const MAX_ACQUISITION_BYTES = 512 * 1024 * 1024;
export const MAX_ACQUISITION_ITEM_BYTES = 20 * 1024 * 1024;
export const DEFAULT_ACQUISITION_HOSTS = new Set(['images.unsplash.com']);

const GATES = new Set(['ALLOW', 'DENY', 'CONDITIONAL', 'DO_NOT_TRAIN', 'UNKNOWN']);
const RIGHTS_CLASSES = new Set([
  'CLASS_A_COMMERCIAL_TRAINING',
  'CLASS_B_EVALUATION_ONLY',
  'CLASS_C_LYTHAUS_OWNED',
]);
const APPROVAL_SCOPES = new Set([
  'SOURCE_RIGHTS',
  'EVALUATION',
  'MODIFICATION',
  'ACQUISITION',
  'COMMERCIAL_TRAINING',
  'TRAINING',
  'DISTILLATION',
]);

function isInside(parent, candidate) {
  const route = relative(parent, candidate);
  return route === '' || (!route.startsWith('..') && !isAbsolute(route));
}

function assertNonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`recorded_human_approval_invalid:${field}`);
}

function isIsoTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function approvalScopes(approval) {
  const raw = Array.isArray(approval.scopes) ? approval.scopes : [approval.scope];
  return new Set(raw.filter((scope) => typeof scope === 'string'));
}

function recordedApproval(record) {
  const approval = record?.humanApproval;
  if (!approval || typeof approval !== 'object' || Array.isArray(approval)) return null;
  if (approval.decision !== 'APPROVED') return null;
  if (!isIsoTimestamp(approval.approvedAt)) return null;
  if (typeof approval.approvalId !== 'string' || approval.approvalId.trim() === '') return null;
  if (typeof approval.approvedBy !== 'string' || approval.approvedBy.trim() === '') return null;
  return approval;
}

export function assertRecordedHumanApproval(record, scopes, field = 'rights') {
  const approval = recordedApproval(record);
  if (!approval) throw new Error(`recorded_human_approval_required:${field}`);
  const available = approvalScopes(approval);
  for (const scope of scopes) {
    if (!APPROVAL_SCOPES.has(scope) || !available.has(scope)) {
      throw new Error(`recorded_human_approval_required:${field}:${scope}`);
    }
  }
  return approval;
}

function assertGate(value, field, record, scope) {
  if (!GATES.has(value)) throw new Error(`invalid_provenance_gate:${field}`);
  if (value === 'ALLOW') return;
  if (value === 'DENY' || value === 'DO_NOT_TRAIN') throw new Error(`provenance_gate_denied:${field}`);
  assertRecordedHumanApproval(record, [scope], field);
}

function assertVerifiedSourceRights(record) {
  const status = record?.licenceEvidenceStatus;
  if (status === 'VERIFIED') return;
  if (status === 'BLOCKED') throw new Error('source_rights_denied');
  if (status !== 'CONDITIONAL' && status !== 'UNKNOWN') throw new Error('invalid_licence_evidence_status');
  assertRecordedHumanApproval(record, ['SOURCE_RIGHTS'], 'licenceEvidenceStatus');
}

export function assertProvenanceAuthorization(record, { operation = 'evaluation', requireModification = false } = {}) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('provenance_record_required');
  if (record.containsUserContent !== false) throw new Error('contains_user_content_must_be_false');
  if (!RIGHTS_CLASSES.has(record.rightsClass)) throw new Error('invalid_rights_class');
  assertVerifiedSourceRights(record);
  assertGate(record.evaluationAllowed ?? record.evaluationGate, 'evaluationAllowed', record, 'EVALUATION');
  if (requireModification) {
    assertGate(record.modificationAllowed, 'modificationAllowed', record, 'MODIFICATION');
  }

  if (operation === 'training' || operation === 'distillation') {
    if (record.rightsClass === 'CLASS_B_EVALUATION_ONLY') throw new Error('evaluation_only_record_cannot_train_or_distil');
    assertGate(record.commercialTrainingAllowed, 'commercialTrainingAllowed', record, 'COMMERCIAL_TRAINING');
    assertGate(record.trainingGate, 'trainingGate', record, 'TRAINING');
  }
  if (operation === 'distillation') {
    assertGate(record.distillationAllowed, 'distillationAllowed', record, 'DISTILLATION');
  }
  return record;
}

export function assertAcquisitionApproval(record) {
  assertProvenanceAuthorization(record, { operation: 'evaluation', requireModification: true });
  return assertRecordedHumanApproval(record, ['ACQUISITION'], 'acquisition');
}

export function assertExternalPath(path, label = 'output') {
  if (typeof path !== 'string' || path.trim() === '') throw new Error(`external_path_required:${label}`);
  if (!isAbsolute(path)) throw new Error(`external_path_must_be_absolute:${label}`);
  const resolved = resolve(path);
  if (resolved === parse(resolved).root) throw new Error(`dangerous_root_path_rejected:${label}`);
  if (isInside(REPOSITORY_ROOT, resolved)) throw new Error(`repository_path_rejected:${label}`);
  return resolved;
}

export function assertExternalOutputPath(path, label = 'output') {
  return assertExternalPath(path, label);
}

export function assertExternalDataPath(path, label = 'data') {
  return assertExternalPath(path, label);
}

export function assertExternalChildPath(root, candidate, label = 'data') {
  const externalRoot = assertExternalDataPath(root, `${label}_root`);
  const externalCandidate = assertExternalDataPath(candidate, label);
  if (!isInside(externalRoot, externalCandidate)) throw new Error(`path_outside_external_root:${label}`);
  return externalCandidate;
}

export function assertAllowedAcquisitionUrl(value, allowedHosts = DEFAULT_ACQUISITION_HOSTS) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('acquisition_url_invalid');
  }
  if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname.toLowerCase())) {
    throw new Error(`acquisition_host_not_allowlisted:${url.hostname || 'unknown'}`);
  }
  return url;
}

export function assertAcquisitionBounds({ count, usedBytes = 0, nextBytes = 0, maxCount = MAX_ACQUISITION_COUNT, maxBytes = MAX_ACQUISITION_BYTES }) {
  if (!Number.isInteger(count) || count < 1 || count > maxCount) throw new Error(`acquisition_count_out_of_bounds:${count}`);
  if (!Number.isFinite(usedBytes) || !Number.isFinite(nextBytes) || usedBytes < 0 || nextBytes < 0 || nextBytes > MAX_ACQUISITION_ITEM_BYTES) {
    throw new Error('acquisition_byte_count_invalid');
  }
  if (usedBytes + nextBytes > maxBytes) throw new Error(`acquisition_aggregate_bytes_exceeded:${usedBytes + nextBytes}`);
}

export function deterministicUuidV7(seed, timestamp) {
  assertNonEmptyString(seed, 'seed');
  if (!isIsoTimestamp(timestamp)) throw new Error('reproducible_timestamp_required');
  const bytes = Buffer.from(createHash('sha256').update(seed).digest().subarray(0, 16));
  const millis = BigInt(Date.parse(timestamp));
  for (let index = 5; index >= 0; index -= 1) bytes[index] = Number(millis >> BigInt((5 - index) * 8)) & 0xff;
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
