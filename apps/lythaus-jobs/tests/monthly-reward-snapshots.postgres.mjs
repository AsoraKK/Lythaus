import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { before,after,test,mock } from 'node:test';
import { registerHooks } from 'node:module';
import pg from 'pg';
import * as database from '@lythaus/db';
import { uuidv7 } from '@lythaus/security';
import { MONTHLY_REPUTATION_POLICY_VERSION as policy,MONTHLY_REPUTATION_CATALOGUE_HASH as hash } from '@lythaus/contracts';
import { PROPOSED_WEEKLY_EARNING_RULES as weekly } from '../../../packages/contracts/src/monthly-earning-policy.ts';
import { PROPOSED_MONTHLY_MAINTENANCE_RULES as maintenance } from '../../../packages/contracts/src/monthly-maintenance-policy.ts';
import { MONTHLY_REPUTATION_DECISIONS as decisions } from '../../../packages/contracts/src/monthly-reputation-decisions.ts';
import { recordMonthlyContentEarning } from '../../../packages/db/src/monthly-earning.ts';
import { assembleMonthlyReputation } from '../../../packages/db/src/monthly-assembly.ts';
import { assessMonthlyReputationSource } from '../../../packages/db/src/monthly-reputation.ts';
import { monthlyRewardSnapshotConfiguration,publishMonthlyRewardSnapshot,approveMonthlyRewardSnapshotCorrection,
  applyMonthlyRewardSnapshotCorrection,readOwnMonthlyRewardSnapshot,MONTHLY_REWARD_SNAPSHOT_FLAG as flag,
  MONTHLY_REWARD_SNAPSHOT_EVENT as snapshotEvent,MONTHLY_REWARD_CORRECTION_EVENT as correctionEvent } from '../../../packages/db/src/monthly-reward-snapshots.ts';

const connectionString=process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
const target=new URL(connectionString??'file:///missing');
if(!['127.0.0.1','localhost'].includes(target.hostname)
  ||!(target.pathname==='/lythaus_monthly_test'||(process.env.GITHUB_ACTIONS==='true'&&target.pathname==='/postgres')))
  throw new Error('Snapshot tests require explicitly local disposable PostgreSQL');
const statements=[],subjects=[],posts=[],cases=[],grants=[];
async function tx(work,role='lythaus_jobs',timeZone='UTC'){
  const client=new pg.Client({connectionString,ssl:false});await client.connect();
  try{
    await client.query('BEGIN');await client.query("SET LOCAL statement_timeout='10s'");
    await client.query("SELECT set_config('TimeZone',$1,true)",[timeZone]);
    if(role){assert.ok(['lythaus_jobs','lythaus_admin','lythaus_runtime','lythaus_privacy'].includes(role));await client.query(`SET LOCAL ROLE ${role}`);}
    const result=await work({query:(text,values)=>{statements.push(text);return client.query(text,values);}});
    await client.query('COMMIT');return result;
  }catch(error){await client.query('ROLLBACK');throw error;}finally{await client.end();}
}
const sql=(text,values)=>tx(client=>client.query(text,values),null);
const binding={role:'lythaus_jobs'};
mock.module('@lythaus/db',{namedExports:{...database,
  transaction:(binding,work)=>tx(work,binding.role,binding.timeZone),
  query:(binding,text,values)=>tx(client=>client.query(text,values),binding.role,binding.timeZone),
}});
const {processMonthlyRewardSnapshotEvent,reconcileMonthlyRewardSnapshots}=await import('../src/monthly-reward-snapshots.ts');
const hooks=registerHooks({resolve(specifier,context,next){return specifier==='cloudflare:workers'
  ?{url:'data:text/javascript,export class WorkflowEntrypoint {}',shortCircuit:true}:next(specifier,context);}});
const {default:jobs}=await import('../src/index.ts');hooks.deregister();
const shadow='synthetic-snapshot-shadow-v1',confirmed='synthetic-snapshot-confirmed-v1';
const env={DB_JOBS_FRESH:binding,MONTHLY_REPUTATION_SNAPSHOT_RULES:confirmed};
let subject,reviewer,first,shadowSnapshot,confirmedSnapshot,second,correction;
const publish=(eventId,rulesVersion=shadow)=>tx(client=>publishMonthlyRewardSnapshot(client,{eventId,rulesVersion}));
const apply=(eventId,rulesVersion=confirmed)=>tx(client=>applyMonthlyRewardSnapshotCorrection(client,{eventId,rulesVersion}));
const read=(subjectId=subject,rulesVersion=confirmed,effectiveMonth='2026-09')=>tx(client=>readOwnMonthlyRewardSnapshot(client,{subjectId,rulesVersion,effectiveMonth}),'lythaus_runtime');
const approve=(patch={})=>tx(client=>approveMonthlyRewardSnapshotCorrection(client,{
  actorId:reviewer,subjectId:subject,snapshotId:confirmedSnapshot.id,assessmentId:second.assessmentId,rulesVersion:confirmed,
  expectedSnapshotRevision:1,reasonCode:'synthetic_upheld_source_correction',evidenceReference:'synthetic-private-correction',
  idempotencyKey:uuidv7(),...patch}),'lythaus_admin');
const directSnapshot=(item,patch={})=>tx(client=>client.query(`INSERT INTO trust.monthly_reward_snapshots
  (id,subject_user_id,source_month,effective_month,rules_version,policy_version,mode,revision,supersedes_id,
    assessment_id,source_id,source_revision,source_score,level,correction_id,source_event_id)
  SELECT $1,source.subject_user_id,source.source_month,(source.source_month+interval '1 month')::date,$2,$3,'confirmed',$4,$5,
    assessment.id,source.id,source.revision,assessment.source_score,assessment.level,$6,$7
  FROM trust.monthly_reputation_assessments assessment JOIN trust.monthly_reputation_sources source ON source.id=assessment.source_id
  WHERE assessment.id=$8`,[uuidv7(),patch.rulesVersion??confirmed,policy,patch.revision??1,patch.previous??null,patch.correction??null,
    patch.event??item.eventId,item.assessmentId]),'lythaus_jobs',patch.timeZone);
async function person(){
  const id=uuidv7();subjects.push(id);
  await sql("INSERT INTO identity.users (id,display_name,created_at) VALUES ($1,'Synthetic snapshot','2026-07-01')",[id]);return id;
}
async function configure(version,patch={}){
  const mode=patch.mode??'shadow',approved=patch.approved??true,privacy=Object.hasOwn(patch,'privacy')?patch.privacy:'monthly-privacy-v1';
  await sql(`INSERT INTO trust.monthly_reward_snapshot_rule_sets
    (version,policy_version,catalogue_hash,mode,status,first_source_month,weekly_rules_version,maintenance_rules_version,
      collection_privacy_version,decision_approvals,approved_by,approved_at,approval_reference)
    VALUES ($1,$2,$3,$4,'pending_owner_approval',$5,$6,$7,$8,$9::jsonb,$10,$11,$12)`,
  [version,policy,patch.hash??hash,mode,patch.firstSource??'2026-08-01',weekly.version,patch.maintenanceVersion??maintenance.version,privacy,
    JSON.stringify(patch.decisions??(mode==='confirmed'?Object.fromEntries(decisions.map(id=>[id,'synthetic-only'])):{})),
    approved?reviewer:null,approved?'2026-08-01':null,approved?'synthetic-only':null]);
}
async function post(author=subject,week='2026-08-03'){
  const id=uuidv7(),event=uuidv7(),caseId=uuidv7();posts.push(id);cases.push(caseId);
  await sql(`INSERT INTO content.posts (id,author_id,body,declared_creation_mode,visibility,moderation_state,moderation_source_event_id,created_at)
    VALUES ($1,$2,$3,'human','public','allowed',$4,$5)`,[id,author,`Distinct synthetic published work ${id}`,event,`${week}T12:00:00.000Z`]);
  await sql(`INSERT INTO system.outbox_events (id,event_type,aggregate_type,aggregate_id,actor_id,payload,created_at)
    VALUES ($1,'content.post.created','post',$2,$3,'{}'::jsonb,$4)`,[event,id,author,`${week}T12:00:00.000Z`]);
  await sql(`INSERT INTO moderation.cases (id,content_type,content_id,state,policy_version,source_event_id)
    VALUES ($1,'post',$2,'resolved','synthetic-snapshot-publication',$3)`,[caseId,id,event]);
  await sql(`INSERT INTO moderation.decisions (id,case_id,outcome,public_label,policy_version,decided_by)
    VALUES ($1,$2,'allow','Human-authored','synthetic-snapshot-publication',$3)`,[uuidv7(),caseId,reviewer]);
  await tx(client=>recordMonthlyContentEarning(client,{eventId:event,rulesVersion:weekly.version,evaluatedAt:new Date().toISOString()}));
  return { id, event, caseId };
}
async function assessment(author=subject,month='2026-08',evaluatedAt=new Date().toISOString(),maintenanceVersion=maintenance.version){
  const assembly=await tx(client=>assembleMonthlyReputation(client,{subjectUserId:author,sourceMonth:month,
    weeklyRulesVersion:weekly.version,maintenanceRulesVersion:maintenanceVersion,evaluatedAt}));
  const requested=(await sql("SELECT id FROM system.outbox_events WHERE aggregate_id=$1 AND event_type='trust.monthly_assessment.requested'",[assembly.sourceId])).rows[0].id;
  const result=await tx(client=>assessMonthlyReputationSource(client,{eventId:requested,assessmentId:uuidv7(),resultEventId:uuidv7(),evaluatedAt}));
  const event=(await sql("SELECT id FROM system.outbox_events WHERE aggregate_id=$1 AND event_type='trust.monthly_assessment.recorded'",[result.id])).rows[0].id;
  return {eventId:event,assessmentId:result.id,sourceId:assembly.sourceId,calculation:result.calculation};
}
before(async()=>{
  for(const role of ['lythaus_jobs','lythaus_admin','lythaus_runtime'])
    if(!(await sql('SELECT has_table_privilege($1,$2,$3) AS allowed',[role,'system.feature_flags','SELECT'])).rows[0].allowed)
      grants.push(`REVOKE SELECT ON system.feature_flags FROM ${role}`);
  for(const proposal of ['monthly_reputation_shadow','monthly_reputation_earning','monthly_reputation_maintenance','monthly_reward_snapshots'])
    await sql(readFileSync(new URL(`../../../database/planetscale/proposals/${proposal}.sql`,import.meta.url),'utf8'));
  for(const [table,rules] of [['monthly_earning_rule_sets',weekly],['monthly_maintenance_rule_sets',maintenance]]){
    const privacyColumn=table==='monthly_maintenance_rule_sets'?',collection_privacy_version':'';
    const privacyValue=table==='monthly_maintenance_rule_sets'?",'monthly-privacy-v1'":'';
    await sql(`INSERT INTO trust.${table} (version,policy_version,catalogue_hash,mode,collect_from,configuration${privacyColumn})
      VALUES ($1,$2,$3,'shadow','2026-07-01',$4::jsonb${privacyValue})`,[rules.version,policy,hash,JSON.stringify(rules)]);
  }
  subject=await person();reviewer=await person();
  await sql(`INSERT INTO identity.admin_memberships (user_id,role,active,access_subject_hmac) VALUES ($1,'moderator',true,$2)`,[reviewer,randomBytes(32)]);
  await sql("INSERT INTO system.feature_flags (flag_key,enabled,policy_version) VALUES ('trust.monthly_reputation_shadow',true,$1)",[policy]);
  for(let index=0;index<3;index++)await post();
  first=await assessment();assert.equal(first.calculation.sourceScore,500);
});
after(async()=>{
  await sql('DROP TRIGGER IF EXISTS fail_snapshot_fixture ON system.outbox_events');
  await sql('DROP FUNCTION IF EXISTS system.fail_snapshot_fixture()');
  await sql('DROP TRIGGER monthly_reputation_reward_snapshot_subject_erasure ON identity.users');
  await sql('DROP TRIGGER monthly_reward_snapshot_flag_preserved ON system.feature_flags');
  await sql('ALTER TABLE trust.monthly_reward_snapshots DROP CONSTRAINT monthly_reward_snapshot_correction_fk');
  await sql('DROP TABLE trust.monthly_reward_snapshot_receipts,trust.monthly_reward_snapshot_corrections,trust.monthly_reward_snapshots,trust.monthly_reward_snapshot_rule_sets');
  await sql('DROP FUNCTION trust.lock_monthly_reward_configuration(),trust.lock_monthly_reward_subject(uuid),trust.lock_monthly_reward_reviewer(uuid,uuid),trust.require_monthly_reward_snapshot(),trust.require_monthly_reward_correction(),trust.require_monthly_reward_snapshot_receipt(),trust.preserve_monthly_reward_snapshot_flag(),trust.erase_monthly_reward_snapshot_subject()');
  await sql('DROP TRIGGER monthly_email_control_revocation ON identity.email_credentials');
  await sql('DROP TRIGGER monthly_reputation_subject_erasure ON identity.users');
  await sql('DROP TRIGGER monthly_collection_flag_preserved ON system.feature_flags');
  await sql('DROP FUNCTION trust.revoke_monthly_email_control()');
  await sql(`DROP TABLE trust.monthly_reputation_assemblies,trust.monthly_maintenance_revocations,trust.monthly_maintenance_observations,
    trust.monthly_maintenance_rule_sets,trust.monthly_reputation_assessments,trust.monthly_reputation_sources,
    trust.monthly_earning_week_revisions,trust.monthly_earning_receipts,trust.monthly_earning_evidence_revisions,
    trust.monthly_earning_contributions,trust.monthly_earning_rule_sets`);
  await sql('DROP FUNCTION trust.reject_monthly_maintenance_update(),trust.reject_monthly_reputation_update(),trust.reject_monthly_earning_update(),trust.require_monthly_reputation_subject(),trust.require_monthly_assessment_subject(),trust.erase_monthly_reputation_subject(),trust.preserve_monthly_collection_flag(),trust.lock_monthly_reputation_subject(uuid)');
  await sql('DROP FUNCTION trust.redact_monthly_earning_calculation(jsonb)');
  await sql("DELETE FROM system.feature_flags WHERE flag_key IN ('trust.monthly_reputation_shadow',$1)",[flag]);
  for(const grant of grants)await sql(grant);
  await sql('DELETE FROM moderation.decisions WHERE case_id=ANY($1::uuid[])',[cases]);
  await sql('DELETE FROM moderation.cases WHERE id=ANY($1::uuid[])',[cases]);
  await sql('DELETE FROM content.posts WHERE id=ANY($1::uuid[])',[posts]);
  await sql('DELETE FROM system.consumer_inbox WHERE event_id IN (SELECT id FROM system.outbox_events WHERE actor_id=ANY($1::uuid[]))',[subjects]);
  await sql('DELETE FROM system.outbox_events WHERE actor_id=ANY($1::uuid[])',[subjects]);
  await sql('DELETE FROM identity.admin_memberships WHERE user_id=ANY($1::uuid[])',[subjects]);
  await sql('DELETE FROM identity.users WHERE id=ANY($1::uuid[])',[subjects]);
});

test('PAR-04/REL-03: snapshot publisher is dormant without an explicit approved privacy-ready configuration',async()=>{
  statements.length=0;assert.equal(await tx(client=>publishMonthlyRewardSnapshot(client,{eventId:first.eventId})),null);
  assert.equal(await tx(client=>monthlyRewardSnapshotConfiguration(client)),null);assert.equal(statements.length,0);
  assert.equal(await publish(first.eventId,shadow),null);
  const dormant=await person();await sql('ALTER TABLE trust.monthly_reward_snapshots RENAME TO monthly_reward_snapshots_fixture_hidden');
  await sql("UPDATE identity.users SET status='deleted',deleted_at=now() WHERE id=$1",[dormant]);
  await sql('ALTER TABLE trust.monthly_reward_snapshots_fixture_hidden RENAME TO monthly_reward_snapshots');
  await sql('INSERT INTO system.feature_flags (flag_key,enabled,policy_version) VALUES ($1,true,$2)',[flag,policy]);
  await configure('synthetic-unapproved',{approved:false});assert.equal(await publish(first.eventId,'synthetic-unapproved'),null);
  await configure('synthetic-no-privacy',{privacy:null});assert.equal(await publish(first.eventId,'synthetic-no-privacy'),null);
  await configure('synthetic-bad-hash',{hash:'0'.repeat(64)});assert.equal(await publish(first.eventId,'synthetic-bad-hash'),null);
  await configure(shadow);await configure(confirmed,{mode:'confirmed'});
  const blank=Object.fromEntries(decisions.map(id=>[id,'']));await configure('synthetic-blank-approval',{mode:'confirmed',decisions:blank});
  assert.equal(await publish(first.eventId,'synthetic-blank-approval'),null);
  await assert.rejects(configure('synthetic-missing-decisions',{mode:'confirmed',decisions:{}}),/check constraint/);
});

test('CAL-10/12/PAR-04: real publication → monthly assembly → assessment → immutable separate shadow/confirmed next-month snapshots',async()=>{
  shadowSnapshot=await publish(first.eventId);assert.equal(shadowSnapshot.mode,'shadow');assert.equal(shadowSnapshot.sourceMonth,'2026-08');
  assert.equal(shadowSnapshot.effectiveMonth,'2026-09');assert.equal(shadowSnapshot.sourceScore,500);
  const candidates=await read(subject,shadow);assert.equal(candidates.state,'shadow');assert.equal(candidates.level,1);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_snapshots WHERE mode=$1',['confirmed'])).rowCount,0);
  const [left,right]=await Promise.all([publish(first.eventId,confirmed),publish(first.eventId,confirmed)]);
  confirmedSnapshot=left.created?left:right;assert.equal(Number(left.created)+Number(right.created),1);
  assert.equal((await read()).state,'confirmed');assert.equal((await read()).sourceScore,500);
  assert.equal((await sql('SELECT mode FROM trust.monthly_reputation_assessments WHERE id=$1',[first.assessmentId])).rows[0].mode,'shadow');
  assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_snapshots WHERE assessment_id=$1',[first.assessmentId])).rowCount,2);
  await assert.rejects(sql('UPDATE trust.monthly_reward_snapshots SET level=5 WHERE id=$1',[confirmedSnapshot.id]),/immutable/);
});

test('SEC-01/RPT-02: forged source, wrong author, malformed IDs and direct runtime writes cannot mint snapshots',async()=>{
  const fake=uuidv7();await sql(`INSERT INTO system.outbox_events (id,event_type,aggregate_type,aggregate_id,actor_id,payload)
    VALUES ($1,'trust.monthly_assessment.recorded','monthly_reputation_assessment',$2,$3,$4::jsonb)`,
  [fake,first.assessmentId,reviewer,JSON.stringify({assessmentId:first.assessmentId,sourceId:first.sourceId,mode:'shadow',points:13500})]);
  await assert.rejects(publish(fake,confirmed),/canonical_assessment/);
  await assert.rejects(publish('forged',confirmed),/id_invalid/);
  await assert.rejects(tx(client=>client.query('INSERT INTO trust.monthly_reward_snapshots SELECT * FROM trust.monthly_reward_snapshots'),'lythaus_runtime'),/permission denied/);
  await assert.rejects(tx(client=>client.query('UPDATE system.feature_flags SET enabled=false WHERE flag_key=$1',[flag])),/permission denied/);
  await sql('DELETE FROM system.outbox_events WHERE id=$1',[fake]);
  const other=await person();assert.equal((await read(other)).reasonCode,'no_previous_assessment');assert.equal((await read(other)).level,1);
  const currentMonth=(await sql("SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM') AS month")).rows[0].month;
  assert.equal((await read(other,confirmed,currentMonth)).state,'pending');
  assert.equal((await read(other,confirmed,currentMonth)).levelKind,'unassessed_default');
  assert.equal((await read(other,confirmed,'9999-12')).reasonCode,'future_month_unconfirmed');
  assert.equal((await read(other,confirmed,'2026-08')).reasonCode,'before_policy_cutover');
  assert.equal((await read(other)).snapshotId,null);
  await assert.rejects(tx(client=>client.query(`INSERT INTO trust.monthly_reward_snapshot_receipts
    (event_id,rules_version,mode,subject_user_id,assessment_id,state) VALUES ($1,$2,'confirmed',$3,$4,'published')`,
    [first.eventId,confirmed,other,first.assessmentId])),/receipt_provenance/);
});

test('CAL-12/18: new source corrections do not continuously change the fixed effective-month level',async()=>{
  for(let index=0;index<3;index++)await post(subject,'2026-08-10');second=await assessment();assert.equal(second.calculation.sourceScore,1000);
  const pending=await publish(second.eventId,confirmed);assert.equal(pending.state,'correction_approval_pending');
  assert.equal((await read()).sourceScore,500);assert.equal((await read()).revision,1);
  const before=await read();await post(subject,'2026-08-31');assert.deepEqual(await read(),before);
  assert.equal((await read(subject,confirmed,'2026-10')).state,'pending');
  assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_snapshot_receipts WHERE event_id=$1 AND mode=$2',[second.eventId,'confirmed'])).rowCount,1);
});

test('REL-01/02: scoped correction approvals reject self, wrong member, stale CAS and revoked reviewers; retries share durable history',async()=>{
  await assert.rejects(approve({actorId:subject}),/actor_not_allowed/);
  await assert.rejects(approve({subjectId:reviewer}),/scope_invalid/);
  await assert.rejects(approve({expectedSnapshotRevision:2}),/revision_conflict/);
  await assert.rejects(approve({evidenceReference:''}),/correction_invalid/);
  await assert.rejects(approve({idempotencyKey:'forged'}),/id_invalid/);
  const key=uuidv7();const [left,right]=await Promise.all([approve({idempotencyKey:key}),approve({idempotencyKey:key})]);
  correction=left.created?left:right;assert.equal(Number(left.created)+Number(right.created),1);assert.equal(left.id,right.id);
  for(const state of ['correction_approval_pending','snapshot_policy_requires_review','before_cutover'])
    await assert.rejects(tx(client=>client.query(`INSERT INTO trust.monthly_reward_snapshot_receipts
      (event_id,rules_version,mode,subject_user_id,assessment_id,snapshot_id,state) VALUES ($1,$2,'confirmed',$3,$4,$5,$6)`,
      [correction.sourceEventId,confirmed,subject,second.assessmentId,confirmedSnapshot.id,state])),/receipt_state_invalid/);
  await assert.rejects(approve({idempotencyKey:key,reasonCode:'changed_request'}),/idempotency_reused/);
  await sql('UPDATE identity.admin_memberships SET active=false WHERE user_id=$1',[reviewer]);
  await assert.rejects(approve({idempotencyKey:key}),/actor_not_allowed/);
  await sql('UPDATE identity.admin_memberships SET active=true WHERE user_id=$1',[reviewer]);
});

test('CAL-18/REL-02: approved correction applies atomically once with prior snapshots retained',async()=>{
  const [left,right]=await Promise.all([apply(correction.sourceEventId),apply(correction.sourceEventId)]);
  assert.equal(Number(left.created)+Number(right.created),1);assert.equal(left.id,right.id);
  const result=await read();assert.equal(result.revision,2);assert.equal(result.sourceScore,1000);assert.equal(result.level,2);
  const old=(await sql('SELECT source_score,level FROM trust.monthly_reward_snapshots WHERE id=$1',[confirmedSnapshot.id])).rows[0];
  assert.equal(old.source_score,500);assert.equal(old.level,1);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_snapshot_corrections WHERE id=$1',[correction.id])).rowCount,1);
  assert.equal((await apply(correction.sourceEventId)).created,false);
  await assert.rejects(directSnapshot(second,{revision:3,previous:confirmedSnapshot.id,correction:correction.id,event:correction.sourceEventId}),/revision_conflict/);
});

test('REL-02/03: outbox interruption rolls back snapshot and receipt; retry publishes the same canonical assessment once',async()=>{
  const author=await person();const item=await assessment(author);
  await sql(`CREATE FUNCTION system.fail_snapshot_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.event_type='${snapshotEvent}' THEN RAISE EXCEPTION 'synthetic snapshot interrupted';END IF;RETURN NEW;END $$;
    CREATE TRIGGER fail_snapshot_fixture BEFORE INSERT ON system.outbox_events FOR EACH ROW EXECUTE FUNCTION system.fail_snapshot_fixture()`);
  try{await assert.rejects(publish(item.eventId,confirmed),/snapshot interrupted/);
    assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_snapshots WHERE subject_user_id=$1',[author])).rowCount,0);
    assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_snapshot_receipts WHERE event_id=$1',[item.eventId])).rowCount,0);
  }finally{await sql('DROP TRIGGER fail_snapshot_fixture ON system.outbox_events');await sql('DROP FUNCTION system.fail_snapshot_fixture()');}
  assert.equal((await publish(item.eventId,confirmed)).created,true);assert.equal((await publish(item.eventId,confirmed)).created,false);
});

test('REL-02/03: superseded and pre-cutover sources receive terminal receipts without blocking later legitimate work',async()=>{
  const author=await person();const old=await assessment(author);await post(author);const current=await assessment(author);
  await assert.rejects(directSnapshot(old),/revision_conflict/);
  await assert.rejects(tx(client=>client.query(`INSERT INTO trust.monthly_reward_snapshot_receipts
    (event_id,rules_version,mode,subject_user_id,assessment_id,state) VALUES ($1,$2,'confirmed',$3,$4,'published')`,
    [current.eventId,confirmed,author,current.assessmentId])),/receipt_state_invalid/);
  assert.equal((await publish(old.eventId,confirmed)).state,'superseded');assert.equal((await publish(current.eventId,confirmed)).created,true);
  await configure('synthetic-later-cutover',{firstSource:'2026-09-01'});
  assert.equal((await publish(current.eventId,'synthetic-later-cutover')).state,'before_cutover');
  assert.equal((await publish(current.eventId,'synthetic-later-cutover')).state,'before_cutover');
});

test('SEC-01/REL-02: same-subject other-month snapshots cannot certify published or pending receipts',async()=>{
  const author=await person(),august=await assessment(author),snapshot=await publish(august.eventId,confirmed);
  const july=await assessment(author,'2026-07');
  for(const state of ['published','correction_approval_pending','snapshot_policy_requires_review'])
    await assert.rejects(tx(client=>client.query(`INSERT INTO trust.monthly_reward_snapshot_receipts
      (event_id,rules_version,mode,subject_user_id,assessment_id,snapshot_id,state) VALUES ($1,$2,'confirmed',$3,$4,$5,$6)`,
      [july.eventId,confirmed,author,july.assessmentId,snapshot.id,state])),/receipt_state_invalid/);
});

test('CAL-12/SEC-01: even a synthetic future-evaluated shadow assessment cannot bypass the actual server settlement clock',async()=>{
  const author=await person(),currentMonth=(await sql("SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM') AS month")).rows[0].month;
  const future=new Date(`${currentMonth}-01T00:00:00.000Z`);future.setUTCMonth(future.getUTCMonth()+1);future.setUTCDate(8);
  const item=await assessment(author,currentMonth,future.toISOString());
  await assert.rejects(publish(item.eventId,confirmed),/source_not_settled/);
  await assert.rejects(directSnapshot(item),/provenance_required/);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_snapshots WHERE subject_user_id=$1',[author])).rowCount,0);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_snapshot_receipts WHERE event_id=$1',[item.eventId])).rowCount,0);
  await reconcileMonthlyRewardSnapshots(env);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_snapshot_receipts WHERE event_id=$1',[item.eventId])).rowCount,0);
});

test('CAL-01/12: UTC settlement is unchanged in positive and negative database timezones across publisher, SQL guard and reconciler',async t=>{
  const now=new Date((await sql('SELECT clock_timestamp() AS now')).rows[0].now);
  const start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1));
  const elapsed=(now-start)/3600000;
  if(elapsed<1||elapsed>=720){t.skip('A nearest whole-hour settlement fixture requires hours 1–720 within this UTC month');return;}
  const previous=new Date(start);previous.setUTCMonth(previous.getUTCMonth()-1);
  const month=previous.toISOString().slice(0,7);
  for(const [kind,hours,timeZone] of [['future',Math.ceil(elapsed),'Pacific/Kiritimati'],['past',Math.floor(elapsed),'Etc/GMT+12']]){
    const maintenanceVersion=`synthetic-utc-${kind}-maintenance`,rulesVersion=`synthetic-utc-${kind}-snapshot`;
    await sql(`INSERT INTO trust.monthly_maintenance_rule_sets
      (version,policy_version,catalogue_hash,mode,collect_from,configuration,collection_privacy_version)
      VALUES ($1,$2,$3,'shadow','2026-07-01',$4::jsonb,'monthly-privacy-v1')`,
      [maintenanceVersion,policy,hash,JSON.stringify({...maintenance,version:maintenanceVersion,monthSettlementHours:hours})]);
    await configure(rulesVersion,{mode:'confirmed',firstSource:`${month}-01`,maintenanceVersion});
    const evaluatedAt=new Date(start.getTime()+(hours+1)*3600000).toISOString();
    const publisherAuthor=await person(),sqlAuthor=await person(),jobsAuthor=await person();
    const publisherItem=await assessment(publisherAuthor,month,evaluatedAt,maintenanceVersion);
    const sqlItem=await assessment(sqlAuthor,month,evaluatedAt,maintenanceVersion);
    await assessment(jobsAuthor,month,evaluatedAt,maintenanceVersion);
    const publishInZone=()=>tx(client=>publishMonthlyRewardSnapshot(client,{eventId:publisherItem.eventId,rulesVersion}),'lythaus_jobs',timeZone);
    const jobsEnv={DB_JOBS_FRESH:{role:'lythaus_jobs',timeZone},MONTHLY_REPUTATION_SNAPSHOT_RULES:rulesVersion};
    if(kind==='future'){
      await assert.rejects(publishInZone(),/source_not_settled/);
      await assert.rejects(directSnapshot(sqlItem,{rulesVersion,timeZone}),/provenance_required/);
      assert.deepEqual(await reconcileMonthlyRewardSnapshots(jobsEnv),{processed:0});
      assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_snapshots WHERE subject_user_id=ANY($1::uuid[])',
        [[publisherAuthor,sqlAuthor,jobsAuthor]])).rowCount,0);
    }else{
      assert.equal((await publishInZone()).created,true);
      assert.equal((await directSnapshot(sqlItem,{rulesVersion,timeZone})).rowCount,1);
      assert.ok((await reconcileMonthlyRewardSnapshots(jobsEnv)).processed>0);
      assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_snapshots WHERE subject_user_id=ANY($1::uuid[])',
        [[publisherAuthor,sqlAuthor,jobsAuthor]])).rowCount,3);
    }
  }
});

test('CAL-18/REL-02: an approved older correction superseded before delivery drains durably without applying stale evidence',async()=>{
  const author=await person(),initial=await assessment(author),snapshot=await publish(initial.eventId,confirmed);
  await post(author);const earlier=await assessment(author);
  const obsolete=await approve({subjectId:author,snapshotId:snapshot.id,assessmentId:earlier.assessmentId});
  await post(author,'2026-08-10');const current=await assessment(author);
  const fresh=await approve({subjectId:author,snapshotId:snapshot.id,assessmentId:current.assessmentId});
  assert.equal((await apply(obsolete.sourceEventId)).state,'superseded');
  assert.equal((await apply(obsolete.sourceEventId)).state,'superseded');
  assert.equal((await read(author)).sourceScore,0);
  assert.equal((await apply(fresh.sourceEventId)).created,true);assert.equal((await read(author)).sourceScore,500);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_snapshot_receipts WHERE event_id=$1 AND state=$2',[obsolete.sourceEventId,'superseded'])).rowCount,1);
});

test('SEC-01/REL-02: a forged correction event cannot apply an approved private correction',async()=>{
  const event=uuidv7();await sql(`INSERT INTO system.outbox_events (id,event_type,aggregate_type,aggregate_id,actor_id,payload)
    VALUES ($1,$2,'monthly_reward_snapshot_correction',$3,$4,$5::jsonb)`,[event,correctionEvent,correction.id,reviewer,
    JSON.stringify({correctionId:correction.id,policyVersion:policy})]);
  await assert.rejects(apply(event),/canonical_correction/);await sql('DELETE FROM system.outbox_events WHERE id=$1',[event]);
});

test('REL-01/03: a pause and rule replacement cannot silently reuse stale confirmed authority',async()=>{
  await sql('UPDATE system.feature_flags SET enabled=false WHERE flag_key=$1',[flag]);
  assert.equal(await publish(first.eventId,confirmed),null);assert.equal((await read()).state,'unavailable');
  await assert.rejects(approve(),/unavailable/);await sql('UPDATE system.feature_flags SET enabled=true WHERE flag_key=$1',[flag]);
  await assert.rejects(sql('DELETE FROM system.feature_flags WHERE flag_key=$1',[flag]),/privacy_teardown/);
  await assert.rejects(sql("UPDATE system.feature_flags SET policy_version='unapproved' WHERE flag_key=$1",[flag]),/privacy_teardown/);
  await configure('synthetic-replacement-confirmed',{mode:'confirmed'});
  assert.equal((await read(subject,'synthetic-replacement-confirmed')).reasonCode,'snapshot_policy_requires_review');
});

test('REL-01/02: concurrent pause is read freshly before publication and leaves the canonical event resumable',async()=>{
  const author=await person(),item=await assessment(author);
  let reached,resume;const barrier=new Promise(resolve=>{reached=resolve;}),released=new Promise(resolve=>{resume=resolve;});
  const pending=tx(client=>publishMonthlyRewardSnapshot({query:async(text,values)=>{
    if(text==='SELECT * FROM trust.lock_monthly_reward_configuration()'){reached();await released;}
    return client.query(text,values);
  }},{eventId:item.eventId,rulesVersion:confirmed}));
  await barrier;
  try{await sql('UPDATE system.feature_flags SET enabled=false WHERE flag_key=$1',[flag]);}finally{resume();}
  assert.equal(await pending,null);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_snapshots WHERE subject_user_id=$1',[author])).rowCount,0);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_snapshot_receipts WHERE event_id=$1',[item.eventId])).rowCount,0);
  await sql('UPDATE system.feature_flags SET enabled=true WHERE flag_key=$1',[flag]);
  assert.equal((await publish(item.eventId,confirmed)).created,true);
});

test('RPT-04/REL-02: subject deletion after canonical source read but before authorization cannot resurrect a snapshot',async()=>{
  const author=await person(),item=await assessment(author);
  let reached,resume;const barrier=new Promise(resolve=>{reached=resolve;}),released=new Promise(resolve=>{resume=resolve;});
  const pending=tx(client=>publishMonthlyRewardSnapshot({query:async(text,values)=>{
    if(text==='SELECT trust.lock_monthly_reward_subject($1) AS allowed'){reached();await released;}
    return client.query(text,values);
  }},{eventId:item.eventId,rulesVersion:confirmed}));
  await barrier;
  try{await sql("UPDATE identity.users SET status='deleted',deleted_at=now() WHERE id=$1",[author]);}finally{resume();}
  await assert.rejects(pending,/subject_unavailable/);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_snapshots WHERE subject_user_id=$1',[author])).rowCount,0);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_snapshot_receipts WHERE event_id=$1',[item.eventId])).rowCount,0);
});

test('RPT-04/CAL-18: account status deletion preserves accepted points while an approved invalidation appends a correction',async()=>{
  const author=await person();const work=await post(author);const item=await assessment(author);
  const contributionId=(await sql('SELECT id FROM trust.monthly_earning_contributions WHERE source_id=$1',[work.id])).rows[0].id;
  const original=await publish(item.eventId,confirmed);assert.ok(original.sourceScore>0);
  await sql("UPDATE identity.users SET status='deleted',deleted_at=now() WHERE id=$1",[author]);
  assert.deepEqual((await sql('SELECT revision,source_score,level FROM trust.monthly_reward_snapshots WHERE subject_user_id=$1',[author])).rows,
    [{revision:1,source_score:original.sourceScore,level:original.level}]);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_reputation_sources WHERE subject_user_id=$1',[author])).rowCount,1);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_reputation_assessments WHERE id=$1',[item.assessmentId])).rowCount,1);
  assert.ok((await sql('SELECT points FROM trust.monthly_earning_week_revisions WHERE subject_user_id=$1',[author])).rowCount > 0);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_reputation_assemblies WHERE subject_user_id=$1',[author])).rowCount,0);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_maintenance_observations WHERE subject_user_id=$1',[author])).rowCount,0);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_earning_contributions WHERE subject_user_id=$1',[author])).rowCount,0);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_earning_evidence_revisions WHERE contribution_id=$1',[contributionId])).rowCount,0);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_snapshot_receipts WHERE subject_user_id=$1',[author])).rowCount,0);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_snapshot_corrections WHERE subject_user_id=$1',[author])).rowCount,0);
  assert.equal((await sql('SELECT count(*)::int AS n FROM trust.monthly_reward_snapshots WHERE subject_user_id=$1',[author])).rows[0].n,1);
  assert.equal((await sql('SELECT 1 FROM system.outbox_events WHERE actor_id=$1 AND event_type=$2',[author,snapshotEvent])).rowCount,0);
  await assert.rejects(read(author),/subject_unavailable/);await assert.rejects(publish(item.eventId,confirmed),/canonical_assessment/);

  const active=await person();const activeWork=await post(active);const initial=await assessment(active);
  const activeSnapshot=await publish(initial.eventId,confirmed);assert.ok(activeSnapshot.sourceScore>0);
  const invalidationEvent=uuidv7();
  await sql("UPDATE content.posts SET moderation_state='blocked' WHERE id=$1",[activeWork.id]);
  await sql(`INSERT INTO system.outbox_events (id,event_type,aggregate_type,aggregate_id,actor_id,payload)
    VALUES ($1,'moderation.content.blocked','post',$2,$3,'{}'::jsonb)`,[invalidationEvent,activeWork.id,reviewer]);
  await tx(client=>recordMonthlyContentEarning(client,{eventId:invalidationEvent,rulesVersion:weekly.version,evaluatedAt:new Date().toISOString()}));
  const invalidated=await assessment(active);assert.equal(invalidated.calculation.sourceScore,0);
  assert.ok(invalidated.calculation.sourceScore<activeSnapshot.sourceScore);
  assert.equal((await publish(invalidated.eventId,confirmed)).state,'correction_approval_pending');
  const independent=await tx(client=>approveMonthlyRewardSnapshotCorrection(client,{actorId:reviewer,subjectId:active,snapshotId:activeSnapshot.id,
    assessmentId:invalidated.assessmentId,rulesVersion:confirmed,expectedSnapshotRevision:1,reasonCode:'synthetic_independent_invalidation',
    evidenceReference:'synthetic moderation decision',idempotencyKey:uuidv7()}),'lythaus_admin');
  assert.equal(independent.created,true);
  assert.equal((await apply(independent.sourceEventId,confirmed)).created,true);
  const corrected=await read(active);assert.equal(corrected.revision,2);assert.equal(corrected.sourceScore,0);
  assert.equal((await sql('SELECT count(*)::int AS n FROM trust.monthly_reward_snapshot_corrections WHERE subject_user_id=$1',[active])).rows[0].n,1);
});

test('RPT-04/REL-02: status deletion preserves a corrected score chain and removes delivery notices',async()=>{
  const correctionBefore=(await sql('SELECT reason_code,evidence_reference,request_digest FROM trust.monthly_reward_snapshot_corrections WHERE id=$1',[correction.id])).rows[0];
  assert.equal(correctionBefore.evidence_reference,'synthetic-private-correction');
  assert.notEqual(correctionBefore.request_digest,'0'.repeat(64));
  await sql("INSERT INTO system.consumer_inbox (consumer_name,event_id,event_type,payload,state) VALUES ('lythaus-jobs',$1,$2,'{}'::jsonb,'completed')",[correction.sourceEventId,correctionEvent]);
  await sql("UPDATE identity.users SET status='deleted',deleted_at=now() WHERE id=$1",[subject]);
  assert.equal((await sql('SELECT count(*)::int AS n FROM trust.monthly_reward_snapshots WHERE subject_user_id=$1',[subject])).rows[0].n,3);
  const retainedCorrection=(await sql('SELECT reason_code,evidence_reference,request_digest FROM trust.monthly_reward_snapshot_corrections WHERE id=$1',[correction.id])).rows[0];
  assert.equal(retainedCorrection.reason_code,correctionBefore.reason_code);
  assert.equal(retainedCorrection.evidence_reference,'[redacted]');
  assert.equal(retainedCorrection.request_digest,'0'.repeat(64));
  assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_snapshot_corrections WHERE subject_user_id=$1',[subject])).rowCount,1);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_snapshot_receipts WHERE subject_user_id=$1',[subject])).rowCount,0);
  assert.equal((await sql('SELECT 1 FROM system.outbox_events WHERE id=$1',[correction.sourceEventId])).rowCount,0);
  assert.equal((await sql('SELECT 1 FROM system.consumer_inbox WHERE event_id=$1',[correction.sourceEventId])).rowCount,0);
});

test('REL-02/03: real Jobs queue defers while unconfigured and durable reconciliation resumes after transport completion',async()=>{
  const author=await person(),item=await assessment(author);
  statements.length=0;assert.deepEqual(await reconcileMonthlyRewardSnapshots({DB_JOBS_FRESH:binding}),{processed:0});
  assert.equal(await processMonthlyRewardSnapshotEvent({DB_JOBS_FRESH:binding},item.eventId,'trust.monthly_assessment.recorded'),null);
  assert.equal(statements.length,0);
  let acknowledgements=0,retries=0;
  const message={body:{eventId:item.eventId,eventType:'trust.monthly_assessment.recorded',actorId:author,payload:{assessmentId:item.assessmentId,sourceId:item.sourceId,mode:'shadow'}},
    ack(){acknowledgements++;},retry(){retries++;}};
  await jobs.queue({messages:[message],queue:'synthetic-monthly-snapshot'},{DB_JOBS_FRESH:binding});
  assert.equal(acknowledgements,1);assert.equal(retries,0);
  assert.equal((await sql('SELECT state FROM system.consumer_inbox WHERE event_id=$1',[item.eventId])).rows[0].state,'completed');
  assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_snapshots WHERE subject_user_id=$1',[author])).rowCount,0);
  assert.ok((await reconcileMonthlyRewardSnapshots(env)).processed>0);
  assert.equal((await read(author)).state,'confirmed');assert.equal((await read(author)).sourceScore,0);
  assert.deepEqual(await reconcileMonthlyRewardSnapshots(env),{processed:0});
});
