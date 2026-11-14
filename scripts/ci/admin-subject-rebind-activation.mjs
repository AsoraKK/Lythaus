import {createHash,randomBytes} from 'node:crypto';
import {parseRebindIntent,parseRebindPolicy,sealRebindPolicy,REBIND_POLICY_SETTING} from '../../apps/lythaus-admin-api/src/solo-recovery/rebind-protocol.ts';
import {REBIND_BOUNDARY_SQL,REBIND_SIGNATURE,REBIND_SOURCE_STATE_SQL,assertRebindBoundary} from './admin-subject-rebind-capability.mjs';

const repository=new URL('https://github.com/AsoraKK/Lythaus/').pathname.slice(1,-1);
const sha=/^[a-f0-9]{40}$/;
const hash=/^[a-f0-9]{64}$/;
const check=(condition,code)=>{if(!condition)throw new Error(code);};
const keys=value=>Object.keys(value).sort().join(',');
export const policySha256=value=>createHash('sha256').update(value).digest('hex');
export const DISABLED_POLICY_SHA256=policySha256('DISABLED');
export const REBIND_POLICY_ID_SQL=`SELECT oid FROM pg_catalog.pg_proc WHERE oid=to_regprocedure($1)`;
export const REBIND_POLICY_ALTER_SQL=`ALTER FUNCTION ${REBIND_SIGNATURE} SET ${REBIND_POLICY_SETTING} FROM CURRENT`;
export const REBIND_OPERATOR_SESSION_SQL=`SELECT current_database() AS database_name,current_user AS current_role,
  session_user AS session_role,pg_has_role(current_user,'postgres','SET') AS may_set_owner`;
export const REBIND_OWNER_CAPACITY_SQL=`SELECT current_user='postgres' AS owner_context,
  has_parameter_privilege(current_user,$1,'SET') AS guard_allowed,
  has_parameter_privilege(current_user,$2,'SET') AS policy_allowed`;
const canonical=value=>JSON.stringify(parseRebindPolicy(value));

export function requireRebindActivationContext(env) {
  check(env.ENABLE_ADMIN_SUBJECT_REBIND==='true'&&env.RELEASE_MODE==='force_auth_critical'
    &&env.GITHUB_REPOSITORY===repository&&env.GITHUB_REPOSITORY_ID==='1010752912'
    &&env.GITHUB_REF==='refs/heads/main'&&env.REF_PROTECTED==='true'&&env.GITHUB_RUN_ATTEMPT==='1'
    &&env.GITHUB_WORKFLOW_REF===`${repository}/.github/workflows/production-release.yml@refs/heads/main`
    &&sha.test(env.RELEASE_SHA??'')&&env.GITHUB_SHA===env.RELEASE_SHA
    &&/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID??'')
    &&env.GITHUB_ACTOR===repository.split('/')[0]&&env.GITHUB_ACTOR_ID==='211295889',
  'admin_rebind_activation_context_invalid');
  check(env.PREPROVISIONED_MIGRATION_CREDENTIAL_PRESENT==='true','admin_rebind_activation_requires_existing_credential');
}

export function rebindActivationConsent(value,{env,payload,stage,now=Date.now()}={}) {
  requireRebindActivationContext(env);
  let record;try{record=typeof value==='string'?JSON.parse(value):value;}catch{throw new Error('admin_rebind_activation_consent_invalid');}
  check(record&&typeof record==='object'&&!Array.isArray(record)
    &&keys(record)==='approvalReference,approvedAt,disableAtExpiry,expiresAt,grantSha256,operator,policy,previousPolicySha256,releaseRunId,releaseSha,schemaVersion,scope,stage,workerVersionId',
  'admin_rebind_activation_consent_invalid');
  check(record.schemaVersion==='lythaus-admin-subject-rebind-activation-v1'
    &&record.scope==='function_policy_only'&&record.stage===stage&&['preview','execute'].includes(stage)
    &&record.disableAtExpiry===true&&record.releaseSha===env.RELEASE_SHA&&record.releaseRunId===env.GITHUB_RUN_ID
    &&record.operator===env.GITHUB_ACTOR&&record.workerVersionId===env.ADMIN_WORKER_VERSION_ID
    &&record.grantSha256===payload.sha256&&hash.test(record.previousPolicySha256??''),
  'admin_rebind_activation_scope_invalid');
  const policy=parseRebindIntent(record.policy);
  check(policy&&policy.mode===stage&&policy.sourceSha===record.releaseSha&&policy.workerVersionId===record.workerVersionId
    &&policy.reference===`canonical-release:${record.releaseRunId}:admin-subject-rebind`,
  'admin_rebind_activation_policy_invalid');
  const stamp=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)?Date.parse(value):NaN;
  const approved=stamp(record.approvedAt),expires=stamp(record.expiresAt);
  check(Number.isFinite(approved)&&Number.isFinite(expires)&&approved<=now&&now<expires
    &&expires-approved<=900000&&policy.notBefore*1000<=now&&now<policy.expiresAt*1000
    &&policy.expiresAt*1000<=expires&&(stage!=='preview'||policy.notBefore*1000>=approved),
  'admin_rebind_activation_consent_expired');
  check(typeof record.approvalReference==='string'&&record.approvalReference.trim()===record.approvalReference
    &&record.approvalReference.length>0&&record.approvalReference.length<=200,
  'admin_rebind_activation_reference_required');
  if(stage==='preview')check(record.previousPolicySha256===DISABLED_POLICY_SHA256,'admin_rebind_preview_must_start_disabled');
  if(stage==='execute')check(record.previousPolicySha256===env.ADMIN_REBIND_PREVIEW_POLICY_SHA256,
    'admin_rebind_execute_preview_binding_invalid');
  return {record,policy,payload,policyText:null,policySha256:null};
}

export function sealRebindActivationConsent(consent,bindingProof) {
  const policy=sealRebindPolicy(consent.policy,bindingProof);
  check(policy&&policy.bindingProof.releaseRunId===consent.record.releaseRunId,
    'admin_rebind_control_plane_proof_invalid');
  const policyText=canonical(policy);
  return {...consent,policy,policyText,policySha256:policySha256(policyText)};
}

export function checkedFunctionPolicy(row,payload) {
  check(Array.isArray(row?.settings),'admin_rebind_function_policy_invalid');
  const settings=row.settings.filter(value=>typeof value==='string'&&value.startsWith(`${REBIND_POLICY_SETTING}=`));
  check(settings.length===1,'admin_rebind_function_policy_invalid');
  const value=settings[0].slice(REBIND_POLICY_SETTING.length+1);
  check(value==='DISABLED'||parseRebindPolicy(value)!==null,'admin_rebind_function_policy_invalid');
  assertRebindBoundary({...row,settings:row.settings.map(setting=>setting===settings[0]?`${REBIND_POLICY_SETTING}=DISABLED`:setting)},payload);
  return value;
}

export function requirePolicyTransition(previous,consent) {
  check(policySha256(previous)===consent.record.previousPolicySha256,'admin_rebind_policy_changed_before_activation');
  if(consent.record.stage==='preview') {
    check(previous==='DISABLED','admin_rebind_preview_must_start_disabled');
    return;
  }
  const old=parseRebindPolicy(previous),next=consent.policy;
  check(old&&old.mode==='preview'&&old.sourceSha===next.sourceSha&&old.workerVersionId===next.workerVersionId
    &&old.origin===next.origin&&old.accessIssuer===next.accessIssuer&&old.accessAudience===next.accessAudience
    &&old.emailSha256===next.emailSha256&&old.reference===next.reference&&old.notBefore===next.notBefore
    &&next.expiresAt<=old.expiresAt&&JSON.stringify(old.databaseTarget)===JSON.stringify(next.databaseTarget),
  'admin_rebind_execute_preview_changed');
}

function parameters(roles) {
  const values=['admin','runtime','jobs','privacy','migrations'].map(label=>roles[`lythaus_${label}`]);
  check(values.every(value=>/^pscale_api_[a-z0-9]+$/.test(value??''))&&new Set(values).size===5,
    'admin_rebind_activation_roles_invalid');
  return [...values.slice(0,4),REBIND_SIGNATURE];
}

async function inventory(client,roles,payload,guard=null) {
  const result=await client.query(REBIND_BOUNDARY_SQL,parameters(roles));
  check(result.rowCount===1&&result.rows.length===1,'admin_rebind_capability_missing');
  let row=result.rows[0];
  if(guard){
    check(Array.isArray(row.settings)&&row.settings.filter(value=>value===`${guard}=locked`).length===1,
      'admin_rebind_policy_guard_unverified');
    row={...row,settings:row.settings.filter(value=>value!==`${guard}=locked`)};
  }
  return checkedFunctionPolicy(row,payload);
}

async function lockPolicy(client,roles,payload) {
  // A unique, unused function setting obtains the catalog tuple write lock.
  // It preserves the policy and every other setting, and is reset in this same
  // transaction. Never grant the caller UPDATE on PostgreSQL system catalogs.
  await inventory(client,roles,payload);
  const before=await client.query(REBIND_POLICY_ID_SQL,[REBIND_SIGNATURE]);
  check(before.rowCount===1,'admin_rebind_capability_missing');
  const guard=`lythaus.rebind_guard_${randomBytes(16).toString('hex')}`;
  const capacity=await client.query(REBIND_OWNER_CAPACITY_SQL,[guard,REBIND_POLICY_SETTING]);
  check(capacity.rowCount===1&&capacity.rows[0].owner_context===true&&capacity.rows[0].guard_allowed===true
    &&capacity.rows[0].policy_allowed===true,'admin_rebind_existing_owner_capacity_unverified');
  await client.query('SELECT set_config($1,$2,true)',[guard,'locked']);
  await client.query(`ALTER FUNCTION ${REBIND_SIGNATURE} SET ${guard} FROM CURRENT`);
  const after=await client.query(REBIND_POLICY_ID_SQL,[REBIND_SIGNATURE]);
  check(after.rowCount===1&&after.rows[0].oid===before.rows[0].oid,'admin_rebind_capability_replaced');
  const previous=await inventory(client,roles,payload,guard);
  return {guard,previous};
}

async function useExistingOwnerAuthority(client,roles) {
  parameters(roles);
  const session=await client.query(REBIND_OPERATOR_SESSION_SQL),row=session.rows[0];
  check(session.rowCount===1&&row.database_name==='postgres'&&row.current_role===row.session_role
    &&[roles.lythaus_migrations,`${roles.lythaus_migrations}.vqa2g2xc9wsl`].includes(row.current_role)
    &&row.may_set_owner===true,'admin_rebind_existing_owner_authority_unverified');
  await client.query('SET LOCAL ROLE postgres');
}

export async function transitionRebindPolicy(client,{consent,roles,now=Date.now}) {
  const effective=parseRebindPolicy(consent.policy);
  const intent=parseRebindIntent(consent.record.policy);
  const {bindingProof:_proof,...effectiveIntent}=effective??{};
  check(effective&&intent&&JSON.stringify(effectiveIntent)===JSON.stringify(intent)
    &&consent.policyText===canonical(effective)&&consent.policySha256===policySha256(consent.policyText),
  'admin_rebind_control_plane_proof_required');
  const current=()=>{
    const at=now();
    check(at<Date.parse(consent.record.expiresAt)&&at<effective.expiresAt*1000
      &&at>=Date.parse(consent.record.approvedAt),'admin_rebind_activation_consent_expired');
    check(effective.bindingProof.checkedAt*1000<=at&&at-effective.bindingProof.checkedAt*1000<=120000,
      'admin_rebind_control_plane_proof_stale');
  };
  current();
  await useExistingOwnerAuthority(client,roles);
  await client.query('SET LOCAL statement_timeout = \'5s\'');
  await client.query('SET LOCAL lock_timeout = \'2s\'');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('lythaus-schema-migrations'))");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('lythaus:first-admin-bootstrap:v1'))");
  await client.query('LOCK TABLE identity.admin_memberships IN SHARE ROW EXCLUSIVE MODE');
  const {guard,previous}=await lockPolicy(client,roles,consent.payload);
  requirePolicyTransition(previous,consent);
  const state=await client.query(REBIND_SOURCE_STATE_SQL);
  check(state.rowCount===1&&state.rows.length===1&&Object.values(state.rows[0]).length===4
    &&Object.values(state.rows[0]).every(value=>value===true),'admin_rebind_original_principal_changed');
  current();
  await client.query('SELECT set_config($1,$2,true)',[REBIND_POLICY_SETTING,consent.policyText]);
  await client.query(REBIND_POLICY_ALTER_SQL);
  await client.query(`ALTER FUNCTION ${REBIND_SIGNATURE} RESET ${guard}`);
  check(await inventory(client,roles,consent.payload)===consent.policyText,'admin_rebind_activation_postcondition_failed');
  current();
  return {status:`${consent.record.stage.toUpperCase()}_POLICY_INSTALLED`,policySha256:consent.policySha256,
    expiresAt:consent.policy.expiresAt,membershipWritePerformed:false};
}

export async function disableRebindPolicy(client,{roles,payload,allowedPolicyHashes}) {
  check(Array.isArray(allowedPolicyHashes)&&allowedPolicyHashes.length>=1&&allowedPolicyHashes.length<=2
    &&allowedPolicyHashes.every(value=>hash.test(value)),'admin_rebind_cleanup_binding_invalid');
  await useExistingOwnerAuthority(client,roles);
  await client.query('SET LOCAL statement_timeout = \'5s\'');
  await client.query('SET LOCAL lock_timeout = \'2s\'');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('lythaus-schema-migrations'))");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('lythaus:first-admin-bootstrap:v1'))");
  await client.query('LOCK TABLE identity.admin_memberships IN SHARE ROW EXCLUSIVE MODE');
  const {guard,previous}=await lockPolicy(client,roles,payload);
  if(previous==='DISABLED'){
    await client.query(`ALTER FUNCTION ${REBIND_SIGNATURE} RESET ${guard}`);
    return {status:'ALREADY_DISABLED',membershipWritePerformed:false};
  }
  check(allowedPolicyHashes.includes(policySha256(previous)),'admin_rebind_cleanup_refuses_different_policy');
  await client.query('SELECT set_config($1,$2,true)',[REBIND_POLICY_SETTING,'DISABLED']);
  await client.query(REBIND_POLICY_ALTER_SQL);
  await client.query(`ALTER FUNCTION ${REBIND_SIGNATURE} RESET ${guard}`);
  check(await inventory(client,roles,payload)==='DISABLED','admin_rebind_disable_postcondition_failed');
  return {status:'DISABLED',membershipWritePerformed:false};
}

export async function withRebindPolicyTransaction({connect,work,roles,payload,expectedPolicySha256}) {
  let client,commitAttempted=false,result;
  try {
    client=await connect();
    await client.query('BEGIN');
    result=await work(client);
    commitAttempted=true;
    await client.query('COMMIT');
    await client.end();client=null;
  } catch {
    if(client){try{if(!commitAttempted)await client.query('ROLLBACK');}catch{}try{await client.end();}catch{}}
    if(!commitAttempted)throw new Error('admin_rebind_policy_transaction_failed');
  }
  // COMMIT acknowledgement or connection-close failure never proves rollback.
  // Read back with a new session and never retry an ALTER automatically.
  let reader;
  try {
    reader=await connect();
    await reader.query('BEGIN READ ONLY');
    const policy=await inventory(reader,roles,payload);
    check(policySha256(policy)===expectedPolicySha256,'admin_rebind_policy_readback_mismatch');
    await reader.query('COMMIT');
    await reader.end();reader=null;
    return {...result,readbackVerified:true};
  } catch {
    if(reader){try{await reader.end();}catch{}}
    throw new Error('admin_rebind_policy_outcome_unknown_read_only_reconciliation_required');
  }
}
