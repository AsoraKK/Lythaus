import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateSecurityMaintenanceV05, SECURITY_GRACE_MS } from '../src/monthly-security-v05.ts';
import { calculateMonthlyRewardsV05, REWARDS_V05_CONFIGURATION, validateRewardsV05Configuration } from '../src/monthly-rewards-v05.ts';
import { PROPOSED_MONTHLY_MAINTENANCE_RULES } from '../src/monthly-maintenance-policy.ts';
import { PROSPECTIVE_REPUTATION_CONFIGURATION } from '../src/monthly-reputation-prospective.ts';
import { proposedClosingSundayWeek } from '../src/monthly-reputation-decisions.ts';

const subjectUserId = '01900000-0000-7000-8000-000000000001';
const start = '2026-11-01T00:00:00.000Z', cutoff = '2026-12-01T00:00:00.000Z';
const rules = { ...PROPOSED_MONTHLY_MAINTENANCE_RULES, capabilities: {
  ...PROPOSED_MONTHLY_MAINTENANCE_RULES.capabilities, mfa: 'verified_authentication', credential: 'verified_authentication' } };
const proof = (id, kind, performedAt, protections = ['mfa', 'credential'], extra = {}) => ({
  id, subjectUserId, performedAt, revokedAt: null,
  facts: { kind, credentialId: 'server-credential', protections, ...(kind === 'protection' ? { expiresAt: cutoff } : {}), ...extra },
});
const protection = proof('protection', 'protection', start);
const authentication = proof('authentication', 'authentication', '2026-11-10T00:00:00.000Z');
const coverage = (knownUnprotected = []) => ['mfa', 'credential'].map(category => ({
  category, collectionStartsAt: start, completeThrough: cutoff, knownUnprotected,
}));
const security = (patch = {}) => calculateSecurityMaintenanceV05({ subjectUserId, sourceMonth: '2026-11',
  rules, evidence: [protection, authentication], coverage: coverage(), ...patch });
const configuration = { ...REWARDS_V05_CONFIGURATION, firstSourceMonth: '2026-11', prospectiveFrom: start,
  weeklyRulesVersion: 'weekly', maintenanceRulesVersion: rules.version,
  quarterly: { ...PROSPECTIVE_REPUTATION_CONFIGURATION, firstSourceMonth: '2026-11', prospectiveFrom: start,
    rubricVersion: 'reviewed-rubric', authorityVersion: 'reviewed-authority' } };
const candidate = (patch = {}) => calculateMonthlyRewardsV05({ subjectUserId, sourceMonth: '2026-11',
  evaluatedAt: '2026-12-04T00:00:00.000Z', configuration, weeks: [], maintenanceRules: rules,
  evidence: [protection, authentication], securityCoverage: coverage(), suggestionRevisions: [], ingestionComplete: true, ...patch });

test('both catalogue categories independently award their existing maxima from qualifying evidence', () => {
  const result = security();
  assert.equal(result.monthlyPoints, 1250);
  assert.deepEqual(result.categories.map(row => row.points), [250, 1000]);
  assert.equal(result.maximumSecurityPoints, 1250);
});
test('password-only evidence never qualifies as MFA', () => {
  const result = security({ evidence: [proof('p', 'protection', start, ['credential']),
    proof('a', 'authentication', authentication.performedAt, ['credential'])] });
  assert.deepEqual(result.categories.map(row => row.points), [0, 1000]);
});
test('unsupported producers and capabilities fail closed', () => {
  assert.deepEqual(security({ coverage: [] }).categories.map(row => row.points), [0, 0]);
  assert.deepEqual(security({ rules: PROPOSED_MONTHLY_MAINTENANCE_RULES }).categories.map(row => row.state), ['unavailable', 'unavailable']);
});
test('inclusive cumulative grace unions overlapping intervals within each category', () => {
  const gapStart = '2026-11-15T00:00:00.000Z', gapEnd = '2026-11-16T00:00:00.000Z';
  const evidence = [{ ...protection, facts: { ...protection.facts, expiresAt: gapStart } },
    proof('second', 'protection', gapEnd), authentication];
  const off = [{ startsAt: gapStart, endsAt: gapEnd },
    { startsAt: gapStart, endsAt: '2026-11-15T12:00:00.000Z' }];
  const accepted = security({ evidence, coverage: coverage(off) });
  assert.equal(accepted.monthlyPoints, 1250);
  assert.equal(accepted.categories[0].grace.unprotectedMs, SECURITY_GRACE_MS);
  const lateEnd = '2026-11-16T00:00:00.001Z';
  const exceeded = security({ evidence: [evidence[0], proof('second', 'protection', lateEnd), authentication],
    coverage: coverage([{ startsAt: gapStart, endsAt: lateEnd }]) });
  assert.equal(exceeded.monthlyPoints, 0);
  assert.equal(exceeded.categories[0].reasonCode, 'monthly_grace_exceeded');
});
test('unknown gaps, missing monthly authentication and midmonth enrollment do not earn protection credit', () => {
  assert.equal(security({ evidence: [{ ...protection, performedAt: '2026-11-02T00:00:00.000Z' }, authentication] }).monthlyPoints, 0);
  assert.equal(security({ evidence: [protection] }).monthlyPoints, 0);
  assert.equal(security({ coverage: coverage().map(row => ({ ...row, completeThrough: '2026-11-30T23:59:59.999Z' })) }).monthlyPoints, 0);
  assert.equal(security({ evidence: [proof('p', 'protection', '2026-11-02T00:00:00.000Z'), authentication],
    coverage: coverage([{ startsAt: start, endsAt: '2026-11-02T00:00:00.000Z' }]) }).monthlyPoints, 0);
});
test('one category cannot borrow protection coverage or authentication from the other', () => {
  const result = security({ evidence: [proof('p', 'protection', start, ['mfa']),
    proof('a', 'authentication', authentication.performedAt, ['credential'])] });
  assert.equal(result.monthlyPoints, 0);
});
test('category-specific telemetry can withhold MFA while verified credential maintenance still qualifies', () => {
  const evidence = [proof('credential', 'protection', start, ['credential']),
    proof('mfa-first', 'protection', start, ['mfa'], { expiresAt: '2026-11-05T00:00:00.000Z' }),
    proof('mfa-second', 'protection', '2026-11-07T00:00:00.000Z', ['mfa']), authentication];
  const telemetry = coverage();
  telemetry[0].knownUnprotected = [{ startsAt: '2026-11-05T00:00:00.000Z', endsAt: '2026-11-07T00:00:00.000Z' }];
  assert.deepEqual(security({ evidence, coverage: telemetry }).categories.map(row => row.points), [0, 1000]);
});
test('multiple disjoint gaps share the inclusive cumulative 24-hour allowance', () => {
  const firstEnd = '2026-11-05T12:00:00.000Z', secondStart = '2026-11-15T00:00:00.000Z';
  const check = finalEnd => security({ evidence: [
    proof('first', 'protection', start, undefined, { expiresAt: '2026-11-05T00:00:00.000Z' }),
    proof('middle', 'protection', firstEnd, undefined, { expiresAt: secondStart }),
    proof('last', 'protection', finalEnd), authentication,
  ], coverage: coverage([{ startsAt: '2026-11-05T00:00:00.000Z', endsAt: firstEnd },
    { startsAt: secondStart, endsAt: finalEnd }]) });
  assert.equal(check('2026-11-15T12:00:00.000Z').monthlyPoints, 1250);
  assert.equal(check('2026-11-15T12:00:00.001Z').monthlyPoints, 0);
});
test('malformed or duplicate evidence and coverage are rejected', () => {
  assert.throws(() => security({ evidence: [protection, protection] }), /evidence_invalid/);
  assert.throws(() => security({ evidence: [{ ...authentication, subjectUserId: 'other' }] }), /evidence_invalid/);
  assert.throws(() => security({ coverage: [coverage()[0], coverage()[0]] }), /coverage_invalid/);
  assert.throws(() => security({ coverage: coverage([{ startsAt: cutoff, endsAt: start }]) }), /coverage_invalid/);
});
test('provisional window is configurable and elapsed time does not finalise benefits', () => {
  const before = candidate({ evaluatedAt: '2026-12-03T23:59:59.999Z' });
  const at = candidate();
  assert.equal(before.settlementState, 'settling');
  assert.equal(at.settlementState, 'candidate_complete');
  for (const value of [before, at]) {
    assert.equal(value.state, 'provisional'); assert.equal(value.redeemable, false);
    assert.equal(value.runtimeActivationAllowed, false); assert.equal(value.appliedPoints, 0);
    assert.equal(value.finalMaximumSourceMonth, null);
  }
  assert.equal(candidate({ configuration: { ...configuration, settlementHours: 96 } }).settlementState, 'settling');
});
test('late or incomplete ingestion stays provisional past the candidate deadline', () => {
  const result = candidate({ ingestionComplete: false });
  assert.equal(result.settlementState, 'evidence_pending');
  assert.ok(result.finalisationBlockers.includes('ingestion_incomplete'));
});
test('unresolved quarterly revision history cannot become a complete zero-point candidate', () => {
  const revision = { eventId: '01900000-0000-7000-8000-000000000005', contributionId: '01900000-0000-7000-8000-000000000006',
    subjectUserId, reviewerUserId: '01900000-0000-7000-8000-000000000007', privateEvidenceId: '01900000-0000-7000-8000-000000000008',
    amendmentVersion: configuration.quarterly.amendmentVersion, rubricVersion: configuration.quarterly.rubricVersion,
    authorityVersion: configuration.quarterly.authorityVersion, revision: 2,
    predecessorEventId: '01900000-0000-7000-8000-000000000009', decision: 'accepted',
    performedAt: '2026-11-10T00:00:00.000Z', decidedAt: '2026-11-11T00:00:00.000Z',
    useful: true, independentlyReviewed: true, manipulationScreened: true, competingAward: 'none' };
  const result = candidate({ suggestionRevisions: [revision] });
  assert.equal(result.settlementState, 'evidence_pending');
  assert.ok(result.finalisationBlockers.includes('quarterly_evidence_pending'));
});
test('UTC Monday to Sunday weeks belong to the closing-Sunday month across month and year boundaries', () => {
  for (const [instant, ownerMonth] of [['2026-10-31T23:59:59.999Z', '2026-11'], ['2026-12-31T12:00:00.000Z', '2027-01']]) {
    assert.equal(proposedClosingSundayWeek(instant).ownerMonth, ownerMonth);
  }
  assert.equal(candidate().calendar.status, 'approved');
});
test('quarterly email expires at quarter end and does not credit earlier months', () => {
  const email = { id: '01900000-0000-7000-8000-000000000003', subjectUserId,
    performedAt: '2026-11-10T00:00:00.000Z', revokedAt: null,
    facts: { kind: 'email_control', emailVersion: '01900000-0000-7000-8000-000000000004' } };
  assert.equal(candidate({ evidence: [email] }).emailPoints, 1000);
  assert.equal(candidate({ sourceMonth: '2027-01', evaluatedAt: '2027-02-04T00:00:00.000Z', evidence: [email] }).emailPoints, 0);
  assert.equal(candidate({ sourceMonth: '2026-10', evidence: [email] }), null);
});
test('unavailable security preserves independently qualified weekly, email and optional suggestion credit', () => {
  const email = { id: '01900000-0000-7000-8000-000000000003', subjectUserId,
    performedAt: '2026-11-10T00:00:00.000Z', revokedAt: null,
    facts: { kind: 'email_control', emailVersion: '01900000-0000-7000-8000-000000000004' } };
  const suggestion = { eventId: '01900000-0000-7000-8000-000000000005', contributionId: '01900000-0000-7000-8000-000000000006',
    subjectUserId, reviewerUserId: '01900000-0000-7000-8000-000000000007', privateEvidenceId: '01900000-0000-7000-8000-000000000008',
    amendmentVersion: configuration.quarterly.amendmentVersion, rubricVersion: configuration.quarterly.rubricVersion,
    authorityVersion: configuration.quarterly.authorityVersion, revision: 1, predecessorEventId: null, decision: 'accepted',
    performedAt: '2026-11-10T00:00:00.000Z', decidedAt: '2026-11-11T00:00:00.000Z',
    useful: true, independentlyReviewed: true, manipulationScreened: true, competingAward: 'none' };
  const week = { ...proposedClosingSundayWeek('2026-11-10T00:00:00.000Z'),
    weekId: '01900000-0000-7000-8000-000000000009', revision: 1, state: 'locked', points: 2500,
    lockedAt: '2026-11-20T00:00:00.000Z' };
  const result = candidate({ evidence: [email], weeks: [week], suggestionRevisions: [suggestion],
    maintenanceRules: PROPOSED_MONTHLY_MAINTENANCE_RULES, securityCoverage: [] });
  assert.equal(result.weeklyPoints, 2500); assert.equal(result.monthlyPoints, 0);
  assert.equal(result.emailPoints, 1000); assert.equal(result.suggestionPoints, 150);
  assert.equal(result.sourceScore, 3650); assert.equal(result.redeemable, false);
});
test('current component arithmetic is bounded without declaring a final v0.5 ceiling', () => {
  const result = candidate();
  assert.equal(result.maximumForCurrentComponents, 13650);
  assert.equal(result.finalMaximumSourceMonth, null);
  assert.equal(result.sourceScore, 1250);
});
test('cutover and activation configuration fail closed', () => {
  assert.equal(candidate({ configuration: REWARDS_V05_CONFIGURATION }), null);
  for (const patch of [{ settlementHours: 0 }, { settlementHours: 721 }, { finalMaximumSourceMonth: 13650 },
    { runtimeActivationAllowed: true }, { policyVersion: 'unknown' }, { settlementWindowStatus: 'approved' }]) {
    assert.throws(() => validateRewardsV05Configuration({ ...configuration, ...patch }), /configuration_invalid/);
  }
});
