import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { before, after, test, mock } from 'node:test';
import pg from 'pg';
import * as database from '@lythaus/db';
import { uuidv7 } from '@lythaus/security';
import { MONTHLY_REPUTATION_POLICY_VERSION as policy, MONTHLY_REPUTATION_CATALOGUE_HASH as hash } from '@lythaus/contracts';
import { PROPOSED_WEEKLY_EARNING_RULES as weekly } from '../../../packages/contracts/src/monthly-earning-policy.ts';
import { PROPOSED_MONTHLY_MAINTENANCE_RULES as maintenance } from '../../../packages/contracts/src/monthly-maintenance-policy.ts';
import { monthlyContextConfiguration, recordMonthlyContextReview, requireMonthlyContextIngestionDrained, MONTHLY_CONTEXT_EVENT } from '../../../packages/db/src/monthly-context-review.ts';
import { monthlyContextDependencyCandidates } from '../../../packages/db/src/monthly-context-dependencies.ts';
import { assembleMonthlyReputation } from '../../../packages/db/src/monthly-assembly.ts';

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
const target = new URL(connectionString ?? 'file:///missing');
if (!['127.0.0.1', 'localhost'].includes(target.hostname)
  || !(target.pathname === '/lythaus_monthly_test' || (process.env.GITHUB_ACTIONS === 'true' && target.pathname === '/postgres')))
  throw new Error('Context tests require explicitly local disposable PostgreSQL');
const statements = [], subjects = [], posts = [], comments = [], cases = [], grants = [];
async function tx(work, role = 'lythaus_jobs') {
  const client = new pg.Client({ connectionString, ssl: false }); await client.connect();
  try {
    await client.query('BEGIN'); await client.query("SET LOCAL statement_timeout = '10s'");
    if (role) { assert.ok(['lythaus_jobs', 'lythaus_admin', 'lythaus_runtime'].includes(role)); await client.query(`SET LOCAL ROLE ${role}`); }
    const result = await work({ query: (text, values) => { statements.push(text); return client.query(text, values); } });
    await client.query('COMMIT'); return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { await client.end(); }
}
const sql = (text, values) => tx(client => client.query(text, values), null);
const jobsBinding = { role: 'lythaus_jobs' }, adminBinding = { role: 'lythaus_admin' };
mock.module('@lythaus/db', { namedExports: { ...database,
  transaction: (binding, work) => tx(work, binding.role),
  query: (binding, text, values) => tx(client => client.query(text, values), binding.role),
} });
const { processMonthlyEarningEvent, reconcileMonthlyEarning } = await import('../src/monthly-earning.ts');
const { handleMonthlyContextReview } = await import('../../lythaus-admin-api/src/monthly-context-review.ts');
const rule = 'synthetic-context-approved-v1', rubric = 'synthetic-context-rubric-v1';
const shadowFlag = 'trust.monthly_reputation_shadow', contextFlag = 'trust.monthly_context_review';
const env = { DB_JOBS_FRESH: jobsBinding, MONTHLY_REPUTATION_SHADOW_RULES: weekly.version, MONTHLY_REPUTATION_CONTEXT_RULES: rule };
const adminEnv = { DB_ADMIN_FRESH: adminBinding, MONTHLY_REPUTATION_CONTEXT_RULES: rule };
let subject, reviewer, outsider, first, ownThread, otherThread;
async function person() {
  const id = uuidv7(); subjects.push(id);
  await sql("INSERT INTO identity.users (id, display_name, created_at) VALUES ($1, 'Synthetic context', '2026-07-01')", [id]); return id;
}
async function thread(author = subject) {
  const id = uuidv7(), source = uuidv7(); posts.push(id);
  await sql(`INSERT INTO content.posts (id, author_id, body, declared_creation_mode, visibility, moderation_state, moderation_source_event_id, created_at)
    VALUES ($1, $2, 'Synthetic thread', 'human', 'public', 'allowed', $3, '2026-08-01')`, [id, author, source]);
  return { id, source };
}
async function comment(thread = ownThread, patch = {}) {
  const id = uuidv7(), source = uuidv7(), caseId = uuidv7(); comments.push(id); cases.push(caseId);
  const author = patch.author ?? subject, created = patch.created ?? '2026-08-03T12:00:00.000Z';
  await sql(`INSERT INTO content.comments (id, post_id, parent_id, author_id, body, declared_creation_mode, moderation_state, moderation_source_event_id, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,'allowed',$7,$8)`, [id, thread.id, patch.parent?.id ?? null, author, patch.body ?? `That source clarifies the context ${id}`, patch.mode ?? 'human', source, created]);
  await sql(`INSERT INTO system.outbox_events (id,event_type,aggregate_type,aggregate_id,actor_id,payload,created_at)
    VALUES ($1,'content.comment.created','comment',$2,$3,'{}'::jsonb,$4)`, [source,id,author,created]);
  await sql(`INSERT INTO moderation.cases (id,content_type,content_id,state,policy_version,source_event_id)
    VALUES ($1,'comment',$2,'resolved','synthetic-publication',$3)`, [caseId,id,source]);
  await sql(`INSERT INTO moderation.decisions (id,case_id,outcome,public_label,policy_version,decided_by)
    VALUES ($1,$2,'allow','Human-authored','synthetic-publication',$3)`, [uuidv7(),caseId,reviewer]);
  return { id, source, thread, parent: patch.parent, caseId, author };
}
const command = (item, patch = {}) => ({ commentId:item.id, actorId:reviewer, rulesVersion:rule, rubricVersion:rubric,
  sourceRevisionId:item.source, threadRevisionId:item.thread.source, parentRevisionId:item.parent?.source ?? null,
  decision:'accepted', reasonCode:'synthetic_meaningful_context', evidenceReference:'synthetic-private-evidence',
  expectedRevision:0, idempotencyKey:uuidv7(), ...patch });
const review = input => tx(client => recordMonthlyContextReview(client, input), 'lythaus_admin');
const latest = async (user = subject, start = '2026-08-03') => (await sql(`SELECT * FROM trust.monthly_earning_week_revisions
  WHERE subject_user_id=$1 AND week_start=$2 ORDER BY revision DESC LIMIT 1`, [user,start])).rows[0];
const http = (item, input, environment = adminEnv, actorId = reviewer) => {
  const { commentId, actorId: ignoredActor, rulesVersion, ...body } = input;
  return handleMonthlyContextReview(new Request(`https://admin.lythaus.co/api/admin/reputation/comments/${item.id}/context-review`,
    {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}), environment, actorId, item.id);
};
before(async () => {
  for (const role of ['lythaus_jobs','lythaus_admin','lythaus_runtime']) {
    if (!(await sql('SELECT has_table_privilege($1,$2,$3) AS allowed',[role,'system.feature_flags','SELECT'])).rows[0].allowed)
      grants.push(`REVOKE SELECT ON system.feature_flags FROM ${role}`);
  }
  for (const proposal of ['monthly_reputation_shadow','monthly_reputation_earning','monthly_reputation_maintenance','monthly_reputation_context'])
    await sql(readFileSync(new URL(`../../../database/planetscale/proposals/${proposal}.sql`,import.meta.url),'utf8'));
  subject = await person(); reviewer = await person(); outsider = await person();
  await sql(`INSERT INTO identity.admin_memberships (user_id,role,active,access_subject_hmac)
    VALUES ($1,'moderator',true,$2),($3,'moderator',true,$4)`,[reviewer,randomBytes(32),subject,randomBytes(32)]);
  await sql(`INSERT INTO trust.monthly_earning_rule_sets (version,policy_version,catalogue_hash,mode,collect_from,configuration)
    VALUES ($1,$2,$3,'shadow','2026-08-01',$4::jsonb)`,[weekly.version,policy,hash,JSON.stringify(weekly)]);
  await sql(`INSERT INTO trust.monthly_maintenance_rule_sets (version,policy_version,catalogue_hash,mode,collect_from,configuration,collection_privacy_version)
    VALUES ($1,$2,$3,'shadow','2026-08-01',$4::jsonb,'monthly-privacy-v1')`,[maintenance.version,policy,hash,JSON.stringify(maintenance)]);
  await sql(`INSERT INTO system.feature_flags (flag_key,enabled,policy_version) VALUES ($1,true,$2)`,[shadowFlag,policy]);
  ownThread = await thread(); otherThread = await thread(outsider);
  first = await comment(ownThread,{body:'That source clarifies why.'});
});
after(async () => {
  await sql('DROP TRIGGER IF EXISTS fail_context_fixture ON system.outbox_events');
  await sql('DROP FUNCTION IF EXISTS system.fail_context_fixture()');
  await sql('DROP TRIGGER monthly_context_subject_erasure ON identity.users');
  await sql('DROP TRIGGER monthly_context_flag_preserved ON system.feature_flags');
  await sql('DROP TABLE trust.monthly_context_dependency_receipts, trust.monthly_context_reviews, trust.monthly_context_rule_sets');
  await sql('DROP FUNCTION trust.require_monthly_context_review(), trust.lock_monthly_context_configuration(), trust.lock_monthly_context_actor(uuid,uuid), trust.preserve_monthly_context_flag(), trust.erase_monthly_context_subject()');
  await sql('DROP TRIGGER monthly_email_control_revocation ON identity.email_credentials');
  await sql('DROP TRIGGER monthly_reputation_subject_erasure ON identity.users');
  await sql('DROP TRIGGER monthly_collection_flag_preserved ON system.feature_flags');
  await sql('DROP FUNCTION trust.revoke_monthly_email_control()');
  await sql(`DROP TABLE trust.monthly_reputation_assemblies,trust.monthly_maintenance_revocations,trust.monthly_maintenance_observations,
    trust.monthly_maintenance_rule_sets,trust.monthly_reputation_assessments,trust.monthly_reputation_sources,
    trust.monthly_earning_week_revisions,trust.monthly_earning_receipts,trust.monthly_earning_evidence_revisions,
    trust.monthly_earning_contributions,trust.monthly_earning_rule_sets`);
  await sql('DROP FUNCTION trust.reject_monthly_maintenance_update(),trust.reject_monthly_reputation_update(),trust.reject_monthly_earning_update()');
  await sql('DROP FUNCTION trust.redact_monthly_earning_calculation(jsonb)');
  await sql('DROP FUNCTION trust.require_monthly_reputation_subject(),trust.require_monthly_assessment_subject(),trust.erase_monthly_reputation_subject(),trust.preserve_monthly_collection_flag(),trust.lock_monthly_reputation_subject(uuid)');
  await sql('DELETE FROM system.feature_flags WHERE flag_key IN ($1,$2)',[shadowFlag,contextFlag]);
  for (const grant of grants) await sql(grant);
  await sql('DELETE FROM moderation.decisions WHERE case_id=ANY($1::uuid[])',[cases]);
  await sql('DELETE FROM moderation.cases WHERE id=ANY($1::uuid[])',[cases]);
  await sql('DELETE FROM content.comments WHERE id=ANY($1::uuid[])',[comments]);
  await sql('DELETE FROM content.posts WHERE id=ANY($1::uuid[])',[posts]);
  await sql('DELETE FROM system.consumer_inbox WHERE event_id IN (SELECT id FROM system.outbox_events WHERE actor_id=ANY($1::uuid[]))',[subjects]);
  await sql('DELETE FROM system.outbox_events WHERE actor_id=ANY($1::uuid[])',[subjects]);
  await sql('DELETE FROM identity.admin_memberships WHERE user_id=ANY($1::uuid[])',[subjects]);
  await sql('DELETE FROM identity.users WHERE id=ANY($1::uuid[])',[subjects]);
});

test('PTS-03/SEC-01: context collection is absent by default and needs explicit rubric plus privacy approval',async()=>{
  statements.length=0;
  assert.equal(await tx(client=>monthlyContextConfiguration(client)),null);
  await assert.rejects(http(first,command(first),{DB_ADMIN_FRESH:adminBinding}),/unavailable/);
  assert.equal(statements.length,0);
  const dormant=await person();
  await sql('ALTER TABLE trust.monthly_context_reviews RENAME TO monthly_context_reviews_fixture_hidden');
  await sql("UPDATE identity.users SET status='deleted',deleted_at=now() WHERE id=$1",[dormant]);
  await sql('ALTER TABLE trust.monthly_context_reviews_fixture_hidden RENAME TO monthly_context_reviews');
  statements.length=0;
  assert.equal(await tx(client=>monthlyContextConfiguration(client,rule)),null);
  assert.equal(statements.some(text=>text.includes('trust.monthly_context_')),false);
  await sql('INSERT INTO system.feature_flags (flag_key,enabled,policy_version) VALUES ($1,true,$2)',[contextFlag,policy]);
  await sql(`INSERT INTO trust.monthly_context_rule_sets (version,policy_version,weekly_rules_version,catalogue_hash,rubric_version,mode,status,collect_from)
    VALUES ('synthetic-unapproved',$1,$2,$3,$4,'shadow','pending_owner_approval','2026-08-01')`,[policy,weekly.version,hash,rubric]);
  await assert.rejects(review(command(first,{rulesVersion:'synthetic-unapproved'})),/unavailable/);
  await sql(`INSERT INTO trust.monthly_context_rule_sets (version,policy_version,weekly_rules_version,catalogue_hash,rubric_version,mode,status,
    collect_from,approved_by,approved_at,approval_reference,collection_privacy_version)
    VALUES ($1,$2,$3,$4,$5,'shadow','pending_owner_approval','2026-08-01',$6,'2026-08-01','synthetic-only',$7)`,
    [rule,policy,weekly.version,hash,rubric,reviewer,'monthly-privacy-v1']);
  await assert.rejects(review(command(first,{rubricVersion:'wrong'})),/rubric_mismatch/);
  await processMonthlyEarningEvent(env,first.source);
  assert.equal((await latest()).points,0);
});

test('PTS-03/04/CAL-20: actual handler and concurrent consumer credit a short contextual comment once in its original week',async()=>{
  const input=command(first), responses=await Promise.all([http(first,input),http(first,input)]);
  assert.deepEqual(responses.map(response=>response.status).sort(),[200,201]);
  assert.ok(responses.every(response=>response.headers.get('cache-control')==='private, no-store'));
  const result=await responses[0].json();
  const earning=await Promise.all([processMonthlyEarningEvent(env,result.sourceEventId),processMonthlyEarningEvent(env,result.sourceEventId)]);
  assert.equal(earning.filter(result=>result.processed).length,1);
  const week=await latest(); assert.equal(week.points,400); assert.equal(week.state,'corrected');
  assert.equal(week.calculation.actions.find(row=>row.actionId==='weekly.own_post_comment').points,150);
  assert.equal(week.calculation.actions.find(row=>row.capGroup==='other_discussion').points,0);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_context_reviews WHERE comment_id=$1',[first.id])).rowCount,1);
  assert.equal(JSON.stringify(week.calculation).includes('synthetic-private-evidence'),false);
  await assert.rejects(review({...input,evidenceReference:'different'}),/idempotency_reused/);
});

test('PTS-04/05: own meaningful follow-up shares one award, independent concurrent revisions use compare-and-swap',async()=>{
  const followup=await comment(ownThread,{parent:first,body:'The limitation is the missing date.'});
  const inputs=[command(followup),command(followup)];
  const attempts=await Promise.allSettled(inputs.map(review));
  assert.equal(attempts.filter(result=>result.status==='fulfilled').length,1);
  assert.match(attempts.find(result=>result.status==='rejected').reason.message,/revision_conflict/);
  await processMonthlyEarningEvent(env,attempts.find(result=>result.status==='fulfilled').value.sourceEventId);
  assert.equal((await latest()).points,400);
  const elsewhere=await comment(otherThread);
  await processMonthlyEarningEvent(env,(await review(command(elsewhere))).sourceEventId);
  assert.equal((await latest()).points,550);
});

test('PTS-08/SEC-01: fresh reviewer authority, self-acceptance, unknown client points and direct Jobs writes are rejected',async()=>{
  await assert.rejects(review(command(first,{actorId:subject})),/actor_not_allowed/);
  await assert.rejects(review(command(first,{actorId:outsider})),/actor_not_allowed/);
  const input=command(first,{expectedRevision:1});
  await assert.rejects(http(first,{...input,points:13500}),/unknown_field/);
  await assert.rejects(review({...input,expectedRevision:-1}),/request_invalid/);
  await sql('UPDATE identity.admin_memberships SET active=false WHERE user_id=$1',[reviewer]);
  await assert.rejects(review(input),/actor_not_allowed/);
  await sql('UPDATE identity.admin_memberships SET active=true WHERE user_id=$1',[reviewer]);
  await assert.rejects(tx(client=>client.query('INSERT INTO trust.monthly_context_reviews DEFAULT VALUES')),{code:'42501'});
  await assert.rejects(tx(client=>client.query('UPDATE system.feature_flags SET enabled=false WHERE flag_key=$1',[contextFlag])),{code:'42501'});
});

test('REL-02: interruption between review and outbox rolls both back; the same idempotency key retries durably',async()=>{
  const item=await comment(otherThread,{author:outsider}), input=command(item);
  await sql(`CREATE FUNCTION system.fail_context_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.event_type='${MONTHLY_CONTEXT_EVENT}' THEN RAISE EXCEPTION 'synthetic_context_failure'; END IF; RETURN NEW; END $$`);
  await sql('CREATE TRIGGER fail_context_fixture BEFORE INSERT ON system.outbox_events FOR EACH ROW EXECUTE FUNCTION system.fail_context_fixture()');
  await assert.rejects(review(input),/synthetic_context_failure/);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_context_reviews WHERE comment_id=$1',[item.id])).rowCount,0);
  await sql('DROP TRIGGER fail_context_fixture ON system.outbox_events');
  const result=await review(input); assert.equal(result.created,true); assert.equal((await review(input)).created,false);
  await processMonthlyEarningEvent(env,result.sourceEventId); assert.equal((await latest(outsider)).points,400);
});

test('PTS-11/RPT-04: ordinary soft/hard deletion preserves accepted earning; independent reversal removes dependent awards',async()=>{
  const item=await comment(otherThread,{author:outsider});
  const accepted=await review(command(item)); await processMonthlyEarningEvent(env,accepted.sourceEventId);
  await sql('UPDATE content.comments SET deleted_at=now() WHERE id=$1',[item.id]);
  const deletion=uuidv7();
  await sql(`INSERT INTO system.outbox_events (id,event_type,aggregate_type,aggregate_id,actor_id,payload)
    VALUES ($1,'content.comment.deleted','comment',$2,$3,'{}'::jsonb)`,[deletion,item.id,outsider]);
  await processMonthlyEarningEvent(env,deletion); assert.equal((await latest(outsider)).points,400);
  await sql('DELETE FROM content.comments WHERE id=$1',[item.id]);
  const hardDeletion=uuidv7();
  await sql(`INSERT INTO system.outbox_events (id,event_type,aggregate_type,aggregate_id,actor_id,payload)
    VALUES ($1,'content.comment.deleted','comment',$2,$3,'{}'::jsonb)`,[hardDeletion,item.id,outsider]);
  await processMonthlyEarningEvent(env,hardDeletion); assert.equal((await latest(outsider)).points,400);
  const reversed=await review(command(item,{expectedRevision:1,decision:'reversed',reasonCode:'synthetic_independent_invalidation'}));
  await processMonthlyEarningEvent(env,reversed.sourceEventId);
  const facts=(await latest(outsider)).calculation.evidence;
  assert.equal(facts.find(evidence=>evidence.contextReviewId===reversed.reviewId).state,'reversed');
  assert.equal((await latest(outsider)).points,400);
  const remaining=(await sql(`SELECT r.* FROM trust.monthly_context_reviews r JOIN content.comments c ON c.id=r.comment_id
    WHERE r.subject_user_id=$1 ORDER BY r.recorded_at LIMIT 1`,[outsider])).rows[0];
  const retained={id:remaining.comment_id,source:remaining.source_revision_id,thread:otherThread};
  await processMonthlyEarningEvent(env,(await review(command(retained,{expectedRevision:1,decision:'reversed'}))).sourceEventId);
  assert.equal((await latest(outsider)).points,0); assert.equal((await latest(outsider)).state,'corrected');
});

test('PTS-11: changed thread or parent context invalidates the prior scope; a new independent review is required',async()=>{
  const actor=await person(), parent=await comment(ownThread,{author:actor}), item=await comment(ownThread,{author:actor,parent});
  const accepted=await review(command(item)); await processMonthlyEarningEvent(env,accepted.sourceEventId);
  assert.equal((await latest(actor)).points,400);
  const event=uuidv7();
  await sql("UPDATE content.comments SET body='Changed parent context',moderation_source_event_id=$2 WHERE id=$1",[parent.id,event]);
  parent.source=event;
  await sql(`INSERT INTO system.outbox_events (id,event_type,aggregate_type,aggregate_id,actor_id,payload)
    VALUES ($1,'content.comment.updated','comment',$2,$3,'{}'::jsonb)`,[event,parent.id,actor]);
  await processMonthlyEarningEvent(env,event);
  await reconcileMonthlyEarning(env); assert.equal((await latest(actor)).points,0);
  const acceptedAgain=await review(command(item,{expectedRevision:1}));
  await processMonthlyEarningEvent(env,acceptedAgain.sourceEventId); assert.equal((await latest(actor)).points,400);
  const threadRevision=uuidv7(); await sql('UPDATE content.posts SET moderation_source_event_id=$2 WHERE id=$1',[ownThread.id,threadRevision]);
  await sql(`INSERT INTO system.outbox_events (id,event_type,aggregate_type,aggregate_id,actor_id,payload)
    VALUES ($1,'content.post.updated','post',$2,$3,'{}'::jsonb)`,[threadRevision,ownThread.id,subject]);
  await reconcileMonthlyEarning(env); assert.equal((await latest(actor)).points,0);
  await assert.rejects(review(command(item,{expectedRevision:2})),/scope_changed/);
  await sql('UPDATE content.posts SET moderation_source_event_id=$2 WHERE id=$1',[ownThread.id,ownThread.source]);
});

test('REL-03/RPT-04: removing optional context env preserves an unchanged previously approved contribution',async()=>{
  const event=uuidv7(); await sql(`INSERT INTO system.outbox_events (id,event_type,aggregate_type,aggregate_id,actor_id,payload)
    VALUES ($1,'content.comment.published','comment',$2,$3,'{}'::jsonb)`,[event,first.id,reviewer]);
  const {MONTHLY_REPUTATION_CONTEXT_RULES: removed,...pausedEnv}=env;
  await processMonthlyEarningEvent(pausedEnv,event); assert.equal((await latest()).points,550);
  assert.equal((await latest()).calculation.evidence.find(row=>row.contextReviewId).contextRulesVersion,rule);
});

test('REL-02/03: more than fifty deferred or older-version context events do not starve ordinary publication; resume drains original receipts',async()=>{
  const nextRule='synthetic-backlog-context-v2';
  await sql(`INSERT INTO trust.monthly_context_rule_sets (version,policy_version,weekly_rules_version,catalogue_hash,rubric_version,mode,status,
    collect_from,approved_by,approved_at,approval_reference,collection_privacy_version)
    VALUES ($1,$2,$3,$4,$5,'shadow','pending_owner_approval','2026-08-01',$6,'2026-08-01','synthetic-only','monthly-privacy-v1')`,
    [nextRule,policy,weekly.version,hash,rubric,reviewer]);
  for(const configuredVersion of [undefined,nextRule]){
  const receiver=await person(), pendingItem=await comment(await thread(receiver),{author:receiver});
  const events=[];
  for(let revision=0;revision<52;revision++) events.push((await review(command(pendingItem,{expectedRevision:revision}))).sourceEventId);
  const publisher=await person(), publications=[];
  for(let index=0;index<3;index++){
    const id=uuidv7(),source=uuidv7(),caseId=uuidv7(); posts.push(id);cases.push(caseId);
    await sql(`INSERT INTO content.posts (id,author_id,body,declared_creation_mode,visibility,moderation_state,moderation_source_event_id,created_at)
      VALUES ($1,$2,$3,'human','public','under_review',$4,'2026-08-05')`,[id,publisher,`Independent publication ${id}`,source]);
    await sql(`INSERT INTO system.outbox_events (id,event_type,aggregate_type,aggregate_id,actor_id,payload,created_at)
      VALUES ($1,'content.post.created','post',$2,$3,'{}'::jsonb,'2026-08-05')`,[source,id,publisher]);
    await processMonthlyEarningEvent(env,source);
    await sql(`INSERT INTO moderation.cases (id,content_type,content_id,state,policy_version,source_event_id)
      VALUES ($1,'post',$2,'resolved','synthetic-context-publication',$3)`,[caseId,id,source]);
    await sql(`INSERT INTO moderation.decisions (id,case_id,outcome,public_label,policy_version,decided_by)
      VALUES ($1,$2,'allow','Human-authored','synthetic-context-publication',$3)`,[uuidv7(),caseId,reviewer]);
    await sql("UPDATE content.posts SET moderation_state='allowed' WHERE id=$1",[id]);
    const published=uuidv7();publications.push(published);
    await sql(`INSERT INTO system.outbox_events (id,event_type,aggregate_type,aggregate_id,actor_id,payload)
      VALUES ($1,'content.post.published','post',$2,$3,'{}'::jsonb)`,[published,id,reviewer]);
  }
  const pausedEnv={...env,MONTHLY_REPUTATION_CONTEXT_RULES:configuredVersion};
  if(!configuredVersion) assert.equal(await processMonthlyEarningEvent(pausedEnv,events[0]),null);
  await reconcileMonthlyEarning(pausedEnv);
  assert.equal((await latest(publisher)).points,500);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_earning_receipts WHERE event_id=ANY($1::uuid[])',[publications])).rowCount,3);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_earning_receipts WHERE event_id=ANY($1::uuid[])',[events])).rowCount,0);
  const drain={subjectUserId:receiver,weeklyRulesVersion:weekly.version,startsAt:'2026-07-27T00:00:00.000Z',endsAt:'2026-08-31T00:00:00.000Z'};
  await assert.rejects(tx(client=>requireMonthlyContextIngestionDrained(client,drain)),/context_ingestion_pending/);
  for(let batch=0;batch<4;batch++) await reconcileMonthlyEarning(env);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_earning_receipts WHERE event_id=ANY($1::uuid[])',[events])).rowCount,52);
  assert.equal((await latest(receiver)).points,400);
  assert.equal((await tx(client=>requireMonthlyContextIngestionDrained(client,drain))).version,rule);
  }
});

test('SEC-01: a forged typed source event has no canonical review and cannot alter points or receive a receipt',async()=>{
  const forged=uuidv7(); await sql(`INSERT INTO system.outbox_events (id,event_type,aggregate_type,aggregate_id,actor_id,payload)
    VALUES ($1,$2,'comment',$3,$4,'{"points":13500,"decision":"accepted"}'::jsonb)`,[forged,MONTHLY_CONTEXT_EVENT,first.id,reviewer]);
  await assert.rejects(processMonthlyEarningEvent(env,forged),/canonical_review_required/);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_earning_receipts WHERE event_id=$1',[forged])).rowCount,0);
  await sql('DELETE FROM system.outbox_events WHERE id=$1',[forged]);
});

test('CAL-04/PTS-11: corrections still drain for a locked account and retain its original complete weekly total',async()=>{
  const author=await person(), root=await thread(author), parent=await comment(root,{author}), child=await comment(root,{author,parent});
  await processMonthlyEarningEvent(env,(await review(command(child))).sourceEventId);
  assert.equal((await latest(author)).points,400);
  await sql("UPDATE identity.users SET status='locked' WHERE id=$1",[author]);
  const event=uuidv7(); await sql('UPDATE content.comments SET moderation_source_event_id=$2 WHERE id=$1',[parent.id,event]);
  await sql(`INSERT INTO system.outbox_events (id,event_type,aggregate_type,aggregate_id,actor_id,payload)
    VALUES ($1,'content.comment.updated','comment',$2,$3,'{}'::jsonb)`,[event,parent.id,author]);
  await reconcileMonthlyEarning(env);
  assert.equal((await latest(author)).points,0); assert.equal((await latest(author)).state,'corrected');
  assert.equal((await sql('SELECT 1 FROM trust.monthly_context_dependency_receipts WHERE event_id=$1 AND comment_id=$2',[event,child.id])).rowCount,1);
  assert.equal((await tx(client=>requireMonthlyContextIngestionDrained(client,{subjectUserId:author,weeklyRulesVersion:weekly.version,
    startsAt:'2026-07-27T00:00:00.000Z',endsAt:'2026-08-31T00:00:00.000Z'}))).version,rule);
});

test('REL-02/RPT-04: acceptance survives ordinary purge before delivery; terminal withheld dependencies receive a durable receipt',async()=>{
  const author=await person(), root=await thread(author), accepted=await comment(root,{author}), withheld=await comment(root,{author});
  await processMonthlyEarningEvent(env,accepted.source);
  const yes=await review(command(accepted)), no=await review(command(withheld,{decision:'withheld'}));
  await sql('DELETE FROM content.comments WHERE id IN ($1,$2)',[accepted.id,withheld.id]);
  await processMonthlyEarningEvent(env,yes.sourceEventId);
  assert.equal((await latest(author)).points,400);
  await processMonthlyEarningEvent(env,no.sourceEventId);
  const event=uuidv7(); await sql(`INSERT INTO system.outbox_events (id,event_type,aggregate_type,aggregate_id,actor_id,payload)
    VALUES ($1,'content.post.published','post',$2,$3,'{}'::jsonb)`,[event,root.id,reviewer]);
  await reconcileMonthlyEarning(env);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_context_dependency_receipts WHERE event_id=$1 AND comment_id=ANY($2::uuid[])',[event,[accepted.id,withheld.id]])).rowCount,2);
  assert.equal((await latest(author)).points,400);
  assert.ok(await tx(client=>requireMonthlyContextIngestionDrained(client,{subjectUserId:author,weeklyRulesVersion:weekly.version,
    startsAt:'2026-07-27T00:00:00.000Z',endsAt:'2026-08-31T00:00:00.000Z'})));
  const fresh=await comment(root,{author}), freshReview=await review(command(fresh));
  await sql('DELETE FROM content.comments WHERE id=$1',[fresh.id]);
  await processMonthlyEarningEvent(env,freshReview.sourceEventId);
  assert.equal((await latest(author)).calculation.evidence.find(row=>row.contextReviewId===freshReview.reviewId).state,'accepted');
  const blocked=await comment(root,{author}), blockedReview=await review(command(blocked));
  await sql('DELETE FROM content.comments WHERE id=$1',[blocked.id]);
  await sql(`INSERT INTO moderation.decisions (id,case_id,outcome,public_label,policy_version,decided_by)
    VALUES ($1,$2,'block','Under review','synthetic-independent-block',$3)`,[uuidv7(),blocked.caseId,reviewer]);
  const hold=uuidv7(); await sql(`INSERT INTO system.outbox_events (id,event_type,aggregate_type,aggregate_id,actor_id,payload)
    VALUES ($1,'moderation.content.blocked','comment',$2,$3,'{}'::jsonb)`,[hold,blocked.id,reviewer]);
  await processMonthlyEarningEvent(env,blockedReview.sourceEventId);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_earning_contributions WHERE source_id=$1',[blocked.id])).rowCount,0);
});

test('REL-02/RPT-04: soft deletion before accepted delivery preserves both new and previously pending work through later purge',async()=>{
  for(const pending of [false,true]){
    const author=await person(),root=await thread(author),item=await comment(root,{author});
    if(pending) await processMonthlyEarningEvent(env,item.source);
    const approved=await review(command(item));
    await sql('UPDATE content.comments SET deleted_at=now() WHERE id=$1',[item.id]);
    await processMonthlyEarningEvent(env,approved.sourceEventId);
    assert.equal((await latest(author)).points,400);
    await sql('DELETE FROM content.comments WHERE id=$1',[item.id]);
    const deletion=uuidv7(); await sql(`INSERT INTO system.outbox_events (id,event_type,aggregate_type,aggregate_id,actor_id,payload)
      VALUES ($1,'content.comment.deleted','comment',$2,$3,'{}'::jsonb)`,[deletion,item.id,author]);
    await processMonthlyEarningEvent(env,deletion); assert.equal((await latest(author)).points,400);
  }
});

test('PTS-11/REL-02: a new valid approval supersedes prior withholding or reversal despite deletion before delivery',async()=>{
  for(const decision of ['withheld','reversed']) for(const deletion of ['soft','purge']){
    const author=await person(),root=await thread(author),item=await comment(root,{author});
    await processMonthlyEarningEvent(env,(await review(command(item))).sourceEventId);
    assert.equal((await latest(author)).points,400);
    const invalidated=await review(command(item,{decision,expectedRevision:1}));
    await processMonthlyEarningEvent(env,invalidated.sourceEventId);
    assert.equal((await latest(author)).points,0);
    const accepted=await review(command(item,{expectedRevision:2}));
    if(deletion==='soft') await sql('UPDATE content.comments SET deleted_at=now() WHERE id=$1',[item.id]);
    else await sql('DELETE FROM content.comments WHERE id=$1',[item.id]);
    await processMonthlyEarningEvent(env,accepted.sourceEventId);
    const result=await latest(author);
    assert.equal(result.points,400);
    assert.equal(result.calculation.evidence.find(row=>row.contextReviewId===accepted.reviewId).state,'accepted');
    assert.equal((await processMonthlyEarningEvent(env,invalidated.sourceEventId)).processed,false);
    assert.equal((await latest(author)).points,400);
  }
});

test('PTS-11/REL-02: changing parent or thread before child purge cannot preserve or resurrect stale acceptance',async()=>{
  for(const delivered of [false,true]){
    const author=await person(),root=await thread(author),parent=await comment(root,{author}),child=await comment(root,{author,parent});
    const approved=await review(command(child));
    if(delivered) await processMonthlyEarningEvent(env,approved.sourceEventId);
    const changed=uuidv7();
    await sql('UPDATE content.comments SET moderation_source_event_id=$2 WHERE id=$1',[parent.id,changed]);
    await sql(`INSERT INTO system.outbox_events (id,event_type,aggregate_type,aggregate_id,actor_id,payload)
      VALUES ($1,'content.comment.updated','comment',$2,$3,'{}'::jsonb)`,[changed,parent.id,author]);
    await sql('DELETE FROM content.comments WHERE id=$1',[child.id]);
    if(!delivered) await processMonthlyEarningEvent(env,approved.sourceEventId);
    await reconcileMonthlyEarning(env);
    assert.equal((await latest(author)).points,0);
    assert.equal((await sql('SELECT 1 FROM trust.monthly_context_dependency_receipts WHERE event_id=$1 AND comment_id=$2',[changed,child.id])).rowCount,1);
    if(delivered) assert.ok((await latest(author)).calculation.evidence.some(row=>row.reasonCode==='context_scope_changed'&&row.state==='withheld'));
  }
});

test('REL-03: differing context/weekly collection starts exclude pre-weekly dependency sources consistently',async()=>{
  const lateWeekly={...weekly,version:'synthetic-weekly-late-v1'},lateContext='synthetic-context-late-weekly-v1';
  await sql(`INSERT INTO trust.monthly_earning_rule_sets (version,policy_version,catalogue_hash,mode,collect_from,configuration)
    VALUES ($1,$2,$3,'shadow','2026-08-03',$4::jsonb)`,[lateWeekly.version,policy,hash,JSON.stringify(lateWeekly)]);
  await sql(`INSERT INTO trust.monthly_context_rule_sets (version,policy_version,weekly_rules_version,catalogue_hash,rubric_version,mode,status,
    collect_from,approved_by,approved_at,approval_reference,collection_privacy_version)
    VALUES ($1,$2,$3,$4,$5,'shadow','pending_owner_approval','2026-08-01',$6,'2026-08-01','synthetic-only','monthly-privacy-v1')`,
    [lateContext,policy,lateWeekly.version,hash,rubric,reviewer]);
  const author=await person(),root=await thread(author),item=await comment(root,{author,created:'2026-08-04T12:00:00.000Z'});
  const old=uuidv7(); await sql(`INSERT INTO system.outbox_events (id,event_type,aggregate_type,aggregate_id,actor_id,payload,created_at)
    VALUES ($1,'content.post.published','post',$2,$3,'{}'::jsonb,'2026-08-02')`,[old,root.id,reviewer]);
  const approved=await review(command(item,{rulesVersion:lateContext}));
  const lateEnv={...env,MONTHLY_REPUTATION_SHADOW_RULES:lateWeekly.version,MONTHLY_REPUTATION_CONTEXT_RULES:lateContext};
  await processMonthlyEarningEvent(lateEnv,approved.sourceEventId);
  assert.equal((await latest(author)).points,400);
  assert.equal((await tx(client=>monthlyContextDependencyCandidates(client,lateWeekly.version))).some(row=>row.event_id===old),false);
  assert.equal((await tx(client=>requireMonthlyContextIngestionDrained(client,{subjectUserId:author,weeklyRulesVersion:lateWeekly.version,
    contextRulesVersion:lateContext,startsAt:'2026-07-27T00:00:00.000Z',endsAt:'2026-08-31T00:00:00.000Z'}))).version,lateContext);
});

test('CAL-19/REL-03: first assembly cannot hide pending approved evidence behind an unavailable or later-start env version',async()=>{
  const author=await person(),root=await thread(author),item=await comment(root,{author});
  await processMonthlyEarningEvent(env,item.source);
  const accepted=await review(command(item));
  const assemble=contextRulesVersion=>tx(client=>assembleMonthlyReputation(client,{subjectUserId:author,sourceMonth:'2026-08',
    weeklyRulesVersion:weekly.version,maintenanceRulesVersion:maintenance.version,contextRulesVersion,evaluatedAt:new Date().toISOString()}));
  await assert.rejects(assemble('synthetic-unavailable-v2'),/context_policy_requires_review/);
  await sql(`INSERT INTO trust.monthly_context_rule_sets (version,policy_version,weekly_rules_version,catalogue_hash,rubric_version,mode,status,
    collect_from,approved_by,approved_at,approval_reference,collection_privacy_version)
    VALUES ('synthetic-later-start-v2',$1,$2,$3,$4,'shadow','pending_owner_approval','2026-10-01',$5,'2026-08-01','synthetic-only','monthly-privacy-v1')`,
    [policy,weekly.version,hash,rubric,reviewer]);
  await assert.rejects(assemble('synthetic-later-start-v2'),/context_policy_requires_review/);
  await assert.rejects(assemble(rule),/context_ingestion_pending/);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_reputation_sources WHERE subject_user_id=$1',[author])).rowCount,0);
  await processMonthlyEarningEvent(env,accepted.sourceEventId);
  const report=await assemble(rule);assert.equal(report.created,true);assert.equal(report.report.contextRulesVersion,rule);
  assert.equal((await sql('SELECT input FROM trust.monthly_reputation_sources WHERE id=$1',[report.sourceId])).rows[0].input.weeks.reduce((sum,week)=>sum+week.points,0),400);
});

test('CAL-04/05: late accepted Sunday and Monday work stays in two original whole assigned weeks',async()=>{
  const author=await person(), root=await thread(author);
  for(const created of ['2026-08-30T23:59:59.999Z','2026-08-31T00:00:00.000Z']){
    const item=await comment(root,{author,created});
    await processMonthlyEarningEvent(env,(await review(command(item))).sourceEventId);
  }
  const sunday=await latest(author,'2026-08-24'),monday=await latest(author,'2026-08-31');
  assert.equal(sunday.points,400);assert.equal(sunday.calculation.ownerMonth,'2026-08');
  assert.equal(monday.points,400);assert.equal(monday.calculation.ownerMonth,'2026-09');
});

test('REL-03: pause stops new decisions but retains prior approved earning and guards configuration identity',async()=>{
  await sql('UPDATE system.feature_flags SET enabled=false WHERE flag_key=$1',[contextFlag]);
  await assert.rejects(review(command(first,{expectedRevision:1})),/unavailable/);
  assert.ok(await tx(client=>monthlyContextConfiguration(client,rule,weekly.version,true)));
  const event=uuidv7(); await sql(`INSERT INTO system.outbox_events (id,event_type,aggregate_type,aggregate_id,actor_id,payload)
    VALUES ($1,'content.comment.published','comment',$2,$3,'{}'::jsonb)`,[event,first.id,reviewer]);
  await processMonthlyEarningEvent(env,event); assert.equal((await latest()).points,550);
  await assert.rejects(sql('DELETE FROM system.feature_flags WHERE flag_key=$1',[contextFlag]),/privacy_teardown/);
  await assert.rejects(sql("UPDATE system.feature_flags SET policy_version='wrong' WHERE flag_key=$1",[contextFlag]),/privacy_teardown/);
  await sql('UPDATE system.feature_flags SET enabled=true WHERE flag_key=$1',[contextFlag]);
  assert.ok((await reconcileMonthlyEarning(env)).processed>=0);
  await assert.rejects(sql('UPDATE trust.monthly_context_reviews SET decision=decision'),{code:'55000'});
});

test('REL-02/03: deletion before the fresh authorization lock denies insertion and cannot recreate erased records',async()=>{
  const actor=await person(), item=await comment(otherThread,{author:actor});
  let arrived, resume; const barrier=new Promise(resolve=>{arrived=resolve}), released=new Promise(resolve=>{resume=resolve});
  const pending=tx(client=>recordMonthlyContextReview({query:async(text,values)=>{
    if(text.startsWith('SELECT trust.lock_monthly_context_actor')){arrived();await released;}
    return client.query(text,values);
  }},command(item)),'lythaus_admin');
  await barrier; await sql("UPDATE identity.users SET status='deleted',deleted_at=now() WHERE id=$1",[actor]); resume();
  await assert.rejects(pending,/actor_not_allowed/);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_context_reviews WHERE subject_user_id=$1',[actor])).rowCount,0);
  const erased=await person(), erasedItem=await comment(otherThread,{author:erased}), approved=await review(command(erasedItem));
  await processMonthlyEarningEvent(env,approved.sourceEventId);
  await sql(`INSERT INTO system.consumer_inbox (consumer_name,event_id,event_type,payload)
    VALUES ('synthetic-context',$1,$2,'{}'::jsonb)`,[approved.sourceEventId,MONTHLY_CONTEXT_EVENT]);
  await sql("UPDATE identity.users SET status='deleted',deleted_at=now() WHERE id=$1",[erased]);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_context_reviews WHERE subject_user_id=$1',[erased])).rowCount,0);
  assert.equal((await sql('SELECT 1 FROM system.outbox_events WHERE id=$1',[approved.sourceEventId])).rowCount,0);
  assert.equal((await sql('SELECT 1 FROM system.consumer_inbox WHERE event_id=$1',[approved.sourceEventId])).rowCount,0);
  assert.ok((await sql('SELECT 1 FROM trust.monthly_earning_week_revisions WHERE subject_user_id=$1',[erased])).rowCount>0);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_earning_contributions WHERE subject_user_id=$1',[erased])).rowCount,0);
});
