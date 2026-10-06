import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { before, after } from 'node:test';
import pg from 'pg';
import { generateKeyPair, exportJWK, exportPKCS8, jwtVerify, SignJWT } from 'jose';
import { hmacLookup, signAccessToken, uuidv7 } from '../../security/src/index.ts';
import { loadApprovedMigrations } from '../../../scripts/ci/planetscale-migration-manifest.mjs';
import { supportAuthentication } from '../src/support-feedback-auth.ts';
import { createSupportService } from '../src/support-feedback.ts';
import { parseSupportServicePolicy } from '../src/support-feedback-policy.ts';
import { exportSupportForPrivacy, exportSupportMessagesForPrivacy, purgeSupportForPrivacy, retainSupportBatch, loadSupportNotificationCandidate } from '../src/support-feedback-privacy.ts';

const supplied=process.env.SUPPORT_LOCAL_PG_URL;
if(!supplied)throw new Error('support_tests_require_disposable_local_pg17');
const url=new URL(supplied);
if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||!/^\/lythaus_support_test/.test(url.pathname))throw new Error('support_tests_refuse_nonlocal_database');
const root=process.cwd(),database=`lythaus_support_test_${uuidv7().replaceAll('-','')}`;
const local=new URL(url);local.pathname=`/${database}`;
let control,privateKey,publicKey,jwks;
const policy=()=>({version:'local_fixture_v1',contract:{limits:{titleBytes:128,detailBytes:512,stepsBytes:256,contextBytes:64,memberMessageBytes:256},
  categories:{problem:['display','account'],suggestion:['navigation']},states:{problem:['submitted','investigating','resolved'],suggestion:['submitted','accepted','declined']}},
  initial:{problem:'submitted',suggestion:'submitted'},evidenceTypes:['verification','usefulness'],
  transitions:[{kind:'problem',from:'submitted',to:'investigating',terminal:false,reasons:['investigate'],evidenceTypes:[]},
    {kind:'problem',from:'submitted',to:'resolved',terminal:true,reasons:['verified'],evidenceTypes:['verification']},
    {kind:'problem',from:'investigating',to:'resolved',terminal:true,reasons:['verified'],evidenceTypes:['verification']},
    {kind:'suggestion',from:'submitted',to:'accepted',terminal:true,reasons:['useful'],evidenceTypes:['usefulness']}],
  limits:{page:3,messages:2,privateItems:2,messageBytes:256,noteBytes:256,evidenceBytes:256,referenceBytes:128,rateWindowSeconds:3600,memberMutations:30,ownerMutations:40},
  privacy:{retentionSeconds:3600,batch:3,requestStates:['processing'],deleteAudit:true}});
const problem=()=>({kind:'problem',category:'display',title:'Synthetic clipping report',actual:'Synthetic last line hidden.',expected:'Synthetic all text visible.'});
const suggestion=()=>({kind:'suggestion',category:'navigation',title:'Synthetic Help suggestion',improvement:'Separate entry points.',benefit:'Find the correct private history.'});
const roles=['lythaus_runtime','lythaus_admin','lythaus_privacy','lythaus_jobs','lythaus_migrations','lythaus_support_lock_fixture'];
async function connection(role) {
  const c=new pg.Client({connectionString:local.toString(),ssl:false});await c.connect();
  await c.query("SET statement_timeout='7s'");if(role){assert.ok(roles.includes(role));await c.query(`SET ROLE ${role}`);}return c;
}
function runner(role,options={}) {
  return async work=>{
    const c=await connection(role);const query=c.query.bind(c);
    if(options.onClient)options.onClient(c);
    if(options.afterOwnerLock||options.afterSubjectLock||options.afterCandidates||options.afterRetentionCandidates||options.captureQuery)c.query=async(...args)=>{const result=await query(...args);if(options.captureQuery)options.captureQuery(args,result);if(options.afterOwnerLock&&typeof args[0]==='string'&&args[0].includes('SELECT support.lock_owner'))await options.afterOwnerLock(c);if(options.afterSubjectLock&&typeof args[0]==='string'&&args[0]==='SELECT id FROM identity.users WHERE id=$1 FOR UPDATE')await options.afterSubjectLock(c);if(options.afterCandidates&&typeof args[0]==='string'&&args[0].includes('ORDER BY r.created_at DESC,r.id DESC LIMIT $6'))await options.afterCandidates(c);if(options.afterRetentionCandidates&&typeof args[0]==='string'&&args[0].startsWith('WITH next_subject'))await options.afterRetentionCandidates(c);return result;};
    try {await c.query('BEGIN');if(options.failOutbox)await c.query("SET LOCAL support_fixture.fail_outbox='on'");if(options.failCommit)await c.query("SET LOCAL support_fixture.fail_commit='on'");if(options.failAudit)await c.query("SET LOCAL support_fixture.fail_audit='on'");if(options.failScrub)await c.query("SET LOCAL support_fixture.fail_scrub='on'");
      const value=await work(c);await c.query('COMMIT');return value;
    } catch(error){await c.query('ROLLBACK').catch(()=>undefined);throw error;}finally{await c.end();}
  };
}
async function blocked(pid) {
  const deadline=Date.now()+4000;
  while(Date.now()<deadline){if((await control.query('SELECT cardinality(pg_blocking_pids($1))>0 AS blocked',[pid])).rows[0].blocked)return;await new Promise(r=>setTimeout(r,10));}
  assert.fail('Expected an actual PostgreSQL lock wait');
}
function gate(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
const rejected=(work,code)=>assert.rejects(work,e=>e.message===code&&!JSON.stringify(e).includes('PRIVATE_SENTINEL'));
before(async()=>{
  const bootstrap=new pg.Client({connectionString:url.toString(),ssl:false});await bootstrap.connect();
  assert.equal((await bootstrap.query('SHOW server_version_num')).rows[0].server_version_num.slice(0,2),'17');
  for(const role of roles)await bootstrap.query(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF; END $$`);
  await bootstrap.query(`CREATE DATABASE ${database}`);await bootstrap.end();control=await connection();
  for(const migration of loadApprovedMigrations({root}).migrations)await control.query(migration.contents.toString());
  await control.query(await readFile(`${root}/database/planetscale/grants/roles.sql`,'utf8'));
  await control.query(await readFile(`${root}/database/planetscale/proposals/support-feedback.local.sql`,'utf8'));
  await control.query(`GRANT USAGE ON SCHEMA identity,support TO lythaus_support_lock_fixture;
    GRANT SELECT,UPDATE(id) ON identity.users TO lythaus_support_lock_fixture;
    GRANT SELECT,UPDATE(user_id) ON identity.admin_memberships TO lythaus_support_lock_fixture;
    GRANT SELECT,INSERT,UPDATE ON system.idempotency_keys TO lythaus_support_lock_fixture;
    GRANT USAGE ON SCHEMA system TO lythaus_support_lock_fixture;
    GRANT CREATE ON SCHEMA support TO lythaus_support_lock_fixture;
    ALTER FUNCTION support.lock_owner(bytea) OWNER TO lythaus_support_lock_fixture;
    ALTER FUNCTION support.claim_owner_idempotency(uuid,text,text,text) OWNER TO lythaus_support_lock_fixture;
    ALTER FUNCTION support.finish_owner_idempotency(uuid,text,text,text,uuid,integer,uuid) OWNER TO lythaus_support_lock_fixture;
    REVOKE CREATE ON SCHEMA support FROM lythaus_support_lock_fixture;`);
  await control.query(`CREATE FUNCTION support.fixture_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF current_setting('support_fixture.fail_outbox',true)='on' THEN RAISE EXCEPTION 'PRIVATE_SENTINEL'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fixture_outbox_failure BEFORE INSERT ON system.outbox_events FOR EACH ROW EXECUTE FUNCTION support.fixture_failure();
    CREATE FUNCTION support.fixture_commit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF current_setting('support_fixture.fail_commit',true)='on' THEN RAISE EXCEPTION 'PRIVATE_SENTINEL'; END IF; RETURN NEW; END $$;
    CREATE CONSTRAINT TRIGGER fixture_commit_failure AFTER INSERT ON system.outbox_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION support.fixture_commit_failure();`);
  await control.query(`CREATE FUNCTION support.fixture_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF current_setting('support_fixture.fail_audit',true)='on' THEN RAISE EXCEPTION 'PRIVATE_SENTINEL'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fixture_audit_failure BEFORE INSERT ON system.audit_events FOR EACH ROW EXECUTE FUNCTION support.fixture_audit_failure();`);
  await control.query(`CREATE FUNCTION support.fixture_scrub_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF current_setting('support_fixture.fail_scrub',true)='on' THEN RAISE EXCEPTION 'PRIVATE_SENTINEL'; END IF; RETURN OLD; END $$;
    CREATE TRIGGER fixture_scrub_failure BEFORE DELETE ON support.notes FOR EACH ROW EXECUTE FUNCTION support.fixture_scrub_failure();`);
  ({privateKey,publicKey}=await generateKeyPair('ES256',{extractable:true}));const publicJwk=await exportJWK(publicKey);publicJwk.kid='local-fixture';jwks=JSON.stringify({keys:[publicJwk]});
});
after(async()=>{
  if(control)await control.end();const c=new pg.Client({connectionString:url.toString(),ssl:false});await c.connect();
  await c.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1',[database]);await c.query(`DROP DATABASE ${database}`);await c.end();
});
async function fixture(t,custom=policy()) {
  const member=uuidv7(),other=uuidv7(),owner=uuidv7(),admin=uuidv7(),subject=`local-owner-${owner}`,adminSubject=`local-admin-${admin}`;
  const ids=[member,other,owner,admin];for(const user of ids)await control.query('INSERT INTO identity.users(id) VALUES($1)',[user]);
  for(const [user,accessSubject,role] of [[owner,subject,'owner'],[admin,adminSubject,'administrator']])await control.query('INSERT INTO identity.admin_memberships(user_id,role,active,access_subject_hmac) VALUES($1,$2,true,decode($3,\'base64\'))',[user,role,hmacLookup(accessSubject,'local-fixture-secret')]);
  const auth=supportAuthentication({JWT_PUBLIC_JWKS:jwks,ACCESS_JWKS_URL:'https://local-fixture.example.invalid/certs',ACCESS_AUDIENCES:'local-owner',ACCESS_TEAM_DOMAIN:'local-fixture.example.invalid',ACCESS_SUBJECT_HMAC_KEY:'local-fixture-secret'},
    async(token,config)=>(await jwtVerify(token,publicKey,{algorithms:['ES256'],audience:config.ACCESS_AUDIENCES,issuer:`https://${config.ACCESS_TEAM_DOMAIN}`})).payload);
  async function memberRequest(user=member,key=uuidv7(),version=1,claimedRoles=[]) {
    const token=await signAccessToken({userId:user,privateKeyPem:await exportPKCS8(privateKey),keyId:'local-fixture',tokenVersion:version,roles:claimedRoles});
    return new Request('https://local-fixture.example.invalid/support',{headers:{authorization:`Bearer ${token}`,'idempotency-key':key}});
  }
  async function ownerRequest(accessSubject=subject,key=uuidv7()) {
    const assertion=await new SignJWT({}).setProtectedHeader({alg:'ES256'}).setSubject(accessSubject).setIssuer('https://local-fixture.example.invalid').setAudience('local-owner').setIssuedAt().setExpirationTime('5m').sign(privateKey);
    return new Request('https://local-fixture.example.invalid/support',{headers:{'cf-access-jwt-assertion':assertion,'idempotency-key':key}});
  }
  const service=(channel,options={})=>createSupportService({authentication:auth,runTransaction:runner(channel==='member'?'lythaus_runtime':'lythaus_admin',options),policy:custom});
  t.after(async()=>{
    await control.query('DELETE FROM support.requests WHERE submitter_id=ANY($1::uuid[])',[ids]);
    await control.query('DELETE FROM system.outbox_events WHERE actor_id=ANY($1::uuid[])',[ids]);
    await control.query('DELETE FROM system.idempotency_keys WHERE actor_id=ANY($1::uuid[])',[ids]);
    await control.query('DELETE FROM privacy.legal_holds WHERE subject_id=ANY($1::uuid[])',[ids]);
    await control.query('DELETE FROM privacy.requests WHERE subject_id=ANY($1::uuid[])',[ids]);
    await control.query('DELETE FROM identity.admin_memberships WHERE user_id=ANY($1::uuid[])',[ids]);
    await control.query('DELETE FROM identity.users WHERE id=ANY($1::uuid[])',[ids]);
  });
  const submit=async(body=problem(),key=uuidv7(),user=member)=>service('member').submit(await memberRequest(user,key),body);
  const privacyRequest=async(type,user=member,state='processing')=>{const requestId=uuidv7();await control.query('INSERT INTO privacy.requests(id,subject_id,request_type,state) VALUES($1,$2,$3,$4)',[requestId,user,type,state]);return requestId;};
  return {member,other,owner,admin,subject,adminSubject,auth,service,memberRequest,ownerRequest,submit,privacyRequest};
}

test('restricted roles, definer ownership and direct private-table/lock denial are real',async()=>{
  for(const signature of ['support.lock_owner(bytea)','support.claim_owner_idempotency(uuid,text,text,text)','support.finish_owner_idempotency(uuid,text,text,text,uuid,integer,uuid)']){
    const definition=(await control.query(`SELECT p.prosecdef,p.provolatile,p.proconfig,r.rolname,r.rolsuper,r.rolcanlogin FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid=$1::regprocedure`,[signature])).rows[0];
    assert.equal(definition.prosecdef,true);assert.equal(definition.provolatile,'v');assert.equal(definition.rolsuper,false);assert.equal(definition.rolcanlogin,false);assert.ok(definition.proconfig.includes('search_path=pg_catalog, pg_temp'));
    for(const role of ['lythaus_runtime','lythaus_jobs','lythaus_privacy'])assert.equal((await control.query('SELECT has_function_privilege($1,$2,\'EXECUTE\') AS allowed',[role,signature])).rows[0].allowed,false);
  }
  const c=await connection('lythaus_runtime');try{await assert.rejects(c.query('SELECT * FROM support.notes'),e=>e.code==='42501');await assert.rejects(c.query('SELECT support.lock_owner(NULL)'),e=>e.code==='42501');}finally{await c.end();}
});
test('distinct submissions persist without client identities, privileges or mixed kinds',async t=>{
  const f=await fixture(t);const a=await f.submit(),b=await f.submit(suggestion());assert.equal(a.request.kind,'problem');assert.equal(b.request.kind,'suggestion');
  assert.equal(a.request.revision,1);assert.equal(a.request.memberMessage,null);assert.equal('submitterId' in a.request,false);
  for(const extra of ['submitterId','ownerId','role','state','revision','privateNotes','evidence','rewardPoints','policy'])await rejected(()=>f.submit({...problem(),[extra]:'PRIVATE_SENTINEL'}),'support_feedback_submission_invalid');
  await rejected(()=>f.submit({...problem(),...suggestion()}),'support_feedback_submission_invalid');
  const rows=(await control.query('SELECT kind,submitter_id FROM support.requests WHERE submitter_id=$1',[f.member])).rows;assert.equal(rows.length,2);assert.ok(rows.every(r=>r.submitter_id===f.member));
});
test('signed subjects, current token versions and current owner membership govern every operation',async t=>{
  const f=await fixture(t),created=await f.submit(),ticket=created.request.id;
  const anonymous=new Request('https://local-fixture.example.invalid',{headers:{'idempotency-key':uuidv7()}});
  await rejected(()=>f.service('member').submit(anonymous,problem()),'support_authentication_required');
  await rejected(async()=>f.service('owner').ownerQueue(await f.memberRequest(f.member,uuidv7(),1,['owner']),'problem',{limit:3}),'support_owner_required');
  await rejected(async()=>f.service('owner').ownerDetail(await f.ownerRequest(f.adminSubject),'problem',ticket),'support_owner_required');
  await rejected(async()=>f.service('member').memberDetail(await f.memberRequest(f.other),'problem',ticket),'support_not_found');
  await rejected(async()=>f.service('member').memberReply(await f.memberRequest(f.other),'problem',ticket,{expectedRevision:1,message:'Cross-user attempt'}),'support_not_found');
  await rejected(async()=>f.service('member').memberDetail(await f.memberRequest(),'suggestion',ticket),'support_not_found');
  await control.query('UPDATE identity.users SET token_version=token_version+1 WHERE id=$1',[f.member]);
  await rejected(async()=>f.service('member').memberDetail(await f.memberRequest(),'problem',ticket),'support_authentication_required');
  await control.query('UPDATE identity.admin_memberships SET active=false WHERE user_id=$1',[f.owner]);
  await rejected(async()=>f.service('owner').ownerDetail(await f.ownerRequest(),'problem',ticket),'support_owner_required');
});
test('owner public replies are distinct from notes/evidence and never leak through member or system projections',async t=>{
  const f=await fixture(t),ticket=(await f.submit()).request.id;
  const reply=await f.service('owner').ownerReply(await f.ownerRequest(),'problem',ticket,{expectedRevision:1,message:'Public synthetic acknowledgement.'});
  const note=await f.service('owner').ownerNote(await f.ownerRequest(),'problem',ticket,{expectedRevision:2,text:'PRIVATE_SENTINEL internal note'});
  await f.service('owner').ownerEvidence(await f.ownerRequest(),'problem',ticket,{expectedRevision:3,type:'verification',description:'PRIVATE_SENTINEL verification detail',reference:'PRIVATE_SENTINEL evidence reference'});
  const member=await f.service('member').memberDetail(await f.memberRequest(),'problem',ticket),owner=await f.service('owner').ownerDetail(await f.ownerRequest(),'problem',ticket);
  assert.equal(member.messages[0].text,reply.request.memberMessage);assert.equal(member.request.revision,4);assert.equal('private' in member,false);assert.ok(!JSON.stringify(member).includes('PRIVATE_SENTINEL'));assert.ok(!JSON.stringify(member).includes(f.owner));
  assert.ok(JSON.stringify(owner.private).includes('PRIVATE_SENTINEL'));assert.equal(owner.private.notes[0].id,note.recordId);
  const metadata=await control.query(`SELECT metadata AS value FROM system.audit_events WHERE metadata->>'requestId'=$1::text UNION ALL SELECT payload FROM system.outbox_events WHERE aggregate_id=$1::uuid UNION ALL SELECT response FROM system.idempotency_keys WHERE response->>'requestId'=$1::text`,[ticket]);
  assert.ok(!JSON.stringify(metadata.rows).includes('PRIVATE_SENTINEL'));assert.equal((await control.query('SELECT count(*)::int AS n FROM system.outbox_events WHERE aggregate_id=$1',[ticket])).rows[0].n,2);
});
test('closure requires supplied typed evidence belonging to this request and a valid reason/transition',async t=>{
  const f=await fixture(t),ticket=(await f.submit()).request.id,other=(await f.submit(problem(),uuidv7(),f.other)).request.id;
  const decision={expectedRevision:1,state:'resolved',reason:'verified',memberMessage:'Synthetic verification complete.',evidenceIds:[]};
  await rejected(async()=>f.service('owner').ownerDecision(await f.ownerRequest(),'problem',ticket,decision),'support_evidence_required');
  const foreign=await f.service('owner').ownerEvidence(await f.ownerRequest(),'problem',other,{expectedRevision:1,type:'verification',description:'Foreign synthetic evidence.'});
  await rejected(async()=>f.service('owner').ownerDecision(await f.ownerRequest(),'problem',ticket,{...decision,evidenceIds:[foreign.recordId]}),'support_evidence_required');
  const evidence=await f.service('owner').ownerEvidence(await f.ownerRequest(),'problem',ticket,{expectedRevision:1,type:'verification',description:'Synthetic fix was verified.'});
  await rejected(async()=>f.service('owner').ownerDecision(await f.ownerRequest(),'problem',ticket,{...decision,expectedRevision:2,reason:'unapproved',evidenceIds:[evidence.recordId]}),'support_transition_invalid');
  const closed=await f.service('owner').ownerDecision(await f.ownerRequest(),'problem',ticket,{...decision,expectedRevision:2,evidenceIds:[evidence.recordId]});assert.equal(closed.request.state,'resolved');
  const ledger=(await control.query('SELECT reason_code,evidence_ids,revision FROM support.decisions WHERE id=$1',[closed.recordId])).rows[0];assert.equal(ledger.reason_code,'verified');assert.deepEqual(ledger.evidence_ids,[evidence.recordId]);assert.equal(ledger.revision,3);
  await rejected(async()=>f.service('member').memberReply(await f.memberRequest(),'problem',ticket,{expectedRevision:3,message:'Cannot write after closure.'}),'support_closed');
});
test('concurrent same-key submissions produce one committed request, one intent, one audit and one rate increment',async t=>{
  const f=await fixture(t),key=uuidv7(),request=await f.memberRequest(f.member,key);
  const results=await Promise.all([f.service('member').submit(request,problem()),f.service('member').submit(request,problem())]);
  assert.equal(results[0].request.id,results[1].request.id);assert.deepEqual(results.map(r=>r.replayed).sort(),[false,true]);
  const ticket=results[0].request.id;assert.equal((await control.query('SELECT count(*)::int AS n FROM system.outbox_events WHERE aggregate_id=$1',[ticket])).rows[0].n,1);
  assert.equal((await control.query("SELECT count(*)::int AS n FROM system.audit_events WHERE action='support.submit' AND metadata->>'requestId'=$1",[ticket])).rows[0].n,1);
  assert.equal((await control.query("SELECT request_count FROM system.rate_limit_windows WHERE scope='support:member' AND subject_hash=encode(sha256($1::bytea),'hex')",[f.member])).rows[0].request_count,1);
  await rejected(()=>f.service('member').submit(request,{...problem(),title:'Different payload'}),'support_idempotency_conflict');
  const distinct=await f.submit(problem(),key,f.other);assert.notEqual(distinct.request.id,ticket);
});
test('concurrent replies at one revision have exactly one winner; replay returns freshly projected state',async t=>{
  const f=await fixture(t),ticket=(await f.submit()).request.id;
  const input={expectedRevision:1,message:'Synthetic reply'},requests=[await f.memberRequest(),await f.memberRequest()];
  const results=await Promise.allSettled(requests.map(request=>f.service('member').memberReply(request,'problem',ticket,input)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.message,'support_revision_conflict');
  const winningRequest=requests[results.findIndex(result=>result.status==='fulfilled')];
  await f.service('owner').ownerReply(await f.ownerRequest(),'problem',ticket,{expectedRevision:2,message:'Latest public reply'});
  const replay=await f.service('member').memberReply(winningRequest,'problem',ticket,input);assert.equal(replay.replayed,true);assert.equal(replay.request.revision,3);assert.equal(replay.request.memberMessage,'Latest public reply');
});
test('rate limits and real outbox/deferred-COMMIT failures roll back every write and expose fixed errors',async t=>{
  const limited=policy();limited.limits.memberMutations=1;const f=await fixture(t,limited);await f.submit();
  await rejected(()=>f.submit(),'support_rate_limited');assert.equal((await control.query('SELECT count(*)::int AS n FROM support.requests WHERE submitter_id=$1',[f.member])).rows[0].n,1);
  for(const option of [{failOutbox:true},{failCommit:true}]){
    const key=uuidv7();await rejected(async()=>f.service('member',option).submit(await f.memberRequest(f.other,key),problem()),'support_unavailable');
    assert.equal((await control.query('SELECT count(*)::int AS n FROM support.requests WHERE submitter_id=$1',[f.other])).rows[0].n,0);
    assert.equal((await control.query('SELECT count(*)::int AS n FROM system.idempotency_keys WHERE actor_id=$1',[f.other])).rows[0].n,0);
    assert.equal((await control.query("SELECT count(*)::int AS n FROM system.audit_events WHERE metadata->>'actorId'=$1",[f.other])).rows[0].n,0);
  }
});

test('queued owner revocation and member token-version changes are checked after real lock waits',async t=>{
  const f=await fixture(t),ticket=(await f.submit()).request.id,c=await connection();
  try {
    await c.query('BEGIN');await c.query('UPDATE identity.admin_memberships SET active=false WHERE user_id=$1',[f.owner]);
    const started=gate();const pending=f.service('owner',{onClient:client=>started.resolve(client.processID)}).ownerDetail(await f.ownerRequest(),'problem',ticket);
    const denial=rejected(()=>pending,'support_owner_required');await blocked(await started.promise);await c.query('COMMIT');await denial;
    await c.query('BEGIN');await c.query('UPDATE identity.users SET token_version=2 WHERE id=$1',[f.member]);
    const memberStarted=gate();const memberPending=f.service('member',{onClient:client=>memberStarted.resolve(client.processID)}).memberDetail(await f.memberRequest(),'problem',ticket);
    const memberDenial=rejected(()=>memberPending,'support_authentication_required');await blocked(await memberStarted.promise);await c.query('COMMIT');await memberDenial;
  }finally{await c.query('ROLLBACK');await c.end();}
});
test('owner proof locks membership and account through writes, audit and COMMIT; subsequent replay is denied after revocation',async t=>{
  const f=await fixture(t),ticket=(await f.submit()).request.id,locked=gate(),release=gate(),c=await connection(),request=await f.ownerRequest();
  try {
    const pending=f.service('owner',{afterOwnerLock:async()=>{locked.resolve();await release.promise;}}).ownerReply(request,'problem',ticket,{expectedRevision:1,message:'Authorized before revocation.'});
    await locked.promise;await c.query('BEGIN');const revoke=c.query('UPDATE identity.admin_memberships SET active=false WHERE user_id=$1',[f.owner]);
    await blocked(c.processID);release.resolve();assert.equal((await pending).request.revision,2);await revoke;await c.query('COMMIT');
    await rejected(()=>f.service('owner').ownerReply(request,'problem',ticket,{expectedRevision:1,message:'Authorized before revocation.'}),'support_owner_required');
  }finally{release.resolve();await c.query('ROLLBACK');await c.end();}
});
test('audit failure blocks owner disclosure and rolls back private notes and owner idempotency markers',async t=>{
  const f=await fixture(t),ticket=(await f.submit()).request.id;
  await rejected(async()=>f.service('owner',{failAudit:true}).ownerNote(await f.ownerRequest(),'problem',ticket,{expectedRevision:1,text:'PRIVATE_SENTINEL must roll back'}),'support_unavailable');
  assert.equal((await control.query('SELECT revision FROM support.requests WHERE id=$1',[ticket])).rows[0].revision,1);
  assert.equal((await control.query('SELECT count(*)::int AS n FROM support.notes WHERE request_id=$1',[ticket])).rows[0].n,0);
  assert.equal((await control.query('SELECT count(*)::int AS n FROM system.idempotency_keys WHERE actor_id=$1',[f.owner])).rows[0].n,0);
  await f.service('owner').ownerNote(await f.ownerRequest(),'problem',ticket,{expectedRevision:1,text:'PRIVATE_SENTINEL visible only to current owner'});
  await rejected(async()=>f.service('owner',{failAudit:true}).ownerDetail(await f.ownerRequest(),'problem',ticket),'support_unavailable');
  await rejected(async()=>f.service('owner',{failCommit:true}).ownerReply(await f.ownerRequest(),'problem',ticket,{expectedRevision:2,message:'Must roll back on failed commit.'}),'support_unavailable');
  assert.equal((await control.query('SELECT revision FROM support.requests WHERE id=$1',[ticket])).rows[0].revision,2);
  const admin=await connection('lythaus_admin');try{await assert.rejects(admin.query('SELECT * FROM system.idempotency_keys'),e=>e.code==='42501');}finally{await admin.end();}
});
test('request/history pagination is bounded, scoped and complete without duplicates or private fields',async t=>{
  const f=await fixture(t),ids=[];for(let i=0;i<7;i++)ids.push((await f.submit({...problem(),title:`Synthetic ${i}`})).request.id);
  await f.submit(suggestion());await f.submit(problem(),uuidv7(),f.other);
  const page1=await f.service('member').memberList(await f.memberRequest(),'problem',{limit:3});
  const page2=await f.service('member').memberList(await f.memberRequest(),'problem',{limit:3,cursor:page1.nextCursor});
  const page3=await f.service('member').memberList(await f.memberRequest(),'problem',{limit:3,cursor:page2.nextCursor});
  assert.equal(new Set([...page1.items,...page2.items,...page3.items].map(r=>r.id)).size,7);assert.equal(page3.nextCursor,null);
  await rejected(async()=>f.service('member').memberList(await f.memberRequest(f.other),'problem',{limit:3,cursor:page1.nextCursor}),'support_input_invalid');
  await rejected(async()=>f.service('member').memberList(await f.memberRequest(),'suggestion',{limit:3,cursor:page1.nextCursor}),'support_input_invalid');
  await rejected(async()=>f.service('member').memberList(await f.memberRequest(),'problem',{limit:4}),'support_input_invalid');
  let revision=1;for(let i=0;i<5;i++){await f.service('member').memberReply(await f.memberRequest(),'problem',ids[0],{expectedRevision:revision,message:`Synthetic reply ${i}`});revision++;}
  const a=await f.service('member').memberDetail(await f.memberRequest(),'problem',ids[0]);
  const b=await f.service('member').memberDetail(await f.memberRequest(),'problem',ids[0],{messageBefore:a.nextMessageCursor});
  const c=await f.service('member').memberDetail(await f.memberRequest(),'problem',ids[0],{messageBefore:b.nextMessageCursor});
  assert.equal(new Set([...a.messages,...b.messages,...c.messages].map(m=>m.id)).size,5);assert.equal(c.nextMessageCursor,null);
  const queue=await f.service('owner').ownerQueue(await f.ownerRequest(),'problem',{limit:3});assert.equal(queue.items.length,3);assert.ok(queue.items.every(r=>r.submitterId));assert.ok(!JSON.stringify(queue).includes('private'));
});
test('privacy export pages include only the subject public history and carry message revision watermarks',async t=>{
  const f=await fixture(t),ticket=(await f.submit()).request.id;let revision=1;
  for(let i=0;i<5;i++){await f.service('member').memberReply(await f.memberRequest(),'problem',ticket,{expectedRevision:revision,message:`Synthetic history ${i}`});revision++;}
  await f.service('owner').ownerNote(await f.ownerRequest(),'problem',ticket,{expectedRevision:6,text:'PRIVATE_SENTINEL excluded from export'});
  const requestId=await f.privacyRequest('export'),exported=await runner('lythaus_privacy')(c=>exportSupportForPrivacy(c,requestId,policy()));
  assert.ok(!JSON.stringify(exported).includes('PRIVATE_SENTINEL'));assert.equal(exported.items.length,1);assert.equal(exported.items[0].messages.length,2);
  const ticketExport=exported.items[0],rest=await runner('lythaus_privacy')(c=>exportSupportMessagesForPrivacy(c,requestId,ticket,policy(),ticketExport.nextMessageCursor,ticketExport.request.revision));
  const tail=await runner('lythaus_privacy')(c=>exportSupportMessagesForPrivacy(c,requestId,ticket,policy(),rest.nextCursor,ticketExport.request.revision));
  assert.equal(new Set([...ticketExport.messages,...rest.items,...tail.items].map(m=>m.id)).size,5);assert.equal(tail.nextCursor,null);
  const received=await f.privacyRequest('export',f.member,'received');await rejected(()=>runner('lythaus_privacy')(c=>exportSupportForPrivacy(c,received,policy())),'support_privacy_invalid');
  const otherExport=await f.privacyRequest('export',f.other);assert.deepEqual((await runner('lythaus_privacy')(c=>exportSupportMessagesForPrivacy(c,otherExport,ticket,policy(),1,7))).items,[]);
});
test('legal holds block local deletion; scrubbed data, private content, safe intents and replay markers disappear together',async t=>{
  const f=await fixture(t),key=uuidv7(),ticket=(await f.submit(problem(),key)).request.id;
  await f.service('owner').ownerNote(await f.ownerRequest(),'problem',ticket,{expectedRevision:1,text:'PRIVATE_SENTINEL to scrub'});
  const requestId=await f.privacyRequest('delete'),hold=uuidv7();await control.query('INSERT INTO privacy.legal_holds(id,subject_id,reason) VALUES($1,$2,\'synthetic hold\')',[hold,f.member]);
  await rejected(()=>runner('lythaus_privacy')(c=>purgeSupportForPrivacy(c,requestId,policy())),'support_privacy_held');
  assert.equal((await control.query('SELECT submission IS NOT NULL AS retained FROM support.requests WHERE id=$1',[ticket])).rows[0].retained,true);
  await control.query('UPDATE privacy.legal_holds SET active=false,released_at=now() WHERE id=$1',[hold]);
  assert.deepEqual(await runner('lythaus_privacy')(c=>purgeSupportForPrivacy(c,requestId,policy())),{scrubbedRecords:1,hasMore:false});
  const tombstone=(await control.query('SELECT submission,member_message,deleted_at FROM support.requests WHERE id=$1',[ticket])).rows[0];assert.equal(tombstone.submission,null);assert.equal(tombstone.member_message,null);assert.ok(tombstone.deleted_at);
  assert.equal((await control.query('SELECT count(*)::int AS n FROM support.notes WHERE request_id=$1',[ticket])).rows[0].n,0);
  assert.equal((await control.query('SELECT count(*)::int AS n FROM system.outbox_events WHERE aggregate_id=$1',[ticket])).rows[0].n,0);
  assert.equal((await control.query("SELECT count(*)::int AS n FROM system.idempotency_keys WHERE response->>'requestId'=$1",[ticket])).rows[0].n,0);
  assert.equal((await control.query('SELECT count(*)::int AS n FROM support.operation_refs WHERE request_id=$1',[ticket])).rows[0].n,0);
  await rejected(async()=>f.service('member').memberDetail(await f.memberRequest(),'problem',ticket),'support_authentication_required');
  await rejected(()=>f.submit(problem(),key),'support_authentication_required');
});
test('retention uses supplied closed-age policy, retains open/held records and invalidates delayed intents safely',async t=>{
  const f=await fixture(t),ticket=(await f.submit()).request.id,held=(await f.submit()).request.id,open=(await f.submit()).request.id;
  const intent=(await control.query("SELECT id FROM system.outbox_events WHERE aggregate_id=$1 AND event_type='support.workflow.changed'",[ticket])).rows[0].id;
  await f.service('owner').ownerNote(await f.ownerRequest(),'problem',ticket,{expectedRevision:1,text:'PRIVATE_SENTINEL does not invalidate public intent'});
  assert.equal((await runner('lythaus_privacy')(c=>loadSupportNotificationCandidate(c,intent,policy()))).revision,1);
  await f.service('owner').ownerReply(await f.ownerRequest(),'problem',ticket,{expectedRevision:2,message:'New public revision.'});
  assert.equal(await runner('lythaus_privacy')(c=>loadSupportNotificationCandidate(c,intent,policy())),null);
  for(const requestId of [ticket,held])await control.query("UPDATE support.requests SET closed_at=now()-interval '2 hours' WHERE id=$1",[requestId]);
  await control.query('INSERT INTO privacy.legal_holds(id,subject_id,reason) VALUES($1,$2,\'synthetic hold\')',[uuidv7(),f.member]);
  const heldRun=await runner('lythaus_privacy')(c=>retainSupportBatch(c,policy()));assert.equal(heldRun.scrubbedRecords,0);assert.equal(heldRun.heldRecords,0);
  await control.query('UPDATE privacy.legal_holds SET active=false WHERE subject_id=$1',[f.member]);
  assert.equal((await runner('lythaus_privacy')(c=>retainSupportBatch(c,policy()))).scrubbedRecords,2);
  assert.equal((await control.query('SELECT deleted_at FROM support.requests WHERE id=$1',[open])).rows[0].deleted_at,null);
});
test('database constraints reject null, untyped, unknown and mixed submission fields even without the service parser',async t=>{
  const f=await fixture(t);
  for(const submission of [{...problem(),kind:null},{...problem(),actual:null},{...problem(),title:3},{...problem(),platform:null},{...problem(),improvement:'Wrong workflow'},{...problem(),ownerId:f.owner},{...suggestion(),benefit:false}]){
    await assert.rejects(control.query(`INSERT INTO support.requests(id,submitter_id,kind,submission,revision,state,policy_version)
      VALUES($1,$2,$3,$4::jsonb,1,'submitted','local_fixture_v1')`,[uuidv7(),f.member,submission.improvement&&submission.kind==='suggestion'?'suggestion':'problem',JSON.stringify(submission)]),e=>e.code==='23514');
  }
});
test('subject deletion winning the real account lock prevents both member and owner writes',async t=>{
  const f=await fixture(t),ticket=(await f.submit()).request.id,c=await connection(),ownerStarted=gate(),memberStarted=gate();
  try{
    await c.query('BEGIN');await c.query("UPDATE identity.users SET status='deleted' WHERE id=$1",[f.member]);
    const owner=f.service('owner',{onClient:client=>ownerStarted.resolve(client.processID)}).ownerReply(await f.ownerRequest(),'problem',ticket,{expectedRevision:1,message:'Must not commit after subject deletion.'});
    const member=f.service('member',{onClient:client=>memberStarted.resolve(client.processID)}).memberReply(await f.memberRequest(),'problem',ticket,{expectedRevision:1,message:'Must not commit after subject deletion.'});
    const ownerDenied=rejected(()=>owner,'support_not_found'),memberDenied=rejected(()=>member,'support_authentication_required');
    await Promise.all([blocked(await ownerStarted.promise),blocked(await memberStarted.promise)]);await c.query('COMMIT');await Promise.all([ownerDenied,memberDenied]);
    assert.equal((await control.query('SELECT revision FROM support.requests WHERE id=$1',[ticket])).rows[0].revision,1);
    assert.equal((await control.query('SELECT count(*)::int AS n FROM support.messages WHERE request_id=$1',[ticket])).rows[0].n,0);
  }finally{await c.query('ROLLBACK');await c.end();}
});
test('a real scrub failure rolls back public/private content, replay markers, intents and tombstones together',async t=>{
  const f=await fixture(t),ticket=(await f.submit()).request.id;
  await f.service('owner').ownerReply(await f.ownerRequest(),'problem',ticket,{expectedRevision:1,message:'Synthetic public history to retain on rollback.'});
  await f.service('owner').ownerNote(await f.ownerRequest(),'problem',ticket,{expectedRevision:2,text:'PRIVATE_SENTINEL rollback note'});
  const requestId=await f.privacyRequest('delete');
  await rejected(()=>runner('lythaus_privacy',{failScrub:true})(c=>purgeSupportForPrivacy(c,requestId,policy())),'support_privacy_unavailable');
  const row=(await control.query('SELECT submission,deleted_at,revision FROM support.requests WHERE id=$1',[ticket])).rows[0];assert.ok(row.submission);assert.equal(row.deleted_at,null);assert.equal(row.revision,3);
  for(const table of ['messages','notes'])assert.equal((await control.query(`SELECT count(*)::int AS n FROM support.${table} WHERE request_id=$1`,[ticket])).rows[0].n,1);
  assert.equal((await control.query('SELECT count(*)::int AS n FROM system.outbox_events WHERE aggregate_id=$1',[ticket])).rows[0].n,2);
  assert.equal((await control.query("SELECT count(*)::int AS n FROM system.idempotency_keys WHERE response->>'requestId'=$1",[ticket])).rows[0].n,3);
  assert.equal((await control.query('SELECT count(*)::int AS n FROM support.operation_refs WHERE request_id=$1',[ticket])).rows[0].n,3);
  assert.equal((await runner('lythaus_privacy')(c=>purgeSupportForPrivacy(c,requestId,policy()))).scrubbedRecords,1);
});
test('privacy winning the subject lock completes while an owner replay waits without holding its idempotency row',async t=>{
  const f=await fixture(t),ticket=(await f.submit()).request.id,request=await f.ownerRequest(),input={expectedRevision:1,message:'Synthetic prior committed reply.'};
  await f.service('owner').ownerReply(request,'problem',ticket,input);
  const requestId=await f.privacyRequest('delete'),locked=gate(),release=gate(),ownerStarted=gate();
  const purge=runner('lythaus_privacy',{afterSubjectLock:async()=>{locked.resolve();await release.promise;}})(c=>purgeSupportForPrivacy(c,requestId,policy()));
  try{
    await locked.promise;const replay=f.service('owner',{onClient:c=>ownerStarted.resolve(c.processID)}).ownerReply(request,'problem',ticket,input);
    const denied=rejected(()=>replay,'support_not_found');await blocked(await ownerStarted.promise);release.resolve();
    assert.deepEqual(await purge,{scrubbedRecords:1,hasMore:false});await denied;
  }finally{release.resolve();await purge.catch(()=>undefined);}
});
test('targeted scrub checks provenance before following forged references into unrelated system records',async t=>{
  const f=await fixture(t),ticket=(await f.submit()).request.id,peer=(await f.submit(problem(),uuidv7(),f.other)).request.id;
  const peerIntent=(await control.query('SELECT id FROM system.outbox_events WHERE aggregate_id=$1',[peer])).rows[0].id;
  const peerMarker=(await control.query("SELECT scope,key FROM system.idempotency_keys WHERE response->>'requestId'=$1",[peer])).rows[0];
  const authScope='auth:synthetic-session',authKey=uuidv7(),auditId=uuidv7();
  await control.query('INSERT INTO system.idempotency_keys(scope,key,actor_id,response) VALUES($1,$2,$3,$4::jsonb)',[authScope,authKey,f.other,JSON.stringify({accessToken:'PRIVATE_SENTINEL'})]);
  await control.query("INSERT INTO system.audit_events(id,action,correlation_id,metadata) VALUES($1,'support.fixture.unrelated',$1::uuid::text,$2::jsonb)",[auditId,JSON.stringify({requestId:peer})]);
  const admin=await connection('lythaus_admin');try{
    await admin.query('INSERT INTO support.operation_refs(audit_id,request_id,outbox_id,idempotency_scope,idempotency_key) VALUES($1,$2,$3,$4,$5)',[auditId,ticket,peerIntent,authScope,authKey]);
    await admin.query('INSERT INTO support.operation_refs(audit_id,request_id,idempotency_scope,idempotency_key) VALUES($1,$2,$3,$4)',[uuidv7(),ticket,peerMarker.scope,peerMarker.key]);
  }finally{await admin.end();}
  const requestId=await f.privacyRequest('delete');await runner('lythaus_privacy')(c=>purgeSupportForPrivacy(c,requestId,policy()));
  for(const [sql,args] of [['SELECT 1 FROM system.outbox_events WHERE id=$1',[peerIntent]],['SELECT 1 FROM system.audit_events WHERE id=$1',[auditId]],['SELECT 1 FROM system.idempotency_keys WHERE scope=$1 AND key=$2',[authScope,authKey]],['SELECT 1 FROM system.idempotency_keys WHERE scope=$1 AND key=$2',[peerMarker.scope,peerMarker.key]]])assert.equal((await control.query(sql,args)).rowCount,1);
});
test('retention skips an older held subject and processes at most one unheld subject in each transaction',async t=>{
  const f=await fixture(t),held=[];for(let i=0;i<4;i++)held.push((await f.submit()).request.id);
  const eligible=(await f.submit(problem(),uuidv7(),f.other)).request.id;
  await control.query("UPDATE support.requests SET closed_at=now()-interval '3 hours' WHERE id=ANY($1::uuid[])",[held]);
  await control.query("UPDATE support.requests SET closed_at=now()-interval '2 hours' WHERE id=$1",[eligible]);
  await control.query("INSERT INTO privacy.legal_holds(id,subject_id,reason) VALUES($1,$2,'synthetic old hold')",[uuidv7(),f.member]);
  const lockSubjects=[];const result=await runner('lythaus_privacy',{captureQuery:(args)=>{if(args[0]==='SELECT id FROM identity.users WHERE id=$1 FOR UPDATE')lockSubjects.push(args[1][0]);}})(c=>retainSupportBatch(c,policy()));
  assert.equal(result.scrubbedRecords,1);assert.deepEqual(lockSubjects,[f.other]);
  assert.equal((await control.query('SELECT count(*)::int AS n FROM support.requests WHERE id=ANY($1::uuid[]) AND deleted_at IS NULL',[held])).rows[0].n,4);
});
test('retention rechecks a hold activated after candidate selection and reports only encountered held rows',async t=>{
  const f=await fixture(t),ticket=(await f.submit()).request.id,hold=uuidv7(),selected=gate(),release=gate();
  await control.query("UPDATE support.requests SET closed_at=now()-interval '2 hours' WHERE id=$1",[ticket]);
  await control.query("INSERT INTO privacy.legal_holds(id,subject_id,reason,active) VALUES($1,$2,'synthetic inactive hold',false)",[hold,f.member]);
  const retained=runner('lythaus_privacy',{afterRetentionCandidates:async()=>{selected.resolve();await release.promise;}})(c=>retainSupportBatch(c,policy()));
  try{
    await selected.promise;await control.query('UPDATE privacy.legal_holds SET active=true WHERE id=$1',[hold]);release.resolve();
    assert.deepEqual(await retained,{scrubbedRecords:0,heldRecords:1});assert.equal((await control.query('SELECT deleted_at FROM support.requests WHERE id=$1',[ticket])).rows[0].deleted_at,null);
  }finally{release.resolve();await retained.catch(()=>undefined);}
});
test('owner queue reloads bounded candidates after acquiring subject locks when purge commits first',async t=>{
  const f=await fixture(t);await f.submit({...problem(),title:'PRIVATE_SENTINEL removed before queue commit'});
  const candidates=gate(),release=gate(),queue=f.service('owner',{afterCandidates:async()=>{candidates.resolve();await release.promise;}}).ownerQueue(await f.ownerRequest(),'problem',{limit:3});
  try{
    await candidates.promise;const requestId=await f.privacyRequest('delete');await runner('lythaus_privacy')(c=>purgeSupportForPrivacy(c,requestId,policy()));
    release.resolve();const result=await queue;assert.deepEqual(result.items,[]);assert.ok(!JSON.stringify(result).includes('PRIVATE_SENTINEL'));
  }finally{release.resolve();await queue.catch(()=>undefined);}
});
test('continuation export waits behind purge and returns no body after purge commits first',async t=>{
  const f=await fixture(t),ticket=(await f.submit()).request.id;
  await f.service('member').memberReply(await f.memberRequest(),'problem',ticket,{expectedRevision:1,message:'PRIVATE_SENTINEL removed history'});
  const exportId=await f.privacyRequest('export'),deleteId=await f.privacyRequest('delete'),locked=gate(),release=gate(),exportStarted=gate();
  const purge=runner('lythaus_privacy',{afterSubjectLock:async()=>{locked.resolve();await release.promise;}})(c=>purgeSupportForPrivacy(c,deleteId,policy()));
  try{
    await locked.promise;const exported=runner('lythaus_privacy',{onClient:c=>exportStarted.resolve(c.processID)})(c=>exportSupportMessagesForPrivacy(c,exportId,ticket,policy(),1,2));
    await blocked(await exportStarted.promise);release.resolve();await purge;const result=await exported;assert.deepEqual(result.items,[]);assert.ok(!JSON.stringify(result).includes('PRIVATE_SENTINEL'));
  }finally{release.resolve();await purge.catch(()=>undefined);}
});
test('decision machine fields reject nested code before hashing and replay markers must match the requested target',async t=>{
  const f=await fixture(t),ticket=(await f.submit()).request.id,other=(await f.submit()).request.id;let invoked=false;
  const nested={get toJSON(){invoked=true;throw new Error('PRIVATE_SENTINEL');}};
  for(const field of ['state','reason'])await rejected(async()=>f.service('owner').ownerDecision(await f.ownerRequest(),'problem',ticket,{expectedRevision:1,state:'resolved',reason:'verified',memberMessage:'Synthetic explanation',evidenceIds:[],[field]:nested}),'support_input_invalid');
  assert.equal(invoked,false);
  const request=await f.ownerRequest(),input={expectedRevision:1,message:'Synthetic target-bound reply'};await f.service('owner').ownerReply(request,'problem',ticket,input);
  await control.query("UPDATE system.idempotency_keys SET response=jsonb_set(response,'{requestId}',to_jsonb($1::text)) WHERE actor_id=$2 AND key=$3",[other,f.owner,request.headers.get('idempotency-key')]);
  await rejected(()=>f.service('owner').ownerReply(request,'problem',ticket,input),'support_idempotency_conflict');
});
test('hostile Error reflection is never invoked by service or privacy error normalization',async t=>{
  const f=await fixture(t),ticket=(await f.submit()).request.id;let invoked=false;
  const hostile=new Error();Object.defineProperty(hostile,'message',{get(){invoked=true;throw new Error('PRIVATE_SENTINEL');}});
  const body=new Proxy({}, {getPrototypeOf(){throw hostile;}});
  await rejected(async()=>f.service('owner').ownerNote(await f.ownerRequest(),'problem',ticket,body),'support_unavailable');
  const requestId=await f.privacyRequest('export');
  await rejected(()=>runner('lythaus_privacy')(async c=>{
    const query=c.query.bind(c);c.query=(...args)=>{if(typeof args[0]==='string'&&args[0].includes('FROM support.messages'))throw hostile;return query(...args);};
    return exportSupportMessagesForPrivacy(c,requestId,ticket,policy(),1,2);
  }),'support_privacy_unavailable');
  assert.equal(invoked,false);
});
test('delayed notification eligibility rejects inactive, pending-deletion and malformed intents without sending',async t=>{
  const f=await fixture(t),ticket=(await f.submit()).request.id;
  const intent=(await control.query('SELECT id FROM system.outbox_events WHERE aggregate_id=$1',[ticket])).rows[0].id;
  assert.equal((await runner('lythaus_privacy')(c=>loadSupportNotificationCandidate(c,intent,policy()))).requestId,ticket);
  await control.query("UPDATE identity.users SET status='suspended' WHERE id=$1",[f.member]);
  assert.equal(await runner('lythaus_privacy')(c=>loadSupportNotificationCandidate(c,intent,policy())),null);
  await control.query("UPDATE identity.users SET status='active' WHERE id=$1",[f.member]);await f.privacyRequest('delete');
  assert.equal(await runner('lythaus_privacy')(c=>loadSupportNotificationCandidate(c,intent,policy())),null);
  await control.query("UPDATE system.outbox_events SET payload=payload||'{\"body\":\"PRIVATE_SENTINEL\"}'::jsonb WHERE id=$1",[intent]);
  await rejected(()=>runner('lythaus_privacy')(c=>loadSupportNotificationCandidate(c,intent,policy())),'support_privacy_unavailable');
});
test('owner idempotency helpers cannot address auth or arbitrary namespaces or an inactive actor',async t=>{
  const f=await fixture(t),c=await connection('lythaus_admin'),hash='a'.repeat(64);
  try{
    for(const [actor,operation,key,digest] of [[f.owner,'auth.login','key',hash],[f.owner,'reply','key with spaces',hash],[f.owner,'reply','key','invalid'],[f.member,'reply','key',hash],[null,'reply','key',hash]])
      await assert.rejects(c.query('SELECT support.claim_owner_idempotency($1,$2,$3,$4)',[actor,operation,key,digest]));
    await c.query('SELECT support.claim_owner_idempotency($1,\'reply\',\'scoped-key\',$2)',[f.owner,hash]);
    await c.query('SELECT support.finish_owner_idempotency($1,\'reply\',\'scoped-key\',$2,$3,2,NULL)',[f.owner,hash,uuidv7()]);
    const markers=(await control.query('SELECT scope,response FROM system.idempotency_keys WHERE actor_id=$1',[f.owner])).rows;
    assert.equal(markers.length,1);assert.equal(markers[0].scope,`support:owner:${f.owner}:reply`);assert.deepEqual(Object.keys(markers[0].response).sort(),['hash','recordId','requestId','revision']);
    await control.query('UPDATE identity.admin_memberships SET active=false WHERE user_id=$1',[f.owner]);
    await assert.rejects(c.query('SELECT support.claim_owner_idempotency($1,\'reply\',\'scoped-key\',$2)',[f.owner,hash]));
  }finally{await c.end();}
});
test('actual member/owner list queries use cursor indexes and return only the bounded lookahead',async t=>{
  const f=await fixture(t),rows=Array.from({length:3000},(_,i)=>({id:uuidv7(),submitter:i<30?f.member:f.other,kind:i%2?'suggestion':'problem',submission:i%2?suggestion():problem()}));
  await control.query(`INSERT INTO support.requests(id,submitter_id,kind,submission,revision,state,policy_version)
    SELECT id::uuid,submitter::uuid,kind,submission,1,'submitted','local_fixture_v1' FROM jsonb_to_recordset($1::jsonb) AS r(id text,submitter text,kind text,submission jsonb)`,[JSON.stringify(rows)]);
  await control.query('ANALYZE support.requests');await control.query('ANALYZE identity.users');
  for(const [channel,call,expectedIndex] of [['member','memberList','support_member_cursor'],['owner','ownerQueue','support_queue_cursor']]){
    let captured;const service=f.service(channel,{captureQuery:(args,result)=>{if(typeof args[0]==='string'&&args[0].includes('JOIN identity.users u ON u.id=r.submitter_id'))captured={args,result};}});
    const request=channel==='member'?await f.memberRequest():await f.ownerRequest();assert.equal((await service[call](request,'problem',{limit:3})).items.length,3);assert.equal(captured.result.rows.length,4);
    const explained=await control.query(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${captured.args[0]}`,captured.args[1]),plan=explained.rows[0]['QUERY PLAN'][0].Plan;
    const indexes=[];function visit(node){if(node['Index Name'])indexes.push(node['Index Name']);for(const child of node.Plans??[])visit(child);}visit(plan);
    assert.ok(indexes.includes(expectedIndex),JSON.stringify(plan));assert.equal(plan['Actual Rows'],4);
    t.diagnostic(`${channel}: ${expectedIndex}, actual rows ${plan['Actual Rows']}, shared hits ${plan['Shared Hit Blocks']}`);
  }
});
test('supplied policy is strict, immutable and has no default business/award configuration',()=>{
  const supplied=policy(),parsed=parseSupportServicePolicy(supplied);supplied.limits.page=99;supplied.transitions[0].to='forged';
  assert.equal(parsed.limits.page,3);assert.equal(parsed.transitions[0].to,'investigating');assert.ok(Object.isFrozen(parsed.transitions[0].evidenceTypes));
  for(const value of [undefined,{}, {...policy(),awardPoints:150}, {...policy(),limits:{...policy().limits,page:101}}, {...policy(),privacy:{...policy().privacy,retentionSeconds:0}}])assert.throws(()=>parseSupportServicePolicy(value),e=>e.message==='support_policy_invalid');
  const accessor=policy();Object.defineProperty(accessor,'transitions',{enumerable:true,get(){throw new Error('PRIVATE_SENTINEL');}});assert.throws(()=>parseSupportServicePolicy(accessor),e=>e.message==='support_policy_invalid');
  const impossible=policy();impossible.limits.privateItems=1;impossible.transitions[1].evidenceTypes=['verification','usefulness'];assert.throws(()=>parseSupportServicePolicy(impossible),e=>e.message==='support_policy_invalid');
});
