import {randomUUID} from 'node:crypto';
import {RECORDED_WORKER, RECORDED_WORKER_ID, ROUTED_BINDING_ID, ROUTED_CHILD_ID, SCRIPT, requireSetup as check} from './new-core-isolated-cloudflare.mjs';
import {expectedBindings, readLineage, uploadAssets, verifyWorkerVersion, workerVersionCode} from './new-core-isolated-worker.mjs';
import {assertRepairPins, assertRepairPredecessor, assertRoutedLineage, activatedRepairs, bindingRepairState, intent, parentId, routed, uuid, validateRepairState} from './new-core-isolated-repair-state.mjs';
export {assertRepairPins, assertRoutedLineage, validateRepairState} from './new-core-isolated-repair-state.mjs';

export function repairVersionBody({artifacts,pins,audience,issuer,intentId,jwt}) {
  assertRepairPins(pins);
  check(intent.test(intentId),'repair_upload_intent');
  const bindings = expectedBindings(audience,issuer).map(binding => binding.name === 'ACCESS_SUBJECT_HMAC_KEY'
    ? {name:binding.name, type:'inherit', version_id:ROUTED_BINDING_ID} : binding);
  return {annotations:{'workers/tag':pins.sourceSha,'workers/message':`lythaus-isolated ${intentId} ${ROUTED_BINDING_ID}`},
    ...workerVersionCode(artifacts,pins), bindings, compatibility_date:'2026-07-27', compatibility_flags:['nodejs_compat'],
    assets:{jwt,config:{run_worker_first:true,not_found_handling:'single-page-application'}}};
}

function allTraffic(row,id,versionId) {
  return row?.id === id && row.versions?.length === 1 && row.versions[0].version_id === versionId &&
    row.versions[0].percentage === 100;
}

// The original routed child and each protected repair must still appear in the
// provider's newest-first deployment history, in the order they were activated.
function servingDeployment(raw,state,versionId) {
  const rows = Array.isArray(raw) ? raw : raw?.deployments;
  const history = [{versionId:ROUTED_CHILD_ID,deploymentId:routed.deploymentId},...activatedRepairs.map(r => r.state)];
  check(Array.isArray(rows) && [history.length,history.length + 1].includes(rows.length),'repair_deployment_history');
  let lastTimestamp = -Infinity;
  for (const [index,accepted] of history.entries()) {
    const row = rows.at(-index - 1);
    const timestamp = Date.parse(row?.created_on);
    check(allTraffic(row,accepted.deploymentId,accepted.versionId) && timestamp > lastTimestamp &&
      (!accepted.activationIntent || row.annotations?.['workers/message'] === 'lythaus-isolated-repair ' + accepted.activationIntent),
      'repair_deployment_history');
    lastTimestamp = timestamp;
  }
  if (rows.length === history.length) {
    check(!state?.deploymentId,'repair_deployment_ack_mismatch');
    return {id:bindingRepairState.deploymentId,versionId:ROUTED_BINDING_ID};
  }
  const current = rows[0];
  check(state?.activationIntent && state.stageVerified && versionId && state.versionId === versionId &&
    uuid.test(current?.id) && !history.some(accepted => accepted.deploymentId === current.id) &&
    (!state.deploymentId || state.deploymentId === current.id) &&
    current.annotations?.['workers/message'] === 'lythaus-isolated-repair ' + state.activationIntent &&
    Date.parse(current.created_on) > lastTimestamp && allTraffic(current,current.id,versionId),
    'repair_deployment_unrecognized');
  return {id:current.id,versionId};
}

export async function runIsolatedRepair({operation,api,artifacts,pins,prior,predecessor,repairReceipt,checkBoundary,journal}) {
  assertRoutedLineage(prior);
  assertRepairPredecessor(predecessor);
  assertRepairPins(pins);
  const stage = operation === 'stage-isolated-repair', activate = operation === 'activate-isolated-repair';
  check(stage || activate || operation === 'reconcile-isolated-repair','repair_operation_unknown');
  let state = repairReceipt === undefined ? undefined : validateRepairState(repairReceipt,pins);
  check(!(stage && state) && !(activate && !state),'repair_prior_required');
  if (activate) check(state.stageVerified && !state.activationIntent,'repair_separate_activation_required');

  async function persist(fields) {
    state = validateRepairState({...state,...fields},pins);
    await journal({...state});
  }
  async function inspect() {
    const boundary = await checkBoundary();
    const {audience,issuer} = boundary;
    const rows = await api.list(RECORDED_WORKER + '/versions');
    const known = [parentId,ROUTED_CHILD_ID,...activatedRepairs.map(r => r.state.versionId)];
    check(Array.isArray(rows) && [known.length,known.length + 1].includes(rows.length) &&
      rows.every(row => uuid.test(row?.id)) && new Set(rows.map(row => row.id)).size === rows.length &&
      known.every(id => rows.some(row => row.id === id)), 'repair_version_inventory');
    const args = {request:api.request,workerId:RECORDED_WORKER_ID,audience,issuer};
    const original = rows.filter(row => row.id === parentId || row.id === ROUTED_CHILD_ID);
    const {child} = await readLineage({...args,versions:original,...prior});
    let previous = child;
    for (const accepted of activatedRepairs) {
      const version = await verifyWorkerVersion({...args,versionId:accepted.state.versionId,pins:accepted.pins});
      check(version.parentVersionId === previous.versionId && version.intentId === accepted.state.intentId &&
        version.number > previous.number,'repair_predecessor_inheritance');
      previous = version;
    }
    const extra = rows.find(row => !known.includes(row.id));
    check(!extra || !!state,'repair_unexpected_version');
    check(!state?.versionId || extra?.id === state.versionId,'repair_version_ack_mismatch');
    if (extra) {
      const verified = await verifyWorkerVersion({...args,versionId:extra.id,pins});
      check(verified.parentVersionId === ROUTED_BINDING_ID && verified.intentId === state.intentId &&
        verified.number > previous.number,'repair_inheritance_unverified');
    }
    const serving = servingDeployment(await api.request(SCRIPT + '/deployments'),state,extra?.id);
    check(boundary.servingVersionId === serving.versionId &&
      boundary.servingSourceSha === (serving.versionId === ROUTED_BINDING_ID ? predecessor.sourceSha : pins.sourceSha),
      'repair_serving_readbacks_differ');
    return {audience,issuer,versionId:extra?.id,serving};
  }
  function result(status,live) {
    return {status,workerId:RECORDED_WORKER_ID,servingVersionId:live.serving.versionId,
      servingDeploymentId:live.serving.id,...(live.versionId ? {repairVersionId:live.versionId} : {}),bootstrapCalled:false};
  }

  let live = await inspect();
  if (stage) {
    workerVersionCode(artifacts,pins);
    api.selectRecordedWorker();
    api.selectLineage(ROUTED_BINDING_ID);
    const jwt = await uploadAssets(artifacts.assets,api.request,async()=>{});
    live = await inspect();
    const intentId = randomUUID();
    const body = repairVersionBody({artifacts,pins,audience:live.audience,issuer:live.issuer,intentId,jwt});
    await persist({sourceSha:pins.sourceSha,workerSha:pins.workerSha,assetsSha:pins.assetsSha,intentId});
    const response = await api.request(RECORDED_WORKER + '/versions?deploy=false',{method:'POST',body});
    await persist({versionId:response?.id});
    live = await inspect();
    await persist({stageVerified:true});
    return result('REPAIR_STAGED_NONSERVING',live);
  }
  if (activate) {
    check(live.serving.versionId === ROUTED_BINDING_ID && live.versionId === state.versionId,'repair_activation_target');
    api.selectRecordedWorker();
    api.selectLineage(ROUTED_BINDING_ID,state.versionId);
    const activationIntent = randomUUID();
    await persist({activationIntent});
    const response = await api.request(SCRIPT + '/deployments',{method:'POST',body:{strategy:'percentage',
      versions:[{version_id:state.versionId,percentage:100}],annotations:{'workers/message':'lythaus-isolated-repair ' + activationIntent}}});
    await persist({deploymentId:response?.id});
    live = await inspect();
    await persist({activationVerified:true});
    return result('REPAIR_ACTIVE_OWNER_TEST_PENDING',live);
  }
  if (!state) return result('REPAIR_BASELINE_VERIFIED',live);
  if (!live.versionId) {
    await persist({});
    return result('REPAIR_STAGE_UNCONFIRMED',live);
  }
  await persist({versionId:live.versionId,stageVerified:true});
  if (!state.activationIntent) return result('REPAIR_STAGED_NONSERVING',live);
  if (live.serving.versionId === ROUTED_BINDING_ID) return result('REPAIR_ACTIVATION_UNCONFIRMED',live);
  await persist({deploymentId:live.serving.id,activationVerified:true});
  return result('REPAIR_ACTIVE_OWNER_TEST_PENDING',live);
}
