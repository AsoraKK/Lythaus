import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createReadOnlyClient, databaseBindings, hyperdriveEvidence, TARGET, verifyIsolationReviewGate } from './lythaus-new-core-isolation-review.mjs';
import { RECORDED_WORKER_ID } from './new-core-isolated-cloudflare.mjs';
import { bindingRepairState, intent, priorRepairState, routed, uuid } from './new-core-isolated-repair-state.mjs';
import { parseProductionDeploymentState, WORKER_VERSION_ID } from './resolve-production-version-state.mjs';

export const transition = JSON.parse(fs.readFileSync(new URL('../../infrastructure/cloudflare/production-database-transition.json', import.meta.url)));

const consumers = {
  'lythaus-public-api': { DB_APP_FRESH: 'lythaus_runtime' },
  'lythaus-admin-api': { DB_ADMIN_FRESH: 'lythaus_admin', DB_PRIVACY_FRESH: 'lythaus_privacy' },
  'lythaus-jobs': { DB_JOBS_FRESH: 'lythaus_jobs', DB_PRIVACY_FRESH: 'lythaus_privacy' },
  'lythaus-auth-acceptance-coordinator': { DB_ADMIN_FRESH: 'lythaus_admin' },
};

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
  if (!uuid.test(access?.applicationId) || !/^[a-f0-9]{64}$/.test(access?.issuerSha256)
    || !/^[a-f0-9]{64}$/.test(access?.audienceSha256)) throw new PromotionSourceError('access_receipt_invalid','isolated owner Access receipt pins required');
  if (!pins || pins.workerId !== RECORDED_WORKER_ID || destination.isolatedAdminConnector !== TARGET.hyperdrive
    || pins.sourceSha !== TARGET.candidate || pins.repairSourceSha !== bindingRepairState.sourceSha
    || pins.servingVersionId !== bindingRepairState.versionId || pins.repairIntent !== bindingRepairState.intentId
    || pins.servingDeploymentId !== bindingRepairState.deploymentId || pins.activationIntent !== bindingRepairState.activationIntent
    || pins.parentVersionId !== routed.ackParent || pins.parentIntent !== routed.parentIntent
    || pins.childVersionId !== routed.ackChild || pins.childIntent !== routed.childIntent || pins.childDeploymentId !== routed.deploymentId
    || pins.priorRepairSourceSha !== priorRepairState.sourceSha || pins.priorRepairVersionId !== priorRepairState.versionId
    || pins.priorRepairIntent !== priorRepairState.intentId || pins.priorRepairActivationIntent !== priorRepairState.activationIntent
    || pins.priorRepairDeploymentId !== priorRepairState.deploymentId
    || !distinctIds([pins.parentVersionId,pins.childVersionId,pins.priorRepairVersionId,pins.servingVersionId],uuid)
    || !distinctIds([pins.parentIntent,pins.childIntent,pins.priorRepairIntent,pins.priorRepairActivationIntent,pins.repairIntent,pins.activationIntent],intent)
    || !distinctIds([pins.childDeploymentId,pins.priorRepairDeploymentId,pins.servingDeploymentId],uuid)) {
    throw new PromotionSourceError('lineage_receipt_invalid','replacement Admin requires the immutable Worker and versions from the isolated setup receipt');
  }
  return pins;
}

function hasIsolatedBindings(bindings, connector) {
  if (!Array.isArray(bindings)) return false;
  const drives = databaseBindings({bindings});
  const keys = bindings.filter(binding => binding.name === 'ACCESS_SUBJECT_HMAC_KEY');
  return bindings.filter(binding => binding.type?.includes('secret')).length === 1 &&
    drives.length === 1 && drives[0].name === 'DB_ADMIN_FRESH' && drives[0].id === connector
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
    [pins.priorRepairVersionId, pins.priorRepairIntent, pins.childVersionId, pins.priorRepairSourceSha],
    [pins.servingVersionId, pins.repairIntent, pins.priorRepairVersionId, pins.repairSourceSha],
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
  if (!Array.isArray(rows) || rows.length !== 3 ||
    !allTraffic(rows[0],pins.servingDeploymentId,pins.servingVersionId) ||
    !allTraffic(rows[1],pins.priorRepairDeploymentId,pins.priorRepairVersionId) ||
    !allTraffic(rows[2],pins.childDeploymentId,pins.childVersionId) ||
    rows[0].annotations?.['workers/message'] !== 'lythaus-isolated-repair ' + pins.activationIntent ||
    rows[1].annotations?.['workers/message'] !== 'lythaus-isolated-repair ' + pins.priorRepairActivationIntent ||
    !(Date.parse(rows[0].created_on) > Date.parse(rows[1].created_on) && Date.parse(rows[1].created_on) > Date.parse(rows[2].created_on))) {
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

export async function inspectPromotionSource({token, expectedVersion, releaseSha, fetchImpl = fetch, destination = transition.destination}) {
  const pins = validateIsolatedVersions(destination);
  if (expectedVersion && expectedVersion !== pins.servingVersionId) throw new Error('isolated_promotion_version_mismatch');
  const account = '/accounts/' + TARGET.account;
  const worker = '/workers/workers/' + pins.workerId;
  const script = '/workers/scripts/' + TARGET.worker;
  const paths = [
    '/access/apps/' + destination.ownerAccess.applicationId, '/access/organizations', worker,
    ...[pins.parentVersionId,pins.childVersionId,pins.priorRepairVersionId,pins.servingVersionId].map(id => worker + '/versions/' + id),
    script + '/deployments', script + '/versions/' + pins.servingVersionId,
  ];
  const client = createReadOnlyClient(token,fetchImpl,false,new Set(paths.map(path => account + path)));
  await verifyIsolatedAdminBeforePromotion(destination,async path => (await client.get(account + path)).result);
  await verifyAdminInventory({pins,current:{versionId:pins.servingVersionId},releaseSha,token,fetchImpl});
  return {status:'ISOLATED_PROMOTION_SOURCE_VERIFIED',workerId:pins.workerId,versionId:pins.servingVersionId,
    deploymentId:pins.servingDeploymentId,sourceSha:pins.repairSourceSha};
}

const subjectKey = 'ACCESS_SUBJECT_HMAC_KEY';
const piiKeys = ['PII_ENCRYPTION_KEY_V1','PII_HMAC_KEY_V1'];
const uploadSecrets = ['CLOUDFLARE_ACCOUNT_ID','DATABASE_READINESS_TOKEN',...piiKeys];

function fullAdminMessage(anchor, previousDeploymentId) {
  return `lythaus-admin ${anchor} ${previousDeploymentId}`;
}

function soleAdminBefore(snapshot) {
  const before = parseProductionDeploymentState(snapshot.deployment,snapshot.versions);
  if (before.serving.length !== 1 || before.zeroTraffic.length || before.serving[0].percentage !== 100) {
    throw new Error('replacement Admin requires an unambiguous current serving version');
  }
  return before.serving[0];
}

function accessSettingsMatch(text, destination) {
  const issuer = 'https://' + text('ACCESS_TEAM_DOMAIN');
  const audience = text('ACCESS_AUDIENCES');
  const hash = value => createHash('sha256').update(value).digest('hex');
  return typeof audience === 'string' && /^[a-f0-9]{64}$/.test(audience) &&
    text('EXPECTED_HOSTNAMES') === 'control.lythaus.co' && text('CORS_ALLOWED_ORIGINS') === 'https://control.lythaus.co' &&
    text('ACCESS_REQUIRE_SIGNED_SUBJECT') === 'true' && text('ACCESS_JWKS_URL') === issuer + '/cdn-cgi/access/certs' &&
    hash(issuer) === destination.ownerAccess.issuerSha256 && hash(audience) === destination.ownerAccess.audienceSha256 &&
    text('CONTROL_ACCESS_ISSUER_SHA256') === destination.ownerAccess.issuerSha256 &&
    text('CONTROL_ACCESS_AUDIENCE_SHA256') === destination.ownerAccess.audienceSha256;
}

function assertFullAdminVersion(version, bindings, id, sourceSha, destination, config) {
  const pins = destination.isolatedAdminVersions;
  const annotations = [version?.annotations,version?.metadata?.annotations].filter(Boolean);
  const named = name => Array.isArray(bindings) ? bindings.filter(b => b.name === name) : [];
  const has = (name, check) => {
    const matches = named(name);
    return matches.length === 1 && check(matches[0]);
  };
  const drives = Array.isArray(bindings) ? databaseBindings({bindings}) : [];
  const secrets = Array.isArray(bindings) ? bindings.filter(b => b.type?.includes('secret')) : [];
  const marker = annotations[0]?.['workers/message'];
  const previousDeploymentId = typeof marker === 'string' ? marker.split(' ')[2] : undefined;
  const text = name => has(name,b => b.type === 'plain_text' && typeof b.text === 'string') ? named(name)[0].text : '';
  const emailService = config.services?.filter(s => s.binding === 'AUTH_EMAIL_ENVELOPE');
  const buckets = config.r2_buckets ?? [];
  if (!WORKER_VERSION_ID.test(previousDeploymentId) || version?.id !== id || !annotations.length || !annotations.every(a => a['workers/tag'] === sourceSha &&
    a['workers/message'] === fullAdminMessage(pins.servingVersionId,previousDeploymentId)) ||
    secrets.length !== uploadSecrets.length + 1 || ![subjectKey,...uploadSecrets].every(name => has(name,b => b.type === 'secret_text' && Object.keys(b).length === 2)) ||
    !has('ASSETS',b => b.type === 'assets') || !has('WORKER_VERSION',b => b.type === 'version_metadata') ||
    emailService?.length !== 1 || emailService[0].entrypoint !== 'AuthEmailEnvelope' || !emailService[0].service ||
    !has('AUTH_EMAIL_ENVELOPE',b => b.type === 'service' && b.service === emailService[0].service && b.entrypoint === emailService[0].entrypoint) ||
    !['AUDIT_ARCHIVE','PRIVATE_EXPORTS'].every(name => {
      const matches = buckets.filter(b => b.binding === name);
      return matches.length === 1 && matches[0].bucket_name && has(name,b => b.type === 'r2_bucket' && b.bucket_name === matches[0].bucket_name);
    }) ||
    !accessSettingsMatch(text,destination) ||
    drives.length !== 2 || !drives.some(b => b.name === 'DB_ADMIN_FRESH' && b.id === destination.connectors.lythaus_admin) ||
    !drives.some(b => b.name === 'DB_PRIVACY_FRESH' && b.id === destination.connectors.lythaus_privacy)) {
    throw new Error('replacement Admin version, inheritance, Access settings or production bindings are unverified');
  }
  return previousDeploymentId;
}

function assertStillServing(deployments, expectedVersion, expectedDeployment) {
  const active = (Array.isArray(deployments) ? deployments : deployments?.deployments)?.[0];
  if (!WORKER_VERSION_ID.test(expectedDeployment) || active?.id !== expectedDeployment ||
    active.versions?.length !== 1 || active.versions[0].version_id !== expectedVersion || active.versions[0].percentage !== 100) {
    throw new Error('replacement Admin serving deployment differs from the predeployment snapshot');
  }
}

async function verifyAdminInventory({pins,current,releaseSha,token,fetchImpl}) {
  // An earlier unacknowledged upload can exist at zero traffic. Reconcile it
  // before another upload, even when the serving deployment has not moved.
  const versionsPath = `/accounts/${TARGET.account}/workers/workers/${pins.workerId}/versions`;
  const pages = Array.from({length:10},(_,i) => versionsPath + '?per_page=100&page=' + (i+1));
  const inventoryClient = createReadOnlyClient(token,fetchImpl,false,new Set(pages));
  const versions = [];
  const validCount = value => Number.isSafeInteger(value) && value >= 0;
  let total, totalPages;
  for (const [index,path] of pages.entries()) {
    const page = index + 1;
    const {result, result_info:info} = await inventoryClient.get(path);
    if (!Array.isArray(result) || !info || info.page !== page || (info.count !== undefined && info.count !== result.length) ||
      (!validCount(info.total_count) && !validCount(info.total_pages)) ||
      (info.total_count !== undefined && !validCount(info.total_count)) || (info.total_pages !== undefined && !validCount(info.total_pages)) ||
      (index > 0 && (info.total_count !== total || info.total_pages !== totalPages))) throw new Error('Admin version inventory pagination is unverified');
    total = info.total_count;
    totalPages = info.total_pages;
    versions.push(...result);
    const countComplete = total === undefined ? undefined : versions.length === total;
    const pagesComplete = totalPages === undefined ? undefined : page === Math.max(1,totalPages);
    if ((countComplete !== undefined && pagesComplete !== undefined && countComplete !== pagesComplete) ||
      (total !== undefined && versions.length > total) || (totalPages !== undefined && page > Math.max(1,totalPages))) throw new Error('Admin version inventory counts do not reconcile');
    if (countComplete || pagesComplete) break;
    if (!result.length || page === pages.length) throw new Error('Admin version inventory is incomplete');
  }
  const latest = versions.find(row => row.id === current.versionId);
  if (current.versionId === pins.servingVersionId) {
    const expected = [pins.parentVersionId,pins.childVersionId,pins.priorRepairVersionId,pins.servingVersionId];
    if (versions.length !== expected.length || !expected.every(id => versions.some(row => row.id === id))) {
      throw new Error('isolated Admin version inventory requires read-only reconciliation');
    }
  }
  if (!latest || !Number.isSafeInteger(latest.number) || latest.number <= 0 ||
    !versions.every(row => WORKER_VERSION_ID.test(row.id) && Number.isSafeInteger(row.number) && row.number > 0 &&
      row.number <= latest.number && (!releaseSha || row.annotations?.['workers/tag'] !== releaseSha)) ||
    new Set(versions.map(row => row.number)).size !== versions.length || new Set(versions.map(row => row.id)).size !== versions.length) {
    throw new Error('previous Admin version upload requires read-only reconciliation');
  }
}

// Never inherit from the latest upload. Every full release explicitly references
// the immutable subject-key binding whose staged request and activation were verified.
export async function prepareReplacementAdminUpload({config, secretNames, snapshot, releaseSha, token,
  fetchImpl = fetch, destination = transition.destination}) {
  const pins = validateIsolatedVersions(destination);
  const containsKey = value => value === subjectKey || (value && typeof value === 'object' &&
    Object.entries(value).some(([key, item]) => key === subjectKey || containsKey(item)));
  if (config.name !== TARGET.worker || (config.account_id !== undefined && config.account_id !== TARGET.account) || config.main !== 'src/control-worker.ts' ||
    config.keep_vars !== false || !accessSettingsMatch(name => config.vars?.[name],destination) || !Array.isArray(secretNames) || !secretNames.every(name => uploadSecrets.includes(name)) ||
    !['DATABASE_READINESS_TOKEN','CLOUDFLARE_ACCOUNT_ID'].every(name => secretNames.includes(name)) ||
    config.unsafe !== undefined || containsKey(config) || !/^[a-f0-9]{40}$/.test(releaseSha)) {
    throw new Error('replacement Admin upload configuration or subject-key override is unverified');
  }
  const current = soleAdminBefore(snapshot);
  const inherit = (name,versionId) => ({name,type:'inherit',version_id:versionId});
  const inherited = [inherit(subjectKey,pins.servingVersionId)];
  const previousDeploymentId = snapshot.observedDeployment?.id;
  assertStillServing([snapshot.observedDeployment],current.versionId,previousDeploymentId);
  if (current.versionId === pins.servingVersionId) {
    if (!piiKeys.every(name => secretNames.includes(name))) throw new Error('first full Admin upload requires the existing protected PII bindings');
    if (current.sourceSha !== pins.repairSourceSha || previousDeploymentId !== pins.servingDeploymentId) throw new Error('isolated Admin snapshot source differs from the promotion receipt');
    await inspectPromotionSource({token,expectedVersion:current.versionId,releaseSha,fetchImpl,destination});
  } else {
    if (secretNames.some(name => piiKeys.includes(name))) throw new Error('existing replacement Admin PII bindings must be inherited');
    inherited.push(...piiKeys.map(name => inherit(name,current.versionId)));
    // Following promotion, require a previously staged full-handler version
    // carrying our exact inheritance marker and both destination bindings.
    const script = `/accounts/${TARGET.account}/workers/scripts/${TARGET.worker}`;
    const deploymentsPath = script + '/deployments';
    const versionPath = script + '/versions/' + current.versionId;
    const client = createReadOnlyClient(token,fetchImpl,false,new Set([deploymentsPath,versionPath]));
    const {result:deployments} = await client.get(deploymentsPath);
    assertStillServing(deployments,current.versionId,previousDeploymentId);
    const {result:version} = await client.get(versionPath);
    assertFullAdminVersion(version,version?.resources?.bindings,current.versionId,current.sourceSha,destination,config);
    await verifyAdminInventory({pins,current,releaseSha,token,fetchImpl});
  }
  return {config:{...config,account_id:TARGET.account,unsafe:{bindings:inherited}},
    message:fullAdminMessage(pins.servingVersionId,previousDeploymentId)};
}

// Confirm the version identified by the upload acknowledgement on both the
// immutable Worker and named script before any candidate traffic operation.
export async function verifyReplacementAdminUpload({versionId, releaseSha, snapshot, config, token, resumeZeroTraffic = false,
  fetchImpl = fetch, destination = transition.destination}) {
  const pins = validateIsolatedVersions(destination);
  const current = soleAdminBefore(snapshot);
  if (!WORKER_VERSION_ID.test(versionId) || !/^[a-f0-9]{40}$/.test(releaseSha) ||
    [pins.parentVersionId,pins.childVersionId,pins.priorRepairVersionId,pins.servingVersionId,current.versionId].includes(versionId)) {
    throw new Error('exact replacement Admin upload acknowledgement required');
  }
  const account = '/accounts/' + TARGET.account;
  const script = account + '/workers/scripts/' + TARGET.worker;
  const immutable = account + '/workers/workers/' + pins.workerId + '/versions/' + versionId;
  const classic = script + '/versions/' + versionId;
  const deploymentsPath = script + '/deployments';
  const client = createReadOnlyClient(token,fetchImpl,false,new Set([immutable,classic,deploymentsPath]));
  const {result:version} = await client.get(immutable);
  const predecessor = assertFullAdminVersion(version,version?.bindings,versionId,releaseSha,destination,config);
  const {result:scriptVersion} = await client.get(classic);
  if (assertFullAdminVersion(scriptVersion,scriptVersion?.resources?.bindings,versionId,releaseSha,destination,config) !== predecessor ||
    (current.versionId === pins.servingVersionId && predecessor !== pins.servingDeploymentId)) {
    throw new Error('replacement Admin version predecessor differs between receipts');
  }
  const {result:deployments} = await client.get(deploymentsPath);
  const history = Array.isArray(deployments) ? deployments : deployments?.deployments;
  const active = history?.[0];
  if (!WORKER_VERSION_ID.test(snapshot.observedDeployment?.id) || active?.id !== snapshot.observedDeployment.id) {
    throw new Error('replacement Admin serving deployment differs from the same-run observation');
  }
  if (resumeZeroTraffic && active?.versions?.length === 2) {
    const staged = active.versions.find(v => v.version_id === versionId && v.percentage === 0);
    const serving = active.versions.find(v => v.version_id === current.versionId && v.percentage === 100);
    if (!staged || !serving || !WORKER_VERSION_ID.test(active.id) || active.id === history[1]?.id ||
      active.annotations?.['workers/message'] !== 'Stage reviewed Lythaus admin candidate at zero traffic' ||
      !(Date.parse(active.created_on) > Date.parse(history[1]?.created_on))) throw new Error('replacement Admin zero-traffic stage differs from prior acceptance');
    assertStillServing(history.slice(1),current.versionId,predecessor);
  } else {
    assertStillServing(deployments,current.versionId,predecessor);
  }
  return {status:'REPLACEMENT_ADMIN_NON_SERVING',workerId:pins.workerId,versionId,sourceSha:releaseSha,
    subjectKeySourceVersionId:pins.servingVersionId,servingVersionId:current.versionId,previousDeploymentId:predecessor};
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
