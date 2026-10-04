import type { Client } from 'pg';
import { uuidv7,randomToken,encryptField,decryptField } from '@lythaus/security';
import type { PartnerLinkKeys } from './monthly-reward-partner-links.ts';
import { MONTHLY_REPUTATION_POLICY_VERSION } from '../../contracts/src/monthly-reputation-policy.ts';

interface Rules { version: string; partner_rules_version: string; qr_validity_seconds: number; lookup_per_minute: number }
interface Authority { snapshot_id: string | null; effective_month: Date; effective_level: number | null;
  partner_id: string; binding_id: string; family_id: string; terms_version: string }
interface Fulfilment { id: string; effective_month: Date; effective_reward_level: number; offer_version_id: string }
function uuid(value: string) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) throw new Error('monthly_claim_id_invalid');
}
async function hash(value: unknown) {
  const bytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));
  return Buffer.from(bytes).toString('hex');
}
async function tokenHash(keys: PartnerLinkKeys,token: string) {
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(keys.hmacKey),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(JSON.stringify(['monthly-reward-qr',token]))));
}
async function configuration(client: Client,version?: string,keys?: PartnerLinkKeys) {
  if (!version || !keys || keys.syntheticFixture !== true) return null;
  if (!keys.hmacKey || Buffer.from(keys.encryptionKey,'base64').length !== 32 || !keys.keyVersion) throw new Error('monthly_claim_keys_unavailable');
  if (!(await client.query('SELECT 1 FROM system.feature_flags WHERE flag_key = $1 AND policy_version = $2',
    ['trust.monthly_reward_partners',MONTHLY_REPUTATION_POLICY_VERSION])).rowCount) return null;
  const flags = await client.query<{ enabled: boolean; policy_version: string }>('SELECT * FROM trust.lock_monthly_reward_partner_configuration()');
  if (flags.rowCount !== 4 || flags.rows.some(flag => !flag.enabled || flag.policy_version !== MONTHLY_REPUTATION_POLICY_VERSION)) return null;
  return (await client.query<Rules>(`SELECT cfg.version,cfg.partner_rules_version,cfg.qr_validity_seconds,partner.lookup_per_minute
    FROM trust.monthly_reward_claim_rule_sets cfg JOIN trust.monthly_reward_partner_rule_sets partner ON partner.version = cfg.partner_rules_version
    WHERE cfg.version = $1 AND cfg.adapter_mode = 'synthetic_fixture' AND cfg.collection_privacy_version = 'monthly-privacy-v1'
      AND cfg.approved_by IS NOT NULL AND cfg.approved_at <= clock_timestamp() AND cfg.approval_reference IS NOT NULL
      AND partner.adapter_mode = 'synthetic_fixture' AND partner.collection_privacy_version = 'monthly-privacy-v1'
      AND partner.approved_by IS NOT NULL AND partner.approved_at <= clock_timestamp() AND partner.approval_reference IS NOT NULL`,[version])).rows[0] ?? null;
}
const pending = () => ({state:'pending' as const,reasonCode:'adapter_or_authority_unavailable'});
const unknown = () => ({state:'unknown' as const});
async function authority(client: Client,subjectId: string,consentId: string,variantId: string,actorId: string,rulesVersion: string) {
  return (await client.query<Authority>('SELECT * FROM trust.authorize_monthly_reward_claim($1,$2,$3,$4,$5)',
    [subjectId,consentId,variantId,actorId,rulesVersion])).rows[0];
}
export async function issueMonthlyRewardQr(client: Client,input: {
  subjectId: string; consentId: string; variantId: string; idempotencyKey: string; rulesVersion?: string; keys?: PartnerLinkKeys;
}) {
  const rules = await configuration(client,input.rulesVersion,input.keys);if (!rules) return pending();
  for (const value of [input.subjectId,input.consentId,input.variantId,input.idempotencyKey]) uuid(value);
  const allowed = await authority(client,input.subjectId,input.consentId,input.variantId,input.subjectId,rules.version);
  if (!allowed) return unknown();if (!allowed.snapshot_id) return pending();
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`monthly-qr-issue:${input.subjectId}:${input.idempotencyKey}`]);
  const requestDigest = await hash([input.consentId,input.variantId,rules.version]);
  const replay = (await client.query<{ id: string; request_digest: string; token_ciphertext: Buffer; encryption_key_version: string; expires_at: Date; expired: boolean; consumed: boolean }>(
    `SELECT reservation.*,reservation.expires_at <= clock_timestamp() AS expired,
      EXISTS (SELECT 1 FROM trust.monthly_reward_fulfilments WHERE qr_reservation_id = reservation.id) AS consumed
    FROM trust.monthly_reward_qr_reservations reservation WHERE subject_user_id = $1 AND idempotency_key = $2`,
  [input.subjectId,input.idempotencyKey])).rows[0];
  if (replay) {
    if (replay.request_digest !== requestDigest) throw new Error('monthly_claim_idempotency_reused');
    if (replay.consumed || replay.expired) return {state:replay.consumed ? 'consumed' as const : 'expired' as const,id:replay.id,created:false};
    if (replay.encryption_key_version !== input.keys!.keyVersion) return pending();
    return {state:'issued' as const,id:replay.id,token:await decryptField({ciphertext:replay.token_ciphertext.toString('utf8'),encryptionKeyVersion:replay.encryption_key_version},input.keys!.encryptionKey),
      expiresAt:replay.expires_at.toISOString(),created:false};
  }
  if (!(await client.query('SELECT 1 FROM trust.monthly_reward_fulfilment_terms WHERE offer_version_id = $1 AND approved_at <= clock_timestamp()',[input.variantId])).rowCount) return pending();
  const id = uuidv7(),token = randomToken(32),encrypted = await encryptField(token,input.keys!.encryptionKey,input.keys!.keyVersion);
  const row = (await client.query<{ expires_at: Date }>(`INSERT INTO trust.monthly_reward_qr_reservations
    (id,subject_user_id,consent_id,offer_version_id,snapshot_id,token_hmac,token_ciphertext,encryption_key_version,rules_version,idempotency_key,request_digest,expires_at)
    VALUES ($1,$2,$3,$4,$5,$6,convert_to($7,'utf8'),$8,$9,$10,$11,clock_timestamp()) RETURNING expires_at`,
  [id,input.subjectId,input.consentId,input.variantId,allowed.snapshot_id,await tokenHash(input.keys!,token),encrypted.ciphertext,input.keys!.keyVersion,rules.version,input.idempotencyKey,requestDigest])).rows[0];
  return {state:'issued' as const,id,token,expiresAt:row.expires_at.toISOString(),created:true};
}
function result(row: Fulfilment,created: boolean) {
  return {state:'fulfilled' as const,id:row.id,effectiveMonth:row.effective_month.toISOString().slice(0,7),effectiveRewardLevel:row.effective_reward_level,
    offerVersionId:row.offer_version_id,created};
}
export async function fulfilMonthlyReward(client: Client,input: {
  partnerId: string; operatorId: string; variantId: string; idempotencyKey: string;
  qrToken?: string; invoiceEvidenceId?: string; rulesVersion?: string; keys?: PartnerLinkKeys;
}) {
  const rules = await configuration(client,input.rulesVersion,input.keys);if (!rules) return pending();
  for (const value of [input.partnerId,input.operatorId,input.variantId,input.idempotencyKey]) uuid(value);
  if ((typeof input.qrToken === 'string') === (typeof input.invoiceEvidenceId === 'string')) throw new Error('monthly_claim_source_invalid');
  if (input.qrToken !== undefined && (input.qrToken.length < 32 || input.qrToken.length > 100)) throw new Error('monthly_claim_source_invalid');
  if (input.invoiceEvidenceId !== undefined) uuid(input.invoiceEvidenceId);
  if (!(await client.query<{ allowed: boolean }>('SELECT trust.check_monthly_reward_partner_operator($1,$2,$3) AS allowed',
    [input.partnerId,input.operatorId,'claim:consume'])).rows[0]?.allowed) throw new Error('monthly_claim_operator_not_allowed');
  const fingerprint = input.qrToken !== undefined ? await tokenHash(input.keys!,input.qrToken) : null;
  const source = input.qrToken !== undefined
    ? (await client.query<{ id: string; subject_user_id: string; consent_id: string; expired: boolean }>(
      `SELECT reservation.id,reservation.subject_user_id,reservation.consent_id,reservation.expires_at <= clock_timestamp() AS expired
      FROM trust.monthly_reward_qr_reservations reservation JOIN trust.monthly_reward_offer_versions offer ON offer.id = reservation.offer_version_id
      WHERE reservation.token_hmac = $1 AND reservation.offer_version_id = $2 AND offer.partner_id = $3 AND reservation.rules_version = $4`,
      [fingerprint,input.variantId,input.partnerId,rules.version])).rows[0]
    : (await client.query<{ id: string; subject_user_id: string; consent_id: string; invoice_period_hmac: Buffer; renewal_at: Date; current_period: boolean }>(
      `SELECT invoice.id,invoice.subject_user_id,invoice.consent_id,invoice.invoice_period_hmac,invoice.renewal_at,
        date_trunc('month',invoice.renewal_at AT TIME ZONE 'UTC') = date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC') AND invoice.renewal_at <= clock_timestamp() AS current_period
      FROM trust.monthly_reward_invoice_evidence invoice JOIN trust.monthly_reward_offer_versions offer ON offer.id = invoice.offer_version_id
      WHERE invoice.id = $1 AND invoice.offer_version_id = $2 AND offer.partner_id = $3 AND invoice.rules_version = $4`,
      [input.invoiceEvidenceId,input.variantId,input.partnerId,rules.version])).rows[0];
  await client.query('SELECT trust.lock_monthly_reward_link_members($1::uuid[])',[source ? [input.operatorId,source.subject_user_id] : [input.operatorId]]);
  if (!(await client.query<{ allowed: boolean }>('SELECT trust.lock_monthly_reward_partner_operator($1,$2,$3) AS allowed',
    [input.partnerId,input.operatorId,'claim:consume'])).rows[0]?.allowed) throw new Error('monthly_claim_operator_not_allowed');
  const requests = (await client.query<{ requests: number }>(`INSERT INTO trust.monthly_reward_partner_rate_windows (partner_id,operator_id,starts_at,requests)
    VALUES ($1,$2,date_trunc('minute',clock_timestamp()),1) ON CONFLICT (partner_id,operator_id,starts_at)
    DO UPDATE SET requests = trust.monthly_reward_partner_rate_windows.requests+1 RETURNING requests`,[input.partnerId,input.operatorId])).rows[0].requests;
  if (requests > rules.lookup_per_minute) throw new Error('monthly_claim_rate_limited');
  if (!source) return unknown();
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`monthly-claim-command:${input.partnerId}:${input.operatorId}:${input.idempotencyKey}`]);
  const sourceFingerprint = fingerprint?.toString('hex') ?? ('invoice_period_hmac' in source ? source.invoice_period_hmac.toString('hex') : '');
  const sourceKind = input.qrToken !== undefined ? 'qr' : 'invoice';
  const requestDigest = await hash([input.variantId,sourceFingerprint,rules.version,source.subject_user_id,source.consent_id,sourceKind]);
  const command = (await client.query<Fulfilment & {request_digest: string}>(`SELECT fulfilled.*,command.request_digest
    FROM trust.monthly_reward_fulfilment_commands command JOIN trust.monthly_reward_fulfilments fulfilled ON fulfilled.id = command.fulfilment_id
    WHERE command.partner_id = $1 AND command.operator_id = $2 AND command.idempotency_key = $3`,[input.partnerId,input.operatorId,input.idempotencyKey])).rows[0];
  if (command) {
    if (command.request_digest !== requestDigest) throw new Error('monthly_claim_idempotency_reused');
    return result(command,false);
  }
  const natural = (await client.query<Fulfilment>(`SELECT fulfilled.* FROM trust.monthly_reward_fulfilments fulfilled
    JOIN trust.monthly_reward_partner_consents consent ON consent.id = $3
    WHERE fulfilled.partner_id = $1 AND ((fulfilled.qr_reservation_id = $2) OR
      (fulfilled.binding_id = consent.binding_id AND fulfilled.family_id = (SELECT family_id FROM trust.monthly_reward_offer_versions WHERE id = $4)
        AND fulfilled.invoice_period_hmac = $5))`,
  [input.partnerId,input.qrToken !== undefined ? source.id : null,source.consent_id,input.variantId,'invoice_period_hmac' in source ? source.invoice_period_hmac : null])).rows[0];
  if (natural) {
    await client.query(`INSERT INTO trust.monthly_reward_fulfilment_commands (partner_id,operator_id,idempotency_key,qr_reservation_id,invoice_evidence_id,request_digest,fulfilment_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`,[input.partnerId,input.operatorId,input.idempotencyKey,input.qrToken !== undefined ? source.id : null,
        input.invoiceEvidenceId !== undefined ? source.id : null,requestDigest,natural.id]);
    return result(natural,false);
  }
  if (('expired' in source && source.expired) || ('current_period' in source && !source.current_period)) return unknown();
  const allowed = await authority(client,source.subject_user_id,source.consent_id,input.variantId,input.operatorId,rules.version);
  if (!allowed || allowed.partner_id !== input.partnerId) return unknown();if (!allowed.snapshot_id) return pending();
  if (!(await client.query('SELECT 1 FROM trust.monthly_reward_fulfilment_terms WHERE offer_version_id = $1 AND approved_at <= clock_timestamp()',[input.variantId])).rowCount) return pending();
  const id = uuidv7();
  const row = (await client.query<Fulfilment>(`INSERT INTO trust.monthly_reward_fulfilments
    (id,subject_user_id,partner_id,operator_id,binding_id,consent_id,family_id,offer_version_id,terms_version,snapshot_id,
      effective_month,effective_reward_level,qr_reservation_id,invoice_evidence_id,invoice_period_hmac,rules_version)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
  [id,source.subject_user_id,input.partnerId,input.operatorId,allowed.binding_id,source.consent_id,allowed.family_id,input.variantId,
    allowed.terms_version,allowed.snapshot_id,allowed.effective_month,allowed.effective_level,input.qrToken !== undefined ? source.id : null,
    input.invoiceEvidenceId !== undefined ? source.id : null,'invoice_period_hmac' in source ? source.invoice_period_hmac : null,rules.version])).rows[0];
  await client.query(`INSERT INTO trust.monthly_reward_fulfilment_commands (partner_id,operator_id,idempotency_key,qr_reservation_id,invoice_evidence_id,request_digest,fulfilment_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7)`,[input.partnerId,input.operatorId,input.idempotencyKey,input.qrToken !== undefined ? source.id : null,
      input.invoiceEvidenceId !== undefined ? source.id : null,requestDigest,id]);
  await client.query(`INSERT INTO system.outbox_events (id,event_type,aggregate_type,aggregate_id,actor_id,payload)
    VALUES ($1,'trust.monthly_reward_fulfilled','monthly_reward_fulfilment',$2,$3,$4::jsonb)`,
  [uuidv7(),id,source.subject_user_id,JSON.stringify({fulfilmentId:id,policyVersion:MONTHLY_REPUTATION_POLICY_VERSION})]);
  return result(row,true);
}
