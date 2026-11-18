import fs from 'node:fs';
import { createReadOnlyClient, databaseBindings, hyperdriveEvidence } from './lythaus-new-core-isolation-review.mjs';
import { parseProductionDeploymentState } from './resolve-production-version-state.mjs';

export const transition = JSON.parse(fs.readFileSync(new URL('../../infrastructure/cloudflare/production-database-transition.json', import.meta.url)));

const consumers = {
  'lythaus-public-api': { DB_APP_FRESH: 'lythaus_runtime' },
  'lythaus-admin-api': { DB_ADMIN_FRESH: 'lythaus_admin', DB_PRIVACY_FRESH: 'lythaus_privacy' },
  'lythaus-jobs': { DB_JOBS_FRESH: 'lythaus_jobs', DB_PRIVACY_FRESH: 'lythaus_privacy' },
  'lythaus-auth-acceptance-coordinator': { DB_ADMIN_FRESH: 'lythaus_admin' },
};

export function validateProductionDatabaseMap(manifest, configs, plan = transition, requireDestination = false) {
  const replacement = manifest.planetScaleDatabase === plan.destination.database;
  const target = replacement ? plan.destination : plan.rollback;
  if (requireDestination && !replacement) throw new Error('new-core production cutover pins are pending');
  if (manifest.planetScaleOrganization !== plan.organization || manifest.accountId !== plan.accountId
    || manifest.planetScaleDatabase !== target.database || manifest.planetScaleDatabaseId !== target.databaseId
    || manifest.productionTargetBranch !== plan.branch || manifest.productionBranchId !== target.branchId
    || manifest.expectedMainOriginFingerprint !== target.originSha256) throw new Error('production database identity differs from the reviewed target');

  const roles = new Set(Object.values(consumers).flatMap(Object.values));
  const ids = new Set();
  for (const role of roles) {
    const id = target.connectors[role];
    if (typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id) || ids.has(id)
      || id === plan.destination.isolatedAdminConnector || (replacement && Object.values(plan.rollback.connectors).includes(id))) {
      throw new Error('missing, shared across roles, or wrong-plane production connector for ' + role);
    }
    ids.add(id);
  }

  const expected = new Set();
  for (const [app, bindings] of Object.entries(consumers)) {
    const configPath = 'apps/' + app + '/wrangler.jsonc';
    const config = configs.get(configPath);
    const worker = app + '-development';
    if (config?.name !== worker || config.vars?.ENVIRONMENT !== 'production'
      || config.hyperdrive?.length !== Object.keys(bindings).length) throw new Error('production Worker configuration differs for ' + app);
    if (replacement && ['lythaus-jobs', 'lythaus-public-api'].includes(app)) {
      if (config.keep_vars !== false || Object.keys(config.vars).some(key => /^MONTHLY_REPUTATION_.*RULES$/.test(key))) {
        throw new Error('optional monthly rules require separate activation');
      }
    }
    for (const [binding, role] of Object.entries(bindings)) {
      expected.add(worker + '/' + binding);
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
      if (!expected.has(config.name + '/' + binding.binding) || configPath !== 'apps/' + config.name.replace(/-development$/, '') + '/wrangler.jsonc') {
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
    const worker = app + '-development';
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
