import {isDeepStrictEqual} from 'node:util';
import {ROUTED_CHILD_ID, requireSetup as check} from './new-core-isolated-cloudflare.mjs';

const sourceSha = '3fbaea846f67fe5ad452d53c456b5355069757ca';
const workerSha = '6a276e4b4ed3883b2c00c8b089149b7b14cfebf3ce3811f0a799ff686e9101b3';
const assetsSha = '5c3969463149d5611e50b73fc030e1ae46e84aa08b27222c3122f9a17a9565c0';
export const originalArtifactPins = Object.freeze({sourceSha, workerSha, assetsSha, workerBytes:649612, assetBytes:392398, assetCount:30});

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

export function assertRepairPins(pins) {
  check(pins && Object.getPrototypeOf(pins) === Object.prototype &&
    typeof pins.sourceSha === 'string' && /^[a-f0-9]{40}$/.test(pins.sourceSha) && pins.sourceSha !== originalArtifactPins.sourceSha &&
    [pins.workerSha,pins.assetsSha].every(value => typeof value === 'string' && hash.test(value)) &&
    [pins.workerBytes,pins.assetCount,pins.assetBytes].every(n => Number.isSafeInteger(n) && n > 0) &&
    (pins.workerSha !== originalArtifactPins.workerSha || pins.assetsSha !== originalArtifactPins.assetsSha),
    'repair_artifact_pins');
}

export function validateRepairState(state,pins) {
  assertRepairPins(pins);
  check(state && Object.getPrototypeOf(state) === Object.prototype &&
    Object.keys(state).every(k => ['sourceSha','workerSha','assetsSha','intentId','versionId','stageVerified',
      'activationIntent','deploymentId','activationVerified'].includes(k)) &&
    state.sourceSha === pins.sourceSha && state.workerSha === pins.workerSha && state.assetsSha === pins.assetsSha &&
    typeof state.intentId === 'string' && intent.test(state.intentId) && ![routed.parentIntent,routed.childIntent].includes(state.intentId) &&
    (!Object.hasOwn(state,'versionId') || typeof state.versionId === 'string' && uuid.test(state.versionId) && ![parentId,ROUTED_CHILD_ID].includes(state.versionId)) &&
    (!Object.hasOwn(state,'stageVerified') || state.stageVerified === true && !!state.versionId) &&
    (!Object.hasOwn(state,'activationIntent') || state.stageVerified && typeof state.activationIntent === 'string' && intent.test(state.activationIntent) &&
      ![state.intentId,routed.parentIntent,routed.childIntent].includes(state.activationIntent)) &&
    (!Object.hasOwn(state,'deploymentId') || state.activationIntent && typeof state.deploymentId === 'string' && uuid.test(state.deploymentId) && state.deploymentId !== routed.deploymentId) &&
    (!Object.hasOwn(state,'activationVerified') || state.activationVerified === true && !!state.deploymentId),
    'repair_receipt_invalid');
  return state;
}
