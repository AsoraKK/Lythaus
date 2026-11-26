const hosts = ['control.lythaus.co', 'admin.lythaus.co', 'admin-api.lythaus.co'];
const account = '/accounts/e5b7ae46e04698f507b7e4b3d4ef1af0';
const zone = '/zones/7bc572c8b7cd3c00be9c655176c29382';
const origin = 'https://api.cloudflare.com/client/v4';
const resourcePattern = /^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/;
const workerPattern = /^lythaus-[a-z0-9-]{1,55}$/;
const resourceId = value => typeof value === 'string' && resourcePattern.test(value);
const workerName = value => typeof value === 'string' && workerPattern.test(value);
const projectName = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const dnsTypes = new Set(['A','AAAA','CAA','CERT','CNAME','DNSKEY','DS','HTTPS','LOC','MX','NAPTR','NS',
  'OPENPGPKEY','PTR','SMIMEA','SRV','SSHFP','SVCB','TLSA','TXT','URI']);
const knownPaths = new Set(['/', '/*', '/flags', '/assets/*', '/icons/*', '/brand/*',
  '/api/admin/*', '/api/admin/production-auth-acceptance/*', '/waitlist', '/invite/*',
  '/verify-email', '/reset-password', '/health', '/internal/readiness/database-identity', '/api/admin/health',
  '/api/admin/moderation/cases', '/api/admin/production-auth-acceptance', '/production-auth-acceptance',
  '/moderation','/appeals','/accounts','/accounts/management','/users','/account-support','/support','/authenticity','/audit',
  '/favicon.ico','/apple-touch-icon.png']);

// Service discovery and TXT owner names permit underscores; HTTP hosts do not.
function dnsOwner(name) {
  if (typeof name !== 'string' || name.length > 254) return null;
  const host = name.toLowerCase().replace(/\.$/,'');
  const valid = host.split('.').every((part,index) => /^[a-z0-9_-]{1,63}$/.test(part) || (index === 0 && part === '*'));
  return valid ? host : null;
}

function coversDnsOwner(name, host) {
  const owner = dnsOwner(name);
  return owner === host || (owner?.startsWith('*.') && host.endsWith(owner.slice(1)));
}

function routeParts(pattern) {
  if (typeof pattern !== 'string' || pattern.length > 2048 || /[\s\x00-\x1f]/.test(pattern)) return [];
  const match = /^(?:(https?|\*):\/\/)?([^/?#]+)(\/[^?#]*)?([?#].*)?$/i.exec(pattern);
  if (!match) return [];
  const authority = match[2].toLowerCase();
  const port = authority.match(/:(80|443)$/);
  const host = (port ? authority.slice(0,-port[0].length) : authority).replace(/\.$/,'');
  if (host.length > 253 || !host.split('.').every(label => /^[a-z0-9*-]{1,63}$/.test(label))) return [];
  // Compare host claims conservatively across schemes and the two default ports.
  return [host,match[4] ? 'other' : match[3] ?? '/'];
}

export function coversHost(pattern, hostname) {
  const [host] = routeParts(pattern);
  if (!host) return false;
  // Only the target hostname is matched. Treat the provider's wildcard as
  // zero or more characters; never evaluate its expression as a regular expression.
  const parts = host.split('*');
  if (parts.length === 1) return host === hostname;
  const start = parts.shift(), end = parts.pop();
  if (!hostname.startsWith(start) || !hostname.endsWith(end) || start.length + end.length > hostname.length) return false;
  let remaining = hostname.slice(start.length, hostname.length - end.length);
  for (const part of parts) {
    const index = remaining.indexOf(part);
    if (index < 0) return false;
    remaining = remaining.slice(index + part.length);
  }
  return true;
}

function pathClass(pattern) {
  const [, path] = routeParts(pattern);
  return knownPaths.has(path) ? path : 'other';
}

function retryDelay(header) {
  if (header === null) return null;
  if (/^\d+$/.test(header)) {
    const seconds = Number(header);
    return Number.isSafeInteger(seconds) ? seconds : null;
  }
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.max(0,Math.ceil((at-Date.now())/1000)) : null;
}

export async function inspectControlRouting({token, fetchImpl = fetch}) {
  if (!token) throw new Error('control_routing_token_missing');
  const incomplete = [];
  let reads = 0;
  let stopped = false;
  function note(label,status,details = {}) {
    if (!incomplete.some(item => item.label === label && item.status === status)) incomplete.push({label,status,...details});
  }
  const validCount = value => Number.isSafeInteger(value) && value >= 0;
  async function get(path, label, entrypoint = false) {
    if (stopped) { note(label,'not_read_after_stop'); return null; }
    if (reads >= 150) { note(label,'read_limit'); stopped = true; return null; }
    reads++;
    try {
      const response = await fetchImpl(origin + path, {method:'GET', redirect:'error', cache:'no-store',
        signal:AbortSignal.timeout(12000), headers:{authorization:'Bearer ' + token, accept:'application/json'}});
      if (response.redirected || (response.url && response.url !== origin + path)) {
        await response.body?.cancel(); note(label,'unexpected_response'); return null;
      }
      if (response.status !== 200) {
        if (response.status === 429 || response.status === 401) stopped = true;
        await response.body?.cancel().catch(()=>{});
        if (entrypoint && response.status === 404) return {missingEntrypoint:true};
        note(label,response.status,response.status === 429 ? {retryAfterSeconds:retryDelay(response.headers.get('retry-after'))} : {});
        return null;
      }
      if (!response.body) throw new Error();
      const chunks = []; let bytes = 0;
      for await (const chunk of response.body) {
        bytes += chunk.byteLength;
        if (bytes > 2 * 1024 * 1024) throw new Error();
        chunks.push(chunk);
      }
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (data?.success !== true || data.result == null) throw new Error();
      return data;
    } catch { note(label,'unverified'); return null; }
  }

  // Cloudflare SDK resources for DNS/records, Access/apps and their policies,
  // Workers/domains and routes, Pages/projects and domains, and Rulesets/list.
  // DNS and Access use numbered pages. Pages project listings can return
  // pagination metadata despite having a SinglePage SDK method. Custom
  // domains, Worker routes and zone Page Rules document a complete array.
  async function list(path, label, mode = 'pages') {
    const rows = [], ids = new Set();
    let first;
    for (let page = 1; page <= 10; page++) {
      const suffix = mode === 'pages' ? '?per_page=50&page=' + page : mode === 'projects' && page > 1 ? '?page=' + page : '';
      const data = await get(path + suffix,label);
      if (!data) return rows;
      if (!Array.isArray(data.result)) break;
      for (const row of data.result) {
        const domainName = row?.name ?? row?.domain;
        // Pages custom domains have both historical domain_id/name and id/name
        // representations. The unique hostname identifies the claim even if
        // optional provider IDs are omitted from this single project's list.
        const key = mode === 'domains' ? dnsOwner(domainName) : row?.id;
        const valid = mode === 'domains' ? !!key && [row?.id,row?.domain_id].every(id => id == null || resourceId(id)) : resourceId(key);
        if (!valid || ids.has(key)) { note(label,'ambiguous_list'); return rows; }
        ids.add(key); rows.push(row);
      }
      const info = data.result_info;
      if (info === undefined && mode !== 'pages' && page === 1) return rows;
      if (!info || info.page !== page || (info.count !== undefined && info.count !== data.result.length) ||
        (info.total_count === undefined && info.total_pages === undefined) ||
        (info.total_count !== undefined && (!validCount(info.total_count) || rows.length > info.total_count)) ||
        (info.total_pages !== undefined && (!validCount(info.total_pages) || (info.total_pages === 0 && rows.length > 0) || page > Math.max(1,info.total_pages))) ||
        (info.per_page !== undefined && (!validCount(info.per_page) || !info.per_page || data.result.length > info.per_page))) break;
      first ??= info;
      if (first.total_count !== info.total_count || first.total_pages !== info.total_pages || first.per_page !== info.per_page) break;
      const byCount = info.total_count === undefined ? undefined : rows.length === info.total_count;
      const byPages = info.total_pages === undefined ? undefined : page === Math.max(1,info.total_pages);
      if (byCount !== undefined && byPages !== undefined && byCount !== byPages) break;
      if (info.per_page && info.total_count !== undefined && info.total_pages !== undefined &&
        Math.max(1,Math.ceil(info.total_count/info.per_page)) !== Math.max(1,info.total_pages)) break;
      if (byCount || byPages) return rows;
      if (['single','domains'].includes(mode) || !data.result.length) break;
    }
    note(label,'pagination_unverified');
    return rows;
  }

  // A bare 404 can also conceal a permission failure. Establish absence only
  // if the same scope's independent cursor-paginated ruleset list is complete.
  async function noEntrypoint(scope, phase, kind, label) {
    const ids = new Set(), cursors = new Set();
    let cursor, expectedCount;
    for (let page = 1; page <= 10; page++) {
      const path = scope + '/rulesets?per_page=50' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
      const data = await get(path,label);
      if (!data || !Array.isArray(data.result) || data.result.length > 50) return false;
      const info = data.result_info;
      if (!info || (info.count !== undefined && info.count !== data.result.length) || info.cursors !== undefined ||
        info.total_pages !== undefined || (info.page !== undefined && info.page !== page)) return false;
      const pageSize = info.per_page === undefined ? 50 : info.per_page;
      if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50 || data.result.length > pageSize) return false;
      for (const row of data.result) {
        if (!resourceId(row?.id) || ids.has(row.id) || typeof row.phase !== 'string' || !row.phase ||
          !['root','zone','custom','managed'].includes(row.kind) || (row.phase === phase && row.kind === kind)) return false;
        ids.add(row.id);
      }
      if (info.total_count !== undefined && (!validCount(info.total_count) || ids.size > info.total_count)) return false;
      if (page > 1 && expectedCount !== info.total_count) return false;
      expectedCount = info.total_count;
      cursor = info.cursor;
      if (cursor == null || cursor === '') {
        if (expectedCount !== undefined) return ids.size === expectedCount;
        return data.result.length < pageSize || Object.hasOwn(info,'cursor');
      }
      if (typeof cursor !== 'string' || cursor.length > 2048 || cursors.has(cursor) || !data.result.length) return false;
      cursors.add(cursor);
    }
    return false;
  }

  const dns = await list(zone + '/dns_records','dns');
  const domains = await list(account + '/workers/domains?zone_name=lythaus.co','worker_domains','single');
  const routes = await list(zone + '/workers/routes','worker_routes','single');
  const pages = await list(account + '/pages/projects','pages','projects');
  const apps = await list(account + '/access/apps','access');
  const pageRules = await list(zone + '/pagerules','page_rules','single');
  const redirects = {};
  for (const [label,scope,phase,kind] of [['single',zone,'http_request_dynamic_redirect','zone'],
    ['bulk',account,'http_request_redirect','root']]) {
    const ruleSet = await get(scope + '/rulesets/phases/' + phase + '/entrypoint',label,true);
    if (ruleSet?.missingEntrypoint) {
      const absent = await noEntrypoint(scope,phase,kind,label + '_inventory');
      redirects[label] = absent ? 0 : null;
      if (!absent) note(label,404);
      continue;
    }
    const value = ruleSet?.result;
    const rules = value?.rules;
    redirects[label] = (value?.phase === undefined || value.phase === phase) && (value?.kind === undefined || value.kind === kind) &&
      Array.isArray(rules) && rules.every(row => row && !Array.isArray(row) && typeof row === 'object' &&
        (row.enabled === undefined || typeof row.enabled === 'boolean')) ?
      rules.filter(row=>row.enabled !== false).length : null;
    if (ruleSet && redirects[label] === null) note(label,'rules_unverified');
    if (redirects[label] > 0) note(label,'review_active_redirect_destinations');
  }
  function validPattern(value,label) {
    if (routeParts(value).length) return true;
    note(label,'pattern_unverified');
    return false;
  }
  for (const row of dns) {
    if (!dnsOwner(row.name)) note('dns','pattern_unverified');
    if (!dnsTypes.has(row.type) || (row.proxied !== undefined && typeof row.proxied !== 'boolean')) note('dns','record_unverified');
  }
  for (const row of domains) {
    validPattern(row.hostname,'worker_domains');
    if (typeof row.service !== 'string' || !row.service) note('worker_domains','service_unverified');
  }
  for (const row of routes) {
    validPattern(row.pattern,'worker_routes');
    if (row.script != null && typeof row.script !== 'string') note('worker_routes','script_unverified');
  }
  for (const project of pages) {
    if (typeof project.name !== 'string' || !projectName.test(project.name)) { note('pages','project_name_unverified'); continue; }
    const domainRows = await list(account + '/pages/projects/' + project.name + '/domains','pages_domains','domains');
    const summary = project.domains ?? [];
    if (!Array.isArray(summary)) note('pages','domains_unverified');
    const names = [...(Array.isArray(summary) ? summary : []), ...domainRows.map(row => row.name ?? row.domain)];
    project.domains = [...new Set(names.filter(name => validPattern(name,'pages_domains')))];
  }
  const access = [];
  for (const app of apps) {
    if (typeof app.type !== 'string' || !app.type) { note('access','app_type_unverified'); continue; }
    if (app.type !== 'self_hosted') {
      const publicPatterns = [app.domain,app.destination,...(Array.isArray(app.destinations) ? app.destinations.map(d=>d?.uri) : []),
        ...(Array.isArray(app.domains) ? app.domains : []),...(Array.isArray(app.self_hosted_domains) ? app.self_hosted_domains : [])];
      if (publicPatterns.some(pattern => hosts.some(host => coversHost(pattern,host)))) note('access','other_application_claim');
      continue;
    }
    const patterns = [app.domain,app.destination].filter(value => value != null);
    let privateOnly = false;
    for (const field of ['domains', 'self_hosted_domains', 'destinations']) {
      if (app[field] == null) continue;
      if (!Array.isArray(app[field])) { note('access','domains_unverified'); continue; }
      for (const entry of app[field]) {
        if (field === 'destinations' && entry?.type === 'private') { privateOnly = true; continue; }
        if (field === 'destinations' && entry?.type !== 'public') { note('access','domains_unverified'); continue; }
        patterns.push(field === 'destinations' ? entry?.uri : entry);
      }
    }
    if ((!patterns.length && !privateOnly) || !patterns.every(value => validPattern(value,'access'))) {
      note('access','domains_unverified');
    }
    if (!hosts.some(host => patterns.some(value => coversHost(value,host)))) continue;
    const policies = await list(account + '/access/apps/' + app.id + '/policies', 'access_policies');
    const decisions = {allow:0, deny:0, bypass:0, service:0, other:0};
    for (const policy of policies.filter(p => p.enabled !== false)) {
      const category = {allow:'allow', deny:'deny', block:'deny', bypass:'bypass', non_identity:'service', service_auth:'service'}[policy.decision];
      if (!Object.hasOwn(decisions,category)) note('access_policies','unknown_decision');
      decisions[Object.hasOwn(decisions,category) ? category : 'other']++;
    }
    access.push({id:app.id,patterns,decisions});
  }
  const claims = [];
  const defaultsByName = new Map();
  const wildcardHost = pattern => routeParts(pattern)[0]?.includes('*') === true;
  for (const host of hosts) {
    const workers = domains.filter(row=>coversHost(row.hostname,host));
    const routeRows = routes.filter(row=>coversHost(row.pattern,host));
    if (routeRows.some(row => pathClass(row.pattern) === 'other')) note('worker_routes','review_unclassified_path');
    const matchingApps = access.filter(app => app.patterns.some(p => coversHost(p,host)));
    if (matchingApps.some(app => app.patterns.some(p => coversHost(p,host) && pathClass(p) === 'other'))) {
      note('access','review_unclassified_path');
    }
    const names = new Set([...workers.map(row=>row.service), ...routeRows.map(row=>row.script)].filter(Boolean));
    const defaults = [];
    for (const name of names) {
      if (!workerName(name)) { note('worker_defaults','unknown_service'); continue; }
      if (!defaultsByName.has(name)) defaultsByName.set(name,(await get(account + '/workers/scripts/' + name + '/subdomain','worker_defaults'))?.result);
      const state = defaultsByName.get(name);
      if (typeof state?.enabled !== 'boolean' || typeof state?.previews_enabled !== 'boolean') {
        note('worker_defaults','exposure_unverified');
      }
      defaults.push({service:name, workersDev:typeof state?.enabled === 'boolean' ? state.enabled : null, previews:typeof state?.previews_enabled === 'boolean' ? state.previews_enabled : null});
    }
    claims.push({host,
      dns:dns.filter(row=>coversDnsOwner(row.name,host)).map(row=>({id:row.id,type:dnsTypes.has(row.type) ? row.type : 'other',wildcard:row.name.includes('*'),proxied:typeof row.proxied === 'boolean' ? row.proxied : null})),
      workers:workers.map(row=>({id:row.id, service:workerName(row.service) ? row.service : 'other'})),
      defaults,
      routes:routeRows.map(row=>({id:row.id,path:pathClass(row.pattern),wildcard:wildcardHost(row.pattern),script:workerName(row.script) ? row.script : row.script ? 'other' : null})),
      pages:pages.filter(row=>Array.isArray(row.domains) && row.domains.some(domain=>coversHost(domain,host)))
        .map(row=>({id:row.id,name:workerName(row.name) ? row.name : 'other',
          deploymentId:resourceId(row.canonical_deployment?.id) ? row.canonical_deployment.id : null})),
      access:matchingApps.map(({id,patterns,decisions})=>({
        id,wildcard:patterns.some(p => coversHost(p,host) && wildcardHost(p)),paths:[...new Set(patterns.filter(value=>coversHost(value,host)).map(pathClass))],decisions})),
      pageRules:pageRules.filter(row=>row.status === 'active' && Array.isArray(row.targets) && row.targets.some(t=>coversHost(t?.constraint?.value,host)))
        .map(row=>({id:row.id,forwarding:Array.isArray(row.actions) && row.actions.some(action=>action?.id === 'forwarding_url')})),
    });
  }
  if (claims.some(claim => claim.pageRules.some(rule=>rule.forwarding))) note('page_rules','review_active_redirect_destinations');
  if (pageRules.some(row => !['active','disabled'].includes(row.status) || row.status === 'active' &&
    (!Array.isArray(row.targets) || !row.targets.length || row.targets.some(t => t?.target !== 'url' ||
      !routeParts(t.constraint?.value).length || (t.constraint.operator !== undefined && t.constraint.operator !== 'matches'))))) {
    note('page_rules','unknown_targets');
  }
  if (pageRules.some(row => row.status === 'active' && (!Array.isArray(row.actions) || !row.actions.length ||
    row.actions.some(action => typeof action?.id !== 'string')))) note('page_rules','unknown_actions');
  return {claims,redirects,incomplete,routingDecision:'REHEARSAL_ONLY',mutationCount:0};
}
