import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { MONTHLY_REPUTATION_POLICY_VERSION } from '../src/monthly-reputation-policy.ts';
import { evaluateProposedCommunityAppeal, isEligibleCommunityVoter, PROPOSED_COMMUNITY_APPEAL_RULES } from '../src/monthly-peer-appeal-policy.ts';

const eligibility = { registered: true, emailVerified: true, activeVotingRestriction: false,
  appellant: false, relevantConflict: false, establishedControlledDuplicate: false };
const ballot = (voterUserId, choice = 'allow', patch = {}) => ({ policyVersion: MONTHLY_REPUTATION_POLICY_VERSION,
  voterUserId, revision: 1, weight: 1, choice, castAt: '2026-09-01T01:00:00.000Z', valid: true,
  eligibility: { ...eligibility }, ...patch });
const appeal = (ballots, patch = {}) => ({ policyVersion: MONTHLY_REPUTATION_POLICY_VERSION,
  reviewClass: 'standard', opensAt: '2026-09-01T00:00:00.000Z', closesAt: '2026-09-03T00:00:00.000Z',
  evaluatedAt: '2026-09-03T00:00:00.000Z', extensions: 0, rules: PROPOSED_COMMUNITY_APPEAL_RULES, ballots, ...patch });
const evaluate = (ballots, patch) => evaluateProposedCommunityAppeal(appeal(ballots, patch));

test('proposed defaults match original catalogue, with explicit pending approval and configurable values', () => {
  const catalogue = JSON.parse(readFileSync(new URL('../policies/Lythaus_Monthly_Rewards_Action_Catalogue_v2.json', import.meta.url)));
  assert.equal(PROPOSED_COMMUNITY_APPEAL_RULES.status, 'pending_owner_approval');
  assert.equal(PROPOSED_COMMUNITY_APPEAL_RULES.quorum, catalogue.appeals.proposed_defaults.quorum);
  assert.equal(PROPOSED_COMMUNITY_APPEAL_RULES.initialHours, catalogue.appeals.proposed_defaults.initial_duration_hours);
  assert.equal(PROPOSED_COMMUNITY_APPEAL_RULES.extensionHours, catalogue.appeals.proposed_defaults.extension_hours);
  assert.equal(PROPOSED_COMMUNITY_APPEAL_RULES.maximumExtensions, catalogue.appeals.proposed_defaults.maximum_extensions);
  assert.equal(evaluate([ballot('a')], { rules: { ...PROPOSED_COMMUNITY_APPEAL_RULES, quorum: 1 } }).status, 'resolved_allow');
});

test('APP-01/02/03/05/10: all plans, levels and Editorial status have one vote, with no five-person ceiling or confirmation', () => {
  const ballots = Array.from({ length: 12 }, (_, index) => ballot(`member-${index}`, index < 7 ? 'allow' : 'retain', {
    level: index < 7 ? 1 : 5, tier: index < 7 ? 'free' : 'black', editorial: index >= 7,
  }));
  const result = evaluate(ballots);
  assert.deepEqual(result, { policyVersion: MONTHLY_REPUTATION_POLICY_VERSION,
    rulesVersion: PROPOSED_COMMUNITY_APPEAL_RULES.version, validBallots: 12,
    allow: 7, retain: 5, reason: 'strict_majority', status: 'resolved_allow' });
  assert.equal(evaluate(ballots.map(item => ({ ...item, choice: item.choice === 'allow' ? 'retain' : 'allow' }))).status, 'resolved_retain');
});

test('APP-04/05: only published eligibility predicates restrict voting; no account age, payment or training gate', () => {
  assert.equal(isEligibleCommunityVoter({ ...eligibility, tier: 'free', level: 1, ageDays: 0, trained: false }), true);
  for (const key of Object.keys(eligibility)) assert.equal(isEligibleCommunityVoter({ ...eligibility, [key]: !eligibility[key] }), false);
  assert.equal(evaluate([ballot('appellant', 'allow', { eligibility: { ...eligibility, appellant: true } })]).validBallots, 0);
});

test('APP-06/14: latest revision counts once; invalidation and recusal cannot resurrect an earlier ballot', () => {
  const ballots = [ballot('a'), ballot('b'), ballot('c'), ballot('d', 'retain'), ballot('e', 'retain')];
  ballots.push(ballot('a', 'retain', { revision: 2 }));
  assert.equal(evaluate(ballots).status, 'resolved_retain');
  assert.equal(evaluate([...ballots].reverse()).validBallots, 5);
  for (const patch of [{ valid: false }, { choice: 'recuse' }, { choice: 'cannot_assess' }]) {
    assert.equal(evaluate([...ballots, ballot('a', 'allow', { revision: 3, ...patch })]).validBallots, 4);
  }
  assert.throws(() => evaluate([...ballots, ballot('a')]), /duplicate_revision/);
});

test('APP-07/08: open evaluation hides every tally; exact close rejects late ballots', () => {
  const before = evaluate([ballot('a')], { evaluatedAt: '2026-09-02T23:59:59.999Z' });
  assert.deepEqual(Object.keys(before).sort(), ['policyVersion', 'rulesVersion', 'status']);
  assert.equal(before.status, 'open');
  assert.equal(evaluate([ballot('a', 'allow', { castAt: '2026-09-02T23:59:59.999Z' })]).validBallots, 1);
  for (const castAt of ['2026-08-31T23:59:59.999Z', '2026-09-03T00:00:00.000Z', '2026-09-03T00:00:00.001Z']) {
    assert.throws(() => evaluate([ballot('a', 'allow', { castAt })]), /outside_window/);
  }
});

test('APP-09/11: tie and no quorum extend once, then remain unresolved without automatic guilt or publication', () => {
  const tie = Array.from({ length: 6 }, (_, index) => ballot(`v${index}`, index < 3 ? 'allow' : 'retain'));
  assert.equal(evaluate(tie).reason, 'tie');
  assert.equal(evaluate(tie).status, 'extension_required');
  assert.equal(evaluate([]).reason, 'no_quorum');
  for (const ballots of [tie, []]) assert.equal(evaluate(ballots, { extensions: 1,
    closesAt: '2026-09-04T00:00:00.000Z', evaluatedAt: '2026-09-04T00:00:00.000Z' }).status, 'unresolved');
});

test('APP-12/19: restricted cases have no community result and old-policy or weight-two ballots fail closed', () => {
  assert.deepEqual(evaluate([], { reviewClass: 'restricted' }), {
    policyVersion: MONTHLY_REPUTATION_POLICY_VERSION, rulesVersion: PROPOSED_COMMUNITY_APPEAL_RULES.version, status: 'restricted_review',
  });
  assert.throws(() => evaluate([ballot('a', 'allow', { weight: 2 })]), /equal_weight/);
  assert.throws(() => evaluate([ballot('a', 'allow', { policyVersion: 'appeals-v1.0.0' })]), /policy_mismatch/);
  assert.throws(() => evaluate([], { policyVersion: 'appeals-v1.0.0' }), /policy_unsupported/);
});

test('invalid case, rules and ballot records do not silently become an outcome', () => {
  for (const patch of [{ quorum: 0 }, { quorum: 1.5 }, { initialHours: 0 }, { extensionHours: 0 },
    { maximumExtensions: -1 }, { threshold: 'weighted' }, { status: 'approved' }, { version: '' }]) {
    assert.throws(() => evaluate([], { rules: { ...PROPOSED_COMMUNITY_APPEAL_RULES, ...patch } }), /rules_invalid/);
  }
  for (const extensions of [-1, 2, 0.5]) assert.throws(() => evaluate([], { extensions }), /extension_invalid/);
  assert.throws(() => evaluate([], { reviewClass: 'public' }), /review_class/);
  assert.throws(() => evaluate([], { closesAt: '2026-09-02T00:00:00.000Z' }), /window_invalid/);
  for (const patch of [{ voterUserId: '' }, { revision: 0 }, { choice: 'uphold' }, { valid: 1 }]) {
    assert.throws(() => evaluate([ballot('a', 'allow', patch)]), /ballot_invalid/);
  }
});
