import assert from 'node:assert/strict';
import test from 'node:test';
import { selectedSecurityMaintenanceEvidence, securityChoiceIntervals, applyCommonSecurityBenefit } from '../src/monthly-security-choice.ts';
import { MONTHLY_SECURITY_GRACE_POLICY } from '../src/monthly-security-grace.ts';
import { calculateMonthlyMaintenance, PROPOSED_MONTHLY_MAINTENANCE_RULES as defaults } from '../src/monthly-maintenance-policy.ts';
import { MONTHLY_REPUTATION_POLICY_VERSION as policyVersion, MONTHLY_REPUTATION_CATALOGUE_HASH as catalogueHash } from '../src/monthly-reputation-policy.ts';

const rules = { ...defaults, capabilities: { ...defaults.capabilities, credential: 'verified_authentication', mfa: 'verified_authentication' } };
const mapping = { version: 'synthetic-reviewed-mapping', status: 'approved_for_shadow', policyVersion, catalogueHash,
  maintenanceRulesVersion: rules.version, timezone: 'UTC', securityRequirementVersion: MONTHLY_SECURITY_GRACE_POLICY,
  commonBenefitAction: 'monthly.credential_maintenance', options: { email_password: ['credential'], other_reviewed_option: ['credential'] } };
const change = (revision, effectiveAt = '2026-10-01T00:00:00.000Z', extra = {}) => ({ id: `choice-${revision}`,
  subjectUserId: 'a', revision, sourceKind: 'account_credential', optionKey: 'email_password', credentialId: 'a',
  state: 'enabled', effectiveAt, ...extra });
const protection = (id = 'coverage', credentialId = 'a', performedAt = '2026-10-01T00:00:00.000Z', revokedAt = null) => ({
  id, subjectUserId: 'a', performedAt, revokedAt, facts: { kind: 'protection', credentialId, protections: ['credential'], expiresAt: null } });
const auth = (credentialId = 'a', performedAt = '2026-10-10T00:00:00.000Z', id = 'genuine-server-auth') => ({
  id, subjectUserId: 'a', performedAt, revokedAt: null, facts: { kind: 'authentication', credentialId, protections: ['credential'] } });
const input = () => ({ enabled: true, subjectUserId: 'a', sourceMonth: '2026-10', evaluatedAt: '2026-11-04T00:00:00.000Z',
  collectFrom: '2026-10-01T00:00:00.000Z', policyVersion, catalogueHash, rules, mapping,
  changes: [change(1)], serverEvidence: [protection(), auth()] });
const prepare = (extra = {}) => selectedSecurityMaintenanceEvidence({ ...input(), ...extra });
const calculate = result => applyCommonSecurityBenefit(calculateMonthlyMaintenance({ subjectUserId: 'a', sourceMonth: '2026-10', rules, evidence: result.evidence }), result);
const credentialRow = result => result.actions.find(a => a.actionId === 'monthly.credential_maintenance');

test('inactive/default and unmapped collection never emit qualifying evidence', () => {
  assert.equal(prepare({ enabled: undefined }).state, 'inactive');
  const result = prepare({ mapping: undefined });
  assert.equal(result.state, 'unavailable'); assert.equal(result.reason, 'option_award_mapping_pending');
  assert.deepEqual(result.evidence, []); assert.equal(calculate(result).monthlyPoints, 0);
});

test('full calendar-month protected selection plus genuine matching authentication uses existing award only', () => {
  const result = prepare(); assert.equal(result.state, 'ready');
  const row = credentialRow(calculate(result));
  assert.equal(row.points, row.maximumPoints);
  assert.equal(calculate(result).actions.find(a => a.actionId === 'monthly.mfa_maintenance').points, 0);
  const repeated = prepare({ serverEvidence: [protection(), auth(), auth('a', undefined, 'second-server-auth'), auth('a', undefined, 'third-server-auth')] });
  assert.equal(calculate(repeated).monthlyPoints, calculate(result).monthlyPoints);
});

test('local unlock, face/fingerprint/PIN preferences cannot become server credential coverage', () => {
  for (const optionKey of ['off', 'every_reopen', 'after_1_minute', 'after_5_minutes', 'after_15_minutes', 'face', 'fingerprint', 'pin']) {
    const result = prepare({ changes: [change(1, undefined, { sourceKind: 'device_preference', optionKey, credentialId: null })] });
    assert.equal(result.state, 'unavailable'); assert.deepEqual(result.evidence, []);
    assert.equal(calculate(result).monthlyPoints, 0);
  }
});

test('missing/incorrect authentication cannot qualify despite a held choice', () => {
  for (const serverEvidence of [[protection()], [protection(), auth('another-credential')]]) {
    assert.equal(calculate(prepare({ serverEvidence })).monthlyPoints, 0);
  }
});

test('last-day enrollment, late collection cutover, disablement, revocation and re-enable gaps yield no award', () => {
  for (const changes of [
    [change(1, '2026-10-31T00:00:00.000Z')],
    [change(1), change(2, '2026-10-15T00:00:00.000Z', { state: 'disabled' })],
    [change(1), change(2, '2026-10-15T00:00:00.000Z', { state: 'revoked' })],
  ]) {
    const result = prepare({ changes });
    assert.equal(result.state, 'insufficient_evidence'); assert.equal(calculate(result).monthlyPoints, 0);
    assert.equal(result.intervals.length, changes.length);
  }
  assert.equal(prepare({ collectFrom: '2026-10-01T00:00:00.001Z' }).state, 'insufficient_evidence');
});

test('switching qualifying options with actual continuous evidence shares a single common benefit', () => {
  const result = prepare({ changes: [change(1), change(2, '2026-10-15T00:00:00.000Z', { optionKey: 'other_reviewed_option' })] });
  assert.equal(result.state, 'ready'); assert.equal(result.grace.verifiedUnprotectedMs, 0);
  assert.equal(calculate(result).monthlyPoints, calculate(prepare()).monthlyPoints);
});

test('credential rotation under the same held option preserves only gap-free server coverage', () => {
  const result = prepare({ changes: [change(1), change(2, '2026-10-15T00:00:00.000Z', { credentialId: 'replacement' })],
    serverEvidence: [protection('old', 'a', undefined, '2026-10-15T00:00:00.000Z'),
      protection('new', 'replacement', '2026-10-15T00:00:00.000Z'), auth()] });
  assert.equal(result.state, 'ready');
  assert.equal(credentialRow(calculate(result)).points, credentialRow(calculate(result)).maximumPoints);
});

test('cutoff is exclusive: a disablement at next-month start preserves the completed month', () => {
  const exact = prepare({ changes: [change(1), change(2, '2026-11-01T00:00:00.000Z', { state: 'disabled' })] });
  assert.equal(exact.state, 'ready');
  assert.equal(credentialRow(calculate(exact)).points, credentialRow(calculate(exact)).maximumPoints);
  const lastMillisecond = prepare({ changes: [change(1), change(2, '2026-10-31T23:59:59.999Z', { state: 'disabled' })] });
  assert.equal(lastMillisecond.state, 'ready'); assert.equal(lastMillisecond.grace.verifiedUnprotectedMs, 1);
});

test('account changes, duplicate events and missing revisions cannot leak or fabricate coverage', () => {
  assert.throws(() => prepare({ changes: [change(1, undefined, { subjectUserId: 'b' })] }), /choice_invalid/);
  assert.throws(() => prepare({ serverEvidence: [{ ...auth(), subjectUserId: 'b' }] }), /evidence_invalid/);
  assert.throws(() => securityChoiceIntervals('a', [change(1), change(1)]), /choice_invalid/);
  assert.equal(prepare({ changes: [change(1), change(3, '2026-10-15T00:00:00.000Z')] }).reason, 'coverage_history_incomplete');
  assert.equal(prepare({ changes: [change(2)] }).reason, 'coverage_history_incomplete');
});

test('UTC candidate calendar and settlement boundaries remain independent of device timezone', () => {
  assert.equal(prepare({ evaluatedAt: '2026-10-31T23:59:59.999Z' }).state, 'open');
  assert.equal(prepare({ evaluatedAt: '2026-11-01T00:00:00.000Z' }).state, 'settling');
  assert.equal(prepare({ evaluatedAt: '2026-11-03T23:59:59.999Z' }).state, 'settling');
  const prior = process.env.TZ;
  try {
    const expected = prepare();
    for (const zone of ['UTC', 'America/New_York', 'Pacific/Auckland']) {
      process.env.TZ = zone; assert.deepEqual(prepare(), expected);
    }
  } finally { if (prior === undefined) delete process.env.TZ; else process.env.TZ = prior; }
  assert.throws(() => prepare({ evaluatedAt: '2026-11-04T00:00:00.000-05:00' }), /timestamp_invalid/);
  assert.equal(prepare({ mapping: { ...mapping, timezone: 'America/New_York' } }).state, 'unavailable');
});

test('month lengths and year transitions use calendar boundaries, not rolling thirty days', () => {
  for (const [month, next, days] of [['2026-10', '2026-11', 31], ['2026-12', '2027-01', 31],
    ['2027-02', '2027-03', 28], ['2028-02', '2028-03', 29], ['2026-11', '2026-12', 30]]) {
    const result = prepare({ sourceMonth: month, collectFrom: `${month}-01T00:00:00.000Z`,
      evaluatedAt: `${next}-04T00:00:00.000Z`, changes: [], serverEvidence: [] });
    assert.equal(result.period.cutoffAt, `${next}-01T00:00:00.000Z`);
    assert.equal((Date.parse(result.period.cutoffAt) - Date.parse(result.period.startAt)) / 86400000, days);
  }
});

test('mapping must match versioned rules/catalogue and existing unavailable capabilities remain unavailable', () => {
  for (const field of ['policyVersion', 'catalogueHash', 'maintenanceRulesVersion']) {
    assert.equal(prepare({ mapping: { ...mapping, [field]: 'different' } }).state, 'unavailable');
  }
  assert.equal(prepare({ rules: defaults }).state, 'unavailable');
});

const instant = value => new Date(value).toISOString();
const midmonth = Date.parse('2026-10-15T00:00:00.000Z');
const offFor = duration => [change(1), change(2, instant(midmonth), { state: 'disabled' }), change(3, instant(midmonth + duration))];

test('zero, under and exactly 24 cumulative hours qualify; one millisecond over loses only security benefit', () => {
  const maximum = credentialRow(calculate(prepare())).maximumPoints;
  for (const milliseconds of [0, 1, 3600000, 86400000 - 1, 86400000, 86400000 + 1]) {
    const result = prepare({ changes: offFor(milliseconds) });
    assert.equal(result.grace.verifiedUnprotectedMs, milliseconds);
    assert.equal(result.grace.unknownMs, 0);
    assert.equal(result.state === 'ready', milliseconds <= 86400000);
    assert.equal(calculate(result).monthlyPoints, milliseconds <= 86400000 ? maximum : 0);
    assert.equal(calculate(result).actions.find(row => row.actionId === 'monthly.account_integrity').points, 0);
    if (milliseconds > 86400000) assert.equal(result.reason, 'monthly_grace_exceeded');
  }
});

test('repeated switches share one monthly allowance and never reset it or stack methods', () => {
  const changes = [change(1)]; let revision = 1;
  for (let day = 10; day < 13; day++) {
    const from = Date.parse(`2026-10-${day}T12:00:00.000Z`);
    changes.push(change(++revision, instant(from), { state: 'disabled' }));
    changes.push(change(++revision, instant(from + 8 * 3600000), { optionKey: day % 2 ? 'email_password' : 'other_reviewed_option' }));
  }
  const exact = prepare({ changes });
  assert.equal(exact.state, 'ready'); assert.equal(exact.grace.verifiedUnprotectedMs, 86400000);
  assert.equal(calculate(exact).monthlyPoints, calculate(prepare()).monthlyPoints);
  changes.push(change(++revision, '2026-10-20T00:00:00.000Z', { state: 'disabled' }));
  changes.push(change(++revision, '2026-10-20T00:00:00.001Z'));
  const over = prepare({ changes }); assert.equal(over.reason, 'monthly_grace_exceeded');
  assert.equal(over.grace.verifiedUnprotectedMs, 86400001); assert.equal(calculate(over).monthlyPoints, 0);
});

test('overlapping explicit disablement, revocation and expiry gaps count their union once', () => {
  const result = prepare({ changes: offFor(86400000), serverEvidence: [
    { ...protection('expiry-one'), facts: { ...protection().facts, expiresAt: instant(midmonth) } },
    protection('revocation-two', 'a', undefined, instant(midmonth + 6 * 3600000)),
    protection('replacement', 'a', instant(midmonth + 86400000)), auth(),
  ] });
  assert.equal(result.state, 'ready'); assert.equal(result.grace.verifiedUnprotectedMs, 86400000);
  assert.equal(result.grace.unprotectedIntervals.length, 1); assert.equal(result.grace.unknownMs, 0);
  const raw = calculateMonthlyMaintenance({ subjectUserId: 'a', sourceMonth: '2026-10', rules, evidence: result.evidence });
  assert.equal(raw.monthlyPoints, 0, 'real gap remains in raw facts; no protection coverage is fabricated');
  assert.equal(calculate(result).monthlyPoints, credentialRow(raw).maximumPoints);
});

test('a confirmed credential expiry gap consumes grace while unobserved replacement coverage stays unknown', () => {
  const confirmed = prepare({ serverEvidence: [
    { ...protection('old'), facts: { ...protection().facts, expiresAt: instant(midmonth) } },
    protection('new', 'a', instant(midmonth + 3600000)), auth(),
  ] });
  assert.equal(confirmed.state, 'ready'); assert.equal(confirmed.grace.verifiedUnprotectedMs, 3600000);
  const unknown = prepare({ changes: [change(1), change(2, instant(midmonth), { credentialId: 'replacement' })],
    serverEvidence: [protection(), protection('replacement', 'replacement', instant(midmonth + 3600000)), auth()] });
  assert.equal(unknown.reason, 'coverage_telemetry_unknown'); assert.equal(unknown.grace.unknownMs, 3600000);
  assert.equal(unknown.grace.verifiedUnprotectedMs, 0); assert.equal(calculate(unknown).monthlyPoints, 0);
});

test('cross-month intervals are clipped and each calendar month receives one independent allowance', () => {
  const changes = [change(1, '2026-09-01T00:00:00.000Z'),
    change(2, '2026-09-30T12:00:00.000Z', { state: 'disabled' }), change(3, '2026-10-01T12:00:00.000Z'),
    change(4, '2026-10-31T12:00:00.000Z', { state: 'disabled' }), change(5, '2026-11-01T12:00:00.000Z')];
  const serverEvidence = [protection('coverage', 'a', '2026-09-01T00:00:00.000Z'), auth(), auth('a', '2026-11-10T00:00:00.000Z', 'november-auth')];
  const october = prepare({ changes, serverEvidence });
  assert.equal(october.state, 'ready'); assert.equal(october.grace.verifiedUnprotectedMs, 86400000);
  assert.equal(october.grace.unprotectedIntervals[0].startsAt, '2026-10-01T00:00:00.000Z');
  assert.equal(october.grace.unprotectedIntervals.at(-1).endsAt, '2026-11-01T00:00:00.000Z');
  const november = prepare({ sourceMonth: '2026-11', evaluatedAt: '2026-12-04T00:00:00.000Z', changes, serverEvidence });
  assert.equal(november.state, 'ready'); assert.equal(november.grace.verifiedUnprotectedMs, 12 * 3600000);
});

test('grace cannot backdate enrollment, fabricate telemetry, substitute preference or skip genuine authentication', () => {
  for (const changes of [[change(1, '2026-10-01T00:00:00.001Z')], [change(1, '2026-10-15T00:00:00.000Z')]]) {
    assert.equal(prepare({ changes }).reason, 'not_enrolled_before_calendar_month');
  }
  assert.equal(prepare({ serverEvidence: [auth()] }).state, 'insufficient_evidence');
  assert.equal(prepare({ serverEvidence: [protection('late', 'a', '2026-10-31T00:00:00.000Z'),
    auth('a', '2026-10-31T12:00:00.000Z')] }).reason, 'not_enrolled_before_calendar_month');
  const noAuth = prepare({ changes: offFor(3600000), serverEvidence: [protection()] });
  assert.equal(noAuth.reason, 'qualifying_authentication_missing');
  const duringOff = prepare({ changes: offFor(3600000), serverEvidence: [protection(), auth('a', instant(midmonth + 1))] });
  assert.equal(duringOff.reason, 'qualifying_authentication_missing');
  assert.equal(prepare({ serverEvidence: [protection(), { ...auth(), revokedAt: '2026-10-25T00:00:00.000Z' }] }).reason,
    'qualifying_authentication_missing');
  assert.equal(prepare({ mapping: { ...mapping, securityRequirementVersion: 'old-no-grace' } }).state, 'unavailable');
  assert.equal(prepare({ mapping: { ...mapping, commonBenefitAction: undefined } }).state, 'unavailable');
});

test('synthetically mapped distinct verified methods receive one equal existing benefit without MFA/credential stacking', () => {
  const explicitTestMapping = { ...mapping, options: { synthetic_credential: ['credential'], synthetic_mfa: ['mfa'] } };
  const totals = [];
  for (const [optionKey, protectionKind] of [['synthetic_credential', 'credential'], ['synthetic_mfa', 'mfa']]) {
    const result = prepare({ mapping: explicitTestMapping, changes: [change(1, undefined, { optionKey })],
      serverEvidence: [
        { ...protection(), facts: { ...protection().facts, protections: [protectionKind] } },
        { ...auth(), facts: { ...auth().facts, protections: [protectionKind] } },
      ] });
    assert.equal(result.state, 'ready');
    const report = calculate(result); totals.push(report.monthlyPoints);
    assert.equal(report.actions.filter(action => action.actionId.includes('maintenance') && action.points > 0).length, 1);
  }
  assert.equal(totals[0], totals[1]); assert.equal(totals[0], credentialRow(calculate(prepare())).maximumPoints);
});

test('exceeding grace withholds only the security component and preserves other monthly and quarterly benefits', () => {
  const otherRules = { ...rules, integrityRubric: 'synthetic-reviewed-rubric',
    capabilities: { ...rules.capabilities, integrity: 'reviewed_assessment' } };
  const nonsecurity = [
    { id: 'integrity', subjectUserId: 'a', performedAt: '2026-11-02T00:00:00.000Z', revokedAt: null,
      facts: { kind: 'integrity_assessment', sourceMonth: '2026-10', rubricVersion: otherRules.integrityRubric, status: 'eligible' } },
    { id: 'email', subjectUserId: 'a', performedAt: '2026-10-02T00:00:00.000Z', revokedAt: null,
      facts: { kind: 'email_control', emailVersion: 'synthetic-email' } },
  ];
  const original = calculateMonthlyMaintenance({ subjectUserId: 'a', sourceMonth: '2026-10', rules: otherRules, evidence: nonsecurity });
  const over = prepare({ rules: otherRules, changes: offFor(86400001), serverEvidence: [...input().serverEvidence, ...nonsecurity] });
  const report = applyCommonSecurityBenefit(original, over);
  assert.ok(original.monthlyPoints > 0); assert.ok(original.quarterlyPoints > 0);
  assert.equal(report.monthlyPoints, original.monthlyPoints); assert.equal(report.quarterlyPoints, original.quarterlyPoints);
  assert.equal(report.actions.find(row => row.actionId === 'monthly.credential_maintenance').points, 0);
});

test('an unused unavailable optional method is not a hidden provider dependency for a qualifying held choice', () => {
  const result = prepare({ rules: { ...rules, capabilities: { ...rules.capabilities, mfa: 'unavailable' } },
    mapping: { ...mapping, options: { ...mapping.options, synthetic_optional_mfa: ['mfa'] } } });
  assert.equal(result.state, 'ready'); assert.equal(result.grace.unknownMs, 0);
});
