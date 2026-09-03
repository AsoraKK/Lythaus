import { RELEASE_COMPONENTS } from './release-classification.mjs';

export const COMPONENT_DISPOSITIONS = Object.freeze({
  NEW_CANDIDATE: 'NEW_CANDIDATE',
  REUSED_PRODUCTION: 'REUSED_PRODUCTION',
  ACTIVATED: 'ACTIVATED',
});

const componentSet = new Set(RELEASE_COMPONENTS);

function assertComponent(component) {
  if (!componentSet.has(component)) throw new Error(`unknown release component: ${component}`);
}

function normalizeComponents(components, field) {
  if (!Array.isArray(components)) throw new TypeError(`${field} must be an array`);
  const unique = [...new Set(components)];
  unique.forEach(assertComponent);
  return unique.sort();
}

function normalizeKnownGood(value, component) {
  const versionId = value?.versionId;
  const sourceSha = value?.sourceSha;
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof versionId !== 'string' || !/^[A-Za-z0-9._:-]{1,200}$/.test(versionId)) {
    throw new Error(`known-good production version is required for reused component ${component}`);
  }
  if (typeof sourceSha !== 'string' || !/^[0-9a-f]{40}$/i.test(sourceSha)) {
    throw new Error(`known-good production source SHA is invalid for reused component ${component}`);
  }
  return {
    versionId,
    sourceSha: sourceSha.toLowerCase(),
  };
}

export function componentDisposition(changedComponents = []) {
  const changed = normalizeComponents(changedComponents, 'changedComponents');
  const changedSet = new Set(changed);
  return Object.freeze(Object.fromEntries(RELEASE_COMPONENTS.map((component) => [
    component,
    changedSet.has(component) ? COMPONENT_DISPOSITIONS.NEW_CANDIDATE : COMPONENT_DISPOSITIONS.REUSED_PRODUCTION,
  ])));
}

/**
 * Build the immutable candidate/reuse decision before any provider mutation.
 * This is deliberately independent of Cloudflare, GitHub, and certification.
 */
export function createComponentDeploymentPlan({
  releaseSha,
  changedComponents = [],
  reusedComponents,
  knownGoodVersions = {},
} = {}) {
  if (typeof releaseSha !== 'string' || !/^[0-9a-f]{40}$/i.test(releaseSha)) {
    throw new Error('releaseSha must be a full 40-character commit SHA');
  }
  const changed = normalizeComponents(changedComponents, 'changedComponents');
  const changedSet = new Set(changed);
  const reused = reusedComponents === undefined
    ? RELEASE_COMPONENTS.filter((component) => !changedSet.has(component))
    : normalizeComponents(reusedComponents, 'reusedComponents');
  const reusedSet = new Set(reused);
  if (changed.some((component) => reusedSet.has(component)) || RELEASE_COMPONENTS.some((component) => !changedSet.has(component) && !reusedSet.has(component))) {
    throw new Error('changedComponents and reusedComponents must partition release components');
  }

  const components = Object.fromEntries(RELEASE_COMPONENTS.map((component) => {
    if (changedSet.has(component)) {
      return [component, {
        component,
        status: COMPONENT_DISPOSITIONS.NEW_CANDIDATE,
        versionId: null,
        provenance: 'BUILT_FROM_RELEASE_SHA',
        sourceSha: releaseSha,
        activationRequired: true,
        rollbackRequired: true,
      }];
    }
    const knownGood = normalizeKnownGood(knownGoodVersions[component], component);
    return [component, {
      component,
      status: COMPONENT_DISPOSITIONS.REUSED_PRODUCTION,
      versionId: knownGood.versionId,
      provenance: 'REUSED_KNOWN_GOOD_PRODUCTION_VERSION',
      sourceSha: knownGood.sourceSha,
      activationRequired: false,
      rollbackRequired: false,
    }];
  }));

  return Object.freeze({
    schemaVersion: 'lythaus-component-deployment-plan-v1',
    releaseSha,
    changedComponents: Object.freeze(changed),
    reusedComponents: Object.freeze(reused),
    componentDisposition: componentDisposition(changed),
    components: Object.freeze(components),
  });
}

export function changedComponentSet(plan) {
  if (!plan || !Array.isArray(plan.changedComponents)) throw new TypeError('deployment plan is required');
  return new Set(plan.changedComponents);
}

export function rollbackComponents(plan) {
  return RELEASE_COMPONENTS.filter((component) => plan?.components?.[component]?.rollbackRequired === true);
}

export function markActivated(plan, activatedComponents = plan?.changedComponents ?? []) {
  const activated = new Set(normalizeComponents(activatedComponents, 'activatedComponents'));
  const changed = changedComponentSet(plan);
  for (const component of activated) {
    if (!changed.has(component)) throw new Error(`cannot activate unchanged component ${component}`);
  }
  return Object.freeze({
    ...plan,
    components: Object.freeze(Object.fromEntries(RELEASE_COMPONENTS.map((component) => {
      const current = plan.components[component];
      return [component, activated.has(component)
        ? { ...current, status: COMPONENT_DISPOSITIONS.ACTIVATED }
        : current];
    }))),
  });
}
