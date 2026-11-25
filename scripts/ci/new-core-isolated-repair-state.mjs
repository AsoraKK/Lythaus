import {isDeepStrictEqual} from 'node:util';
import {ROUTED_BINDING_ID, ROUTED_BINDING_INTENT, ROUTED_BINDING_SOURCE, ROUTED_PARENT_ID, ROUTED_CHILD_ID, ROUTED_REPAIR_ID, ROUTED_REPAIR_INTENT, requireSetup as check} from './new-core-isolated-cloudflare.mjs';

const sourceSha = '3fbaea846f67fe5ad452d53c456b5355069757ca';
const workerSha = '6a276e4b4ed3883b2c00c8b089149b7b14cfebf3ce3811f0a799ff686e9101b3';
const assetsSha = '5c3969463149d5611e50b73fc030e1ae46e84aa08b27222c3122f9a17a9565c0';
export const originalArtifactPins = Object.freeze({sourceSha, workerSha, assetsSha, workerBytes:649612, assetBytes:392398, assetCount:30});
// Sealed protected application used by the successful stage 45653512950 and activation 45660396889.
export const priorRepairPins = Object.freeze({
  sourceSha:'78747f85d02c69efa8a1b6f86b73b08947cdce0b',
  workerSha:'81409a2b4c022dfec37c1d4ef0f0842cec85e94a8cb646aa3c1677954980266b', workerBytes:653531,
  assetsSha:'f2ff945764193e34e32d781b08efb32d09b7dfe6090ac338c13da5e32e8ed69a', assetCount:30, assetBytes:393797,
});
export const priorRepairState = Object.freeze({
  sourceSha:priorRepairPins.sourceSha, workerSha:priorRepairPins.workerSha, assetsSha:priorRepairPins.assetsSha,
  intentId:ROUTED_REPAIR_INTENT, versionId:ROUTED_REPAIR_ID, stageVerified:true,
  activationIntent:'09d3fcd5-a4fd-477b-86d1-82e3d44769f4', deploymentId:'85526c44-7551-41b0-805f-dd6270f05c2d',
  activationVerified:true,
});

// Protected stage 45690056180 and activation 45691256887.
export const bindingRepairPins = Object.freeze({
  sourceSha:ROUTED_BINDING_SOURCE,
  workerSha:'e568b5cfc238a9b87f3ca87ff3ef1ebfff5efd7415cd2bd469d6089b2104b0bd', workerBytes:655674,
  assetsSha:'f9848f5188fad141385d3653c16adbc57eff69afa7317990ecccad7422284316', assetCount:30, assetBytes:393868,
});
export const bindingRepairState = Object.freeze({
  sourceSha:bindingRepairPins.sourceSha, workerSha:bindingRepairPins.workerSha, assetsSha:bindingRepairPins.assetsSha,
  intentId:ROUTED_BINDING_INTENT, versionId:ROUTED_BINDING_ID, stageVerified:true,
  activationIntent:'d1f74bb7-a728-46fd-9ddb-f3fe941a82c4', deploymentId:'0993b439-654e-4243-9340-a810f727f142',
  activationVerified:true,
});
export const activatedRepairs = Object.freeze([
  Object.freeze({pins:priorRepairPins,state:priorRepairState}),
  Object.freeze({pins:bindingRepairPins,state:bindingRepairState}),
]);

export const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const intent = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const hash = /^[a-f0-9]{64}$/;
export const parentId = ROUTED_PARENT_ID;
export const routed = Object.freeze({
  parentIntent:'d340cb66-cb62-4c87-ab64-400a7cf79c01', ackParent:parentId,
  childIntent:'49503582-9aff-4d20-a6f2-888d10d1a92a', childParent:parentId,
  ackChild:ROUTED_CHILD_ID, activationTarget:ROUTED_CHILD_ID, deploymentId:'307f3dcc-41f3-42e2-be4b-ad2a519ec51c',
  dnsId:'f934c861412f949f274856fd0282e328', routeId:'dab9759ef67e45b7bafa07e25817f7f2',
});

const historicalPins = [originalArtifactPins,...activatedRepairs.map(r => r.pins)];
const historicalVersionIds = new Set([parentId,ROUTED_CHILD_ID,...activatedRepairs.map(r => r.state.versionId)]);
const historicalDeployments = new Set([routed.deploymentId,...activatedRepairs.map(r => r.state.deploymentId)]);
const historicalIntents = new Set([routed.parentIntent,routed.childIntent,
  ...activatedRepairs.flatMap(({state}) => [state.intentId,state.activationIntent])]);

export function assertRoutedLineage(prior) {
  check(isDeepStrictEqual(prior,routed),'repair_routed_lineage');
}

export function assertRepairPredecessor(state) {
  check(isDeepStrictEqual(state,bindingRepairState),'repair_predecessor_receipt');
}

export function assertRepairPins(pins) {
  check(pins && Object.getPrototypeOf(pins) === Object.prototype &&
    typeof pins.sourceSha === 'string' && /^[a-f0-9]{40}$/.test(pins.sourceSha) &&
    !historicalPins.some(old => old.sourceSha === pins.sourceSha) &&
    [pins.workerSha,pins.assetsSha].every(value => typeof value === 'string' && hash.test(value)) &&
    [pins.workerBytes,pins.assetCount,pins.assetBytes].every(n => Number.isSafeInteger(n) && n > 0) &&
    !historicalPins.some(old => old.workerSha === pins.workerSha),
    'repair_artifact_pins');
}

export function validateRepairState(state,pins) {
  assertRepairPins(pins);
  check(state && Object.getPrototypeOf(state) === Object.prototype &&
    Object.keys(state).every(k => ['sourceSha','workerSha','assetsSha','intentId','versionId','stageVerified',
      'activationIntent','deploymentId','activationVerified'].includes(k)) &&
    state.sourceSha === pins.sourceSha && state.workerSha === pins.workerSha && state.assetsSha === pins.assetsSha &&
    typeof state.intentId === 'string' && intent.test(state.intentId) && !historicalIntents.has(state.intentId) &&
    (!Object.hasOwn(state,'versionId') || typeof state.versionId === 'string' && uuid.test(state.versionId) && !historicalVersionIds.has(state.versionId)) &&
    (!Object.hasOwn(state,'stageVerified') || state.stageVerified === true && !!state.versionId) &&
    (!Object.hasOwn(state,'activationIntent') || state.stageVerified && typeof state.activationIntent === 'string' && intent.test(state.activationIntent) &&
      state.activationIntent !== state.intentId && !historicalIntents.has(state.activationIntent)) &&
    (!Object.hasOwn(state,'deploymentId') || state.activationIntent && typeof state.deploymentId === 'string' && uuid.test(state.deploymentId) &&
      !historicalDeployments.has(state.deploymentId)) &&
    (!Object.hasOwn(state,'activationVerified') || state.activationVerified === true && !!state.deploymentId),
    'repair_receipt_invalid');
  return state;
}
