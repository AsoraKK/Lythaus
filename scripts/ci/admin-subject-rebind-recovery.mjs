import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {qualificationRestorePlan,artifactPath} from './planetscale-native-restore-evidence.mjs';

const check=(condition,code)=>{if(!condition)throw new Error(code);};
const sha=value=>createHash('sha256').update(value).digest('hex');
const digest=/^[a-f0-9]{64}$/;

export function verifyRebindRecoverySource({qualificationSha,releaseSha,recordPath,artifactPath:artifact,root=process.cwd()}) {
  check(/^[a-f0-9]{40}$/.test(qualificationSha??'')&&/^[a-f0-9]{40}$/.test(releaseSha??''),
    'admin_rebind_recovery_source_unverified');
  const git=args=>execFileSync('git',args,{cwd:root,stdio:['ignore','pipe','pipe'],encoding:'utf8',timeout:5000,maxBuffer:65536}).trim();
  try {
    check(git(['rev-parse','HEAD'])===releaseSha,'admin_rebind_recovery_source_unverified');
    git(['merge-base','--is-ancestor',qualificationSha,releaseSha]);
    const changed=git(['diff','--name-only',qualificationSha,releaseSha,'--']).split('\n').filter(Boolean);
    check(changed.every(file=>file===recordPath||file===artifact),'admin_rebind_recovery_candidate_changed');
  } catch(error) {
    if(/^admin_rebind_[a-z_]+$/.test(error?.message??''))throw error;
    throw new Error('admin_rebind_recovery_source_unverified');
  }
}

export function verifyRebindRecoveryCapability({input,assessment,payload,releaseSha,root=process.cwd(),now=Date.now(),verifySource=verifyRebindRecoverySource}) {
  check(assessment?.ok===true&&assessment.restoreEvidence?.ok===true
    &&assessment.restoreEvidence.evidenceArtifact?.status==='verified'
    &&assessment.restoreEvidence.independentRecovery?.status==='VERIFIED',
  'admin_rebind_normal_recovery_unverified');
  const record=input?.record,artifact=input?.evidenceArtifact,bytes=artifact?.bytes;
  check(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=1048576&&artifact.path===record?.artifactPath
    &&sha(bytes)===artifact.sha256&&artifact.sha256===record.evidenceSha256
    &&artifact.sha256===assessment.restoreEvidence.evidenceArtifact.sha256,
  'admin_rebind_recovery_artifact_unverified');
  let report;try{report=JSON.parse(bytes.toString('utf8'));}catch{throw new Error('admin_rebind_recovery_artifact_unverified');}
  let plan;try{plan=qualificationRestorePlan(report);}catch{throw new Error('admin_rebind_recovery_qualification_unverified');}
  const stamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(Date.parse(value)).toISOString()===value
    ?Date.parse(value):NaN;
  const started=stamp(report.startedAt),verified=stamp(report.verifiedAt),finished=stamp(report.finishedAt),ready=stamp(report.restoreReadyAt);
  check([started,verified,finished,ready,now].every(Number.isFinite)&&started<=ready&&ready<=verified&&verified<=finished&&finished<=now
    &&now-verified<=86400000&&report.verifiedAt===record.verifiedAt,
  'admin_rebind_recovery_artifact_time_unverified');
  check(report.version===1&&report.mode==='execute'&&report.schemaMode==='post-0021'
    &&report.qualificationOutcome==='PASSED'&&report.status==='TARGET_CHECKS_PASSED_REVIEW_REQUIRED'
    &&Array.isArray(report.blockers)&&report.blockers.length===0
    &&record.selectedBackupId===assessment.backup?.id&&report.backupId===record.selectedBackupId
    &&record.sourceBranch?.id===report.sourceBranchId&&record.sourceBranch?.name==='main'
    &&record.restoredBranch?.id===report.createdTargetId&&report.createdTargetId!==report.sourceBranchId
    &&report.targetName===record.restoredBranch?.name&&plan.backup.id===record.selectedBackupId
    &&record.artifactPath===artifactPath(report.runId)
    &&record.nativeRestoreCleanup?.qualificationRunId===report.runId
    &&record.nativeRestoreCleanup?.qualificationSha===report.sourceMainSha,
  'admin_rebind_recovery_qualification_unverified');
  const source=report.sourceBaseline,target=report.restoredVerification;
  check(source&&target&&digest.test(source.catalogSha256??'')&&source.catalogSha256===target.catalogSha256
    &&source.schemaVersion==='0021_media_quarantine_cleanup.sql'&&target.schemaVersion===source.schemaVersion
    &&[source,target].every(value=>value.rebindCapability?.state==='CATALOG_VERIFIED'
      &&value.rebindCapability.grantSha256===payload.sha256&&value.rebindCapability.disabledStateVerified===true
      &&Number.isSafeInteger(value.relationCount)&&Number.isSafeInteger(value.catalogRelationCount)
      &&value.catalogRelationCount===value.relationCount+1),
  'admin_rebind_postinstall_backup_capability_missing');
  verifySource({qualificationSha:report.sourceMainSha,releaseSha,recordPath:input.recordPath,artifactPath:record.artifactPath,root});
  return {status:'VERIFIED',grantSha256:payload.sha256,qualificationRunId:report.runId,
    qualificationSourceSha:report.sourceMainSha,evidenceSha256:artifact.sha256,disabledCapabilityRestored:true,
    qualifiedAt:report.verifiedAt,
    ownerLoginVerified:false};
}
