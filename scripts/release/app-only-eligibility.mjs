import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { parseProductionDeploymentState, WORKER_VERSION_ID } from '../ci/resolve-production-version-state.mjs';

// These identities describe the reviewed app/build inputs, not a permission to
// deploy them. Any change requires a new review and a new bounded policy.
export const REVIEWED_APP_INPUTS = Object.freeze({
  '.fvmrc': ['100644', 'blob', '1ac27ca4207c5b18b82a1adc127dd49dbf56865b'],
  '.github/actions/flutter-setup': ['040000', 'tree', '5b06f0586953e8519b853568c82440fef038800b'],
  // The candidate differs from fee93 main only by registering the synthetic
  // app-only browser regression on build/web.
  '.github/workflows/ci.yml': ['100644', 'blob', '5a9b45972e05e1b1799c33ddf4ad363f8352777a'],
  'api/openapi/dist/openapi.json': ['100644', 'blob', '7d8c84b566daac9739e030a39dda45a1b132e52b'],
  assets: ['040000', 'tree', 'fb36838c65b1e2467fe5198031db94a3b125215c'],
  'cloudflare/pages-release.sh': ['100644', 'blob', '3f2a7d2e3fe8a39a53531684557768444d4d9070'],
  integration_test: ['040000', 'tree', 'b26618289337c2c20d8e0001b3f86a9fce0b92ce'],
  lib: ['040000', 'tree', 'c0a15b3e25515f95ccf83f24a89bb0f40634218f'],
  'package-lock.json': ['100644', 'blob', 'dd9d70a13e5c690e34affb0bce61050df7b234d0'],
  'package.json': ['100644', 'blob', '56032df99fe8e2ccc9b1b0820a438735ca6e6350'],
  'pubspec.lock': ['100644', 'blob', '38517b80c20777cbb116aea81ae3e4f9b380d1c6'],
  'pubspec.yaml': ['100644', 'blob', '9016eba614b27a323240a6ab86d30293ce273765'],
  'scripts/cf-pages-build.sh': ['100755', 'blob', '9cb848d8ca01a8ed2f2adf4b9591af8e7b63dafa'],
  'scripts/check-auth-flutter-coverage.mjs': ['100644', 'blob', 'f0884aec1d5d431b0e846721daa27708f652310c'],
  'scripts/check_coverage_gates.sh': ['100644', 'blob', 'b51f3f4e0feeffe5d1a524cfe5f09e3e9ae345ae'],
  'scripts/check-web-release-hosts.sh': ['100644', 'blob', 'b4bad72db584237d1323f3f1277d3150e1231110'],
  'scripts/check-web-security-headers.sh': ['100644', 'blob', 'f13059bda8ff96432f4a23cb457ce6e3b2085efb'],
  'scripts/ci/app-only-auth-browser.mjs': ['100644', 'blob', '9c1a1bd97f2f32729e834915842c99e04cd91d97'],
  'scripts/ci/flutter-service-worker.js': ['100644', 'blob', 'fd682dea3ab36faf578c150d975668cb0615e02d'],
  'scripts/ci/version-web-entrypoints.mjs': ['100644', 'blob', '6e7f1bd9723c6889bcde65d7f17c106aacd88ff1'],
  'scripts/secret-scan.sh': ['100755', 'blob', 'becc30db6391f79a7d86c2c639647f19f718a703'],
  'scripts/release/app-only-auth-network-policy.mjs': ['100644', 'blob', '8e7f2e1c333083502506be07fa499259e1d690aa'],
  'scripts/test-with-coverage.sh': ['100644', 'blob', 'aff11ea902930a65cd230a43bb24ddeaefbffb18'],
  'scripts/tests/auth-request-lifecycle.mjs': ['100644', 'blob', 'e34e36c8222a66cd8ec4a18e11753b567d60a7ff'],
  'scripts/tests/auth-request-lifecycle.test.mjs': ['100644', 'blob', '6f2f758b172726a87ac6843d99823646445d9498'],
  'scripts/tests/app-only-auth.browser.mjs': ['100644', 'blob', '2c8a32662e210f04d0d6684e29bf929eeaef426f'],
  'scripts/tests/flutter-auth.browser.mjs': ['100644', 'blob', '6f1d58c6f182aab5e6a1870a316adbfe856b9759'],
  'scripts/tests/flutter-engine-font-fixture.mjs': ['100644', 'blob', '6990ffbd823a3a62cb8ce4385c216480a17fb96d'],
  'scripts/tests/fixtures/flutter-engine-fonts.json': ['100644', 'blob', 'a8864812f31e0b7754f373a140911d43a8cd86a3'],
  'scripts/tests/fresh-owner-read.mjs': ['100644', 'blob', 'bf40b17b79dc23531af23c1066dbf063ecc07cf3'],
  'scripts/tests/fresh-owner-read.test.mjs': ['100644', 'blob', '9196cc1bc9c4a1357fc1c39d3056c6f6789aee75'],
  'scripts/tests/local-auth-browser-server.mjs': ['100644', 'blob', '222c3f2b54c38ee7628a043a2efdb19b705de27c'],
  test: ['040000', 'tree', 'fcc706fae7d6b86a14606d366296d5f8d8491faa'],
  web: ['040000', 'tree', 'e232e4dd862e5ad559e5783f9ba34fbb2453dfd3'],
});
for (const identity of Object.values(REVIEWED_APP_INPUTS)) Object.freeze(identity);

export const REVIEWED_LIVE_PUBLIC_CONTRACT = '925ce4f429daa5c52fc7c57c7b81349aa40d7b92';

const FEEDBACK_PATHS = Object.freeze([
  '/feedback/comment/{targetId}', '/feedback/comment/{targetId}/emotion', '/feedback/comment/{targetId}/quality',
  '/feedback/post/{targetId}', '/feedback/post/{targetId}/emotion', '/feedback/post/{targetId}/quality',
]);
const FEEDBACK_COMPONENTS = Object.freeze({
  schemas: Object.freeze(['ContributionEmotion', 'ContributionFeedbackChange', 'ContributionFeedbackError',
    'ContributionFeedbackSummary', 'ContributionFeedbackTarget', 'ContributionQuality', 'EmotionFeedbackRequest', 'QualityFeedbackRequest']),
  parameters: Object.freeze(['feedbackIdempotencyKey', 'targetId']),
  responses: Object.freeze(['FeedbackError', 'FeedbackIdempotencyConflict']),
});

export const REUSED_WORKER_NAMES = Object.freeze({
  public: 'lythaus-public-api-development',
  admin: 'lythaus-admin-api-development',
  jobs: 'lythaus-jobs-development',
  coordinator: 'lythaus-auth-acceptance-coordinator-development',
});

const shaPattern = /^[0-9a-f]{40}$/;

function requireSha(sha, label) {
  if (typeof sha !== 'string' || !shaPattern.test(sha)) throw new Error(`${label} must be a lowercase full commit SHA`);
}

function requireCommit(repositoryRoot, sha, label) {
  requireSha(sha, label);
  let type;
  try {
    type = execFileSync('git', ['cat-file', '-t', sha], { cwd: repositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    throw new Error(`${label} is not an available commit`);
  }
  if (type !== 'commit') throw new Error(`${label} is not an available commit`);
}

/** Check exact reviewed inputs including Git modes; not an artifact or release authorization. */
export function assertReviewedEntries(entries) {
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) throw new Error('app inputs are missing');
  const expectedPaths = Object.keys(REVIEWED_APP_INPUTS).sort();
  const actualPaths = Object.keys(entries).sort();
  if (JSON.stringify(expectedPaths) !== JSON.stringify(actualPaths)) throw new Error('reviewed app input inventory differs');
  for (const name of expectedPaths) {
    if (JSON.stringify(entries[name]) !== JSON.stringify(REVIEWED_APP_INPUTS[name])) {
      throw new Error(`reviewed app input changed: ${name}`);
    }
  }
}

/** Read identities from a commit, never from a dirty working tree. */
export function assertReviewedAppSource(repositoryRoot, releaseSha) {
  requireCommit(repositoryRoot, releaseSha, 'release SHA');
  const output = execFileSync('git', ['ls-tree', releaseSha, '--', ...Object.keys(REVIEWED_APP_INPUTS)], {
    cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 1024 * 1024,
  });
  const entries = {};
  for (const line of output.split('\n').filter(Boolean)) {
    const match = /^(\d{6}) (blob|tree) ([0-9a-f]{40})\t(.+)$/.exec(line);
    if (!match || Object.hasOwn(entries, match[4])) throw new Error('unexpected Git tree entry');
    entries[match[4]] = [match[1], match[2], match[3]];
  }
  assertReviewedEntries(entries);
  return Object.freeze({ releaseSha, inputCount: Object.keys(entries).length });
}

function requireRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} is not an object`);
}

/** Compare contracts only; runtime and authenticated-browser checks remain required. */
export function assertOnlyReviewedContractExtension(live, candidate) {
  requireRecord(live, 'live contract');
  requireRecord(candidate, 'candidate contract');
  const withoutSections = value => Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'paths' && key !== 'components'));
  if (!isDeepStrictEqual(withoutSections(live), withoutSections(candidate))) throw new Error('contract metadata changed');
  requireRecord(live.paths, 'live paths');
  requireRecord(candidate.paths, 'candidate paths');
  const addedPaths = Object.keys(candidate.paths).filter(path => !Object.hasOwn(live.paths, path)).sort();
  if (!isDeepStrictEqual(addedPaths, FEEDBACK_PATHS)) throw new Error('contract path extension differs');
  for (const [path, operation] of Object.entries(live.paths)) {
    if (!Object.hasOwn(candidate.paths, path) || !isDeepStrictEqual(operation, candidate.paths[path])) {
      throw new Error(`existing contract path changed: ${path}`);
    }
  }
  requireRecord(live.components, 'live components');
  requireRecord(candidate.components, 'candidate components');
  if (!isDeepStrictEqual(Object.keys(live.components).sort(), Object.keys(candidate.components).sort())) {
    throw new Error('contract component categories changed');
  }
  for (const category of Object.keys(FEEDBACK_COMPONENTS)) {
    if (!Object.hasOwn(live.components, category)) throw new Error(`contract component category missing: ${category}`);
  }
  for (const [category, oldValues] of Object.entries(live.components)) {
    const newValues = candidate.components[category];
    requireRecord(oldValues, `live component ${category}`);
    requireRecord(newValues, `candidate component ${category}`);
    const added = Object.keys(newValues).filter(name => !Object.hasOwn(oldValues, name)).sort();
    if (!isDeepStrictEqual(added, FEEDBACK_COMPONENTS[category] ?? [])) throw new Error(`contract component extension differs: ${category}`);
    for (const [name, value] of Object.entries(oldValues)) {
      if (!Object.hasOwn(newValues, name) || !isDeepStrictEqual(value, newValues[name])) {
        throw new Error(`existing contract component changed: ${category}/${name}`);
      }
    }
  }
}

/**
 * The serving Public source must be ancestral and carry the reviewed legacy
 * contract. The worker version/source binding must come from authenticated
 * provider reads; this function cannot establish that binding by itself.
 */
export function assertReviewedPublicContract(repositoryRoot, releaseSha, publicSourceSha) {
  requireCommit(repositoryRoot, releaseSha, 'release SHA');
  requireCommit(repositoryRoot, publicSourceSha, 'Public source SHA');
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', publicSourceSha, releaseSha], {
      cwd: repositoryRoot, stdio: 'ignore',
    });
  } catch {
    throw new Error('serving Public source is not a verified release ancestor');
  }
  const identity = execFileSync('git', ['rev-parse', `${publicSourceSha}:api/openapi/dist/openapi.json`], {
    cwd: repositoryRoot, encoding: 'utf8',
  }).trim();
  if (identity !== REVIEWED_LIVE_PUBLIC_CONTRACT) throw new Error('serving Public contract differs from the reviewed legacy contract');
  const candidateIdentity = execFileSync('git', ['rev-parse', `${releaseSha}:api/openapi/dist/openapi.json`], {
    cwd: repositoryRoot, encoding: 'utf8',
  }).trim();
  if (candidateIdentity !== REVIEWED_APP_INPUTS['api/openapi/dist/openapi.json'][2]) throw new Error('candidate contract differs from the reviewed app contract');
  const contractAt = sha => JSON.parse(execFileSync('git', ['show', `${sha}:api/openapi/dist/openapi.json`], {
    cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  }));
  assertOnlyReviewedContractExtension(contractAt(publicSourceSha), contractAt(releaseSha));
  return Object.freeze({ publicSourceSha, contractBlob: identity });
}

/**
 * Normalize four read-only provider observations. Require one 100% serving
 * version and independently matching exact-version metadata per Worker.
 */
export function normalizeServingWorker(component, observation) {
    const workerName = REUSED_WORKER_NAMES[component];
    if (!workerName) throw new Error('unknown Worker identity');
    if (observation?.workerName !== workerName) throw new Error(`wrong Worker identity for ${component}`);
    const metadata = Array.isArray(observation.versions) ? observation.versions : observation.versions?.result;
    if (!Array.isArray(metadata)) throw new Error(`missing exact version metadata for ${component}`);
    const state = parseProductionDeploymentState(observation.deployment, metadata);
    if (state.serving.length !== 1 || state.serving[0].percentage !== 100) {
      throw new Error(`${component} must have exactly one 100% serving version`);
    }
    const serving = state.serving[0];
    const matches = metadata.filter(item => String(item?.id ?? item?.version_id ?? '').toLowerCase() === serving.versionId.toLowerCase());
    if (matches.length !== 1) throw new Error(`missing or ambiguous version metadata for ${component}`);
    const metadataState = parseProductionDeploymentState({ versions: [{ version_id: serving.versionId, percentage: 100 }] }, matches).serving[0];
    if (metadataState.sourceSha !== serving.sourceSha || metadataState.createdAt !== serving.createdAt) {
      throw new Error(`deployment and version metadata disagree for ${component}`);
    }
    return Object.freeze({
      workerName,
      versionId: serving.versionId.toLowerCase(),
      sourceSha: serving.sourceSha,
      createdAt: serving.createdAt,
      percentage: serving.percentage,
    });
}

export function normalizeServingWorkers(observations) {
  if (!observations || typeof observations !== 'object' || Array.isArray(observations)) throw new Error('worker observations are missing');
  if (JSON.stringify(Object.keys(observations).sort()) !== JSON.stringify(Object.keys(REUSED_WORKER_NAMES).sort())) {
    throw new Error('worker observation inventory differs');
  }
  const result = {};
  for (const component of Object.keys(REUSED_WORKER_NAMES)) result[component] = normalizeServingWorker(component, observations[component]);
  return Object.freeze(result);
}

/** Both observations must be freshly read by the protected release job. */
export function assertServingWorkersUnchanged(before, after) {
  const first = normalizeServingWorkers(before);
  const second = normalizeServingWorkers(after);
  for (const component of Object.keys(REUSED_WORKER_NAMES)) {
    if (JSON.stringify(first[component]) !== JSON.stringify(second[component])) {
      throw new Error(`serving ${component} Worker changed during app-only release`);
    }
  }
  return first;
}

export function normalizeCapturedWorkers(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)
    || !isDeepStrictEqual(Object.keys(snapshot).sort(), ['capturedAt', 'schemaVersion', 'startedAt', 'workers'])
    || snapshot.schemaVersion !== 1 || [snapshot.startedAt, snapshot.capturedAt].some(value =>
      typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value)
    || Date.parse(snapshot.startedAt) > Date.parse(snapshot.capturedAt)) {
    throw new Error('captured Worker snapshot is invalid');
  }
  requireRecord(snapshot.workers, 'captured Workers');
  const observations = Object.fromEntries(Object.entries(snapshot.workers).map(([component, worker]) => [component, {
    workerName: worker?.workerName,
    deployment: { versions: [{ version_id: worker?.versionId, percentage: worker?.percentage }] },
    versions: [{ id: worker?.versionId, source_sha: worker?.sourceSha, created_on: worker?.createdAt }],
  }]));
  const normalized = normalizeServingWorkers(observations);
  if (!isDeepStrictEqual(normalized, snapshot.workers)) throw new Error('captured Worker snapshot contains unexpected fields');
  return normalized;
}

/** Compare snapshots collected by the protected job; freshness is a separate release gate. */
export function assertCapturedWorkersUnchanged(before, after) {
  const first = normalizeCapturedWorkers(before);
  const second = normalizeCapturedWorkers(after);
  if (Date.parse(after.startedAt) < Date.parse(before.capturedAt)) throw new Error('Worker captures are out of order');
  for (const component of Object.keys(REUSED_WORKER_NAMES)) {
    if (!isDeepStrictEqual(first[component], second[component])) throw new Error(`serving ${component} Worker changed during app-only release`);
  }
  return first;
}

export function isAppPagesBranch(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(value)
    && !value.includes('..') && !value.includes('//') && !value.endsWith('/') && !value.endsWith('.');
}

/**
 * Read the canonical app Pages deployment as a rollback baseline. The caller
 * must obtain expectedBranch from protected production configuration and the
 * payload from the authenticated account; neither comes from dispatch inputs.
 */
export function normalizePagesSnapshot(payload, expectedProject, expectedBranch) {
  const project = payload?.result, deployment = project?.canonical_deployment;
  const metadata = deployment?.deployment_trigger?.metadata;
  if (!isAppPagesBranch(expectedBranch)
    || !/^lythaus-[a-z0-9-]+$/.test(expectedProject ?? '')
    || payload?.success !== true || project?.name !== expectedProject
    || !WORKER_VERSION_ID.test(project?.id ?? '') || project?.production_branch !== expectedBranch
    || deployment?.project_id !== project.id || deployment?.project_name !== project.name
    || deployment?.environment !== 'production' || deployment?.is_skipped !== false
    || deployment?.latest_stage?.name !== 'deploy' || deployment?.latest_stage?.status !== 'success'
    || metadata?.branch !== expectedBranch || metadata?.commit_dirty !== false || !shaPattern.test(metadata?.commit_hash ?? '')
    || !WORKER_VERSION_ID.test(deployment?.id ?? '')
    || !(new RegExp(`^https://[a-z0-9-]+\\.${expectedProject}\\.pages\\.dev$`)).test(deployment?.url ?? '')) {
    throw new Error('canonical app Pages deployment is unverified');
  }
  return Object.freeze({ project: project.name, projectId: project.id.toLowerCase(), branch: expectedBranch,
    deploymentId: deployment.id.toLowerCase(), commitSha: metadata.commit_hash, deploymentUrl: deployment.url });
}

export function normalizeAppPagesSnapshot(payload, expectedBranch) {
  return normalizePagesSnapshot(payload, 'lythaus-web', expectedBranch);
}

/** Only the separately configured, unchanged marketing and admin Pages projects. */
export function normalizeReusedPagesSnapshot(payload, expectedProject) {
  if (expectedProject === 'lythaus-web') throw new Error('reused Pages project is invalid');
  return normalizePagesSnapshot(payload, expectedProject, 'main');
}

function assertStoredAppSnapshot(value) {
  if (!value || value.project !== 'lythaus-web' || !WORKER_VERSION_ID.test(value.projectId ?? '')
    || !WORKER_VERSION_ID.test(value.deploymentId ?? '') || !shaPattern.test(value.commitSha ?? '')
    || !isAppPagesBranch(value.branch)
    || !/^https:\/\/[a-z0-9-]+\.lythaus-web\.pages\.dev$/.test(value.deploymentUrl ?? '')) {
    throw new Error('stored app Pages snapshot is invalid');
  }
}

export function assertAppPagesBaselineUnchanged(before, current) {
  assertStoredAppSnapshot(before);
  assertStoredAppSnapshot(current);
  if (!isDeepStrictEqual(before, current)) throw new Error('app Pages baseline changed');
}

/** Bind rollback to the exact new deployment, never merely a matching SHA. */
export function assertAppPagesCandidateBound(before, candidate, current, releaseSha) {
  requireSha(releaseSha, 'release SHA');
  assertStoredAppSnapshot(before);
  assertStoredAppSnapshot(candidate);
  assertStoredAppSnapshot(current);
  if (candidate.projectId !== before.projectId || candidate.branch !== before.branch
    || candidate.commitSha !== releaseSha || candidate.deploymentId === before.deploymentId
    || candidate.deploymentUrl === before.deploymentUrl
    || !isDeepStrictEqual(candidate, current)) throw new Error('app Pages candidate is not the current bound deployment');
}
