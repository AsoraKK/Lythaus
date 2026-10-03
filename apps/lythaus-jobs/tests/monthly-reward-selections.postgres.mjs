import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { before,after,test } from 'node:test';
import pg from 'pg';
import { uuidv7 } from '@lythaus/security';
import { MONTHLY_REPUTATION_POLICY_VERSION as policy,MONTHLY_REPUTATION_CATALOGUE_HASH as hash } from '@lythaus/contracts';
import { PROPOSED_WEEKLY_EARNING_RULES as weekly } from '../../../packages/contracts/src/monthly-earning-policy.ts';
import { PROPOSED_MONTHLY_MAINTENANCE_RULES as defaults } from '../../../packages/contracts/src/monthly-maintenance-policy.ts';
import { proposedClosingSundayWeeks,MONTHLY_REPUTATION_DECISIONS as decisions } from '../../../packages/contracts/src/monthly-reputation-decisions.ts';
import { assembleMonthlyReputation } from '../../../packages/db/src/monthly-assembly.ts';
import { assessMonthlyReputationSource } from '../../../packages/db/src/monthly-reputation.ts';
import { publishMonthlyRewardSnapshot,approveMonthlyRewardSnapshotCorrection,applyMonthlyRewardSnapshotCorrection } from '../../../packages/db/src/monthly-reward-snapshots.ts';
import { selectMonthlyReward,readOwnMonthlyRewardSelections,MONTHLY_REWARD_SELECTION_FLAG as flag } from '../../../packages/db/src/monthly-reward-selections.ts';

const connectionString=process.env.PLANETSCALE_PG17_TEST_DATABASE_URL,target=new URL(connectionString??'file:///missing');
if(!['127.0.0.1','localhost'].includes(target.hostname)
  ||!(target.pathname==='/lythaus_monthly_test'||(process.env.GITHUB_ACTIONS==='true'&&target.pathname==='/postgres')))
  throw new Error('Selection tests require explicitly local disposable PostgreSQL');
const subjects=[],grants=[],statements=[];
const rulesVersion='synthetic-selection-v1',snapshotVersion='synthetic-selection-snapshot-v1';
const maintenance={...defaults,version:'synthetic-selection-maintenance-v1',monthSettlementHours:1};
let reviewer,sourceMonth,currentMonth,free,premium,black,variants=[];
async function tx(work,role='lythaus_runtime'){
  const client=new pg.Client({connectionString,ssl:false});await client.connect();
  try{await client.query('BEGIN');await client.query("SET LOCAL statement_timeout='10s'");
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    if(role){assert.ok(['lythaus_runtime','lythaus_jobs','lythaus_admin'].includes(role));await client.query(`SET LOCAL ROLE ${role}`);}
    const result=await work({query:(text,values)=>{statements.push(text);return client.query(text,values);}});
    await client.query('COMMIT');return result;
  }catch(error){await client.query('ROLLBACK');throw error;}finally{await client.end();}
}
const sql=(text,values)=>tx(client=>client.query(text,values),null);
async function person(tier='free',verified=true){
  const id=uuidv7();subjects.push(id);
  await sql("INSERT INTO identity.users (id,display_name,created_at) VALUES ($1,'Synthetic reward selection','2026-07-01')",[id]);
  if(verified)await sql(`INSERT INTO identity.email_credentials
    (user_id,email_ciphertext,email_lookup_hmac,encryption_key_version,hmac_key_version,password_hash,verified_at)
    VALUES ($1,$2,$3,'synthetic-only','synthetic-only','{}'::jsonb,'2026-07-01')`,[id,randomBytes(32),randomBytes(32)]);
  if(tier!=='free')await sql('INSERT INTO identity.user_entitlements (user_id,subscription_tier) VALUES ($1,$2)',[id,tier]);
  return id;
}
async function snapshot(subjectId,score=10000,month=sourceMonth){
  let remaining=score;
  for(const period of proposedClosingSundayWeeks(month)){
    const old=(await sql(`SELECT week_id,revision FROM trust.monthly_earning_week_revisions
      WHERE subject_user_id=$1 AND week_start=$2 ORDER BY revision DESC LIMIT 1`,[subjectId,period.startsAt])).rows[0];
    if(remaining===0&&!old)break;
    const points=Math.min(2500,remaining);remaining-=points;
    await tx(client=>client.query(`INSERT INTO trust.monthly_earning_week_revisions
      (id,week_id,subject_user_id,week_start,policy_version,rules_version,revision,state,points,calculation,input_digest)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`,
      [uuidv7(),old?.week_id??uuidv7(),subjectId,period.startsAt,policy,weekly.version,(old?.revision??0)+1,old?'corrected':'locked',points,
        JSON.stringify({policyVersion:policy,rulesVersion:weekly.version,points,fixture:'synthetic settled provider totals'}),'a'.repeat(64)]),'lythaus_jobs');
  }
  const evaluatedAt=new Date().toISOString();
  const assembled=await tx(client=>assembleMonthlyReputation(client,{subjectUserId:subjectId,sourceMonth:month,
    weeklyRulesVersion:weekly.version,maintenanceRulesVersion:maintenance.version,evaluatedAt}),'lythaus_jobs');
  const requested=(await sql("SELECT id FROM system.outbox_events WHERE aggregate_id=$1 AND event_type='trust.monthly_assessment.requested'",[assembled.sourceId])).rows[0].id;
  const assessed=await tx(client=>assessMonthlyReputationSource(client,{eventId:requested,assessmentId:uuidv7(),resultEventId:uuidv7(),evaluatedAt:new Date().toISOString()}),'lythaus_jobs');
  const event=(await sql("SELECT id FROM system.outbox_events WHERE aggregate_id=$1 AND event_type='trust.monthly_assessment.recorded'",[assessed.id])).rows[0].id;
  return {...await tx(client=>publishMonthlyRewardSnapshot(client,{eventId:event,rulesVersion:snapshotVersion}),'lythaus_jobs'),assessmentId:assessed.id};
}
async function offer(level,patch={}){
  const id=uuidv7(),family=patch.family??uuidv7();
  await sql(`INSERT INTO trust.monthly_reward_offer_versions
    (id,family_id,partner_id,required_level,terms_version,signed_terms_reference,approved_by,approved_at,starts_at,ends_at)
    VALUES ($1,$2,$3,$4,'synthetic-terms-v1','synthetic signed fixture only',$5,$6,$7,$8)`,
    [id,family,uuidv7(),level,reviewer,patch.approvedAt??'2026-07-01',patch.startsAt??'2026-07-01',patch.endsAt??'9999-01-01']);
  await sql('INSERT INTO trust.monthly_reward_offer_availability (offer_version_id,state) VALUES ($1,$2)',[id,patch.state??'active']);
  return {id,family,level};
}
const select=(subjectId,variant,expectedRevision=0,patch={})=>tx(client=>selectMonthlyReward(client,{
  subjectId,variantId:variant.id,termsVersion:'synthetic-terms-v1',expectedRevision,idempotencyKey:uuidv7(),rulesVersion,...patch}));
const read=(subjectId,version=rulesVersion)=>tx(client=>readOwnMonthlyRewardSelections(client,{subjectId,rulesVersion:version}));
const rawInsert=(subjectId,snapshotId,chosen,patch={})=>tx(client=>client.query(`INSERT INTO trust.monthly_reward_selection_revisions
  (id,subject_user_id,revision,supersedes_id,rules_version,snapshot_id,plan_at_creation,selections,idempotency_key,request_digest)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)`,
  [uuidv7(),subjectId,patch.revision??1,patch.previous??null,rulesVersion,snapshotId,patch.tier??'free',JSON.stringify(chosen),uuidv7(),'a'.repeat(64)]));
const chosen=variant=>({familyId:variant.family,variantId:variant.id,slot:variant.level,termsVersion:'synthetic-terms-v1'});
async function selectWithConcurrentChange(member,variant,statement,change){
  let reached,resume;const barrier=new Promise(resolve=>{reached=resolve;}),released=new Promise(resolve=>{resume=resolve;});
  const pending=tx(client=>selectMonthlyReward({query:async(text,values)=>{
    if(text===statement){reached();await released;}return client.query(text,values);
  }},{subjectId:member,variantId:variant.id,termsVersion:'synthetic-terms-v1',expectedRevision:0,idempotencyKey:uuidv7(),rulesVersion}));
  await barrier;try{await change();}finally{resume();}
  return pending;
}
before(async()=>{
  for(const role of ['lythaus_runtime','lythaus_admin'])
    if(!(await sql('SELECT has_table_privilege($1,$2,$3) AS allowed',[role,'system.feature_flags','SELECT'])).rows[0].allowed)
      grants.push(`REVOKE SELECT ON system.feature_flags FROM ${role}`);
  for(const proposal of ['monthly_reputation_shadow','monthly_reputation_earning','monthly_reputation_maintenance','monthly_reward_snapshots','monthly_reward_selections'])
    await sql(readFileSync(new URL(`../../../database/planetscale/proposals/${proposal}.sql`,import.meta.url),'utf8'));
  reviewer=await person();
  await sql("INSERT INTO identity.admin_memberships (user_id,role,active,access_subject_hmac) VALUES ($1,'moderator',true,$2)",[reviewer,randomBytes(32)]);
  currentMonth=(await sql("SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM') AS month")).rows[0].month;
  const previous=new Date(`${currentMonth}-01T00:00:00Z`);previous.setUTCMonth(previous.getUTCMonth()-1);sourceMonth=previous.toISOString().slice(0,7);
  for(const [table,rules] of [['monthly_earning_rule_sets',weekly],['monthly_maintenance_rule_sets',maintenance]]){
    const privacyColumn=table==='monthly_maintenance_rule_sets'?',collection_privacy_version':'',privacyValue=privacyColumn?",'monthly-privacy-v1'":'';
    await sql(`INSERT INTO trust.${table} (version,policy_version,catalogue_hash,mode,collect_from,configuration${privacyColumn})
      VALUES ($1,$2,$3,'shadow','2026-07-01',$4::jsonb${privacyValue})`,[rules.version,policy,hash,JSON.stringify(rules)]);
  }
  for(const key of ['trust.monthly_reputation_shadow','trust.monthly_reward_snapshots'])
    await sql('INSERT INTO system.feature_flags (flag_key,enabled,policy_version) VALUES ($1,true,$2)',[key,policy]);
  await sql(`INSERT INTO trust.monthly_reward_snapshot_rule_sets
    (version,policy_version,catalogue_hash,mode,status,first_source_month,weekly_rules_version,maintenance_rules_version,
      collection_privacy_version,decision_approvals,approved_by,approved_at,approval_reference)
    VALUES ($1,$2,$3,'confirmed','pending_owner_approval','2026-07-01',$4,$5,'monthly-privacy-v1',$6::jsonb,$7,'2026-07-01','synthetic-only')`,
    [snapshotVersion,policy,hash,weekly.version,maintenance.version,JSON.stringify(Object.fromEntries(decisions.map(id=>[id,'synthetic-only']))),reviewer]);
  free=await person();premium=await person('premium');black=await person('black');
  for(const subject of [free,premium,black])await snapshot(subject);
  for(let level=1;level<=5;level++)variants.push(await offer(level));
});
after(async()=>{
  await sql('DROP TRIGGER IF EXISTS fail_selection_fixture ON system.outbox_events');await sql('DROP FUNCTION IF EXISTS system.fail_selection_fixture()');
  await sql('DROP TRIGGER monthly_reputation_reward_selection_subject_erasure ON identity.users');
  await sql('DROP TRIGGER monthly_reward_selection_flag_preserved ON system.feature_flags');
  await sql('DROP TABLE trust.monthly_reward_selection_revisions,trust.monthly_reward_selection_rule_sets,trust.monthly_reward_offer_availability,trust.monthly_reward_offer_versions');
  await sql('DROP FUNCTION trust.lock_monthly_reward_selection_configuration(),trust.lock_monthly_reward_selection_member(uuid),trust.lock_monthly_reward_offer(uuid),trust.require_monthly_reward_selection(),trust.erase_monthly_reward_selection_subject(),trust.preserve_monthly_reward_selection_flag()');
  await sql('DROP TRIGGER monthly_reputation_reward_snapshot_subject_erasure ON identity.users');
  await sql('DROP TRIGGER monthly_reward_snapshot_flag_preserved ON system.feature_flags');
  await sql('ALTER TABLE trust.monthly_reward_snapshots DROP CONSTRAINT monthly_reward_snapshot_correction_fk');
  await sql('DROP TABLE trust.monthly_reward_snapshot_receipts,trust.monthly_reward_snapshot_corrections,trust.monthly_reward_snapshots,trust.monthly_reward_snapshot_rule_sets');
  await sql('DROP FUNCTION trust.lock_monthly_reward_configuration(),trust.lock_monthly_reward_subject(uuid),trust.lock_monthly_reward_reviewer(uuid,uuid),trust.require_monthly_reward_snapshot(),trust.require_monthly_reward_correction(),trust.require_monthly_reward_snapshot_receipt(),trust.preserve_monthly_reward_snapshot_flag(),trust.erase_monthly_reward_snapshot_subject()');
  await sql('DROP TRIGGER monthly_email_control_revocation ON identity.email_credentials');
  await sql('DROP TRIGGER monthly_reputation_subject_erasure ON identity.users');await sql('DROP TRIGGER monthly_collection_flag_preserved ON system.feature_flags');
  await sql('DROP FUNCTION trust.revoke_monthly_email_control()');
  await sql(`DROP TABLE trust.monthly_reputation_assemblies,trust.monthly_maintenance_revocations,trust.monthly_maintenance_observations,
    trust.monthly_maintenance_rule_sets,trust.monthly_reputation_assessments,trust.monthly_reputation_sources,
    trust.monthly_earning_week_revisions,trust.monthly_earning_receipts,trust.monthly_earning_evidence_revisions,
    trust.monthly_earning_contributions,trust.monthly_earning_rule_sets`);
  await sql('DROP FUNCTION trust.reject_monthly_maintenance_update(),trust.reject_monthly_reputation_update(),trust.reject_monthly_earning_update(),trust.require_monthly_reputation_subject(),trust.require_monthly_assessment_subject(),trust.erase_monthly_reputation_subject(),trust.preserve_monthly_collection_flag(),trust.lock_monthly_reputation_subject(uuid)');
  await sql("DELETE FROM system.feature_flags WHERE flag_key IN ('trust.monthly_reputation_shadow','trust.monthly_reward_snapshots',$1)",[flag]);
  for(const grant of grants)await sql(grant);
  await sql('DELETE FROM system.consumer_inbox WHERE event_id IN (SELECT id FROM system.outbox_events WHERE actor_id=ANY($1::uuid[]))',[subjects]);
  await sql('DELETE FROM system.outbox_events WHERE actor_id=ANY($1::uuid[])',[subjects]);
  await sql('DELETE FROM identity.email_credentials WHERE user_id=ANY($1::uuid[])',[subjects]);
  await sql('DELETE FROM identity.admin_memberships WHERE user_id=ANY($1::uuid[])',[subjects]);
  await sql('DELETE FROM identity.users WHERE id=ANY($1::uuid[])',[subjects]);
});

test('PAR-10/REL-03: selection is dormant without explicit approved configuration and privacy prerequisite',async()=>{
  statements.length=0;assert.equal((await select(free,variants[0],0,{rulesVersion:undefined})).state,'unavailable');
  assert.equal((await read(free,null)).state,'unavailable');assert.equal(statements.length,0);
  assert.equal((await select(free,variants[0])).state,'unavailable');
  await sql('INSERT INTO system.feature_flags (flag_key,enabled,policy_version) VALUES ($1,true,$2)',[flag,policy]);
  await sql(`INSERT INTO trust.monthly_reward_selection_rule_sets
    (version,policy_version,snapshot_rules_version,status,switching_mode,approved_by,approved_at,approval_reference)
    VALUES ($1,$2,$3,'pending_owner_approval','blocked_pending_D12',$4,'2026-07-01','synthetic-only')`,
    ['synthetic-no-privacy',policy,snapshotVersion,reviewer]);
  assert.equal((await select(free,variants[0],0,{rulesVersion:'synthetic-no-privacy'})).state,'unavailable');
  await sql(`INSERT INTO trust.monthly_reward_selection_rule_sets
    (version,policy_version,snapshot_rules_version,status,switching_mode,collection_privacy_version,approved_by,approved_at,approval_reference)
    VALUES ($1,$2,$3,'pending_owner_approval','blocked_pending_D12','monthly-privacy-v1',$4,'2026-07-01','synthetic-only')`,
    [rulesVersion,policy,snapshotVersion,reviewer]);
});

test('PAR-01/03: Free L5 retains profile L5, one persistent family and maximum L3; retries do not multiply selections',async()=>{
  await assert.rejects(select(free,variants[4]),/level_unavailable/);
  const key=uuidv7();const [left,right]=await Promise.all([select(free,variants[2],0,{idempotencyKey:key}),select(free,variants[2],0,{idempotencyKey:key})]);
  assert.equal(Number(left.created)+Number(right.created),1);assert.equal(left.id,right.id);
  const state=await read(free);assert.equal(state.profileLevel,5);assert.equal(state.rewardMaximumLevel,3);
  assert.equal(state.selections.length,1);assert.equal(state.selections[0].state,'eligible');
  assert.equal((await select(free,variants[0],1)).reasonCode,'transition_approval_pending_D12');
  await assert.rejects(select(free,variants[1],1,{idempotencyKey:key}),/idempotency_reused/);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_selection_revisions WHERE subject_user_id=$1',[free])).rowCount,1);
});

test('PAR-02/03: Premium has one variant per earned-level slot and cannot allocate five L5 families',async()=>{
  const first=await select(premium,variants[4]);assert.equal(first.revision,1);
  const secondL5=await offer(5);assert.equal((await select(premium,secondL5,1)).reasonCode,'transition_approval_pending_D12');
  const sameFamilyL4=await offer(4,{family:variants[4].family});
  assert.equal((await select(premium,sameFamilyL4,1)).reasonCode,'transition_approval_pending_D12');
  for(let level=1;level<=4;level++)await select(premium,variants[level-1],level);
  const state=await read(premium);assert.equal(state.revision,5);assert.equal(state.selections.length,5);
  assert.deepEqual(state.selections.map(item=>item.slot),[1,2,3,4,5]);
  assert.ok(state.selections.every(item=>item.state==='eligible'));
});

test('PAR-02: Black uses all eligible offers without new selections and retains previously selected history',async()=>{
  assert.equal((await select(black,variants[0])).state,'not_required');assert.equal((await read(black)).selectionRequired,false);
  await sql("UPDATE identity.user_entitlements SET subscription_tier='black' WHERE user_id=$1",[premium]);
  const state=await read(premium);assert.equal(state.selectionRequired,false);assert.equal(state.selections.length,5);
  await sql(`INSERT INTO trust.monthly_reward_selection_rule_sets
    (version,policy_version,snapshot_rules_version,status,switching_mode,collection_privacy_version,approved_by,approved_at,approval_reference)
    VALUES ('synthetic-selection-v2',$1,$2,'pending_owner_approval','blocked_pending_D12','monthly-privacy-v1',$3,'2026-07-01','synthetic-only')`,
    [policy,snapshotVersion,reviewer]);
  const changed=await read(premium,'synthetic-selection-v2');assert.equal(changed.state,'ready');assert.equal(changed.selectionRequired,false);
  assert.equal(changed.selectionHistoryRequiresReview,true);assert.equal(changed.revision,5);assert.equal(changed.selections.length,5);
  await sql("UPDATE identity.user_entitlements SET subscription_tier='premium' WHERE user_id=$1",[premium]);
  assert.equal((await read(premium,'synthetic-selection-v2')).reasonCode,'selection_policy_requires_review');
});

test('PAR-02: downgrade retains every choice as dormant pending the explicit D12 retention decision',async()=>{
  await sql("UPDATE identity.user_entitlements SET subscription_tier='free' WHERE user_id=$1",[premium]);
  const state=await read(premium);assert.equal(state.reasonCode,'transition_approval_pending_D12');assert.equal(state.selections.length,5);
  assert.ok(state.selections.every(item=>item.state==='dormant'));
  assert.equal((await select(premium,await offer(1),5)).state,'pending');
  await sql("UPDATE identity.user_entitlements SET subscription_tier='premium' WHERE user_id=$1",[premium]);
  assert.ok((await read(premium)).selections.every(item=>item.state==='eligible'));
});

test('PAR-03/REL-02: different concurrent selections use durable member CAS and do not over-allocate',async()=>{
  const member=await person('premium');await snapshot(member);
  const outcomes=await Promise.allSettled([select(member,variants[0]),select(member,variants[1])]);
  assert.equal(outcomes.filter(item=>item.status==='fulfilled').length,1);
  assert.match(outcomes.find(item=>item.status==='rejected').reason.message,/revision_conflict/);
  assert.equal((await read(member)).selections.length,1);
});

test('PAR-04/SEC-01: no assessment, another member snapshot, old month, malformed input or submitted level can mint selections',async()=>{
  const pending=await person();assert.equal((await select(pending,variants[0])).reasonCode,'confirmed_month_unavailable');
  await assert.rejects(select(free,variants[0],-1),/invalid/);
  await assert.rejects(select(free,variants[0],1,{idempotencyKey:'client-forgery'}),/id_invalid/);
  await assert.rejects(rawInsert(pending,(await sql('SELECT id FROM trust.monthly_reward_snapshots WHERE subject_user_id=$1',[free])).rows[0].id,[chosen(variants[0])]),/authority_required/);
  const old=await person();const earlier=new Date(`${sourceMonth}-01T00:00:00Z`);earlier.setUTCMonth(earlier.getUTCMonth()-1);
  const oldSnapshot=await snapshot(old,10000,earlier.toISOString().slice(0,7));
  await assert.rejects(rawInsert(old,oldSnapshot.id,[chosen(variants[0])]),/authority_required/);
  assert.equal((await select(old,variants[0])).reasonCode,'confirmed_month_unavailable');
  const fresh=await person();const current=await snapshot(fresh);
  await assert.rejects(rawInsert(fresh,current.id,[{...chosen(variants[0]),points:13500}]),/transition_pending/);
  await assert.rejects(rawInsert(fresh,current.id,[chosen(variants[4])]),/offer_unavailable/);
  await assert.rejects(rawInsert(fresh,current.id,[chosen(variants[0])],{tier:'premium'}),/member_unavailable/);
});

test('PAR-10/REL-01: proposed, paused, expired, future and changed terms cannot become a new selection',async()=>{
  const member=await person();await snapshot(member);
  for(const patch of [{state:'proposed'},{state:'paused'},{state:'expired'},{endsAt:'2026-08-01'},{startsAt:'9998-01-01'},{approvedAt:'9998-01-01'}])
    await assert.rejects(select(member,await offer(1,patch)),/offer_unavailable/);
  await assert.rejects(select(member,variants[0],0,{termsVersion:'changed-without-consent'}),/offer_unavailable/);
  await sql("UPDATE trust.monthly_reward_offer_availability SET state='paused' WHERE offer_version_id=$1",[variants[2].id]);
  assert.equal((await read(free)).selections[0].state,'dormant');
  await sql("UPDATE trust.monthly_reward_offer_availability SET state='active' WHERE offer_version_id=$1",[variants[2].id]);
  assert.equal((await read(free)).selections[0].state,'eligible');
});

test('PAR-02/SEC-01: a confirmed lower-level Premium cannot select a higher-level slot regardless of paid tier',async()=>{
  const member=await person('premium');await snapshot(member,1000);
  const state=await read(member);assert.equal(state.profileLevel,2);assert.equal(state.rewardMaximumLevel,2);
  await assert.rejects(select(member,variants[2]),/level_unavailable/);
  assert.equal((await select(member,variants[1])).state,'selected');
});

test('REL-01: revoked email, suspended account and disabled configuration are freshly refused, including command replays',async()=>{
  const member=await person();await snapshot(member);const key=uuidv7();await select(member,variants[0],0,{idempotencyKey:key});
  await sql('UPDATE identity.email_credentials SET verified_at=NULL WHERE user_id=$1',[member]);
  await assert.rejects(select(member,variants[0],0,{idempotencyKey:key}),/member_unavailable/);
  await sql("UPDATE identity.email_credentials SET verified_at='2026-07-01' WHERE user_id=$1",[member]);
  await sql("UPDATE identity.users SET status='suspended' WHERE id=$1",[member]);await assert.rejects(read(member),/member_unavailable/);
  await sql("UPDATE identity.users SET status='active' WHERE id=$1",[member]);
  await sql('UPDATE system.feature_flags SET enabled=false WHERE flag_key=$1',[flag]);assert.equal((await read(member)).state,'unavailable');
  await sql('UPDATE system.feature_flags SET enabled=true WHERE flag_key=$1',[flag]);
  await assert.rejects(sql('DELETE FROM system.feature_flags WHERE flag_key=$1',[flag]),/privacy_teardown/);
});

test('REL-02: outbox interruption rolls back selection and retry creates exactly one persisted revision',async()=>{
  const member=await person();await snapshot(member);
  await sql(`CREATE FUNCTION system.fail_selection_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.event_type='trust.monthly_reward_selection.recorded' THEN RAISE EXCEPTION 'synthetic selection interrupted';END IF;RETURN NEW;END $$;
    CREATE TRIGGER fail_selection_fixture BEFORE INSERT ON system.outbox_events FOR EACH ROW EXECUTE FUNCTION system.fail_selection_fixture()`);
  const key=uuidv7();
  try{await assert.rejects(select(member,variants[0],0,{idempotencyKey:key}),/selection interrupted/);
    assert.equal((await read(member)).revision,0);
  }finally{await sql('DROP TRIGGER fail_selection_fixture ON system.outbox_events');await sql('DROP FUNCTION system.fail_selection_fixture()');}
  assert.equal((await select(member,variants[0],0,{idempotencyKey:key})).created,true);
  assert.equal((await select(member,variants[0],0,{idempotencyKey:key})).created,false);
});

test('REL-01/03: concurrent configuration pause leaves no selection and resumes without lost command state',async()=>{
  const member=await person();await snapshot(member);
  const result=await selectWithConcurrentChange(member,variants[0],'SELECT * FROM trust.lock_monthly_reward_selection_configuration()',
    ()=>sql('UPDATE system.feature_flags SET enabled=false WHERE flag_key=$1',[flag]));
  assert.equal(result.state,'unavailable');
  assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_selection_revisions WHERE subject_user_id=$1',[member])).rowCount,0);
  await sql('UPDATE system.feature_flags SET enabled=true WHERE flag_key=$1',[flag]);
  assert.equal((await select(member,variants[0])).created,true);
});

test('REL-01: concurrent tier downgrade and offer pause are read freshly before a new selection',async()=>{
  const member=await person('premium');await snapshot(member);
  await assert.rejects(selectWithConcurrentChange(member,variants[4],'SELECT subscription_tier FROM trust.lock_monthly_reward_selection_member($1)',
    ()=>sql("UPDATE identity.user_entitlements SET subscription_tier='free' WHERE user_id=$1",[member])),/level_unavailable/);
  const variant=await offer(1);
  await assert.rejects(selectWithConcurrentChange(member,variant,'SELECT id,family_id,required_level,terms_version FROM trust.lock_monthly_reward_offer($1)',
    ()=>sql("UPDATE trust.monthly_reward_offer_availability SET state='paused' WHERE offer_version_id=$1",[variant.id])),/offer_unavailable/);
  assert.equal((await read(member)).revision,0);
  await assert.rejects(tx(client=>client.query("UPDATE trust.monthly_reward_offer_availability SET state='active' WHERE offer_version_id=$1",[variant.id])),/permission denied/);
});

test('RPT-04/REL-02: deletion before fresh member authorization cannot resurrect a selection from the previously read configuration',async()=>{
  const member=await person();await snapshot(member);
  await assert.rejects(selectWithConcurrentChange(member,variants[0],'SELECT subscription_tier FROM trust.lock_monthly_reward_selection_member($1)',
    ()=>sql("UPDATE identity.users SET status='deleted',deleted_at=now() WHERE id=$1",[member])),/member_unavailable/);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_selection_revisions WHERE subject_user_id=$1',[member])).rowCount,0);
});

test('PAR-01/02: approved level reductions retain higher choices dormant with unchanged selection revisions',async()=>{
  for(const member of [free,premium]){
    const before=await read(member),previous=(await sql(`SELECT id,revision FROM trust.monthly_reward_snapshots
      WHERE subject_user_id=$1 AND mode='confirmed' AND effective_month=$2 ORDER BY revision DESC LIMIT 1`,[member,`${currentMonth}-01`])).rows[0];
    const changed=await snapshot(member,1000);assert.equal(changed.state,'correction_approval_pending');
    const correction=await tx(client=>approveMonthlyRewardSnapshotCorrection(client,{
      actorId:reviewer,subjectId:member,snapshotId:previous.id,assessmentId:changed.assessmentId,rulesVersion:snapshotVersion,
      expectedSnapshotRevision:previous.revision,reasonCode:'synthetic_independent_provider_invalidation',evidenceReference:'synthetic correction evidence',idempotencyKey:uuidv7()}),'lythaus_admin');
    await tx(client=>applyMonthlyRewardSnapshotCorrection(client,{eventId:correction.sourceEventId,rulesVersion:snapshotVersion}),'lythaus_jobs');
    const after=await read(member);assert.equal(after.profileLevel,2);assert.equal(after.revision,before.revision);
    assert.equal(after.selections.length,before.selections.length);
    assert.ok(after.selections.filter(item=>item.slot>2).every(item=>item.state==='dormant'));
    assert.ok(after.selections.filter(item=>item.slot<=2).every(item=>item.state==='eligible'));
  }
});

test('RPT-04/REL-02: deleting a selected member erases selections and notices before snapshots, without resurrection',async()=>{
  const member=await person('premium');await snapshot(member);await select(member,variants[0]);await select(member,variants[1],1);
  await sql("UPDATE identity.users SET status='deleted',deleted_at=now() WHERE id=$1",[member]);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_selection_revisions WHERE subject_user_id=$1',[member])).rowCount,0);
  assert.equal((await sql("SELECT 1 FROM system.outbox_events WHERE actor_id=$1 AND event_type='trust.monthly_reward_selection.recorded'",[member])).rowCount,0);
  await assert.rejects(select(member,variants[0]),/member_unavailable/);
});
