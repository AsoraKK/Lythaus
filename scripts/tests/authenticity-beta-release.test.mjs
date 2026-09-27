import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { estimateBetaSmoke, validateBetaRelease, hashReceipt, withBetaConfiguration, memoryFits, incrementalCharge, feasibleCaseCapacity, measuredCaseAdmission } from '../authenticity/beta-release-policy.mjs';

const meterNames=['r2ClassA','r2ClassB','r2GbMonth','doRequests','doGbSeconds','doRowsRead','doRowsWritten','doGbMonth','workerRequests','workerCpuMs','queueOperations','logEvents','kvReads','kvWrites','kvGbMonth'];
const caseEnvelope={schemaVersion:'lythaus-beta-case-envelope-v1',measurementReceiptSha256:'6'.repeat(64),observedWholeCaseSeconds:5,activeSeconds:1800,units:Object.fromEntries(meterNames.map(name=>[name,1])),safetyUpperBoundUsd:0,imageRegistryUpperBoundUsd:0,databaseUpperBoundUsd:0};

test('rounded billing is an account-period delta, while proportional services stay proportional',()=>{
  assert.equal(incrementalCharge(10,1e6,12.5,{used:400001,included:400000}),0);
  assert.equal(incrementalCharge(10,1e6,12.5,{used:1399999,included:400000}),12.5);
  assert.equal(incrementalCharge(10,1e6,12.5,undefined),12.5);
  assert.equal(incrementalCharge(500000,1e6,0.3,{used:10000000,included:10000000},false),0.15);
  assert.equal(incrementalCharge(100,1e6,0.4,{used:0,included:1000},false),0);
  assert.throws(()=>incrementalCharge(10,1e6,12.5,{used:null,included:0}));
  assert.equal(feasibleCaseCapacity(0.5,0,0),3);
  assert.equal(feasibleCaseCapacity(0.1,1.5,0),1);
  assert.equal(feasibleCaseCapacity(0.1,0,7.99),0);
});

test('case admission requires separate measurements and never treats the smoke allowance as a case price',()=>{
  const [receipt]=fixture({caseEnvelope});
  assert.equal(measuredCaseAdmission(receipt).caseReservationUsd,0.06);
  assert.equal(measuredCaseAdmission(receipt).feasibleCases,26);
  assert.throws(()=>measuredCaseAdmission({...receipt,caseEnvelope:null}));
  assert.throws(()=>measuredCaseAdmission({...receipt,caseEnvelope:{...caseEnvelope,activeSeconds:5}}));
  assert.throws(()=>measuredCaseAdmission({...receipt,verifiedRemainingUnits:{}}));
});

test('whole-container peak must be strictly below 75 percent without rounding', () => {
  const capacity = 4 * 2 ** 30;
  const boundary = capacity * 3 / 4;
  assert.equal(memoryFits(boundary - 1, capacity), true);
  assert.equal(memoryFits(boundary, capacity), false);
  assert.equal(memoryFits(boundary + 1, capacity), false);
  assert.equal(memoryFits(Math.floor(capacity / 1.3), capacity), false);
  assert.equal(memoryFits(2, 3), true);
  assert.equal(memoryFits(3, 4), false);
  assert.throws(() => memoryFits(1.5, capacity));
  assert.throws(() => memoryFits(null, capacity));
});

const now = Date.parse('2026-09-27T12:00:00Z');
function fixture(overrides = {}) {
  const receipt = { schemaVersion: 'lythaus-beta-release-approval-v1', sourceSha: 'a'.repeat(40), phase: 'DISABLED_DEPLOYMENT', decisionOwner: 'explicit protocol fixture', expiresAt: new Date(now + 3600000).toISOString(), checkpointSha256: 'b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e', preprocessingHash: 'b'.repeat(64), rightsEvidenceSha256: 'c'.repeat(64), runtimeEvidenceSha256: 'd'.repeat(64), budgetEvidenceSha256: 'e'.repeat(64), resourceApprovalSha256: 'f'.repeat(64), restrictedBetaHostingAuthorized: true, publicEnforcementApproved: false, authorAdminOnly: true, image: `registry.cloudflare.com/${'1'.repeat(32)}/lythaus-safe-beta@sha256:${'2'.repeat(64)}`, peakMemoryBytes: 1.5 * 2 ** 30, memoryMeasurementScope: 'WHOLE_CONTAINER_POST_RESPONSE', imageBytes: 2e9, measuredMaxPixels: 16777216, realParityPassed: true, realParityCases: 8, realSafeAttempts: 8, instanceType: 'standard-1', sharedExperimentCommittedUsd: 0, betaCommittedUsd: 0, allowanceEvidenceSha256: '3'.repeat(64), allowanceObservedAt: new Date(now).toISOString(), verifiedRemainingUnits: Object.fromEntries(['r2ClassA','r2ClassB','r2GbMonth','doRequests','doGbSeconds','doRowsRead','doRowsWritten','doGbMonth','workerRequests','workerCpuMs','queueOperations','logEvents','kvReads','kvWrites','kvGbMonth'].map(key => [key, 1e7])), safetyUpperBoundUsd: 0, imageRegistryUpperBoundUsd: 0, databaseUpperBoundUsd: 0, caseEnvelope, ...overrides };
  const rawReceipt = JSON.stringify(receipt);
  return [receipt, { sourceSha: 'a'.repeat(40), approvedReceiptHash: hashReceipt(rawReceipt), rawReceipt, preprocessingHash: 'b'.repeat(64), now }];
}
test('unknown allowances include rounded R2 and DO charges rather than assuming unused free tiers', () => {
  const estimate = estimateBetaSmoke('standard-1');
  assert.equal(estimate.services.r2ClassA, 4.5);
  assert.equal(estimate.services.doGbSeconds, 12.5);
  assert.ok(estimate.reservationUsd > 10);
  assert.equal(estimate.safetyUsd, null);
});
test('disabled runtime materialization requires exact owner-approved source, rights, size and current cost evidence', () => {
  assert.equal(validateBetaRelease(...fixture()).enabled, false);
  for (const change of [{phase:'ACTIVATE'},{realParityPassed:false},{restrictedBetaHostingAuthorized:false},{instanceType:'lite'},{publicEnforcementApproved:true},{verifiedRemainingUnits:{}},{allowanceObservedAt:'2026-09-26T00:00:00Z'},{preprocessingHash:'0'.repeat(64)},{sourceSha:'9'.repeat(40)}]) assert.throws(() => validateBetaRelease(...fixture(change)));
  const [receipt, context] = fixture(); context.approvedReceiptHash = '0'.repeat(64); assert.throws(() => validateBetaRelease(receipt, context));
});
test('activation requires bounded owners, prior disabled evidence and rollback while preserving source classification', () => {
  const activation = {phase:'RESTRICTED_ACTIVATION',disabledDeploymentReceiptSha256:'4'.repeat(64),rollbackPlanSha256:'5'.repeat(64),allowlist:['01990000-0000-7000-8000-000000000001'],sourceHistoryHashes:[]};
  const approved=validateBetaRelease(...fixture(activation));
  assert.equal(approved.enabled,true);
  for (const change of [{allowlist:[]},{allowlist:['*']},{sourceHistoryHashes:['unknown']},{disabledDeploymentReceiptSha256:null},{rollbackPlanSha256:null},{expiresAt:new Date(now).toISOString()},{realSafeAttempts:-1}]) assert.throws(()=>validateBetaRelease(...fixture({...activation,...change})));
  const original={releaseClass:'STANDARD_RELEASE',changedFiles:[],changedComponents:[],reusedComponents:['public','admin','jobs','marketing'],criticalReasons:[]};
  const plan=withBetaConfiguration(original,approved);
  assert.deepEqual(plan.changedComponents,['admin','jobs','public']);
  assert.equal(plan.releaseClass,'AUTH_CRITICAL_RELEASE');
  assert.deepEqual(plan.changedFiles,[]);
  assert.deepEqual(plan.reusedComponents,['marketing']);
  assert.equal(original.releaseClass,'STANDARD_RELEASE');
});
test('protected configuration command rejects stale Workers before dispatch and records ambiguous sends for rollback', () => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'lythaus-beta-release-'));
  try {
    const [receipt]=fixture({phase:'RESTRICTED_ACTIVATION',disabledDeploymentReceiptSha256:'4'.repeat(64),rollbackPlanSha256:'5'.repeat(64),allowlist:['01990000-0000-7000-8000-000000000001'],sourceHistoryHashes:[],expiresAt:new Date(Date.now()+3600000).toISOString(),allowanceObservedAt:new Date().toISOString(),preprocessingHash:hashReceipt(fs.readFileSync('apps/lythaus-authenticity-runtime/container/safe_process.py','utf8').replace(/\r\n/g,'\n'))});
    const rawReceipt=JSON.stringify(receipt);
    const marker=path.join(directory,'sent');
    const environment=path.join(directory,'github.env');
    const mock=`import fs from 'node:fs';globalThis.fetch=async(url,options)=>{if(options.method!=='PUT'||!url.startsWith('https://api.cloudflare.com/client/v4/accounts/'))throw Error('unexpected_request');const config=JSON.parse(options.body);if(!config.enabled||config.allowlist.length!==1||config.caseReservationUsd!==0.06)throw Error('invalid_config');fs.writeFileSync(${JSON.stringify(marker)},'sent');return new Response(JSON.stringify({success:process.env.TEST_PROVIDER_SUCCESS==='true'}),{status:process.env.TEST_PROVIDER_SUCCESS==='true'?200:500});};`;
    const env={...process.env,GITHUB_ACTIONS:'true',GITHUB_ENV:environment,CLOUDFLARE_ACCOUNT_ID:'1'.repeat(32),CLOUDFLARE_API_TOKEN:'explicit-protocol-fixture',RELEASE_SHA:receipt.sourceSha,AUTHENTICITY_BETA_RELEASE_RECEIPT:rawReceipt,AUTHENTICITY_BETA_RELEASE_RECEIPT_SHA256:hashReceipt(rawReceipt),TEST_PROVIDER_SUCCESS:'true'};
    for(const prefix of ['PUBLIC','ADMIN','JOBS']) {env[`${prefix}_WORKER_SOURCE_SHA`]=receipt.sourceSha;env[`${prefix}_WORKER_STATUS`]='ACTIVATED';}
    const invoke=extra=>spawnSync(process.execPath,['--import',`data:text/javascript,${encodeURIComponent(mock)}`,'scripts/ci/configure-authenticity-beta-runtime.mjs','activate'],{env:{...env,...extra},encoding:'utf8'});
    const stale=invoke({JOBS_WORKER_SOURCE_SHA:'9'.repeat(40)});
    assert.notEqual(stale.status,0);assert.equal(fs.existsSync(marker),false);
    const ambiguous=invoke({TEST_PROVIDER_SUCCESS:'false'});
    assert.notEqual(ambiguous.status,0);assert.match(fs.readFileSync(environment,'utf8'),/ACTIVATION_ATTEMPTED=true/);assert.equal(fs.readFileSync(marker,'utf8'),'sent');
    const success=invoke({});assert.equal(success.status,0,success.stderr);assert.equal(JSON.parse(success.stdout).liveAppAcceptance,false);
    assert.equal(success.stdout.includes('explicit-protocol-fixture'),false);assert.equal(success.stdout.includes(receipt.allowlist[0]),false);
  } finally { fs.rmSync(directory,{recursive:true,force:true}); }
});
