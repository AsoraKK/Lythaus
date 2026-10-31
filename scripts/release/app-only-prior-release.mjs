import { normalizeCapturedWorkers } from './app-only-eligibility.mjs';

const SHA = /^[0-9a-f]{40}$/;
const workerFields = { public: 'publicApi', admin: 'adminApi', jobs: 'jobs', coordinator: 'acceptanceCoordinator' };

/** Compare current authenticated provider observations to a verified prior
 * canonical GO manifest. Authenticating that artifact is the caller's duty. */
export function assertAppOnlyPriorRelease({ manifest, previousSha, workerCapture, appPage, reusedPages } = {}) {
  if (!SHA.test(previousSha ?? '') || !manifest || manifest.schemaVersion !== 'lythaus-release-manifest-v2'
    || manifest.releaseSha !== previousSha || manifest.productionStatus !== 'GO' || manifest.status !== 'GO'
    || manifest.state !== 'VERIFIED' || manifest.repository?.releaseSha !== previousSha) {
    throw new Error('previous canonical release is not a verified GO manifest');
  }
  const workers = normalizeCapturedWorkers(workerCapture);
  for (const [component, field] of Object.entries(workerFields)) {
    const current = workers[component], prior = manifest.surfaces?.workers?.[field];
    if (!prior || prior.name !== current.workerName || prior.versionId !== current.versionId
      || prior.sourceSha !== current.sourceSha || !['ACTIVATED', 'REUSED_PRODUCTION'].includes(prior.status)) {
      throw new Error(`serving ${component} does not match the previous canonical release`);
    }
  }
  for (const [field, current] of [['web', appPage], ['marketing', reusedPages?.marketing], ['admin', reusedPages?.['control-panel']]]) {
    const prior = manifest.surfaces?.[field];
    if (!current || !prior || prior.project !== current.project || prior.branch !== current.branch
      || prior.deploymentId !== current.deploymentId || prior.deploymentUrl !== current.deploymentUrl
      || prior.deployedSha !== current.commitSha || !['ACTIVATED', 'REUSED_PRODUCTION'].includes(prior.status)) {
      throw new Error(`serving ${field} Pages does not match the previous canonical release`);
    }
  }
  return Object.freeze({ previousSha, workers, appPage, reusedPages });
}
