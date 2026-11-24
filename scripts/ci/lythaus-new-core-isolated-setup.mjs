import { createHash, X509Certificate } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { accessEvidence, hyperdriveEvidence, inspectIsolation, TARGET } from './lythaus-new-core-isolation-review.mjs';
import { ACCOUNT, avoidDeniedReadRetries, createSetupClient, DISABLE_INVOCATION_LOGS, DRIVE, ID, RECORDED_WORKER, RECORDED_WORKER_ID, requireSetup as check, SCRIPT, ZONE } from './new-core-isolated-cloudflare.mjs';
import { scriptLoggingEvidence, workerBoundaryEvidence } from './new-core-isolated-worker-boundary.mjs';

const BASELINE = 'ecaecf69d5fae1edfd63ed54561c12abff3ee7ac01ecac8dc034417703e2ee19';
const USER = `lythaus_admin.${TARGET.branch}`;
const ROUTE = `${TARGET.hostname}/*`;
const RESUME_ACCESS_ID = 'edd1c92d-bb85-4cd3-b31b-5971a7b12d13';
const TEST_ACCESS_NAME = 'Lythaus New Core Admin Test';
const PROD_APPS = [
  {id:'2d440b64-6cde-48d7-b3cb-132129ee036f', name:'Lythaus Admin UI', host:'admin.lythaus.co'},
  {id:'fa6906cc-3daf-4beb-82b5-143e708eca0d', name:'Lythaus Admin API', host:'admin-api.lythaus.co'},
];
const testRecord = {type:'A', name:TARGET.hostname, content:'192.0.2.1', ttl:1, proxied:true};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sortIds = rows => [...rows].sort((a,b) => a.id.localeCompare(b.id));
const equal = isDeepStrictEqual;
const email = value => typeof value === 'string' && /^[^@\s]+@[^@\s]+$/.test(value);
const dnsRecordMatches = row => Object.entries(testRecord).every(([k,v])=>row[k] === v);

function appDomains(app) {
  const modern = (app.destinations ?? []).flatMap(d => {
    if (d.type === 'private') return [];
    check(d.type === 'public' && typeof d.uri === 'string','access_destination_unknown');
    return [d.uri];
  });
  return [...new Set([app.domain, app.destination, ...(app.domains ?? []), ...(app.self_hosted_domains ?? []), ...modern]
    .filter(v => v != null).map(v => {
      check(typeof v === 'string', 'access_domain_invalid');
      return v.toLowerCase();
    }))];
}
function matchesHost(value, host = TARGET.hostname) {
  check(typeof value === 'string', 'host_pattern_invalid');
  const domain = value.toLowerCase().replace(/^https?:\/\//,'').split('/')[0];
  const escaped = domain.split('*').map(v => v.replace(/[^a-z0-9-]/g, c => `\\${c}`)).join('.*');
  return new RegExp(`^${escaped}$`).test(host);
}
function privateOwner(policies) {
  const allows = policies.filter(p => p.decision === 'allow');
  const p = allows[0], selector = p?.include?.[0], entry = selector?.email;
  const value = typeof entry === 'string' ? entry : entry?.email;
  const blocks = policies.filter(p => ['deny','block'].includes(p.decision));
  check(allows.length === 1 && p.enabled !== false && p.include?.length === 1
    && Object.keys(selector ?? {}).length === 1 && (typeof entry === 'string' || Object.keys(entry ?? {}).length === 1)
    && email(value) && !(p.exclude?.length || p.require?.length)
    && policies.every(p=>['allow','deny','block','non_identity','service_auth'].includes(p.decision))
    && blocks.some(d=>d.enabled !== false && d.include?.some(i=>Object.hasOwn(i,'everyone'))
      && !(d.exclude?.length || d.require?.length) && d.precedence > p.precedence),'production_owner_policy');
  return value.toLowerCase();
}
async function accessSnapshot(api) {
  const apps = await api.list(`${ACCOUNT}/access/apps`);
  const live = [];
  for (const expected of PROD_APPS) {
    const covering = apps.filter(a=>appDomains(a).some(d=>matchesHost(d,expected.host)));
    const app = covering[0];
    check(covering.length === 1 && app.type === 'self_hosted' && app.id === expected.id && app.name === expected.name
      && equal(appDomains(app),[expected.host]), 'production_access_identity');
    const policies = sortIds(await api.list(`${ACCOUNT}/access/apps/${app.id}/policies`));
    live.push({app,policies,owner:privateOwner(policies)});
  }
  check(live[0].owner === live[1].owner, 'production_owner_diverged');
  const idps = live[0].app.allowed_idps ?? [];
  check(Array.isArray(idps) && idps.every(id=>ID.test(id)) && new Set(idps).size === idps.length, 'production_login_settings');
  const org = await api.request(`${ACCOUNT}/access/organizations`);
  check(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/.test(org?.auth_domain ?? ''),'team_issuer');
  return {apps,live,owner:live[0].owner,idps:[...idps].sort(),issuer:`https://${org.auth_domain}`};
}
const testApps = apps => apps.filter(a=>appDomains(a).some(d=>matchesHost(d)));
function cookiePathShape(app) {
  if (!app) return 'app_missing';
  if (!Object.hasOwn(app,'path_cookie_attribute')) return 'omitted';
  if (app.path_cookie_attribute === false) return 'disabled';
  if (app.path_cookie_attribute === true) return 'enabled';
  if (app.path_cookie_attribute === null) return 'null';
  return 'malformed';
}
function testAccessChecks(app, apps, context, id, resumeAccess) {
  const exactHostname = !!app && equal(appDomains(app),[TARGET.hostname]);
  const publicDestinationsNoOverrides = !!app && (app.destinations ?? []).every(d=>d.type === 'public' && !Object.keys(d.overrides ?? {}).length);
  const omittedOnRecordedPathlessApp = resumeAccess && cookiePathShape(app) === 'omitted' && id === RESUME_ACCESS_ID && app?.id === id
    && app.type === 'self_hosted' && exactHostname && publicDestinationsNoOverrides
    && [app.destinations,app.domains,app.self_hosted_domains].every(values=>values == null || (Array.isArray(values) && values.length <= 1));
  return {
    id: app?.id === id,
    name: app?.name === TEST_ACCESS_NAME,
    type: app?.type === 'self_hosted',
    sessionDuration: app?.session_duration === '1h',
    httpOnlyCookie: app?.http_only_cookie_attribute === true,
    pathCookie: app?.path_cookie_attribute === false || omittedOnRecordedPathlessApp,
    sameSiteCookie: typeof app?.same_site_cookie_attribute === 'string' && app.same_site_cookie_attribute.toLowerCase() === 'lax',
    noPreflightBypass: app?.options_preflight_bypass !== true,
    noWarpBypass: app?.allow_authenticate_via_warp !== true,
    exactHostname,
    publicDestinationsNoOverrides,
    allowedIdentityProviders: !!app && Array.isArray(app.allowed_idps ?? []) && equal([...(app.allowed_idps ?? [])].sort(),context.idps),
    validAudience: typeof app?.aud === 'string' && /^[a-f0-9]{64}$/.test(app.aud),
    uniqueAudience: !!app && apps.every(a=>a.id === id || a.aud !== app.aud),
  };
}
const checksPass = checks => Object.values(checks).every(v=>v === true);
const safeSetupCode = (error, otherwise) => /^(?:setup_[a-z0-9_]{1,100}|isolation_[a-z0-9_]{1,100}|WORKER_[A-Z_]{1,90})$/.test(error?.message ?? '')
  ? error.message : otherwise;
async function testAccessReadback(api, context, id, owner, {diagnostic=false,resumeAccess=false} = {}) {
  const apps = diagnostic ? context.apps : await api.list(`${ACCOUNT}/access/apps`);
  const matching = testApps(apps);
  const listed = matching[0];
  const listing = {soleCoveringApp:matching.length === 1,...testAccessChecks(listed,apps,context,id,resumeAccess)};
  const listingIdentity = listing.soleCoveringApp && listing.id && listing.type && listing.exactHostname
    && listing.validAudience && listing.uniqueAudience;
  const severityKeys = {
    name:'name',sessionDuration:'session_duration',httpOnlyCookie:'http_only_cookie_attribute',
    pathCookie:'path_cookie_attribute',sameSiteCookie:'same_site_cookie_attribute',allowedIdentityProviders:'allowed_idps',
  };
  const listingSettingsConsistent = !!listed && listing.publicDestinationsNoOverrides && listing.noPreflightBypass && listing.noWarpBypass
    && Object.entries(severityKeys).every(([key,field])=>!Object.hasOwn(listed,field) || listing[key]);
  const report = {listing:{...listing,settingsConsistent:listingSettingsConsistent}, details:null, policies:null, errors:[],
    cookiePathReadback:{listing:cookiePathShape(listed),details:'not_read'}};
  if (!listingIdentity) return {report, app:null};
  let app;
  try {
    app = await api.request(`${ACCOUNT}/access/apps/${id}`);
    report.cookiePathReadback.details = cookiePathShape(app);
    report.details = {...testAccessChecks(app,apps,context,id,resumeAccess),audienceMatchesListing:app?.aud === listed.aud};
  } catch (error) {
    report.errors.push(safeSetupCode(error,'setup_test_access_details_unverified'));
  }
  if (diagnostic || (listingSettingsConsistent && report.details && checksPass(report.details))) {
    try {
      const policies = await api.list(`${ACCOUNT}/access/apps/${id}/policies`);
      const evidence = accessEvidence([{...listed,domain:TARGET.hostname}],policies,owner);
      report.policies = {ownerOnly:evidence.intendedOwnerVerified === true,
        allowFirst:policies.some(p=>p.decision === 'allow' && p.precedence === 1),
        denySecond:policies.some(p=>['deny','block'].includes(p.decision) && p.precedence === 2)};
    } catch (error) {
      report.errors.push(safeSetupCode(error,'setup_test_access_policies_unverified'));
    }
  }
  return {report,app};
}
async function readTestAccess(api, context, id, owner, resumeAccess) {
  const {report,app} = await testAccessReadback(api,context,id,owner,{resumeAccess});
  check(report.listing.settingsConsistent && report.details && checksPass(report.details), 'test_access_app_readback');
  check(report.policies && checksPass(report.policies), 'test_access_policies_readback');
  return app;
}
async function productionPages(api) {
  const projects = await api.listPagesProjects();
  check(projects.every(p=>Array.isArray(p.domains)) && projects.every(p=>!p.domains.some(d=>matchesHost(d))), 'pages_hostname_collision');
  const pages = projects.find(p=>p.name === 'lythaus-control-panel');
  check(pages?.id === '93ac4df5-86c3-4986-93ea-74650e9f35d4' && pages.domains.includes('admin.lythaus.co')
    && pages.production_branch === 'main' && typeof pages.canonical_deployment?.id === 'string','production_pages_identity');
  return {projectCount:projects.length,id:pages.id,domains:[...pages.domains].sort(),deployment:pages.canonical_deployment.id};
}
async function networkSnapshot(api) {
  const pages = await productionPages(api);
  const domains = await api.request(`${ACCOUNT}/workers/domains?hostname=${TARGET.hostname}`);
  check(Array.isArray(domains) && domains.length === 0, 'worker_custom_domain_collision');
  const packs = await api.list(`${ZONE}/ssl/certificate_packs`);
  check(packs.some(p=>p.status === 'active' && p.hosts?.some(h=>h === TARGET.hostname || h === '*.lythaus.co')), 'edge_certificate_coverage');
  const prodDns = await api.dns('admin.lythaus.co');
  check(prodDns.length > 0, 'production_dns_missing');
  check((await api.dns('*.lythaus.co')).length === 0, 'wildcard_dns_collision');
  return {pages,prodDns:sortIds(prodDns)};
}
async function routes(api) {
  const rows = await api.request(`${ZONE}/workers/routes`);
  check(Array.isArray(rows), 'route_inventory');
  return rows.filter(r=>matchesHost(r.pattern));
}
async function emptyRouting(api) {
  check((await routes(api)).length === 0 && (await api.dns(TARGET.hostname)).length === 0,'test_routing_collision');
}
function checkCa(ca) {
  check(ca?.pem && /^[a-f0-9]{64}$/.test(ca.sha256),'issuer_ca_unverified');
  const digest = pem => {
    try {
      check(typeof pem === 'string' && !pem.includes('PRIVATE KEY') && pem.match(/BEGIN CERTIFICATE/g)?.length === 1,'issuer_ca_invalid');
      const cert = new X509Certificate(pem);
      check(cert.ca, 'issuer_ca_invalid');
      return sha(cert.raw);
    } catch { throw new Error('setup_issuer_ca_invalid'); }
  };
  check(digest(ca.pem) === ca.sha256 && (ca.id === null || ID.test(ca.id)), 'issuer_ca_mismatch');
  return digest;
}
async function readCa(api, ca, id) {
  const digest = checkCa(ca);
  check(ID.test(id ?? ''),'issuer_ca_id_missing');
  const row = await api.request(`${ACCOUNT}/mtls_certificates/${id}`);
  const source = row?.certificates;
  const pattern = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g;
  const fingerprints = typeof source === 'string' && !source.replace(pattern,'').trim()
    ? (source.match(pattern) ?? []).map(digest).sort() : [];
  check(row?.id === id && row.ca === true && fingerprints.includes(ca.sha256)
    && equal(fingerprints,ca.caFingerprints ?? [ca.sha256]),'issuer_ca_readback');
  return id;
}
async function verifiedCa(api, ca) {
  if (ca.id) return readCa(api,ca,ca.id);
  const fresh = await api.request(`${ACCOUNT}/mtls_certificates`, {method:'POST',body:{name:'lythaus-new-core-origin-issuer',ca:true,certificates:ca.pem}});
  return readCa(api,ca,fresh?.id);
}
function checkOrigin(config, caId) {
  const hd = hyperdriveEvidence(config);
  check(hd.idMatches && hd.originMatches && hd.branchMatches && hd.logicalDatabaseMatches && hd.cacheDisabled
    && !config.origin.access_client_id && !config.origin.access_client_secret && !config.origin.vpc_service_id
    && !config.mtls?.mtls_certificate_id,'hyperdrive_identity');
  if (caId) check(hd.scopedAdminLogin && hd.verifyFullAndCaConfigured && config.mtls.ca_certificate_id === caId,'scoped_hyperdrive_readback');
}
function checkSnapshot(report, consumers) {
  check(report.productionSnapshot?.sha256 === BASELINE && report.checks?.servingBindingsComplete && report.checks.exclusiveHyperdrive
    && report.nonLythausHyperdriveConsumerCount === 0 && equal(report.hyperdriveConsumers,consumers), 'live_isolation_or_production_drift');
}

function resolveOwner(env, approval, context) {
  return env.LYTHAUS_NEW_CORE_OWNER_EMAIL || (approval.ownerSelectorConfirmedByOwner === true ? context?.owner : undefined);
}
async function inspectRecordedWorker({api, expectedOwner, token, fetchImpl, ca}) {
  const errors = [];
  async function read(label, operation) {
    try { return await operation(); }
    catch (error) { errors.push(safeSetupCode(error,label)); return null; }
  }
  const worker = await read('setup_recorded_worker_details_unverified',()=>api.request(RECORDED_WORKER));
  if (worker == null) return {worker:null,errors};
  const evidence = workerBoundaryEvidence(worker,RECORDED_WORKER_ID,TARGET.worker);
  if (!evidence.checks.identity) return {worker:evidence,errors:['setup_recorded_worker_identity']};
  const [versionsEmpty, deploymentsEmpty, subdomain, logging, routingEmpty, customDomainEmpty, hyperdrive, productionBaselineMatches] = await Promise.all([
    read('setup_recorded_worker_versions_unverified',async ()=>(await api.list(`${RECORDED_WORKER}/versions`)).length === 0),
    read('setup_recorded_worker_deployments_unverified',async ()=>{
      const result = await api.request(`${SCRIPT}/deployments`);
      const list = Array.isArray(result) ? result : result?.deployments;
      check(Array.isArray(list),'recorded_worker_deployments_shape');
      return list.length === 0;
    }),
    read('setup_recorded_worker_subdomain_unverified',async ()=>{
      const row = await api.request(`${SCRIPT}/subdomain`);
      const result = workerBoundaryEvidence({subdomain:row});
      return {workersDev:result.fieldShapes.workersDev,previews:result.fieldShapes.previews};
    }),
    read('setup_recorded_worker_script_settings_unverified',async ()=>{
      const row = await api.request(`${SCRIPT}/script-settings`);
      const {workersDev:_workersDev,previews:_previews,customDomains:_customDomains,deployedOn:_deployedOn,...shapes} =
        workerBoundaryEvidence(row).fieldShapes;
      return shapes;
    }),
    read('setup_recorded_worker_routing_unverified',async ()=>{ await emptyRouting(api); return true; }),
    read('setup_recorded_worker_custom_domain_unverified',async ()=>{
      const result = await api.request(`${ACCOUNT}/workers/domains?hostname=${TARGET.hostname}`);
      check(Array.isArray(result),'recorded_worker_custom_domain_shape');
      return result.length === 0;
    }),
    read('setup_recorded_worker_hyperdrive_unverified',async ()=>{
      const config = await api.request(DRIVE);
      const drive = hyperdriveEvidence(config);
      const exactVerifiedCa = !!ca?.id && config?.mtls?.ca_certificate_id === ca.id;
      const caReadbackPassed = exactVerifiedCa && await readCa(api,ca,ca.id) === ca.id;
      checkOrigin(config,caReadbackPassed ? ca.id : undefined);
      return {scopedAdminLogin:drive.scopedAdminLogin,verifiedTlsConfigured:drive.verifyFullAndCaConfigured,
        cacheDisabled:drive.cacheDisabled,caReadbackPassed,restartTimestampPresent:Number.isFinite(Date.parse(config.restarted_on))};
    }),
    read('setup_recorded_worker_production_baseline_unverified',async ()=>{
      checkSnapshot(await inspectIsolation({token,expectedOwner,fetchImpl}),[]);
      return true;
    }),
  ]);
  return {worker:evidence,versionsEmpty,deploymentsEmpty,subdomain,logging,routingEmpty,customDomainEmpty,hyperdrive,
    productionBaselineMatches,errors:[...new Set(errors)].sort()};
}
export async function inspectSetupInputs({env, sourceDir, authorize}) {
  const approval = await authorize();
  const {collectAdminInputs} = await import('./lythaus-new-core-admin-inputs.mjs');
  const errors = [];
  let context, pages, api;
  const get = avoidDeniedReadRetries((url, init) => {
    check(init?.method === 'GET','inspect_read_only');
    return fetch(url, init);
  });
  if (env.CLOUDFLARE_API_TOKEN) {
    api = createSetupClient({token:env.CLOUDFLARE_API_TOKEN,fetchImpl:get,record:()=>check(false,'inspect_read_only')});
    try { context = await accessSnapshot(api); } catch { errors.push('setup_owner_policy_unverified'); }
    try { pages = await productionPages(api); } catch (error) {
      errors.push(/^setup_(?:pages_[a-z0-9_]+|production_pages_identity)$/.test(error.message) ? error.message : 'setup_pages_unverified');
    }
  }
  const owner = resolveOwner(env,approval,context);
  const ownerMatches = email(owner) && context ? owner.toLowerCase() === context.owner : null;
  if (ownerMatches === false) errors.push('setup_private_owner_selector_mismatch');
  let existingTestAccess = null;
  if (context) try {
    if (testApps(context.apps).length || context.apps.some(a=>a.id === RESUME_ACCESS_ID)) {
      const {report} = await testAccessReadback(api,context,RESUME_ACCESS_ID,owner,{diagnostic:true,resumeAccess:true});
      existingTestAccess = report;
      if (!report.listing.settingsConsistent || !report.details || !checksPass(report.details)) errors.push('setup_test_access_app_readback');
      if (!report.policies || !checksPass(report.policies)) errors.push('setup_test_access_policies_readback');
    }
  } catch (error) { errors.push(safeSetupCode(error,'setup_test_access_unverified')); }
  let ca;
  const result = await collectAdminInputs({env,sourceDir,expectedOwner:owner,fetchImpl:get,onVerifiedCa:result=>{ca=result;},
    privateCredentialConfirmed:approval.privateCredentialConfirmed,
    existingPlanConfirmedByOwner:approval.existingPlanConfirmedByOwner === true});
  const recordedWorker = api ? await inspectRecordedWorker({api,expectedOwner:owner,token:env.CLOUDFLARE_API_TOKEN,fetchImpl:get,ca}) : null;
  return {...result,ready:result.ready && !!pages && ownerMatches === true && !errors.length,
    ownerMatchesReviewedSelector:ownerMatches, pagesInventoryComplete:!!pages, pagesProjectsChecked:pages?.projectCount ?? null,
    existingTestAccess,recordedWorker,
    errors:[...result.errors,...errors]};
}
export async function runIsolatedSetup({env, sourceDir, artifactDir, authorize, record, resumeAccess=false, resumeWorker=false}) {
  resumeAccess ||= resumeWorker;
  check(typeof authorize === 'function' && typeof record === 'function','reviewed_entrypoint_required');
  const approval = await authorize();
  const {loadArtifacts, stageWorker, verifyWorkerVersion} = await import('./new-core-isolated-worker.mjs');
  const {collectAdminInputs} = await import('./lythaus-new-core-admin-inputs.mjs');
  const fetchImpl = avoidDeniedReadRetries();
  const api = createSetupClient({token:env.CLOUDFLARE_API_TOKEN, record, fetchImpl,resumeWorker});
  const blocked = [];
  async function probe(label, operation) {
    try { return await operation(); }
    catch (error) {
      blocked.push(safeSetupCode(error,label));
      return null;
    }
  }
  const artifacts = await probe('setup_approved_build_unavailable',()=>loadArtifacts({sourceDir,artifactDir}));
  const context = await probe('setup_access_snapshot_unavailable',()=>accessSnapshot(api));
  const owner = resolveOwner(env,approval,context);
  if (owner && context && owner.toLowerCase() !== context.owner) blocked.push('setup_private_owner_selector_mismatch');
  const args = {env, expectedOwner:owner, existingPlanConfirmedByOwner:approval.existingPlanConfirmedByOwner === true,
    privateCredentialConfirmed:approval.privateCredentialConfirmed, sourceDir,fetchImpl};
  let ca;
  const initial = await collectAdminInputs({...args,onVerifiedCa:result=>{ca=result;}});
  if (!initial.ready) blocked.push('setup_private_inputs_incomplete');
  if (ca) await probe('setup_public_ca_readback',async () => {
    checkCa(ca);
    if (ca.id) await readCa(api,ca,ca.id);
  });
  const inspect = expectedVersionId => inspectIsolation({token:env.CLOUDFLARE_API_TOKEN, expectedOwner:owner, expectedVersionId,fetchImpl});
  await probe('setup_live_isolation_unavailable', async () => {
    const base = await inspect();
    checkSnapshot(base,[]);
    check((resumeWorker || base.worker.exists === false) && base.access.overlappingApplicationCount === (resumeAccess ? 1 : 0),'isolated_resources_exist');
  });
  if (!resumeWorker) await probe('setup_recorded_worker_inventory_unverified',async ()=>{
    try { await api.request(RECORDED_WORKER); }
    catch (error) {
      if (error.message === 'setup_recorded_worker_details_http_404') return;
      throw error;
    }
    check(false,'recorded_worker_already_exists');
  });
  if (context && !resumeAccess && testApps(context.apps).length) blocked.push('setup_isolated_access_exists');
  if (context && resumeAccess) await probe('setup_test_access_resume_unverified',()=>readTestAccess(api,context,RESUME_ACCESS_ID,owner,true));
  const network = await probe('setup_network_inventory',()=>networkSnapshot(api));
  await probe('setup_routing_inventory',()=>emptyRouting(api));
  const current = await probe('setup_hyperdrive_inventory',async ()=>{
    const value = await api.request(DRIVE);
    checkOrigin(value);
    return value;
  });
  let password;
  if (current && initial.admin.verified) await probe('setup_private_admin_url_invalid',()=>{
    const url=new URL(env.LYTHAUS_NEW_CORE_ADMIN_DATABASE_URL);
    password=decodeURIComponent(url.password);
    check(['postgres:','postgresql:'].includes(url.protocol) && decodeURIComponent(url.username) === USER
      && url.hostname === current.origin.host && Number(url.port || 5432) === 5432 && url.pathname === '/postgres' && password, 'private_admin_target_mismatch');
  });
  if (blocked.length) return {status:'ISOLATED_SETUP_BLOCKED', inputChecks:initial, blocked:[...new Set(blocked)], bootstrapCalled:false};
  check(email(owner) && ca && password, 'private_inputs_missing');
  const second = await authorize();
  check(second.ownerSelectorConfirmedByOwner === approval.ownerSelectorConfirmedByOwner
    && second.privateCredentialConfirmed === approval.privateCredentialConfirmed
    && second.existingPlanConfirmedByOwner === approval.existingPlanConfirmedByOwner, 'owner_review_changed');
  const access = resumeAccess ? {id:RESUME_ACCESS_ID} : await api.request(`${ACCOUNT}/access/apps`, {method:'POST',body:{
    name:TEST_ACCESS_NAME,type:'self_hosted',domain:TARGET.hostname,session_duration:'1h',
    http_only_cookie_attribute:true,path_cookie_attribute:false,same_site_cookie_attribute:'lax',
    allowed_idps:context.idps, app_launcher_visible:false, options_preflight_bypass:false,allow_authenticate_via_warp:false,
    policies:[
      {name:'Allow intended owner',decision:'allow',precedence:1,include:[{email:{email:owner}}],exclude:[],require:[]},
      {name:'Block everyone else',decision:'deny',precedence:2,include:[{everyone:{}}],exclude:[],require:[]},
    ],
  }});
  check(ID.test(access?.id ?? ''),'test_access_id_missing');
  const app = await readTestAccess(api,context,access.id,owner,resumeAccess);
  if (resumeWorker) check(ca.id,'recorded_worker_existing_ca_required');
  const caId = await verifiedCa(api,ca);
  checkSnapshot(await inspect(),[]);
  const old = await api.request(DRIVE);
  checkOrigin(old,resumeWorker ? caId : undefined);
  check(equal(old,current),'hyperdrive_changed');
  if (resumeWorker) {
    const receipt = await inspectRecordedWorker({api,expectedOwner:owner,token:env.CLOUDFLARE_API_TOKEN,fetchImpl,ca});
    check(receipt.worker && Object.entries(receipt.worker.checks).every(([key,value])=>value === (key !== 'invocationLogsNotEnabled'))
      && receipt.worker.fieldShapes.invocationLogs === 'true' && receipt.worker.fieldShapes.deployedOn === 'null'
      && ['logs','traces'].every(key=>receipt.worker.fieldShapes[key] === 'false')
      && ['agents','issues'].every(key=>receipt.worker.fieldShapes[key] === 'omitted')
      && receipt.subdomain?.workersDev === 'false' && receipt.subdomain.previews === 'false'
      && receipt.logging?.logpush === 'false' && receipt.logging.tailConsumers === 'null'
      && ['observability','logs','invocationLogs','traces','agents','issues'].every(key=>receipt.logging[key] === 'omitted')
      && receipt.versionsEmpty && receipt.deploymentsEmpty && receipt.routingEmpty && receipt.customDomainEmpty
      && receipt.productionBaselineMatches && receipt.hyperdrive && checksPass(receipt.hyperdrive)
      && !receipt.errors.length, 'recorded_worker_checkpoint_changed');
    await api.request(`${SCRIPT}/script-settings`,{method:'PATCH',body:DISABLE_INVOCATION_LOGS});
    const repaired = workerBoundaryEvidence(await api.request(RECORDED_WORKER),RECORDED_WORKER_ID,TARGET.worker);
    const script = scriptLoggingEvidence(await api.request(`${SCRIPT}/script-settings`));
    const workerDisabled = checksPass(repaired.checks) && repaired.fieldShapes.invocationLogs === 'false'
      && Object.entries(receipt.worker.fieldShapes).every(([key,value])=>key === 'invocationLogs' || repaired.fieldShapes[key] === value);
    if (!workerDisabled || !script.disabled) return {status:'ISOLATED_SETUP_BLOCKED',
      blocked:[...(!workerDisabled?['setup_recorded_worker_patch_readback']:[]),...(!script.disabled?['setup_recorded_script_settings_readback']:[])],
      workerSettingsReadback:{worker:repaired,script},bootstrapCalled:false};
    await emptyRouting(api);
  } else {
    await api.request(DRIVE,{method:'PATCH',body:{origin:{user:USER,password},caching:{disabled:true},mtls:{sslmode:'verify-full',ca_certificate_id:caId}}});
    const configured = await api.request(DRIVE);
    checkOrigin(configured,caId);
    const restart = await api.request(`${DRIVE}/restart`,{method:'POST'});
    checkOrigin(restart,caId);
    const drained = await api.request(DRIVE);
    checkOrigin(drained,caId);
    check(Number.isFinite(Date.parse(drained.restarted_on)) && drained.restarted_on === restart.restarted_on
      && (old.restarted_on == null || Date.parse(old.restarted_on) < Date.parse(drained.restarted_on)), 'pool_restart_readback');
  }
  const stageArgs = {request:api.request, artifacts, issuer:context.issuer, audience:app.aud, journal:async()=>{},
    ...(resumeWorker ? {existingWorkerId:RECORDED_WORKER_ID} : {})};
  const staged = await stageWorker(stageArgs);
  if (resumeWorker) check(staged.workerId === RECORDED_WORKER_ID,'recorded_worker_stage_identity');
  check(staged.tag === TARGET.candidate && ID.test(staged.workerId) && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(staged.versionId), 'staged_identity');
  await verifyWorkerVersion({...stageArgs,...staged});
  const subdomain = await api.request(`${SCRIPT}/subdomain`);
  check(subdomain.enabled === false && subdomain.previews_enabled === false, 'public_fallback');
  const deployments = await api.request(`${SCRIPT}/deployments`);
  const list = Array.isArray(deployments) ? deployments : deployments?.deployments;
  check(Array.isArray(list) && !list.length, 'unexpected_test_deployment');
  await readTestAccess(api,context,access.id,owner,resumeAccess);
  await emptyRouting(api);
  const deployment = await api.request(`${SCRIPT}/deployments`,{method:'POST',body:{strategy:'percentage',versions:[{version_id:staged.versionId,percentage:100}]}});
  check(ID.test(deployment?.id ?? ''), 'deployment_id');
  const serving = await inspect(staged.versionId);
  checkSnapshot(serving,[TARGET.worker]);
  check(Object.entries(serving.checks).every(([k,v])=>['dns','exactRoute'].includes(k) || v === true), 'active_worker_before_route');
  await verifyWorkerVersion({...stageArgs,...staged});
  await emptyRouting(api);
  const dns = await api.request(`${ZONE}/dns_records`,{method:'POST',body:testRecord});
  const actual = await api.dns(TARGET.hostname);
  check(ID.test(dns?.id ?? '') && actual.length === 1 && actual[0].id === dns.id && dnsRecordMatches(actual[0]), 'test_dns_readback');
  check((await routes(api)).length === 0, 'route_collision');
  const route = await api.request(`${ZONE}/workers/routes`,{method:'POST',body:{pattern:ROUTE,script:TARGET.worker}});
  const attached = await routes(api);
  check(ID.test(route?.id ?? '') && attached.length === 1 && attached[0].id === route.id && attached[0].pattern === ROUTE
    && attached[0].script === TARGET.worker,'exact_route_readback');
  const final = await inspect(staged.versionId);
  checkSnapshot(final,[TARGET.worker]);
  check(final.readiness === 'PINNED_METADATA_CHECKS_PASS','final_isolation_readback');
  await verifyWorkerVersion({...stageArgs,...staged});
  const finalDns = await api.dns(TARGET.hostname);
  check(finalDns.length === 1 && finalDns[0].id === dns.id && dnsRecordMatches(finalDns[0]), 'final_test_dns_readback');
  const after = await accessSnapshot(api);
  check(equal(context.live,after.live) && context.issuer === after.issuer
    && equal(sortIds(context.apps.filter(a=>a.id !== app.id)),sortIds(after.apps.filter(a=>a.id !== app.id))), 'production_access_changed');
  await readTestAccess(api,after,app.id,owner,resumeAccess);
  check(equal(network,await networkSnapshot(api)), 'production_dns_pages_changed');
  checkOrigin(await api.request(DRIVE),caId);
  const {verifyAnonymousTestGate} = await import('./new-core-test-access-probe.mjs');
  await verifyAnonymousTestGate(context.issuer);
  const verification = await collectAdminInputs({...args,previousInputs:initial});
  check(verification.ready, 'final_schema_grants_or_clean_state');
  return {status:'OWNER_TEST_PENDING', worker:TARGET.worker, hostname:TARGET.hostname, source:TARGET.candidate,
    workerId:staged.workerId, subjectKeyParentVersionId:staged.parentVersionId,
    versionId:staged.versionId, deploymentId:deployment.id, accessAppId:app.id, caId, caSha256:ca.sha256,
    accessIssuerSha256:sha(context.issuer), accessAudienceSha256:sha(app.aud),
    routeId:route.id,dnsRecordId:dns.id,productionSnapshotSha256:BASELINE,anonymousDenied:true,
    ownerNonmemberTest:'PENDING',outsiderTest:'PENDING',bootstrapCalled:false};
}
