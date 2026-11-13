import { classifyRelease, RELEASE_CLASSES } from './release-classification.mjs';
import { createComponentDeploymentPlan } from './component-deployment-plan.mjs';

/**
 * Preserve the full deterministic source plan alongside a separate provisional
 * app-only deployment inventory. This is not a canonical release manifest,
 * acceptance result, provider attestation, or authority to deploy.
 */
export function createAppOnlyReleaseInventory({ sourcePlan, knownGoodVersions } = {}) {
  if (!sourcePlan || sourcePlan.schemaVersion !== 'lythaus-release-plan-v1'
    || !/^[0-9a-f]{40}$/.test(sourcePlan.releaseSha ?? '') || !/^[0-9a-f]{40}$/.test(sourcePlan.baseSha ?? '')
    || typeof sourcePlan.rootPackageDependencyChanged !== 'boolean' || sourcePlan.forceAuthCritical !== true
    || !Array.isArray(sourcePlan.changedFiles)) throw new Error('app-only source plan is invalid');
  const classification = classifyRelease({ changedFiles: sourcePlan.changedFiles, baseSha: sourcePlan.baseSha,
    rootPackageDependencyChanged: sourcePlan.rootPackageDependencyChanged, forceAuthCritical: true });
  if (sourcePlan.releaseClass !== RELEASE_CLASSES.AUTH_CRITICAL || classification.releaseClass !== sourcePlan.releaseClass
    || sourcePlan.rulesVersion !== classification.rulesVersion
    || JSON.stringify(classification.changedFiles) !== JSON.stringify(sourcePlan.changedFiles)
    || JSON.stringify(classification.changedComponents) !== JSON.stringify(sourcePlan.changedComponents)
    || JSON.stringify(classification.reusedComponents) !== JSON.stringify(sourcePlan.reusedComponents)
    || !classification.changedComponents.includes('flutter-web')) {
    throw new Error('app-only source plan does not match deterministic classification');
  }
  const deploymentPlan = createComponentDeploymentPlan({ releaseSha: sourcePlan.releaseSha,
    changedComponents: ['flutter-web'], knownGoodVersions });
  return Object.freeze({
    schemaVersion: 'lythaus-app-only-review-inventory-v1',
    status: 'PROVISIONAL_NOT_RELEASE_AUTHORIZATION',
    source: Object.freeze({ releaseSha: sourcePlan.releaseSha, baseSha: sourcePlan.baseSha,
      releaseClass: sourcePlan.releaseClass, changedFiles: classification.changedFiles,
      changedComponents: classification.changedComponents, reusedComponents: classification.reusedComponents,
      rulesVersion: classification.rulesVersion, forceAuthCritical: classification.forceAuthCritical,
      rootPackageDependencyChanged: classification.rootPackageDependencyChanged,
      criticalReasons: classification.criticalReasons, standardReasons: classification.standardReasons }),
    sourceChangesNotDeployed: Object.freeze(classification.changedComponents.filter(component => component !== 'flutter-web')),
    deployment: deploymentPlan,
  });
}
