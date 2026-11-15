import {createHash} from 'node:crypto';
import {branchQualifiedDatabaseTarget} from './planetscale-0021-target-identity.mjs';
import {roleInventory,activeRole} from './planetscale-migration-role-audit.mjs';
import {REBIND_METADATA_VERIFIER_ROLE} from './admin-subject-rebind-control.mjs';

const check=(condition,code)=>{if(!condition)throw new Error(code);};
const hash=/^[a-f0-9]{64}$/;
const labels=['admin','jobs','migrations','privacy','runtime'];
const digest=value=>createHash('sha256').update(value).digest('hex');
export const rebindExecutorRoleFingerprint=role=>digest(`lythaus-admin-rebind-executor:v1:${role}`);
export const rebindRoleMapSha256=roles=>digest(JSON.stringify(labels.map(label=>[label,roles[`lythaus_${label}`]])));

export function validateRebindExecutor(value) {
  check(value&&typeof value==='object'&&!Array.isArray(value)
    &&Object.keys(value).sort().join(',')==='branchId,databaseName,mode,originFingerprint,roleFingerprint,roleId,roleMapSha256'
    &&value.mode==='existing_owner_connection'&&value.branchId==='vqa2g2xc9wsl'&&value.databaseName==='postgres'
    &&hash.test(value.originFingerprint??'')&&hash.test(value.roleFingerprint??'')&&hash.test(value.roleMapSha256??'')
    &&typeof value.roleId==='string'&&/^[a-z0-9]{1,64}$/.test(value.roleId),
  'admin_rebind_executor_consent_invalid');
  return value;
}

export function rebindExecutorBindingSha256(value) {
  validateRebindExecutor(value);
  return digest(JSON.stringify(Object.keys(value).sort().map(key=>[key,value[key]])));
}

export function assertRebindExecutorTarget(raw,roles,expectedOrigin,executor) {
  validateRebindExecutor(executor);
  check(labels.every(label=>/^pscale_api_[a-z0-9]+$/.test(roles[`lythaus_${label}`]??''))
    &&new Set(labels.map(label=>roles[`lythaus_${label}`])).size===5,
  'admin_rebind_role_identifiers_invalid');
  let target;try{target=branchQualifiedDatabaseTarget(raw);}catch{throw new Error('admin_rebind_executor_target_invalid');}
  check(new URL(raw).searchParams.get('sslmode')==='verify-full'
    &&/^pscale_api_[a-z0-9]+$/.test(target.role)&&target.branchId===executor.branchId
    &&target.sqlDatabaseName===executor.databaseName&&target.originFingerprint===expectedOrigin
    &&target.originFingerprint===executor.originFingerprint
    &&rebindExecutorRoleFingerprint(target.role)===executor.roleFingerprint
    &&rebindRoleMapSha256(roles)===executor.roleMapSha256
    &&target.role!==REBIND_METADATA_VERIFIER_ROLE&&!Object.values(roles).includes(REBIND_METADATA_VERIFIER_ROLE)
    &&!['admin','jobs','privacy','runtime'].some(label=>roles[`lythaus_${label}`]===target.role),
  'admin_rebind_executor_target_mismatch');
  return target;
}

export function assertRebindMetadataVerifierTarget(raw,expectedOrigin) {
  let target;try{target=branchQualifiedDatabaseTarget(raw);}catch{throw new Error('admin_rebind_metadata_verifier_target_unverified');}
  check(target.role===REBIND_METADATA_VERIFIER_ROLE&&target.branchId==='vqa2g2xc9wsl'&&target.sqlDatabaseName==='postgres'
    &&target.originFingerprint===expectedOrigin&&new URL(raw).searchParams.get('sslmode')==='verify-full',
  'admin_rebind_metadata_verifier_target_unverified');
  return target;
}

export async function verifyRebindExecutorProvider(env,executor,{fetchImpl=fetch,now=Date.now(),requiredThrough=now+300000,verifyMetadataVerifier=true}={}) {
  validateRebindExecutor(executor);
  try {
    const inventory=await roleInventory(env,fetchImpl);
    const matches=inventory.filter(row=>rebindExecutorRoleFingerprint(row.base_username)===executor.roleFingerprint);
    check(matches.length===1&&matches[0].id===executor.roleId,'admin_rebind_executor_provider_mismatch');
    activeRole(matches[0],now);
    if(verifyMetadataVerifier){
      const verifier=inventory.filter(row=>row.base_username===REBIND_METADATA_VERIFIER_ROLE);
      check(verifier.length===1,'admin_rebind_metadata_verifier_identity_unverified');
      activeRole(verifier[0],now);
      check(verifier[0].expires_at===null||Date.parse(verifier[0].expires_at)>requiredThrough,
        'admin_rebind_metadata_verifier_expires_before_cleanup');
    }
    check(Number.isFinite(requiredThrough)&&requiredThrough>=now
      &&(matches[0].expires_at===null||Date.parse(matches[0].expires_at)>requiredThrough),
    'admin_rebind_executor_expires_before_cleanup');
    return {executorVerified:true};
  } catch(error) {
    if(/^admin_rebind_(executor|metadata_verifier)_[a-z_]+$/.test(error?.message??''))throw error;
    throw new Error('admin_rebind_executor_provider_unverified');
  }
}

export const REBIND_EXECUTOR_SESSION_SQL=`SELECT current_database() AS database_name,current_user AS current_role,
  session_user AS session_role,pg_has_role(current_user,'postgres','SET') AS may_set_owner,
  EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname=current_user AND r.rolcanlogin AND NOT r.rolsuper
    AND NOT r.rolreplication AND (r.rolvaliduntil IS NULL OR r.rolvaliduntil>clock_timestamp())) AS login_valid,
  NOT EXISTS(SELECT 1 FROM unnest($1::text[]) AS app JOIN pg_roles reachable
    ON pg_has_role(app,reachable.oid,'MEMBER') OR pg_has_role(app,reachable.oid,'SET')
    WHERE reachable.rolname IN('postgres',current_user)) AS apps_isolated`;

export async function assertRebindExecutorSession(client,executor,roles) {
  validateRebindExecutor(executor);
  check(rebindRoleMapSha256(roles)===executor.roleMapSha256,'admin_rebind_executor_role_map_changed');
  const result=await client.query(REBIND_EXECUTOR_SESSION_SQL,[['admin','runtime','jobs','privacy'].map(label=>roles[`lythaus_${label}`])]);
  const row=result.rows[0],base=typeof row?.current_role==='string'?row.current_role.replace(/\.vqa2g2xc9wsl$/,''):null;
  check(result.rowCount===1&&result.rows.length===1&&row.database_name===executor.databaseName
    &&row.current_role===row.session_role&&rebindExecutorRoleFingerprint(base)===executor.roleFingerprint
    &&row.may_set_owner===true&&row.login_valid===true&&row.apps_isolated===true,
  'admin_rebind_existing_owner_authority_unverified');
}
