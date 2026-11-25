import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createReadOnlyClient, databaseBindings, hyperdriveEvidence, TARGET, verifyIsolationReviewGate } from './lythaus-new-core-isolation-review.mjs';
import { RECORDED_WORKER_ID } from './new-core-isolated-cloudflare.mjs';
import { REPAIR_PINS } from './new-core-isolated-repair-pins.mjs';
import { parseProductionDeploymentState } from './resolve-production-version-state.mjs';

export const transition = JSON.parse(fs.readFileSync(new URL('../../infrastructure/cloudflare/production-database-transition.json', import.meta.url)));

const consumers = {
  'lythaus-public-api': { DB_APP_FRESH: 'lythaus_runtime' },
  'lythaus-admin-api': { DB_ADMIN_FRESH: 'lythaus_admin', DB_PRIVACY_FRESH: 'lythaus_privacy' },
  'lythaus-jobs': { DB_JOBS_FRESH: 'lythaus_jobs', DB_PRIVACY_FRESH: 'lythaus_privacy' },
  'lythaus-auth-acceptance-coordinator': { DB_ADMIN_FRESH: 'lythaus_admin' },
};

const versionPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const intentPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
class PromotionSourceError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function distinctIds(ids, pattern) {
  return ids.every(id => typeof id === 'string' && pattern.test(id)) && new Set(ids).size === ids.length;
}
function validateIsolatedVersions(destination) {
  const pins = destination.isolatedAdminVersions;
  const access = destination.ownerAccess;
  if (!versionPattern.test(access?.applicationId) || !/^[a-f0-9]{64}$/.test(access?.issuerSha256)
    || !/^[a-f0-9]{64}$/.test(access?.audienceSha256)) throw new PromotionSourceError('access_receipt_invalid','isolated owner Access receipt pins required');
  if (!pins || pins.workerId !== RECORDED_WORKER_ID || destination.isolatedAdminConnector !== TARGET.hyperdrive
    || pins.sourceSha !== TARGET.candidate || pins.repairSourceSha !== REPAIR_PINS.sourceSha
    || !distinctIds([pins.parentVersionId,pins.childVersionId,pins.servingVersionId],versionPattern)
    || !distinctIds([pins.parentIntent,pins.childIntent,pins.repairIntent,pins.activationIntent],intentPattern)
    || !distinctIds([pins.childDeploymentId,pins.servingDeploymentId],versionPattern)) {
    throw new PromotionSourceError('lineage_receipt_invalid','replacement Admin requires the immutable Worker and versions from the isolated setup receipt');
  }
  return pins;
}

function hasIsolatedBindings(bindings, connector) {
  if (!Array.isArray(bindings)) return false;
  const drives = databaseBindings({bindings});
  const keys = bindings.filter(binding => binding.name === 'ACCESS_SUBJECT_HMAC_KEY');
  return drives.length === 1 && drives[0].name === 'DB_ADMIN_FRESH' && drives[0].id === connector
    && keys.length === 1 && keys[0].type === 'secret_text' && Object.keys(keys[0]).length === 2;
}

export async function verifyIsolatedAdminVersions(destination, read) {
  const pins = validateIsolatedVersions(destination);
  const access = destination.ownerAccess;
  const hash = value => createHash('sha256').update(value).digest('hex');
  const app = await read('/access/apps/' + access.applicationId);
  const org = await read('/access/organizations');
  const team = org?.auth_domain;
  if (app?.id !== access.applicationId || app.type !== 'self_hosted' || !/^[a-f0-9]{64}$/.test(app.aud)
    || hash(app.aud) !== access.audienceSha256 || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/.test(team)
    || hash('https://' + team) !== access.issuerSha256) throw new PromotionSourceError('access_application_changed','isolated owner Access application or issuer differs');
  const path = '/workers/workers/' + pins.workerId;
  const worker = await read(path);
  if (worker?.id !== pins.workerId || worker.name !== TARGET.worker || worker.subdomain?.enabled !== false
    || worker.subdomain?.previews_enabled !== false) throw new PromotionSourceError('isolated_worker_changed','isolated Admin Worker identity or exposure changed');
  let previousNumber = 0;
  for (const [id, intent, parent, source] of [
    [pins.parentVersionId, pins.parentIntent, 'parent', pins.sourceSha],
    [pins.childVersionId, pins.childIntent, pins.parentVersionId, pins.sourceSha],
    [pins.servingVersionId, pins.repairIntent, pins.childVersionId, pins.repairSourceSha],
  ]) {
    const version = await read(path + '/versions/' + id);
    const bindings = version?.bindings;
    const exactText = (name,text) => bindings?.filter(binding=>binding.name===name).length === 1
      && bindings.some(binding=>binding.name===name && binding.type==='plain_text' && binding.text===text);
    if (version?.id !== id || !Number.isSafeInteger(version.number) || version.number <= previousNumber
      || version.annotations?.['workers/tag'] !== source
      || version.annotations?.['workers/message'] !== `lythaus-isolated ${intent} ${parent}`
      || !hasIsolatedBindings(bindings,destination.isolatedAdminConnector)
      || !exactText('NEW_CORE_ACCESS_ISSUER','https://' + team) || !exactText('ACCESS_AUDIENCES',app.aud)
      || !exactText('NEW_CORE_ACCESS_AUDIENCE_SHA256',access.audienceSha256)) {
      throw new PromotionSourceError('immutable_version_mismatch','isolated Admin version, source, subject-key binding or database differs from the reviewed receipt');
    }
    previousNumber = version.number;
  }
}

export async function verifyIsolatedAdminBeforePromotion(destination, read) {
  await verifyIsolatedAdminVersions(destination,read);
  const pins = destination.isolatedAdminVersions;
  const script = '/workers/scripts/' + TARGET.worker;
  const raw = await read(script + '/deployments');
  const rows = Array.isArray(raw) ? raw : raw?.deployments;
  const allTraffic = (row,id,versionId) => row?.id === id && row.versions?.length === 1 &&
    row.versions[0].version_id === versionId && row.versions[0].percentage === 100;
  if (!Array.isArray(rows) || rows.length !== 2 ||
    !allTraffic(rows[0],pins.servingDeploymentId,pins.servingVersionId) ||
    !allTraffic(rows[1],pins.childDeploymentId,pins.childVersionId) ||
    rows[0].annotations?.['workers/message'] !== 'lythaus-isolated-repair ' + pins.activationIntent ||
    !(Date.parse(rows[0].created_on) > Date.parse(rows[1].created_on))) {
    throw new PromotionSourceError('serving_deployment_mismatch','isolated Admin serving deployment differs from the activated repair receipt');
  }
  const version = await read(script + '/versions/' + pins.servingVersionId);
  const tags = [version?.annotations,version?.metadata?.annotations]
    .filter(annotations => annotations && Object.hasOwn(annotations,'workers/tag'))
    .map(annotations => annotations['workers/tag']);
  if (version?.id !== pins.servingVersionId || !tags.length || tags.some(tag => tag !== pins.repairSourceSha) ||
    !hasIsolatedBindings(version.resources?.bindings,destination.isolatedAdminConnector)) {
    throw new PromotionSourceError('serving_script_mismatch','isolated Admin serving script version or bindings differ from the activated repair receipt');
  }
}

export async function inspectPromotionSource({token, expectedVersion, fetchImpl = fetch, destination = transition.destination}) {
  const pins = validateIsolatedVersions(destination);
  if (expectedVersion && expectedVersion !== pins.servingVersionId) throw new Error('isolated_promotion_version_mismatch');
  const account = '/accounts/' + TARGET.account;
  const worker = '/workers/workers/' + pins.workerId;
  const script = '/workers/scripts/' + TARGET.worker;
  const paths = [
    '/access/apps/' + destination.ownerAccess.applicationId, '/access/organizations', worker,
    ...[pins.parentVersionId,pins.childVersionId,pins.servingVersionId].map(id => worker + '/versions/' + id),
    script + '/deployments', script + '/versions/' + pins.servingVersionId,
  ];
  const client = createReadOnlyClient(token,fetchImpl,false,new Set(paths.map(path => account + path)));
  await verifyIsolatedAdminBeforePromotion(destination,async path => (await client.get(account + path)).result);
  return {status:'ISOLATED_PROMOTION_SOURCE_VERIFIED',workerId:pins.workerId,versionId:pins.servingVersionId,
    deploymentId:pins.servingDeploymentId,sourceSha:pins.repairSourceSha};
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
      || config.vars.CONTROL_ACCESS_ISSUER_SHA256 !== target.ownerAccess.issuerSha256
      || config.vars.CONTROL_ACCESS_AUDIENCE_SHA256 !== target.ownerAccess.audienceSha256
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3 || process.argv[2] !== '--inspect-promotion-source' ||
      process.env.PROMOTION_SOURCE_ONLY !== 'true') throw new Error('isolation_mode_blocked');
    await verifyIsolationReviewGate(process.env,true);
    const receipt = await inspectPromotionSource({token:process.env.CLOUDFLARE_API_TOKEN,
      expectedVersion:process.env.EXPECTED_WORKER_VERSION_ID});
    console.log(JSON.stringify(receipt));
  } catch (error) {
    const reason = error?.message ?? '';
    const providerFailure = /^isolation_provider_(?:access_apps|access_organization|worker_details|worker_version|worker_deployments)_(?:http_[1-5][0-9]{2}|read_unavailable)$/;
    const gateFailure = /^(?:isolation_(?:mode_blocked|modes_conflict|candidate_changed|receipt_invalid|main_changed|main_metadata_unavailable|environment_changed|read_scope_blocked|provider_(?:body_missing|body_oversized|result_invalid|json_invalid))|isolated_promotion_version_mismatch|preflight_context_blocked|metadata_read_blocked)$/;
    let code = 'isolated_promotion_source_unverified';
    if (error instanceof PromotionSourceError) code = error.code;
    else if (providerFailure.test(reason) || gateFailure.test(reason)) code = reason;
    console.error(JSON.stringify({status:'ISOLATED_PROMOTION_SOURCE_BLOCKED',code}));
    process.exitCode = 1;
  }
}
