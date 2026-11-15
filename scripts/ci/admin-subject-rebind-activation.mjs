import {createHash} from 'node:crypto';
import {parseRebindIntent,parseRebindPolicy,sealRebindPolicy} from '../../apps/lythaus-admin-api/src/solo-recovery/rebind-protocol.ts';
import {REBIND_BOUNDARY_SQL,REBIND_SIGNATURE,REBIND_SOURCE_STATE_SQL,assertRebindBoundary} from './admin-subject-rebind-capability.mjs';
import {REBIND_READER_SIGNATURE,REBIND_RESTORE_STATE_SIGNATURE,REBIND_CONTROL_UPDATE_SQL,rebindControlInventory} from './admin-subject-rebind-control.mjs';
import {validateRebindExecutor,assertRebindExecutorSession,rebindExecutorBindingSha256} from './admin-subject-rebind-executor.mjs';

const repository=new URL('https://github.com/AsoraKK/Lythaus/').pathname.slice(1,-1);
const sha=/^[a-f0-9]{40}$/;
const hash=/^[a-f0-9]{64}$/;
const check=(condition,code)=>{if(!condition)throw new Error(code);};
const keys=value=>Object.keys(value).sort().join(',');
export const policySha256=value=>createHash('sha256').update(value).digest('hex');
export const DISABLED_POLICY_SHA256=policySha256('DISABLED');
export const REBIND_POLICY_ID_SQL='SELECT oid FROM pg_catalog.pg_proc WHERE oid=to_regprocedure($1)';
export const rebindCatalogLockSql=signature=>`ALTER FUNCTION ${signature} COST 100`;
const canonical=value=>JSON.stringify(parseRebindPolicy(value));
const validRevision=value=>Number.isSafeInteger(value)&&value>=0&&value<Number.MAX_SAFE_INTEGER-2;

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
    &&keys(record)==='approvalReference,approvedAt,catalogLock,disableAtExpiry,executor,expiresAt,grantSha256,operator,policy,previousPolicyRevision,previousPolicySha256,releaseRunId,releaseSha,schemaVersion,scope,stage,workerVersionId',
  'admin_rebind_activation_consent_invalid');
  check(record.schemaVersion==='lythaus-admin-subject-rebind-activation-v2'
    &&record.scope==='owner_control_record_and_catalog_lock'&&record.catalogLock==='canonical_functions_cost_100'
    &&record.stage===stage&&['preview','execute'].includes(stage)
    &&record.disableAtExpiry===true&&record.releaseSha===env.RELEASE_SHA&&record.releaseRunId===env.GITHUB_RUN_ID
    &&record.operator===env.GITHUB_ACTOR&&record.workerVersionId===env.ADMIN_WORKER_VERSION_ID
    &&record.grantSha256===payload.sha256&&hash.test(record.previousPolicySha256??'')
    &&validRevision(record.previousPolicyRevision),
  'admin_rebind_activation_scope_invalid');
  validateRebindExecutor(record.executor);
  const policy=parseRebindIntent(record.policy);
  check(policy&&policy.mode===stage&&policy.sourceSha===record.releaseSha&&policy.workerVersionId===record.workerVersionId
    &&policy.capabilitySha256===payload.sha256&&policy.controlRevision===record.previousPolicyRevision+1
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
  if(stage==='execute') {
    let previousExecutor;try{previousExecutor=JSON.parse(env.ADMIN_REBIND_EXECUTOR_BINDING_JSON);}catch{}
    check(record.previousPolicySha256===env.ADMIN_REBIND_PREVIEW_POLICY_SHA256
      &&record.previousPolicyRevision===Number(env.ADMIN_REBIND_PREVIEW_CONTROL_REVISION)
      &&rebindExecutorBindingSha256(record.executor)===rebindExecutorBindingSha256(previousExecutor),
    'admin_rebind_execute_preview_binding_invalid');
  }
  return {record,policy,payload};
}

export function sealRebindActivationConsent(consent,bindingProof) {
  const policy=sealRebindPolicy(consent.policy,bindingProof);
  check(policy&&policy.bindingProof.releaseRunId===consent.record.releaseRunId,'admin_rebind_control_plane_proof_invalid');
  const policyText=canonical(policy);
  return {...consent,policy,policyText,policySha256:policySha256(policyText)};
}

export function requirePolicyTransition(previous,consent) {
  check(policySha256(previous.policyText)===consent.record.previousPolicySha256
    &&previous.revision===consent.record.previousPolicyRevision
    &&consent.policy.controlRevision===previous.revision+1,'admin_rebind_policy_changed_before_activation');
  if(consent.record.stage==='preview') {
    check(previous.policyText==='DISABLED','admin_rebind_preview_must_start_disabled');
    return;
  }
  const old=parseRebindPolicy(previous.policyText),next=consent.policy;
  check(old&&old.mode==='preview'&&old.controlRevision===previous.revision
    &&old.capabilitySha256===next.capabilitySha256&&old.sourceSha===next.sourceSha&&old.workerVersionId===next.workerVersionId
    &&old.origin===next.origin&&old.accessIssuer===next.accessIssuer&&old.accessAudience===next.accessAudience
    &&old.emailSha256===next.emailSha256&&old.reference===next.reference&&old.notBefore===next.notBefore
    &&next.expiresAt<=old.expiresAt&&JSON.stringify(old.databaseTarget)===JSON.stringify(next.databaseTarget),
  'admin_rebind_execute_preview_changed');
}

function parameters(roles) {
  const values=['admin','runtime','jobs','privacy','migrations'].map(label=>roles[`lythaus_${label}`]);
  check(values.every(value=>/^pscale_api_[a-z0-9]+$/.test(value??''))&&new Set(values).size===5,'admin_rebind_activation_roles_invalid');
  return [...values.slice(0,4),REBIND_SIGNATURE];
}

export async function inventoryRebindPolicy(client,roles,payload,{lock=false}={}) {
  const result=await client.query(REBIND_BOUNDARY_SQL,parameters(roles));
  check(result.rowCount===1&&result.rows.length===1,'admin_rebind_capability_missing');
  assertRebindBoundary(result.rows[0],payload);
  const control=await rebindControlInventory(client,roles,payload,{lock});
  check(control.policyText==='DISABLED'||parseRebindPolicy(control.policyText)?.controlRevision===control.revision,
    'admin_rebind_control_state_invalid');
  return control;
}

async function lockPolicy(client,roles,payload) {
  await inventoryRebindPolicy(client,roles,payload);
  for(const signature of [REBIND_READER_SIGNATURE,REBIND_RESTORE_STATE_SIGNATURE,REBIND_SIGNATURE].sort()) {
    const before=await client.query(REBIND_POLICY_ID_SQL,[signature]);
    check(before.rowCount===1,'admin_rebind_capability_missing');
    // The exact consent includes COST100 normalization; no authorization field is normalized.
    await client.query(rebindCatalogLockSql(signature));
    const after=await client.query(REBIND_POLICY_ID_SQL,[signature]);
    check(after.rowCount===1&&after.rows[0].oid===before.rows[0].oid,'admin_rebind_capability_replaced');
  }
  return inventoryRebindPolicy(client,roles,payload,{lock:true});
}

async function useExistingOwnerAuthority(client,roles,executor) {
  parameters(roles);
  await assertRebindExecutorSession(client,executor,roles);
  await client.query('SET LOCAL ROLE postgres');
}

async function coordinate(client) {
  await client.query("SET LOCAL statement_timeout = '5s'");
  await client.query("SET LOCAL lock_timeout = '2s'");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('lythaus-schema-migrations'))");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('lythaus:first-admin-bootstrap:v1'))");
}

async function writeControl(client,previous,policyText,disabledFromPolicySha256) {
  const changed=await client.query(REBIND_CONTROL_UPDATE_SQL,[policyText,disabledFromPolicySha256,previous.revision,previous.policyText]);
  check(changed.rowCount===1&&changed.rows.length===1&&Number(changed.rows[0].revision)===previous.revision+1,
    'admin_rebind_control_compare_and_swap_failed');
}

export async function transitionRebindPolicy(client,{consent,roles,now=Date.now}) {
  const effective=parseRebindPolicy(consent.policy),intent=parseRebindIntent(consent.record.policy);
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
  await useExistingOwnerAuthority(client,roles,consent.record.executor);
  await coordinate(client);
  const previous=await lockPolicy(client,roles,consent.payload);
  requirePolicyTransition(previous,consent);
  await client.query('LOCK TABLE identity.admin_memberships IN SHARE ROW EXCLUSIVE MODE');
  const state=await client.query(REBIND_SOURCE_STATE_SQL);
  check(state.rowCount===1&&state.rows.length===1&&Object.values(state.rows[0]).length===4
    &&Object.values(state.rows[0]).every(value=>value===true),'admin_rebind_original_principal_changed');
  current();
  await writeControl(client,previous,consent.policyText,null);
  const after=await inventoryRebindPolicy(client,roles,consent.payload);
  check(after.policyText===consent.policyText&&after.revision===effective.controlRevision
    &&after.disabledFromPolicySha256===null,'admin_rebind_activation_postcondition_failed');
  current();
  return {status:`${consent.record.stage.toUpperCase()}_POLICY_INSTALLED`,policySha256:consent.policySha256,
    controlRevision:after.revision,disabledFromPolicySha256:null,expiresAt:consent.policy.expiresAt,membershipWritePerformed:false};
}

export async function disableRebindPolicy(client,{roles,payload,executor,allowedPolicies,previousDisabledRevision}) {
  check(Array.isArray(allowedPolicies)&&allowedPolicies.length>=1&&allowedPolicies.length<=2
    &&allowedPolicies.every(value=>value&&hash.test(value.policySha256??'')&&validRevision(value.controlRevision))
    &&validRevision(previousDisabledRevision)
    &&allowedPolicies[0].controlRevision===previousDisabledRevision+1,'admin_rebind_cleanup_binding_invalid');
  await useExistingOwnerAuthority(client,roles,executor);
  await coordinate(client);
  const previous=await lockPolicy(client,roles,payload);
  if(previous.policyText==='DISABLED') {
    check(previous.revision===previousDisabledRevision||allowedPolicies.some(value=>
      previous.revision===value.controlRevision+1&&previous.disabledFromPolicySha256===value.policySha256),
    'admin_rebind_cleanup_refuses_different_policy');
    return {status:'ALREADY_DISABLED',controlRevision:previous.revision,disabledFromPolicySha256:previous.disabledFromPolicySha256,
      membershipWritePerformed:false,bindingOutcomeVerified:false};
  }
  const previousHash=policySha256(previous.policyText);
  check(allowedPolicies.some(value=>value.policySha256===previousHash&&value.controlRevision===previous.revision),
    'admin_rebind_cleanup_refuses_different_policy');
  await writeControl(client,previous,'DISABLED',previousHash);
  const after=await inventoryRebindPolicy(client,roles,payload);
  check(after.policyText==='DISABLED'&&after.revision===previous.revision+1
    &&after.disabledFromPolicySha256===previousHash,'admin_rebind_disable_postcondition_failed');
  return {status:'DISABLED',controlRevision:after.revision,disabledFromPolicySha256:after.disabledFromPolicySha256,
    membershipWritePerformed:false,bindingOutcomeVerified:false};
}

export async function withRebindPolicyTransaction({connect,work,roles,payload,executor,expectedPolicySha256}) {
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
  let reader;
  try {
    reader=await connect();
    await reader.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await useExistingOwnerAuthority(reader,roles,executor);
    const observed=await inventoryRebindPolicy(reader,roles,payload);
    const exact=policySha256(observed.policyText)===expectedPolicySha256&&observed.revision===result.controlRevision
      &&observed.disabledFromPolicySha256===result.disabledFromPolicySha256;
    const consumed=expectedPolicySha256!==DISABLED_POLICY_SHA256&&observed.policyText==='DISABLED'
      &&observed.revision===result.controlRevision+1&&observed.disabledFromPolicySha256===expectedPolicySha256;
    check(exact||consumed,'admin_rebind_policy_readback_mismatch');
    await reader.query('COMMIT');
    await reader.end();reader=null;
    return {...result,...(consumed?{status:'POLICY_CONSUMED_OR_DISABLED',bindingOutcomeVerified:false}:{}),readbackVerified:true};
  } catch {
    if(reader){try{await reader.end();}catch{}}
    throw new Error('admin_rebind_policy_outcome_unknown_read_only_reconciliation_required');
  }
}
