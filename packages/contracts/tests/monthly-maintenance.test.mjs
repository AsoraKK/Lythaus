import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateMonthlyMaintenance, validateMonthlyMaintenanceRules, PROPOSED_MONTHLY_MAINTENANCE_RULES as defaults } from '../src/monthly-maintenance-policy.ts';

const rules = { ...defaults, integrityRubric: 'synthetic-assessment-v1', refresherPolicy: 'synthetic-policy-v1',
  capabilities: { integrity: 'reviewed_assessment', mfa: 'verified_authentication', credential: 'verified_authentication',
    challenge: 'account_bound_turnstile', refresher: 'server_comprehension', email: 'verified_email_control' } };
const calculate = (evidence = [], configuration = rules) => calculateMonthlyMaintenance({ subjectUserId: 'subject', sourceMonth: '2026-08', rules: configuration, evidence });
const proof = (id, kind, facts, performedAt = '2026-08-10T12:00:00.000Z', revokedAt = null) => ({ id, subjectUserId: 'subject', performedAt, revokedAt, facts: { kind, ...facts } });
const row = (result, id) => result.actions.find(action => action.actionId.endsWith(id));
const protection = (id = 'credential', from = '2026-08-01T00:00:00.000Z', revokedAt = null, expiresAt = null) => proof(id, 'protection', {
  credentialId: id, protections: ['mfa', 'credential'], expiresAt,
}, from, revokedAt);
const authentication = (credentialId = 'credential', performedAt = '2026-08-10T12:00:00.000Z') => proof(`auth-${credentialId}`, 'authentication', {
  credentialId, protections: ['mfa', 'credential'],
}, performedAt);
const email = (at, revokedAt = null, id = 'email') => proof(id, 'email_control', { emailVersion: id }, at, revokedAt);

test('SEC-01/12/13: unavailable capabilities and an unobserved account never imply clearance or points', () => {
  const result = calculate([], defaults);
  assert.equal(result.monthlyPoints, 0); assert.equal(result.quarterlyPoints, 0);
  assert.deepEqual(result.actions.slice(0, 5).map(action => action.state), Array(5).fill('unavailable'));
  assert.equal(row(calculate(), 'account_integrity').state, 'insufficient_evidence');
  assert.equal(calculate([protection(), authentication()], defaults).monthlyPoints, 0);
});

test('SEC-03/10/11: one credential can meet both conditions, with fixed non-stacking maintenance budgets', () => {
  const evidence = [protection(), authentication(), protection('second'), authentication('second'),
    proof('assessment', 'integrity_assessment', { sourceMonth: '2026-08', rubricVersion: rules.integrityRubric, status: 'eligible' }, '2026-09-02T00:00:00.000Z'),
    proof('challenge', 'anti_automation', { provider: 'turnstile', contextId: 'context', action: 'account_check', hostname: 'app.example.test', accountBound: true }),
    proof('challenge-again', 'anti_automation', { provider: 'turnstile', contextId: 'other', action: 'account_check', hostname: 'app.example.test', accountBound: true }),
    proof('refresher', 'policy_refresher', { policyVersion: rules.refresherPolicy }),
    proof('refresher-again', 'policy_refresher', { policyVersion: rules.refresherPolicy }),
    email('2026-08-01T00:00:00.000Z')];
  const result = calculate(evidence);
  assert.equal(result.monthlyPoints, 2500); assert.equal(result.quarterlyPoints, 1000);
  assert.deepEqual(calculate([...evidence].reverse()), result);
  assert.equal(row(result, 'anti_automation').evidenceIds.length, 1);
  assert.equal(row(result, 'mfa_maintenance').validUntil, '2026-09-01T00:00:00.000Z');
});

test('SEC-08/09: late enrollment, protection gaps and expired credentials are incomplete', () => {
  for (const coverage of [protection('credential', '2026-08-31T00:00:00.000Z'),
    protection('credential', undefined, '2026-08-31T23:59:59.999Z'),
    protection('credential', undefined, null, '2026-08-31T23:59:59.999Z')]) {
    const result = calculate([coverage, authentication()]);
    assert.equal(result.monthlyPoints, 0); assert.equal(row(result, 'credential_maintenance').reasonCode, 'incomplete_month_coverage');
  }
  assert.equal(calculate([protection('first', undefined, '2026-08-15T00:00:00.000Z'),
    protection('second', '2026-08-15T00:00:00.001Z'), authentication('first')]).monthlyPoints, 0);
});

test('SEC-08/11: rotation without a gap preserves coverage and authentication must match its registered credential', () => {
  const coverage = [protection('first', undefined, '2026-08-15T00:00:00.000Z'), protection('second', '2026-08-15T00:00:00.000Z')];
  assert.equal(calculate([...coverage, authentication('first')]).monthlyPoints, 1250);
  assert.equal(calculate([...coverage, authentication('first', '2026-08-15T00:00:00.000Z')]).monthlyPoints, 0);
  assert.equal(calculate([...coverage, authentication('unregistered')]).monthlyPoints, 0);
  assert.equal(calculate([protection(), authentication('credential', '2026-09-01T00:00:00.000Z')]).monthlyPoints, 0);
  assert.equal(row(calculate([protection()]), 'mfa_maintenance').reasonCode, 'qualifying_authentication_missing');
  assert.equal(calculate([protection('credential', undefined, '2026-09-01T00:00:00.000Z'), authentication()]).monthlyPoints, 1250);
});

test('SEC-04/12/14: integrity verdicts remain distinct and are not inferred from challenges or absent telemetry', () => {
  for (const [status, state] of [['pending_review', 'pending_review'], ['insufficient_evidence', 'insufficient_evidence'], ['confirmed_ineligible', 'withheld']]) {
    const result = calculate([proof('review', 'integrity_assessment', { sourceMonth: '2026-08', rubricVersion: rules.integrityRubric, status })]);
    assert.equal(row(result, 'account_integrity').state, state); assert.equal(result.monthlyPoints, 0);
  }
  for (const patch of [{ sourceMonth: '2026-07' }, { rubricVersion: 'unapproved' }]) {
    assert.equal(calculate([proof('review', 'integrity_assessment', { sourceMonth: '2026-08', rubricVersion: rules.integrityRubric, status: 'eligible', ...patch })]).monthlyPoints, 0);
  }
});

test('SEC-02/03: challenge evidence is bound to its subject and only valid current-policy refreshers qualify', () => {
  const challenge = proof('check', 'anti_automation', { provider: 'turnstile', contextId: 'c', action: 'a', hostname: 'h', accountBound: true });
  assert.throws(() => calculate([{ ...challenge, facts: { ...challenge.facts, accountBound: false } }]), /evidence_invalid/);
  assert.equal(calculate([{ ...challenge, performedAt: '2026-07-31T23:59:59.999Z' }]).monthlyPoints, 0);
  assert.equal(calculate([{ ...challenge, revokedAt: '2026-08-11T00:00:00.000Z' }]).monthlyPoints, 0);
  assert.throws(() => calculate([{ ...challenge, subjectUserId: 'another-account' }]), /evidence_invalid/);
  assert.equal(calculate([proof('refresher', 'policy_refresher', { policyVersion: 'old-policy' })]).monthlyPoints, 0);
});

test('CAL-16/17: calendar validity, exact-cutoff expiry, renewals and email revocation never stack', () => {
  assert.equal(calculate([email('2026-06-01T00:00:00.000Z')]).quarterlyPoints, 1000);
  const expired = calculate([email('2026-05-31T23:59:59.999Z')]);
  assert.equal(expired.quarterlyPoints, 0); assert.equal(row(expired, 'email_control').validUntil, '2026-08-31T23:59:59.999Z');
  assert.equal(calculate([email('2026-09-01T00:00:00.000Z')]).quarterlyPoints, 0);
  assert.equal(calculate([email('2026-08-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')]).quarterlyPoints, 1000);
  assert.equal(calculate([email('2026-08-01T00:00:00.000Z', '2026-08-31T23:59:59.999Z')]).quarterlyPoints, 0);
  const renewed = calculate([email('2026-06-01T00:00:00.000Z'), email('2026-08-20T00:00:00.000Z', null, 'renewed')]);
  assert.equal(renewed.quarterlyPoints, 1000); assert.deepEqual(row(renewed, 'email_control').evidenceIds, ['renewed']);
});

test('REL-03: unknown operational rules and malformed evidence fail closed', () => {
  for (const patch of [{ version: '' }, { status: 'approved' }, { monthSettlementHours: 0 }, { monthSettlementHours: 721 },
    { emailValidity: 'ninety_days' }, { protectionCoverage: 'last_day' }, { integrityRubric: null }, { refresherPolicy: null },
    { capabilities: { ...rules.capabilities, mfa: 'local_unlock' } }, { capabilities: { ...rules.capabilities, email: 'unavailable' } }]) {
    assert.throws(() => validateMonthlyMaintenanceRules({ ...rules, ...patch }), /rules_invalid/);
  }
  assert.throws(() => calculate([protection(), protection()]), /evidence_invalid/);
  assert.throws(() => calculate([proof('bad', 'unknown', {})]), /evidence_invalid/);
  for (const [kind, facts] of [['email_control', {}], ['email_control', { emailVersion: null }],
    ['integrity_assessment', {}], ['protection', { credentialId: 'c', protections: [] }],
    ['authentication', { credentialId: 'c', protections: ['mfa', 'mfa'] }], ['anti_automation', {}], ['policy_refresher', {}]]) {
    assert.throws(() => calculate([proof('malformed', kind, facts)]), /evidence_invalid/);
  }
  assert.throws(() => calculate([protection('c', '2026-08-01T00:00:00.000Z', '2026-07-31T00:00:00.000Z')]), /evidence_invalid/);
  assert.throws(() => calculate([protection('c', '2026-08-01T00:00:00.000Z', null, '2026-08-01T00:00:00.000Z')]), /evidence_invalid/);
});
