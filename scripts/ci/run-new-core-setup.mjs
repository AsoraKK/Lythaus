import { appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { authorizeSetup } from './new-core-setup-control.mjs';
import { inspectSetupInputs, runIsolatedSetup } from './lythaus-new-core-isolated-setup.mjs';
import {loadPriorStageReceipt,recordStageReceipt} from './new-core-stage-receipt.mjs';
import {readAdminHyperdriveMetrics} from './new-core-admin-read-diagnostic.mjs';
import {isRepairOperation} from './new-core-repair-control.mjs';
import {REPAIR_PINS} from './new-core-isolated-repair-pins.mjs';
import {loadRepairBaseline,loadRepairReceipt,recordRepairBeforeRequest,recordRepairState,requireRecordedRepairIntent} from './new-core-repair-receipt.mjs';

const env = process.env;
// Run-scoped archives are immutable. Recheck current main, reviews and run history on each authorization.
let verifiedBaseline;
const authorize = () => authorizeSetup({env,afterReview:true,loadBaseline:() => verifiedBaseline ??= loadRepairBaseline(env)});
const diagnoseRead = env.REQUESTED_OPERATION === 'diagnose-admin-read';
const inspecting = env.REQUESTED_OPERATION === 'inspect' || diagnoseRead;
const repairing = isRepairOperation(env.REQUESTED_OPERATION);
const sourceDir = resolve(inspecting ? 'worker-source' : 'application-source');
let lineage;

function record(entry) {
  // Only fixed operation labels and provider resource IDs belong in the public summary.
  if (!/^[a-z][a-z_]{1,64}$/.test(entry?.operation ?? '')) throw new Error('setup_journal_invalid');
  const row = { operation: entry.operation };
  for (const key of ['id', 'applicationId', 'policyId', 'workerId', 'intentId', 'parentVersionId', 'versionId', 'deploymentId', 'routeId', 'dnsId', 'certificateId']) {
    if (entry[key] === undefined) continue;
    if (!/^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/.test(entry[key])) {
      throw new Error('setup_journal_id_invalid');
    }
    row[key] = entry[key];
  }
  const line = JSON.stringify(row);
  if (!repairing) recordStageReceipt(lineage,row,env);
  console.log(line);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, '- `' + line + '`\n');
}

try {
  if (repairing && env.REQUESTED_OPERATION !== 'reconcile-isolated-repair') recordRepairBeforeRequest(env,REPAIR_PINS);
  const gate = await authorize();
  const prior = repairing ? gate.repairBaseline.prior : loadPriorStageReceipt(env,gate.priorRunSha);
  lineage = {...prior};
  if (repairing) {
    const pins=REPAIR_PINS;
    const {runIsolatedRepair} = await import('./new-core-isolated-repair.mjs');
    const {createRepairBoundary} = await import('./lythaus-new-core-isolated-setup.mjs');
    const repairReceipt = loadRepairReceipt(env,gate.repairPrior,pins);
    const {api,checkBoundary} = await createRepairBoundary({env,authorize,prior,sourceDir:resolve('worker-source'),record});
    const {loadArtifacts} = await import('./new-core-isolated-worker.mjs');
    const operation = env.REQUESTED_OPERATION;
    const artifacts = operation === 'stage-isolated-repair' ? await loadArtifacts({
      sourceDir:resolve('application-source'),artifactDir:join(env.RUNNER_TEMP,'new-core-artifacts'),pins,
    }) : undefined;
    const result = await runIsolatedRepair({operation,api:requireRecordedRepairIntent(api,env,pins),artifacts,pins,prior,predecessor:gate.repairBaseline.predecessor,repairReceipt,checkBoundary,
      journal:state=>recordRepairState(env,state,pins)});
    console.log(JSON.stringify(result));
    if (!['REPAIR_BASELINE_VERIFIED','REPAIR_STAGED_NONSERVING','REPAIR_ACTIVE_OWNER_TEST_PENDING'].includes(result.status)) process.exitCode = 1;
  } else if (inspecting) {
    if (diagnoseRead && (!gate.privateCredentialConfirmed || prior.activationTarget !== '37f36eb4-911d-4c51-b723-751329cd1b92'
      || prior.ackChild !== prior.activationTarget || prior.deploymentId !== '307f3dcc-41f3-42e2-be4b-ad2a519ec51c'
      || prior.routeId !== 'dab9759ef67e45b7bafa07e25817f7f2')) throw new Error('setup_serving_receipt_changed');
    const result = await inspectSetupInputs({ env, sourceDir, authorize, prior });
    if (diagnoseRead) {
      result.hyperdriveQueryMetrics = await readAdminHyperdriveMetrics(env.CLOUDFLARE_API_TOKEN);
      if (result.recordedWorker?.checkpoint !== 'ACTIVATED_VERIFIED_CHILD'
        || !['observed', 'no_samples'].includes(result.hyperdriveQueryMetrics.status)) result.ready = false;
    }
    console.log(JSON.stringify(result));
    if (!result.ready) process.exitCode = 1;
  } else {
    const result = await runIsolatedSetup({
      env, sourceDir, artifactDir: join(env.RUNNER_TEMP, 'new-core-artifacts'), authorize, record, prior,
      resumeAccess: env.REQUESTED_OPERATION === 'resume-access',
      resumeWorker: env.REQUESTED_OPERATION === 'resume-worker-script-settings',
      singleStage: env.REQUESTED_OPERATION === 'stage-one-nonserving-version',
    });
    console.log(JSON.stringify(result));
    if (result.status === 'ISOLATED_SETUP_BLOCKED') process.exitCode = 1;
  }
} catch (error) {
  // Errors thrown by drivers and providers can contain credentials or private selectors.
  const code = /^(?:setup_[a-z0-9_]{1,135}|[A-Z][A-Z_]{3,90})$/.test(error?.message ?? '')
    ? error.message : 'isolated_setup_stopped';
  console.error(JSON.stringify({ status: 'STOPPED', code }));
  process.exitCode = 1;
}
