export const ACCEPTANCE_ROLLBACK_SNAPSHOT_SCHEMA = 'lythaus-acceptance-rollback-v1';

export const ACCEPTANCE_WORKER_COMPONENTS = Object.freeze(['public', 'admin', 'jobs', 'coordinator']);
export const ACCEPTANCE_ROUTE_COMPONENTS = Object.freeze(['adminApi', 'coordinator']);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_ROUTE_ID = /^[A-Za-z0-9._:-]{1,200}$/;
const SAFE_SCRIPT = /^[A-Za-z0-9._:-]{1,200}$/;
const PRINTABLE_ROUTE = /^[\x20-\x7e]{1,1000}$/;

function assertObject(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
}

function assertExactKeys(value, keys, code) {
  const expected = [...keys].sort().join(',');
  if (Object.keys(value).sort().join(',') !== expected) throw new Error(code);
}

function percentage(value, code) {
  const result = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN;
  if (!Number.isFinite(result) || result <= 0 || result > 100) throw new Error(code);
  return result;
}

function validateWorkerVersions(value, component, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) throw new Error(`acceptance_rollback_${component}_versions_invalid`);
  const seen = new Set();
  const versions = value.map((entry) => {
    assertObject(entry, `acceptance_rollback_${component}_version_invalid`);
    assertExactKeys(entry, ['versionId', 'percentage'], `acceptance_rollback_${component}_version_unknown_field`);
    if (typeof entry.versionId !== 'string' || !UUID.test(entry.versionId)) throw new Error(`acceptance_rollback_${component}_version_id_invalid`);
    const key = entry.versionId.toLowerCase();
    if (seen.has(key)) throw new Error(`acceptance_rollback_${component}_duplicate_version`);
    seen.add(key);
    return { versionId: entry.versionId, percentage: percentage(entry.percentage, `acceptance_rollback_${component}_percentage_invalid`) };
  });
  if (versions.length > 0) {
    const total = versions.reduce((sum, entry) => sum + entry.percentage, 0);
    if (Math.abs(total - 100) > 0.001) throw new Error(`acceptance_rollback_${component}_traffic_invalid`);
  }
  return versions;
}

function validateRoute(value, component) {
  if (value === null) return null;
  assertObject(value, `acceptance_rollback_${component}_route_invalid`);
  assertExactKeys(value, ['id', 'pattern', 'script'], `acceptance_rollback_${component}_route_unknown_field`);
  if (typeof value.id !== 'string' || !SAFE_ROUTE_ID.test(value.id)) throw new Error(`acceptance_rollback_${component}_route_id_invalid`);
  if (typeof value.pattern !== 'string' || !PRINTABLE_ROUTE.test(value.pattern)) throw new Error(`acceptance_rollback_${component}_route_pattern_invalid`);
  if (value.script !== null && (typeof value.script !== 'string' || !SAFE_SCRIPT.test(value.script))) throw new Error(`acceptance_rollback_${component}_route_script_invalid`);
  return { id: value.id, pattern: value.pattern, script: value.script ?? null };
}

function sourceVersions(payload, component) {
  assertObject(payload, `acceptance_rollback_${component}_deployment_invalid`);
  if (!Array.isArray(payload.versions)) throw new Error(`acceptance_rollback_${component}_deployment_versions_invalid`);
  const seen = new Set();
  const serving = [];
  for (const entry of payload.versions) {
    assertObject(entry, `acceptance_rollback_${component}_deployment_version_invalid`);
    const id = entry.version_id ?? entry.versionId;
    if (typeof id !== 'string' || !UUID.test(id)) throw new Error(`acceptance_rollback_${component}_deployment_version_id_invalid`);
    const key = id.toLowerCase();
    if (seen.has(key)) throw new Error(`acceptance_rollback_${component}_deployment_duplicate_version`);
    seen.add(key);
    const raw = typeof entry.percentage === 'number' ? entry.percentage : typeof entry.percentage === 'string' && entry.percentage.trim() !== '' ? Number(entry.percentage) : Number.NaN;
    if (!Number.isFinite(raw) || raw < 0 || raw > 100) throw new Error(`acceptance_rollback_${component}_deployment_percentage_invalid`);
    if (raw > 0) serving.push({ versionId: id, percentage: raw });
  }
  return validateWorkerVersions(serving, component, { allowEmpty: component === 'coordinator' });
}

function sourceRoute(payload, component) {
  assertObject(payload, `acceptance_rollback_${component}_route_payload_invalid`);
  const route = payload.route ?? null;
  if (route === null) return null;
  assertObject(route, `acceptance_rollback_${component}_route_invalid`);
  return validateRoute({ id: route.id, pattern: route.pattern, script: route.script ?? null }, component);
}

export function validateAcceptanceRollbackSnapshot(value, { candidateDependencies } = {}) {
  assertObject(value, 'acceptance_rollback_snapshot_invalid');
  assertExactKeys(value, ['schemaVersion', 'workers', 'routes'], 'acceptance_rollback_snapshot_unknown_field');
  if (value.schemaVersion !== ACCEPTANCE_ROLLBACK_SNAPSHOT_SCHEMA) throw new Error('acceptance_rollback_snapshot_schema_invalid');
  assertObject(value.workers, 'acceptance_rollback_snapshot_workers_invalid');
  assertExactKeys(value.workers, ACCEPTANCE_WORKER_COMPONENTS, 'acceptance_rollback_snapshot_workers_unknown_field');
  const workers = Object.fromEntries(ACCEPTANCE_WORKER_COMPONENTS.map((component) => {
    const allowEmpty = component === 'coordinator';
    const versions = validateWorkerVersions(value.workers[component]?.versions, component, { allowEmpty });
    if (candidateDependencies?.[component]?.status === 'REUSED_PRODUCTION' && versions.length === 0) {
      throw new Error(`acceptance_rollback_${component}_reused_snapshot_empty`);
    }
    return [component, { versions }];
  }));
  assertObject(value.routes, 'acceptance_rollback_snapshot_routes_invalid');
  assertExactKeys(value.routes, ACCEPTANCE_ROUTE_COMPONENTS, 'acceptance_rollback_snapshot_routes_unknown_field');
  const routes = Object.fromEntries(ACCEPTANCE_ROUTE_COMPONENTS.map((component) => [component, validateRoute(value.routes[component], component)]));
  return Object.freeze({
    schemaVersion: ACCEPTANCE_ROLLBACK_SNAPSHOT_SCHEMA,
    workers: Object.freeze(workers),
    routes: Object.freeze(routes),
  });
}

export function createAcceptanceRollbackSnapshot({ workerDeployments, routeSnapshots } = {}) {
  assertObject(workerDeployments, 'acceptance_rollback_worker_deployments_missing');
  assertObject(routeSnapshots, 'acceptance_rollback_route_snapshots_missing');
  const workers = Object.fromEntries(ACCEPTANCE_WORKER_COMPONENTS.map((component) => [component, { versions: sourceVersions(workerDeployments[component], component) }]));
  const routes = Object.fromEntries(ACCEPTANCE_ROUTE_COMPONENTS.map((component) => [component, sourceRoute(routeSnapshots[component], component)]));
  return validateAcceptanceRollbackSnapshot({ schemaVersion: ACCEPTANCE_ROLLBACK_SNAPSHOT_SCHEMA, workers, routes });
}

export function deploymentPayloadForRollback(snapshot, component) {
  const validated = validateAcceptanceRollbackSnapshot(snapshot);
  if (!ACCEPTANCE_WORKER_COMPONENTS.includes(component)) throw new Error(`unknown acceptance rollback component ${component}`);
  return { versions: validated.workers[component].versions.map(({ versionId, percentage }) => ({ version_id: versionId, percentage })) };
}
