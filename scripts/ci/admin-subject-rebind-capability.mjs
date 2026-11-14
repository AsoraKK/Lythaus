import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

export const REBIND_SIGNATURE='identity.rebind_control_plane_administrator(bytea,text,uuid,text,bytea,bigint,uuid,text)';
export const REBIND_GRANT_PATH='database/planetscale/grants/admin-subject-rebind.sql';
const repository=new URL('https://github.com/AsoraKK/Lythaus/').pathname.slice(1,-1);
const sha256=value=>createHash('sha256').update(value).digest('hex');
const check=(condition,code)=>{if(!condition)throw new Error(code);};
const read=(root,file,committedOnly)=>committedOnly
  ?execFileSync('git',['show',`HEAD:${file}`],{cwd:root}):fs.readFileSync(path.join(root,file));

export function rebindGrantPayload({root=process.cwd(),committedOnly=false}={}) {
  const raw=read(root,REBIND_GRANT_PATH,committedOnly),sql=raw.toString('utf8');
  const bodies=[...sql.matchAll(/AS \$\$([\s\S]*?)\$\$;/g)];
  check(bodies.length===1&&sql.includes('CREATE FUNCTION identity.rebind_control_plane_administrator(')
    &&!sql.includes('CREATE OR REPLACE FUNCTION'),
    'admin_rebind_grant_source_invalid');
  return {sql,sha256:sha256(raw),bodySha256:sha256(bodies[0][1]),
    roleGrantsSha256:sha256(read(root,'database/planetscale/grants/roles.sql',committedOnly))};
}

export function rebindInstallConsent(env,{root=process.cwd(),committedOnly=env.CI==='true',now=Date.now()}={}) {
  if(!env.ADMIN_SUBJECT_REBIND_INSTALL_APPROVAL_JSON)return null;
  let record;try{record=JSON.parse(env.ADMIN_SUBJECT_REBIND_INSTALL_APPROVAL_JSON);}catch{throw new Error('admin_rebind_install_consent_invalid');}
  check(record&&typeof record==='object'&&!Array.isArray(record)
    &&Object.keys(record).sort().join(',')==='approvalReference,approvedAt,expiresAt,grantSha256,operator,releaseSha,roleGrantsSha256,schemaVersion,scope',
  'admin_rebind_install_consent_invalid');
  check(record.schemaVersion==='lythaus-admin-subject-rebind-install-v1'&&record.scope==='install_disabled_capability_only',
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
  return {record,payload};
}

export const REBIND_BOUNDARY_SQL=`SELECT p.prosrc AS body, p.prosecdef AS security_definer,
  pg_get_userbyid(p.proowner) AS owner, p.proconfig AS settings,
  p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql') AS language_matches,
  (p.prorettype='boolean'::regtype AND NOT p.proretset AND p.prokind='f') AS return_matches,
  (p.provolatile='v' AND p.proparallel='u' AND NOT p.proisstrict AND NOT p.proleakproof AND p.prosupport::oid=0) AS behavior_matches,
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
  check(Array.isArray(row.settings)&&row.settings.length===2
    &&row.settings.includes('search_path=pg_catalog')
    &&row.settings.includes('lythaus.admin_subject_rebind_approval=DISABLED'),
  'admin_rebind_capability_not_disabled');
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

export async function installReviewedRebindCapability(client,consent,roles,{now=Date.now}={}) {
  if(consent===null)return {status:'NOT_REQUESTED',installed:false};
  const current=()=>check(Date.parse(consent.record.approvedAt)<=now()&&now()<Date.parse(consent.record.expiresAt),
    'admin_rebind_install_consent_expired');
  current();
  for(const label of ['runtime','admin','jobs','privacy','migrations'])check(/^pscale_api_[a-z0-9]+$/.test(roles[`lythaus_${label}`]??''),
    'admin_rebind_role_identifiers_invalid');
  check(new Set(Object.values(roles)).size===Object.values(roles).length,'admin_rebind_role_identifiers_ambiguous');
  const authority=await client.query("SELECT current_database()='postgres' AND pg_has_role(current_user,'postgres','SET') AS owner_context_available");
  check(authority.rowCount===1&&authority.rows[0]?.owner_context_available===true,'admin_rebind_owner_context_unavailable');
  await client.query('SET LOCAL ROLE postgres');
  const setting=await client.query("SELECT current_user='postgres' AND has_parameter_privilege(current_user,'lythaus.admin_subject_rebind_approval','SET') AS policy_setting_available");
  check(setting.rowCount===1&&setting.rows[0]?.policy_setting_available===true,'admin_rebind_policy_setting_permission_unavailable');
  const state=await client.query(REBIND_SOURCE_STATE_SQL);
  check(state.rowCount===1&&Array.isArray(state.rows)&&state.rows.length===1&&state.rows[0]
    &&Object.values(state.rows[0]).length===4&&Object.values(state.rows[0]).every(value=>value===true),
    'admin_rebind_install_original_administrator_state_changed');
  const parameters=[roles.lythaus_admin,roles.lythaus_runtime,roles.lythaus_jobs,roles.lythaus_privacy,REBIND_SIGNATURE];
  const before=await client.query(REBIND_BOUNDARY_SQL,parameters);
  check(Array.isArray(before.rows)&&before.rowCount===before.rows.length&&before.rows.length<=1,'admin_rebind_capability_inventory_invalid');
  if(before.rowCount===1){
    assertRebindBoundary(before.rows[0],consent.payload);
    current();
    return {status:'ALREADY_INSTALLED_DISABLED',installed:false,grantSha256:consent.payload.sha256};
  }
  current();
  const sql=consent.payload.sql.replace(/\blythaus_(runtime|admin|jobs|privacy|migrations)\b/g,label=>`"${roles[label]}"`);
  await client.query(sql);
  const after=await client.query(REBIND_BOUNDARY_SQL,parameters);
  check(after.rowCount===1&&after.rows.length===1,'admin_rebind_capability_installation_unverified');
  assertRebindBoundary(after.rows[0],consent.payload);
  current();
  return {status:'INSTALLED_DISABLED',installed:true,grantSha256:consent.payload.sha256,
    roleGrantsSha256:consent.payload.roleGrantsSha256};
}
