import assert from 'node:assert/strict';
import test from 'node:test';
import { PROPOSED_MONTHLY_MAINTENANCE_RULES as defaults } from '../../contracts/src/monthly-maintenance-policy.ts';
import { MONTHLY_REPUTATION_POLICY_VERSION as policyVersion, MONTHLY_REPUTATION_CATALOGUE_HASH as catalogueHash } from '../../contracts/src/monthly-reputation-policy.ts';

const subject = '019a4a90-0000-7000-8000-000000000001';
const rules = { ...defaults, capabilities: { ...defaults.capabilities, credential: 'verified_authentication' } };
const mapping = { version: 'synthetic-reviewed-mapping', status: 'approved_for_shadow', policyVersion, catalogueHash,
  maintenanceRulesVersion: rules.version, timezone: 'UTC', options: { email_password: ['credential'] } };
const evidence = [
  { id: 'coverage', subjectUserId: subject, performedAt: '2026-10-01T00:00:00.000Z', revokedAt: null,
    facts: { kind: 'protection', credentialId: subject, protections: ['credential'], expiresAt: null } },
  { id: 'password-proof', subjectUserId: subject, performedAt: '2026-10-10T00:00:00.000Z', revokedAt: null,
    facts: { kind: 'authentication', credentialId: subject, protections: ['credential'] } },
  { id: 'email', subjectUserId: subject, performedAt: '2026-10-10T00:00:00.000Z', revokedAt: null,
    facts: { kind: 'email_control', emailVersion: 'existing-email' } },
];
test.mock.module('../src/monthly-earning.ts', { namedExports: {
  loadMonthlyEarningConfiguration: async () => ({ rules: { version: 'weekly', periodPolicyVersion: 'synthetic-week' }, collectFrom: '2026-09-01T00:00:00.000Z' }),
  monthlyEarningSourceEvents: () => [],
} });
test.mock.module('../src/monthly-maintenance.ts', { namedExports: {
  loadMonthlyMaintenanceConfiguration: async () => ({ rules, collectFrom: '2026-10-01T00:00:00.000Z' }),
  readMonthlyMaintenanceEvidence: async () => ({ evidence, observationIds: evidence.map(item => item.id), revocationIds: [] }),
} });
let capturedInput;
test.mock.module('../src/monthly-reputation.ts', { namedExports: {
  recordMonthlyReputationSource: async (_client, request) => { capturedInput = request.input; return { id: 'source', revision: 1, created: true }; },
  recordPreparedMonthlyReputationSource: async () => { throw new Error('not_preparing'); },
  disposablePreparationAllowed: async () => false,
} });
test.mock.module('../src/monthly-peer-participation.ts', { namedExports: { requireMonthlyPeerIngestionDrained: async () => null } });
test.mock.module('../src/monthly-context-review.ts', { namedExports: { requireMonthlyContextIngestionDrained: async () => null } });
const { assembleMonthlyReputation } = await import('../src/monthly-assembly.ts');

const change = (revision, effectiveAt, state = 'enabled') => ({ id: `choice-${revision}`, subject_user_id: subject,
  revision: String(revision), source_kind: 'account_credential', option_key: 'email_password', credential_id: subject, state,
  effective_at: new Date(effectiveAt) });
class Database {
  calls = []; now = '2026-11-04T00:00:00.000Z'; previous;
  changes = [change(1, '2026-10-01T00:00:00.000Z')];
  async query(sql, values = []) {
    this.calls.push([sql, values]); const reply = rows => ({ rows, rowCount: rows.length });
    if (sql.includes('pg_advisory_xact_lock')) return reply([]);
    if (sql.includes('lock_monthly_reputation_subject')) return reply([{ created_at: new Date('2026-09-01T00:00:00.000Z') }]);
    if (sql.includes('FROM trust.monthly_reputation_sources')) return reply(this.previous ? [this.previous] : []);
    if (sql.includes('FROM system.outbox_events') || sql.includes('FROM trust.monthly_earning_week_revisions')) return reply([]);
    if (sql === 'SELECT clock_timestamp() AS evaluated_at') return reply([{ evaluated_at: new Date(this.now) }]);
    if (sql.includes('FROM trust.member_security_choices')) { assert.equal(values[0], subject); return reply(this.changes); }
    if (sql.includes('INSERT INTO trust.monthly_reputation_assemblies')) { this.report = JSON.parse(values[9]); return reply([]); }
    throw new Error(`Unexpected synthetic query: ${sql}`);
  }
}
const assemble = (db, securityChoice) => assembleMonthlyReputation(db, { subjectUserId: subject, sourceMonth: '2026-10',
  weeklyRulesVersion: 'weekly', maintenanceRulesVersion: rules.version, evaluatedAt: '2026-11-04T00:00:00.000Z', securityChoice });

test('disabled assembly preserves the previous calculator and does not read choices or new schema', async () => {
  const db = new Database(); await assemble(db);
  assert.equal(capturedInput.monthlyPoints, 1000); assert.equal(capturedInput.quarterlyPoints, 1000);
  assert.equal(db.calls.some(([sql]) => sql.includes('member_security_choices') || sql.includes('clock_timestamp')), false);
  assert.equal(db.report.securityChoice, undefined);
});

test('explicit selection policy uses DB time, withholds only security credit for gaps or pending mapping', async () => {
  for (const setup of [db => { db.changes.push(change(2, '2026-10-15T00:00:00.000Z', 'disabled')); },
    db => { db.now = '2026-11-03T23:59:59.999Z'; }, db => { db.changes = [change(1, '2026-10-31T00:00:00.000Z')]; }]) {
    const db = new Database(); setup(db); await assemble(db, { enabled: true, mapping });
    assert.equal(capturedInput.monthlyPoints, 0); assert.equal(capturedInput.quarterlyPoints, 1000);
    assert.ok(db.report.securityChoice.reason); assert.equal(db.report.securityChoice.evidence, undefined);
  }
  const db = new Database(); await assemble(db, { enabled: true });
  assert.equal(capturedInput.monthlyPoints, 0); assert.equal(capturedInput.quarterlyPoints, 1000);
  assert.equal(db.report.securityChoice.reason, 'option_award_mapping_pending');
  assert.equal(db.calls.some(([sql]) => sql.includes('member_security_choices')), false);
});

test('full held option passes only canonical facts to existing calculator and records version/history', async () => {
  const db = new Database(); await assemble(db, { enabled: true, mapping });
  assert.equal(capturedInput.monthlyPoints, 1000);
  assert.equal(db.report.securityChoice.mappingVersion, mapping.version);
  assert.deepEqual(db.report.securityChoice.configuration, mapping);
  assert.equal(db.report.securityChoice.intervals.length, 1);
  assert.equal(db.report.securityChoice.period.timezone, 'UTC');
  assert.equal(db.calls.some(([sql]) => /UPDATE.*reputation_profiles|auth_sessions|refresh_token_families/.test(sql)), false);
});

test('existing assemblies require separate policy review before adopting or changing selection mapping', async () => {
  for (const securityChoice of [undefined, { configuration: { ...mapping, options: { email_password: ['mfa'] } } }]) {
    const db = new Database(); db.previous = { id: 'prior', revision: 1, evidence_digest: 'prior-digest',
      rules_version: rules.version, weekly_rules_version: 'weekly', report: { ...(securityChoice ? { securityChoice } : {}) } };
    await assert.rejects(assemble(db, { enabled: true, mapping }), /previous_policy_requires_review/);
    assert.equal(db.report, undefined);
  }
});
