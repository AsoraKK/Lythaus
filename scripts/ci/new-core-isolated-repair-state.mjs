import {isDeepStrictEqual} from 'node:util';
import {ROUTED_CHILD_ID, ROUTED_REPAIR_ID, ROUTED_REPAIR_INTENT, requireSetup as check} from './new-core-isolated-cloudflare.mjs';

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

export const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const intent = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const hash = /^[a-f0-9]{64}$/;
export const parentId = '44cd6e04-15d7-467c-9d93-ff59d5d4fe0c';
export const routed = Object.freeze({
  parentIntent:'d340cb66-cb62-4c87-ab64-400a7cf79c01', ackParent:parentId,
  childIntent:'49503582-9aff-4d20-a6f2-888d10d1a92a', childParent:parentId,
  ackChild:ROUTED_CHILD_ID, activationTarget:ROUTED_CHILD_ID, deploymentId:'307f3dcc-41f3-42e2-be4b-ad2a519ec51c',
  dnsId:'f934c861412f949f274856fd0282e328', routeId:'dab9759ef67e45b7bafa07e25817f7f2',
});

export function assertRoutedLineage(prior) {
  check(isDeepStrictEqual(prior,routed),'repair_routed_lineage');
}

export function assertRepairPredecessor(state) {
  check(isDeepStrictEqual(state,priorRepairState),'repair_predecessor_receipt');
}

export function assertRepairPins(pins) {
  check(pins && Object.getPrototypeOf(pins) === Object.prototype &&
    typeof pins.sourceSha === 'string' && /^[a-f0-9]{40}$/.test(pins.sourceSha) &&
    ![originalArtifactPins.sourceSha,priorRepairPins.sourceSha].includes(pins.sourceSha) &&
    [pins.workerSha,pins.assetsSha].every(value => typeof value === 'string' && hash.test(value)) &&
    [pins.workerBytes,pins.assetCount,pins.assetBytes].every(n => Number.isSafeInteger(n) && n > 0) &&
    ![originalArtifactPins.workerSha,priorRepairPins.workerSha].includes(pins.workerSha),
    'repair_artifact_pins');
}

export function validateRepairState(state,pins) {
  assertRepairPins(pins);
  const previousIntents = [routed.parentIntent,routed.childIntent,priorRepairState.intentId,priorRepairState.activationIntent];
  check(state && Object.getPrototypeOf(state) === Object.prototype &&
    Object.keys(state).every(k => ['sourceSha','workerSha','assetsSha','intentId','versionId','stageVerified',
      'activationIntent','deploymentId','activationVerified'].includes(k)) &&
    state.sourceSha === pins.sourceSha && state.workerSha === pins.workerSha && state.assetsSha === pins.assetsSha &&
    typeof state.intentId === 'string' && intent.test(state.intentId) && !previousIntents.includes(state.intentId) &&
    (!Object.hasOwn(state,'versionId') || typeof state.versionId === 'string' && uuid.test(state.versionId) && ![parentId,ROUTED_CHILD_ID,ROUTED_REPAIR_ID].includes(state.versionId)) &&
    (!Object.hasOwn(state,'stageVerified') || state.stageVerified === true && !!state.versionId) &&
    (!Object.hasOwn(state,'activationIntent') || state.stageVerified && typeof state.activationIntent === 'string' && intent.test(state.activationIntent) &&
      state.activationIntent !== state.intentId && !previousIntents.includes(state.activationIntent)) &&
    (!Object.hasOwn(state,'deploymentId') || state.activationIntent && typeof state.deploymentId === 'string' && uuid.test(state.deploymentId) &&
      ![routed.deploymentId,priorRepairState.deploymentId].includes(state.deploymentId)) &&
    (!Object.hasOwn(state,'activationVerified') || state.activationVerified === true && !!state.deploymentId),
    'repair_receipt_invalid');
  return state;
}
