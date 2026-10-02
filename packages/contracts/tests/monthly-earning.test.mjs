import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { calculateProposedWeeklyEarning, PROPOSED_WEEKLY_EARNING_RULES, validateWeeklyEarningRules } from '../src/monthly-earning-policy.ts';

let sequence = 0;
const primary = (kind = 'post', patch = {}) => {
  const n = ++sequence;
  return { id: `evidence-${n}`, workId: `work-${n}`, kind, performedAt: '2026-08-03T12:00:00.000Z',
    state: 'accepted', creationMode: 'human', declarationValid: true, ...patch };
};
const reception = (kind, workId, patch = {}) => {
  const n = ++sequence;
  return { id: `reception-${n}`, kind, actorId: `actor-${n}`, contextId: `context-${n}`,
    performedAt: '2026-08-04T12:00:00.000Z', state: 'accepted', supportingWorkIds: [workId], helpful: true, ...patch };
};
const calculate = (contributions = [], extra = {}) => calculateProposedWeeklyEarning({
  subjectUserId: 'member', startsAt: '2026-08-03T00:00:00.000Z', evaluatedAt: '2026-08-13T00:00:00.000Z',
  rules: PROPOSED_WEEKLY_EARNING_RULES, contributions, reception: [], ...extra,
});
const points = (result, action) => result.actions.find(row => row.actionId === `weekly.${action}`).points;

test('PTS-01/03/06/07/09: whole catalogue cap groups sum to 2500 despite excess shared-family activity', () => {
  const contributions = [primary(), primary(), primary(), primary('own_comment'), primary('own_reply'),
    primary('other_comment'), primary('other_reply'), primary('peer_ballot'), primary('peer_ballot'),
    primary('source'), primary('correction'), primary('source'), primary('help'), primary('accessibility'), primary('help')];
  const workId = contributions[0].workId;
  const judgments = [true, true, true, true, false].map(helpful => reception('usefulness', workId, { helpful }));
  const outcomes = ['discussion', 'discussion', 'discussion', 'value', 'value', 'value'].map(kind => reception(kind, workId));
  const result = calculate(contributions, { reception: [...judgments, ...outcomes] });
  assert.equal(result.points, 2500);
  assert.equal(result.completedFamilies.length, 6);
  assert.equal(points(result, 'three_human_posts'), 250);
  assert.equal(points(result, 'peer_appeal_participation'), 250);
  for (const [group, expected] of [['own_discussion', 150], ['other_discussion', 150], ['source_correction', 300], ['help_accessibility', 250]]) {
    assert.equal(result.actions.filter(row => row.capGroup === group).reduce((sum, row) => sum + row.points, 0), expected);
  }
  const catalogue = JSON.parse(readFileSync(new URL('../policies/Lythaus_Monthly_Rewards_Action_Catalogue_v2.json', import.meta.url)));
  assert.deepEqual(result.actions.map(row => row.actionId), catalogue.actions.filter(action => action.cadence === 'weekly').map(action => action.id));
  assert.equal(result.actions.find(row => row.actionId === 'weekly.accepted_source').reason, 'earned');
});

test('PTS-01/12/13/14: three-post completion and honest assisted participation have distinct awards', () => {
  assert.equal(calculate().points, 0);
  const human = [primary(), primary()];
  assert.equal(points(calculate(human), 'three_human_posts'), 0);
  assert.equal(calculate(human).actions[0].reason, 'milestone_incomplete');
  assert.equal(points(calculate([...human, primary()]), 'three_human_posts'), 250);
  assert.equal(points(calculate(Array.from({ length: 6 }, () => primary())), 'three_human_posts'), 250);
  const assisted = [primary('post', { creationMode: 'ai_assisted' })];
  assert.equal(calculate(assisted).points, 50);
  assert.equal(points(calculate(assisted), 'human_authorship'), 0);
  assert.equal(points(calculate([...assisted, ...human]), 'human_authorship'), 200);
});

test('PTS-04/08/10/11: one work item has one primary family and reversals remove dependent breadth', () => {
  const contributions = [primary(), primary(), primary(), primary('own_comment'), primary('other_reply'), primary('source')];
  const original = calculate(contributions);
  assert.equal(points(original, 'breadth'), 150);
  const reversed = contributions.map((row, i) => i === 0 ? { ...row, state: 'reversed' } : row);
  const corrected = calculate(reversed);
  assert.equal(points(corrected, 'three_human_posts'), 0);
  assert.equal(points(corrected, 'breadth'), 0);
  assert.equal(original.points - corrected.points, 400);
  assert.throws(() => calculate([...contributions, { ...contributions[0], id: 'new-label', kind: 'help' }]), /evidence_invalid/);
  assert.throws(() => calculate([...contributions, { ...contributions[0], workId: 'new-work' }]), /evidence_invalid/);
});

test('PTS-02/05: pending quality and withheld evidence never create earning; configured discussion threshold is explicit', () => {
  const result = calculate([primary('own_comment', { state: 'pending_review' }), primary('other_reply', { state: 'withheld' })]);
  assert.equal(result.points, 0);
  assert.equal(result.actions.find(row => row.actionId === 'weekly.own_post_comment').reason, 'pending_review');
  assert.equal(result.actions.find(row => row.actionId === 'weekly.other_post_reply').reason, 'withheld');
  const rules = { ...PROPOSED_WEEKLY_EARNING_RULES, version: 'two-contexts-proposal', discussionContributions: 2 };
  const one = primary('own_reply');
  assert.equal(points(calculate([one], { rules }), 'own_post_reply'), 0);
  assert.equal(points(calculate([one, primary('own_reply')], { rules }), 'own_post_reply'), 150);
});

test('PTS-18/19: helpfulness requires independent valid evidence and never converts missing data into a penalty', () => {
  const contribution = primary();
  const judgments = [true, true, true, false, false].map(helpful => reception('usefulness', contribution.workId, { helpful }));
  const partial = calculate([contribution], { reception: judgments });
  assert.equal(points(partial, 'reception.usefulness'), 125);
  assert.equal(points(calculate([contribution], { reception: judgments.map(row => ({ ...row, helpful: false })) }), 'reception.usefulness'), 0);
  const insufficient = calculate([contribution], { reception: judgments.slice(0, 4) });
  assert.equal(points(insufficient, 'reception.usefulness'), 0);
  assert.equal(insufficient.actions.find(row => row.actionId === 'weekly.reception.usefulness').reason, 'insufficient_evidence');
  const invalid = [reception('usefulness', contribution.workId, { actorId: 'member' }),
    reception('value', contribution.workId, { state: 'pending_review' }),
    reception('value', 'missing-work'), reception('discussion', contribution.workId, { state: 'withheld' })];
  const result = calculate([contribution], { reception: invalid });
  assert.equal(result.points, 250);
  assert.equal(result.actions.find(row => row.actionId === 'weekly.reception.value').pending, 1);
  assert.equal(result.actions.find(row => row.actionId === 'weekly.reception.value').withheld, 1);
});

test('PTS-11/19: actor/context duplication and withdrawn supporting work cannot inflate derived reception', () => {
  const contribution = primary();
  const a = reception('discussion', contribution.workId);
  const b = reception('discussion', contribution.workId, { actorId: a.actorId });
  const c = reception('discussion', contribution.workId, { contextId: a.contextId });
  const input = [a, b, c, reception('value', contribution.workId)];
  assert.equal(points(calculate([contribution], { reception: input }), 'reception.discussion'), 125);
  assert.equal(calculate([{ ...contribution, state: 'reversed' }], { reception: input }).points, 0);
  const reactions = [reception('usefulness', contribution.workId), reception('usefulness', contribution.workId)];
  reactions[1].actorId = reactions[0].actorId;
  assert.equal(calculate([contribution], { reception: reactions }).actions.find(row => row.actionId === 'weekly.reception.usefulness').accepted, 1);
});

test('CAL-05/T03: deterministic whole-week reports distinguish open, settling and locked with exact boundaries', () => {
  const contributions = [primary('source'), primary('correction'), primary('source')];
  assert.deepEqual(calculate(contributions), calculate([...contributions].reverse()));
  assert.equal(calculate([], { evaluatedAt: '2026-08-09T23:59:59.999Z' }).state, 'open');
  assert.equal(calculate([], { evaluatedAt: '2026-08-10T00:00:00.000Z' }).state, 'settling');
  assert.equal(calculate([], { evaluatedAt: '2026-08-13T00:00:00.000Z' }).state, 'locked');
  assert.throws(() => calculate([primary('post', { performedAt: '2026-08-10T00:00:00.000Z' })]), /performance_time_invalid/);
  assert.throws(() => calculate([primary('post', { performedAt: '2026-08-02T23:59:59.999Z' })]), /performance_time_invalid/);
  assert.throws(() => calculate([primary()], { evaluatedAt: '2026-08-03T01:00:00.000Z' }), /performance_time_invalid/);
  assert.throws(() => calculate([], { evaluatedAt: '2026-08-02T01:00:00.000Z' }), /performance_time_invalid/);
  assert.throws(() => calculate([], { startsAt: '2026-08-04T00:00:00.000Z' }), /week_invalid/);
});

test('SEC-01: invalid policy, evidence shapes and incompatible accepted declarations fail closed', () => {
  for (const rules of [null, { ...PROPOSED_WEEKLY_EARNING_RULES, status: 'active' },
    { ...PROPOSED_WEEKLY_EARNING_RULES, version: '' }, { ...PROPOSED_WEEKLY_EARNING_RULES, periodPolicyVersion: 'unapproved' },
    { ...PROPOSED_WEEKLY_EARNING_RULES, usefulnessPartialPercent: 80 }]) assert.throws(() => validateWeeklyEarningRules(rules), /rules_invalid/);
  for (const field of ['settlementHours', 'discussionContributions', 'sourceUnitPoints', 'helpUnitPoints',
    'breadthRequiredFamilies', 'usefulnessMinimum', 'usefulnessFullPercent', 'usefulnessPartialPercent', 'receptionOutcomePoints']) {
    for (const value of [0, NaN, 10001, 1.5]) assert.throws(() => validateWeeklyEarningRules({ ...PROPOSED_WEEKLY_EARNING_RULES, [field]: value }), /rules_invalid/);
  }
  for (const patch of [{ id: '' }, { workId: '' }, { kind: '__proto__' }, { state: 'ignored' },
    { creationMode: 'generated' }, { declarationValid: null }, { declarationValid: false }, { creationMode: 'unknown' }]) {
    assert.throws(() => calculate([primary('post', patch)]), /evidence_invalid/);
  }
  const contribution = primary();
  for (const patch of [{ id: '' }, { id: contribution.id }, { kind: 'emoji' }, { state: 'ignored' },
    { actorId: '' }, { contextId: '' }, { helpful: 'true' }, { supportingWorkIds: null }, { supportingWorkIds: [] }]) {
    assert.throws(() => calculate([contribution], { reception: [reception('value', contribution.workId, patch)] }), /evidence_invalid/);
  }
});
