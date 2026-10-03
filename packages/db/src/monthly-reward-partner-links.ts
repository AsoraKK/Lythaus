import type { Client } from 'pg';
import { uuidv7,randomToken,hmacLookup,encryptField,decryptField } from '@lythaus/security';
import { MONTHLY_REPUTATION_POLICY_VERSION } from '../../contracts/src/monthly-reputation-policy.ts';
import { readOwnMonthlyRewardSelections } from './monthly-reward-selections.ts';

export const MONTHLY_REWARD_PARTNER_FLAG = 'trust.monthly_reward_partners';
export interface PartnerLinkKeys { encryptionKey: string; hmacKey: string; keyVersion: string; syntheticFixture?: boolean }
interface Rules { version: string; selection_rules_version: string; adapter_mode: 'disabled' | 'synthetic_fixture'; invitation_seconds: number; lookup_per_minute: number }
interface Identity { email_ciphertext: Buffer; encryption_key_version: string; email_lookup_hmac: Buffer;
  hmac_key_version: string; verified_at_text: string; binding_digest: Buffer; recovery_generation: string }
function requireUuid(value: string) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value))
    throw new Error('monthly_partner_id_invalid');
}
function email(value: string) {
  if (typeof value !== 'string' || value.length > 254 || !/^[^\s@*%]+@[^\s@*%]+\.[^\s@*%]+$/.test(value)) throw new Error('monthly_partner_address_invalid');
  return value.trim().toLowerCase();
}
function customer(value: string) {
  if (typeof value !== 'string' || value.trim().length < 1 || value.length > 200) throw new Error('monthly_partner_customer_invalid');
  return value.trim();
}
const bytes = (value: string) => Buffer.from(value,'base64');
async function keyed(keys: PartnerLinkKeys,value: unknown) {
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(keys.hmacKey),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(JSON.stringify(value))));
}
const scoped = (keys: PartnerLinkKeys,partner: string,kind: string,value: string) => keyed(keys,[partner,kind,value]);
async function digest(value: unknown) {
  const result = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(result),byte => byte.toString(16).padStart(2,'0')).join('');
}
async function configuration(client: Client,version?: string,keys?: PartnerLinkKeys) {
  if (!version || !keys) return null;
  if (!keys.hmacKey || Buffer.from(keys.encryptionKey,'base64').length !== 32 || !keys.keyVersion) throw new Error('monthly_partner_keys_unavailable');
  if (!(await client.query('SELECT 1 FROM system.feature_flags WHERE flag_key = $1 AND policy_version = $2',
    [MONTHLY_REWARD_PARTNER_FLAG,MONTHLY_REPUTATION_POLICY_VERSION])).rowCount) return null;
  const flags = await client.query<{ enabled: boolean; policy_version: string }>('SELECT * FROM trust.lock_monthly_reward_partner_configuration()');
  if (flags.rowCount !== 4 || flags.rows.some(flag => !flag.enabled || flag.policy_version !== MONTHLY_REPUTATION_POLICY_VERSION)) return null;
  const rules = (await client.query<Rules>(`SELECT version,selection_rules_version,adapter_mode,invitation_seconds,lookup_per_minute
    FROM trust.monthly_reward_partner_rule_sets WHERE version = $1 AND collection_privacy_version = 'monthly-privacy-v1'
      AND approved_by IS NOT NULL AND approved_at <= clock_timestamp() AND approval_reference IS NOT NULL`,[version])).rows[0];
  return rules?.adapter_mode === 'synthetic_fixture' && keys.syntheticFixture === true ? rules : null;
}
async function operator(client: Client,partnerId: string,actorId: string,scope: string) {
  requireUuid(partnerId);requireUuid(actorId);
  if (!(await client.query<{ allowed: boolean }>('SELECT trust.lock_monthly_reward_partner_operator($1,$2,$3) AS allowed',
    [partnerId,actorId,scope])).rows[0]?.allowed) throw new Error('monthly_partner_operator_not_allowed');
}
async function lockMembers(client: Client,ids: string[]) {
  const members = [...new Set(ids)].sort();members.forEach(requireUuid);
  await client.query('SELECT trust.lock_monthly_reward_link_members($1::uuid[])',[members]);
}
async function identity(client: Client,subjectId: string,keys: PartnerLinkKeys) {
  requireUuid(subjectId);
  const row = (await client.query<Identity>('SELECT * FROM trust.lock_monthly_reward_link_identity($1)',[subjectId])).rows[0];
  if (!row) throw new Error('monthly_partner_member_unavailable');
  if (row.encryption_key_version !== keys.keyVersion || row.hmac_key_version !== keys.keyVersion) throw new Error('monthly_partner_keys_unavailable');
  const address = email(await decryptField({ciphertext:row.email_ciphertext.toString('utf8'),encryptionKeyVersion:row.encryption_key_version},keys.encryptionKey));
  if (!row.email_lookup_hmac.equals(bytes(hmacLookup(address,keys.hmacKey)))) throw new Error('monthly_partner_identity_unavailable');
  return {...row,address};
}
async function rate(client: Client,partnerId: string,actorId: string,rules: Rules) {
  const count = (await client.query<{ requests: number }>(`INSERT INTO trust.monthly_reward_partner_rate_windows
    (partner_id,operator_id,starts_at,requests) VALUES ($1,$2,date_trunc('minute',clock_timestamp()),1)
    ON CONFLICT (partner_id,operator_id,starts_at) DO UPDATE SET requests = trust.monthly_reward_partner_rate_windows.requests+1 RETURNING requests`,
  [partnerId,actorId])).rows[0].requests;
  if (count > rules.lookup_per_minute) throw new Error('monthly_partner_rate_limited');
}
export async function inviteMonthlyPartnerLink(client: Client,input: {
  partnerId: string; operatorId: string; variantId: string; email: string; customerReference: string;
  idempotencyKey: string; rulesVersion?: string; keys?: PartnerLinkKeys;
}) {
  const rules = await configuration(client,input.rulesVersion,input.keys);
  if (!rules) return { state:'pending' as const,reasonCode:'adapter_or_approval_unavailable' };
  const keys = input.keys!;requireUuid(input.variantId);requireUuid(input.idempotencyKey);
  const address = email(input.email),reference = customer(input.customerReference);
  await lockMembers(client,[input.operatorId]);
  await operator(client,input.partnerId,input.operatorId,'link:invite');
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
    [`monthly-partner-invite:${input.partnerId}:${input.operatorId}:${input.idempotencyKey}`]);
  const emailFingerprint = await scoped(keys,input.partnerId,'email',address),customerFingerprint = await scoped(keys,input.partnerId,'customer',reference);
  const requestDigest = await digest([input.partnerId,input.variantId,emailFingerprint.toString('hex'),customerFingerprint.toString('hex'),rules.version]);
  const replay = (await client.query<{ id: string; token_ciphertext: Buffer; encryption_key_version: string; request_digest: string; expires_at: Date }>(
    `SELECT id,token_ciphertext,encryption_key_version,request_digest,expires_at FROM trust.monthly_reward_link_invitations
    WHERE partner_id = $1 AND operator_id = $2 AND idempotency_key = $3`,[input.partnerId,input.operatorId,input.idempotencyKey])).rows[0];
  if (replay) {
    if (replay.request_digest !== requestDigest) throw new Error('monthly_partner_idempotency_reused');
    if (replay.encryption_key_version !== keys.keyVersion) throw new Error('monthly_partner_keys_unavailable');
    const token = await decryptField({ciphertext:replay.token_ciphertext.toString('utf8'),encryptionKeyVersion:keys.keyVersion},keys.encryptionKey);
    return { state:'invited' as const,id:replay.id,token,expiresAt:replay.expires_at.toISOString(),created:false };
  }
  await rate(client,input.partnerId,input.operatorId,rules);
  const offer = (await client.query<{ partner_id: string }>('SELECT partner_id FROM trust.monthly_reward_offer_versions WHERE id = $1',[input.variantId])).rows[0];
  if (offer?.partner_id !== input.partnerId || !(await client.query('SELECT id FROM trust.lock_monthly_reward_offer($1)',[input.variantId])).rowCount)
    throw new Error('monthly_partner_offer_unavailable');
  const id = uuidv7(),token = randomToken(32),encrypted = await encryptField(token,keys.encryptionKey,keys.keyVersion);
  const row = (await client.query<{ expires_at: Date }>(`INSERT INTO trust.monthly_reward_link_invitations
    (id,partner_id,operator_id,offer_version_id,email_partner_hmac,recipient_identity_hmac,recipient_hmac_key_version,customer_partner_hmac,token_hmac,token_ciphertext,
      encryption_key_version,rules_version,idempotency_key,request_digest,expires_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,convert_to($10,'utf8'),$11,$12,$13,$14,clock_timestamp()+$15*interval '1 second') RETURNING expires_at`,
  [id,input.partnerId,input.operatorId,input.variantId,emailFingerprint,bytes(hmacLookup(address,keys.hmacKey)),keys.keyVersion,customerFingerprint,
    await keyed(keys,['invitation',token]),encrypted.ciphertext,keys.keyVersion,rules.version,input.idempotencyKey,requestDigest,rules.invitation_seconds])).rows[0];
  return { state:'invited' as const,id,token,expiresAt:row.expires_at.toISOString(),created:true };
}

export async function consentToMonthlyPartnerLink(client: Client,input: {
  subjectId: string; invitationToken: string; termsVersion: string; expectedRevision: number;
  idempotencyKey: string; rulesVersion?: string; keys?: PartnerLinkKeys;
}) {
  const rules = await configuration(client,input.rulesVersion,input.keys);
  if (!rules) return { state:'pending' as const,reasonCode:'adapter_or_approval_unavailable' };
  const keys = input.keys!;requireUuid(input.idempotencyKey);
  if (typeof input.invitationToken !== 'string' || input.invitationToken.length < 32 || input.invitationToken.length > 100
    || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw new Error('monthly_partner_consent_invalid');
  const tokenHash = await keyed(keys,['invitation',input.invitationToken]);
  const invitation = (await client.query<{ id: string; partner_id: string; operator_id: string; offer_version_id: string;
    email_partner_hmac: Buffer; customer_partner_hmac: Buffer; family_id: string; terms_version: string }>(
    `SELECT invitation.*,offer.family_id,offer.terms_version FROM trust.monthly_reward_link_invitations invitation
    JOIN trust.monthly_reward_offer_versions offer ON offer.id = invitation.offer_version_id
    WHERE invitation.token_hmac = $1 AND invitation.rules_version = $2`,[tokenHash,rules.version])).rows[0];
  if (!invitation) throw new Error('monthly_partner_invitation_unavailable');
  await lockMembers(client,[input.subjectId,invitation.operator_id]);
  const who = await identity(client,input.subjectId,keys);
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`monthly-partner-consent:${input.subjectId}:${input.idempotencyKey}`]);
  const requestDigest = await digest([tokenHash.toString('hex'),input.termsVersion,input.expectedRevision,rules.version]);
  const replay = (await client.query<{ id: string; binding_id: string; revision: number; request_digest: string;
    email_binding_digest: Buffer; verified_at_text: string; recovery_generation: string }>(
    `SELECT id,binding_id,revision,request_digest,email_binding_digest,recovery_generation,
      to_char(verified_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS verified_at_text
    FROM trust.monthly_reward_partner_consents WHERE subject_user_id = $1 AND idempotency_key = $2`,
  [input.subjectId,input.idempotencyKey])).rows[0];
  if (replay) {
    if (replay.request_digest !== requestDigest) throw new Error('monthly_partner_idempotency_reused');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`monthly-partner-binding-id:${replay.binding_id}`]);
    let state: 'linked' | 'revoked' | 'superseded' | 'pending' = 'linked';
    if ((await client.query('SELECT 1 FROM trust.monthly_reward_consent_revocations WHERE consent_id = $1',[replay.id])).rowCount) state = 'revoked';
    else if ((await client.query('SELECT 1 FROM trust.monthly_reward_partner_consents WHERE binding_id = $1 AND revision > $2',[replay.binding_id,replay.revision])).rowCount) state = 'superseded';
    else if (!who.binding_digest.equals(replay.email_binding_digest) || who.verified_at_text !== replay.verified_at_text || who.recovery_generation !== replay.recovery_generation) state = 'pending';
    return { state,id:replay.id,revision:replay.revision,created:false };
  }
  if (invitation.terms_version !== input.termsVersion
    || !invitation.email_partner_hmac.equals(await scoped(keys,invitation.partner_id,'email',who.address))) throw new Error('monthly_partner_invitation_unavailable');
  if ((await client.query('SELECT 1 FROM trust.monthly_reward_partner_consents WHERE invitation_id = $1',[invitation.id])).rowCount)
    throw new Error('monthly_partner_invitation_unavailable');
  await operator(client,invitation.partner_id,invitation.operator_id,'link:invite');
  if (!(await client.query('SELECT id FROM trust.lock_monthly_reward_offer($1)',[invitation.offer_version_id])).rowCount)
    throw new Error('monthly_partner_offer_unavailable');
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
    [`monthly-partner-binding:${invitation.partner_id}:${invitation.family_id}:${invitation.customer_partner_hmac.toString('hex')}`]);
  let binding = (await client.query<{ id: string; subject_user_id: string }>(`SELECT id,subject_user_id FROM trust.monthly_reward_customer_bindings
    WHERE partner_id = $1 AND family_id = $2 AND customer_partner_hmac = $3`,
  [invitation.partner_id,invitation.family_id,invitation.customer_partner_hmac])).rows[0];
  if (binding && binding.subject_user_id !== input.subjectId) throw new Error('monthly_partner_invitation_unavailable');
  if (binding) await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`monthly-partner-binding-id:${binding.id}`]);
  const previous = binding ? (await client.query<{ id: string; revision: number }>(
    'SELECT id,revision FROM trust.monthly_reward_partner_consents WHERE binding_id = $1 ORDER BY revision DESC LIMIT 1',[binding.id])).rows[0] : undefined;
  if ((previous?.revision ?? 0) !== input.expectedRevision) throw new Error('monthly_partner_consent_revision_conflict');
  if (!binding) {
    binding = {id:uuidv7(),subject_user_id:input.subjectId};
    await client.query(`INSERT INTO trust.monthly_reward_customer_bindings (id,subject_user_id,partner_id,family_id,customer_partner_hmac,invitation_id)
      VALUES ($1,$2,$3,$4,$5,$6)`,[binding.id,input.subjectId,invitation.partner_id,invitation.family_id,invitation.customer_partner_hmac,invitation.id]);
  }
  const id = uuidv7(),revision = (previous?.revision ?? 0)+1;
  if (!(await client.query('SELECT 1 FROM trust.monthly_reward_link_invitations WHERE id = $1 AND expires_at > clock_timestamp()',[invitation.id])).rowCount)
    throw new Error('monthly_partner_invitation_unavailable');
  await client.query(`INSERT INTO trust.monthly_reward_partner_consents
    (id,binding_id,subject_user_id,revision,supersedes_id,invitation_id,offer_version_id,terms_version,email_partner_hmac,
      email_binding_digest,verified_at,recovery_generation,rules_version,idempotency_key,request_digest)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
  [id,binding.id,input.subjectId,revision,previous?.id ?? null,invitation.id,invitation.offer_version_id,input.termsVersion,
    invitation.email_partner_hmac,who.binding_digest,who.verified_at_text,who.recovery_generation,rules.version,input.idempotencyKey,requestDigest]);
  return { state:'linked' as const,id,revision,created:true };
}

export async function revokeMonthlyPartnerConsent(client: Client,input: { subjectId: string; consentId: string; idempotencyKey: string; rulesVersion?: string; keys?: PartnerLinkKeys }) {
  if (!(await client.query('SELECT 1 FROM system.feature_flags WHERE flag_key = $1 AND policy_version = $2',
    [MONTHLY_REWARD_PARTNER_FLAG,MONTHLY_REPUTATION_POLICY_VERSION])).rowCount)
    return { state:'pending' as const,reasonCode:'approval_unavailable' };
  for (const value of [input.subjectId,input.consentId,input.idempotencyKey]) requireUuid(value);
  await lockMembers(client,[input.subjectId]);
  if (!(await client.query<{ allowed: boolean }>('SELECT trust.lock_monthly_reward_subject($1) AS allowed',[input.subjectId])).rows[0]?.allowed)
    throw new Error('monthly_partner_member_unavailable');
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`monthly-partner-revoke:${input.subjectId}:${input.idempotencyKey}`]);
  const consent = (await client.query<{ binding_id: string }>('SELECT binding_id FROM trust.monthly_reward_partner_consents WHERE id = $1 AND subject_user_id = $2',
    [input.consentId,input.subjectId])).rows[0];
  if (!consent) throw new Error('monthly_partner_consent_unavailable');
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`monthly-partner-binding-id:${consent.binding_id}`]);
  const reused = (await client.query<{ consent_id: string }>('SELECT consent_id FROM trust.monthly_reward_consent_revocations WHERE subject_user_id = $1 AND idempotency_key = $2',
    [input.subjectId,input.idempotencyKey])).rows[0];
  if (reused && reused.consent_id !== input.consentId) throw new Error('monthly_partner_idempotency_reused');
  const latest = (await client.query<{ id: string }>('SELECT id FROM trust.monthly_reward_partner_consents WHERE binding_id = $1 ORDER BY revision DESC LIMIT 1',[consent.binding_id])).rows[0];
  if (latest?.id !== input.consentId && !(await client.query('SELECT 1 FROM trust.monthly_reward_consent_revocations WHERE consent_id = $1',[input.consentId])).rowCount)
    throw new Error('monthly_partner_consent_revision_conflict');
  const inserted = await client.query(`INSERT INTO trust.monthly_reward_consent_revocations (consent_id,subject_user_id,idempotency_key)
    VALUES ($1,$2,$3) ON CONFLICT (consent_id,idempotency_key) DO NOTHING`,[input.consentId,input.subjectId,input.idempotencyKey]);
  return { state:'revoked' as const,created:inserted.rowCount === 1 };
}

export async function lookupMonthlyPartnerEligibility(client: Client,input: {
  partnerId: string; operatorId: string; variantId: string; email: string; customerReference: string; rulesVersion?: string; keys?: PartnerLinkKeys;
}) {
  const rules = await configuration(client,input.rulesVersion,input.keys);
  if (!rules) return { state:'pending' as const,reasonCode:'adapter_or_approval_unavailable' };
  const keys = input.keys!;requireUuid(input.variantId);
  const address = email(input.email),reference = customer(input.customerReference);
  requireUuid(input.partnerId);requireUuid(input.operatorId);
  if (!(await client.query<{ allowed: boolean }>('SELECT trust.check_monthly_reward_partner_operator($1,$2,$3) AS allowed',
    [input.partnerId,input.operatorId,'eligibility:read'])).rows[0]?.allowed) throw new Error('monthly_partner_operator_not_allowed');
  const link = (await client.query<{ id: string; binding_id: string; subject_user_id: string; email_binding_digest: Buffer;
    verified_at_text: string; recovery_generation: string; terms_version: string }>(
    `SELECT consent.*,to_char(consent.verified_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS verified_at_text
    FROM trust.monthly_reward_customer_bindings binding JOIN trust.monthly_reward_partner_consents consent ON consent.binding_id = binding.id
    JOIN trust.monthly_reward_offer_versions offer ON offer.id = consent.offer_version_id
    WHERE binding.partner_id = $1 AND binding.customer_partner_hmac = $2 AND consent.email_partner_hmac = $3
      AND consent.offer_version_id = $4 AND offer.partner_id = $1 AND consent.rules_version = $5
      AND consent.revision = (SELECT max(revision) FROM trust.monthly_reward_partner_consents WHERE binding_id = binding.id)
      AND NOT EXISTS (SELECT 1 FROM trust.monthly_reward_consent_revocations revoked WHERE revoked.consent_id = consent.id)`,
  [input.partnerId,await scoped(keys,input.partnerId,'customer',reference),await scoped(keys,input.partnerId,'email',address),input.variantId,rules.version])).rows[0];
  await lockMembers(client,link ? [input.operatorId,link.subject_user_id] : [input.operatorId]);
  await operator(client,input.partnerId,input.operatorId,'eligibility:read');await rate(client,input.partnerId,input.operatorId,rules);
  if (!link) return { state:'unknown' as const };
  let current;
  try { current = await readOwnMonthlyRewardSelections(client,{subjectId:link.subject_user_id,rulesVersion:rules.selection_rules_version}); } catch (error) {
    if (error instanceof Error && error.message === 'monthly_reward_selection_member_unavailable') return { state:'unknown' as const };
    throw error;
  }
  let who;
  try { who = await identity(client,link.subject_user_id,keys); } catch (error) {
    if (error instanceof Error && error.message === 'monthly_partner_member_unavailable') return { state:'unknown' as const };
    throw error;
  }
  if (who.address !== address || !who.binding_digest.equals(link.email_binding_digest)
    || who.verified_at_text !== link.verified_at_text || who.recovery_generation !== link.recovery_generation) return { state:'unknown' as const };
  const offer = (await client.query<{ required_level: number; terms_version: string }>('SELECT required_level,terms_version FROM trust.lock_monthly_reward_offer($1)',[input.variantId])).rows[0];
  if (!offer || offer.terms_version !== link.terms_version) return { state:'unknown' as const };
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`monthly-partner-binding-id:${link.binding_id}`]);
  if ((await client.query(`SELECT 1 FROM trust.monthly_reward_consent_revocations WHERE consent_id = $1
      UNION ALL SELECT 1 FROM trust.monthly_reward_partner_consents WHERE binding_id = $2 AND revision >
        (SELECT revision FROM trust.monthly_reward_partner_consents WHERE id = $1)`,[link.id,link.binding_id])).rowCount)
    return { state:'unknown' as const };
  if (current.state !== 'ready') return { state:'pending' as const,reasonCode:'monthly_authority_unavailable' };
  if (offer.required_level > current.rewardMaximumLevel!
    || (current.selectionRequired && !current.selections.some(item => item.variantId === input.variantId && item.state === 'eligible')))
    return { state:'unknown' as const };
  return { state:'eligible' as const,linkedEmail:who.address,effectiveRewardLevel:current.rewardMaximumLevel,
    effectiveMonth:current.effectiveMonth,offerVersionId:input.variantId };
}
