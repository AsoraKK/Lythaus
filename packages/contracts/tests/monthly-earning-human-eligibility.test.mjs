import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateProposedWeeklyEarning, PROPOSED_WEEKLY_EARNING_RULES, PROPOSED_HUMAN_CONTRIBUTION_RULES,
  validateWeeklyEarningRules } from '../src/monthly-earning-policy.ts';

const contribution = (kind, id, creationMode = 'ai_assisted') => ({ id: `evidence-${id}`, workId: `work-${id}`, kind,
  performedAt: '2026-08-03T12:00:00.000Z', state: 'accepted', creationMode, declarationValid: true });
const calculate = (contributions, reception = [], rules = PROPOSED_HUMAN_CONTRIBUTION_RULES) => calculateProposedWeeklyEarning({ subjectUserId: 'member',
  startsAt: '2026-08-03T00:00:00.000Z', evaluatedAt: '2026-08-13T00:00:00.000Z',
  rules, contributions, reception });

test('assisted publication preserves declaration compliance without primary contribution points', () => {
  for (const kind of ['post', 'own_comment', 'own_reply', 'other_comment', 'other_reply']) {
    const result = calculate(Array.from({ length: 6 }, (_, index) => contribution(kind, index)));
    assert.equal(result.points, 50, kind);
    assert.deepEqual(result.actions.filter(row => row.points).map(row => [row.actionId, row.points]),
      [['weekly.declaration_compliance', 50]], kind);
    assert.deepEqual(result.completedFamilies, [], kind);
  }
});

test('an assisted primary item cannot obtain specialist, participation or breadth awards', () => {
  for (const kind of ['source', 'correction', 'help', 'accessibility', 'peer_ballot']) {
    const result = calculate(Array.from({ length: 6 }, (_, index) => contribution(kind, index)));
    assert.equal(result.points, 0, kind);
    assert.deepEqual(result.completedFamilies, [], kind);
  }
});

test('reception cannot turn assisted supporting work into contribution points', () => {
  const work = contribution('post', 'assisted');
  const reception = ['usefulness', 'usefulness', 'usefulness', 'usefulness', 'usefulness', 'discussion', 'discussion', 'value', 'value']
    .map((kind, index) => ({ id: `reception-${index}`, actorId: `independent-${index}`, contextId: `context-${index}`,
      kind, performedAt: '2026-08-04T12:00:00.000Z', state: 'accepted', helpful: true, supportingWorkIds: [work.workId] }));
  const result = calculate([work], reception);
  assert.equal(result.points, 50);
  assert.ok(result.actions.filter(row => row.actionId.startsWith('weekly.reception.')).every(row => row.points === 0));
  assert.equal(calculate([{ ...work, creationMode: 'human' }], reception).points, 1000);
});

test('assistance does not erase independent human milestones or the valid final ballot allowance', () => {
  const human = [contribution('post', 'post-1', 'human'), contribution('post', 'post-2', 'human'),
    contribution('post', 'post-3', 'human'), contribution('own_comment', 'discussion', 'human'),
    contribution('peer_ballot', 'ballot', 'not_applicable')];
  const original = calculate(human);
  const mixed = calculate([...human, contribution('own_reply', 'assisted-reply'), contribution('source', 'assisted-source')]);
  const { rulesVersion: historicalVersion, ...historical } = calculate(human, [], PROPOSED_WEEKLY_EARNING_RULES);
  const { rulesVersion: prospectiveVersion, ...prospective } = original;
  assert.notEqual(prospectiveVersion, historicalVersion);
  assert.deepEqual(prospective, historical);
  assert.equal(original.points, 900);
  assert.equal(mixed.points, original.points);
  assert.deepEqual(mixed.completedFamilies, original.completedFamilies);
  assert.deepEqual(mixed.actions.map(row => [row.actionId, row.points]), original.actions.map(row => [row.actionId, row.points]));
});

test('recorded legacy rules retain historical semantics and cannot be silently relabelled', () => {
  const assisted = [contribution('own_comment', 'assisted')];
  assert.equal(calculate(assisted, [], PROPOSED_WEEKLY_EARNING_RULES).points, 200);
  assert.equal(calculate(assisted).points, 50);
  assert.equal(PROPOSED_WEEKLY_EARNING_RULES.contributionEligibilityVersion, undefined);
  assert.equal(PROPOSED_HUMAN_CONTRIBUTION_RULES.status, 'pending_owner_approval');
  assert.deepEqual({ ...PROPOSED_HUMAN_CONTRIBUTION_RULES, version: PROPOSED_WEEKLY_EARNING_RULES.version,
    contributionEligibilityVersion: undefined }, { ...PROPOSED_WEEKLY_EARNING_RULES, contributionEligibilityVersion: undefined });
  for (const rules of [
    { ...PROPOSED_WEEKLY_EARNING_RULES, contributionEligibilityVersion: 'human-contributions-2026-10-v1' },
    { ...PROPOSED_HUMAN_CONTRIBUTION_RULES, contributionEligibilityVersion: undefined },
    { ...PROPOSED_HUMAN_CONTRIBUTION_RULES, contributionEligibilityVersion: null },
    { ...PROPOSED_HUMAN_CONTRIBUTION_RULES, contributionEligibilityVersion: 'unapproved' },
  ]) assert.throws(() => validateWeeklyEarningRules(rules), /monthly_earning_rules_invalid/);
});
