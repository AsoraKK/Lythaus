import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessPostPublishing } from '../src/post-publishing.ts';

const revision = { contentId: '0198a5d3-4a00-7000-8000-000000000001',
  sourceEventId: '0198a5d3-4a00-7000-8000-000000000002', declaredCreationMode: 'human', bodyHash: 'a'.repeat(64) };
const stageNames = ['provenance', 'specialist', 'behaviour', 'reasoning'];
const categories = ['harassment', 'harassment/threatening', 'hate', 'hate/threatening', 'illicit', 'illicit/violent',
  'self-harm', 'self-harm/instructions', 'self-harm/intent', 'sexual', 'sexual/minors', 'violence', 'violence/graphic'];
function input(outcome = 'ALLOW') {
  return { revision, safety: { state: 'evidence', persisted: false, analyseTextCalls: 1,
    evidence: { schemaVersion: 'lythaus-post-safety-evidence-preparation-v1', purpose: 'safety', applicability: 'evaluation-only',
      revision, provider: 'openai', model: 'omni-moderation-latest', status: 'SUCCESS', providerResult: 'ALLOW', flagged: false,
      categories: Object.fromEntries(categories.map(name => [name, false])), categoryScores: Object.fromEntries(categories.map(name => [name, 0])),
      categoryAppliedInputTypes: Object.fromEntries(categories.map(name => [name, ['text']])), executionMs: 1 } },
    stages: Object.fromEntries(stageNames.map(name => [name, { state: 'result', revision, componentVersion: 'synthetic-' + name + '-v1', outcome: 'pass' }])),
    policy: { revision, policyVersion: 'synthetic-policy-v1', thresholdVersion: 'synthetic-calibration-v1', outcome } };
}
function withheld(result) {
  assert.equal(result.applicability, 'evaluation-only'); assert.equal(result.persisted, false);
  for (const field of ['publicationEligible', 'discoveryEligible', 'reputationEligible']) assert.equal(result[field], false);
  assert.ok(result.reasonCodes.includes('PUBLICATION_PIPELINE_UNVALIDATED'));
}

for (const [outcome, state] of [['ALLOW', 'pass'], ['REVIEW', 'review'], ['BLOCK', 'block'], ['NOT_RUN', 'unknown']]) {
  test(`explicit versioned policy ${outcome} produces ${state} assessment with publication withheld`, () => {
    const result = assessPostPublishing(input(outcome));
    assert.equal(result.state, state); assert.equal(result.policyVersion, 'synthetic-policy-v1'); withheld(result);
  });
}
for (const name of stageNames) for (const state of ['unavailable', 'uncertain']) {
  test(`${name} ${state} cannot be replaced by safety ALLOW or reasoner output`, () => {
    const value = input(); value.stages[name] = { ...value.stages[name], state };
    const result = assessPostPublishing(value);
    assert.equal(result.state, 'unknown'); assert.ok(result.reasonCodes.includes(name.toUpperCase() + '_' + state.toUpperCase())); withheld(result);
  });
}
for (const field of ['contentId', 'sourceEventId', 'bodyHash', 'declaredCreationMode']) for (const name of [...stageNames, 'policy', 'safety']) {
  test(`${name} cannot supply evidence for a different ${field}`, () => {
    const value = input(), target = name === 'policy' ? value.policy : name === 'safety' ? value.safety.evidence : value.stages[name];
    target.revision = { ...revision, [field]: 'stale' };
    assert.equal(assessPostPublishing(value).state, 'unknown');
  });
}
for (const state of ['disabled', 'unknown', 'stale', 'protected']) test(`safety ${state} has no implied pass`, () => {
  const value = input(); value.safety = { state, persisted: false, analyseTextCalls: 0 };
  const result = assessPostPublishing(value); assert.equal(result.state, 'unknown'); withheld(result);
});
for (const outcome of ['REVIEW', 'BLOCK']) test(`safety ${outcome} conflicts with policy ALLOW without becoming enforcement`, () => {
  const value = input(); value.safety.evidence.providerResult = outcome;
  const result = assessPostPublishing(value); assert.equal(result.state, 'review'); withheld(result);
});
test('assessment returns only bindings, versions and fixed diagnostics, never raw safety or model data', () => {
  const value = input(); value.safety.evidence.categories = { 'private-synthetic-body-token': true };
  const result = assessPostPublishing(value);
  assert.ok(!JSON.stringify(result).includes('private-synthetic-body-token'));
  assert.ok(!('evidence' in result)); assert.ok(!('stages' in result));
});
for (const name of [...stageNames, 'policy', 'safety']) test(`${name} malformed outcome never defaults to pass`, () => {
  const value = input();
  if (name === 'safety') value.safety.evidence.providerResult = 'malformed';
  else if (name === 'policy') value.policy.outcome = 'malformed';
  else value.stages[name].outcome = 'malformed';
  assert.equal(assessPostPublishing(value).state, 'unknown');
});
