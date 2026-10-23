import assert from 'node:assert/strict';
import test from 'node:test';
import { recordMemberSecurityChoice, recordMonthlyAccountAuthentication, prepareMonthlySecurityEvidence, securityChoiceMapping } from '../src/member-security-maintenance.ts';
import { PROPOSED_MONTHLY_MAINTENANCE_RULES as defaults } from '../../contracts/src/monthly-maintenance-policy.ts';
import { MONTHLY_REPUTATION_POLICY_VERSION as policyVersion, MONTHLY_REPUTATION_CATALOGUE_HASH as catalogueHash } from '../../contracts/src/monthly-reputation-policy.ts';

const rules = { ...defaults, capabilities: { ...defaults.capabilities, credential: 'verified_authentication' } };
const mapping = { version: 'synthetic-reviewed-choice', status: 'approved_for_shadow', policyVersion, catalogueHash,
  maintenanceRulesVersion: rules.version, timezone: 'UTC', options: { email_password: ['credential'] } };
class Database {
  calls = []; sourceKind = 'account_credential'; choiceState = 'enabled'; proofOwner = 'a'; existing;
  async query(sql, values = []) {
    this.calls.push([sql, values]); const reply = rows => ({ rows, rowCount: rows.length });
    if (sql.startsWith('SELECT\n      to_regclass')) return reply([{ available: true }]);
    if (sql.includes('FROM system.feature_flags')) return reply([{ enabled: true, policy_version: policyVersion }]);
    if (sql.includes('FROM trust.monthly_maintenance_rule_sets')) return reply([{ configuration: rules, collect_from: new Date('2026-10-01T00:00:00.000Z') }]);
    if (sql.includes('FROM identity.account_action_verifications')) {
      assert.match(sql, /expires_at = verified_at \+ interval '5 minutes'/);
      return reply([{ id: 'proof-id', user_id: this.proofOwner, credential_id: this.proofOwner, verified_at: new Date('2026-10-10T00:00:00.000Z') }]);
    }
    if (sql.includes('FROM trust.member_security_choices') && sql.includes('ORDER BY revision DESC')) {
      return reply([{ option_key: 'email_password', source_kind: this.sourceKind, state: this.choiceState, credential_id: 'a' }]);
    }
    if (sql.includes('FROM trust.monthly_maintenance_observations')) return reply(this.existing ? [{ facts: this.existing }] : []);
    if (sql.includes('INSERT INTO trust.monthly_maintenance_observations')) { this.facts = JSON.parse(values[3]); return { rows: [], rowCount: 1 }; }
    if (sql.includes('FROM identity.users')) { assert.match(sql, /FOR UPDATE/); return reply([{ id: 'a' }]); }
    if (sql.includes('FROM identity.email_credentials')) return reply([{ user_id: 'a' }]);
    if (sql.includes('FROM trust.member_security_choices WHERE id')) return reply([]);
    if (sql.includes('INSERT INTO trust.member_security_choices')) {
      assert.match(sql, /clock_timestamp\(\)/); assert.match(sql, /MAX\(revision\)/);
      this.choice = values; return reply([{ revision: '4', effective_at: new Date('2026-10-15T00:00:00.000Z') }]);
    }
    throw new Error(`Unexpected synthetic query: ${sql}`);
  }
}

test('collection is inactive by default and a missing mapping performs no queries or writes', async () => {
  const db = new Database();
  assert.equal((await recordMonthlyAccountAuthentication(db, { subjectUserId: 'a', proofId: 'p' })).state, 'inactive');
  assert.equal((await recordMemberSecurityChoice(db, {})).state, 'inactive');
  assert.equal((await prepareMonthlySecurityEvidence(db, {})).state, 'inactive');
  assert.equal((await recordMonthlyAccountAuthentication(db, { enabled: true, subjectUserId: 'a', proofId: 'p' })).reason, 'option_award_mapping_pending');
  assert.deepEqual(db.calls, []);
});

test('only canonical server password authentication can append an existing credential fact; never points/MFA/biometrics', async () => {
  const db = new Database();
  const result = await recordMonthlyAccountAuthentication(db, { enabled: true, subjectUserId: 'a', proofId: 'proof-id', rulesVersion: rules.version, mapping });
  assert.equal(result.recorded, true);
  assert.deepEqual(db.facts, { kind: 'authentication', credentialId: 'a', protections: ['credential'] });
  assert.equal(db.calls.some(([sql]) => /UPDATE.*reputation|reward_redemptions/.test(sql)), false);
  db.existing = { protections: ['credential'], credentialId: 'a', kind: 'authentication' };
  assert.equal((await recordMonthlyAccountAuthentication(db, { enabled: true, subjectUserId: 'a', proofId: 'proof-id', rulesVersion: rules.version, mapping })).recorded, false);
  db.proofOwner = 'b';
  await assert.rejects(recordMonthlyAccountAuthentication(db, { enabled: true, subjectUserId: 'a', proofId: 'proof-id', rulesVersion: rules.version, mapping }), /canonical_authentication_required/);
});

test('local choice or disabled/revoked protection cannot record qualifying authentication', async () => {
  for (const change of [db => { db.sourceKind = 'device_preference'; }, db => { db.choiceState = 'disabled'; }, db => { db.choiceState = 'revoked'; }]) {
    const db = new Database(); change(db);
    const result = await recordMonthlyAccountAuthentication(db, { enabled: true, subjectUserId: 'a', proofId: 'proof-id', rulesVersion: rules.version, mapping });
    assert.equal(result.state, 'unavailable'); assert.equal(db.facts, undefined);
  }
});

test('choice journal serializes account changes and uses server effective time; disabling/revocation require no award eligibility', async () => {
  for (const state of ['enabled', 'disabled', 'revoked']) {
    const db = new Database();
    const result = await recordMemberSecurityChoice(db, { enabled: true, id: 'server-generated-id', subjectUserId: 'a',
      sourceKind: 'device_preference', optionKey: 'after_5_minutes', credentialId: null, state, effectiveAt: '2000-01-01T00:00:00.000Z' });
    assert.equal(result.effectiveAt, '2026-10-15T00:00:00.000Z');
    assert.equal(db.calls.some(([sql]) => sql.includes('monthly_maintenance_observations')), false);
  }
  await assert.rejects(recordMemberSecurityChoice(new Database(), { enabled: true, id: 'id', subjectUserId: 'a',
    sourceKind: 'device_preference', optionKey: 'face', credentialId: 'a', state: 'enabled' }), /choice_invalid/);
  await assert.rejects(recordMemberSecurityChoice(new Database(), { enabled: true, id: 'id', subjectUserId: 'a',
    sourceKind: 'account_credential', optionKey: 'face', credentialId: 'a', state: 'enabled' }), /choice_invalid/);
  await assert.rejects(recordMemberSecurityChoice(new Database(), { enabled: true, id: 'id', subjectUserId: 'a',
    sourceKind: 'account_credential', optionKey: 'email_password', credentialId: 'b', state: 'disabled' }), /choice_invalid/);
});

test('mapping rejects unknown versions, operational timezone and invented protection categories', () => {
  assert.equal(securityChoiceMapping(undefined), undefined);
  assert.deepEqual(securityChoiceMapping(JSON.stringify(mapping)), mapping);
  for (const value of [{ ...mapping, catalogueHash: 'wrong' }, { ...mapping, timezone: 'local' },
    { ...mapping, options: { pin: ['points'] } }, { ...mapping, options: { x: ['credential', 'credential'] } }]) {
    assert.throws(() => securityChoiceMapping(JSON.stringify(value)), /mapping_unavailable/);
  }
});
