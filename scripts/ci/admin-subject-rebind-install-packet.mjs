import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {ownerContext,canonicalRoles,mainConnection,roleInventory,activeRole,readOnly,AuditFailure,check} from './planetscale-migration-role-audit.mjs';
import {quietConsumers} from './planetscale-migration-probe-evidence.mjs';
import {githubRead} from './planetscale-native-restore-evidence.mjs';
import {rebindGrantPayload,REBIND_OBJECTS_SQL,REBIND_SOURCE_STATE_SQL} from './admin-subject-rebind-capability.mjs';
import {rebindExecutorRoleFingerprint,rebindRoleMapSha256,assertRebindExecutorTarget,assertRebindExecutorSession,assertRebindMetadataVerifierTarget,rebindExecutorSessionDiagnostic,assertRebindExecutorProviderProfile} from './admin-subject-rebind-executor.mjs';
import {REBIND_METADATA_VERIFIER_ROLE,REBIND_METADATA_VERIFIER_READY_EXPR} from './admin-subject-rebind-control.mjs';
import {loadApprovedMigrations} from './planetscale-migration-manifest.mjs';
import {selectRebindConnection,rebindSqlClient} from './admin-subject-rebind-connection.mjs';

export const REBIND_PACKET_CAPACITY_SQL=`SELECT
  has_database_privilege('postgres','postgres','CREATE') AS namespace_create,
  has_schema_privilege('postgres','identity','CREATE') AS functions_create,
  ${REBIND_METADATA_VERIFIER_READY_EXPR} AS verifier_ready`;
const requiredChecks=['Repository hygiene','Workflow lint','Native Workers and PlanetScale','OpenAPI contract','Flutter analyze and test',
  'Web frontends','Dependency audit','CodeQL JavaScript TypeScript','dependency-review','scan','Disabled activity pilot integration',
  'Offline posting feedback evaluation','Validate mobile security contracts'];
const failureBindings=new WeakMap();

export async function rebindPacketGithubRead(env,suffix,fetchImpl=fetch) {
  if(/^\/actions\//.test(suffix))return githubRead(env,suffix,fetchImpl);
  check(env.GITHUB_REPOSITORY_ID==='1010752912'&&/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/Lythaus$/.test(env.GITHUB_REPOSITORY??'')
    &&env.GH_TOKEN&&/^[a-f0-9]{40}$/.test(env.RELEASE_SHA??''),
    'packet_github_context_invalid');
  check(suffix==='/branches/main'||suffix===`/commits/${env.RELEASE_SHA}/check-runs?filter=latest&per_page=100`,
    'packet_github_path_invalid');
  const url=`https://api.github.com/repos/${env.GITHUB_REPOSITORY}${suffix}`;
  try {
    const response=await fetchImpl(url,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(15000),
      headers:{authorization:`Bearer ${env.GH_TOKEN}`,accept:'application/vnd.github+json'}});
    check(response.status===200&&!response.redirected&&(!response.url||response.url===url),'packet_github_read_failed');
    const chunks=[];let size=0;
    for await(const chunk of response.body){size+=chunk.byteLength;check(size<=1048576,'packet_github_response_invalid');chunks.push(chunk);}
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
  } catch {throw new AuditFailure('packet_github_read_failed');}
}

export async function requireRebindPacketMain(env,read=suffix=>rebindPacketGithubRead(env,suffix)) {
  const branch=await read('/branches/main');
  check(branch.protected===true&&branch.commit?.sha===env.RELEASE_SHA,'protected_main_moved');
  const checks=await read(`/commits/${env.RELEASE_SHA}/check-runs?filter=latest&per_page=100`);
  check(Array.isArray(checks.check_runs)&&Number.isSafeInteger(checks.total_count)&&checks.total_count===checks.check_runs.length
    &&checks.total_count<=100,'exact_main_checks_incomplete');
  const contexts=branch.protection?.required_status_checks?.contexts;
  check(Array.isArray(contexts)&&contexts.length>0&&contexts.every(value=>typeof value==='string'),'main_protection_unverified');
  for(const name of new Set([...requiredChecks,...contexts])) {
    const matching=checks.check_runs.filter(run=>run.name===name&&run.app?.id===15368);
    check(matching.length===1&&matching[0].head_sha===env.RELEASE_SHA&&matching[0].status==='completed'
      &&matching[0].conclusion==='success','exact_main_check_not_successful');
  }
}

export async function prepareRebindInstallPacket({env=process.env,clientFactory,fetchImpl=fetch,read,root=process.cwd(),now=Date.now(),
  assertCheckout=()=>{
    const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:15000}).trim();
    check(git(['rev-parse','HEAD'])===env.RELEASE_SHA,'checkout_changed');git(['diff','--exit-code']);git(['diff','--cached','--exit-code']);
  }}={}) {
  ownerContext(env);
  check(env.INSPECTION==='rebind-install-packet'&&!env.MIGRATION_PROBE_APPROVAL_JSON,'read_only_packet_context_required');
  read??=suffix=>rebindPacketGithubRead(env,suffix);
  await assertCheckout();await requireRebindPacketMain(env,read);await quietConsumers(env,read);
  const selection=selectRebindConnection(env,{stage:'packet'});env=selection.env;
  const roles=canonicalRoles(env.PSCALE_ROLE_IDENTIFIERS),target=mainConnection(env.PLANETSCALE_ADMIN_DATABASE_URL);
  const inventory=await roleInventory(env,fetchImpl);
  for(const role of new Set([...Object.values(roles),target.role,REBIND_METADATA_VERIFIER_ROLE])) {
    const matches=inventory.filter(value=>value.base_username===role);
    check(matches.length===1,'packet_role_identity_unverified');activeRole(matches[0],now);
  }
  const observed=inventory.find(value=>value.base_username===target.role);
  const executor={mode:selection.mode,branchId:'vqa2g2xc9wsl',databaseName:'postgres',roleId:observed.id,
    roleFingerprint:rebindExecutorRoleFingerprint(target.role),originFingerprint:target.originFingerprint,roleMapSha256:rebindRoleMapSha256(roles)};
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'infrastructure/cloudflare/native-hyperdrive-production.json'),'utf8'));
  assertRebindExecutorProviderProfile(observed,executor,{now,requiredThrough:now});
  assertRebindExecutorTarget(env.PLANETSCALE_ADMIN_DATABASE_URL,roles,manifest.expectedMainOriginFingerprint,executor);
  assertRebindMetadataVerifierTarget(env.PLANETSCALE_SCHEMA_READ_DATABASE_URL,manifest.expectedMainOriginFingerprint);
  const payload=rebindGrantPayload({root,committedOnly:env.CI==='true'});
  const expected=loadApprovedMigrations({root,committedOnly:env.CI==='true'}).migrations.map(row=>({version:row.name,checksum:row.checksum}));
  let state;
  try{state=await readOnly(env.PLANETSCALE_ADMIN_DATABASE_URL,clientFactory,async query=>{
    const client={query};
    const lock=await query("SELECT pg_try_advisory_xact_lock(hashtext('lythaus-schema-migrations')) AS locked");
    check(lock.rowCount===1&&lock.rows[0]?.locked===true,'migration_coordination_busy');
    await assertRebindExecutorSession(client,executor,roles);
    const capacity=await query(REBIND_PACKET_CAPACITY_SQL);
    check(capacity.rowCount===1&&capacity.rows[0]?.namespace_create===true&&capacity.rows[0]?.functions_create===true
      &&capacity.rows[0]?.verifier_ready===true,
      'existing_creation_authority_unverified');
    const registry=await query('SELECT version,checksum FROM system.schema_migrations ORDER BY version');
    check(JSON.stringify(registry.rows)===JSON.stringify(expected),'existing_migration_baseline_incomplete');
    const source=await query(REBIND_SOURCE_STATE_SQL);
    check(source.rowCount===1&&source.rows.length===1&&Object.values(source.rows[0]).length===4
      &&Object.values(source.rows[0]).every(value=>value===true),'original_administrator_state_changed');
    const objects=await query(REBIND_OBJECTS_SQL),flags=Object.values(objects.rows?.[0]??{});
    check(objects.rowCount===1&&objects.rows.length===1&&flags.length===5&&flags.every(value=>value===false),
      'existing_capability_requires_separate_read_only_reconciliation');
    return {capabilityState:'ABSENT',existingAuthorityVerified:true,originalAdministratorVerified:true,migrationBaselineVerified:true};
  },'lythaus-rebind-install-packet');}
  catch(error){
    if(rebindExecutorSessionDiagnostic(error))failureBindings.set(error,Object.freeze({
      mode:executor.mode,branchId:executor.branchId,databaseName:executor.databaseName,roleId:executor.roleId,
      roleFingerprint:executor.roleFingerprint,originFingerprint:executor.originFingerprint,roleMapSha256:executor.roleMapSha256,
    }));
    throw error;
  }
  await requireRebindPacketMain(env,read);
  return {schemaVersion:'lythaus-admin-rebind-install-packet-v1',status:'REVIEW_PACKET_NOT_INSTALL_AUTHORITY',
    sourceMainSha:env.RELEASE_SHA,runId:env.GITHUB_RUN_ID,runAttempt:1,generatedAt:new Date(now).toISOString(),...state,
    executable:false,databaseWrites:false,providerMutations:false,credentialsCreated:false,ownerLoginVerified:false,
    consentDraft:{schemaVersion:'lythaus-admin-subject-rebind-install-v2',scope:'install_disabled_capability_only',releaseSha:env.RELEASE_SHA,
      metadataVerifierPermission:'disabled_restore_state_only',
      grantSha256:payload.sha256,roleGrantsSha256:payload.roleGrantsSha256,executor,operator:env.GITHUB_ACTOR,
      approvalReference:null,approvedAt:null,expiresAt:null}};
}

export function rebindInstallPacketFailure(error,{env=process.env,now=Date.now()}={}) {
  const executorSession=rebindExecutorSessionDiagnostic(error);
  const configuredExecutor=executorSession?failureBindings.get(error):null;
  return {status:'BLOCKED',blocker:error instanceof AuditFailure||/^admin_rebind_[a-z_]+$/.test(error?.message??'')
    ?error.message:'read_only_packet_unverified',
    sourceMainSha:/^[a-f0-9]{40}$/.test(env.RELEASE_SHA??'')?env.RELEASE_SHA:null,
    runId:/^[1-9][0-9]{0,14}$/.test(env.GITHUB_RUN_ID??'')?env.GITHUB_RUN_ID:null,
    generatedAt:new Date(now).toISOString(),...(executorSession?{executorSession}:{}),
    ...(configuredExecutor?{configuredExecutor:{...configuredExecutor},
      configuredExecutorStatus:'PROVIDER_IDENTITY_VERIFIED_SQL_QUALIFICATION_FAILED'}:{}),
    executable:false,databaseWrites:false,providerMutations:false,credentialsCreated:false,ownerLoginVerified:false};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  let report;
  try{const {default:pg}=await import('pg');report=await prepareRebindInstallPacket({clientFactory:config=>rebindSqlClient(config,pg.Client)});}
  catch(error){report=rebindInstallPacketFailure(error);}
  console.log(JSON.stringify(report,null,2));if(report.status!=='REVIEW_PACKET_NOT_INSTALL_AUTHORITY')process.exitCode=1;
}
