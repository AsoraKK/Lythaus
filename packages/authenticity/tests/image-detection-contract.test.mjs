import assert from 'node:assert/strict';
import test from 'node:test';
import { uuidv7 } from '../src/uuid.ts';
import { IMAGE_DETECTION_POLICY, IMAGE_DETECTION_VERSION, assertDetectionBinding, detectionBindingHash,
  compileDetectionEvidence, detectionOwnerStatus } from '../src/image-detection-contract.ts';
import { processImageDetectionEvent } from '../../../apps/lythaus-jobs/src/image-detection.ts';

export function syntheticBinding() {
  const ownerId = uuidv7(), uploadSessionId = uuidv7();
  return { ownerId, uploadSessionId, sourceEventId: uuidv7(), objectId: uuidv7(), contentVersion: 'd'.repeat(64),
    original: { key: `quarantine/${ownerId}/${uploadSessionId}`, version: 'synthetic-v1', etag: 'synthetic-etag',
      sha256: 'a'.repeat(64), bytes: 100, mime: 'image/png' },
    evaluator: { id: 'synthetic-provider', version: 'test-v1', model: 'no-model', modelVersion: 'test-v1',
      preprocessing: 'identity-test-v1', runtime: 'no-inference-v1' }, policyVersion: IMAGE_DETECTION_POLICY };
}

test('default consumer is inactive before parsing or accessing dependencies', async () => {
  assert.equal(await processImageDetectionEvent({}, null), 'disabled');
});

test('identity binds every field and is stable across property order', async () => {
  const binding = syntheticBinding(), original = await detectionBindingHash(binding);
  const reverse = value => Object.fromEntries(Object.entries(value).reverse());
  assert.equal(await detectionBindingHash({ ...reverse(binding), original: reverse(binding.original), evaluator: reverse(binding.evaluator) }), original);
  for (const field of ['sourceEventId', 'objectId']) {
    assert.notEqual(await detectionBindingHash({ ...binding, [field]: uuidv7() }), original);
  }
  for (const field of ['version', 'etag', 'sha256', 'bytes', 'mime']) {
    const changed = structuredClone(binding);
    changed.original[field] = field === 'bytes' ? 101 : field === 'mime' ? 'image/jpeg' : field === 'sha256' ? 'b'.repeat(64) : 'changed';
    assert.notEqual(await detectionBindingHash(changed), original);
  }
  for (const field of Object.keys(binding.evaluator)) {
    const changed = structuredClone(binding); changed.evaluator[field] += '-changed';
    assert.notEqual(await detectionBindingHash(changed), original);
  }
});

test('original contract rejects derivatives, unbound owner keys, extra fields and invalid identities', () => {
  const binding = syntheticBinding();
  for (const change of [b => { b.original.mime = 'image/webp'; }, b => { b.original.key = 'approved/synthetic.webp'; },
    b => { b.ownerId = uuidv7(); }, b => { b.original.bytes = Infinity; }, b => { b.original.sha256 = 'unknown'; },
    b => { b.original.privateMetadata = 'must not persist'; }, b => { b.evaluator.model = ''; }, b => { b.policyVersion = 'allow'; }]) {
    const changed = structuredClone(binding); change(changed);
    assert.throws(() => assertDetectionBinding(changed));
  }
});

test('synthetic successful measurement never asserts human authorship or grants authority', async () => {
  const binding = syntheticBinding(), attemptId = uuidv7(), bindingHash = await detectionBindingHash(binding);
  const job = { binding, bindingHash, attemptId, dispatchStartedAt: '2026-10-25T00:00:00Z', expiresAt: '2026-10-25T00:01:00Z' };
  const output = { schemaVersion: IMAGE_DETECTION_VERSION, bindingHash, attemptId, evaluator: binding.evaluator,
    evidenceKind: 'synthetic', safety: 'ALLOW', authorship: 'NO_POSITIVE_EVIDENCE' };
  const evidence = compileDetectionEvidence(job, output, '2026-10-25T00:00:01Z');
  assert.equal(evidence.authorship.state, 'ABSTAIN');
  assert.deepEqual(evidence.policy, { version: IMAGE_DETECTION_POLICY, outcome: 'review_required',
    publicationEligible: false, reputationEligible: false, enforcementAuthority: false });
  for (const change of [v => { v.attemptId = uuidv7(); }, v => { v.bindingHash = 'b'.repeat(64); },
    v => { v.evaluator.modelVersion = 'wrong-version'; }, v => { v.safety = 'UNKNOWN'; },
    v => { v.authorship = 'HUMAN'; }, v => { v.evidenceKind = 'real'; }, v => { v.rawImage = 'private'; }]) {
    const changed = structuredClone(output); change(changed);
    assert.throws(() => compileDetectionEvidence(job, changed, '2026-10-25T00:00:01Z'));
  }
  assert.throws(() => compileDetectionEvidence(job, output, job.expiresAt));
  const status = detectionOwnerStatus({ ...job, state: 'completed', evidence });
  assert.equal(status.evaluation, 'synthetic_only');
  assert.equal(status.authenticity, 'unverified');
  assert.doesNotMatch(JSON.stringify(status), /quarantine|sha256|modelVersion|ownerId|synthetic-provider/);
});

test('malformed delivery is rejected in the inactive synthetic harness', async () => {
  for (const value of [null, [], {}, { jobId: uuidv7(), sourceEventId: uuidv7(), bindingHash: 'a'.repeat(64), ownerId: uuidv7() }]) {
    await assert.rejects(() => processImageDetectionEvent({ mode: 'synthetic-local-only' }, value), /event_invalid/);
  }
});
