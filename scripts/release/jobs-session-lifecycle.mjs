import { createHash } from 'node:crypto';
import { sanitizedJobsSessionReceipt } from '../../packages/contracts/src/jobs-reputation-session.ts';

export const TARGETS = Object.freeze({ public: 'lythaus-public-api-development', jobs: 'lythaus-jobs-development' });
export const ACCOUNT = 'e5b7ae46e04698f507b7e4b3d4ef1af0';
export const FLAG = 'JOBS_REPUTATION_SESSION_DIAGNOSTIC_ENABLED';
export const SCHEMA = 'lythaus-jobs-session-recovery-v1';
export const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const SHA = /^[a-f0-9]{40}$/;
const HASH = /^[a-f0-9]{64}$/;
const CONFIG = ['cache_options', 'compatibility_date', 'compatibility_flags', 'exports', 'limits',
  'main_module', 'modules', 'package_dependencies', 'placement', 'usage_model'];
const READ_FIELDS = new Set([...CONFIG, 'id', 'created_on', 'number', 'urls', 'annotations',
  'author_email', 'author_id', 'bindings', 'source', 'startup_time_ms', 'assets', 'containers',
  'migration_tag', 'migrations', 'exports_reconciliation']);
const BINDINGS = new Set(['ai', 'analytics_engine', 'browser', 'd1', 'dispatch_namespace',
  'email', 'hyperdrive', 'images', 'json', 'kv_namespace', 'mtls_certificate', 'plain_text',
  'queue', 'r2_bucket', 'ratelimit', 'secret_key', 'secret_text', 'secrets_store_secret',
  'service', 'version_metadata', 'vectorize', 'workflow']);
export function fail(code) { throw new Error(code); }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function exact(value, keys) {
  if (!object(value) || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) fail('record_invalid');
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
export const digest = value => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const empty = value => value == null || (Array.isArray(value) ? value.length === 0 : object(value) && Object.keys(value).length === 0);
function flagOff(bindings) {
  const flag = bindings.find(binding => binding.name === FLAG);
  return !flag || (flag.type === 'plain_text' && flag.text === 'false');
}
export function versionProjection(version) {
  if (!object(version) || Object.keys(version).some(key => !READ_FIELDS.has(key))
    || !UUID.test(version.id) || !SHA.test(version.annotations?.['workers/tag'])
    || !Array.isArray(version.bindings) || version.bindings.length > 200
    || !Array.isArray(version.modules) || !version.modules.length || version.modules.length > 100
    || typeof version.main_module !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(version.compatibility_date)
    || !Array.isArray(version.compatibility_flags)
    || ['assets', 'containers', 'migration_tag', 'migrations', 'exports_reconciliation'].some(key => !empty(version[key]))) {
    fail('version_capability_unavailable');
  }
  // No Durable Object migration/export, asset JWT or resource creation is supported.
  if (version.exports && Object.values(version.exports).some(entry => entry?.type !== 'worker' || entry?.state !== 'created')) {
    fail('version_capability_unavailable');
  }
  const names = new Set();
  for (const binding of version.bindings) {
    if (!object(binding) || !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(binding.name)
      || names.has(binding.name) || !BINDINGS.has(binding.type)
      || (binding.type.startsWith('secret_') && Object.keys(binding).some(key => !['type', 'name'].includes(key)))) {
      fail('binding_capability_unavailable');
    }
    names.add(binding.name);
  }
  const modules = new Set();
  for (const module of version.modules) {
    exact(module, ['name', 'content_type', 'content_base64']);
    if (typeof module.name !== 'string' || modules.has(module.name)
      || typeof module.content_type !== 'string' || typeof module.content_base64 !== 'string'
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(module.content_base64)) fail('modules_invalid');
    modules.add(module.name);
  }
  if (!modules.has(version.main_module)) fail('modules_invalid');
  return { config: Object.fromEntries(CONFIG.filter(key => key in version).map(key => [key, version[key]])),
    bindings: [...version.bindings].sort((a, b) => a.name.localeCompare(b.name)) };
}
export function clonePayload(version, marker) {
  const { config } = versionProjection(version);
  if (!flagOff(version.bindings)) fail('baseline_flag_enabled');
  return { ...config, annotations: { 'workers/tag': version.annotations['workers/tag'], 'workers/message': marker },
    bindings: [...version.bindings.filter(binding => binding.name !== FLAG).map(binding => ({
      name: binding.name, type: 'inherit', version_id: version.id,
    })), { name: FLAG, type: 'plain_text', text: 'true' }] };
}
export function deployment(value) {
  if (!object(value) || !UUID.test(value.id) || value.strategy !== 'percentage'
    || !Array.isArray(value.versions) || value.versions.length < 1 || value.versions.length > 2) fail('deployment_invalid');
  const versions = value.versions.map(entry => {
    exact(entry, ['version_id', 'percentage']);
    if (!UUID.test(entry.version_id) || !Number.isFinite(entry.percentage) || entry.percentage < 0 || entry.percentage > 100) fail('deployment_invalid');
    return { ...entry };
  }).sort((a, b) => a.version_id.localeCompare(b.version_id));
  if (new Set(versions.map(entry => entry.version_id)).size !== versions.length
    || versions.reduce((sum, entry) => sum + entry.percentage, 0) !== 100) fail('deployment_invalid');
  return { id: value.id, strategy: 'percentage', versions };
}
function marker(record, component) { return `jobs-session:${record.runId}:${record.attempt}:${component}`; }
export function validateRecord(record) {
  exact(record, ['schema', 'runId', 'attempt', 'executorSha', 'sourceSha', 'workers']);
  if (record.schema !== SCHEMA || !/^[1-9][0-9]{0,19}$/.test(record.runId) || record.attempt !== '1'
    || !SHA.test(record.executorSha) || !SHA.test(record.sourceSha)) fail('record_invalid');
  exact(record.workers, ['public', 'jobs']);
  for (const value of Object.values(record.workers)) {
    exact(value, ['versionId', 'deploymentId', 'versionHash', 'settingsHash']);
    if (!UUID.test(value.versionId) || !UUID.test(value.deploymentId)
      || !HASH.test(value.versionHash) || !HASH.test(value.settingsHash)) fail('record_invalid');
  }
  return record;
}
export async function prepare({ api, runId, attempt, executorSha, sourceSha, expected }) {
  const record = { schema: SCHEMA, runId, attempt, executorSha, sourceSha, workers: {} };
  for (const component of Object.keys(TARGETS)) {
    const state = await api.snapshot(component, expected[component].versionId);
    const active = deployment(state.deployment);
    if (active.id !== expected[component].deploymentId || active.versions.length !== 1
      || active.versions[0].version_id !== expected[component].versionId || active.versions[0].percentage !== 100
      || state.version.id !== expected[component].versionId || state.version.annotations?.['workers/tag'] !== sourceSha) fail('baseline_mismatch');
    clonePayload(state.version, marker(record, component));
    const binding = state.version.bindings.find(value => value.name === (component === 'jobs' ? 'DB_JOBS_FRESH' : 'JOBS_COMPATIBILITY'));
    if (component === 'jobs' ? binding?.type !== 'hyperdrive' || binding.id !== '442bb04b99004cb38c6974ec031d65ee'
      : binding?.type !== 'service' || binding.service !== TARGETS.jobs || (binding.environment != null && binding.environment !== 'production')) fail('private_target_unavailable');
    if (state.settings?.subdomain?.enabled !== false || state.settings?.subdomain?.previews_enabled !== false) fail('preview_exposure_unavailable');
    if ((await api.findCandidates(component, marker(record, component))).length !== 0) fail('one_shot_already_staged');
    record.workers[component] = { ...expected[component], versionHash: digest(versionProjection(state.version)), settingsHash: digest(state.settings) };
  }
  validateRecord(record);
  // Re-read both: preparation itself must not silently accept a changing baseline.
  await assertBaseline(api, record);
  return record;
}
async function assertBaseline(api, record, activeIds = {}) {
  const snapshots = {};
  for (const component of Object.keys(TARGETS)) {
    const saved = record.workers[component];
    const state = await api.snapshot(component, saved.versionId);
    const active = deployment(state.deployment);
    if (state.version.id !== saved.versionId || state.version.annotations?.['workers/tag'] !== record.sourceSha
      || digest(versionProjection(state.version)) !== saved.versionHash || digest(state.settings) !== saved.settingsHash
      || active.id !== (activeIds[component] ?? saved.deploymentId)) fail('baseline_race');
    snapshots[component] = state;
  }
  return snapshots;
}
function ownCandidate(version, baseline, record, component) {
  if (version.annotations?.['workers/message'] !== marker(record, component)
    || version.annotations?.['workers/tag'] !== record.sourceSha || version.id === baseline.id) fail('candidate_mismatch');
  const projected = versionProjection(version);
  const flag = projected.bindings.find(binding => binding.name === FLAG);
  if (flag?.type !== 'plain_text' || flag.text !== 'true') fail('candidate_mismatch');
  projected.bindings = [...projected.bindings.filter(binding => binding.name !== FLAG),
    ...baseline.bindings.filter(binding => binding.name === FLAG)].sort((a, b) => a.name.localeCompare(b.name));
  if (digest(projected) !== record.workers[component].versionHash) fail('candidate_mismatch');
  return version.id;
}
export function sanitizeProbe(body, record, candidates) {
  if (!object(body) || body.service !== 'lythaus-public-api'
    || body.publicWorkerVersionId !== candidates.public || body.jobsWorkerVersionId !== candidates.jobs
    || body.publicReleaseTag !== record.sourceSha || body.jobsReleaseTag !== record.sourceSha) fail('probe_version_mismatch');
  const receipt = sanitizedJobsSessionReceipt(body.receipt);
  if (!receipt) fail('probe_receipt_invalid');
  return { publicWorkerVersionId: candidates.public, jobsWorkerVersionId: candidates.jobs,
    sourceSha: record.sourceSha, receipt };
}
export async function recover({ api, record }) {
  validateRecord(record);
  const result = { status: 'restoration_unverified', workers: {} };
  for (const component of ['public', 'jobs']) {
    let status = 'restoration_unverified';
    try {
      const saved = record.workers[component];
      const baseline = await api.snapshot(component, saved.versionId);
      if (baseline.version.id !== saved.versionId || !flagOff(baseline.version.bindings)
        || digest(versionProjection(baseline.version)) !== saved.versionHash
        || digest(baseline.settings) !== saved.settingsHash) fail('recovery_baseline_changed');
      const candidates = await api.findCandidates(component, marker(record, component));
      if (candidates.length > 1) fail('recovery_ambiguous');
      const ids = candidates.map(candidate => ownCandidate(candidate, baseline.version, record, component));
      const active = deployment(baseline.deployment);
      const originalOnly = active.versions.length === 1 && active.versions[0].version_id === saved.versionId && active.versions[0].percentage === 100;
      const ours = ids.length === 1 && active.versions.length === 2
        && active.versions.some(entry => entry.version_id === saved.versionId && entry.percentage === 100)
        && active.versions.some(entry => entry.version_id === ids[0] && entry.percentage === 0);
      if (!originalOnly && !ours) fail('recovery_concurrent_release');
      if (ours) {
        await api.releaseGuard();
        // Detect races immediately before writing; API has no documented compare-and-swap.
        const latest = await api.snapshot(component, saved.versionId);
        if (deployment(latest.deployment).id !== active.id || digest(latest.settings) !== saved.settingsHash) fail('recovery_race');
        await api.deploy(component, [{ version_id: saved.versionId, percentage: 100 }]);
      }
      const restored = await api.snapshot(component, saved.versionId);
      const final = deployment(restored.deployment);
      if (final.versions.length !== 1 || final.versions[0].version_id !== saved.versionId || final.versions[0].percentage !== 100
        || !flagOff(restored.version.bindings) || digest(versionProjection(restored.version)) !== saved.versionHash
        || digest(restored.settings) !== saved.settingsHash) fail('restoration_unverified');
      for (const id of ids) {
        await api.deleteCandidate(component, id);
        if (await api.versionExists(component, id)) fail('candidate_retained');
      }
      // Verify again after deletion; a cleanup call alone is never proof.
      const verified = await api.snapshot(component, saved.versionId);
      const serving = deployment(verified.deployment);
      if (serving.versions.length !== 1 || serving.versions[0].version_id !== saved.versionId
        || digest(versionProjection(verified.version)) !== saved.versionHash || digest(verified.settings) !== saved.settingsHash) fail('restoration_unverified');
      status = 'restored_verified';
    } catch { /* Raw provider/transport errors are intentionally discarded. */ }
    result.workers[component] = status;
  }
  if (Object.values(result.workers).every(status => status === 'restored_verified')) result.status = 'restored_verified';
  return result;
}
export async function execute({ api, record, durable, signal }) {
  validateRecord(record);
  const result = { schema: 'lythaus-jobs-session-execution-v1', runId: record.runId,
    status: 'failed', probe: null, restoration: null };
  // The workflow uploads this exact record before this entrypoint is allowed to mutate.
  if (!/^[1-9][0-9]*$/.test(durable?.artifactId ?? '') || !/^sha256:[a-f0-9]{64}$/.test(durable?.artifactDigest ?? '')) fail('durable_recovery_missing');
  const candidates = {};
  const activeIds = {};
  let ready = false;
  try {
    await api.releaseGuard();
    await assertBaseline(api, record);
    if (signal?.aborted) fail('cancelled');
    ready = true;
    for (const component of ['jobs', 'public']) {
      if (signal?.aborted) fail('cancelled');
      await api.releaseGuard();
      const baseline = await assertBaseline(api, record, activeIds);
      if (signal?.aborted) fail('cancelled');
      const candidate = await api.createCandidate(component, clonePayload(baseline[component].version, marker(record, component)));
      if (!UUID.test(candidate.id)) fail('candidate_invalid');
      const version = await api.getVersion(component, candidate.id);
      candidates[component] = ownCandidate(version, baseline[component].version, record, component);
      await api.releaseGuard();
      await assertBaseline(api, record, activeIds);
      if (signal?.aborted) fail('cancelled');
      const enabled = await api.deploy(component, [{ version_id: record.workers[component].versionId, percentage: 100 },
        { version_id: candidates[component], percentage: 0 }]);
      const checked = deployment(enabled);
      const expected = [{ version_id: record.workers[component].versionId, percentage: 100 }, { version_id: candidates[component], percentage: 0 }];
      if (digest(checked.versions) !== digest(expected.sort((a, b) => a.version_id.localeCompare(b.version_id)))) fail('enablement_unconfirmed');
      activeIds[component] = checked.id;
      await assertBaseline(api, record, activeIds);
    }
    await api.releaseGuard();
    await assertBaseline(api, record, activeIds);
    if (signal?.aborted) fail('cancelled');
    // At most one call. No polling, propagation retries or acceptance replay.
    result.probe = sanitizeProbe(await api.probe(candidates, signal), record, candidates);
    result.status = result.probe.receipt.status === 'observed' ? 'observed' : 'unavailable';
  } catch { result.status = signal?.aborted ? 'cancelled' : 'failed'; }
  finally {
    if (ready) result.restoration = await recover({ api, record });
  }
  if (!result.restoration || result.restoration.status !== 'restored_verified') result.status = 'failed';
  return result;
}
