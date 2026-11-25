import {randomUUID} from 'node:crypto';
import {RECORDED_WORKER, RECORDED_WORKER_ID, ROUTED_CHILD_ID, ROUTED_REPAIR_ID, SCRIPT, requireSetup as check} from './new-core-isolated-cloudflare.mjs';
import {expectedBindings, readLineage, uploadAssets, verifyWorkerVersion, workerVersionCode} from './new-core-isolated-worker.mjs';
import {assertRepairPins, assertRepairPredecessor, assertRoutedLineage, intent, parentId, priorRepairPins, priorRepairState, routed, uuid, validateRepairState} from './new-core-isolated-repair-state.mjs';
export {assertRepairPins, assertRoutedLineage, validateRepairState} from './new-core-isolated-repair-state.mjs';

export function repairVersionBody({artifacts,pins,audience,issuer,intentId,jwt}) {
  assertRepairPins(pins);
  check(intent.test(intentId),'repair_upload_intent');
  const bindings = expectedBindings(audience,issuer).map(binding => binding.name === 'ACCESS_SUBJECT_HMAC_KEY'
    ? {name:binding.name, type:'inherit', version_id:ROUTED_REPAIR_ID} : binding);
  return {annotations:{'workers/tag':pins.sourceSha,'workers/message':`lythaus-isolated ${intentId} ${ROUTED_REPAIR_ID}`},
    ...workerVersionCode(artifacts,pins), bindings, compatibility_date:'2026-07-27', compatibility_flags:['nodejs_compat'],
    assets:{jwt,config:{run_worker_first:true,not_found_handling:'single-page-application'}}};
}

function allTraffic(row,id,versionId) {
  return row?.id === id && row.versions?.length === 1 && row.versions[0].version_id === versionId &&
    row.versions[0].percentage === 100;
}

// The two earlier activations remain part of the newest-first provider history.
function servingDeployment(raw,state,versionId) {
  const rows = Array.isArray(raw) ? raw : raw?.deployments;
  check(Array.isArray(rows) && [2,3].includes(rows.length) &&
    allTraffic(rows.at(-1),routed.deploymentId,ROUTED_CHILD_ID) &&
    allTraffic(rows.at(-2),priorRepairState.deploymentId,ROUTED_REPAIR_ID) &&
    rows.at(-2).annotations?.['workers/message'] === 'lythaus-isolated-repair ' + priorRepairState.activationIntent &&
    Date.parse(rows.at(-2).created_on) > Date.parse(rows.at(-1).created_on),'repair_deployment_history');
  if (rows.length === 2) {
    check(!state?.deploymentId,'repair_deployment_ack_mismatch');
    return {id:priorRepairState.deploymentId,versionId:ROUTED_REPAIR_ID};
  }
  const current = rows[0];
  check(state?.activationIntent && state.stageVerified && versionId && state.versionId === versionId &&
    uuid.test(current?.id) && ![routed.deploymentId,priorRepairState.deploymentId].includes(current.id) &&
    (!state.deploymentId || state.deploymentId === current.id) &&
    current.annotations?.['workers/message'] === 'lythaus-isolated-repair ' + state.activationIntent &&
    Date.parse(current.created_on) > Date.parse(rows[1].created_on) && allTraffic(current,current.id,versionId),
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
    check(Array.isArray(rows) && [3,4].includes(rows.length) &&
      rows.every(row => uuid.test(row?.id)) && new Set(rows.map(row => row.id)).size === rows.length,
      'repair_version_inventory');
    const historic = rows.filter(row => row.id === parentId || row.id === ROUTED_CHILD_ID);
    check(historic.length === 2 && rows.some(row => row.id === ROUTED_REPAIR_ID),'repair_version_inventory');
    const args = {request:api.request,workerId:RECORDED_WORKER_ID,audience,issuer};
    const {child} = await readLineage({...args,versions:historic,...prior});
    const previous = await verifyWorkerVersion({...args,versionId:ROUTED_REPAIR_ID,pins:priorRepairPins});
    check(previous.parentVersionId === ROUTED_CHILD_ID && previous.intentId === predecessor.intentId &&
      previous.number > child.number,'repair_predecessor_inheritance');
    const extra = rows.find(row => row.id !== ROUTED_REPAIR_ID && !historic.includes(row));
    check(!extra || !!state,'repair_unexpected_version');
    check(!state?.versionId || extra?.id === state.versionId,'repair_version_ack_mismatch');
    if (extra) {
      const verified = await verifyWorkerVersion({...args,versionId:extra.id,pins});
      check(verified.parentVersionId === ROUTED_REPAIR_ID && verified.intentId === state.intentId &&
        verified.number > previous.number,'repair_inheritance_unverified');
    }
    const serving = servingDeployment(await api.request(SCRIPT + '/deployments'),state,extra?.id);
    check(boundary.servingVersionId === serving.versionId &&
      boundary.servingSourceSha === (serving.versionId === ROUTED_REPAIR_ID ? priorRepairPins.sourceSha : pins.sourceSha),
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
    api.selectLineage(ROUTED_REPAIR_ID);
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
    check(live.serving.versionId === ROUTED_REPAIR_ID && live.versionId === state.versionId,'repair_activation_target');
    api.selectRecordedWorker();
    api.selectLineage(ROUTED_REPAIR_ID,state.versionId);
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
  if (live.serving.versionId === ROUTED_REPAIR_ID) return result('REPAIR_ACTIVATION_UNCONFIRMED',live);
  await persist({deploymentId:live.serving.id,activationVerified:true});
  return result('REPAIR_ACTIVE_OWNER_TEST_PENDING',live);
}
