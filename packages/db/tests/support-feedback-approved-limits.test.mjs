import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { parseSupportFeedbackPolicy, parseSupportSubmission } from '../../contracts/src/support-feedback.ts';
import { applyApprovedSupportCompletionLimits } from '../src/support-feedback-approved-limits.ts';
import { parseSupportServicePolicy, supportText } from '../src/support-feedback-policy.ts';

const source = readFileSync('packages/db/tests/support-feedback.postgres.mjs', 'utf8');
const literal = source.match(/const policy=\(\)=>\(([\s\S]*?)\);\nconst problem=/)[1];
const fixture = () => JSON.parse(JSON.stringify(runInNewContext(`(${literal})`)));
const problem = { kind: 'problem', category: 'display', title: 'Synthetic report', actual: 'Synthetic actual', expected: 'Synthetic expected' };

test('approved values compose with explicit unresolved fixture inputs without adding defaults or points', () => {
  const original = fixture(), policy = applyApprovedSupportCompletionLimits(original);
  assert.deepEqual([policy.contract.limits.titleCharacters, policy.contract.limits.detailCharacters,
    policy.contract.limits.stepsCharacters, policy.contract.limits.memberMessageCharacters], [160, 2000, 2000, 2000]);
  assert.equal(policy.limits.submissionsPerHour, 5);
  assert.equal(policy.limits.submissionsPerDay, 20);
  assert.equal(policy.privacy.retentionSeconds, 30 * 86400);
  assert.equal(policy.limits.memberMutations, original.limits.memberMutations);
  assert.equal(policy.limits.ownerMutations, original.limits.ownerMutations);
  assert.equal(policy.privacy.deleteAudit, original.privacy.deleteAudit);
  assert.equal(original.privacy.retentionSeconds, 3600);
  assert.equal(original.contract.limits.titleCharacters, undefined);
  assert.ok(Object.isFrozen(policy.contract.limits));
  assert.throws(() => applyApprovedSupportCompletionLimits(undefined), /support_policy_invalid/);
  const missing = fixture(); delete missing.limits.memberMutations;
  assert.throws(() => applyApprovedSupportCompletionLimits(missing), /support_policy_invalid/);
  const audit = fixture(); delete audit.privacy.deleteAudit;
  assert.throws(() => applyApprovedSupportCompletionLimits(audit), /support_policy_invalid/);
});

test('Unicode scalar character boundaries are separate from UTF-8 and malformed Unicode guards', () => {
  const policy = applyApprovedSupportCompletionLimits(fixture());
  const contract = { ...policy.contract, limits: { ...policy.contract.limits, titleBytes: 1024, detailBytes: 8192, stepsBytes: 8192, memberMessageBytes: 8192 } };
  assert.equal(parseSupportSubmission({ ...problem, title: '😀'.repeat(160), actual: '😀'.repeat(2000) }, contract).title, '😀'.repeat(160));
  assert.throws(() => parseSupportSubmission({ ...problem, title: '😀'.repeat(161) }, contract), /support_feedback_submission_invalid/);
  assert.throws(() => parseSupportSubmission({ ...problem, actual: 'x'.repeat(2001) }, contract), /support_feedback_submission_invalid/);
  assert.throws(() => parseSupportSubmission({ ...problem, reproductionSteps: 'x'.repeat(2001) }, contract), /support_feedback_submission_invalid/);
  assert.throws(() => parseSupportSubmission({ ...problem, title: '\ud800' }, contract), /support_feedback_submission_invalid/);
  assert.throws(() => parseSupportSubmission({ ...problem, title: '😀'.repeat(160) }, { ...contract, limits: { ...contract.limits, titleBytes: 639 } }), /support_feedback_submission_invalid/);
  assert.equal(supportText('😀'.repeat(2000), 8192, 2000), '😀'.repeat(2000));
  assert.throws(() => supportText('😀'.repeat(2001), 8192, 2000), /support_input_invalid/);
  assert.throws(() => parseSupportFeedbackPolicy({ ...contract, limits: { ...contract.limits, titleCharacters: 0 } }), /support_feedback_policy_invalid/);
});

test('submission hour/day quotas are paired and old explicit policies remain compatible', () => {
  assert.equal(parseSupportServicePolicy(fixture()).limits.submissionsPerHour, undefined);
  for (const limits of [{ submissionsPerHour: 5 }, { submissionsPerDay: 20 }, { submissionsPerHour: 0, submissionsPerDay: 20 }]) {
    assert.throws(() => parseSupportServicePolicy({ ...fixture(), limits: { ...fixture().limits, ...limits } }), /support_policy_invalid/);
  }
});
