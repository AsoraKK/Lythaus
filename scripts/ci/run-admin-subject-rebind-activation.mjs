import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import pg from 'pg';
import {rebindGrantPayload} from './admin-subject-rebind-capability.mjs';
import {adminDatabaseConnectionConfig,branchQualifiedDatabaseTarget} from './planetscale-0021-target-identity.mjs';
import {DISABLED_POLICY_SHA256,requireRebindActivationContext,rebindActivationConsent,sealRebindActivationConsent,transitionRebindPolicy,
  disableRebindPolicy,withRebindPolicyTransaction} from './admin-subject-rebind-activation.mjs';
import {verifyRebindLiveTarget} from './verify-admin-subject-rebind-live.mjs';
import {validateRebindExecutor,assertRebindExecutorTarget,verifyRebindExecutorProvider} from './admin-subject-rebind-executor.mjs';
import {read0021RestoreEvidenceRecord} from './planetscale-0021-restore-evidence-loader.mjs';
import {verifyRebindRecoveryCapability} from './admin-subject-rebind-recovery.mjs';
import {selectRebindConnection,rebindSqlClient} from './admin-subject-rebind-connection.mjs';

const check=(condition,code)=>{if(!condition)throw new Error(code);};
const hash=/^[a-f0-9]{64}$/;

export function requireRebindBaseRecoveryReport(report,env,now=Date.now()) {
  const generated=Date.parse(report?.generatedAt);
  check(report?.ready===true&&report.ok===true&&report.sourceMainSha===env.RELEASE_SHA
    &&report.databaseWrites===false&&report.providerMutations===false&&report.blockers?.length===0
    &&report.backup?.protected===true&&report.backup.state==='success'
    &&report.restoreEvidence?.ok===true&&report.restoreEvidence.evidenceArtifact?.status==='verified'
    &&report.restoreEvidence.independentRecovery?.status==='VERIFIED'
    &&Number.isFinite(generated)&&generated<=now&&now-generated<=120000,
  'admin_rebind_fresh_recovery_not_verified');
}

export function requireRebindRecoveryReport(report,env,now=Date.now()) {
  requireRebindBaseRecoveryReport(report,env,now);
  check(typeof env.PLANETSCALE_PRODUCTION_BACKUP_ID==='string'&&env.PLANETSCALE_PRODUCTION_BACKUP_ID.length>0
    &&report.backup.id===env.PLANETSCALE_PRODUCTION_BACKUP_ID,'admin_rebind_recovery_backup_changed');
  const input=read0021RestoreEvidenceRecord(report.backup.id,process.cwd());
  return verifyRebindRecoveryCapability({input,assessment:report,
    payload:rebindGrantPayload({committedOnly:env.CI==='true'}),releaseSha:env.RELEASE_SHA,now});
}

export async function runRebindActivation({env=process.env,stage=process.argv[2],fetchImpl=fetch,wait=delay}={}) {
  env=selectRebindConnection(env,{stage}).env;
  requireRebindActivationContext(env);
  check(['preview','execute','disable'].includes(stage),'admin_rebind_activation_stage_invalid');
  const payload=rebindGrantPayload({committedOnly:env.CI==='true'});
  const roles=JSON.parse(env.PSCALE_ROLE_IDENTIFIERS??'{}');
  const manifest=JSON.parse(fs.readFileSync('infrastructure/cloudflare/native-hyperdrive-production.json','utf8'));
  const intent=stage==='disable'?null:rebindActivationConsent(env.ADMIN_SUBJECT_REBIND_ACTIVATION_APPROVAL_JSON,{env,payload,stage});
  let executor;
  try{executor=intent?.record.executor??JSON.parse(env.ADMIN_REBIND_EXECUTOR_BINDING_JSON);}catch{}
  validateRebindExecutor(executor);
  const target=assertRebindExecutorTarget(env.PLANETSCALE_ADMIN_DATABASE_URL,roles,manifest.expectedMainOriginFingerprint,executor);
  const deadline=intent?Date.parse(intent.record.expiresAt):Number(env.ADMIN_REBIND_PREVIEW_EXPIRES_AT)*1000;
  await verifyRebindExecutorProvider(env,executor,{fetchImpl,requiredThrough:Math.max(Date.now()+300000,deadline+300000),
    verifyMetadataVerifier:stage!=='disable'});
  const connect=async()=>{
    const client=rebindSqlClient({...adminDatabaseConnectionConfig(env.PLANETSCALE_ADMIN_DATABASE_URL),connectionTimeoutMillis:10000},pg.Client);
    try{
      await client.connect();
      const session=await client.query('SELECT current_database() AS database_name, current_user AS current_role, session_user AS session_role');
      const row=session.rows[0];
      check(session.rowCount===1&&row.database_name==='postgres'&&row.current_role===row.session_role
        &&[target.role,target.username].includes(row.current_role),'admin_rebind_migration_session_changed');
      return client;
    }catch{try{await client.end();}catch{}throw new Error('admin_rebind_migration_connection_unverified');}
  };
  let result;
  if(stage==='disable'){
    const allowedPolicies=[
      {policySha256:env.ADMIN_REBIND_PREVIEW_POLICY_SHA256,controlRevision:Number(env.ADMIN_REBIND_PREVIEW_CONTROL_REVISION)},
      ...(env.ADMIN_REBIND_EXECUTE_POLICY_SHA256?[{policySha256:env.ADMIN_REBIND_EXECUTE_POLICY_SHA256,
        controlRevision:Number(env.ADMIN_REBIND_EXECUTE_CONTROL_REVISION)}]:[]),
    ];
    check(allowedPolicies.every(value=>hash.test(value.policySha256??'')&&Number.isSafeInteger(value.controlRevision)
      &&value.controlRevision>0),'admin_rebind_cleanup_binding_invalid');
    const expiry=Number(env.ADMIN_REBIND_PREVIEW_EXPIRES_AT);
    check(Number.isSafeInteger(expiry)&&expiry>0&&expiry*1000-Date.now()<=900000,'admin_rebind_cleanup_deadline_invalid');
    while(Date.now()<expiry*1000)await wait(Math.min(30000,expiry*1000-Date.now()));
    result=await withRebindPolicyTransaction({connect,roles,payload,executor,expectedPolicySha256:DISABLED_POLICY_SHA256,
      work:client=>disableRebindPolicy(client,{roles,payload,executor,allowedPolicies,
        previousDisabledRevision:Number(env.ADMIN_REBIND_PREVIOUS_DISABLED_REVISION)})});
  }else{
    const reportPath=env.RECOVERY_READINESS_REPORT_FILE;
    check(typeof reportPath==='string'&&path.isAbsolute(reportPath)&&reportPath.startsWith(`${env.RUNNER_TEMP}${path.sep}`),
      'admin_rebind_recovery_report_path_invalid');
    requireRebindRecoveryReport(JSON.parse(fs.readFileSync(reportPath,'utf8')),env);
    let response,main;
    try{
      response=await fetchImpl(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/branches/main`,{method:'GET',redirect:'error',
        headers:{authorization:`Bearer ${env.GH_TOKEN}`,accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});
      main=await response.json();
    }catch{throw new Error('admin_rebind_current_main_unverified');}
    check(response.ok&&main.protected===true&&main.commit?.sha===env.RELEASE_SHA,'admin_rebind_current_main_changed');
    const verified=await verifyRebindLiveTarget({env,policy:intent.policy,roles,executor,fetchImpl});
    const consent=sealRebindActivationConsent(intent,verified.bindingProof);
    requireRebindRecoveryReport(JSON.parse(fs.readFileSync(reportPath,'utf8')),env);
    if(env.GITHUB_OUTPUT)fs.appendFileSync(env.GITHUB_OUTPUT,`policy_sha256=${consent.policySha256}\nexpires_at=${consent.policy.expiresAt}\ncontrol_revision=${consent.policy.controlRevision}\nprevious_disabled_revision=${consent.record.previousPolicyRevision}\nexecutor_binding=${JSON.stringify(executor)}\n`);
    result=await withRebindPolicyTransaction({connect,roles,payload,executor,expectedPolicySha256:consent.policySha256,
      work:client=>transitionRebindPolicy(client,{consent,roles})});
  }
  return {...result,sourceSha:env.RELEASE_SHA,releaseRunId:env.GITHUB_RUN_ID,stage,
    ownerSignInVerified:false,credentialsCreated:false,accessSelectorsChanged:false};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{console.log(JSON.stringify(await runRebindActivation()));}
  catch(error){
    const code=typeof error?.message==='string'&&/^admin_rebind_[a-z_]+$/.test(error.message)?error.message:'admin_rebind_activation_blocked';
    console.error(JSON.stringify({status:'BLOCKED',code,ownerSignInVerified:false}));process.exitCode=1;
  }
}
