import type { Client } from 'pg';
import { uuidv7 } from '@lythaus/security';
import { MONTHLY_REPUTATION_POLICY_VERSION } from '../../contracts/src/monthly-reputation-policy.ts';
import { readOwnMonthlyRewardSnapshot } from './monthly-reward-snapshots.ts';

export const MONTHLY_REWARD_SELECTION_FLAG = 'trust.monthly_reward_selections';
export interface MonthlyRewardSelection { familyId: string; variantId: string; slot: number; termsVersion: string }
interface Configuration { version: string; snapshot_rules_version: string; switching_mode: 'blocked_pending_D12' }
interface Revision { id: string; revision: number; selections: MonthlyRewardSelection[]; rules_version: string; request_digest: string }
function requireUuid(value: string) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value))
    throw new Error('monthly_reward_selection_id_invalid');
}
async function configuration(client: Client, version?: string) {
  if (!version) return null;
  if (!(await client.query('SELECT 1 FROM system.feature_flags WHERE flag_key = $1 AND policy_version = $2',
    [MONTHLY_REWARD_SELECTION_FLAG,MONTHLY_REPUTATION_POLICY_VERSION])).rowCount) return null;
  const flags = await client.query<{ enabled: boolean; policy_version: string }>('SELECT * FROM trust.lock_monthly_reward_selection_configuration()');
  if (flags.rowCount !== 3 || flags.rows.some(flag => !flag.enabled || flag.policy_version !== MONTHLY_REPUTATION_POLICY_VERSION)) return null;
  return (await client.query<Configuration>(`SELECT version,snapshot_rules_version,switching_mode FROM trust.monthly_reward_selection_rule_sets
    WHERE version = $1 AND collection_privacy_version = 'monthly-privacy-v1'
      AND approved_by IS NOT NULL AND approved_at <= clock_timestamp() AND approval_reference IS NOT NULL`,[version])).rows[0] ?? null;
}
async function authority(client: Client, subjectId: string, rules: Configuration) {
  requireUuid(subjectId);
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`monthly-reward-member:${subjectId}`]);
  const month = (await client.query<{ month: string }>("SELECT to_char((date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC')-interval '1 month'),'YYYY-MM') AS month")).rows[0].month;
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`monthly-reputation:${subjectId}:${month}`]);
  const member = (await client.query<{ subscription_tier: 'free' | 'premium' | 'black' }>(
    'SELECT subscription_tier FROM trust.lock_monthly_reward_selection_member($1)',[subjectId])).rows[0];
  if (!member) throw new Error('monthly_reward_selection_member_unavailable');
  const snapshot = await readOwnMonthlyRewardSnapshot(client,{subjectId,rulesVersion:rules.snapshot_rules_version});
  const previous = (await client.query<Revision>(`SELECT id,revision,selections,rules_version,request_digest
    FROM trust.monthly_reward_selection_revisions WHERE subject_user_id = $1 ORDER BY revision DESC LIMIT 1`,[subjectId])).rows[0];
  return { member,snapshot,previous };
}
async function requestDigest(value: unknown) {
  const bytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(bytes),byte => byte.toString(16).padStart(2,'0')).join('');
}
export async function selectMonthlyReward(client: Client,input: {
  subjectId: string; variantId: string; termsVersion: string; expectedRevision: number; idempotencyKey: string; rulesVersion?: string;
}) {
  const rules = await configuration(client,input.rulesVersion);
  if (!rules) return { state:'unavailable' as const,reasonCode:'approval_unavailable' };
  for (const value of [input.subjectId,input.variantId,input.idempotencyKey]) requireUuid(value);
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || typeof input.termsVersion !== 'string'
    || input.termsVersion.length < 1 || input.termsVersion.length > 100) throw new Error('monthly_reward_selection_invalid');
  const { member,snapshot,previous } = await authority(client,input.subjectId,rules);
  if (snapshot.state !== 'confirmed') return { state:'pending' as const,reasonCode:'confirmed_month_unavailable' };
  if (member.subscription_tier === 'black') return { state:'not_required' as const,reasonCode:'black_all_eligible' };
  const digest = await requestDigest([input.variantId,input.termsVersion,input.expectedRevision,rules.version]);
  const replay = (await client.query<Revision>(`SELECT id,revision,selections,rules_version,request_digest
    FROM trust.monthly_reward_selection_revisions WHERE subject_user_id = $1 AND idempotency_key = $2`,
  [input.subjectId,input.idempotencyKey])).rows[0];
  if (replay) {
    if (replay.request_digest !== digest) throw new Error('monthly_reward_selection_idempotency_reused');
    return { state:'selected' as const,id:replay.id,revision:replay.revision,selections:replay.selections,created:false };
  }
  if ((previous?.revision ?? 0) !== input.expectedRevision || (previous && previous.rules_version !== rules.version))
    throw new Error('monthly_reward_selection_revision_conflict');
  const variant = (await client.query<{ id: string; family_id: string; required_level: number; terms_version: string }>(
    'SELECT id,family_id,required_level,terms_version FROM trust.lock_monthly_reward_offer($1)',[input.variantId])).rows[0];
  if (!variant || variant.terms_version !== input.termsVersion) throw new Error('monthly_reward_selection_offer_unavailable');
  const maxLevel = Math.min(snapshot.level,member.subscription_tier === 'free' ? 3 : 5);
  if (variant.required_level > maxLevel) throw new Error('monthly_reward_selection_level_unavailable');
  const selections = previous?.selections ?? [];
  if ((member.subscription_tier === 'free' && selections.length > 0)
    || selections.some(item => item.slot === variant.required_level || item.familyId === variant.family_id))
    return { state:'pending' as const,reasonCode:'transition_approval_pending_D12',revision:previous?.revision ?? 0 };
  const chosen = { familyId:variant.family_id,variantId:variant.id,slot:variant.required_level,termsVersion:variant.terms_version };
  const next = [...selections,chosen].sort((left,right) => left.slot-right.slot);
  const id = uuidv7(),revision = (previous?.revision ?? 0)+1,eventId = uuidv7();
  await client.query(`INSERT INTO trust.monthly_reward_selection_revisions
    (id,subject_user_id,revision,supersedes_id,rules_version,snapshot_id,plan_at_creation,selections,idempotency_key,request_digest)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)`,
  [id,input.subjectId,revision,previous?.id ?? null,rules.version,snapshot.snapshotId,member.subscription_tier,
    JSON.stringify(next),input.idempotencyKey,digest]);
  await client.query(`INSERT INTO system.outbox_events (id,event_type,aggregate_type,aggregate_id,actor_id,payload)
    VALUES ($1,'trust.monthly_reward_selection.recorded','monthly_reward_selection',$2,$3,$4::jsonb)`,
  [eventId,id,input.subjectId,JSON.stringify({ selectionId:id,revision,policyVersion:MONTHLY_REPUTATION_POLICY_VERSION })]);
  return { state:'selected' as const,id,revision,selections:next,created:true };
}

export async function readOwnMonthlyRewardSelections(client: Client,input: { subjectId: string; rulesVersion?: string }) {
  const rules = await configuration(client,input.rulesVersion);
  if (!rules) return { state:'unavailable' as const,reasonCode:'approval_unavailable' };
  const { member,snapshot,previous } = await authority(client,input.subjectId,rules);
  const tier = member.subscription_tier;
  const transition = tier === 'free' && (previous?.selections.length ?? 0) > 1;
  const historyPolicyMismatch = !!previous && previous.rules_version !== rules.version;
  const policyMismatch = tier !== 'black' && historyPolicyMismatch;
  const usable = snapshot.state === 'confirmed' && !transition && !policyMismatch;
  const maximumLevel = snapshot.state === 'confirmed' ? Math.min(snapshot.level,tier === 'free' ? 3 : 5) : null;
  const offers = previous ? (await client.query<{ id: string; active: boolean }>(`SELECT offer.id,
    availability.state = 'active' AND offer.approved_at <= clock_timestamp() AND offer.starts_at <= clock_timestamp()
      AND offer.ends_at > clock_timestamp() AS active FROM trust.monthly_reward_offer_versions offer
    JOIN trust.monthly_reward_offer_availability availability ON availability.offer_version_id = offer.id
    WHERE offer.id = ANY($1::uuid[])`,[previous.selections.map(item => item.variantId)])).rows : [];
  return { state:usable ? 'ready' as const : 'pending' as const,
    reasonCode:transition ? 'transition_approval_pending_D12' : policyMismatch ? 'selection_policy_requires_review'
      : snapshot.state !== 'confirmed' ? 'confirmed_month_unavailable' : 'confirmed_month_available',
    effectiveMonth:snapshot.effectiveMonth,profileLevel:snapshot.state === 'confirmed' ? snapshot.level : null,
    rewardMaximumLevel:maximumLevel,subscriptionTier:tier,selectionRequired:tier !== 'black',revision:previous?.revision ?? 0,
    selectionHistoryRequiresReview:historyPolicyMismatch,
    selections:(previous?.selections ?? []).map(item => ({ ...item,
      state:usable && item.slot <= maximumLevel! && offers.some(offer => offer.id === item.variantId && offer.active) ? 'eligible' : 'dormant' })) };
}
