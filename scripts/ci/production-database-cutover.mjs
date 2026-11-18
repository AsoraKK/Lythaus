import fs from 'node:fs';
import { createReadOnlyClient, databaseBindings, hyperdriveEvidence, TARGET } from './lythaus-new-core-isolation-review.mjs';
import { parseProductionDeploymentState } from './resolve-production-version-state.mjs';

export const transition = JSON.parse(fs.readFileSync(new URL('../../infrastructure/cloudflare/production-database-transition.json', import.meta.url)));

const consumers = {
  'lythaus-public-api': { DB_APP_FRESH: 'lythaus_runtime' },
  'lythaus-admin-api': { DB_ADMIN_FRESH: 'lythaus_admin', DB_PRIVACY_FRESH: 'lythaus_privacy' },
  'lythaus-jobs': { DB_JOBS_FRESH: 'lythaus_jobs', DB_PRIVACY_FRESH: 'lythaus_privacy' },
  'lythaus-auth-acceptance-coordinator': { DB_ADMIN_FRESH: 'lythaus_admin' },
};

const versionPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
function validateIsolatedVersions(destination) {
  const pins = destination.isolatedAdminVersions;
  if (!pins || (!versionPattern.test(pins.workerId) && !/^[a-f0-9]{32}$/.test(pins.workerId))
    || !versionPattern.test(pins.parentVersionId) || !versionPattern.test(pins.servingVersionId)
    || pins.parentVersionId === pins.servingVersionId || !/^[a-f0-9]{40}$/.test(pins.sourceSha)) {
    throw new Error('replacement Admin requires the immutable Worker and versions from the isolated setup receipt');
  }
  return pins;
}

export async function verifyIsolatedAdminVersions(destination, read) {
  const pins = validateIsolatedVersions(destination);
  const path = '/workers/workers/' + pins.workerId;
  const worker = await read(path);
  if (worker?.id !== pins.workerId || worker.name !== TARGET.worker || worker.subdomain?.enabled !== false
    || worker.subdomain?.previews_enabled !== false) throw new Error('isolated Admin Worker identity or exposure changed');
  for (const [index, id] of [pins.parentVersionId,pins.servingVersionId].entries()) {
    const version = await read(path + '/versions/' + id);
    const bindings = version?.bindings;
    const databases = Array.isArray(bindings) ? databaseBindings({bindings}) : [];
    const keys = bindings?.filter(binding=>binding.name === 'ACCESS_SUBJECT_HMAC_KEY') ?? [];
    if (version?.id !== id || version.number !== index + 1 || version.annotations?.['workers/tag'] !== pins.sourceSha
      || databases.length !== 1 || databases[0].name !== 'DB_ADMIN_FRESH' || databases[0].id !== destination.isolatedAdminConnector
      || keys.length !== 1 || keys[0].type !== 'secret_text' || Object.keys(keys[0]).length !== 2) {
      throw new Error('isolated Admin version, source, subject-key binding or database differs from the reviewed receipt');
    }
  }
}

export function validateProductionDatabaseMap(manifest, configs, plan = transition, requireDestination = false, releaseAdminWorker) {
  const replacement = manifest.planetScaleDatabase === plan.destination.database;
  const target = replacement ? plan.destination : plan.rollback;
  if (requireDestination && !replacement) throw new Error('new-core production cutover pins are pending');
  if (manifest.planetScaleOrganization !== plan.organization || manifest.accountId !== plan.accountId
    || manifest.planetScaleDatabase !== target.database || manifest.planetScaleDatabaseId !== target.databaseId
    || manifest.productionTargetBranch !== plan.branch || manifest.productionBranchId !== target.branchId
    || manifest.expectedMainOriginFingerprint !== target.originSha256) throw new Error('production database identity differs from the reviewed target');

  const roles = new Set(Object.values(consumers).flatMap(Object.values));
  if (replacement) validateIsolatedVersions(target);
  const ids = new Set();
  for (const role of roles) {
    const id = target.connectors[role];
    if (typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id) || ids.has(id)
      || id === plan.destination.isolatedAdminConnector || (replacement && Object.values(plan.rollback.connectors).includes(id))) {
      throw new Error('missing, shared across roles, or wrong-plane production connector for ' + role);
    }
    ids.add(id);
  }

  const expected = new Map();
  for (const [app, bindings] of Object.entries(consumers)) {
    const configPath = 'apps/' + app + '/wrangler.jsonc';
    const config = configs.get(configPath);
    const worker = replacement && app === 'lythaus-admin-api' ? TARGET.worker : app + '-development';
    if (app === 'lythaus-admin-api' && releaseAdminWorker !== undefined && releaseAdminWorker !== worker) {
      throw new Error('canonical release selects a different physical Admin Worker');
    }
    if (config?.name !== worker || config.vars?.ENVIRONMENT !== 'production'
      || config.hyperdrive?.length !== Object.keys(bindings).length) throw new Error('production Worker configuration differs for ' + app);
    if (replacement && ['lythaus-jobs', 'lythaus-public-api'].includes(app)) {
      if (config.keep_vars !== false || Object.keys(config.vars).some(key => /^MONTHLY_REPUTATION_.*RULES$/.test(key))) {
        throw new Error('optional monthly rules require separate activation');
      }
    }
    if (replacement && app === 'lythaus-admin-api' && (config.main !== 'src/control-worker.ts'
      || config.vars.EXPECTED_HOSTNAMES !== 'control.lythaus.co' || config.vars.CORS_ALLOWED_ORIGINS !== 'https://control.lythaus.co'
      || config.vars.ACCESS_REQUIRE_SIGNED_SUBJECT !== 'true' || config.keep_vars !== false
      || config.workers_dev !== false || config.preview_urls !== false || config.assets?.run_worker_first !== true
      || config.assets?.binding !== 'ASSETS' || config.version_metadata?.binding !== 'WORKER_VERSION')) {
      throw new Error('replacement Admin entry point, access configuration or exposure differs');
    }
    for (const [binding, role] of Object.entries(bindings)) {
      expected.set(worker + '/' + binding, configPath);
      const entries = manifest.bindings.filter(row => row.worker === worker && row.binding === binding);
      const bound = config.hyperdrive.filter(row => row.binding === binding);
      if (entries.length !== 1 || bound.length !== 1 || entries[0].configPath !== configPath
        || entries[0].targetBranch !== plan.branch || entries[0].expectedRoleKey !== role
        || entries[0].hyperdriveId !== target.connectors[role] || bound[0].id !== target.connectors[role]) {
        throw new Error('production binding pin mismatch for ' + worker + '/' + binding);
      }
    }
  }
  if (manifest.bindings.length !== expected.size) throw new Error('unexpected production manifest binding');
  for (const [configPath, config] of configs) {
    for (const binding of config.hyperdrive ?? []) {
      if (expected.get(config.name + '/' + binding.binding) !== configPath) {
        throw new Error('unmapped database consumer in ' + configPath);
      }
    }
    if (Object.values(config.env ?? {}).some(env => env.hyperdrive?.length)) throw new Error('unmapped environment database override in ' + configPath);
  }
  return target;
}

export async function verifyRollbackPlane({ manifest, snapshot, token, fetchImpl = fetch, destination = transition.destination }) {
  const api = createReadOnlyClient(token, fetchImpl, true);
  const account = '/accounts/' + transition.accountId;
  const checked = new Set();
  for (const [component, app] of Object.entries({public:'lythaus-public-api', admin:'lythaus-admin-api',
    jobs:'lythaus-jobs', coordinator:'lythaus-auth-acceptance-coordinator'})) {
    const worker = component === 'admin' ? TARGET.worker : app + '-development';
    const prior = snapshot(component);
    const priorVersions = parseProductionDeploymentState(prior.deployment, prior.versions).serving;
    const expected = manifest.bindings.filter(row => row.worker === worker);
    if (expected.length !== Object.keys(consumers[app]).length) throw new Error('rollback binding inventory incomplete');
    for (const {versionId} of priorVersions) {
      const version = (await api.get(account + '/workers/scripts/' + worker + '/versions/' + versionId)).result;
      if (version?.id !== versionId || !Array.isArray(version.resources?.bindings)) throw new Error('rollback version metadata unavailable');
      const actual = databaseBindings(version.resources);
      if (actual.length !== expected.length) throw new Error('rollback version has an unexpected database binding');
      for (const entry of expected) {
        if (!actual.some(row => row.name === entry.binding && row.id === entry.hyperdriveId)) {
          throw new Error('rollback would cross database planes; retain the write fence and reconcile');
        }
        if (checked.has(entry.hyperdriveId)) continue;
        const config = (await api.get(account + '/hyperdrive/configs/' + entry.hyperdriveId)).result;
        const evidence = hyperdriveEvidence(config, {hyperdrive:entry.hyperdriveId,branch:destination.branchId,origin:destination.originSha256});
        if (!evidence.idMatches || entry.hyperdriveId !== destination.connectors[entry.expectedRoleKey] || entry.hyperdriveId === destination.isolatedAdminConnector
          || !evidence.originMatches || !evidence.branchMatches || evidence.scopedRole !== entry.expectedRoleKey
          || !evidence.cacheDisabled || !evidence.verifyFullAndCaConfigured) throw new Error('rollback database identity unverified');
        checked.add(entry.hyperdriveId);
      }
    }
  }
  if (checked.size !== 4) throw new Error('rollback role connector inventory incomplete');
}
