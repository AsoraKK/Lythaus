import type { Client } from 'pg';
import { MONTHLY_REPUTATION_CATALOGUE_HASH, MONTHLY_REPUTATION_POLICY_VERSION, nextReputationMonth, requireSourceMonth } from '../../contracts/src/monthly-reputation-policy.ts';
import { selectedSecurityMaintenanceEvidence, type SecurityChoiceChange, type SecurityChoiceMapping } from '../../contracts/src/monthly-security-choice.ts';
import { loadMonthlyMaintenanceConfiguration, readMonthlyMaintenanceEvidence } from './monthly-maintenance.ts';

export function securityChoiceMapping(value: string | undefined): SecurityChoiceMapping | undefined {
  if (!value) return undefined;
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('security_mapping_unavailable');
  const mapping = parsed as SecurityChoiceMapping;
  if (mapping.status !== 'approved_for_shadow' || !mapping.version || mapping.timezone !== 'UTC'
    || mapping.policyVersion !== MONTHLY_REPUTATION_POLICY_VERSION
    || mapping.catalogueHash !== MONTHLY_REPUTATION_CATALOGUE_HASH || !mapping.options
    || typeof mapping.options !== 'object' || Array.isArray(mapping.options)
    || Object.entries(mapping.options).some(([key, protections]) => !key || key.length > 150
      || !Array.isArray(protections) || !protections.length || new Set(protections).size !== protections.length
      || protections.some(p => p !== 'mfa' && p !== 'credential'))) throw new Error('security_mapping_unavailable');
  return mapping;
}

export async function recordMonthlyAccountAuthentication(client: Client, input: {
  enabled?: boolean; subjectUserId: string; proofId: string; rulesVersion?: string; mapping?: SecurityChoiceMapping;
}) {
  if (input.enabled !== true) return { state: 'inactive', reason: 'collection_disabled' };
  if (!input.mapping || !input.rulesVersion) return { state: 'unavailable', reason: 'option_award_mapping_pending' };
  securityChoiceMapping(JSON.stringify(input.mapping));
  const configuration = await loadMonthlyMaintenanceConfiguration(client, input.rulesVersion, true);
  if (!configuration || configuration.rules.version !== input.mapping.maintenanceRulesVersion
    || configuration.rules.capabilities.credential !== 'verified_authentication') {
    return { state: 'unavailable', reason: 'existing_maintenance_capability_unavailable' };
  }
  const proof = (await client.query<{ id: string; user_id: string; credential_id: string; verified_at: Date }>(
    `SELECT id, user_id, credential_id, verified_at FROM identity.account_action_verifications
      WHERE id = $1 AND user_id = $2 AND credential_id = user_id
        AND expires_at = verified_at + interval '5 minutes' AND verified_at <= clock_timestamp()`,
    [input.proofId, input.subjectUserId])).rows[0];
  if (!proof || proof.user_id !== input.subjectUserId || proof.credential_id !== input.subjectUserId) {
    throw new Error('monthly_security_canonical_authentication_required');
  }
  if (proof.verified_at.toISOString() < configuration.collectFrom) return { state: 'unavailable', reason: 'before_collection_cutover' };
  const choice = (await client.query<{ option_key: string; source_kind: string; state: string; credential_id: string | null }>(
    `SELECT option_key, source_kind, state, credential_id FROM trust.member_security_choices
      WHERE subject_user_id = $1 AND effective_at <= $2 ORDER BY revision DESC LIMIT 1`,
    [input.subjectUserId, proof.verified_at])).rows[0];
  if (!choice || choice.source_kind !== 'account_credential' || choice.state !== 'enabled'
    || choice.credential_id !== proof.credential_id || !input.mapping.options[choice.option_key]?.includes('credential')) {
    return { state: 'unavailable', reason: 'selected_protected_credential_unavailable' };
  }
  const facts = { kind: 'authentication', credentialId: proof.credential_id, protections: ['credential'] };
  const existing = (await client.query<{ facts: unknown }>(
    'SELECT facts FROM trust.monthly_maintenance_observations WHERE source_event_id = $1', [proof.id])).rows[0];
  if (existing) {
    const prior = existing.facts as { kind?: unknown; credentialId?: unknown; protections?: unknown };
    if (prior?.kind !== facts.kind || prior.credentialId !== facts.credentialId
      || Object.keys(prior).length !== 3
      || !Array.isArray(prior.protections) || prior.protections.length !== 1 || prior.protections[0] !== 'credential') {
      throw new Error('monthly_maintenance_source_reused');
    }
    return { state: 'recorded', recorded: false };
  }
  const result = await client.query(
    `INSERT INTO trust.monthly_maintenance_observations
      (id, subject_user_id, source_event_id, kind, performed_at, facts)
      VALUES ($1, $2, $1, 'authentication', $3, $4::jsonb) ON CONFLICT (source_event_id) DO NOTHING`,
    [proof.id, proof.user_id, proof.verified_at, JSON.stringify(facts)]);
  return { state: 'recorded', recorded: result.rowCount === 1 };
}

export async function recordMemberSecurityChoice(client: Client, input: {
  enabled?: boolean; id: string; subjectUserId: string; sourceKind: SecurityChoiceChange['sourceKind'];
  optionKey: string; credentialId: string | null; state: SecurityChoiceChange['state'];
}) {
  if (input.enabled !== true) return { state: 'inactive', reason: 'collection_disabled' };
  if (!input.optionKey || input.optionKey.length > 150
    || !['enabled', 'disabled', 'revoked'].includes(input.state)
    || !['device_preference', 'account_credential'].includes(input.sourceKind)
    || input.sourceKind === 'account_credential' && (input.optionKey !== 'email_password' || input.credentialId !== input.subjectUserId)
    || input.sourceKind === 'device_preference' && input.credentialId !== null) throw new Error('monthly_security_choice_invalid');
  const account = await client.query('SELECT id FROM identity.users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [input.subjectUserId]);
  if (account.rowCount !== 1) throw new Error('monthly_security_choice_invalid');
  const existing = (await client.query<{ subject_user_id: string; option_key: string; state: string; source_kind: string; credential_id: string | null }>(
    'SELECT subject_user_id, option_key, state, source_kind, credential_id FROM trust.member_security_choices WHERE id = $1', [input.id])).rows[0];
  if (existing) {
    if (existing.subject_user_id !== input.subjectUserId || existing.option_key !== input.optionKey || existing.state !== input.state
      || existing.source_kind !== input.sourceKind || existing.credential_id !== input.credentialId) throw new Error('monthly_security_source_reused');
    return { state: 'recorded', recorded: false };
  }
  if (input.sourceKind === 'account_credential' && input.state === 'enabled') {
    const credential = await client.query(
      'SELECT user_id FROM identity.email_credentials WHERE user_id = $1 AND user_id = $2 AND verified_at IS NOT NULL FOR SHARE',
      [input.subjectUserId, input.credentialId]);
    if (credential.rowCount !== 1) throw new Error('monthly_security_canonical_credential_required');
  }
  const row = (await client.query<{ revision: string; effective_at: Date }>(
    `INSERT INTO trust.member_security_choices (id, subject_user_id, revision, source_kind, option_key, credential_id, state, effective_at)
      SELECT $1, $2, COALESCE(MAX(revision), 0) + 1, $3, $4, $5, $6, clock_timestamp()
      FROM trust.member_security_choices WHERE subject_user_id = $2 RETURNING revision, effective_at`,
    [input.id, input.subjectUserId, input.sourceKind, input.optionKey, input.credentialId, input.state])).rows[0];
  return { state: 'recorded', recorded: true, revision: Number(row.revision), effectiveAt: row.effective_at.toISOString() };
}

export async function prepareMonthlySecurityEvidence(client: Client, input: {
  enabled?: boolean; subjectUserId: string; sourceMonth: string;
  rulesVersion: string; mapping?: SecurityChoiceMapping;
}) {
  if (input.enabled !== true) return { state: 'inactive', reason: 'collection_disabled', evidence: [] };
  if (!input.mapping) return { state: 'unavailable', reason: 'option_award_mapping_pending', evidence: [] };
  securityChoiceMapping(JSON.stringify(input.mapping));
  const configuration = await loadMonthlyMaintenanceConfiguration(client, input.rulesVersion, true);
  if (!configuration) return { state: 'unavailable', reason: 'existing_maintenance_capability_unavailable', evidence: [] };
  requireSourceMonth(input.sourceMonth);
  const evaluatedAt = (await client.query<{ evaluated_at: Date }>('SELECT clock_timestamp() AS evaluated_at')).rows[0].evaluated_at.toISOString();
  const cutoff = `${nextReputationMonth(input.sourceMonth)}-01T00:00:00.000Z`;
  const rows = (await client.query<{ id: string; subject_user_id: string; revision: string; source_kind: SecurityChoiceChange['sourceKind'];
    option_key: string; credential_id: string | null; state: SecurityChoiceChange['state']; effective_at: Date }>(
    `SELECT id, subject_user_id, revision, source_kind, option_key, credential_id, state, effective_at
      FROM trust.member_security_choices WHERE subject_user_id = $1 AND effective_at < $2
      ORDER BY revision LIMIT 10001`, [input.subjectUserId, cutoff])).rows;
  if (rows.length > 10000) return { state: 'unavailable', reason: 'history_requires_review', evidence: [] };
  const observed = await readMonthlyMaintenanceEvidence(client, input.subjectUserId, cutoff);
  return selectedSecurityMaintenanceEvidence({ ...input, evaluatedAt, policyVersion: MONTHLY_REPUTATION_POLICY_VERSION,
    catalogueHash: MONTHLY_REPUTATION_CATALOGUE_HASH, rules: configuration.rules, collectFrom: configuration.collectFrom,
    changes: rows.map(row => ({ id: row.id, subjectUserId: row.subject_user_id, revision: Number(row.revision),
      sourceKind: row.source_kind, optionKey: row.option_key, credentialId: row.credential_id,
      state: row.state, effectiveAt: row.effective_at.toISOString() })), serverEvidence: observed.evidence });
}
