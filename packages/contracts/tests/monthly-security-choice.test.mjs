import assert from 'node:assert/strict';
import test from 'node:test';
import { selectedSecurityMaintenanceEvidence, securityChoiceIntervals } from '../src/monthly-security-choice.ts';
import { calculateMonthlyMaintenance, PROPOSED_MONTHLY_MAINTENANCE_RULES as defaults } from '../src/monthly-maintenance-policy.ts';
import { MONTHLY_REPUTATION_POLICY_VERSION as policyVersion, MONTHLY_REPUTATION_CATALOGUE_HASH as catalogueHash } from '../src/monthly-reputation-policy.ts';

const rules = { ...defaults, capabilities: { ...defaults.capabilities, credential: 'verified_authentication', mfa: 'verified_authentication' } };
const mapping = { version: 'synthetic-reviewed-mapping', status: 'approved_for_shadow', policyVersion, catalogueHash,
  maintenanceRulesVersion: rules.version, timezone: 'UTC', options: { email_password: ['credential'], other_reviewed_option: ['credential'] } };
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
const calculate = result => calculateMonthlyMaintenance({ subjectUserId: 'a', sourceMonth: '2026-10', rules, evidence: result.evidence });
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

test('missing/incorrect authentication or actual protection gaps cannot qualify despite a held choice', () => {
  for (const serverEvidence of [[protection()], [protection(), auth('another-credential')],
    [protection('first', 'a', undefined, '2026-10-15T00:00:00.000Z'),
      protection('second', 'a', '2026-10-15T00:00:00.001Z'), auth()]]) {
    assert.equal(calculate(prepare({ serverEvidence })).monthlyPoints, 0);
  }
});

test('last-day enrollment, late collection cutover, disablement, revocation and re-enable gaps yield no award', () => {
  for (const changes of [
    [change(1, '2026-10-31T00:00:00.000Z')],
    [change(1), change(2, '2026-10-15T00:00:00.000Z', { state: 'disabled' })],
    [change(1), change(2, '2026-10-15T00:00:00.000Z', { state: 'revoked' })],
    [change(1), change(2, '2026-10-15T00:00:00.000Z', { state: 'disabled' }), change(3, '2026-10-15T00:00:00.001Z')],
  ]) {
    const result = prepare({ changes });
    assert.equal(result.state, 'insufficient_evidence'); assert.equal(calculate(result).monthlyPoints, 0);
    assert.equal(result.intervals.length, changes.length);
  }
  assert.equal(prepare({ collectFrom: '2026-10-01T00:00:00.001Z' }).state, 'insufficient_evidence');
});

test('a distinct option switched midmonth cannot stack or claim it was selected the whole month', () => {
  const result = prepare({ changes: [change(1), change(2, '2026-10-15T00:00:00.000Z', { optionKey: 'other_reviewed_option' })] });
  assert.equal(result.reason, 'selected_option_changed_midmonth'); assert.equal(calculate(result).monthlyPoints, 0);
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
  assert.equal(prepare({ changes: [change(1), change(2, '2026-10-31T23:59:59.999Z', { state: 'disabled' })] }).state, 'insufficient_evidence');
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
