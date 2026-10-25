import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { rmSync } from 'node:fs';
import { intervalCandidate, requireUnchanged } from './pinned-source.mjs';
import { PROPOSED_MONTHLY_MAINTENANCE_RULES, calculateMonthlyMaintenance } from '../../packages/contracts/src/monthly-maintenance-policy.ts';
import { MONTHLY_REPUTATION_POLICY_VERSION as policy, MONTHLY_REPUTATION_CATALOGUE_HASH as catalogue } from '../../packages/contracts/src/monthly-reputation-policy.ts';

requireUnchanged('packages/contracts/src/monthly-maintenance-policy.ts');
requireUnchanged('packages/contracts/src/monthly-reputation-policy.ts');
const candidate = await intervalCandidate();
after(() => rmSync(candidate.directory, { recursive: true, force: true }));
const hour = 3600000, day = 24 * hour;
// Opaque, synthetic method mappings exercise the interval contract. They are
// neither approved product methods nor enrollment or authentication operations.
const rules = { ...PROPOSED_MONTHLY_MAINTENANCE_RULES, version: 'synthetic-interval-rules',
  capabilities: { ...PROPOSED_MONTHLY_MAINTENANCE_RULES.capabilities, mfa: 'verified_authentication', credential: 'verified_authentication' } };
const mapping = { version: 'synthetic-unapproved-mapping', status: 'approved_for_shadow', policyVersion: policy,
  catalogueHash: catalogue, maintenanceRulesVersion: rules.version, timezone: 'UTC',
  securityRequirementVersion: candidate.MONTHLY_SECURITY_GRACE_POLICY,
  commonBenefitAction: 'monthly.credential_maintenance', options: { optionA: ['credential'], optionB: ['mfa'] } };
const choice = (revision, effectiveAt, state = 'enabled', overrides = {}) => ({ id: `choice${revision}`, revision,
  subjectUserId: 'synthetic-member', sourceKind: 'account_credential', optionKey: 'optionA', credentialId: 'opaque-A',
  state, effectiveAt, ...overrides });
const coverage = (id = 'coverage-A', overrides = {}) => ({ id, subjectUserId: 'synthetic-member',
  performedAt: '2026-09-01T00:00:00.000Z', revokedAt: null,
  facts: { kind: 'protection', credentialId: 'opaque-A', protections: ['credential'], expiresAt: null }, ...overrides });
const observation = { id: 'synthetic-observation', subjectUserId: 'synthetic-member',
  performedAt: '2026-10-05T00:00:00.000Z', revokedAt: null,
  facts: { kind: 'authentication', credentialId: 'opaque-A', protections: ['credential'] } };
const base = { enabled: true, subjectUserId: 'synthetic-member', sourceMonth: '2026-10',
  evaluatedAt: '2026-11-05T00:00:00.000Z', collectFrom: '2026-09-01T00:00:00.000Z',
  policyVersion: policy, catalogueHash: catalogue, rules, mapping,
  changes: [choice(1, '2026-09-01T00:00:00.000Z')], serverEvidence: [coverage(), observation] };
const evaluate = overrides => candidate.selectedSecurityMaintenanceEvidence({ ...base, ...overrides });
const gap = ms => [...base.changes, choice(2, '2026-10-10T00:00:00.000Z', 'disabled'),
  choice(3, new Date(Date.parse('2026-10-10T00:00:00.000Z') + ms).toISOString())];

test('I01 uninterrupted full month qualifies with zero nonqualifying time', () => {
  const result = evaluate({}); assert.equal(result.state, 'ready');
  assert.equal(result.grace.verifiedUnprotectedMs, 0); assert.equal(result.grace.protectedMs, 31 * day);
});
test('I02 exactly 24 hours remains eligible', () => {
  const result = evaluate({ changes: gap(day) });
  assert.equal(result.state, 'ready'); assert.equal(result.grace.verifiedUnprotectedMs, day);
});
test('I03 24 hours plus one millisecond is ineligible', () => {
  const result = evaluate({ changes: gap(day + 1) });
  assert.equal(result.state, 'insufficient_evidence'); assert.equal(result.reason, 'monthly_grace_exceeded');
  assert.equal(result.grace.verifiedUnprotectedMs, day + 1);
});
test('I04 separate ordinary gaps accumulate within the same month', () => {
  const changes = [...gap(12 * hour), choice(4, '2026-10-20T00:00:00.000Z', 'disabled'),
    choice(5, '2026-10-20T12:00:00.000Z')];
  assert.equal(evaluate({ changes }).state, 'ready');
  changes[4] = { ...changes[4], effectiveAt: '2026-10-20T12:00:00.001Z' };
  assert.equal(evaluate({ changes }).reason, 'monthly_grace_exceeded');
});
test('I05 overlapping absence records contribute their union once', () => {
  const result = evaluate({ changes: gap(day), serverEvidence: [
    coverage('earlier', { revokedAt: '2026-10-10T00:00:00.000Z' }),
    coverage('later', { performedAt: '2026-10-11T00:00:00.000Z' }), observation,
  ] });
  assert.equal(result.state, 'ready'); assert.equal(result.grace.verifiedUnprotectedMs, day);
  assert.deepEqual(result.grace.unprotectedIntervals, [{ startsAt: '2026-10-10T00:00:00.000Z', endsAt: '2026-10-11T00:00:00.000Z' }]);
});
test('I06 adjoining disabled intervals are one continuous interval', () => {
  const result = evaluate({ changes: [...base.changes, choice(2, '2026-10-10T00:00:00.000Z', 'disabled'),
    choice(3, '2026-10-10T12:00:00.000Z', 'disabled'), choice(4, '2026-10-11T00:00:00.000Z')] });
  assert.equal(result.state, 'ready'); assert.equal(result.grace.verifiedUnprotectedMs, day);
  assert.equal(result.grace.unprotectedIntervals.length, 1);
});
test('I07 overlapping qualifying coverage is unioned without double-counting the month', () => {
  const result = evaluate({ serverEvidence: [coverage('first'), coverage('second', { performedAt: '2026-10-15T00:00:00.000Z' }), observation] });
  assert.equal(result.state, 'ready'); assert.equal(result.grace.protectedMs, 31 * day);
  assert.equal(result.grace.unknownMs, 0);
});
test('I08 normal method change with continuous qualifying coverage has zero gap', () => {
  const result = evaluate({ changes: [...base.changes,
    choice(2, '2026-10-15T00:00:00.000Z', 'enabled', { optionKey: 'optionB', credentialId: 'opaque-B' })],
    serverEvidence: [...base.serverEvidence, coverage('B', { performedAt: '2026-10-15T00:00:00.000Z',
      facts: { kind: 'protection', credentialId: 'opaque-B', protections: ['mfa'], expiresAt: null } })] });
  assert.equal(result.state, 'ready'); assert.equal(result.grace.verifiedUnprotectedMs, 0);
  assert.equal(result.grace.unknownMs, 0);
});
test('I09 each qualifying method receives one equal benefit for either existing action mapping', () => {
  for (const commonBenefitAction of ['monthly.credential_maintenance', 'monthly.mfa_maintenance']) {
    const selectedMapping = { ...mapping, commonBenefitAction };
    const a = evaluate({ mapping: selectedMapping });
    const b = evaluate({ mapping: selectedMapping,
      changes: [choice(1, '2026-09-01T00:00:00.000Z', 'enabled', { optionKey: 'optionB', credentialId: 'opaque-B' })],
      serverEvidence: [coverage('B', { facts: { kind: 'protection', credentialId: 'opaque-B', protections: ['mfa'], expiresAt: null } }),
        { ...observation, facts: { kind: 'authentication', credentialId: 'opaque-B', protections: ['mfa'] } }] });
    const report = calculateMonthlyMaintenance({ subjectUserId: base.subjectUserId, sourceMonth: base.sourceMonth, rules, evidence: [] });
    const benefit = decision => candidate.applyCommonSecurityBenefit(report, decision);
    assert.equal(a.state, 'ready'); assert.equal(b.state, 'ready');
    assert.equal(benefit(a).monthlyPoints, benefit(b).monthlyPoints);
    assert.deepEqual(benefit(a).actions.filter(row => row.points > 0).map(row => row.actionId), [commonBenefitAction]);
  }
});
test('I10 a gap crossing month-start counts only the current-month portion', () => {
  const result = evaluate({ changes: [...base.changes, choice(2, '2026-09-30T12:00:00.000Z', 'disabled'),
    choice(3, '2026-10-01T12:00:00.000Z')] });
  assert.equal(result.state, 'ready'); assert.equal(result.grace.verifiedUnprotectedMs, 12 * hour);
});
test('I11 a gap crossing month-end counts only the current-month portion', () => {
  const result = evaluate({ changes: [...base.changes, choice(2, '2026-10-31T12:00:00.000Z', 'disabled'),
    choice(3, '2026-11-01T12:00:00.000Z')] });
  assert.equal(result.state, 'ready'); assert.equal(result.grace.verifiedUnprotectedMs, 12 * hour);
});
test('I12 zero-duration changes do not consume grace', () => {
  const result = evaluate({ changes: gap(0) });
  assert.equal(result.state, 'ready'); assert.equal(result.grace.verifiedUnprotectedMs, 0);
});
test('I13 28/29/30/31-day months have their exact calendar duration', () => {
  for (const [sourceMonth, nextMonth, days] of [['2027-02', '2027-03', 28], ['2028-02', '2028-03', 29],
    ['2026-11', '2026-12', 30], ['2026-10', '2026-11', 31]]) {
    const startsAt = `${sourceMonth}-01T00:00:00.000Z`;
    const result = evaluate({ sourceMonth, evaluatedAt: `${nextMonth}-05T00:00:00.000Z`, collectFrom: '2026-01-01T00:00:00.000Z',
      changes: [choice(1, startsAt)], serverEvidence: [coverage('period', { performedAt: startsAt }),
        { ...observation, performedAt: `${sourceMonth}-05T00:00:00.000Z` }] });
    assert.equal(result.state, 'ready'); assert.equal(result.grace.protectedMs, days * day);
  }
});
test('I14 ordinary out-of-order delivery is normalized by recorded revision order', () => {
  const chronological = gap(day);
  assert.deepEqual(evaluate({ changes: chronological.toReversed() }), evaluate({ changes: chronological }));
});
test('I15 missing coverage after a normal method change remains explicitly unknown', () => {
  const result = evaluate({ changes: [...base.changes,
    choice(2, '2026-10-15T00:00:00.000Z', 'enabled', { optionKey: 'optionB', credentialId: 'opaque-B' })] });
  assert.equal(result.reason, 'coverage_telemetry_unknown'); assert.equal(result.grace.unknownMs, 17 * day);
});
test('I16 current candidate treats midmonth enrollment and incomplete collection as insufficient evidence', () => {
  assert.equal(evaluate({ changes: [choice(1, '2026-10-20T00:00:00.000Z')],
    serverEvidence: [coverage('late', { performedAt: '2026-10-20T00:00:00.000Z' }), observation] }).reason, 'not_enrolled_before_calendar_month');
  assert.equal(evaluate({ collectFrom: '2026-10-01T00:00:00.001Z' }).reason, 'coverage_history_incomplete');
});
test('I17 open month and settlement period have explicit non-final states', () => {
  assert.equal(evaluate({ evaluatedAt: '2026-10-31T23:59:59.999Z' }).state, 'open');
  assert.equal(evaluate({ evaluatedAt: '2026-11-01T00:00:00.000Z' }).state, 'settling');
  assert.equal(evaluate({ evaluatedAt: '2026-11-04T00:00:00.000Z' }).state, 'ready');
});
test('I18 local unlock setting alone remains unavailable as qualifying server evidence', () => {
  const result = evaluate({ changes: [choice(1, '2026-09-01T00:00:00.000Z', 'enabled',
    { sourceKind: 'device_preference', credentialId: null })] });
  assert.equal(result.reason, 'local_choice_is_not_credential_coverage'); assert.equal(result.evidence.length, 0);
});
test('I19 absent mapping and disabled collection cannot produce a ready result', () => {
  assert.equal(evaluate({ mapping: undefined }).reason, 'option_award_mapping_pending');
  assert.equal(evaluate({ enabled: false }).state, 'inactive');
});
test('I20 missing current-month observation remains a distinct policy input', () => {
  assert.equal(evaluate({ serverEvidence: [coverage()] }).reason, 'qualifying_authentication_missing');
  assert.equal(evaluate({ serverEvidence: [coverage(), { ...observation, performedAt: '2026-11-01T00:00:00.000Z' }] }).reason,
    'qualifying_authentication_missing');
});
test('I21 deterministic interval property checks sum, ordering, clipping and threshold for 64 schedules', () => {
  for (let seed = 1; seed <= 64; seed++) {
    let total = 0; const changes = [...base.changes];
    for (let i = 0; i < 4; i++) {
      const starts = Date.parse(`2026-10-${String(10 + i * 3).padStart(2, '0')}T00:00:00.000Z`);
      const duration = ((seed * 37 + i * 71) % 720 + 1) * 60000;
      total += duration;
      changes.push(choice(2 + i * 2, new Date(starts).toISOString(), 'disabled'),
        choice(3 + i * 2, new Date(starts + duration).toISOString()));
    }
    const result = evaluate({ changes: changes.toReversed() });
    assert.equal(result.grace.verifiedUnprotectedMs, total);
    assert.equal(result.state === 'ready', total <= day);
    assert.equal(result.grace.protectedMs + result.grace.verifiedUnprotectedMs + result.grace.unknownMs, 31 * day);
  }
});
test('I22 partially overlapping absence spans count 36 hours, not their 48-hour sum', () => {
  const result = evaluate({ changes: gap(day), serverEvidence: [
    coverage('earlier', { revokedAt: '2026-10-10T12:00:00.000Z' }),
    coverage('later', { performedAt: '2026-10-11T12:00:00.000Z' }), observation,
  ] });
  assert.equal(result.reason, 'monthly_grace_exceeded');
  assert.equal(result.grace.verifiedUnprotectedMs, 36 * hour);
  assert.deepEqual(result.grace.unprotectedIntervals, [{ startsAt: '2026-10-10T00:00:00.000Z', endsAt: '2026-10-11T12:00:00.000Z' }]);
});
