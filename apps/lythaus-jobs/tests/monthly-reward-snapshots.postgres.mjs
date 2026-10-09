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
import { assembleMonthlyReputation,assemblePreparedMonthlyReputation } from '../../../packages/db/src/monthly-assembly.ts';
import { assessMonthlyReputationSource,assessPreparedMonthlyReputationSource } from '../../../packages/db/src/monthly-reputation.ts';
import { PROSPECTIVE_REPUTATION_CONFIGURATION, PROSPECTIVE_REPUTATION_POLICY_VERSION as policyV2,
  PROSPECTIVE_REPUTATION_CATALOGUE_HASH as hashV2 } from '../../../packages/contracts/src/monthly-reputation-prospective.ts';
import { QUARTERLY_CALENDAR_AMENDMENT_VERSION } from '../../../packages/contracts/src/monthly-quarterly-policy.ts';
import { recordMonthlyEmailControl } from '../../../packages/db/src/monthly-maintenance.ts';
import { readOwnMonthlyReputationReport } from '../../../packages/db/src/monthly-reputation-report.ts';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readOwnMonthlyReputationReportResponsePreparation, readOwnMonthlyRewardsResponsePreparation } from '../../../packages/db/src/monthly-rewards-response-preparation.ts';
import { MONTHLY_REWARDS_RESPONSE_PREPARATION_SCHEMA } from '../../../packages/contracts/src/monthly-rewards-response-preparation-schema.ts';
import { serializeMonthlyReputationReportCsv } from '../../lythaus-public-api/src/monthly-reputation-report-export.ts';
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
    const result=await work({connectionParameters:client.connectionParameters,
      query:(text,values)=>{statements.push(text);return client.query(text,values);}});
    await client.query('COMMIT');return result;
  }catch(error){await client.query('ROLLBACK');throw error;}finally{await client.end();}
}
const sql=(text,values)=>tx(client=>client.query(text,values),null);
const clockProfile=process.env.LYTHAUS_MONTHLY_SNAPSHOT_CLOCK_PROFILE??'auto';
if(!['auto','settled'].includes(clockProfile))throw new Error('snapshot_clock_profile_invalid');
const clockEvidence=(await sql(`SELECT clock_timestamp() AS server_clock,
  clock_timestamp() >= '2026-11-04T00:00:00.000Z'::timestamptz AS positive_settlement_available,
  current_setting('server_version_num') AS server_version,current_database() AS database`)).rows[0];
if(clockProfile==='settled'&&!clockEvidence.positive_settlement_available)
  throw new Error('snapshot_positive_profile_requires_actual_postgresql_settlement_clock');
const preparedPositiveTest=(name,work)=>test(name,{skip:!clockEvidence.positive_settlement_available
  &&'Positive v2 settlement not exercised: actual PostgreSQL clock is before 2026-11-04; use the isolated settled profile'},work);
const disabledPreparation={preparationOnly:true,runtimeActivationAllowed:false,appliedPoints:0};
const preparedReadMetadata={...disabledPreparation,policyVersion:policyV2,dataVersion:2,catalogueHash:hashV2,maximumSourceMonth:13650};
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
let subject,reviewer,first,shadowSnapshot,confirmedSnapshot,second,correction,historicalUpgradeEvidence;
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
  await tx(async client=>recordMonthlyContentEarning(client,{eventId:event,rulesVersion:weekly.version,
    evaluatedAt:(await sql('SELECT clock_timestamp() AS now')).rows[0].now.toISOString()}));
  return { id, event, caseId };
}
async function assessment(author=subject,month='2026-08',evaluatedAt,maintenanceVersion=maintenance.version){
  evaluatedAt??=(await sql('SELECT clock_timestamp() AS now')).rows[0].now.toISOString();
  const assembly=await tx(client=>assembleMonthlyReputation(client,{subjectUserId:author,sourceMonth:month,
    weeklyRulesVersion:weekly.version,maintenanceRulesVersion:maintenanceVersion,evaluatedAt}));
  const requested=(await sql("SELECT id FROM system.outbox_events WHERE aggregate_id=$1 AND event_type='trust.monthly_assessment.requested'",[assembly.sourceId])).rows[0].id;
  const result=await tx(client=>assessMonthlyReputationSource(client,{eventId:requested,assessmentId:uuidv7(),resultEventId:uuidv7(),evaluatedAt}));
  const event=(await sql("SELECT id FROM system.outbox_events WHERE aggregate_id=$1 AND event_type='trust.monthly_assessment.recorded'",[result.id])).rows[0].id;
  return {eventId:event,assessmentId:result.id,sourceId:assembly.sourceId,calculation:result.calculation};
}
before(async()=>{
  const upgrades=[];
  for(const role of ['lythaus_jobs','lythaus_admin','lythaus_runtime'])
    if(!(await sql('SELECT has_table_privilege($1,$2,$3) AS allowed',[role,'system.feature_flags','SELECT'])).rows[0].allowed)
      grants.push(`REVOKE SELECT ON system.feature_flags FROM ${role}`);
  for(const proposal of ['monthly_reputation_shadow','monthly_reputation_earning','monthly_reputation_maintenance','monthly_reward_snapshots']){
    const contents=readFileSync(new URL(`../../../database/planetscale/proposals/${proposal}.sql`,import.meta.url),'utf8');
    const marker=contents.indexOf('\n-- Disabled forward proposal');
    if(marker>=0){await sql(contents.slice(0,marker));upgrades.push(contents.slice(marker));}else await sql(contents);
  }
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
  await sql('INSERT INTO system.feature_flags (flag_key,enabled,policy_version) VALUES ($1,true,$2)',[flag,policy]);
  await configure('synthetic-upgrade-historical-v1');
  const legacyAuthor=await person(),legacy=await assessment(legacyAuthor);
  const snapshot=await publish(legacy.eventId,'synthetic-upgrade-historical-v1');
  const history=async()=>({
    source:(await sql('SELECT input,input_digest,policy_version,catalogue_hash,revision FROM trust.monthly_reputation_sources WHERE id=$1',[legacy.sourceId])).rows[0],
    assessment:(await sql('SELECT calculation,source_score,quarterly_points,policy_version FROM trust.monthly_reputation_assessments WHERE id=$1',[legacy.assessmentId])).rows[0],
    assembly:(await sql('SELECT report,evidence_digest,policy_version FROM trust.monthly_reputation_assemblies WHERE source_id=$1',[legacy.sourceId])).rows[0],
    snapshot:(await sql('SELECT source_score,level,policy_version,revision,source_month,effective_month FROM trust.monthly_reward_snapshots WHERE id=$1',[snapshot.id])).rows[0],
  });
  const beforeUpgrade=await history();
  for(const upgrade of upgrades)await sql(upgrade);
  historicalUpgradeEvidence={before:beforeUpgrade,after:await history(),snapshotId:snapshot.id};
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
  await sql('DELETE FROM identity.email_credentials WHERE user_id=ANY($1::uuid[])',[subjects]);
  await sql('DELETE FROM identity.users WHERE id=ANY($1::uuid[])',[subjects]);
});

test('PAR-04/REL-03: snapshot publisher is dormant without an explicit approved privacy-ready configuration',async()=>{
  statements.length=0;assert.equal(await tx(client=>publishMonthlyRewardSnapshot(client,{eventId:first.eventId})),null);
  assert.equal(await tx(client=>monthlyRewardSnapshotConfiguration(client)),null);assert.equal(statements.length,0);
  assert.equal(await publish(first.eventId,shadow),null);
  const dormant=await person();await sql('ALTER TABLE trust.monthly_reward_snapshots RENAME TO monthly_reward_snapshots_fixture_hidden');
  await sql("UPDATE identity.users SET status='deleted',deleted_at=now() WHERE id=$1",[dormant]);
  await sql('ALTER TABLE trust.monthly_reward_snapshots_fixture_hidden RENAME TO monthly_reward_snapshots');
  await sql('INSERT INTO system.feature_flags (flag_key,enabled,policy_version) VALUES ($1,true,$2) ON CONFLICT (flag_key) DO UPDATE SET enabled=true',[flag,policy]);
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
  assert.deepEqual(shadowSnapshot,{id:shadowSnapshot.id,revision:1,sourceMonth:'2026-08',effectiveMonth:'2026-09',
    level:1,sourceScore:500,mode:'shadow',created:true});
  assert.deepEqual(await publish(first.eventId),{state:'published',id:shadowSnapshot.id,mode:'shadow',created:false});
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
  assert.deepEqual(correction,{id:correction.id,sourceEventId:correction.sourceEventId,created:true});
  assert.deepEqual(left.created?right:left,{id:correction.id,sourceEventId:correction.sourceEventId,created:false});
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
  assert.deepEqual(left.created?right:left,{state:'published',id:left.id,mode:'confirmed',created:false});
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
  await tx(async client=>recordMonthlyContentEarning(client,{eventId:invalidationEvent,rulesVersion:weekly.version,
    evaluatedAt:(await sql('SELECT clock_timestamp() AS now')).rows[0].now.toISOString()}));
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

const disposable={mode:'disposable_local_pg17'};
const preparationConfiguration={...PROSPECTIVE_REPUTATION_CONFIGURATION,
  prospectiveFrom:'2026-10-07T20:12:31.000Z',firstSourceMonth:'2026-10',
  rubricVersion:'synthetic-suggestion-rubric',authorityVersion:'synthetic-support-authority'};
const preparedRules='synthetic-disabled-snapshot-v2';
const preparePublish=(eventId,rulesVersion=preparedRules)=>tx(client=>publishMonthlyRewardSnapshot(client,{eventId,rulesVersion},disposable));
const prepareApply=(eventId,rulesVersion=preparedRules)=>tx(client=>applyMonthlyRewardSnapshotCorrection(client,{eventId,rulesVersion},disposable));
const prepareApprove=(patch)=>tx(client=>approveMonthlyRewardSnapshotCorrection(client,{
  actorId:reviewer,rulesVersion:preparedRules,expectedSnapshotRevision:1,reasonCode:'synthetic_prepared_correction',
  evidenceReference:'synthetic-support-reference',idempotencyKey:uuidv7(),...patch},disposable),'lythaus_admin');
function suggestion(userId){return {eventId:uuidv7(),contributionId:uuidv7(),subjectUserId:userId,reviewerUserId:reviewer,
  privateEvidenceId:uuidv7(),amendmentVersion:QUARTERLY_CALENDAR_AMENDMENT_VERSION,
  rubricVersion:preparationConfiguration.rubricVersion,authorityVersion:preparationConfiguration.authorityVersion,
  revision:1,predecessorEventId:null,decision:'accepted',performedAt:'2026-10-15T12:00:00.000Z',decidedAt:'2026-10-15T12:00:00.000Z',
  useful:true,independentlyReviewed:true,manipulationScreened:true,competingAward:'none'};}
async function preparedAssessment(author,patch={}){
  const assembly=await tx(client=>assemblePreparedMonthlyReputation(client,{subjectUserId:author,sourceMonth:'2026-10',
    weeklyRulesVersion:weekly.version,maintenanceRulesVersion:maintenance.version,evaluatedAt:'2027-06-01T00:00:00.000Z',
    configuration:preparationConfiguration,suggestionRevisions:[],...patch},disposable));
  assert.ok(assembly);
  const requested=(await sql("SELECT id FROM system.outbox_events WHERE aggregate_id=$1 AND event_type='trust.monthly_assessment.requested'",[assembly.sourceId])).rows[0].id;
  const result=await tx(client=>assessPreparedMonthlyReputationSource(client,{eventId:requested,assessmentId:uuidv7(),
    resultEventId:uuidv7(),evaluatedAt:'2027-06-01T00:00:00.000Z'},disposable));
  const event=(await sql("SELECT id FROM system.outbox_events WHERE aggregate_id=$1 AND event_type='trust.monthly_assessment.recorded'",[result.id])).rows[0].id;
  return {eventId:event,assessmentId:result.id,sourceId:assembly.sourceId,calculation:result.calculation};
}
async function configurePrepared(version=preparedRules,patch={}){
  await sql(`INSERT INTO trust.monthly_reward_snapshot_rule_sets
    (version,policy_version,catalogue_hash,mode,status,first_source_month,weekly_rules_version,maintenance_rules_version,
      collection_privacy_version,approved_by,approved_at,approval_reference,preparation_configuration)
    VALUES ($1,$2,$3,$4,'pending_owner_approval',$5,$6,$7,'monthly-privacy-v1',$8,'2026-10-07T20:12:31.000Z','synthetic-only',$9::jsonb)`,
  [version,policyV2,patch.hash??hashV2,patch.mode??'shadow',`${patch.firstSource??'2026-10'}-01`,weekly.version,
    patch.maintenanceVersion??maintenance.version,reviewer,JSON.stringify(patch.configuration??preparationConfiguration)]);
}
const directPreparedSnapshot=(item,patch={})=>tx(client=>client.query(`INSERT INTO trust.monthly_reward_snapshots
  (id,subject_user_id,source_month,effective_month,rules_version,policy_version,mode,revision,supersedes_id,
    assessment_id,source_id,source_revision,source_score,level,correction_id,source_event_id,preparation_only)
  SELECT $1,source.subject_user_id,source.source_month,(source.source_month+interval '1 month')::date,$2,$3,$4,$5,$6,
    assessment.id,source.id,source.revision,$7::integer,$8::smallint,$9,$10,$11
  FROM trust.monthly_reputation_assessments assessment JOIN trust.monthly_reputation_sources source ON source.id=assessment.source_id
  WHERE assessment.id=$12 RETURNING id`,[uuidv7(),patch.rulesVersion??preparedRules,patch.policyVersion??policyV2,patch.mode??'shadow',
    patch.revision??1,patch.previous??null,patch.score??item.calculation.sourceScore,patch.level??item.calculation.level,
    patch.correction??null,patch.event??item.eventId,patch.preparationOnly??true,item.assessmentId]),'lythaus_jobs',patch.timeZone??'UTC');
async function emailPrepared(userId){
  const tokenId=uuidv7(),eventId=uuidv7(),performedAt='2026-10-15T12:00:00.000Z';
  await sql(`INSERT INTO identity.email_credentials
    (user_id,email_ciphertext,email_lookup_hmac,encryption_key_version,hmac_key_version,password_hash,verified_at)
    VALUES ($1,decode('00','hex'),$2,'v1','v1','{}'::jsonb,$3)`,[userId,randomBytes(32),performedAt]);
  await sql(`INSERT INTO identity.email_verification_tokens (id,user_id,token_hash,created_at,expires_at,consumed_at)
    VALUES ($1,$2,$3,$4::timestamptz-interval '1 minute',$4::timestamptz+interval '5 minutes',$4)`,[tokenId,userId,randomBytes(32),performedAt]);
  await sql(`INSERT INTO system.outbox_events (id,event_type,aggregate_type,aggregate_id,actor_id,payload,created_at)
    VALUES ($1,'identity.email.verified','user',$2,$2,'{}'::jsonb,$3)`,[eventId,userId,performedAt]);
  await tx(client=>recordMonthlyEmailControl(client,{sourceEventId:eventId,verificationTokenId:tokenId,rulesVersion:maintenance.version}),'lythaus_runtime');
}

test('V2/I01: transactional forward upgrades preserve populated v1 input/digest/report/snapshot bytes and validated identities',async()=>{
  assert.deepEqual(historicalUpgradeEvidence.after,historicalUpgradeEvidence.before);
  assert.equal((await sql('SELECT preparation_only FROM trust.monthly_reward_snapshots WHERE id=$1',[historicalUpgradeEvidence.snapshotId])).rows[0].preparation_only,false);
  assert.equal((await sql(`SELECT count(*)::integer AS count FROM pg_constraint
    WHERE conname IN ('monthly_assembly_policy_report_v2','monthly_reward_snapshot_caps_v2',
      'monthly_reward_snapshot_supersedes_policy_v2','monthly_reward_snapshot_assessment_policy_v2',
      'monthly_reward_snapshot_rules_policy_v2','monthly_reward_correction_assessment_policy_v2',
      'monthly_reward_correction_rules_policy_v2','monthly_reward_correction_snapshot_policy_v2',
      'monthly_reward_receipt_assessment_policy_v2','monthly_reward_receipt_rules_policy_v2','monthly_reward_rules_policy_v2')
      AND convalidated`)).rows[0].count,11);
});

test('V2 clock evidence: distinguish positive settlement execution from premature-clock refusal',t=>{
  t.diagnostic(JSON.stringify({clockProfile,...clockEvidence,syntheticOnly:true,policyVersion:policyV2,...disabledPreparation}));
  assert.ok(Number(clockEvidence.server_version)>=170000&&Number(clockEvidence.server_version)<180000);
});

test('V2/I08/I12: ordinary publisher, reader and Jobs cannot enter disposable v2 preparation',async()=>{
  await configurePrepared();const author=await person(),item=await preparedAssessment(author);
  assert.equal(await publish(item.eventId,preparedRules),null);
  assert.equal(await apply(item.eventId,preparedRules),null);
  assert.equal((await read(author,preparedRules,'2026-11')).state,'unavailable');
  await assert.rejects(tx(client=>readOwnMonthlyRewardsResponsePreparation(client,
    {subjectId:author,effectiveMonth:'2026-11',snapshotRulesVersion:preparedRules})),/requires_disposable_context/);
  assert.deepEqual(await reconcileMonthlyRewardSnapshots({...env,MONTHLY_REPUTATION_SNAPSHOT_RULES:preparedRules}),{processed:0});
  await assert.rejects(tx(client=>publishMonthlyRewardSnapshot({...client,connectionParameters:{...client.connectionParameters,host:'database.example.invalid'}},
    {eventId:item.eventId,rulesVersion:preparedRules},disposable)),/disposable_local_target/);
  await sql('ALTER TABLE trust.monthly_reward_snapshots RENAME CONSTRAINT monthly_reward_snapshot_caps_v2 TO snapshot_capability_hidden');
  try{assert.equal(await preparePublish(item.eventId),null);}finally{await sql('ALTER TABLE trust.monthly_reward_snapshots RENAME CONSTRAINT snapshot_capability_hidden TO monthly_reward_snapshot_caps_v2');}
  for(const patch of [{mode:'confirmed'},{hash:'0'.repeat(64)},{configuration:{...preparationConfiguration,runtimeActivationAllowed:true}},
    {configuration:{...preparationConfiguration,firstSourceMonth:null}}])
    await assert.rejects(configurePrepared(`synthetic-invalid-${uuidv7()}`,patch),{code:'23514'});
  await sql('UPDATE system.feature_flags SET enabled=false WHERE flag_key=$1',[flag]);
  try{assert.equal(await preparePublish(item.eventId),null);}finally{await sql('UPDATE system.feature_flags SET enabled=true WHERE flag_key=$1',[flag]);}
});

preparedPositiveTest('V2/I04/I05 POSITIVE: actual settlement clock admits one concurrent immutable candidate with exact replay metadata',async()=>{
  const author=await person();await emailPrepared(author);const accepted=suggestion(author);
  const item=await preparedAssessment(author,{suggestionRevisions:[accepted]});assert.equal(item.calculation.quarterlyPoints,1150);
  const results=await Promise.all(Array.from({length:3},()=>preparePublish(item.eventId)));
  const initial=results.find(result=>result.created);assert.ok(initial);
  assert.equal(results.filter(result=>result.created).length,1);
  assert.deepEqual(initial,{id:initial.id,revision:1,sourceMonth:'2026-10',effectiveMonth:'2026-11',
    level:item.calculation.level,sourceScore:1150,mode:'shadow',created:true,...disabledPreparation});
  const replay={state:'published',id:initial.id,mode:'shadow',created:false,...disabledPreparation};
  for(const result of results.filter(result=>!result.created))assert.deepEqual(result,replay);
  const before=(await sql('SELECT * FROM trust.monthly_reward_snapshots WHERE id=$1',[initial.id])).rows[0];
  const readPrepared=()=>tx(client=>readOwnMonthlyRewardSnapshot(client,{subjectId:author,rulesVersion:preparedRules,effectiveMonth:'2026-11'},disposable),'lythaus_runtime');
  const reportPrepared=()=>tx(client=>readOwnMonthlyReputationReport(client,{subjectId:author,sourceMonth:'2026-10',snapshotRulesVersion:preparedRules},disposable),'lythaus_runtime');
  const entitlement=await readPrepared(),report=await reportPrepared();
  const dto=await preparedResponse(author,'2026-10','2026-11');
  assert.equal(dto.report.snapshotProjection.sourceScore,1150);assert.equal(dto.rewards.snapshotProjection.sourceScore,1150);
  assert.equal(dto.report.levelAuthority.level,null);assert.equal(dto.rewards.currentLevel,null);
  assert.equal(entitlement.sourceScore,1150);assert.equal(entitlement.policyVersion,policyV2);
  assert.equal(entitlement.maximumSourceMonth,13650);assert.equal(entitlement.dataVersion,2);
  assert.equal(report.effectiveMonth,'2026-11');assert.equal(report.levelAuthority.sourceScore,1150);
  assert.equal(report.report.quarterlyEmail.points,1000);assert.equal(report.report.quarterlyEmail.maximumPoints,1000);
  assert.equal(report.report.quarterlySuggestion.points,150);assert.equal(report.report.quarterlySuggestion.maximumPoints,150);
  assert.equal(report.report.quarterlySuggestion.validFrom,null);assert.equal(report.report.quarterlySuggestion.validUntil,null);
  assert.equal(report.report.quarterlyTotal.points,1150);assert.equal(report.report.quarterlyTotal.maximumPoints,1150);
  assert.equal(report.report.total.maximumSourceMonth,13650);assert.equal(report.report.total.policyVersion,policyV2);
  assert.equal(report.report.weekly.earningPolicyVersion,policy);assert.equal(report.report.monthly.maintenancePolicyVersion,policy);
  assert.match(report.report.sourceDigest,/^[0-9a-f]{64}$/);assert.match(report.report.assemblyEvidenceDigest,/^[0-9a-f]{64}$/);
  for(const privateValue of [accepted.privateEvidenceId,accepted.eventId,reviewer])assert.ok(!JSON.stringify(report).includes(privateValue));
  assert.throws(()=>serializeMonthlyReputationReportCsv(report),/preparation_required/);
  const csv=serializeMonthlyReputationReportCsv(report,{mode:'disabled_v2_preparation'}),lines=csv.trimEnd().split('\r\n');
  const header=lines[0].split(','),summary=lines[1].slice(1,-1).split('\",\"');
  for(const [column,value] of Object.entries({emailPoints:'1000',suggestionPoints:'150',quarterlyPoints:'1150',
    quarterlyMaximumPoints:'1150',maximumSourceMonth:'13650',dataVersion:'2',runtimeActivationAllowed:'false',appliedPoints:'0'}))
    assert.equal(summary[header.indexOf(column)],value,column);
  assert.ok(lines.some(line=>line.startsWith('"quarterly_suggestion",')));
  await preparedAssessment(author,{sourceMonth:'2027-01',suggestionRevisions:[accepted]});
  assert.deepEqual((await sql('SELECT * FROM trust.monthly_reward_snapshots WHERE id=$1',[initial.id])).rows[0],before);
  assert.deepEqual(await preparePublish(item.eventId),replay);
  assert.deepEqual(await readPrepared(),entitlement);assert.deepEqual(await reportPrepared(),report);
  assert.deepEqual(await preparedResponse(author,'2026-10','2026-11'),dto);
  const futureReport=await tx(client=>readOwnMonthlyReputationReport(client,{subjectId:author,sourceMonth:'2027-01',snapshotRulesVersion:preparedRules},disposable),'lythaus_runtime');
  assert.equal(futureReport.effectiveMonth,'2027-02');assert.equal(futureReport.levelAuthority.reasonCode,'future_month_unconfirmed');
  assert.equal(futureReport.levelAuthority.sourceScore,null);assert.equal(futureReport.report.quarterlyTotal.points,0);
  const futureDto=await preparedResponse(author,'2027-01','2027-02');
  assert.equal(futureDto.report.report.quarterlyTotal.points,0);assert.equal(futureDto.report.levelAuthority.level,null);
  assert.equal(futureDto.rewards.snapshotProjection.reasonCode,'future_month_unconfirmed');
  assert.equal((await sql('SELECT 1 FROM trust.reputation_profiles WHERE user_id=$1',[author])).rowCount,0);
  assert.equal((await read(author,preparedRules,'2026-11')).state,'unavailable');
});

preparedPositiveTest('V2/I03/I07 POSITIVE: same-period policy collision requires review with exact disabled response metadata',async()=>{
  const author=await person(),legacy=await assessment(author,'2026-10','2027-06-01T00:00:00.000Z');
  const item=await preparedAssessment(author);
  const snapshot=await publish(legacy.eventId,shadow);
  assert.deepEqual(await preparePublish(item.eventId),{state:'snapshot_policy_requires_review',id:snapshot.id,
    revision:1,mode:'shadow',created:false,...disabledPreparation});
  assert.deepEqual(await preparePublish(item.eventId),{state:'snapshot_policy_requires_review',id:snapshot.id,
    mode:'shadow',created:false,...disabledPreparation});
  await assert.rejects(prepareApprove({subjectId:author,snapshotId:snapshot.id,assessmentId:item.assessmentId}),/snapshot_revision_conflict/);
  await assert.rejects(tx(client=>client.query(`INSERT INTO trust.monthly_reward_snapshot_corrections
    (id,subject_user_id,snapshot_id,target_assessment_id,rules_version,actor_id,reason_code,evidence_reference,idempotency_key,request_digest,source_event_id,policy_version)
    VALUES ($1,$2,$3,$4,$5,$6,'synthetic_policy_mix','synthetic',$7,repeat('0',64),$8,$9)`,
    [uuidv7(),author,snapshot.id,item.assessmentId,shadow,reviewer,uuidv7(),uuidv7(),policyV2]),'lythaus_admin'),{code:'23503'});
  assert.equal((await sql('SELECT policy_version FROM trust.monthly_reward_snapshots WHERE id=$1',[snapshot.id])).rows[0].policy_version,policy);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_snapshots WHERE subject_user_id=$1',[author])).rowCount,1);
  const mixed=await tx(client=>readOwnMonthlyReputationReport(client,{subjectId:author,sourceMonth:'2026-10',snapshotRulesVersion:preparedRules},disposable),'lythaus_runtime');
  assert.equal(mixed.levelAuthority.reasonCode,'snapshot_policy_requires_review');assert.equal(mixed.levelAuthority.sourceScore,null);
  assert.deepEqual(mixed.corrections.effectiveSnapshots,[]);assert.equal(mixed.report.total.policyVersion,policyV2);
  const mixedDto=await preparedResponse(author,'2026-10','2026-11');
  assert.equal(mixedDto.rewards.snapshotProjection.reasonCode,'snapshot_policy_requires_review');
  assert.equal(mixedDto.rewards.snapshotProjection.sourceScore,null);assert.equal(mixedDto.report.levelAuthority.level,null);
  const legacyOnly=await person();await assessment(legacyOnly,'2026-10','2027-06-01T00:00:00.000Z');
  const preparedDefault=await tx(client=>readOwnMonthlyRewardSnapshot(client,{subjectId:legacyOnly,rulesVersion:preparedRules,effectiveMonth:'2026-11'},disposable),'lythaus_runtime');
  assert.deepEqual(preparedDefault,{state:'pending',reasonCode:'no_previous_assessment',effectiveMonth:'2026-11',level:1,
    levelKind:'unassessed_default',sourceScore:null,sourceMonth:null,snapshotId:null,revision:0,...preparedReadMetadata});
  assert.deepEqual(await read(legacyOnly,shadow,'2026-11'),{state:'pending',reasonCode:'settlement_pending',effectiveMonth:'2026-11'});
  const preparedOnly=await person();await preparedAssessment(preparedOnly);
  assert.deepEqual(await read(preparedOnly,shadow,'2026-11'),{state:'pending',reasonCode:'no_previous_assessment',effectiveMonth:'2026-11',
    level:1,levelKind:'unassessed_default',sourceScore:null,sourceMonth:null,snapshotId:null,revision:0,policyVersion:policy});
  const preparedPending=await tx(client=>readOwnMonthlyRewardSnapshot(client,{subjectId:preparedOnly,rulesVersion:preparedRules,effectiveMonth:'2026-11'},disposable),'lythaus_runtime');
  assert.deepEqual(preparedPending,{state:'pending',reasonCode:'settlement_pending',effectiveMonth:'2026-11',...preparedReadMetadata});
});

preparedPositiveTest('V2/I04/I07 POSITIVE: concurrent corrections and approval/application replays have exact disabled metadata',async()=>{
  const author=await person(),initial=await preparedAssessment(author),accepted=suggestion(author);
  const snapshot=await preparePublish(initial.eventId);
  const corrected=await preparedAssessment(author,{suggestionRevisions:[accepted]});
  assert.deepEqual(await preparePublish(corrected.eventId),{state:'correction_approval_pending',id:snapshot.id,
    revision:1,mode:'shadow',created:false,...disabledPreparation});
  assert.deepEqual(await preparePublish(corrected.eventId),{state:'correction_approval_pending',id:snapshot.id,
    mode:'shadow',created:false,...disabledPreparation});
  const reportPrepared=()=>tx(client=>readOwnMonthlyReputationReport(client,{subjectId:author,sourceMonth:'2026-10',snapshotRulesVersion:preparedRules},disposable),'lythaus_runtime');
  const pending=await reportPrepared();assert.equal(pending.levelAuthority.sourceScore,0);assert.equal(pending.report.total.sourceScore,150);
  const pendingDto=await preparedResponse(author,'2026-10','2026-11');
  assert.equal(pendingDto.report.report.total.sourceScore,150);assert.equal(pendingDto.rewards.snapshotProjection.sourceScore,0);
  assert.equal(pendingDto.report.snapshotProjection.sourceRevision,1);assert.equal(pendingDto.report.report.sourceRevision,2);
  assert.equal(pending.levelAuthority.sourceRevision,1);assert.equal(pending.report.sourceRevision,2);
  const request={subjectId:author,snapshotId:snapshot.id,assessmentId:corrected.assessmentId,idempotencyKey:uuidv7()};
  const approvals=await Promise.all([prepareApprove(request),prepareApprove(request)]);assert.equal(approvals.filter(result=>result.created).length,1);
  const approval=approvals.find(result=>result.created);
  assert.deepEqual(approval,{id:approval.id,sourceEventId:approval.sourceEventId,created:true,...disabledPreparation});
  const approvalReplay={...approval,created:false};
  assert.deepEqual(approvals.find(result=>!result.created),approvalReplay);
  assert.deepEqual(await prepareApprove(request),approvalReplay);
  await assert.rejects(prepareApprove({...request,evidenceReference:'changed'}),/idempotency_reused/);
  await assert.rejects(prepareApprove({...request,actorId:author,idempotencyKey:uuidv7()}),/actor_not_allowed/);
  const applied=await Promise.all([prepareApply(approvals[0].sourceEventId),prepareApply(approvals[0].sourceEventId)]);
  assert.equal(applied.filter(result=>result.created).length,1);
  const candidate=applied.find(result=>result.created);
  assert.deepEqual(candidate,{id:candidate.id,revision:2,sourceMonth:'2026-10',effectiveMonth:'2026-11',
    level:corrected.calculation.level,sourceScore:150,mode:'shadow',created:true,...disabledPreparation});
  const applicationReplay={state:'published',id:candidate.id,mode:'shadow',created:false,...disabledPreparation};
  assert.deepEqual(applied.find(result=>!result.created),applicationReplay);
  assert.deepEqual(await prepareApply(approval.sourceEventId),applicationReplay);
  const chain=(await sql('SELECT * FROM trust.monthly_reward_snapshots WHERE subject_user_id=$1 ORDER BY revision',[author])).rows;
  assert.equal(chain.length,2);assert.equal(chain[0].source_score,0);assert.equal(chain[1].supersedes_id,snapshot.id);
  assert.ok(chain.every(row=>row.policy_version===policyV2&&row.preparation_only&&row.mode==='shadow'));
  const completed=await reportPrepared();assert.equal(completed.levelAuthority.sourceScore,150);
  assert.equal(completed.levelAuthority.sourceRevision,2);assert.equal(completed.levelAuthority.snapshotRevision,2);
  assert.equal(completed.corrections.effectiveSnapshots.length,1);
  assert.ok(completed.corrections.sourceRevisions.every(row=>row.policyVersion===policyV2&&row.dataVersion===2));
  assert.ok(completed.corrections.effectiveSnapshots.every(row=>row.policyVersion===policyV2&&row.dataVersion===2));
  const correctedDto=await preparedResponse(author,'2026-10','2026-11');
  assert.equal(correctedDto.rewards.snapshotProjection.sourceScore,150);assert.equal(correctedDto.rewards.snapshotProjection.snapshotRevision,2);
  assert.equal(correctedDto.report.corrections.effectiveSnapshots.length,1);assert.equal(correctedDto.rewards.currentLevel,null);
  await assert.rejects(prepareApprove({...request,idempotencyKey:uuidv7()}),/snapshot_revision_conflict/);
  await assert.rejects(directPreparedSnapshot(corrected,{previous:snapshot.id,revision:2,correction:approvals[0].id,event:approvals[0].sourceEventId}),/revision_conflict/);
});

test('V2/I03/I04: forged events and policy/configuration mismatch cannot publish candidates',async()=>{
  const author=await person(),item=await preparedAssessment(author),forged=uuidv7();
  await sql(`INSERT INTO system.outbox_events (id,event_type,aggregate_type,aggregate_id,actor_id,payload)
    VALUES ($1,'trust.monthly_assessment.recorded','monthly_reputation_assessment',$2,$3,$4::jsonb)`,
  [forged,item.assessmentId,author,JSON.stringify({assessmentId:item.assessmentId,sourceId:item.sourceId,mode:'shadow'})]);
  await assert.rejects(preparePublish(forged),/canonical_assessment/);
  const changedRules='synthetic-v2-other-authority';await configurePrepared(changedRules,{configuration:{...preparationConfiguration,authorityVersion:'other-authority'}});
  await assert.rejects(preparePublish(item.eventId,changedRules),/source_policy_mismatch/);
  await assert.rejects(directPreparedSnapshot(item,{rulesVersion:changedRules}),/provenance_required/);
});

preparedPositiveTest('V2/I04 POSITIVE: outbox interruption rolls back candidate and receipt before a successful retry',async()=>{
  const author=await person(),item=await preparedAssessment(author);
  await sql(`CREATE FUNCTION system.fail_snapshot_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.event_type='${snapshotEvent}' THEN RAISE EXCEPTION 'synthetic snapshot interrupted';END IF;RETURN NEW;END $$;
    CREATE TRIGGER fail_snapshot_fixture BEFORE INSERT ON system.outbox_events FOR EACH ROW EXECUTE FUNCTION system.fail_snapshot_fixture()`);
  try{await assert.rejects(preparePublish(item.eventId),/snapshot interrupted/);}finally{await sql('DROP TRIGGER fail_snapshot_fixture ON system.outbox_events');await sql('DROP FUNCTION system.fail_snapshot_fixture()');}
  assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_snapshots WHERE subject_user_id=$1',[author])).rowCount,0);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_snapshot_receipts WHERE event_id=$1',[item.eventId])).rowCount,0);
  assert.equal((await preparePublish(item.eventId)).created,true);
  await assert.rejects(directPreparedSnapshot(item,{mode:'confirmed'}),/provenance_required|constraint/);
  await assert.rejects(directPreparedSnapshot(item,{preparationOnly:false}),/provenance_required|constraint/);
});

test('V2 replay metadata: pre-cutover and superseded terminal responses remain explicitly disabled',async()=>{
  const author=await person(),old=await preparedAssessment(author);
  await preparedAssessment(author,{suggestionRevisions:[suggestion(author)]});
  assert.deepEqual(await preparePublish(old.eventId),{state:'superseded',mode:'shadow',created:false,...disabledPreparation});
  assert.deepEqual(await preparePublish(old.eventId),{state:'superseded',id:null,mode:'shadow',created:false,...disabledPreparation});
  const laterRules='synthetic-v2-later-cutover';
  await configurePrepared(laterRules,{firstSource:'2026-11',configuration:{...preparationConfiguration,firstSourceMonth:'2026-11'}});
  assert.deepEqual(await preparePublish(old.eventId,laterRules),{state:'before_cutover',mode:'shadow',created:false,...disabledPreparation});
  assert.deepEqual(await preparePublish(old.eventId,laterRules),{state:'before_cutover',id:null,mode:'shadow',created:false,...disabledPreparation});
});

preparedPositiveTest('V2 replay metadata POSITIVE: existing snapshot and correction lookup responses retain disabled metadata without rewriting history',async()=>{
  const author=await person(),initial=await preparedAssessment(author);
  const snapshotId=(await directPreparedSnapshot(initial)).rows[0].id;
  assert.deepEqual(await preparePublish(initial.eventId),{state:'published',id:snapshotId,revision:1,
    mode:'shadow',created:false,...disabledPreparation});
  assert.deepEqual(await preparePublish(initial.eventId),{state:'published',id:snapshotId,
    mode:'shadow',created:false,...disabledPreparation});
  const alternateRules='synthetic-v2-equivalent-rules';await configurePrepared(alternateRules);
  assert.deepEqual(await preparePublish(initial.eventId,alternateRules),{state:'snapshot_policy_requires_review',id:snapshotId,
    revision:1,mode:'shadow',created:false,...disabledPreparation});
  const corrected=await preparedAssessment(author,{suggestionRevisions:[suggestion(author)]});
  const approval=await prepareApprove({subjectId:author,snapshotId,assessmentId:corrected.assessmentId});
  const correctionId=(await directPreparedSnapshot(corrected,{previous:snapshotId,revision:2,
    correction:approval.id,event:approval.sourceEventId})).rows[0].id;
  const before=(await sql('SELECT * FROM trust.monthly_reward_snapshots WHERE subject_user_id=$1 ORDER BY revision',[author])).rows;
  assert.deepEqual(await prepareApply(approval.sourceEventId),{id:correctionId,revision:2,mode:'shadow',created:false,...disabledPreparation});
  assert.deepEqual(await prepareApply(approval.sourceEventId),{state:'published',id:correctionId,mode:'shadow',created:false,...disabledPreparation});
  assert.deepEqual((await sql('SELECT * FROM trust.monthly_reward_snapshots WHERE subject_user_id=$1 ORDER BY revision',[author])).rows,before);
  assert.equal((await sql('SELECT 1 FROM system.outbox_events WHERE actor_id=$1 AND event_type=$2',[author,snapshotEvent])).rowCount,0);
});

preparedPositiveTest('V2 replay metadata POSITIVE: superseded correction sources retain disabled terminal responses',async()=>{
  const author=await person(),base=await preparedAssessment(author),snapshot=await preparePublish(base.eventId);
  const older=await preparedAssessment(author,{suggestionRevisions:[suggestion(author)]});
  const obsolete=await prepareApprove({subjectId:author,snapshotId:snapshot.id,assessmentId:older.assessmentId});
  await preparedAssessment(author);
  assert.deepEqual(await prepareApply(obsolete.sourceEventId),{state:'superseded',mode:'shadow',created:false,...disabledPreparation});
  assert.deepEqual(await prepareApply(obsolete.sourceEventId),{state:'superseded',id:null,mode:'shadow',created:false,...disabledPreparation});
});

test('V2/I05: future source stays unsettled in opposite timezones despite future evaluation and is deferred by ordinary Jobs',async()=>{
  const now=new Date((await sql('SELECT clock_timestamp() AS now')).rows[0].now);
  const month=now.toISOString().slice(0,7)<'2026-10'?'2026-10':now.toISOString().slice(0,7);
  const author=await person(),item=await preparedAssessment(author,{sourceMonth:month});
  const unconfigured=await tx(client=>readOwnMonthlyRewardSnapshot(client,{subjectId:author,effectiveMonth:item.calculation.effectiveMonth},disposable),'lythaus_runtime');
  assert.deepEqual(unconfigured,{state:'unavailable',reasonCode:'approval_unavailable',effectiveMonth:item.calculation.effectiveMonth,...preparedReadMetadata});
  const attempts=await Promise.allSettled(Array.from({length:3},()=>preparePublish(item.eventId)));
  assert.ok(attempts.every(result=>result.status==='rejected'&&/source_not_settled/.test(result.reason.message)));
  await assert.rejects(prepareApprove({subjectId:author,snapshotId:confirmedSnapshot.id,assessmentId:item.assessmentId}),/source_not_settled/);
  for(const timeZone of ['Pacific/Kiritimati','Etc/GMT+12']){
    await assert.rejects(tx(client=>publishMonthlyRewardSnapshot(client,{eventId:item.eventId,rulesVersion:preparedRules},disposable),'lythaus_jobs',timeZone),/source_not_settled/);
    await assert.rejects(directPreparedSnapshot(item,{timeZone}),/provenance_required/);
    const report=await tx(client=>readOwnMonthlyReputationReport(client,{subjectId:author,sourceMonth:month,snapshotRulesVersion:preparedRules},disposable),'lythaus_runtime',timeZone);
    assert.equal(report.effectiveMonth,item.calculation.effectiveMonth);assert.equal(report.levelAuthority.reasonCode,'future_month_unconfirmed');
    assert.equal(report.levelAuthority.sourceScore,null);
    const direct=await tx(client=>readOwnMonthlyRewardSnapshot(client,{subjectId:author,rulesVersion:preparedRules,effectiveMonth:item.calculation.effectiveMonth},disposable),'lythaus_runtime',timeZone);
    assert.deepEqual(direct,{state:'pending',reasonCode:'future_month_unconfirmed',effectiveMonth:item.calculation.effectiveMonth,...preparedReadMetadata});
    const dto=await preparedResponse(author,month,item.calculation.effectiveMonth,timeZone);
    assert.equal(dto.report.snapshotProjection.sourceScore,null);assert.equal(dto.rewards.currentLevel,null);
    assert.equal(dto.rewards.snapshotProjection.reasonCode,'future_month_unconfirmed');
  }
  assert.deepEqual(await reconcileMonthlyRewardSnapshots({...env,MONTHLY_REPUTATION_SNAPSHOT_RULES:preparedRules}),{processed:0});
  assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_snapshot_receipts WHERE event_id=$1',[item.eventId])).rowCount,0);
});

test('V2/I11: deletion between source read and authorization refuses capture and erases private assembly evidence',async()=>{
  const author=await person(),item=await preparedAssessment(author);
  let reached,resume;const barrier=new Promise(resolve=>{reached=resolve;}),released=new Promise(resolve=>{resume=resolve;});
  const pending=tx(client=>publishMonthlyRewardSnapshot({...client,query:async(text,values)=>{
    const result=await client.query(text,values);
    if(text.includes('WHERE assessment.id = $1 AND source.policy_version')){reached();await released;}
    return result;
  }},{eventId:item.eventId,rulesVersion:preparedRules},disposable));
  await barrier;
  try{await sql("UPDATE identity.users SET status='deleted',deleted_at=now() WHERE id=$1",[author]);}finally{resume();}
  await assert.rejects(pending,/subject_unavailable/);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_snapshots WHERE subject_user_id=$1',[author])).rowCount,0);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_reputation_assemblies WHERE subject_user_id=$1',[author])).rowCount,0);
  await assert.rejects(tx(client=>readOwnMonthlyReputationReport(client,{subjectId:author,sourceMonth:'2026-10',snapshotRulesVersion:preparedRules},disposable),'lythaus_runtime'),/subject_unavailable/);
  await assert.rejects(preparedResponse(author,'2026-10','2026-11'),/subject_unavailable/);
});

const responseAjv=new Ajv({strict:true,allErrors:true});addFormats(responseAjv);
const validatesPreparedResponse=responseAjv.compile(MONTHLY_REWARDS_RESPONSE_PREPARATION_SCHEMA);
async function preparedResponse(subjectId,sourceMonth,effectiveMonth,timeZone='UTC'){
  const responses=await tx(async client=>({
    report:await readOwnMonthlyReputationReportResponsePreparation(client,{subjectId,sourceMonth,snapshotRulesVersion:preparedRules},disposable),
    rewards:await readOwnMonthlyRewardsResponsePreparation(client,{subjectId,effectiveMonth,snapshotRulesVersion:preparedRules},disposable),
  }),'lythaus_runtime',timeZone);
  for(const dto of Object.values(responses)){
    assert.equal(validatesPreparedResponse(dto),true,JSON.stringify(validatesPreparedResponse.errors));
    assert.equal(dto.dataVersion,2);assert.equal(dto.runtimeActivationAllowed,false);assert.equal(dto.appliedPoints,0);
    assert.ok(!JSON.stringify(dto).includes(subjectId));
  }
  return responses;
}
