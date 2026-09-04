import fs from 'node:fs';
import path from 'node:path';

import { loadApprovedMigrations } from './planetscale-migration-manifest.mjs';
import { RELEASE_STATES, transitionReleaseState } from './transition-release-state.mjs';
import { COMPONENT_DISPOSITIONS } from '../release/component-deployment-plan.mjs';
import { classifyRelease, RELEASE_CLASSES, RELEASE_COMPONENTS } from '../release/release-classification.mjs';
import { FAILURE_DOMAINS } from '../release/failure-domains.mjs';

const root = process.cwd();
const outputIndex = process.argv.indexOf('--output');
if (outputIndex !== -1 && !process.argv[outputIndex + 1]) throw new Error('--output requires a file path');
const outputPath = outputIndex === -1
  ? path.join(root, '.artifacts', 'release', 'release-manifest.json')
  : path.resolve(root, process.argv[outputIndex + 1]);
const releaseSha = process.env.RELEASE_SHA ?? process.env.GITHUB_SHA ?? '';
const allowWorktreeMigrationsForTest = process.env.LYTHAUS_TEST_ALLOW_WORKTREE_MIGRATIONS === 'true';
if (allowWorktreeMigrationsForTest && process.env.CI === 'true') throw new Error('LYTHAUS_TEST_ALLOW_WORKTREE_MIGRATIONS is forbidden in CI');
if (!/^[0-9a-f]{40}$/i.test(releaseSha)) throw new Error('RELEASE_SHA must be a full 40-character commit SHA');

const valueOrNull = (name) => process.env[name] || null;
const shaOrNull = (name) => {
  const value = valueOrNull(name);
  if (value !== null && !/^[0-9a-f]{40}$/i.test(value)) throw new Error(`${name} must be a full 40-character commit SHA when provided`);
  return value;
};
const fingerprintOrNull = (name) => {
  const value = valueOrNull(name);
  if (value !== null && !/^[0-9a-f]{64}$/i.test(value)) throw new Error(`${name} must be a 64-character SHA-256 fingerprint when provided`);
  return value;
};
const deploymentIdOrNull = (name) => {
  const value = valueOrNull(name);
  if (value !== null && !/^[A-Za-z0-9._:-]{6,200}$/.test(value)) throw new Error(`${name} must be a sanitized deployment identifier when provided`);
  return value;
};
const versionIdOrNull = (name) => {
  const value = valueOrNull(name);
  if (value !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error(`${name} must be a Worker version UUID when provided`);
  return value;
};
const uuidOrNull = (name) => versionIdOrNull(name);
const timestampOrNull = (name) => {
  const value = valueOrNull(name);
  if (value !== null && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value)))) {
    throw new Error(`${name} must be an ISO-8601 UTC timestamp when provided`);
  }
  return value;
};
const urlOrNull = (name) => {
  const value = valueOrNull(name);
  if (value !== null) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error(`${name} must be an HTTPS URL without credentials or fragments`);
  }
  return value;
};
const relationCountOrNull = (name) => {
  const value = valueOrNull(name);
  if (value !== null && !/^\d+$/.test(value)) throw new Error(`${name} must be a non-negative integer when provided`);
  return value === null ? null : Number.parseInt(value, 10);
};
const integerOrNull = (name) => {
  const value = valueOrNull(name);
  if (value !== null && !/^\d+$/.test(value)) throw new Error(`${name} must be a non-negative integer when provided`);
  return value === null ? null : Number.parseInt(value, 10);
};
const statusOrUnknown = (name) => process.env[name] || 'UNKNOWN/BLOCKED';
const legacyCountOrNull = (name) => {
  const value = valueOrNull(name);
  if (value !== null && !/^\d+$/.test(value)) throw new Error(`${name} must be a non-negative integer when provided`);
  return value === null ? null : Number.parseInt(value, 10);
};
const passOrBlocked = (name) => process.env[name] === 'true' ? 'PASS' : 'BLOCKED';
const booleanValue = (name) => process.env[name] === 'true';

function parseJson(name, fallback) {
  const value = valueOrNull(name);
  if (value === null) return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${name} must contain valid JSON: ${error.message}`);
  }
}

function componentList(name, fallback) {
  const parsed = parseJson(name, fallback);
  if (!Array.isArray(parsed) || parsed.some((component) => !RELEASE_COMPONENTS.includes(component))) throw new Error(`${name} must be an array of known release components`);
  return [...new Set(parsed)].sort();
}

function changedFileList(name) {
  const parsed = parseJson(name, null);
  if (parsed === null) return null;
  if (!Array.isArray(parsed) || parsed.some((file) => typeof file !== 'string' || file.length === 0)) {
    throw new Error(`${name} must be an array of non-empty file paths`);
  }
  return [...new Set(parsed)].sort();
}

const previousProductionSha = valueOrNull('PREVIOUS_PRODUCTION_SHA') ?? 'NONE';
if (previousProductionSha !== 'NONE' && !/^[0-9a-f]{40}$/i.test(previousProductionSha)) throw new Error('PREVIOUS_PRODUCTION_SHA must be a full 40-character SHA or NONE');
const releaseClass = valueOrNull('RELEASE_CLASS') ?? RELEASE_CLASSES.AUTH_CRITICAL;
if (!Object.values(RELEASE_CLASSES).includes(releaseClass)) throw new Error(`RELEASE_CLASS must be ${Object.values(RELEASE_CLASSES).join(' or ')}`);

const changedComponents = componentList('CHANGED_COMPONENTS_JSON', RELEASE_COMPONENTS);
const changedSet = new Set(changedComponents);
const reusedComponents = componentList('REUSED_COMPONENTS_JSON', RELEASE_COMPONENTS.filter((component) => !changedSet.has(component)));
const reusedSet = new Set(reusedComponents);
if (changedComponents.some((component) => reusedSet.has(component)) || RELEASE_COMPONENTS.some((component) => !changedSet.has(component) && !reusedSet.has(component))) {
  throw new Error('changed and reused component lists must partition all release components');
}

const registry = JSON.parse(fs.readFileSync(path.join(root, 'infrastructure', 'lythaus-resource-registry.json'), 'utf8'));
const hyperdrive = JSON.parse(fs.readFileSync(path.join(root, 'infrastructure', 'cloudflare', 'native-hyperdrive-production.json'), 'utf8'));
const migration = loadApprovedMigrations({ root, committedOnly: !allowWorktreeMigrationsForTest });

const pageComponentConfig = {
  marketing: { prefix: 'MARKETING', project: valueOrNull('MARKETING_PAGES_PROJECT') ?? 'lythaus-marketing', domains: ['lythaus.co', 'www.lythaus.co'] },
  'flutter-web': { prefix: 'WEB', project: valueOrNull('WEB_PAGES_PROJECT') ?? 'lythaus-web', domains: [] },
  'control-panel': { prefix: 'ADMIN', project: valueOrNull('LYTHAUS_ADMIN_PAGES_PROJECT'), domains: ['admin.lythaus.co'] },
};
const reusedPagesState = parseJson('REUSED_PAGES_STATE_JSON', {});
const validSha = (value) => typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value) ? value : null;
const validDeploymentId = (value) => typeof value === 'string' && /^[A-Za-z0-9._:-]{6,200}$/.test(value) ? value : null;
const validHttpsUrl = (value) => {
  if (typeof value !== 'string' || value.length === 0) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash ? value : null;
  } catch {
    return null;
  }
};

const pages = Object.fromEntries(Object.entries(pageComponentConfig).map(([component, config]) => {
  const prefix = config.prefix;
  const changed = changedSet.has(component);
  const reused = reusedPagesState[component] ?? {};
  const deployedSha = shaOrNull(`${prefix}_DEPLOYMENT_SHA`) ?? (changed ? null : validSha(reused.commitSha));
  const deploymentId = deploymentIdOrNull(`${prefix}_DEPLOYMENT_ID`) ?? (changed ? null : validDeploymentId(reused.deploymentId));
  const status = changed
    ? (process.env[`${prefix}_DEPLOYMENT_STATUS`] === COMPONENT_DISPOSITIONS.ACTIVATED ? COMPONENT_DISPOSITIONS.ACTIVATED : COMPONENT_DISPOSITIONS.NEW_CANDIDATE)
    : COMPONENT_DISPOSITIONS.REUSED_PRODUCTION;
  return [component, {
    component,
    project: config.project ?? (changed ? null : reused.project ?? null),
    branch: valueOrNull(`${prefix}_PAGES_BRANCH`) ?? (changed ? null : reused.branch ?? null),
    deploymentId,
    deploymentUrl: urlOrNull(`${prefix}_DEPLOYMENT_URL`) ?? (changed ? null : validHttpsUrl(reused.deploymentUrl)),
    domains: config.domains,
    deployedSha,
    status,
    provenance: changed ? 'BUILT_FROM_RELEASE_SHA' : 'REUSED_KNOWN_GOOD_PRODUCTION_VERSION',
    versionId: deploymentId,
  }];
}));

const workerConfig = {
  public: { env: 'PUBLIC_API', name: 'lythaus-public-api-development' },
  admin: { env: 'ADMIN_API', name: 'lythaus-admin-api-development' },
  jobs: { env: 'JOBS', name: 'lythaus-jobs-development' },
  coordinator: { env: 'COORDINATOR', name: 'lythaus-auth-acceptance-coordinator-development' },
};
const workers = Object.fromEntries(Object.entries(workerConfig).map(([component, config]) => {
  const changed = changedSet.has(component);
  const versionId = versionIdOrNull(`${config.env}_WORKER_VERSION`) ?? versionIdOrNull(`${config.env}_API_WORKER_VERSION`);
  const sourceSha = shaOrNull(`${config.env}_WORKER_SOURCE_SHA`) ?? shaOrNull('WORKER_SOURCE_SHA');
  const status = changed
    ? (process.env[`${config.env}_WORKER_STATUS`] === COMPONENT_DISPOSITIONS.ACTIVATED ? COMPONENT_DISPOSITIONS.ACTIVATED : COMPONENT_DISPOSITIONS.NEW_CANDIDATE)
    : COMPONENT_DISPOSITIONS.REUSED_PRODUCTION;
  const provenance = valueOrNull(`${config.env}_WORKER_PROVENANCE`)
    ?? (changed ? 'BUILT_FROM_RELEASE_SHA' : 'REUSED_KNOWN_GOOD_PRODUCTION_VERSION');
  return [component, {
    component,
    name: config.name,
    versionId,
    sourceSha,
    status,
    provenance,
    versionIdStatus: status,
  }];
}));

const surfaces = {
  marketing: pages.marketing,
  web: pages['flutter-web'],
  admin: pages['control-panel'],
  workers: {
    publicApi: workers.public,
    adminApi: workers.admin,
    jobs: workers.jobs,
    acceptanceCoordinator: workers.coordinator,
  },
};

const cloudflareStatus = statusOrUnknown('CLOUDFLARE_INVENTORY_STATUS');
const planetscaleStatus = statusOrUnknown('PLANETSCALE_INVENTORY_STATUS');
const legacyAsoraActiveResources = legacyCountOrNull('CLOUDFLARE_LEGACY_ASORA_ACTIVE_RESOURCES');
const productionSmoke = {
  'lythaus.co': statusOrUnknown('PRODUCTION_SMOKE_MARKETING'),
  'www.lythaus.co': statusOrUnknown('PRODUCTION_SMOKE_WWW'),
  'admin.lythaus.co': statusOrUnknown('PRODUCTION_SMOKE_ADMIN_UI'),
  flutterWeb: statusOrUnknown('PRODUCTION_SMOKE_FLUTTER_WEB'),
  publicApi: statusOrUnknown('PRODUCTION_SMOKE_PUBLIC_API'),
  adminApi: statusOrUnknown('PRODUCTION_SMOKE_ADMIN_API'),
  jobs: statusOrUnknown('PRODUCTION_SMOKE_JOBS'),
};
const releaseGovernanceCompensatingControls = process.env.RELEASE_GOVERNANCE_COMPENSATING_CONTROLS === 'VERIFIED';
const security = {
  codeql: passOrBlocked('SECURITY_CHECKS_VERIFIED'),
  dependencyReview: passOrBlocked('SECURITY_CHECKS_VERIFIED'),
  secretScan: passOrBlocked('SECURITY_CHECKS_VERIFIED'),
  actionPinning: passOrBlocked('SECURITY_CHECKS_VERIFIED'),
};
const authAcceptanceRequired = releaseClass === RELEASE_CLASSES.AUTH_CRITICAL;
const authenticatedAcceptanceProven = booleanValue('AUTHENTICATED_ACCEPTANCE_PROVEN');
const authAcceptanceStatus = authAcceptanceRequired
  ? (valueOrNull('AUTH_ACCEPTANCE_STATUS') ?? valueOrNull('AUTHENTICATED_ACCEPTANCE_STATUS') ?? (authenticatedAcceptanceProven ? 'PASSED' : 'BLOCKED'))
  : 'NOT_REQUIRED';
const acceptanceRunId = authAcceptanceRequired ? uuidOrNull('AUTH_ACCEPTANCE_RUN_ID') : null;
const acceptanceExpiresAt = authAcceptanceRequired ? timestampOrNull('AUTH_ACCEPTANCE_EXPIRES_AT') : null;
const acceptanceDependencies = parseJson('AUTH_ACCEPTANCE_DEPENDENCIES_JSON', null);
const acceptanceDependencyExpectedStatus = (component) => changedSet.has(component)
  ? COMPONENT_DISPOSITIONS.NEW_CANDIDATE
  : COMPONENT_DISPOSITIONS.REUSED_PRODUCTION;
const defaultAcceptanceDependencies = Object.fromEntries(['public', 'admin', 'jobs', 'coordinator'].map((component) => [component, {
  workerName: workerConfig[component].name,
  versionId: workers[component].versionId,
  sourceSha: workers[component].sourceSha,
  status: acceptanceDependencyExpectedStatus(component),
  provenance: workers[component].provenance,
}]));

const acceptanceDependencyComponents = ['public', 'admin', 'jobs', 'coordinator'];
const acceptanceDependenciesPresent = acceptanceDependencies !== null;
const acceptanceDependenciesValid = (() => {
  const dependencies = acceptanceDependencies ?? defaultAcceptanceDependencies;
  if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies)) return false;
  if (Object.keys(dependencies).sort().join(',') !== [...acceptanceDependencyComponents].sort().join(',')) return false;
  return acceptanceDependencyComponents.every((component) => {
    const dependency = dependencies[component];
    const expected = workers[component];
    return dependency && typeof dependency === 'object' && !Array.isArray(dependency)
      && dependency.workerName === expected.name
      && dependency.versionId === expected.versionId
      && typeof dependency.sourceSha === 'string' && /^[0-9a-f]{40}$/i.test(dependency.sourceSha)
      && dependency.status === acceptanceDependencyExpectedStatus(component)
      && dependency.provenance === expected.provenance;
  });
})();

const componentEvidence = {
  ...Object.fromEntries(Object.entries(pages).map(([component, evidence]) => [component, evidence])),
  ...Object.fromEntries(Object.entries(workers).map(([component, evidence]) => [component, evidence])),
};
const changedActivationEvidence = parseJson('ACTIVATION_EVIDENCE_JSON', {
  state: valueOrNull('ACTIVATION_STATE') ?? 'BLOCKED',
  changedComponents,
  activatedComponents: RELEASE_COMPONENTS.filter((component) => componentEvidence[component].status === COMPONENT_DISPOSITIONS.ACTIVATED),
});
const rollbackComponents = componentList('ROLLBACK_COMPONENTS_JSON', changedComponents);
if (rollbackComponents.some((component) => !changedSet.has(component))) {
  throw new Error('ROLLBACK_COMPONENTS_JSON may contain only changed components');
}
const rollbackEvidence = {
  state: valueOrNull('ROLLBACK_STATE') ?? 'READY',
  artifactsProven: booleanValue('ROLLBACK_ARTIFACTS_PROVEN'),
  changedComponents: rollbackComponents,
  evidencePath: valueOrNull('ROLLBACK_EVIDENCE_PATH'),
};
const postActivationEvidence = parseJson('POST_ACTIVATION_EVIDENCE_JSON', {
  state: Object.values(productionSmoke).every((value) => value === 'PASS') ? 'VERIFIED' : 'BLOCKED',
  productionSmoke,
});
const failureDomains = parseJson('FAILURE_DOMAIN_EVIDENCE_JSON', []);
const changedFiles = changedFileList('CHANGED_FILES_JSON');
if (changedFiles !== null) {
  const computedClassification = classifyRelease({
    changedFiles,
    baseSha: previousProductionSha === 'NONE' ? null : previousProductionSha,
    forceAuthCritical: process.env.FORCE_AUTH_CRITICAL ?? '',
  });
  if (computedClassification.releaseClass !== releaseClass) {
    throw new Error(`RELEASE_CLASS does not match deterministic classification: expected ${computedClassification.releaseClass}`);
  }
  if (JSON.stringify(computedClassification.changedComponents) !== JSON.stringify(changedComponents)
    || JSON.stringify(computedClassification.reusedComponents) !== JSON.stringify(reusedComponents)) {
    throw new Error('changed and reused component evidence does not match deterministic classification');
  }
}
const failureDomainNames = new Set(Object.values(FAILURE_DOMAINS));
const failureDomainsSchemaValid = Array.isArray(failureDomains)
  && failureDomains.every((entry) => entry && typeof entry === 'object' && !Array.isArray(entry)
    && typeof entry.gate === 'string' && typeof entry.code === 'string' && typeof entry.domain === 'string'
    && failureDomainNames.has(entry.domain) && typeof entry.message === 'string');
const blockingFailureDomains = failureDomainsSchemaValid
  ? failureDomains.filter(({ domain }) => domain !== FAILURE_DOMAINS.OBSERVABILITY_WARNING)
  : [];
const failureDomainsClear = failureDomainsSchemaValid && blockingFailureDomains.length === 0;
const requestedReleaseState = valueOrNull('RELEASE_STATE');
const releaseState = requestedReleaseState ?? (postActivationEvidence.state === 'VERIFIED' ? 'VERIFIED' : 'BLOCKED');
const releaseStateHistory = parseJson('RELEASE_STATE_HISTORY_JSON', []);
if (!RELEASE_STATES.includes(releaseState)) {
  throw new Error('RELEASE_STATE must be a known release state');
}
let reconstructedStateHistory = [];
let stateHistoryTransitionsValid = true;
try {
  for (const entry of releaseStateHistory) {
    reconstructedStateHistory = transitionReleaseState(reconstructedStateHistory, entry.state, entry.at);
  }
} catch {
  stateHistoryTransitionsValid = false;
}
const releaseStateHistoryValid = Array.isArray(releaseStateHistory)
  && releaseStateHistory.length > 0
  && releaseStateHistory.every((entry) => entry && typeof entry === 'object' && RELEASE_STATES.includes(entry.state)
    && typeof entry.at === 'string' && Number.isFinite(Date.parse(entry.at)))
  && releaseStateHistory[0]?.state === 'PREFLIGHT'
  && releaseStateHistory.at(-1)?.state === releaseState
  && stateHistoryTransitionsValid
  && JSON.stringify(reconstructedStateHistory) === JSON.stringify(releaseStateHistory);

const pagesReady = (component) => {
  const evidence = pages[component];
  const changed = changedSet.has(component);
  const projectReady = component === 'marketing'
    ? evidence.project === 'lythaus-marketing'
    : component === 'flutter-web'
      ? evidence.project === 'lythaus-web'
      : evidence.project !== null;
  return projectReady
    && evidence.branch !== null
    && evidence.deploymentId !== null
    && evidence.deploymentUrl !== null
    && evidence.deployedSha !== null
    && (changed ? evidence.status === COMPONENT_DISPOSITIONS.ACTIVATED && evidence.deployedSha.toLowerCase() === releaseSha.toLowerCase() : evidence.status === COMPONENT_DISPOSITIONS.REUSED_PRODUCTION);
};
const workerReady = (component) => {
  const evidence = workers[component];
  const changed = changedSet.has(component);
  return evidence.versionId !== null
    && evidence.sourceSha !== null
    && (changed
      ? evidence.status === COMPONENT_DISPOSITIONS.ACTIVATED && evidence.provenance === 'BUILT_FROM_RELEASE_SHA' && evidence.sourceSha.toLowerCase() === releaseSha.toLowerCase()
      : evidence.status === COMPONENT_DISPOSITIONS.REUSED_PRODUCTION && evidence.provenance === 'REUSED_KNOWN_GOOD_PRODUCTION_VERSION' && /^[0-9a-f]{40}$/i.test(evidence.sourceSha));
};

const requiredEvidence = [
  releaseGovernanceCompensatingControls,
  (valueOrNull('NATIVE_BRANCH_PROTECTION_STATUS') ?? 'ACTIVE') === 'ACTIVE',
  booleanValue('CANDIDATE_MERGED_PR_VERIFIED'),
  booleanValue('UNRESOLVED_REVIEW_CONVERSATIONS_VERIFIED'),
  booleanValue('LINEAR_HISTORY_VERIFIED'),
  booleanValue('PREVIOUS_RELEASE_ANCESTRY_VERIFIED'),
  process.env.HISTORICAL_BRANCHES_RECONCILED === 'true',
  process.env.SECURITY_CHECKS_VERIFIED === 'true',
  failureDomainsClear,
  cloudflareStatus === 'VERIFIED',
  process.env.CLOUDFLARE_PAGES_INVENTORY_VERIFIED === 'true',
  legacyAsoraActiveResources === 0,
  planetscaleStatus === 'VERIFIED',
  process.env.HYPERDRIVE_VERIFIED_MAIN === 'true',
  process.env.DATABASE_IDENTITY_VERIFIED === 'true',
  process.env.BUDGET_ENFORCEMENT_VERIFIED === 'true',
  authAcceptanceRequired
    ? authenticatedAcceptanceProven && authAcceptanceStatus === 'PASSED' && acceptanceRunId !== null && acceptanceExpiresAt !== null && acceptanceDependenciesPresent && acceptanceDependenciesValid
    : authAcceptanceStatus === 'NOT_REQUIRED',
  releaseStateHistoryValid,
  fingerprintOrNull('PLANETSCALE_SCHEMA_FINGERPRINT') !== null,
  process.env.PLANETSCALE_GRANTS_VERIFIED === 'true',
  ...['marketing', 'flutter-web', 'control-panel'].map(pagesReady),
  ...['public', 'admin', 'jobs', 'coordinator'].map(workerReady),
  relationCountOrNull('PLANETSCALE_RELATION_COUNT') !== null,
  /^17\./.test(valueOrNull('PLANETSCALE_SERVER_VERSION') ?? ''),
  /^[0-9a-f]{64}$/i.test(valueOrNull('PLANETSCALE_MIGRATION_SET_SHA256') ?? ''),
  urlOrNull('PROVIDER_EVIDENCE_RUN_URL') !== null,
  Object.values(productionSmoke).every((value) => value === 'PASS'),
  process.env.ROLLBACK_ARTIFACTS_PROVEN === 'true',
  process.env.CREDENTIAL_ROTATION_COMPLETED === 'true',
];
const readinessStatus = requiredEvidence.every(Boolean)
  ? 'ready'
  : [cloudflareStatus, planetscaleStatus].some((value) => value === 'UNKNOWN/BLOCKED' || value === 'BLOCKED')
    ? 'blocked'
    : 'partial';
const productionStatus = readinessStatus === 'ready' ? 'GO' : 'NO-GO';
const unknowns = [
  cloudflareStatus === 'VERIFIED' ? null : `Cloudflare live inventory status is ${cloudflareStatus}`,
  planetscaleStatus === 'VERIFIED' ? null : `PlanetScale live inventory status is ${planetscaleStatus}`,
  process.env.HYPERDRIVE_VERIFIED_MAIN === 'true' ? null : 'Hyperdrive main-target proof is unavailable',
  process.env.DATABASE_IDENTITY_VERIFIED === 'true' ? null : 'Database identity proof is unavailable',
  process.env.PLANETSCALE_GRANTS_VERIFIED === 'true' ? null : 'PlanetScale grant verification is unavailable',
  fingerprintOrNull('PLANETSCALE_SCHEMA_FINGERPRINT') === null ? 'PlanetScale schema fingerprint is unavailable' : null,
  Object.values(componentEvidence).some(({ versionId }) => versionId === null) ? 'One or more candidate or reused version IDs are unavailable' : null,
  Object.values(componentEvidence).some(({ sourceSha }) => sourceSha === null) ? 'One or more component source SHA proofs are unavailable' : null,
  Object.values(productionSmoke).every((value) => value === 'PASS') ? null : 'One or more canonical production smoke checks are unavailable',
  authAcceptanceRequired ? (authenticatedAcceptanceProven ? null : 'Auth-critical real acceptance proof is unavailable') : 'Human auth acceptance is not required for STANDARD_RELEASE',
  authAcceptanceRequired && (!acceptanceDependenciesPresent || !acceptanceDependenciesValid) ? 'Exact acceptance candidate/reused dependency evidence is unavailable or mismatched' : null,
  releaseStateHistoryValid ? null : 'Release state history is unavailable or malformed',
  failureDomainsSchemaValid ? null : 'Failure-domain evidence is malformed',
  failureDomainsClear || !failureDomainsSchemaValid ? null : `Blocking failure domains are present: ${blockingFailureDomains.map(({ domain }) => domain).join(', ')}`,
  releaseGovernanceCompensatingControls ? null : 'Compensating release governance proof is unavailable',
  booleanValue('CANDIDATE_MERGED_PR_VERIFIED') ? null : 'Merged PR provenance is unavailable',
  booleanValue('UNRESOLVED_REVIEW_CONVERSATIONS_VERIFIED') ? null : 'Resolved review-conversation proof is unavailable',
  booleanValue('LINEAR_HISTORY_VERIFIED') ? null : 'Linear-history proof is unavailable',
  booleanValue('PREVIOUS_RELEASE_ANCESTRY_VERIFIED') ? null : 'Previous production ancestry proof is unavailable',
  process.env.HISTORICAL_BRANCHES_RECONCILED === 'true' ? null : 'Historical branch reconciliation proof is unavailable',
  process.env.CLOUDFLARE_PAGES_INVENTORY_VERIFIED === 'true' ? null : 'Cloudflare Pages inventory proof is unavailable',
  legacyAsoraActiveResources === 0 ? null : 'Active Lythaus-related legacy Asora resources remain',
  process.env.CREDENTIAL_ROTATION_COMPLETED === 'true' ? null : 'Post-cutover credential rotation is not attested',
  process.env.ROLLBACK_ARTIFACTS_PROVEN === 'true' ? null : 'Rollback snapshots are not proven',
].filter(Boolean);

const manifest = {
  schemaVersion: 'lythaus-release-manifest-v2',
  state: releaseState,
  stateHistory: releaseStateHistory,
  status: productionStatus,
  productionStatus,
  readinessStatus,
  capturedAt: new Date().toISOString(),
  releaseClass,
  releaseSha,
  changedComponents,
  reusedComponents,
  repository: { owner: 'AsoraKK', name: 'Lythaus', releaseSha },
  source: {
    releaseSha,
    previousProductionSha,
    classificationRulesVersion: valueOrNull('RELEASE_CLASSIFICATION_RULES_VERSION') ?? 'release-classification-v2',
    changedFiles,
    forceAuthCritical: booleanValue('FORCE_AUTH_CRITICAL'),
  },
  github: {
    mainSha: releaseSha,
    ciRunId: valueOrNull('CI_RUN_ID'),
    historicalReconciliationRunId: valueOrNull('HISTORICAL_RECONCILIATION_RUN_ID'),
    nativeBranchProtectionStatus: valueOrNull('NATIVE_BRANCH_PROTECTION_STATUS') ?? 'ACTIVE',
    releaseGovernanceCompensatingControls,
    candidateMergedPullRequest: integerOrNull('CANDIDATE_MERGED_PR_NUMBER'),
    candidateMergedPrVerified: booleanValue('CANDIDATE_MERGED_PR_VERIFIED'),
    unresolvedReviewConversationsVerified: booleanValue('UNRESOLVED_REVIEW_CONVERSATIONS_VERIFIED'),
    linearHistoryVerified: booleanValue('LINEAR_HISTORY_VERIFIED'),
    previousProductionSha,
    previousProductionShaAncestorVerified: booleanValue('PREVIOUS_RELEASE_ANCESTRY_VERIFIED'),
    historicalBranchesReconciled: process.env.HISTORICAL_BRANCHES_RECONCILED === 'true',
    securityChecksVerified: process.env.SECURITY_CHECKS_VERIFIED === 'true',
  },
  surfaces,
  components: componentEvidence,
  database: {
    status: planetscaleStatus,
    schemaFingerprint: fingerprintOrNull('PLANETSCALE_SCHEMA_FINGERPRINT'),
    relationCount: relationCountOrNull('PLANETSCALE_RELATION_COUNT'),
    serverVersion: valueOrNull('PLANETSCALE_SERVER_VERSION'),
    migrationSetSha256: migration.checksum,
    observedMigrationSetSha256: valueOrNull('PLANETSCALE_MIGRATION_SET_SHA256'),
    latestMigration: migration.migrations.at(-1)?.name ?? null,
    databaseIdentityVerified: booleanValue('DATABASE_IDENTITY_VERIFIED'),
    hyperdriveVerifiedMain: booleanValue('HYPERDRIVE_VERIFIED_MAIN'),
    grantsVerified: booleanValue('PLANETSCALE_GRANTS_VERIFIED'),
  },
  provider: {
    cloudflareStatus,
    planetscaleStatus,
    evidenceRunUrl: urlOrNull('PROVIDER_EVIDENCE_RUN_URL'),
    cloudflarePagesInventoryVerified: booleanValue('CLOUDFLARE_PAGES_INVENTORY_VERIFIED'),
    legacyAsoraActiveResources,
  },
  candidate: {
    state: valueOrNull('CANDIDATE_STATE') ?? (changedComponents.length ? 'CANDIDATE_READY' : 'REUSED_PRODUCTION'),
    components: componentEvidence,
  },
  authAcceptance: {
    required: authAcceptanceRequired,
    status: authAcceptanceStatus,
    releaseSha,
    acceptanceRunId,
    expiresAt: acceptanceExpiresAt,
    candidate: authAcceptanceRequired ? {
      workerName: workers.public.name,
      versionId: workers.public.versionId,
      sourceReleaseSha: workers.public.sourceSha,
      provenance: workers.public.provenance,
    } : null,
    candidateDependencies: authAcceptanceRequired ? acceptanceDependencies : null,
    evidencePath: authAcceptanceRequired ? valueOrNull('AUTH_ACCEPTANCE_EVIDENCE_PATH') : null,
  },
  activation: changedActivationEvidence,
  rollback: rollbackEvidence,
  postActivation: postActivationEvidence,
  failureDomains,
  failureDomainsValid: failureDomainsSchemaValid,
  failureDomainsClear,
  deploymentEvidence: {
    databaseIdentityVerified: booleanValue('DATABASE_IDENTITY_VERIFIED'),
    budgetEnforcementVerified: booleanValue('BUDGET_ENFORCEMENT_VERIFIED'),
    authenticatedAcceptanceProven,
  },
  cloudflare: {
    accountId: registry.policy.cloudflareAccountId,
    zone: registry.policy.activeZone,
    status: cloudflareStatus,
    inventoryStatus: cloudflareStatus,
    marketingProject: pages.marketing.project,
    marketingDomains: pages.marketing.domains,
    flutterProject: pages['flutter-web'].project,
    adminProject: pages['control-panel'].project,
    workers: Object.fromEntries(Object.entries(workers).map(([component, evidence]) => [component, evidence.name])),
    legacyAsoraActiveResources,
    pagesInventoryVerified: booleanValue('CLOUDFLARE_PAGES_INVENTORY_VERIFIED'),
    hyperdrive: {
      manifestPath: 'infrastructure/cloudflare/native-hyperdrive-production.json',
      targetBranch: hyperdrive.productionTargetBranch,
      expectedMainOriginFingerprint: hyperdrive.expectedMainOriginFingerprint,
      verifiedMain: booleanValue('HYPERDRIVE_VERIFIED_MAIN'),
      providerEvidenceRunUrl: urlOrNull('PROVIDER_EVIDENCE_RUN_URL'),
    },
  },
  planetscale: {
    status: planetscaleStatus,
    organization: hyperdrive.planetScaleOrganization,
    database: hyperdrive.planetScaleDatabase,
    branch: hyperdrive.productionTargetBranch,
    inventoryStatus: planetscaleStatus,
    serverVersion: valueOrNull('PLANETSCALE_SERVER_VERSION'),
    relationCount: relationCountOrNull('PLANETSCALE_RELATION_COUNT'),
    latestMigration: migration.migrations.at(-1)?.name ?? null,
    migrationSetSha256: migration.checksum,
    observedMigrationSetSha256: valueOrNull('PLANETSCALE_MIGRATION_SET_SHA256'),
    migrationBytes: migration.bytes,
    databaseIdentityVerified: booleanValue('DATABASE_IDENTITY_VERIFIED'),
    schemaFingerprint: fingerprintOrNull('PLANETSCALE_SCHEMA_FINGERPRINT'),
    grantsVerified: booleanValue('PLANETSCALE_GRANTS_VERIFIED'),
    migrationCount: migration.migrations.length,
    migrationLedgerVerified: booleanValue('PLANETSCALE_GRANTS_VERIFIED') && /^[0-9a-f]{64}$/i.test(valueOrNull('PLANETSCALE_MIGRATION_SET_SHA256') ?? ''),
  },
  security,
  credentialRotation: { completed: booleanValue('CREDENTIAL_ROTATION_COMPLETED') },
  productionSmoke,
  evidence: {
    source: 'exact reviewed main SHA, deterministic release classification, and sanitized provider evidence',
    platformLimitations: [
      'GitHub artifact attestations are unavailable for private repositories on the current plan; the sanitized manifest is accompanied by a SHA-256 integrity digest.',
    ],
    unknowns,
  },
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: manifest.status, releaseClass, releaseSha, output: path.relative(root, outputPath) }));
