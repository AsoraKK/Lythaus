import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const EXPECTED_CHECKPOINT = 'b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e';
const EXPECTED_SOURCE = '57eb62f43283daffc1828bfa8b01a783c3f0b14e11cda09994fd7c22a531f3ac';
const EXPECTED_UPSTREAM = '4e998724651b227def64f5be0cd60c0aa1552c35';
const EXPECTED_PREPROCESSING = 'SAFE_OFFICIAL_RGB_CENTER_CROP_256_DWT_CLASS1_V1';
const EXPECTED = { maxSafeAttempts: 16, maxActiveMinutes: 30, maxFileBytes: 10 * 1024 * 1024, maxDecodedPixels: 16_777_216 };

const args = process.argv.slice(2);
const arg = name => { const index = args.indexOf(name); if (index < 0 || !args[index + 1]) throw new Error('ARGUMENT_REQUIRED'); return args[index + 1]; };
const approvalPath = path.resolve(arg('--approval'));
const root = path.resolve(arg('--root'));
const sourceSha = arg('--source-sha');
const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const fail = code => { throw new Error(code); };
const relativeFile = (name, expected) => {
  const target = path.resolve(root, name);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) fail('BUNDLE_PATH_INVALID');
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink() || !stat.isFile()) fail('BUNDLE_FILE_INVALID');
  if (digest(target) !== expected) fail('BUNDLE_CHECKSUM_MISMATCH');
};

function validate() {
  if (!/^[0-9a-f]{40}$/.test(sourceSha)) fail('SOURCE_IDENTITY_REQUIRED');
  const approval = JSON.parse(fs.readFileSync(approvalPath, 'utf8'));
  if (!approval || typeof approval !== 'object' || Array.isArray(approval)) fail('APPROVAL_INVALID');
  if (approval.sourceSha !== sourceSha) fail('SOURCE_IDENTITY_MISMATCH');
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(approval.authorizationId ?? '')) fail('AUTHORIZATION_ID_REQUIRED');
  for (const field of ['attendedRuntimeAuthorized', 'computePolicySatisfied', 'checkpointUseAuthorized', 'fixtureUseAuthorized']) if (approval[field] !== true) fail('APPROVAL_REQUIRED');
  for (const field of ['rightsEvidenceSha256', 'runtimeEvidenceSha256', 'preprocessingHash']) if (!/^[a-f0-9]{64}$/.test(approval[field] ?? '')) fail('EVIDENCE_REQUIRED');
  if (!/^sha256:[a-f0-9]{64}$/.test(approval.runtimeDigest ?? '')) fail('RUNTIME_IDENTITY_REQUIRED');
  if (approval.checkpointSha256 !== EXPECTED_CHECKPOINT || approval.checkpointUpstreamCommit !== EXPECTED_UPSTREAM || approval.preprocessing !== EXPECTED_PREPROCESSING) fail('FROZEN_MODEL_IDENTITY_MISMATCH');
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(approval.expiresAtEpochSeconds) || now >= approval.expiresAtEpochSeconds || approval.expiresAtEpochSeconds > now + 86400) fail('APPROVAL_EXPIRED');
  for (const [field, value] of Object.entries(EXPECTED)) if (approval[field] !== value) fail('EVALUATION_LIMIT_MISMATCH');
  if (approval.automaticRetries !== false || approval.publicInferenceEndpoint !== false) fail('UNSAFE_EVALUATION_MODE');
  if (!approval.fixtures || typeof approval.fixtures !== 'object' || Array.isArray(approval.fixtures)) fail('FIXTURE_MAPPING_REQUIRED');
  relativeFile('models/resnet.py', EXPECTED_SOURCE);
  relativeFile('checkpoint.pth', EXPECTED_CHECKPOINT);
  for (const fixture of Object.values(approval.fixtures)) {
    if (!fixture || typeof fixture !== 'object' || typeof fixture.path !== 'string' || path.isAbsolute(fixture.path)) fail('FIXTURE_MAPPING_INVALID');
    const target = path.resolve(root, fixture.path);
    const relative = path.relative(root, target);
    if (!relative || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) fail('FIXTURE_PATH_OUTSIDE_BUNDLE');
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink() || !stat.isFile()) fail('FIXTURE_FILE_INVALID');
    if (stat.size > EXPECTED.maxFileBytes) fail('FIXTURE_SIZE_LIMIT');
    if (fixture.nonsealedEngineeringUseAuthorized !== true || !/^[a-f0-9]{64}$/.test(fixture.rightsEvidenceSha256 ?? '')) fail('FIXTURE_RIGHTS_REQUIRED');
  }
  return { schemaVersion: 'lythaus-private-evaluation-preflight-v1', sourceSha, authorizationIdSha256: createHash('sha256').update(approval.authorizationId).digest('hex'), checkpointSha256: EXPECTED_CHECKPOINT, fixtureCount: Object.keys(approval.fixtures).length };
}

try {
  const result = validate();
  const output = args.includes('--output') ? path.resolve(arg('--output')) : null;
  if (output) { fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 }); fs.writeFileSync(output, JSON.stringify(result) + '\n', { mode: 0o600 }); }
  process.stdout.write('PRIVATE_APPROVAL_VALID\n');
} catch (error) {
  process.stdout.write(`PRIVATE_APPROVAL_REJECTED:${error instanceof Error ? error.message : 'APPROVAL_INVALID'}\n`);
  process.exitCode = 1;
}
