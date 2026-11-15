import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import test from 'node:test';
import {verifyRebindRecoveryCapability,verifyRebindRecoverySource} from '../ci/admin-subject-rebind-recovery.mjs';
import {buildRestorePlan,restorePlanSha256} from '../ci/planetscale-native-restore-plan.mjs';
import {rebindGrantPayload} from '../ci/admin-subject-rebind-capability.mjs';

const payload=rebindGrantPayload(),now=Date.parse('2026-11-15T06:00:00.000Z');
const iso=offset=>new Date(now+offset).toISOString();
const qualificationSha='a'.repeat(40),releaseSha='c'.repeat(40),sourceBranchId='vqa2g2xc9wsl';
function fixture(){
  const identity={releaseSha:qualificationSha,sourceBranchId,schemaMode:'post-0021'};
  const pins={backupId:'syntheticbackup',backupCompletedAt:iso(-3600000),
    target:'lythaus-0021-native-restore-check-20261115-01',targetBytes:34359738368};
  const plan=buildRestorePlan(pins,{id:pins.backupId,state:'success',deleted_at:null,protected:true,
    completed_at:pins.backupCompletedAt,expires_at:iso(86400000),pvc_size:pins.targetBytes,uncompressed_size:1024,
    database_branch:{id:sourceBranchId,name:'main',deleted_at:null},restored_branches:[]},identity);
  const catalog={catalogSha256:'b'.repeat(64),schemaVersion:'0021_media_quarantine_cleanup.sql',relationCount:200,catalogRelationCount:201,
    rebindCapability:{state:'CATALOG_VERIFIED',grantSha256:payload.sha256,disabledStateVerified:true}};
  const report={version:1,runId:'123',sourceMainSha:qualificationSha,sourceBranchId,phase:'qualification',mode:'execute',
    schemaMode:'post-0021',status:'TARGET_CHECKS_PASSED_REVIEW_REQUIRED',qualificationOutcome:'PASSED',blockers:[],
    recoveryAcceptance:'NOT_CERTIFIED',independentRecovery:'DEFERRED_BY_OWNER_EXCEPTION',
    backupId:pins.backupId,targetName:pins.target,targetStorageBytes:pins.targetBytes,createdTargetId:'synthetictarget',
    plan,planSha256:restorePlanSha256(plan,identity),startedAt:iso(-600000),restoreReadyAt:iso(-480000),verifiedAt:iso(-300000),finishedAt:iso(-240000),
    sourceBaseline:catalog,restoredVerification:structuredClone(catalog)};
  const record={selectedBackupId:pins.backupId,sourceBranch:{id:sourceBranchId,name:'main'},
    restoredBranch:{id:report.createdTargetId,name:pins.target},verifiedAt:report.verifiedAt,
    nativeRestoreCleanup:{qualificationRunId:report.runId,qualificationSha},
    artifactPath:'docs/evidence/production-cutover/0021-restore-evidence/artifacts/qualification-123.json'};
  const input={record,recordPath:'docs/evidence/production-cutover/0021-restore-evidence/syntheticbackup.json',evidenceArtifact:{path:record.artifactPath}};
  const assessment={ok:true,backup:{id:pins.backupId},restoreEvidence:{ok:true,evidenceArtifact:{status:'verified'},independentRecovery:{status:'VERIFIED'}}};
  const seal=()=>{const bytes=Buffer.from(JSON.stringify(report)),hash=createHash('sha256').update(bytes).digest('hex');
    input.evidenceArtifact.bytes=bytes;input.evidenceArtifact.sha256=hash;record.evidenceSha256=hash;
    assessment.restoreEvidence.evidenceArtifact.sha256=hash;};
  seal();const sources=[];
  const options={input,assessment,payload,releaseSha,now,verifySource:binding=>sources.push(binding)};
  return {report,record,input,assessment,seal,options,sources};
}

test('repair proof requires restored disabled capability while preserving native NOT_CERTIFIED semantics',()=>{
  const f=fixture(),result=verifyRebindRecoveryCapability(f.options);
  assert.equal(result.status,'VERIFIED');assert.equal(result.disabledCapabilityRestored,true);assert.equal(result.ownerLoginVerified,false);
  assert.equal(f.report.recoveryAcceptance,'NOT_CERTIFIED');assert.equal(f.report.independentRecovery,'DEFERRED_BY_OWNER_EXCEPTION');
  assert.equal(f.sources.length,1);assert.equal(f.sources[0].qualificationSha,qualificationSha);assert.equal(f.sources[0].releaseSha,releaseSha);
});

test('hash-valid old, incomplete or mismatched restore reports cannot qualify the repair release',()=>{
  const changes=[f=>delete f.report.sourceBaseline.rebindCapability,f=>f.report.restoredVerification.rebindCapability.disabledStateVerified=false,
    f=>f.report.sourceBaseline.rebindCapability.grantSha256='f'.repeat(64),f=>f.report.restoredVerification.catalogSha256='f'.repeat(64),
    f=>f.report.sourceBaseline.catalogRelationCount=200,f=>f.report.mode='read-only-plan',f=>f.report.qualificationOutcome='FAILED',
    f=>f.report.status='FAILED',f=>f.record.selectedBackupId='different',f=>f.record.restoredBranch.id='different',
    f=>f.record.nativeRestoreCleanup.qualificationRunId='124',f=>f.record.nativeRestoreCleanup.qualificationSha='f'.repeat(40),
    f=>f.report.blockers.push('not_qualified'),f=>f.report.planSha256='f'.repeat(64),f=>f.report.schemaMode='pre-0021'];
  for(const change of changes){const f=fixture();change(f);f.seal();assert.throws(()=>verifyRebindRecoveryCapability(f.options));assert.equal(f.sources.length,0);}
});

test('a newly dated wrapper cannot revive stale or impossible native artifact timestamps',()=>{
  for(const change of [f=>f.record.verifiedAt=iso(-1000),f=>{f.report.verifiedAt=iso(-25*3600000);f.record.verifiedAt=f.report.verifiedAt;},
    f=>f.report.finishedAt=iso(1),f=>f.report.startedAt=iso(-200000),f=>f.report.restoreReadyAt=iso(-100000),
    f=>f.report.verifiedAt='invalid']){
    const f=fixture();change(f);f.seal();assert.throws(()=>verifyRebindRecoveryCapability(f.options),/artifact_time/);
  }
});

test('repair-specific semantics cannot replace normal independent recovery or verified artifact bytes',()=>{
  for(const change of [f=>f.assessment.ok=false,f=>f.assessment.restoreEvidence.independentRecovery.status='DEFERRED_BY_OWNER_EXCEPTION',
    f=>f.assessment.restoreEvidence.evidenceArtifact.status='unavailable',f=>f.input.evidenceArtifact.bytes=Buffer.from('{}'),
    f=>f.input.evidenceArtifact.path='elsewhere',f=>f.input.evidenceArtifact.sha256='f'.repeat(64)]){
    const f=fixture();change(f);assert.throws(()=>verifyRebindRecoveryCapability(f.options));
  }
});

test('candidate ancestry permits exact evidence-only advancement and rejects code drift or missing source',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lythaus-rebind-source-'));
  const git=args=>execFileSync('git',args,{cwd:root,stdio:['ignore','pipe','pipe'],encoding:'utf8'}).trim();
  try{
    git(['init','--quiet','--initial-branch=main']);git(['config','user.name','Synthetic fixture']);git(['config','user.email','fixture@example.test']);
    git(['config','commit.gpgsign','false']);fs.writeFileSync(path.join(root,'implementation.txt'),'synthetic v1');git(['add','.']);git(['commit','--quiet','-m','synthetic source']);
    const source=git(['rev-parse','HEAD']),recordPath='record.json',artifact='artifact.json';
    for(const file of [recordPath,artifact])fs.writeFileSync(path.join(root,file),'synthetic evidence');
    git(['add',recordPath,artifact]);git(['commit','--quiet','-m','synthetic evidence']);const evidence=git(['rev-parse','HEAD']);
    assert.doesNotThrow(()=>verifyRebindRecoverySource({qualificationSha:source,releaseSha:evidence,recordPath,artifactPath:artifact,root}));
    fs.writeFileSync(path.join(root,'implementation.txt'),'synthetic v2');git(['add','implementation.txt']);git(['commit','--quiet','-m','synthetic code change']);
    const changed=git(['rev-parse','HEAD']);
    assert.throws(()=>verifyRebindRecoverySource({qualificationSha:source,releaseSha:changed,recordPath,artifactPath:artifact,root}),/candidate_changed/);
    assert.throws(()=>verifyRebindRecoverySource({qualificationSha:source,releaseSha:evidence,recordPath,artifactPath:artifact,root}),/source_unverified/);
    assert.throws(()=>verifyRebindRecoverySource({qualificationSha:'f'.repeat(40),releaseSha:changed,recordPath,artifactPath:artifact,root}),/source_unverified/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
