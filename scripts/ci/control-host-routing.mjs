const hosts = ['control.lythaus.co', 'admin.lythaus.co'];
const account = '/accounts/e5b7ae46e04698f507b7e4b3d4ef1af0';
const zone = '/zones/7bc572c8b7cd3c00be9c655176c29382';
const origin = 'https://api.cloudflare.com/client/v4';
const resourceId = /^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/;
const workerName = /^lythaus-[a-z0-9-]{1,55}$/;
const knownPaths = new Set(['/', '/*', '/flags', '/assets/*', '/icons/*', '/brand/*',
  '/api/admin/*', '/api/admin/production-auth-acceptance/*', '/waitlist', '/invite/*',
  '/verify-email', '/reset-password']);

function routeParts(pattern) {
  if (typeof pattern !== 'string') return [];
  const [, host, path = '/'] = pattern.match(/^(?:https?:\/\/)?([^/?#]+)(\/[^?#]*)?(?:[?#].*)?$/i) ?? [];
  return [host?.toLowerCase(), path];
}

export function coversHost(pattern, hostname) {
  const [host] = routeParts(pattern);
  if (!host || !/^[a-z0-9.*-]+$/.test(host)) return false;
  const expression = host.split('*').map(part => part.replaceAll('.', '\\.')).join('.*');
  return new RegExp('^' + expression + '$').test(hostname);
}

function pathClass(pattern) {
  const [, path] = routeParts(pattern);
  return knownPaths.has(path) ? path : 'other';
}

export async function inspectControlRouting({token, fetchImpl = fetch}) {
  if (!token) throw new Error('control_routing_token_missing');
  const incomplete = [];
  let reads = 0;
  async function get(path, label) {
    if (++reads > 150) throw new Error('control_routing_read_limit');
    try {
      const response = await fetchImpl(origin + path, {method:'GET', redirect:'error', cache:'no-store',
        signal:AbortSignal.timeout(12000), headers:{authorization:'Bearer ' + token, accept:'application/json'}});
      if (response.status !== 200 || response.redirected || (response.url && response.url !== origin + path)) {
        incomplete.push({label,status:response.status});
        await response.body?.cancel();
        return null;
      }
      const data = await response.json();
      if (data?.success !== true || data.result == null) throw new Error();
      return data;
    } catch {
      incomplete.push({label,status:'unverified'});
      return null;
    }
  }

  async function list(path, label, paginated = true) {
    const rows = [], ids = new Set();
    let total;
    for (let page = 1; page <= 10; page++) {
      const data = await get(paginated ? path + '?per_page=50&page=' + page : path, label);
      if (!data) return rows;
      if (!Array.isArray(data.result)) break;
      for (const row of data.result) {
        if (!resourceId.test(row?.id) || ids.has(row.id)) {
          incomplete.push({label,status:'ambiguous_list'});
          return rows;
        }
        ids.add(row.id);
        rows.push(row);
      }
      const info = data.result_info;
      if (!paginated && !info) return rows;
      if (!info || info.page !== page || !Number.isInteger(info.total_count) || info.total_count < rows.length
        || (info.count !== undefined && info.count !== data.result.length)
        || (total !== undefined && total !== info.total_count)) break;
      total = info.total_count;
      if (rows.length === total) return rows;
      if (!paginated || !data.result.length) break;
    }
    incomplete.push({label,status:'pagination_unverified'});
    return rows;
  }

  const dns = await list(zone + '/dns_records','dns');
  const domains = await list(account + '/workers/domains?zone_name=lythaus.co','worker_domains',false);
  const routes = await list(zone + '/workers/routes','worker_routes',false);
  const pages = await list(account + '/pages/projects','pages');
  const apps = await list(account + '/access/apps','access');
  const pageRules = await list(zone + '/pagerules','page_rules',false);
  const redirects = {};
  for (const [label,path] of [['single',zone + '/rulesets/phases/http_request_dynamic_redirect/entrypoint'],
    ['bulk',account + '/rulesets/phases/http_request_redirect/entrypoint']]) {
    const ruleSet = await get(path,label);
    const rules = ruleSet?.result?.rules;
    redirects[label] = Array.isArray(rules) ? rules.filter(row=>row.enabled !== false).length : null;
    if (ruleSet && !Array.isArray(rules)) incomplete.push({label,status:'rules_unverified'});
    if (redirects[label] > 0) incomplete.push({label,status:'review_active_redirect_destinations'});
  }
  if (pages.some(row => !Array.isArray(row.domains))) incomplete.push({label:'pages',status:'domains_unverified'});
  const access = [];
  for (const app of apps.filter(row => row.type === 'self_hosted')) {
    const patterns = [app.domain, app.destination];
    for (const field of ['domains', 'self_hosted_domains', 'destinations']) {
      if (app[field] == null) continue;
      if (!Array.isArray(app[field])) { incomplete.push({label:'access',status:'domains_unverified'}); continue; }
      for (const entry of app[field]) {
        if (field === 'destinations' && entry?.type === 'private') continue;
        patterns.push(field === 'destinations' ? entry?.uri : entry);
      }
    }
    if (!patterns.some(value => typeof value === 'string') || patterns.some(value => value != null && typeof value !== 'string')) {
      incomplete.push({label:'access',status:'domains_unverified'});
    }
    if (!hosts.some(host => patterns.some(value => coversHost(value,host)))) continue;
    const policies = await list(account + '/access/apps/' + app.id + '/policies', 'access_policies');
    const decisions = {allow:0, deny:0, bypass:0, service:0, other:0};
    for (const policy of policies.filter(p => p.enabled !== false)) {
      const category = {allow:'allow', deny:'deny', block:'deny', bypass:'bypass', non_identity:'service', service_auth:'service'}[policy.decision];
      decisions[Object.hasOwn(decisions,category) ? category : 'other']++;
    }
    access.push({id:app.id,patterns,decisions});
  }
  const claims = [];
  for (const host of hosts) {
    const workers = domains.filter(row=>coversHost(row.hostname,host));
    const routeRows = routes.filter(row=>coversHost(row.pattern,host));
    const names = new Set([...workers.map(row=>row.service), ...routeRows.map(row=>row.script)].filter(Boolean));
    const defaults = [];
    for (const name of names) {
      if (!workerName.test(name)) { incomplete.push({label:'worker_defaults',status:'unknown_service'}); continue; }
      const state = (await get(account + '/workers/scripts/' + name + '/subdomain','worker_defaults'))?.result;
      if (typeof state?.enabled !== 'boolean' || typeof state?.previews_enabled !== 'boolean') {
        incomplete.push({label:'worker_defaults',status:'exposure_unverified'});
      }
      defaults.push({service:name, workersDev:state?.enabled ?? null, previews:state?.previews_enabled ?? null});
    }
    claims.push({host,
      dns:dns.filter(row=>coversHost(row.name,host)).map(row=>({id:row.id,type:row.type,wildcard:row.name.includes('*'),proxied:row.proxied === true})),
      workers:workers.map(row=>({id:row.id, service:workerName.test(row.service) ? row.service : 'other'})),
      defaults,
      routes:routeRows.map(row=>({id:row.id,path:pathClass(row.pattern),script:workerName.test(row.script) ? row.script : row.script ? 'other' : null})),
      pages:pages.filter(row=>Array.isArray(row.domains) && row.domains.some(domain=>coversHost(domain,host)))
        .map(row=>({id:row.id,name:workerName.test(row.name) ? row.name : 'other',
          deploymentId:resourceId.test(row.canonical_deployment?.id) ? row.canonical_deployment.id : null})),
      access:access.filter(app=>app.patterns.some(value=>coversHost(value,host))).map(({id,patterns,decisions})=>({
        id,paths:[...new Set(patterns.filter(value=>coversHost(value,host)).map(pathClass))],decisions})),
      pageRules:pageRules.filter(row=>row.status === 'active' && row.targets?.some(t=>coversHost(t.constraint?.value,host)))
        .map(row=>({id:row.id,forwarding:row.actions?.some(action=>action.id === 'forwarding_url') === true})),
    });
  }
  if (pageRules.some(row=>row.status === 'active' && (!Array.isArray(row.targets)
    || !row.targets.length || row.targets.some(t=>t.target !== 'url' || typeof t.constraint?.value !== 'string')))) {
    incomplete.push({label:'page_rules',status:'unknown_targets'});
  }
  return {claims,redirects,incomplete,routingDecision:'REHEARSAL_ONLY',mutationCount:0};
}
