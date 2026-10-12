import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import test, { before, after } from 'node:test';
import pg from 'pg';
import { generateKeyPair, exportJWK, exportPKCS8, jwtVerify, SignJWT } from 'jose';
import { uuidv7, hmacLookup, signAccessToken } from '../../security/src/index.ts';
import { supportAuthentication } from '../src/support-feedback-auth.ts';
import { createSupportService } from '../src/support-feedback.ts';
import { parseSupportServicePolicy } from '../src/support-feedback-policy.ts';
import { exportSupportForPrivacy, purgeSupportForPrivacy, retainSupportBatch } from '../src/support-feedback-privacy.ts';
import { loadApprovedMigrations } from '../../../scripts/ci/planetscale-migration-manifest.mjs';

const supplied=process.env.SUPPORT_LOCAL_PG_URL;
if(!supplied)throw new Error('support_canonical_tests_require_disposable_local_pg17');
const url=new URL(supplied);
if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||!/^\/lythaus_support_test/.test(url.pathname))throw new Error('support_canonical_tests_refuse_nonlocal_database');
const proposal=await readFile('database/planetscale/proposals/support-feedback.canonical.sql','utf8');
const rollback=await readFile('database/planetscale/proposals/support-feedback.canonical.rollback.sql','utf8');
const restore=proposal.split('-- BEGIN support intake grants\n')[1]?.split('-- END support intake grants')[0];
assert.ok(restore);
const existingFixture=await readFile('packages/db/tests/support-feedback.postgres.mjs','utf8');
const literal=existingFixture.match(/const policy=\(\)=>\(([\s\S]*?)\);\nconst problem=/)?.[1];
assert.ok(literal,'The complete existing PG fixture remains the pending policy source');
const policy=()=>JSON.parse(JSON.stringify(runInNewContext(`(${literal})`,Object.create(null),{timeout:1000})));
parseSupportServicePolicy(policy());
const roles=['lythaus_runtime','lythaus_admin','lythaus_privacy','lythaus_jobs','lythaus_migrations',
  'lythaus_support_function_owner','lythaus_support_locator_owner'];
const databases=[];
let control,privateKey,publicKey,jwks,privatePem;
let databaseUrl;
async function connect(role,target=databaseUrl) {
  const client=new pg.Client({connectionString:target.toString(),ssl:false});await client.connect();
  await client.query("SET statement_timeout='7s'");
  if(role){assert.ok(roles.includes(role));await client.query(`SET ROLE ${role}`);}
  return client;
}
function transaction(role) {
  return async work=>{
    const client=await connect(role);
    try{await client.query('BEGIN');const result=await work(client);await client.query('COMMIT');return result;}
    catch(error){await client.query('ROLLBACK').catch(()=>undefined);throw error;}finally{await client.end();}
  };
}
async function migrateBaseline() {
  const name=`lythaus_support_test_canonical_${uuidv7().replaceAll('-','')}`;
  const bootstrap=await connect(undefined,url);
  try{await bootstrap.query(`CREATE DATABASE ${name}`);}finally{await bootstrap.end();}
  databases.push(name);const target=new URL(url);target.pathname=`/${name}`;
  const client=await connect(undefined,target);
  try{
    const manifest=loadApprovedMigrations();
    for(const migration of manifest.migrations)await client.query(migration.contents.toString());
    await client.query(await readFile('database/planetscale/grants/roles.sql','utf8'));
    return {client,target};
  }catch(error){await client.end();throw error;}
}
before(async()=>{
  const bootstrap=await connect(undefined,url);
  try{
    assert.equal((await bootstrap.query('SHOW server_version_num')).rows[0].server_version_num.slice(0,2),'17');
    for(const role of roles)await bootstrap.query(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF; END $$`);
  }finally{await bootstrap.end();}
  const migrated=await migrateBaseline();control=migrated.client;databaseUrl=migrated.target;
  await control.query(proposal);
  ({privateKey,publicKey}=await generateKeyPair('ES256',{extractable:true}));
  const publicJwk=await exportJWK(publicKey);publicJwk.kid='canonical-fixture';jwks=JSON.stringify({keys:[publicJwk]});privatePem=await exportPKCS8(privateKey);
});
after(async()=>{
  if(control)await control.end();
  const bootstrap=await connect(undefined,url);
  try{for(const name of databases){assert.match(name,/^lythaus_support_test_canonical_[a-f0-9]+$/);await bootstrap.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1',[name]);await bootstrap.query(`DROP DATABASE ${name}`);}}
  finally{await bootstrap.end();}
});
const problem=()=>({kind:'problem',category:'display',title:'Synthetic canonical report',actual:'Synthetic clipped line',expected:'Synthetic full line'});
const suggestion=()=>({kind:'suggestion',category:'navigation',title:'Synthetic canonical idea',improvement:'Synthetic separate destination',benefit:'Synthetic easier history'});
async function fixture(t,custom=policy()) {
  const member=uuidv7(),other=uuidv7(),owner=uuidv7(),admin=uuidv7(),ids=[member,other,owner,admin];
  for(const id of ids)await control.query('INSERT INTO identity.users(id) VALUES($1)',[id]);
  const subject=`canonical-owner-${owner}`,adminSubject=`canonical-admin-${admin}`;
  for(const [id,access,role] of [[owner,subject,'owner'],[admin,adminSubject,'administrator']])await control.query("INSERT INTO identity.admin_memberships(user_id,role,active,access_subject_hmac) VALUES($1,$2,true,decode($3,'base64'))",[id,role,hmacLookup(access,'canonical-fixture-secret')]);
  const auth=supportAuthentication({JWT_PUBLIC_JWKS:jwks,ACCESS_JWKS_URL:'https://canonical-fixture.invalid/certs',ACCESS_AUDIENCES:'canonical-owner',ACCESS_TEAM_DOMAIN:'canonical-fixture.invalid',ACCESS_SUBJECT_HMAC_KEY:'canonical-fixture-secret'},
    async(token,config)=>(await jwtVerify(token,publicKey,{algorithms:['ES256'],audience:config.ACCESS_AUDIENCES,issuer:`https://${config.ACCESS_TEAM_DOMAIN}`})).payload);
  const service=channel=>createSupportService({authentication:auth,runTransaction:transaction(channel==='member'?'lythaus_runtime':'lythaus_admin'),policy:custom});
  const memberRequest=async(user=member,key=uuidv7())=>new Request('https://canonical-fixture.invalid/support',{headers:{authorization:`Bearer ${await signAccessToken({userId:user,privateKeyPem:privatePem,keyId:'canonical-fixture',tokenVersion:1})}`,'idempotency-key':key}});
  const ownerRequest=async(access=subject,key=uuidv7())=>new Request('https://canonical-fixture.invalid/support',{headers:{'cf-access-jwt-assertion':await new SignJWT({}).setProtectedHeader({alg:'ES256'}).setSubject(access).setIssuer('https://canonical-fixture.invalid').setAudience('canonical-owner').setIssuedAt().setExpirationTime('5m').sign(privateKey),'idempotency-key':key}});
  const submit=async(body=problem(),user=member,key=uuidv7())=>service('member').submit(await memberRequest(user,key),body);
  const privacyRequest=async(type,user=member)=>{const id=uuidv7();await control.query("INSERT INTO privacy.requests(id,subject_id,request_type,state) VALUES($1,$2,$3,'processing')",[id,user,type]);return id;};
  const reconcile=async(user=member)=>transaction('lythaus_privacy')(async c=>{await c.query('SELECT privacy.reconcile_subject_data_locations($1)',[user]);return (await c.query("SELECT resource_reference,entity_type,entity_id,retention_class,deletion_state,legal_hold_state FROM privacy.subject_data_locations WHERE subject_id=$1 AND (resource_reference LIKE 'support.%' OR entity_type IN ('support_audit','support_intent','support_idempotency')) ORDER BY resource_reference,entity_type,entity_key",[user])).rows;});
  t.after(async()=>{
    await control.query('DELETE FROM support.requests WHERE submitter_id=ANY($1::uuid[])',[ids]);
    await control.query('DELETE FROM privacy.subject_data_locations WHERE subject_id=ANY($1::uuid[])',[ids]);
    await control.query('DELETE FROM privacy.legal_holds WHERE subject_id=ANY($1::uuid[])',[ids]);
    await control.query('DELETE FROM privacy.requests WHERE subject_id=ANY($1::uuid[])',[ids]);
    await control.query('DELETE FROM identity.admin_memberships WHERE user_id=ANY($1::uuid[])',[ids]);
    await control.query('DELETE FROM system.outbox_events WHERE actor_id=ANY($1::uuid[])',[ids]);
    await control.query('DELETE FROM system.idempotency_keys WHERE actor_id=ANY($1::uuid[])',[ids]);
    await control.query('DELETE FROM identity.users WHERE id=ANY($1::uuid[])',[ids]);
  });
  return {member,other,owner,admin,subject,adminSubject,ids,service,memberRequest,ownerRequest,submit,privacyRequest,reconcile,policy:custom};
}
const rejected=(work,code)=>assert.rejects(work,e=>e.message===code);
async function pendingSupport(subject) {
  return transaction('lythaus_privacy')(async c=>(await c.query(`SELECT count(*)::integer AS pending
    FROM privacy.subject_data_locations WHERE subject_id=$1 AND store_type='planetscale' AND deletion_state='present'
      AND (resource_reference LIKE 'support.%' OR entity_type IN ('support_audit','support_intent','support_idempotency'))`,[subject])).rows[0].pending);
}
async function catalog(client=control) {
  return (await client.query(`SELECT jsonb_build_object(
    'relations',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.oid) FROM pg_class c WHERE c.relnamespace='support'::regnamespace),
    'functions',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p WHERE p.pronamespace='support'::regnamespace OR p.proname LIKE '%support%subject_data_locations%' OR p.proname LIKE 'reconcile_subject_data_locations%')) AS snapshot`)).rows[0].snapshot;
}
test('forward reuses six tables, nine explicit indexes and exact existing operation helper bodies',async()=>{
  const tables=(await control.query("SELECT relname FROM pg_class WHERE relnamespace='support'::regnamespace AND relkind='r' ORDER BY relname")).rows.map(r=>r.relname);
  assert.deepEqual(tables,['decisions','evidence','messages','notes','operation_refs','requests']);
  const explicit=(await control.query("SELECT indexname FROM pg_indexes WHERE schemaname='support' AND indexname NOT LIKE '%pkey' AND indexname NOT LIKE '%key' ORDER BY indexname")).rows.map(r=>r.indexname);
  assert.deepEqual(explicit,['support_decisions_cursor','support_evidence_cursor','support_export_cursor','support_member_cursor','support_messages_cursor','support_notes_cursor','support_operation_refs_request','support_queue_cursor','support_retention_cursor']);
  const original=await readFile('database/planetscale/proposals/support-feedback.local.sql','utf8');
  for(const name of ['lock_owner','claim_owner_idempotency','finish_owner_idempotency']){
    const source=original.match(new RegExp(`CREATE FUNCTION support\\.${name}\\([\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;`))?.[1];assert.ok(source);
    const stored=(await control.query("SELECT prosrc FROM pg_proc WHERE pronamespace='support'::regnamespace AND proname=$1",[name])).rows[0].prosrc;
    assert.equal(stored.trim(),source.trim());
  }
  assert.equal((await control.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='support' AND column_name='id' AND (data_type<>'uuid' OR column_default IS NOT NULL)")).rows[0].n,0);
});
test('duplicate forward refuses reapplication atomically; local guard rejects the local default postgres database',async()=>{
  const before=await catalog();await assert.rejects(control.query(proposal),e=>e.code==='P0001'&&e.message.includes('absent schema'));await control.query('ROLLBACK');assert.deepEqual(await catalog(),before);
  const target=new URL(url);target.pathname='/postgres';const client=await connect(undefined,target);
  try{for(const sql of [proposal,rollback]){await assert.rejects(client.query(sql),e=>e.code==='P0001'&&e.message.includes('disposable-local-only'));await client.query('ROLLBACK');}
    assert.equal((await client.query("SELECT to_regnamespace('support') AS support")).rows[0].support,null);}finally{await client.end();}
});
test('partial schema and an injected post-rename failure leave the previous reconciler intact',async()=>{
  const migrated=await migrateBaseline(),client=migrated.client;
  try{
    const original=(await client.query("SELECT prosrc FROM pg_proc WHERE oid='privacy.reconcile_subject_data_locations(uuid)'::regprocedure")).rows[0].prosrc;
    await client.query('CREATE SCHEMA support');await client.query('CREATE TABLE support.fixture_partial(id uuid)');
    await assert.rejects(client.query(proposal),e=>e.code==='P0001'&&e.message.includes('absent schema'));await client.query('ROLLBACK');
    assert.equal((await client.query("SELECT prosrc FROM pg_proc WHERE oid='privacy.reconcile_subject_data_locations(uuid)'::regprocedure")).rows[0].prosrc,original);
    await client.query('DROP SCHEMA support CASCADE');
    const broken=proposal.replace('COMMIT;','SELECT support.fixture_missing_function();\nCOMMIT;');
    await assert.rejects(client.query(broken),e=>e.code==='42883');await client.query('ROLLBACK');
    assert.equal((await client.query("SELECT to_regnamespace('support') AS support")).rows[0].support,null);
    assert.equal((await client.query("SELECT to_regprocedure('privacy.reconcile_subject_data_locations_pre_support_feedback(uuid)') AS previous")).rows[0].previous,null);
    assert.equal((await client.query("SELECT prosrc FROM pg_proc WHERE oid='privacy.reconcile_subject_data_locations(uuid)'::regprocedure")).rows[0].prosrc,original);
  }finally{await client.end();}
});
test('function owners are isolated and non-superuser; public, runtime, admin and Jobs cannot invoke locator capabilities',async()=>{
  for(const signature of ['support.lock_owner(bytea)','support.claim_owner_idempotency(uuid,text,text,text)','support.finish_owner_idempotency(uuid,text,text,text,uuid,integer,uuid)','privacy.reconcile_subject_data_locations(uuid)','privacy.reconcile_support_subject_data_locations(uuid)']){
    const row=(await control.query('SELECT p.prosecdef,p.proconfig,r.rolname,r.rolsuper,r.rolcanlogin,r.rolcreatedb,r.rolcreaterole,r.rolbypassrls FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid=$1::regprocedure',[signature])).rows[0];
    assert.equal(row.rolsuper,false);assert.equal(row.rolcanlogin,false);assert.equal(row.rolcreatedb,false);assert.equal(row.rolcreaterole,false);assert.equal(row.rolbypassrls,false);assert.ok(row.proconfig.includes('search_path=pg_catalog, pg_temp'));
    assert.equal(row.prosecdef,true);
    assert.equal((await control.query("SELECT count(*)::int AS n FROM pg_proc p,LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=$1::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE'",[signature])).rows[0].n,0);
  }
  for(const owner of ['lythaus_support_function_owner','lythaus_support_locator_owner']){
    assert.equal((await control.query("SELECT has_schema_privilege($1,'support','CREATE') OR has_schema_privilege($1,'privacy','CREATE') AS allowed",[owner])).rows[0].allowed,false);
    for(const role of ['lythaus_runtime','lythaus_admin','lythaus_jobs','lythaus_privacy'])assert.equal((await control.query("SELECT pg_has_role($1,$2,'MEMBER') AS allowed",[role,owner])).rows[0].allowed,false);
  }
  for(const role of ['lythaus_runtime','lythaus_admin','lythaus_jobs']){
    const client=await connect(role);try{await assert.rejects(client.query('SELECT privacy.reconcile_subject_data_locations($1)',[uuidv7()]),e=>e.code==='42501');}finally{await client.end();}
  }
});
test('a login-capable proposed function owner is refused before schema or wrapper changes',async()=>{
  const migrated=await migrateBaseline(),client=migrated.client,bad=`lythaus_support_bad_${uuidv7().replaceAll('-','')}`;
  try{
    await client.query(`CREATE ROLE ${bad} LOGIN`);
    await assert.rejects(client.query(proposal.replaceAll('lythaus_support_function_owner',bad)),e=>e.code==='P0001'&&e.message.includes('isolated NOLOGIN'));await client.query('ROLLBACK');
    assert.equal((await client.query("SELECT to_regnamespace('support') AS support")).rows[0].support,null);
    assert.equal((await client.query("SELECT to_regprocedure('privacy.reconcile_subject_data_locations_pre_support_feedback(uuid)') AS previous")).rows[0].previous,null);
  }finally{await client.query(`DROP ROLE ${bad}`);await client.end();}
});
test('intake-role membership in a function owner is refused; only a constrained migration membership is permitted',async()=>{
  const migrated=await migrateBaseline(),client=migrated.client;
  try{
    await client.query('GRANT lythaus_support_function_owner TO lythaus_runtime');
    try{await assert.rejects(client.query(proposal),e=>e.code==='P0001'&&e.message.includes('isolated NOLOGIN'));await client.query('ROLLBACK');
      assert.equal((await client.query("SELECT to_regnamespace('support') AS support")).rows[0].support,null);
    }finally{await client.query('REVOKE lythaus_support_function_owner FROM lythaus_runtime');}
    await client.query('GRANT lythaus_support_function_owner TO lythaus_migrations WITH INHERIT FALSE, SET TRUE');
    await client.query(proposal);
    assert.ok((await client.query("SELECT to_regnamespace('support') AS support")).rows[0].support);
  }finally{await client.query('ROLLBACK');await client.query('REVOKE lythaus_support_function_owner FROM lythaus_runtime,lythaus_migrations');await client.end();}
});
test('forward delegates to the then-current reconciler instead of overwriting serialized profile additions',async()=>{
  const migrated=await migrateBaseline(),client=migrated.client,subject=uuidv7(),id=uuidv7();
  try{
    await client.query(`ALTER FUNCTION privacy.reconcile_subject_data_locations(uuid) RENAME TO reconcile_subject_data_locations_pre_fixture_profile;
      CREATE FUNCTION privacy.reconcile_subject_data_locations(p_subject_id uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$ BEGIN
        PERFORM privacy.reconcile_subject_data_locations_pre_fixture_profile(p_subject_id);
        INSERT INTO privacy.subject_data_locations(subject_id,store_type,resource_reference,entity_type,entity_id,authoritative_or_derived,retention_class)
        VALUES(p_subject_id,'planetscale','synthetic.profile_locator','synthetic_profile',p_subject_id,'authoritative','privacy') ON CONFLICT DO NOTHING;
        RETURN 0; END $$;
      REVOKE ALL ON FUNCTION privacy.reconcile_subject_data_locations(uuid) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION privacy.reconcile_subject_data_locations(uuid) TO lythaus_privacy;`);
    await client.query(proposal);await client.query('INSERT INTO identity.users(id) VALUES($1)',[subject]);
    await client.query("INSERT INTO support.requests(id,submitter_id,kind,submission,revision,state,policy_version) VALUES($1,$2,'problem',$3::jsonb,1,'submitted','local_fixture_v1')",[id,subject,JSON.stringify(problem())]);
    const privacy=await connect('lythaus_privacy',migrated.target);
    try{await privacy.query('SELECT privacy.reconcile_subject_data_locations($1)',[subject]);
      const rows=(await privacy.query('SELECT resource_reference FROM privacy.subject_data_locations WHERE subject_id=$1',[subject])).rows.map(r=>r.resource_reference);
      for(const expected of ['identity.users','synthetic.profile_locator','support.requests'])assert.ok(rows.includes(expected));
    }finally{await privacy.end();}
  }finally{await client.end();}
});
test('a missing locator-owner grant aborts reconciliation without erasing its prior registry',async t=>{
  const f=await fixture(t),id=(await f.submit()).request.id;
  await f.service('owner').ownerNote(await f.ownerRequest(),'problem',id,{expectedRevision:1,text:'PRIVATE_SENTINEL grant retry note'});await f.reconcile();
  const snapshot=async()=>(await control.query('SELECT * FROM privacy.subject_data_locations WHERE subject_id=$1 ORDER BY resource_reference,entity_type,entity_key',[f.member])).rows;
  const before=await snapshot();await control.query('REVOKE SELECT ON support.notes FROM lythaus_support_locator_owner');
  try{await assert.rejects(f.reconcile(),e=>e.code==='42501');assert.deepEqual(await snapshot(),before);}
  finally{await control.query('GRANT SELECT ON support.notes TO lythaus_support_locator_owner');}
  assert.ok((await f.reconcile()).some(r=>r.resource_reference==='support.notes'));
});
test('actual signed member and owner services work with proposed grants; replay, kind/user isolation and role revocation hold',async t=>{
  const f=await fixture(t),key=uuidv7();const results=await Promise.all([f.submit(problem(),f.member,key),f.submit(problem(),f.member,key)]);
  assert.equal(results[0].request.id,results[1].request.id);assert.equal(results.filter(r=>r.replayed).length,1);
  const id=results[0].request.id;await f.submit(suggestion());
  await rejected(async()=>f.service('member').memberDetail(await f.memberRequest(f.other),'problem',id),'support_not_found');
  await rejected(async()=>f.service('member').memberDetail(await f.memberRequest(),'suggestion',id),'support_not_found');
  const req=await f.ownerRequest(),input={expectedRevision:1,text:'PRIVATE_SENTINEL canonical note'};
  await f.service('owner').ownerNote(req,'problem',id,input);assert.equal((await f.service('owner').ownerNote(req,'problem',id,input)).replayed,true);
  await rejected(async()=>f.service('owner').ownerQueue(await f.ownerRequest(f.adminSubject),'problem',{limit:3}),'support_owner_required');
  await control.query('UPDATE identity.admin_memberships SET active=false WHERE user_id=$1',[f.owner]);
  await rejected(async()=>f.service('owner').ownerQueue(await f.ownerRequest(),'problem',{limit:3}),'support_owner_required');
  const detail=await f.service('member').memberDetail(await f.memberRequest(),'problem',id);assert.ok(!JSON.stringify(detail).includes('PRIVATE_SENTINEL'));
});
test('wholly absent support remains optional for core privacy; partial and unsupported relation states retry atomically',async t=>{
  const f=await fixture(t);await f.submit();await f.reconcile();
  const snapshot=async()=>(await control.query('SELECT * FROM privacy.subject_data_locations WHERE subject_id=$1 ORDER BY resource_reference,entity_type,entity_key',[f.member])).rows;
  const before=await snapshot();await control.query('ALTER TABLE support.notes RENAME TO fixture_missing_notes');
  try{
    await assert.rejects(f.reconcile(),e=>e.code==='P0001'&&e.message==='support privacy schema incomplete');assert.deepEqual(await snapshot(),before);
    await control.query('CREATE VIEW support.notes AS SELECT * FROM support.fixture_missing_notes');
    try{await assert.rejects(f.reconcile(),e=>e.code==='P0001'&&e.message==='support privacy schema incomplete');assert.deepEqual(await snapshot(),before);}
    finally{await control.query('DROP VIEW support.notes');}
  }finally{await control.query('ALTER TABLE support.fixture_missing_notes RENAME TO notes');}
  await control.query('ALTER SCHEMA support RENAME TO support_fixture_absent');
  try{assert.deepEqual(await f.reconcile(),[]);assert.equal((await control.query("SELECT count(*)::int AS n FROM privacy.subject_data_locations WHERE subject_id=$1 AND resource_reference='identity.users'",[f.member])).rows[0].n,1);}
  finally{await control.query('ALTER SCHEMA support_fixture_absent RENAME TO support');}
  assert.ok((await f.reconcile()).some(r=>r.resource_reference==='support.requests'));
});
test('canonical reconciliation is idempotent, preserves prior locators and includes reporter and actor relationships without prose',async t=>{
  const f=await fixture(t),id=(await f.submit()).request.id,peer=(await f.submit(problem(),f.other)).request.id;
  await f.service('owner').ownerReply(await f.ownerRequest(),'problem',id,{expectedRevision:1,message:'Synthetic public canonical reply'});
  const note=await f.service('owner').ownerNote(await f.ownerRequest(),'problem',id,{expectedRevision:2,text:'PRIVATE_SENTINEL canonical locator note'});
  const evidence=await f.service('owner').ownerEvidence(await f.ownerRequest(),'problem',id,{expectedRevision:3,type:'verification',description:'PRIVATE_SENTINEL canonical locator evidence'});
  await f.service('owner').ownerDecision(await f.ownerRequest(),'problem',id,{expectedRevision:4,state:'resolved',reason:'verified',memberMessage:'Synthetic verified result',evidenceIds:[evidence.recordId]});
  const first=await f.reconcile(),second=await f.reconcile();assert.deepEqual(first,second);assert.ok(!JSON.stringify(first).includes('PRIVATE_SENTINEL'));
  for(const resource of ['requests','messages','notes','evidence','decisions','operation_refs'])assert.ok(first.some(r=>r.resource_reference===`support.${resource}`));
  assert.ok(first.some(r=>r.entity_type==='support_audit'));assert.ok(first.some(r=>r.entity_type==='support_intent'));assert.ok(first.some(r=>r.entity_type==='support_idempotency'));
  assert.ok(!first.some(r=>r.entity_id===peer));assert.ok(first.every(r=>r.retention_class==='support_pending_v1'));
  const owner=await f.reconcile(f.owner);assert.ok(owner.some(r=>r.entity_id===note.recordId));assert.ok(!owner.some(r=>r.entity_type==='support_request'&&r.entity_id===id));
  assert.equal((await control.query("SELECT count(*)::int AS n FROM privacy.subject_data_locations WHERE subject_id=$1 AND resource_reference='identity.users'",[f.member])).rows[0].n,1);
  const exportId=await f.privacyRequest('export');
  const exported=await transaction('lythaus_privacy')(c=>exportSupportForPrivacy(c,exportId,f.policy));
  assert.ok(!JSON.stringify(exported).includes('PRIVATE_SENTINEL'));
});
test('forged references cannot register unrelated peer audit, intent or replay records',async t=>{
  const f=await fixture(t),id=(await f.submit()).request.id,peer=(await f.submit(problem(),f.other)).request.id;
  const peerRefs=(await control.query('SELECT * FROM support.operation_refs WHERE request_id=$1',[peer])).rows[0];
  const forgedAudit=uuidv7();await control.query("INSERT INTO system.audit_events(id,action,correlation_id,metadata) VALUES($1,'support.fixture.unrelated',$1::uuid::text,$2::jsonb)",[forgedAudit,JSON.stringify({requestId:peer})]);
  await control.query('INSERT INTO support.operation_refs(audit_id,request_id,outbox_id,idempotency_scope,idempotency_key) VALUES($1,$2,$3,$4,$5)',[forgedAudit,id,peerRefs.outbox_id,peerRefs.idempotency_scope,peerRefs.idempotency_key]);
  const rows=await f.reconcile();assert.ok(!rows.some(r=>r.entity_type==='support_audit'&&[forgedAudit,peerRefs.audit_id].includes(r.entity_id)));
  assert.ok(!rows.some(r=>r.entity_type==='support_intent'&&r.entity_id===peerRefs.outbox_id));assert.ok(!rows.some(r=>r.entity_type==='support_idempotency'&&r.entity_id===peer));
});
test('scrub removes live locators and preserves only actual tombstone/audit rows for both audit choices',async t=>{
  for(const deleteAudit of [true,false]){
    const custom=policy();custom.privacy.deleteAudit=deleteAudit;const f=await fixture(t,custom),id=(await f.submit()).request.id;
    await f.service('owner').ownerNote(await f.ownerRequest(),'problem',id,{expectedRevision:1,text:'PRIVATE_SENTINEL synthetic scrub note'});await f.reconcile();
    const requestId=await f.privacyRequest('delete');assert.deepEqual(await transaction('lythaus_privacy')(c=>purgeSupportForPrivacy(c,requestId,custom)),{scrubbedRecords:1,hasMore:false});
    const rows=await f.reconcile();assert.ok(rows.some(r=>r.entity_type==='support_request'&&r.deletion_state==='retained'&&r.retention_class==='audit'));
    assert.ok(rows.every(r=>['support_request','support_audit'].includes(r.entity_type)&&r.deletion_state==='retained'));
    assert.equal(rows.some(r=>r.entity_type==='support_audit'),!deleteAudit);
    assert.deepEqual(await transaction('lythaus_privacy')(c=>purgeSupportForPrivacy(c,requestId,custom)),{scrubbedRecords:0,hasMore:false});
    assert.deepEqual(await f.reconcile(),rows);
  }
});
test('retention keeps open and held content, marks hold state and progresses after an explicit synthetic release',async t=>{
  const f=await fixture(t),held=(await f.submit()).request.id,open=(await f.submit()).request.id,eligible=(await f.submit(problem(),f.other)).request.id;
  await control.query("UPDATE support.requests SET closed_at=now()-interval '2 hours' WHERE id=ANY($1::uuid[])",[[held,eligible]]);
  await control.query("INSERT INTO privacy.legal_holds(id,subject_id,reason) VALUES($1,$2,'synthetic canonical hold')",[uuidv7(),f.member]);
  assert.ok((await f.reconcile()).every(r=>r.legal_hold_state==='active'));
  const requestId=await f.privacyRequest('delete');await rejected(()=>transaction('lythaus_privacy')(c=>purgeSupportForPrivacy(c,requestId,f.policy)),'support_privacy_held');
  assert.equal((await transaction('lythaus_privacy')(c=>retainSupportBatch(c,f.policy))).scrubbedRecords,1);
  for(const id of [held,open])assert.equal((await control.query('SELECT deleted_at FROM support.requests WHERE id=$1',[id])).rows[0].deleted_at,null);
  await control.query('UPDATE privacy.legal_holds SET active=false WHERE subject_id=$1',[f.member]);
  assert.equal((await transaction('lythaus_privacy')(c=>retainSupportBatch(c,f.policy))).scrubbedRecords,1);
  assert.equal((await control.query('SELECT deleted_at FROM support.requests WHERE id=$1',[open])).rows[0].deleted_at,null);
  assert.ok((await f.reconcile()).every(r=>r.legal_hold_state==='none'));
});
test('residual private children and actor-only data remain present; no false deletion completion is inferred',async t=>{
  const f=await fixture(t),id=(await f.submit()).request.id;
  const note=await f.service('owner').ownerNote(await f.ownerRequest(),'problem',id,{expectedRevision:1,text:'PRIVATE_SENTINEL actor-linked source'});
  const ownerDelete=await f.privacyRequest('delete',f.owner);assert.deepEqual(await transaction('lythaus_privacy')(c=>purgeSupportForPrivacy(c,ownerDelete,f.policy)),{scrubbedRecords:0,hasMore:false});
  assert.ok((await f.reconcile(f.owner)).some(r=>r.entity_id===note.recordId&&r.deletion_state==='present'));
  await control.query('UPDATE system.audit_events SET actor_id=NULL WHERE actor_id=$1',[f.owner]);
  assert.ok((await f.reconcile(f.owner)).some(r=>r.entity_type==='support_audit'&&r.deletion_state==='present'));
  const memberDelete=await f.privacyRequest('delete');await transaction('lythaus_privacy')(c=>purgeSupportForPrivacy(c,memberDelete,f.policy));
  const residual=uuidv7();await control.query('INSERT INTO support.notes(id,request_id,author_id,body,revision) VALUES($1,$2,$3,$4,9)',[residual,id,f.owner,'PRIVATE_SENTINEL injected disposable residual']);
  const rows=await f.reconcile();assert.ok(rows.some(r=>r.entity_id===residual&&r.deletion_state==='present'));
  assert.equal(await pendingSupport(f.member),1);
});
test('a deleted request with residual member-visible text blocks completion until the text is actually cleared',async t=>{
  const f=await fixture(t),id=(await f.submit()).request.id;await f.submit(problem(),f.other);
  const peerBefore=await f.reconcile(f.other),requestId=await f.privacyRequest('delete');
  await transaction('lythaus_privacy')(c=>purgeSupportForPrivacy(c,requestId,f.policy));
  assert.ok((await f.reconcile()).some(r=>r.entity_id===id&&r.deletion_state==='retained'&&r.retention_class==='audit'));
  assert.equal(await pendingSupport(f.member),0);
  await control.query('UPDATE support.requests SET member_message=$2 WHERE id=$1',[id,'PRIVATE_SENTINEL synthetic residual decision text']);
  const stored=(await control.query('SELECT submission,deleted_at,member_message FROM support.requests WHERE id=$1',[id])).rows[0];
  assert.equal(stored.submission,null);assert.ok(stored.deleted_at);assert.ok(stored.member_message);
  const rows=await f.reconcile();assert.ok(rows.some(r=>r.entity_id===id&&r.deletion_state==='present'&&r.retention_class==='support_pending_v1'));
  assert.equal(await pendingSupport(f.member),1);assert.deepEqual(await f.reconcile(),rows);assert.ok(!JSON.stringify(rows).includes('PRIVATE_SENTINEL'));
  await control.query("INSERT INTO privacy.legal_holds(id,subject_id,reason) VALUES($1,$2,'synthetic residual-content hold')",[uuidv7(),f.member]);
  assert.ok((await f.reconcile()).some(r=>r.entity_id===id&&r.deletion_state==='present'&&r.legal_hold_state==='active'));
  assert.equal(await pendingSupport(f.member),1);
  await control.query(rollback);await control.query(rollback);
  try{
    assert.ok((await f.reconcile()).some(r=>r.entity_id===id&&r.deletion_state==='present'&&r.legal_hold_state==='active'));
    assert.equal(await pendingSupport(f.member),1);
    assert.equal((await control.query('SELECT member_message FROM support.requests WHERE id=$1',[id])).rows[0].member_message,stored.member_message);
  }finally{await control.query(restore);}
  assert.deepEqual(await f.reconcile(f.other),peerBefore);
  await control.query('UPDATE privacy.legal_holds SET active=false WHERE subject_id=$1',[f.member]);
  await control.query('UPDATE support.requests SET member_message=NULL WHERE id=$1',[id]);
  assert.ok((await f.reconcile()).some(r=>r.entity_id===id&&r.deletion_state==='retained'&&r.retention_class==='audit'&&r.legal_hold_state==='none'));
  assert.equal(await pendingSupport(f.member),0);
});
test('capability rollback preserves content, holds and reconciler; privacy scrub still works and intake grants can be restored',async t=>{
  const f=await fixture(t),id=(await f.submit()).request.id;
  await f.service('owner').ownerNote(await f.ownerRequest(),'problem',id,{expectedRevision:1,text:'PRIVATE_SENTINEL rollback-preserved note'});
  const before=await f.reconcile();const checksum=createHash('sha256').update(JSON.stringify((await control.query('SELECT * FROM support.requests WHERE id=$1',[id])).rows)).digest('hex');
  await control.query(rollback);await control.query(rollback);
  try{
    assert.equal(createHash('sha256').update(JSON.stringify((await control.query('SELECT * FROM support.requests WHERE id=$1',[id])).rows)).digest('hex'),checksum);assert.deepEqual(await f.reconcile(),before);
    await rejected(()=>f.submit(),'support_unavailable');await rejected(async()=>f.service('owner').ownerQueue(await f.ownerRequest(),'problem',{limit:3}),'support_unavailable');
    const requestId=await f.privacyRequest('delete');assert.equal((await transaction('lythaus_privacy')(c=>purgeSupportForPrivacy(c,requestId,f.policy))).scrubbedRecords,1);
    assert.ok((await f.reconcile()).every(r=>r.deletion_state==='retained'));
  }finally{await control.query(restore);}
  assert.equal((await f.submit(problem(),f.other)).replayed,false);
});
