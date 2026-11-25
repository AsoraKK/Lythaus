import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { verifyExistingGate } from './lythaus-new-core-secret-preflight.mjs';
import { inspectControlRouting } from './control-host-routing.mjs';

export const TARGET = Object.freeze({
  account: 'e5b7ae46e04698f507b7e4b3d4ef1af0', zone: '7bc572c8b7cd3c00be9c655176c29382',
  hostname: 'admin-new-core-test.lythaus.co', worker: 'lythaus-admin-api-new-core-test',
  hyperdrive: '7e39fc4a286147988ed12df7a6322616', branch: 'xwkb9quljkzd',
  origin: '30458dae9a257fc30c567ae95f44975fc766233fb11fc15d2542399bbdcd3558',
  candidate: '3dc46d098242d9dcbca7a98f3272935a34942d3a',
});
const API = 'https://api.cloudflare.com/client/v4';
const ACCOUNT = `/accounts/${TARGET.account}`;
const ZONE = `/zones/${TARGET.zone}`;
const REPOSITORY = new URL('https://github.com/AsoraKK/Lythaus/').pathname.slice(1, -1);
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const fail = code => { throw new Error(code); };
const domains = app => [...new Set([app.domain, app.destination, ...(app.domains ?? []),
  ...(app.self_hosted_domains ?? [])].filter(v => typeof v === 'string').map(v => v.toLowerCase()))];
function coversTarget(value) {
  const hostname = value.split('/')[0];
  return hostname === TARGET.hostname || hostname.startsWith('*.') && TARGET.hostname.endsWith(hostname.slice(1));
}
function emailSelector(value) {
  if (!value || Object.keys(value).length !== 1 || !Object.hasOwn(value, 'email')) return null;
  const email = value.email;
  return typeof email === 'string' ? email : email && Object.keys(email).length === 1 && typeof email.email === 'string' ? email.email : null;
}
export function accessEvidence(apps, policies, expectedOwner) {
  const covering = apps.filter(a => domains(a).some(coversTarget));
  const exact = covering.filter(a => domains(a).length === 1 && domains(a)[0] === TARGET.hostname && a.type === 'self_hosted');
  const app = exact.length === 1 ? exact[0] : null;
  const allow = policies.filter(p => (p.decision ?? p.action) === 'allow');
  const deny = policies.filter(p => ['deny', 'block'].includes(p.decision ?? p.action));
  const owner = allow.length === 1 && allow[0].include?.length === 1 ? emailSelector(allow[0].include[0]) : null;
  const noExtras = p => (p.exclude?.length ?? 0) === 0 && (p.require?.length ?? 0) === 0 && p.enabled !== false;
  const soleHumanPolicy = Boolean(app && covering.length === 1 && policies.length === 2 && owner
    && allow.every(noExtras) && deny.length === 1 && noExtras(deny[0]) && deny[0].include?.length === 1
    && Number.isInteger(allow[0].precedence) && Number.isInteger(deny[0].precedence) && allow[0].precedence < deny[0].precedence
    && Object.keys(deny[0].include[0]).length === 1 && (deny[0].include[0].everyone === true
      || deny[0].include[0].everyone && Object.keys(deny[0].include[0].everyone).length === 0));
  const expectedPresent = typeof expectedOwner === 'string' && /^[^@\s]+@[^@\s]+$/.test(expectedOwner);
  return { exactApplicationCount: exact.length, overlappingApplicationCount: covering.length,
    applicationId: app?.id ?? null, audienceSha256: typeof app?.aud === 'string' ? hash(app.aud) : null,
    soleHumanPolicy, privateOwnerExpectationPresent: expectedPresent,
    intendedOwnerVerified: expectedPresent ? soleHumanPolicy && owner.toLowerCase() === expectedOwner.toLowerCase() : null,
    humanAllowCount: allow.length, denyCount: deny.length,
    bypassOrServicePolicyCount: policies.filter(p => ['bypass','service_auth'].includes(p.decision ?? p.action)).length };
}
export function hyperdriveEvidence(config, target = TARGET) {
  const o = config?.origin ?? {}, user = o.user ?? o.username ?? '';
  const branchMatch = typeof user === 'string' && user.endsWith(`.${target.branch}`);
  const canonical = ['lythaus_migrations','lythaus_admin','lythaus_runtime','lythaus_jobs','lythaus_privacy','lythaus_verifier'];
  const ambiguousUser = o.user !== undefined && o.username !== undefined && o.user !== o.username;
  const role = ambiguousUser ? null : canonical.find(r => user === `${r}.${target.branch}`) ?? null;
  const fingerprint = typeof o.host === 'string' && Number(o.port) === 5432 && o.scheme === 'postgres' && o.database === 'postgres'
    ? hash(JSON.stringify({ scheme:'postgres', host:o.host.toLowerCase(), port:5432, database:'postgres' })) : null;
  return { exists:Boolean(config), idMatches:config?.id === target.hyperdrive, branchMatches:branchMatch,
    originMatches:fingerprint === target.origin, logicalDatabaseMatches:o.database === 'postgres', scopedRole:role,
    scopedAdminLogin:role === 'lythaus_admin', cacheDisabled:config?.caching?.disabled === true,
    verifyFullAndCaConfigured:config?.mtls?.sslmode === 'verify-full' && typeof config.mtls.ca_certificate_id === 'string' && config.mtls.ca_certificate_id.length > 0 };
}
export function databaseBindings(settings) {
  return (settings?.bindings ?? []).filter(b => b.type === 'hyperdrive').map(b => ({ name:b.name, id:b.id }))
    .sort((a,b) => a.name.localeCompare(b.name));
}
function allowedPath(path) {
  if ([`${ACCOUNT}/hyperdrive/configs/${TARGET.hyperdrive}`,`${ACCOUNT}/access/organizations`,
    `${ZONE}`,`${ZONE}/workers/routes`].includes(path)) return true;
  if (new RegExp(`^${ACCOUNT}/access/apps(?:/[a-zA-Z0-9_-]+/policies)?\\?per_page=100&page=[1-9][0-9]?$`).test(path)) return true;
  if (new RegExp(`^${ACCOUNT}/workers/scripts\\?per_page=100&page=[1-9][0-9]?$`).test(path)) return true;
  if (new RegExp(`^${ACCOUNT}/workers/scripts/[a-zA-Z0-9_-]+/(?:settings|deployments|subdomain|versions/[a-f0-9-]+)$`).test(path)) return true;
  return path === `${ZONE}/dns_records?name=${TARGET.hostname}&per_page=100&page=1`;
}
export function createReadOnlyClient(token, fetchImpl = fetch, connectorDiscovery = false) {
  const reads = [];
  const get = async (path, optional = false) => {
    const connectorPath = connectorDiscovery && (new RegExp('^' + ACCOUNT + '/hyperdrive/configs/[a-f0-9]{32}$').test(path)
      || new RegExp('^' + ACCOUNT + '/hyperdrive/configs\\?per_page=100&page=[1-9][0-9]?$').test(path));
    if (!token || !(allowedPath(path) || connectorPath) || reads.length >= 160) fail('isolation_read_scope_blocked');
    reads.push(path);
    const stage = path.includes('/hyperdrive/') ? 'hyperdrive' : path.includes('/policies?') ? 'access_policies'
      : path.includes('/access/apps?') ? 'access_apps' : path.endsWith('/access/organizations') ? 'access_organization'
        : path.endsWith('/settings') ? 'worker_settings' : path.endsWith('/deployments') ? 'worker_deployments'
          : path.endsWith('/subdomain') ? 'worker_subdomain' : path.includes('/versions/') ? 'worker_version'
            : path.includes('/workers/scripts?') ? 'worker_inventory' : path.includes('/dns_records?') ? 'dns'
              : path.endsWith('/workers/routes') ? 'routes' : 'zone';
    let response;
    try { response = await fetchImpl(API + path, { method:'GET', redirect:'error', cache:'no-store',
      headers:{ authorization:`Bearer ${token}`, accept:'application/json' }, signal:AbortSignal.timeout(15000) }); }
    catch { fail(`isolation_provider_${stage}_read_unavailable`); }
    if (optional && response.status === 404) { await response.body?.cancel(); return null; }
    if (response.status !== 200 || response.redirected || response.url && response.url !== API + path) {
      await response.body?.cancel(); fail(`isolation_provider_${stage}_http_${Number(response.status)}`);
    }
    if (!response.body) fail('isolation_provider_body_missing');
    const parts = []; let size = 0;
    for await (const part of response.body) { size += part.byteLength; if (size > 1048576) { await response.body.cancel().catch(()=>{}); fail('isolation_provider_body_oversized'); } parts.push(part); }
    let payload; try { payload = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { fail('isolation_provider_json_invalid'); }
    if (payload?.success !== true || !Object.hasOwn(payload,'result')) fail('isolation_provider_result_invalid');
    return payload;
  };
  const list = async path => {
    const all = [], seen = new Set();
    for (let page=1;page<=10;page++) {
      const payload = await get(`${path}?per_page=100&page=${page}`);
      if (!Array.isArray(payload.result)) fail('isolation_inventory_invalid');
      for (const row of payload.result) { const id = row.id ?? row.name; if (!id || seen.has(id)) fail('isolation_inventory_ambiguous'); seen.add(id); all.push(row); }
      const pages = payload.result_info?.total_pages;
      if (Number.isInteger(pages) && page >= pages || pages === undefined && payload.result.length < 100) return all;
    }
    fail('isolation_inventory_incomplete');
  };
  return { get, list, reads };
}

export async function inspectProductionConnectors({ token, fetchImpl = fetch }) {
  const api = createReadOnlyClient(token, fetchImpl, true);
  const ids = new Set();
  let inventoryComplete = false;
  let total;
  for (let page = 1; page <= 10; page++) {
    const payload = await api.get(ACCOUNT + '/hyperdrive/configs?per_page=100&page=' + page);
    if (!Array.isArray(payload.result)) fail('connector_inventory_invalid');
    for (const item of payload.result) {
      if (!/^[a-f0-9]{32}$/.test(item?.id ?? '') || ids.has(item.id)) fail('connector_inventory_ambiguous');
      ids.add(item.id);
    }
    const info = payload.result_info;
    if (!info || !Number.isInteger(info.total_count)) break;
    if (info.page !== page || info.total_count < 0 || (total !== undefined && info.total_count !== total)
      || info.count !== undefined && info.count !== payload.result.length) fail('connector_inventory_pagination_changed');
    total = info.total_count;
    if (ids.size === total) { inventoryComplete = true; break; }
    if (ids.size > total || !payload.result.length) fail('connector_inventory_count_mismatch');
  }
  const matches = [];
  for (const id of ids) {
    const config = (await api.get(ACCOUNT + '/hyperdrive/configs/' + id)).result;
    if (config?.id !== id) fail('connector_detail_id_changed');
    const evidence = hyperdriveEvidence(config);
    if (!(evidence.originMatches || evidence.branchMatches || id === TARGET.hyperdrive)) continue;
    matches.push({ id, reservedForIsolation:id === TARGET.hyperdrive, exactOrigin:evidence.originMatches,
      exactBranch:evidence.branchMatches, role:evidence.scopedRole, cacheOff:evidence.cacheDisabled,
      verifyFullWithCa:evidence.verifyFullAndCaConfigured });
  }
  const monthlySettings = [];
  for (const worker of ['lythaus-public-api-development','lythaus-jobs-development']) {
    const base = ACCOUNT + '/workers/scripts/' + worker;
    const deployments = (await api.get(base + '/deployments')).result;
    const rows = Array.isArray(deployments) ? deployments : deployments?.deployments;
    if (!Array.isArray(rows) || rows.length < 1 || rows.some(row => !Number.isFinite(Date.parse(row.created_on)))) fail('connector_deployments_invalid');
    const ordered = [...rows].sort((a,b) => Date.parse(b.created_on) - Date.parse(a.created_on));
    if (ordered.length > 1 && Date.parse(ordered[0].created_on) === Date.parse(ordered[1].created_on)) fail('connector_deployments_ambiguous');
    const versions = ordered[0].versions;
    if (!Array.isArray(versions) || versions.length !== 1 || versions[0].percentage !== 100
      || !UUID.test(versions[0].version_id)) fail('connector_serving_version_ambiguous');
    const id = versions[0].version_id;
    const detail = (await api.get(base + '/versions/' + id)).result;
    if (detail?.id !== id || !Array.isArray(detail.resources?.bindings)) fail('connector_version_bindings_missing');
    const selectors = detail.resources.bindings.filter(binding => /^MONTHLY_REPUTATION_.*RULES$/.test(binding.name));
    monthlySettings.push({worker, versionId:id, monthlyRuleBindingCount:selectors.length});
  }
  return {status:'READ_ONLY_DISCOVERY', inventoryComplete, matches, monthlySettings, mutationCount:0};
}
export async function inspectIsolation({ token, expectedOwner, expectedVersionId = '', fetchImpl = fetch }) {
  const api = createReadOnlyClient(token, fetchImpl);
  const config = await api.get(`${ACCOUNT}/hyperdrive/configs/${TARGET.hyperdrive}`,true);
  const apps = await api.list(`${ACCOUNT}/access/apps`);
  const matching = apps.filter(a => domains(a).length === 1 && domains(a)[0] === TARGET.hostname && a.type === 'self_hosted');
  const policies = matching.length === 1 ? await api.list(`${ACCOUNT}/access/apps/${encodeURIComponent(matching[0].id)}/policies`) : [];
  const organization = (await api.get(`${ACCOUNT}/access/organizations`)).result;
  const scripts = await api.list(`${ACCOUNT}/workers/scripts`);
  const names = scripts.map(s => s.id ?? s.name);
  if (names.some(n => typeof n !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(n))) fail('isolation_worker_inventory_invalid');
  if (names.length > 30) fail('isolation_worker_inventory_over_budget');
  const snapshots = [];
  let externalConsumers = 0;
  let externalBindingsComplete = true;
  for (const name of [...new Set([...names,TARGET.worker])].sort()) {
    const settings = await api.get(`${ACCOUNT}/workers/scripts/${name}/settings`, name === TARGET.worker);
    if (!settings) { snapshots.push({ name, exists:false }); continue; }
    const lythaus = name.startsWith('lythaus-');
    const deployment = (await api.get(`${ACCOUNT}/workers/scripts/${name}/deployments`)).result;
    const subdomain = lythaus ? (await api.get(`${ACCOUNT}/workers/scripts/${name}/subdomain`)).result : null;
    const latest = (Array.isArray(deployment) ? deployment : deployment?.deployments)?.[0];
    const serving = [];
    for (const v of latest?.versions ?? []) {
      if (!(v.percentage > 0)) continue;
      if (!UUID.test(v.version_id ?? '')) fail('isolation_serving_version_invalid');
      const metadata = (await api.get(`${ACCOUNT}/workers/scripts/${name}/versions/${v.version_id}`)).result;
      serving.push({ id:v.version_id, percentage:v.percentage,
        bindingsAvailable:Array.isArray(metadata?.resources?.bindings),
        bindings:databaseBindings(metadata?.resources),
        ...(name === TARGET.worker ? { sourceTag:metadata?.annotations?.['workers/tag'] ?? metadata?.metadata?.annotations?.['workers/tag'] ?? null } : {}) });
    }
    if (!lythaus) {
      if (databaseBindings(settings.result).some(b => b.id === TARGET.hyperdrive)
        || serving.some(v => v.bindings.some(b => b.id === TARGET.hyperdrive))) externalConsumers++;
      if (!serving.length || serving.some(v => !v.bindingsAvailable)) externalBindingsComplete = false;
      continue;
    }
    snapshots.push({ name, exists:true, bindings:databaseBindings(settings.result),
      versions:serving,
      workersDevEnabled:subdomain?.enabled, previewUrlsEnabled:subdomain?.previews_enabled,
      ...(name === TARGET.worker ? { settings:settings.result,
        undeployed:Array.isArray(deployment) ? deployment.length === 0 : Array.isArray(deployment?.deployments) && deployment.deployments.length === 0 } : {}) });
  }
  const test = snapshots.find(s => s.name === TARGET.worker);
  const active = test.versions?.filter(v => v.percentage > 0) ?? [];
  const id = active.length === 1 && active[0].percentage === 100 && UUID.test(active[0].id ?? '') ? active[0].id : null;
  const tag = id ? active[0].sourceTag : null;
  const vars = Object.fromEntries((test.settings?.bindings ?? []).filter(b => b.type === 'plain_text').map(b => [b.name,b.text]));
  const issuer = typeof organization?.auth_domain === 'string' ? `https://${organization.auth_domain}` : null;
  const aud = matching.length === 1 ? matching[0].aud : null;
  const accessVarsMatch = Boolean(issuer && aud && vars.ACCESS_TEAM_DOMAIN === organization.auth_domain
    && vars.ACCESS_JWKS_URL === `${issuer}/cdn-cgi/access/certs` && vars.ACCESS_AUDIENCES === aud
    && vars.NEW_CORE_ACCESS_ISSUER === issuer && vars.NEW_CORE_ACCESS_AUDIENCE_SHA256 === hash(aud));
  const zone = (await api.get(ZONE)).result;
  if (zone?.name !== 'lythaus.co' || zone?.account?.id !== TARGET.account) fail('isolation_zone_mismatch');
  const routes = (await api.get(`${ZONE}/workers/routes`)).result;
  const dns = (await api.get(`${ZONE}/dns_records?name=${TARGET.hostname}&per_page=100&page=1`)).result;
  if (!Array.isArray(routes) || !Array.isArray(dns)) fail('isolation_routes_or_dns_invalid');
  const testRoutes = routes.filter(r => r.pattern === `${TARGET.hostname}/*`);
  const access = accessEvidence(apps,policies,expectedOwner), hyperdrive = hyperdriveEvidence(config?.result);
  const expectedBindings = JSON.stringify([{name:'DB_ADMIN_FRESH',id:TARGET.hyperdrive}]);
  const exactBindings = JSON.stringify(test.bindings) === expectedBindings && active.length === 1
    && active[0].bindingsAvailable && JSON.stringify(active[0].bindings) === expectedBindings;
  const verifiedStandby = s => s.name === TARGET.worker && s.undeployed && !s.versions.length &&
    s.workersDevEnabled === false && s.previewUrlsEnabled === false && Array.isArray(s.settings?.bindings) &&
    (!s.bindings.length || JSON.stringify(s.bindings) === expectedBindings);
  const servingBindingsComplete = externalBindingsComplete && snapshots.filter(s => s.exists).every(s => verifiedStandby(s) ||
    s.versions.length > 0 && s.versions.every(v => v.bindingsAvailable));
  const consumers = snapshots.filter(s => s.exists && !verifiedStandby(s) && (s.bindings.some(b => b.id === TARGET.hyperdrive)
    || s.versions.some(v => v.bindings.some(b => b.id === TARGET.hyperdrive)))).map(s => s.name);
  const worker = { exists:test.exists, name:TARGET.worker, servingVersionId:id,
    servingSourceTag:/^[a-f0-9]{40}$/.test(tag ?? '') ? tag : null, sourceTagMatchesCandidate:tag === TARGET.candidate,
    expectedVersionProvided:UUID.test(expectedVersionId), exactVersionPinMatches:UUID.test(expectedVersionId) ? id === expectedVersionId : null,
    soleDatabaseBindingMatches:exactBindings, accessVariablesMatch:accessVarsMatch,
    hmacSecretBindingPresent:(test.settings?.bindings ?? []).some(b => b.type === 'secret_text' && b.name === 'ACCESS_SUBJECT_HMAC_KEY'),
    versionMetadataBindingPresent:(test.settings?.bindings ?? []).some(b => b.type === 'version_metadata' && b.name === 'WORKER_VERSION'),
    workersDevDisabled:test.workersDevEnabled === false, previewUrlsDisabled:test.previewUrlsEnabled === false,
    hostnameAndOriginVarsMatch:vars.EXPECTED_HOSTNAMES === TARGET.hostname && vars.CORS_ALLOWED_ORIGINS === `https://${TARGET.hostname}` };
  const checks = { accessOwner:access.intendedOwnerVerified === true, accessConfiguration:accessVarsMatch,
    workerVersion:worker.exactVersionPinMatches === true && worker.sourceTagMatchesCandidate,
    secretPresence:worker.hmacSecretBindingPresent && worker.versionMetadataBindingPresent,
    binding:exactBindings, origin:hyperdrive.originMatches && hyperdrive.branchMatches && hyperdrive.logicalDatabaseMatches,
    scopedLogin:hyperdrive.scopedAdminLogin, cacheOff:hyperdrive.cacheDisabled, tlsConfigured:hyperdrive.verifyFullAndCaConfigured,
    noPublicFallback:worker.workersDevDisabled && worker.previewUrlsDisabled && worker.hostnameAndOriginVarsMatch,
    exactRoute:testRoutes.length === 1 && testRoutes[0].script === TARGET.worker,
    dns:dns.some(r => r.name === TARGET.hostname && r.proxied === true),
    servingBindingsComplete, exclusiveHyperdrive:servingBindingsComplete && externalConsumers === 0 && consumers.every(name => name === TARGET.worker) };
  const production = snapshots.filter(s => s.name !== TARGET.worker).map(({settings:_settings,...s}) => s);
  const productionRoutes = routes.filter(r => r.pattern !== `${TARGET.hostname}/*`)
    .map(r => ({ id:r.id, pattern:r.pattern, script:r.script })).sort((a,b) => a.pattern.localeCompare(b.pattern));
  return { status:'READ_ONLY_ISOLATION_REVIEW_COMPLETE', readiness:Object.values(checks).every(Boolean) ? 'PINNED_METADATA_CHECKS_PASS' : 'BLOCKED',
    target:TARGET, access, worker, hyperdrive, checks, blockedChecks:Object.keys(checks).filter(k => !checks[k]),
    hyperdriveConsumers:consumers, nonLythausHyperdriveConsumerCount:externalConsumers,
    productionSnapshot:{ workers:production, routes:productionRoutes,
      sha256:hash(JSON.stringify({workers:production,routes:productionRoutes})) },
    mutationCount:0, sqlExecuted:false, bootstrapCalled:false, readCount:api.reads.length,
    caveat:'Metadata tags are source claims and TLS fields show configuration only; artifact provenance, origin TLS/session validation, separate deployment approval and fresh browser acceptance remain required.' };
}
async function gate(env) {
  const result = await verifyExistingGate({env,requireApproval:process.argv[2] !== '--gate'});
  let main,environment; try {
    main = JSON.parse(execFileSync('gh',['api','--method','GET',`repos/${REPOSITORY}/branches/main`],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:20000}));
    environment = JSON.parse(execFileSync('gh',['api','--method','GET',`repos/${REPOSITORY}/environments/production`],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:20000}));
  }
  catch { fail('isolation_main_metadata_unavailable'); }
  if (!main.protected || main.commit?.sha !== env.GITHUB_SHA) fail('isolation_main_changed');
  if (environment.id !== 18972418184) fail('isolation_environment_changed');
  if (env.EXPECTED_WORKER_SOURCE_SHA !== TARGET.candidate) fail('isolation_candidate_changed');
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (!['--gate','--inspect','--discover-connectors'].includes(process.argv[2])) fail('isolation_mode_blocked');
    await gate(process.env);
    const result = process.argv[2] === '--gate' ? { status:'ISOLATION_OWNER_GATE_VERIFIED',providerSecretsAccessed:false }
      : process.argv[2] === '--discover-connectors' ? {
        ...await inspectProductionConnectors({token:process.env.CLOUDFLARE_API_TOKEN}),
        hostRouting:await inspectControlRouting({token:process.env.CLOUDFLARE_API_TOKEN})}
      : await inspectIsolation({token:process.env.CLOUDFLARE_API_TOKEN,expectedOwner:process.env.LYTHAUS_NEW_CORE_OWNER_EMAIL,
        expectedVersionId:process.env.EXPECTED_WORKER_VERSION_ID});
    console.log(JSON.stringify(result));
  } catch(error) { console.error(JSON.stringify({status:'READ_ONLY_ISOLATION_REVIEW_BLOCKED',code:/^[a-z0-9_]+$/.test(error?.message ?? '') ? error.message : 'isolation_review_failed'})); process.exitCode=1; }
}
