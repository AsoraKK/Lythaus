import { TARGET } from './lythaus-new-core-isolation-review.mjs';

export const ACCOUNT = `/accounts/${TARGET.account}`;
export const ZONE = `/zones/${TARGET.zone}`;
export const SCRIPT = `${ACCOUNT}/workers/scripts/${TARGET.worker}`;
export const DRIVE = `${ACCOUNT}/hyperdrive/configs/${TARGET.hyperdrive}`;
export const ID = /^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/;
const API = 'https://api.cloudflare.com/client/v4';
export const requireSetup = (condition, code) => { if (!condition) throw new Error(`setup_${code}`); };
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

export function createSetupClient({token, fetchImpl = fetch, record}) {
  const owned = { workerId:null, parentVersionId:null, versionId:null };
  const idSegment = '(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})';
  const page = '(?:\\?per_page=100&page=(?:[1-9]|10))?';
  const reads = [
    [new RegExp(`^${ACCOUNT}/access/apps(?:/${idSegment}/policies)?${page}$`), 'access_inventory'],
    [new RegExp(`^${ACCOUNT}/access/organizations$`), 'access_organization'],
    [new RegExp(`^${ACCOUNT}/workers/domains\\?hostname=${TARGET.hostname.replaceAll('.', '\\.')}$`), 'worker_domains'],
    [new RegExp(`^${ACCOUNT}/pages/projects${page}$`), 'pages_inventory'],
    [new RegExp(`^${ZONE}/ssl/certificate_packs${page}$`), 'edge_certificate'],
    [new RegExp(`^${ZONE}/dns_records\\?name=(?:admin\\.lythaus\\.co|admin-new-core-test\\.lythaus\\.co|%2A\\.lythaus\\.co)&per_page=100&page=1$`), 'dns_inventory'],
    [new RegExp(`^${ACCOUNT}/mtls_certificates/${idSegment}$`), 'read_public_ca'],
  ];
  const fixedReads = new Map([[DRIVE,'hyperdrive'],[`${ZONE}/workers/routes`,'zone_routes'],
    [`${SCRIPT}/deployments`,'deployments'],[`${SCRIPT}/subdomain`,'worker_subdomain']]);
  function operation(method, path) {
    if (method === 'GET') {
      for (const [re, name] of reads) if (re.test(path)) return name;
      if (fixedReads.has(path)) return fixedReads.get(path);
      if (owned.workerId && new RegExp(`^${ACCOUNT}/workers/workers/${owned.workerId}(?:/versions(?:/${idSegment}\\?include=modules)?)?$`).test(path)) return 'read_test_worker';
    }
    if (writes.has(`${method} ${path}`)) return writes.get(`${method} ${path}`);
    if (method === 'POST' && new RegExp(`^${ACCOUNT}/workers/assets/upload/[a-f0-9]{32}$`).test(path)) return 'upload_assets';
    if (method === 'POST' && owned.workerId && path === `${ACCOUNT}/workers/workers/${owned.workerId}/versions?deploy=false`) return 'stage_version';
    requireSetup(false, 'provider_scope_blocked');
  }
  async function call(path, {method='GET',body,headers={}} = {}) {
    const stage = operation(method,path);
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
    try {
      response = await fetchImpl(API + path,{method,body,headers:h,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(45000)});
      requireSetup(response.ok && !response.redirected && (!response.url || response.url === API + path), `${stage}_http_${Number(response.status)}`);
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
      }
    }
    return payload;
  }
  const request = async (path, options) => (await call(path, options)).result;
  async function list(path) {
    const result = [], seen = new Set();
    for (let index=1; index<=10; index++) {
      const payload = await call(`${path}?per_page=100&page=${index}`);
      requireSetup(Array.isArray(payload.result), 'inventory_shape');
      for (const row of payload.result) {
        requireSetup(row.id && !seen.has(row.id), 'inventory_ambiguous');
        seen.add(row.id);
        result.push(row);
      }
      const pages = payload.result_info?.total_pages;
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
  return {request,list,dns};
}
