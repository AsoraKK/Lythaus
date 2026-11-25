import { TARGET } from './lythaus-new-core-isolation-review.mjs';

export const ACCOUNT = `/accounts/${TARGET.account}`;
export const ZONE = `/zones/${TARGET.zone}`;
export const SCRIPT = `${ACCOUNT}/workers/scripts/${TARGET.worker}`;
export const DRIVE = `${ACCOUNT}/hyperdrive/configs/${TARGET.hyperdrive}`;
export const RECORDED_WORKER_ID = '89391a349e454b3994bd43299c6386ed';
export const ROUTED_CHILD_ID = '37f36eb4-911d-4c51-b723-751329cd1b92';
export const ROUTED_REPAIR_ID = '193c3dcb-9238-4adc-8eab-48707fdd8b7e';
export const ROUTED_REPAIR_INTENT = 'c231d250-f91c-4626-bc7e-31fb2c8e1321';
export const RECORDED_WORKER = `${ACCOUNT}/workers/workers/${RECORDED_WORKER_ID}`;
export const ID = /^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/;
const API = 'https://api.cloudflare.com/client/v4';
export const requireSetup = (condition, code) => { if (!condition) throw new Error(`setup_${code}`); };

// The protected response is classified here; no free-form provider text is returned.
const versionFields = new Map([
  ['annotations','annotations'], ['main_module','modules'], ['modules','modules'],
  ['bindings','bindings'], ['compatibility_date','compatibility'],
  ['compatibility_flags','compatibility'], ['assets','assets'], ['deploy','deploy'],
]);
async function stageRejection(response, phase) {
  const ray = /^([0-9a-f]{16})(?:-[A-Z]{3})?$/.exec(response.headers.get('cf-ray') ?? '');
  const reference = ray ? `_ray_${ray[1]}` : '';
  const prefix = `stage_version_${phase}_http_${response.status}`;
  if (!response.body || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) return prefix + reference;
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > 16 * 1024) return prefix + reference;
      chunks.push(chunk);
    }
    const error = JSON.parse(Buffer.concat(chunks).toString())?.errors?.[0];
    const code = error?.code;
    const numeric = Number.isInteger(code) && code >= 1000 && code <= 999999;
    const first = typeof error?.source?.pointer === 'string'
      ? /^\/([a-z_]+)(?:\/|$)/.exec(error.source.pointer)?.[1] : undefined;
    const messages = typeof error?.message === 'string' ? error.message : '';
    const hints = [
      ['redirects', /\b_redirects\b/i], ['headers', /\b_headers\b/i],
      ['bindings', /\b(?:binding|bindings)\b/i], ['modules', /\b(?:main_module|module|modules)\b/i],
      ['compatibility', /\bcompatibility[_ ](?:date|flags?)\b/i],
      ['assets', /\b(?:assets|completion token)\b/i], ['annotations', /\bannotations?\b/i],
    ].filter(([, pattern]) => pattern.test(messages));
    const category = versionFields.get(first) ?? (hints.length === 1 ? hints[0][0] : undefined);
    return prefix + (numeric ? `_cf_${code}_${category ?? 'unknown_field'}` : category ? `_${category}` : '') + reference;
  } catch { return prefix + reference; }
}
export function avoidDeniedReadRetries(fetchImpl = fetch) {
  const denied = new Map();
  return async (url, init) => {
    if (init.method === 'GET' && denied.has(url)) return new Response(null,{status:denied.get(url)});
    const result = await fetchImpl(url,init);
    if (init.method === 'GET' && [401,403].includes(result.status)) denied.set(url,result.status);
    return result;
  };
}

const writes = new Map([
  [`POST ${ACCOUNT}/access/apps`, 'create_access'],
  [`POST ${ACCOUNT}/mtls_certificates`, 'upload_public_ca'],
  [`PATCH ${DRIVE}`, 'configure_hyperdrive'],
  [`POST ${DRIVE}/restart`, 'restart_hyperdrive'],
  [`POST ${ACCOUNT}/workers/workers`, 'create_worker'],
  [`POST ${SCRIPT}/assets-upload-session`, 'open_assets_session'],
  [`POST ${ACCOUNT}/workers/assets/upload?base64=true`, 'upload_assets'],
  [`POST ${SCRIPT}/deployments`, 'activate_version'],
  [`POST ${ZONE}/dns_records`, 'create_test_dns'],
  [`POST ${ZONE}/workers/routes`, 'create_test_route'],
]);

export function createSetupClient({token, fetchImpl = fetch, record, resumeWorker=false, singleStage=false, repairOperation}) {
  if (repairOperation !== undefined) {
    requireSetup(['stage-isolated-repair','activate-isolated-repair','reconcile-isolated-repair'].includes(repairOperation),
      'repair_operation_unknown');
    resumeWorker = true;
  }
  const owned = { workerId:null, parentVersionId:null, versionId:null };
  let sawRecordedWorker = false;
  let stageCount = 0;
  let repairActivationAttempted = false;
  const observedVersions = new Set();
  let observedRepairPredecessor = false;
  const observedRepairChildren = new Set();
  let stageResultUnverified = false;
  const idSegment = '(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})';
  const page = '(?:\\?per_page=100&page=(?:[1-9]|10))?';
  const reads = [
    [new RegExp(`^${RECORDED_WORKER}/versions\\?per_page=100&page=(?:[1-9]|10)$`), 'recorded_worker_versions'],
    [new RegExp(`^${RECORDED_WORKER}/versions/${idSegment}\\?include=modules$`), 'recorded_worker_version'],
    [new RegExp(`^${ACCOUNT}/access/apps(?:/${idSegment}/policies)?${page}$`), 'access_inventory'],
    [new RegExp(`^${ACCOUNT}/access/apps/${idSegment}$`), 'access_app_details'],
    [new RegExp(`^${ACCOUNT}/access/organizations$`), 'access_organization'],
    [new RegExp(`^${ACCOUNT}/workers/domains\\?hostname=${TARGET.hostname.replaceAll('.', '\\.')}$`), 'worker_domains'],
    [new RegExp(`^${ACCOUNT}/pages/projects(?:\\?page=(?:[2-9]|10))?$`), 'pages_inventory'],
    [new RegExp(`^${ZONE}/ssl/certificate_packs${page}$`), 'edge_certificate'],
    [new RegExp(`^${ZONE}/dns_records\\?name=(?:admin\\.lythaus\\.co|admin-new-core-test\\.lythaus\\.co|%2A\\.lythaus\\.co)&per_page=100&page=1$`), 'dns_inventory'],
    [new RegExp(`^${ACCOUNT}/mtls_certificates/${idSegment}$`), 'read_public_ca'],
  ];
  const fixedReads = new Map([[DRIVE,'hyperdrive'],[`${ZONE}/workers/routes`,'zone_routes'],
    [RECORDED_WORKER,'recorded_worker_details'],
    [`${SCRIPT}/script-settings`,'recorded_worker_script_settings'],
    [`${SCRIPT}/deployments`,'deployments'],[`${SCRIPT}/subdomain`,'worker_subdomain']]);
  function operation(method, path) {
    if (method === 'GET') {
      for (const [re, name] of reads) if (re.test(path)) return name;
      if (fixedReads.has(path)) return fixedReads.get(path);
      if (owned.workerId && new RegExp(`^${ACCOUNT}/workers/workers/${owned.workerId}(?:/versions(?:/${idSegment}\\?include=modules)?)?$`).test(path)) return 'read_test_worker';
    }
    if (writes.has(`${method} ${path}`)) {
      const stage = writes.get(`${method} ${path}`);
      requireSetup(!resumeWorker || !['create_access','upload_public_ca','configure_hyperdrive','restart_hyperdrive','create_worker'].includes(stage),
        'provider_scope_blocked');
      return stage;
    }
    if (method === 'POST' && new RegExp(`^${ACCOUNT}/workers/assets/upload/[a-f0-9]{32}$`).test(path)) return 'upload_assets';
    if (method === 'POST' && owned.workerId && path === `${ACCOUNT}/workers/workers/${owned.workerId}/versions?deploy=false`) return 'stage_version';
    requireSetup(false, 'provider_scope_blocked');
  }
  async function call(path, {method='GET',body,headers={}} = {}) {
    const stage = operation(method,path);
    requireSetup(method === 'GET' || !stageResultUnverified, 'stage_version_reconciliation_required');
    if (repairOperation && method !== 'GET') {
      const staging = repairOperation === 'stage-isolated-repair' && !stageCount && !owned.versionId &&
        ['open_assets_session','upload_assets','stage_version'].includes(stage);
      const activating = repairOperation === 'activate-isolated-repair' && !repairActivationAttempted &&
        stage === 'activate_version' && observedRepairChildren.has(owned.versionId) &&
        Object.keys(body ?? {}).sort().join() === 'annotations,strategy,versions' &&
        Object.keys(body.annotations ?? {}).join() === 'workers/message' &&
        /^lythaus-isolated-repair [a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(body.annotations['workers/message']);
      requireSetup(observedRepairPredecessor && owned.workerId === RECORDED_WORKER_ID && owned.parentVersionId === ROUTED_REPAIR_ID &&
        (staging || activating), 'repair_provider_scope');
    }
    if (singleStage && method !== 'GET') requireSetup(resumeWorker && !stageCount &&
      ['open_assets_session','upload_assets','stage_version'].includes(stage), 'nonserving_stage_scope');
    if (stage === 'create_worker') requireSetup(body?.name === TARGET.worker && body.subdomain?.enabled === false
      && body.subdomain.previews_enabled === false, 'worker_create_target');
    if (stage === 'create_access') requireSetup(body?.type === 'self_hosted' && body.domain === TARGET.hostname
      && !body.destinations && !body.self_hosted_domains, 'access_create_target');
    if (stage === 'configure_hyperdrive') requireSetup(body?.origin?.user === `lythaus_admin.${TARGET.branch}`
      && Object.keys(body.origin).sort().join() === 'password,user' && body.caching?.disabled === true
      && body.mtls?.sslmode === 'verify-full' && ID.test(body.mtls.ca_certificate_id) && !body.mtls.mtls_certificate_id,
      'hyperdrive_update_scope');
    if (stage === 'upload_public_ca') requireSetup(body?.ca === true && typeof body.certificates === 'string'
      && !body.certificates.includes('PRIVATE KEY') && !Object.hasOwn(body,'private_key'), 'ca_upload_scope');
    if (stage === 'stage_version') {
      const keys = body?.bindings?.filter(binding => binding.name === 'ACCESS_SUBJECT_HMAC_KEY') ?? [];
      const key = keys[0];
      requireSetup(!owned.versionId && keys.length === 1 && (owned.parentVersionId
        ? key.type === 'inherit' && key.version_id === owned.parentVersionId && Object.keys(key).length === 3
        : key.type === 'secret_text' && typeof key.text === 'string' && /^[A-Za-z0-9+/]{43}=$/.test(key.text)
          && Object.keys(key).length === 3), 'subject_key_lineage');
    }
    if (stage === 'activate_version') requireSetup(owned.versionId && body?.strategy === 'percentage' && body.versions?.length === 1
      && body.versions[0].version_id === owned.versionId && body.versions[0].percentage === 100,'deployment_target');
    if (stage === 'create_test_dns') requireSetup(body?.name === TARGET.hostname && body.type === 'A' && body.content === '192.0.2.1'
      && body.ttl === 1 && body.proxied === true, 'dns_create_target');
    if (stage === 'create_test_route') requireSetup(body?.pattern === `${TARGET.hostname}/*` && body.script === TARGET.worker,'route_create_target');
    const h = new Headers(headers);
    const assetUpload = stage === 'upload_assets';
    requireSetup(typeof token === 'string' && token.length > 0, 'provider_token_missing');
    for (const name of h.keys()) requireSetup(['authorization','content-type','accept'].includes(name), 'provider_header_blocked');
    if (assetUpload) requireSetup(/^Bearer [\w.-]+$/.test(h.get('authorization') ?? '') && h.get('authorization') !== `Bearer ${token}`, 'asset_session_token_required');
    else {
      requireSetup(!h.has('authorization'), 'provider_authorization_override');
      h.set('authorization', `Bearer ${token}`);
    }
    if (body && Object.getPrototypeOf(body) === Object.prototype) {
      body = JSON.stringify(body);
      h.set('content-type', 'application/json');
    }
    h.set('accept', 'application/json');
    let response, payload;
    if (stage === 'stage_version') { stageResultUnverified = true; stageCount++; }
    if (repairOperation && stage === 'activate_version') repairActivationAttempted = true;
    try {
      response = await fetchImpl(API + path,{method,body,headers:h,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(45000)});
      const expectedResponse = !response.redirected && (!response.url || response.url === API + path);
      if (expectedResponse && stage === 'stage_version' && response.status >= 400 && response.status < 600) {
        throw new Error(`setup_${await stageRejection(response, owned.parentVersionId ? 'inherit' : 'initial')}`);
      }
      requireSetup(response.ok && expectedResponse, `${stage}_http_${Number(response.status)}`);
      const parts = []; let size = 0;
      for await (const part of response.body) {
        size += part.byteLength;
        requireSetup(size <= 5 * 1024 * 1024, `${stage}_response_size`);
        parts.push(part);
      }
      payload = JSON.parse(Buffer.concat(parts).toString());
    } catch (error) {
      await response?.body?.cancel().catch(()=>{});
      if (error instanceof Error && /^setup_[a-z0-9_]+$/.test(error.message)) throw error;
      throw new Error(`setup_${stage}_response_unavailable`);
    }
    requireSetup(payload?.success === true && Object.hasOwn(payload,'result'), `${stage}_provider_failure`);
    if (stage === 'recorded_worker_details') sawRecordedWorker =
      payload.result?.id === RECORDED_WORKER_ID && payload.result.name === TARGET.worker;
    if (stage === 'recorded_worker_version' && ID.test(payload.result?.id ?? '') &&
      path === `${RECORDED_WORKER}/versions/${payload.result.id}?include=modules`) {
      const version = payload.result;
      observedVersions.add(version.id);
      const message = version.annotations?.['workers/message'];
      if (version.id === ROUTED_REPAIR_ID) observedRepairPredecessor = message === `lythaus-isolated ${ROUTED_REPAIR_INTENT} ${ROUTED_CHILD_ID}`;
      const marker = typeof message === 'string' ? message.split(' ') : [];
      observedRepairChildren.delete(version.id);
      if (repairOperation && marker?.length === 3 && marker[0] === 'lythaus-isolated' && ID.test(marker[1]) &&
        marker[2] === ROUTED_REPAIR_ID && version.id !== ROUTED_REPAIR_ID) observedRepairChildren.add(version.id);
    }
    if (method !== 'GET') {
      const id = payload.result?.id;
      await record({operation:stage,...(ID.test(id ?? '') ? {id} : {})});
      if (stage === 'create_worker') {
        requireSetup(ID.test(id ?? '') && payload.result.name === TARGET.worker, 'new_worker_identity');
        owned.workerId = id;
      }
      if (stage === 'stage_version') {
        requireSetup(ID.test(id ?? ''),'new_version_identity');
        requireSetup(id !== owned.parentVersionId,'inherited_version_identity');
        if (!owned.parentVersionId) owned.parentVersionId = id;
        else owned.versionId = id;
        stageResultUnverified = false;
      }
    }
    return payload;
  }
  const request = async (path, options) => (await call(path, options)).result;
  async function listPagesProjects() {
    const projects = [];
    const ids = new Set();
    const validTotal = value => Number.isSafeInteger(value) && value >= 0;
    let first;
    for (let page = 1; page <= 10; page++) {
      const path = `${ACCOUNT}/pages/projects` + (page === 1 ? '' : `?page=${page}`);
      const {result, result_info: info} = await call(path);
      requireSetup(Array.isArray(result) && info?.page === page && validTotal(info.per_page) && info.per_page > 0
        && result.length <= info.per_page && (info.count === undefined || info.count === result.length)
        && (result.length > 0 || page === 1)
        && (info.total_count === undefined || validTotal(info.total_count))
        && (info.total_pages === undefined || validTotal(info.total_pages))
        && (info.total_count !== undefined || info.total_pages !== undefined),
      'pages_pagination_unverified');
      first ??= info;
      requireSetup(info.total_count === first.total_count && info.total_pages === first.total_pages
        && info.per_page === first.per_page, 'pages_pagination_changed');
      for (const project of result) {
        requireSetup(ID.test(project?.id ?? '') && !ids.has(project.id), 'pages_project_identity');
        ids.add(project.id);
        projects.push(project);
      }
      const countComplete = info.total_count === undefined ? undefined : projects.length === info.total_count;
      const lastPage = info.total_pages === undefined ? undefined : Math.max(1, info.total_pages);
      const pagesComplete = lastPage === undefined ? undefined : page === lastPage;
      requireSetup((info.total_count === undefined || projects.length <= info.total_count)
        && (lastPage === undefined || page <= lastPage) && (info.total_pages !== 0 || projects.length === 0)
        && (countComplete === undefined || pagesComplete === undefined || countComplete === pagesComplete),
      'pages_total_inconsistent');
      if (countComplete || pagesComplete) return projects;
      requireSetup(result.length > 0, 'pages_no_progress');
    }
    requireSetup(false, 'pages_inventory_incomplete');
  }
  async function list(path) {
    const result = [], seen = new Set();
    let versionTotal;
    for (let index=1; index<=10; index++) {
      const payload = await call(`${path}?per_page=100&page=${index}`);
      requireSetup(Array.isArray(payload.result), 'inventory_shape');
      for (const row of payload.result) {
        requireSetup(row.id && !seen.has(row.id), 'inventory_ambiguous');
        seen.add(row.id);
        result.push(row);
      }
      const pages = payload.result_info?.total_pages;
      if (path === RECORDED_WORKER+'/versions') {
        const info = payload.result_info ?? {};
        requireSetup((info.page === undefined || info.page === index) &&
          (info.count === undefined || info.count === payload.result.length) &&
          (pages === undefined || Number.isSafeInteger(pages) && pages >= 0 && index <= Math.max(1,pages)) &&
          (info.total_count === undefined || Number.isSafeInteger(info.total_count) && info.total_count >= result.length) &&
          (index === 1 || info.total_count === versionTotal), 'version_pagination_unverified');
        versionTotal = info.total_count;
        const last = pages === undefined ? payload.result.length < 100 : index >= pages;
        requireSetup(last ? versionTotal === undefined || result.length === versionTotal : payload.result.length > 0,
          'version_inventory_incomplete');
      }
      if (Number.isInteger(pages) ? index >= pages : payload.result.length < 100) return result;
    }
    requireSetup(false,'inventory_incomplete');
  }
  async function dns(name) {
    const payload = await call(`${ZONE}/dns_records?name=${name.replace('*','%2A')}&per_page=100&page=1`);
    requireSetup(Array.isArray(payload.result) && (payload.result_info?.total_pages ?? 1) <= 1
      && payload.result.length < 100 && payload.result.every(r=>r.name === name), 'dns_inventory_incomplete');
    return payload.result;
  }
  function selectRecordedWorker() {
    requireSetup(resumeWorker && !owned.workerId && sawRecordedWorker,'recorded_worker_not_verified');
    owned.workerId = RECORDED_WORKER_ID;
  }
  function selectLineage(parent,child) {
    requireSetup(resumeWorker && owned.workerId === RECORDED_WORKER_ID && !owned.parentVersionId && !stageCount &&
      observedVersions.has(parent) && (!child || child !== parent && observedVersions.has(child)), 'recorded_lineage_not_verified');
    if (repairOperation) requireSetup(observedRepairPredecessor && parent === ROUTED_REPAIR_ID &&
      (repairOperation === 'stage-isolated-repair' ? !child : repairOperation === 'activate-isolated-repair' && observedRepairChildren.has(child)),
      'repair_lineage_selection');
    owned.parentVersionId = parent;
    owned.versionId = child ?? null;
  }
  return {request,list,listPagesProjects,dns,selectRecordedWorker,selectLineage};
}
