import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {rebindControlCatalog,rebindControlInventory,REBIND_CONTROL_INSERT_SQL,REBIND_METADATA_VERIFIER_READY_EXPR} from './admin-subject-rebind-control.mjs';
import {validateRebindExecutor,assertRebindExecutorSession} from './admin-subject-rebind-executor.mjs';

export const REBIND_SIGNATURE='identity.rebind_control_plane_administrator(bytea,text,uuid,text,bytea,bigint,uuid,text)';
export const REBIND_GRANT_PATH='database/planetscale/grants/admin-subject-rebind.sql';
export const REBIND_CREATE_AUTHORITY_SQL=`SELECT current_user='postgres' AS owner_context,
  has_database_privilege(current_user,current_database(),'CREATE') AS namespace_create,
  has_schema_privilege(current_user,'identity','CREATE') AS functions_create,
  ${REBIND_METADATA_VERIFIER_READY_EXPR} AS verifier_ready`;
const repository=new URL('https://github.com/AsoraKK/Lythaus/').pathname.slice(1,-1);
const sha256=value=>createHash('sha256').update(value).digest('hex');
const check=(condition,code)=>{if(!condition)throw new Error(code);};
const read=(root,file,committedOnly)=>committedOnly
  ?execFileSync('git',['show',`HEAD:${file}`],{cwd:root}):fs.readFileSync(path.join(root,file));

export function rebindGrantPayload({root=process.cwd(),committedOnly=false}={}) {
  const raw=read(root,REBIND_GRANT_PATH,committedOnly),sql=raw.toString('utf8');
  const bodies=[...sql.matchAll(/AS \$\$([\s\S]*?)\$\$;/g)];
  check(bodies.length===3&&sql.includes('CREATE FUNCTION identity.rebind_control_plane_administrator(')
    &&sql.includes('CREATE TABLE admin_recovery.subject_rebind_control (')
    &&sql.includes('CREATE SCHEMA admin_recovery AUTHORIZATION postgres;')
    &&sql.includes('CREATE FUNCTION identity.admin_subject_rebind_policy()')
    &&sql.includes('CREATE FUNCTION identity.admin_subject_rebind_restore_state()')
    &&!sql.includes('CREATE OR REPLACE FUNCTION'),
    'admin_rebind_grant_source_invalid');
  return {sql,sha256:sha256(raw),bodySha256:sha256(bodies[2][1]),readerBodySha256:sha256(bodies[0][1]),restoreStateBodySha256:sha256(bodies[1][1]),
    roleGrantsSha256:sha256(read(root,'database/planetscale/grants/roles.sql',committedOnly))};
}

export function rebindInstallConsent(env,{root=process.cwd(),committedOnly=env.CI==='true',now=Date.now()}={}) {
  if(!env.ADMIN_SUBJECT_REBIND_INSTALL_APPROVAL_JSON)return null;
  let record;try{record=JSON.parse(env.ADMIN_SUBJECT_REBIND_INSTALL_APPROVAL_JSON);}catch{throw new Error('admin_rebind_install_consent_invalid');}
  check(record&&typeof record==='object'&&!Array.isArray(record)
    &&Object.keys(record).sort().join(',')==='approvalReference,approvedAt,executor,expiresAt,grantSha256,metadataVerifierPermission,operator,releaseSha,roleGrantsSha256,schemaVersion,scope',
  'admin_rebind_install_consent_invalid');
  check(record.schemaVersion==='lythaus-admin-subject-rebind-install-v2'&&record.scope==='install_disabled_capability_only'
    &&record.metadataVerifierPermission==='disabled_restore_state_only',
    'admin_rebind_install_scope_invalid');
  check(env.GITHUB_REPOSITORY===repository&&env.GITHUB_REPOSITORY_ID==='1010752912'
    &&env.GITHUB_REF==='refs/heads/main'&&env.REF_PROTECTED==='true'&&env.GITHUB_RUN_ATTEMPT==='1'
    &&env.GITHUB_WORKFLOW_REF===`${repository}/.github/workflows/planetscale-production-migrations.yml@refs/heads/main`
    &&/^[a-f0-9]{40}$/.test(env.RELEASE_SHA??'')&&env.GITHUB_SHA===env.RELEASE_SHA&&record.releaseSha===env.RELEASE_SHA
    &&env.GITHUB_ACTOR===repository.split('/')[0]&&env.GITHUB_ACTOR_ID==='211295889'&&record.operator===env.GITHUB_ACTOR,
  'admin_rebind_install_context_invalid');
  check(env.PREPROVISIONED_MIGRATION_CREDENTIAL_PRESENT==='true','admin_rebind_install_requires_existing_credential');
  const stamp=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)?Date.parse(value):NaN;
  const approved=stamp(record.approvedAt),expires=stamp(record.expiresAt);
  check(Number.isFinite(now)&&Number.isFinite(approved)&&Number.isFinite(expires)&&approved<=now&&now<expires
    &&expires>approved&&expires-approved<=24*60*60*1000,'admin_rebind_install_consent_expired');
  check(typeof record.approvalReference==='string'&&record.approvalReference.trim()===record.approvalReference
    &&record.approvalReference.length>0&&record.approvalReference.length<=200,'admin_rebind_install_reference_required');
  const payload=rebindGrantPayload({root,committedOnly});
  check(record.grantSha256===payload.sha256&&record.roleGrantsSha256===payload.roleGrantsSha256,
    'admin_rebind_install_payload_changed');
  validateRebindExecutor(record.executor);
  return {record,payload};
}

export const REBIND_BOUNDARY_SQL=`SELECT p.prosrc AS body, p.prosecdef AS security_definer,
  pg_get_userbyid(p.proowner) AS owner, p.proconfig AS settings,
  p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql') AS language_matches,
  (p.prorettype='boolean'::regtype AND NOT p.proretset AND p.prokind='f') AS return_matches,
  (p.provolatile='v' AND p.proparallel='u' AND NOT p.proisstrict AND NOT p.proleakproof AND p.prosupport::oid=0 AND p.procost=100 AND p.prorows=0) AS behavior_matches,
  (p.proargnames=ARRAY['p_next_subject_hmac','p_source_sha','p_worker_version_id','p_email_sha256',
    'p_nonce','p_expires_at','p_audit_id','p_correlation_id']::text[] AND p.proargmodes IS NULL AND p.pronargdefaults=0) AS arguments_match,
  has_function_privilege($1,p.oid,'EXECUTE') AS admin_execute,
  has_function_privilege($2,p.oid,'EXECUTE') AS runtime_execute,
  has_function_privilege($3,p.oid,'EXECUTE') AS jobs_execute,
  has_function_privilege($4,p.oid,'EXECUTE') AS privacy_execute,
  has_any_column_privilege($1,'identity.admin_memberships','UPDATE') AS admin_direct_update,
  pg_has_role($1,p.proowner,'MEMBER') AS admin_acts_as_owner,
  EXISTS(SELECT 1 FROM unnest(ARRAY[$1,$2,$3,$4]) AS member_role JOIN pg_roles AS reachable
    ON pg_has_role(member_role,reachable.oid,'MEMBER')
    WHERE reachable.oid=p.proowner OR (member_role<>$1 AND reachable.rolname=$1)
      OR has_any_column_privilege(reachable.oid,'identity.admin_memberships','UPDATE')) AS unexpected_role_reach,
  EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) AS acl
    WHERE acl.privilege_type='EXECUTE' AND (acl.grantee NOT IN(p.proowner,(SELECT oid FROM pg_roles WHERE rolname=$1))
      OR (acl.grantee<>p.proowner AND acl.is_grantable))) AS unexpected_execute
 FROM pg_catalog.pg_proc AS p WHERE p.oid=to_regprocedure($5)`;

export function assertRebindBoundary(row,payload) {
  check(row&&typeof row.body==='string'&&sha256(row.body)===payload.bodySha256
    &&row.security_definer===true&&row.owner==='postgres'&&row.language_matches===true&&row.return_matches===true
    &&row.behavior_matches===true&&row.arguments_match===true,'admin_rebind_capability_definition_changed');
  check(Array.isArray(row.settings)&&row.settings.length===1&&row.settings[0]==='search_path=pg_catalog',
  'admin_rebind_capability_configuration_changed');
  check(row.admin_execute===true&&row.runtime_execute===false&&row.jobs_execute===false&&row.privacy_execute===false
    &&row.admin_direct_update===false&&row.admin_acts_as_owner===false&&row.unexpected_execute===false
    &&row.unexpected_role_reach===false,
  'admin_rebind_capability_privilege_boundary_invalid');
}

export const REBIND_SOURCE_STATE_SQL=`SELECT
  (SELECT count(*)=1 FROM identity.admin_memberships) AS one_membership,
  (SELECT enabled FROM system.feature_flags WHERE flag_key='identity.first_admin_bootstrap_consumed') AS bootstrap_closed,
  (SELECT count(*)=1 FROM system.audit_events WHERE action='identity.first_admin_bootstrapped') AS one_bootstrap,
  EXISTS(SELECT 1 FROM identity.admin_memberships AS membership JOIN identity.users AS account ON account.id=membership.user_id
    JOIN system.audit_events AS audit ON audit.actor_id=membership.user_id AND audit.target_id=membership.user_id
    WHERE membership.active AND membership.revoked_at IS NULL AND membership.role='administrator'
      AND account.status='locked' AND account.deleted_at IS NULL
      AND audit.action='identity.first_admin_bootstrapped' AND audit.target_type='admin_membership') AS original_administrator`;

export const REBIND_OBJECTS_SQL=`SELECT
  EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='admin_recovery') AS namespace_present,
  EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='admin_recovery' AND c.relname='subject_rebind_control') AS control_present,
  to_regprocedure('identity.admin_subject_rebind_policy()') IS NOT NULL AS reader_present,
  to_regprocedure('identity.admin_subject_rebind_restore_state()') IS NOT NULL AS restore_state_present,
  to_regprocedure('identity.rebind_control_plane_administrator(bytea,text,uuid,text,bytea,bigint,uuid,text)') IS NOT NULL AS mutator_present`;

export async function inspectRebindCapabilityCatalog(client,roles,payload) {
  const result=await client.query(REBIND_OBJECTS_SQL);
  check(result.rowCount===1&&result.rows.length===1,'admin_rebind_capability_inventory_invalid');
  const flags=Object.values(result.rows[0]);
  check(flags.length===5&&flags.every(value=>typeof value==='boolean'),'admin_rebind_capability_inventory_invalid');
  if(flags.every(value=>value===false))return {state:'ABSENT'};
  check(flags.every(value=>value===true),'admin_rebind_partial_or_legacy_installation');
  const args=['admin','runtime','jobs','privacy'].map(label=>roles[`lythaus_${label}`]);
  check(args.every(value=>/^pscale_api_[a-z0-9]+$/.test(value??''))&&new Set(args).size===4,
    'admin_rebind_role_identifiers_invalid');
  const functions=await client.query(REBIND_BOUNDARY_SQL,[...args,REBIND_SIGNATURE]);
  check(functions.rowCount===1&&functions.rows.length===1,'admin_rebind_capability_inventory_invalid');
  assertRebindBoundary(functions.rows[0],payload);
  await rebindControlCatalog(client,roles,payload);
  return {state:'CATALOG_VERIFIED',grantSha256:payload.sha256,disabledStateVerified:false};
}

export async function installReviewedRebindCapability(client,consent,roles,{now=Date.now}={}) {
  if(consent===null)return {status:'NOT_REQUESTED',installed:false};
  const current=()=>check(Date.parse(consent.record.approvedAt)<=now()&&now()<Date.parse(consent.record.expiresAt),
    'admin_rebind_install_consent_expired');
  current();
  for(const label of ['runtime','admin','jobs','privacy','migrations'])check(/^pscale_api_[a-z0-9]+$/.test(roles[`lythaus_${label}`]??''),
    'admin_rebind_role_identifiers_invalid');
  check(new Set(Object.values(roles)).size===Object.values(roles).length,'admin_rebind_role_identifiers_ambiguous');
  await assertRebindExecutorSession(client,consent.record.executor,roles);
  await client.query('SET LOCAL ROLE postgres');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('lythaus-schema-migrations'))");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('lythaus:first-admin-bootstrap:v1'))");
  const state=await client.query(REBIND_SOURCE_STATE_SQL);
  check(state.rowCount===1&&Array.isArray(state.rows)&&state.rows.length===1&&state.rows[0]
    &&Object.values(state.rows[0]).length===4&&Object.values(state.rows[0]).every(value=>value===true),
    'admin_rebind_install_original_administrator_state_changed');
  const parameters=[roles.lythaus_admin,roles.lythaus_runtime,roles.lythaus_jobs,roles.lythaus_privacy,REBIND_SIGNATURE];
  const before=await client.query(REBIND_BOUNDARY_SQL,parameters);
  check(Array.isArray(before.rows)&&before.rowCount===before.rows.length&&before.rows.length<=1,'admin_rebind_capability_inventory_invalid');
  const objects=await client.query(REBIND_OBJECTS_SQL);
  check(objects.rowCount===1&&objects.rows.length===1,'admin_rebind_capability_inventory_invalid');
  const present=objects.rows[0];
  if(before.rowCount===1&&Object.values(present).length===5&&Object.values(present).every(value=>value===true)){
    assertRebindBoundary(before.rows[0],consent.payload);
    const control=await rebindControlInventory(client,roles,consent.payload,{lock:true});
    check(control.policyText==='DISABLED','admin_rebind_capability_not_disabled');
    current();
    return {status:'ALREADY_INSTALLED_DISABLED',installed:false,grantSha256:consent.payload.sha256,
      controlRevision:control.revision,disabledFromPolicySha256:control.disabledFromPolicySha256};
  }
  check(before.rowCount===0&&Object.values(present).length===5&&Object.values(present).every(value=>value===false),
    'admin_rebind_partial_or_legacy_installation');
  const capacity=await client.query(REBIND_CREATE_AUTHORITY_SQL);
  check(capacity.rowCount===1&&capacity.rows.length===1&&capacity.rows[0].owner_context===true
    &&capacity.rows[0].namespace_create===true&&capacity.rows[0].functions_create===true&&capacity.rows[0].verifier_ready===true,
    'admin_rebind_existing_creation_authority_unverified');
  current();
  const sql=consent.payload.sql.replace(/\blythaus_(runtime|admin|jobs|privacy|migrations)\b/g,label=>`"${roles[label]}"`);
  await client.query(sql);
  const {uuidv7}=await import('../../packages/security/src/index.ts');
  const inserted=await client.query(REBIND_CONTROL_INSERT_SQL,[uuidv7(),consent.payload.sha256]);
  check(inserted.rowCount===1,'admin_rebind_control_installation_unverified');
  const after=await client.query(REBIND_BOUNDARY_SQL,parameters);
  check(after.rowCount===1&&after.rows.length===1,'admin_rebind_capability_installation_unverified');
  assertRebindBoundary(after.rows[0],consent.payload);
  const control=await rebindControlInventory(client,roles,consent.payload,{lock:true});
  check(control.policyText==='DISABLED'&&control.revision===0&&control.disabledFromPolicySha256===null,
    'admin_rebind_capability_not_disabled');
  current();
  return {status:'INSTALLED_DISABLED',installed:true,grantSha256:consent.payload.sha256,
    roleGrantsSha256:consent.payload.roleGrantsSha256,controlRevision:control.revision,disabledFromPolicySha256:null};
}

export async function withVerifiedRebindInstallation({connect,consent,roles,now=Date.now}) {
  let client,commitAttempted=false,result;
  try {
    client=await connect();
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout = '5s'");
    await client.query("SET LOCAL lock_timeout = '2s'");
    result=await installReviewedRebindCapability(client,consent,roles,{now});
    commitAttempted=true;
    await client.query('COMMIT');
    await client.end();client=null;
  } catch(error) {
    if(client){try{if(!commitAttempted)await client.query('ROLLBACK');}catch{}try{await client.end();}catch{}}
    if(!commitAttempted)throw error;
  }
  let reader;
  try {
    reader=await connect();
    await reader.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await reader.query("SET LOCAL statement_timeout = '5s'");
    await assertRebindExecutorSession(reader,consent.record.executor,roles);
    await reader.query('SET LOCAL ROLE postgres');
    const catalog=await inspectRebindCapabilityCatalog(reader,roles,consent.payload);
    check(catalog.state==='CATALOG_VERIFIED','admin_rebind_install_readback_mismatch');
    const observed=await rebindControlInventory(reader,roles,consent.payload);
    check(observed.policyText==='DISABLED'&&observed.revision===result.controlRevision
      &&observed.disabledFromPolicySha256===result.disabledFromPolicySha256,'admin_rebind_install_readback_mismatch');
    await reader.query('COMMIT');
    await reader.end();reader=null;
    return {...result,readbackVerified:true,membershipWritePerformed:false};
  } catch {
    if(reader){try{await reader.end();}catch{}}
    throw new Error('admin_rebind_install_outcome_unknown_read_only_reconciliation_required');
  }
}
