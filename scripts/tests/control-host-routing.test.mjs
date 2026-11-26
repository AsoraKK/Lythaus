import assert from 'node:assert/strict';
import test from 'node:test';
import { coversHost, inspectControlRouting } from '../ci/control-host-routing.mjs';

const zone = '/client/v4/zones/7bc572c8b7cd3c00be9c655176c29382';
const account = '/client/v4/accounts/e5b7ae46e04698f507b7e4b3d4ef1af0';
const dns = zone + '/dns_records';
const domains = account + '/workers/domains';
const routes = zone + '/workers/routes';
const pageRules = zone + '/pagerules';
const projects = account + '/pages/projects';
const apps = account + '/access/apps';
const singleRedirect = zone + '/rulesets/phases/http_request_dynamic_redirect/entrypoint';
const bulkRedirect = account + '/rulesets/phases/http_request_redirect/entrypoint';
const zoneRulesets = zone + '/rulesets';
const accountRulesets = account + '/rulesets';
const token = 'fixture-only-token';
const sensitive = 'private-routing-fixture';
const hosts = ['control.lythaus.co', 'admin.lythaus.co', 'admin-api.lythaus.co'];
const id = number => number.toString(16).padStart(32, '0');

function response(result, resultInfo) {
  return Response.json({ success:true, result, ...(resultInfo && {result_info:resultInfo}) });
}

function page(rows, current = 1, total = rows.length, size = 50) {
  return response(rows, {page:current, count:rows.length, per_page:size, total_count:total,
    total_pages:Math.ceil(total / size)});
}

// Treat unrecognized endpoints as a test failure, including when a collector
// catches a transport exception and returns an incomplete report.
async function collect(overrides = {}) {
  const calls = [];
  const unrecognized = [];
  const respond = new Map([
    [dns, []], [domains, []], [routes, []], [pageRules, []], [projects, []], [apps, []],
    [singleRedirect, () => response({phase:'http_request_dynamic_redirect',rules:[]})],
    [bulkRedirect, () => response({phase:'http_request_redirect',rules:[]})],
    ...Object.entries(overrides),
  ]);
  const report = await inspectControlRouting({token, fetchImpl:async (input, options) => {
    const url = new URL(input);
    calls.push({url,options});
    if (!respond.has(url.pathname)) {
      unrecognized.push(url.pathname);
      throw Error('Unexpected fixture path');
    }
    const value = respond.get(url.pathname);
    if (typeof value === 'function') return value(url);
    const paginated = [dns, projects, apps].includes(url.pathname) || url.searchParams.has('page') ||
      url.pathname.endsWith('/policies');
    return paginated ? page(value) : response(value);
  }});
  assert.deepEqual(unrecognized, []);
  for (const {url,options} of calls) {
    assert.equal(url.origin, 'https://api.cloudflare.com');
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.equal(options.body, undefined);
    const headers = new Headers(options.headers);
    assert.equal(headers.get('authorization'), 'Bearer ' + token);
    assert.equal(url.search.includes(token), false);
  }
  assert.equal(report.routingDecision, 'REHEARSAL_ONLY');
  assert.equal(report.mutationCount, 0);
  assert.equal(JSON.stringify(report).includes(sensitive), false);
  assert.equal(JSON.stringify(report).includes(token), false);
  return {report,calls};
}

test('the matcher respects host boundaries across exact and wildcard URL patterns', () => {
  for (const host of hosts) {
    assert.equal(coversHost('https://*.lythaus.co/private',host),true);
    assert.equal(coversHost(host + '/health', host),true);
    assert.equal(coversHost(host + '.example/health', host),false);
    assert.equal(coversHost('lythaus.co/health', host),false);
  }
});

test('complete empty provider responses and missing inventory evidence have distinct results', async () => {
  const {report} = await collect();
  assert.deepEqual(report.claims.map(claim => claim.host), hosts);
  assert.deepEqual(report.incomplete, []);
  for (const claim of report.claims) {
    for (const key of ['dns','workers','defaults','routes','pages','access','pageRules']) assert.deepEqual(claim[key], []);
  }
  assert.deepEqual(report.redirects,{single:0,bulk:0});
  const missing = await collect({
    [dns]:() => response([]),
    [routes]:() => new Response(null,{status:404}),
    [bulkRedirect]:() => new Response(null,{status:404}),
    [accountRulesets]:() => new Response(null,{status:403}),
  });
  assert.ok(missing.report.incomplete.some(row => row.label === 'dns'));
  assert.ok(missing.report.incomplete.some(row => row.label === 'worker_routes'));
  assert.ok(missing.report.incomplete.some(row => row.label === 'bulk'));
  assert.equal(missing.report.redirects.bulk,null);
});

test('the report retains exact known paths and existing claims without provider selectors, secrets or redirect destinations', async () => {
  const worker = 'lythaus-admin-api-development';
  const subdomain = account + '/workers/scripts/' + worker + '/subdomain';
  const policies = apps + '/' + id(6) + '/policies';
  const known = ['/health','/internal/readiness/database-identity','/api/admin/production-auth-acceptance/*'];
  const {report} = await collect({
    [dns]:[{id:id(1),type:'CNAME',name:'*.lythaus.co',content:sensitive,proxied:true}],
    [domains]:[{id:id(2),hostname:hosts[2],service:worker}],
    [subdomain]:() => response({enabled:false,previews_enabled:false}),
    [routes]:[
      ...known.map((path,i) => ({id:id(i+3),pattern:hosts[2]+path,script:worker})),
      {id:id(15),pattern:hosts[1] + '/' + sensitive,script:sensitive},
    ],
    [apps]:[{id:id(6),type:'self_hosted',aud:sensitive,allowed_idps:[sensitive],
      destinations:[...known.map(path => ({type:'public',uri:hosts[2] + path})),
        {type:'private',uri:sensitive}]}],
    [policies]:[{id:id(7),decision:'allow',precedence:1,include:[{email:sensitive}]},
      {id:id(8),decision:'non_identity',precedence:2,include:[{service_token:{token_id:sensitive}}]}],
    [pageRules]:[{id:id(9),status:'active',targets:[{target:'url',constraint:{value:'*'+hosts[0]+'/*'}}],
      actions:[{id:'forwarding_url',value:{url:sensitive,status_code:301}}]}],
    [singleRedirect]:() => response({phase:'http_request_dynamic_redirect',rules:[{enabled:true,expression:sensitive,
      action_parameters:{from_value:{target_url:{value:sensitive}}}}]}),
  });
  const [control,admin,api] = report.claims;
  assert.ok(report.claims.every(claim => claim.dns[0].wildcard));
  assert.deepEqual(api.routes.map(row => row.path).sort(), [...known].sort());
  assert.deepEqual(api.access[0].paths.sort(), [...known].sort());
  assert.equal(api.access[0].decisions.allow,1);
  assert.equal(api.access[0].decisions.service,1);
  assert.equal(api.workers[0].service,worker);
  assert.ok(api.defaults.some(row => row.service === worker && row.workersDev === false && row.previews === false));
  assert.equal(admin.routes[0].path,'other');
  assert.equal(admin.routes[0].script,'other');
  assert.equal(control.pageRules[0].forwarding,true);
  assert.equal(report.redirects.single,1);
  assert.ok(report.incomplete.some(row => row.label === 'single'));
});

test('nested Pages assignments remain visible when the project summary omits a hostname', async () => {
  const name = 'lythaus-control-panel';
  const row = {id:id(71),name,canonical_deployment:{id:id(72)},domains:[]};
  const nested = projects + '/' + name + '/domains';
  const {report,calls} = await collect({
    [projects]:[row],
    [nested]:() => response([{id:id(73),name:hosts[0],status:'active'}]),
  });
  assert.ok(calls.some(({url}) => url.pathname === nested));
  assert.equal(report.claims[0].pages[0].id,row.id);
  assert.equal(report.claims[0].pages[0].deploymentId,row.canonical_deployment.id);
  const blocked = await collect({[projects]:[row],[nested]:() => new Response(null,{status:403})});
  assert.ok(blocked.report.incomplete.some(entry => entry.status === 403));
});

test('a private Access destination confers no public claim and unknown destination types stay unverified', async () => {
  const {report} = await collect({
    [apps]:[{id:id(8),type:'self_hosted',destinations:[
      {type:'private',uri:hosts[0]+'/flags'},
      {type:'unclassified_fixture',uri:hosts[0]+'/'+sensitive},
    ]}],
  });
  assert.deepEqual(report.claims[0].access,[]);
  assert.ok(report.incomplete.some(row => row.label === 'access'));
});

test('inconsistent provider pagination never authorizes an empty hostname', async () => {
  const record = n => ({id:id(n),name:hosts[0],type:'CNAME',proxied:true,content:sensitive});
  for (const second of [() => page([record(1)],2,2,1), () => page([record(2)],2,3,1)]) {
    const {report} = await collect({[dns]: url => url.searchParams.get('page') === '1'
      ? page([record(1)],1,2,1) : second()});
    assert.ok(report.incomplete.some(row => row.label === 'dns'));
  }
});

test('a rate limit stops further GETs and preserves a numeric Retry-After without raw headers', async () => {
  const {report,calls} = await collect({[dns]:() => new Response(sensitive,{status:429,
    headers:{'retry-after':'73','x-fixture-private':sensitive}})});
  assert.equal(calls.length,1);
  assert.ok(report.incomplete.some(row => row.label === 'dns' && row.status === 429 && row.retryAfterSeconds === 73));
  const denied = await collect({[dns]:() => new Response(sensitive,{status:401})});
  assert.equal(denied.calls.length,1);
  assert.ok(denied.report.incomplete.some(row => row.status === 401));
});

test('malformed provider fields stay out of a partial report', async () => {
  const worker = 'lythaus-admin-api-development';
  const {report} = await collect({
    [domains]:[{id:id(14),hostname:hosts[2],service:worker}],
    [dns]:[{id:id(15),name:hosts[0],type:sensitive,content:sensitive,proxied:sensitive}],
    [routes]:[{id:id(16),pattern:hosts[0] + '/' + sensitive,script:{value:sensitive}}],
    [account + '/workers/scripts/' + worker + '/subdomain']:() => response({
      enabled:sensitive,previews_enabled:{privateValue:sensitive},
    }),
  });
  const [control,,api] = report.claims;
  assert.deepEqual(control.dns,[{id:id(15),type:'other',wildcard:false,proxied:null}]);
  assert.deepEqual(control.routes,[{id:id(16),path:'other',wildcard:false,script:'other'}]);
  assert.deepEqual(api.defaults,[{service:worker,workersDev:null,previews:null}]);
  for (const label of ['dns','worker_routes','worker_defaults']) assert.ok(report.incomplete.some(row => row.label === label));
});

test('a missing entrypoint needs a complete inventory of its own phase and scope', async () => {
  const noEntrypoint = () => new Response(null,{status:404});
  const listing = rows => response(rows,{count:rows.length,cursor:''});
  const {report,calls} = await collect({
    [singleRedirect]:noEntrypoint, [bulkRedirect]:noEntrypoint,
    [zoneRulesets]:() => listing([{id:id(55),kind:'zone',phase:'http_request_firewall_custom'}]),
    [accountRulesets]:() => listing([{id:id(56),kind:'root',phase:'http_request_redirect'}]),
  });
  assert.equal(report.redirects.single,0);
  assert.equal(report.redirects.bulk,null);
  assert.ok(report.incomplete.some(row => row.label === 'bulk'));
  assert.ok(calls.some(({url}) => url.pathname === zoneRulesets));
  assert.ok(calls.some(({url}) => url.pathname === accountRulesets));
});

test('untrusted project identifiers cannot expand the provider read scope', async () => {
  const {report} = await collect({
    [projects]:[{id:id(74),name:'../../'+sensitive,domains:[]}],
  });
  assert.ok(report.incomplete.length > 0);
});

test('all cursor pages must reconcile before a phase can be reported absent', async () => {
  const cursor = 'private-next-page-token';
  const row = n => ({id:id(n),kind:'zone',phase:'http_request_firewall_custom'});
  async function probe(second) {
    return collect({
      [singleRedirect]:() => new Response(null,{status:404}),
      [zoneRulesets]:url => {
        const next = url.searchParams.get('cursor');
        if (!next) return response([row(81)],{count:1,total_count:2,cursor});
        assert.equal(next,cursor);
        return second();
      },
    });
  }
  const complete = await probe(() => response([row(82)],{count:1,total_count:2}));
  assert.equal(complete.report.redirects.single,0);
  assert.equal(complete.calls.filter(({url}) => url.pathname === zoneRulesets).length,2);
  const mismatch = await probe(() => response([row(81)],{count:1,total_count:2}));
  assert.equal(mismatch.report.redirects.single,null);
  assert.ok(mismatch.report.incomplete.some(row => row.label === 'single'));
  assert.equal(JSON.stringify(mismatch.report).includes(cursor),false);
});

test('numbered inventories reporting zero pages cannot certify nonempty rows', async () => {
  const record = {id:id(99),name:hosts[0],type:'A',proxied:true,content:sensitive};
  const {report} = await collect({[dns]:() => response([record],{page:1,count:1,total_pages:0})});
  assert.ok(report.incomplete.some(row => row.label === 'dns'));
});

test('a full ruleset batch with no terminal evidence cannot establish redirect absence', async () => {
  const rows = Array.from({length:50},(_,i) => ({id:id(i+1),kind:'custom',phase:'http_request_firewall_custom'}));
  async function check(info) {
    return (await collect({[bulkRedirect]:() => new Response(null,{status:404}),
      [accountRulesets]:() => response(rows,info)})).report;
  }
  for (const info of [{count:50}, {count:49,cursor:''},
    {count:50,cursors:{after:sensitive}}, {count:50,total_count:51,cursor:''}]) {
    const report = await check(info);
    assert.equal(report.redirects.bulk,null);
    assert.ok(report.incomplete.some(row => row.label === 'bulk'));
  }
  assert.equal((await check({count:50,total_count:50})).redirects.bulk,0);
});

test('a matching wildcard is reported even when policy or Page Rule detail remains unknown', async () => {
  const wildcard = '*.lythaus.co/flags';
  const policyPath = apps + '/' + id(31) + '/policies';
  const {report} = await collect({
    [apps]:[{id:id(31),type:'self_hosted',destinations:[{type:'public',uri:wildcard}]},
      {id:id(32),type:sensitive,domain:hosts[0] + '/flags'}, {id:id(33),type:{unknown:sensitive}}],
    [policyPath]:[{id:id(34),decision:sensitive,include:[{private:sensitive}]}],
    [pageRules]:[{id:id(35),status:'active',targets:[{target:'url',constraint:{operator:'matches',value:wildcard}}],
      actions:{unknown:sensitive}}],
  });
  for (const claim of report.claims) {
    assert.deepEqual(claim.access.map(app => [app.id,app.paths,app.decisions.other]), [[id(31),['/flags'],1]]);
    assert.equal(claim.pageRules[0].id,id(35));
  }
  for (const status of ['unknown_actions','other_application_claim','app_type_unverified','unknown_decision']) {
    assert.ok(report.incomplete.some(row => row.status === status));
  }
});


test('unrelated service-record owners do not obscure complete DNS evidence', async () => {
  const {report} = await collect({[dns]:[
    {id:id(201),name:'_dmarc.lythaus.co',type:'TXT',content:sensitive},
    {id:id(202),name:'selector._domainkey.lythaus.co.',type:'TXT',content:sensitive},
    {id:id(203),name:'_acme-challenge.control.lythaus.co',type:'TXT',content:sensitive},
    {id:id(204),name:'_service._tcp.admin.lythaus.co',type:'SRV',content:sensitive},
  ]});
  assert.deepEqual(report.incomplete,[]);
  for (const claim of report.claims) assert.deepEqual(claim.dns,[]);
  assert.equal(coversHost('bad_http_name.lythaus.co','bad_http_name.lythaus.co'),false);
  assert.ok(!JSON.stringify(report).includes(sensitive));
});

test('a Pages custom domain can be identified by its domain_id or its scoped name', async () => {
  const project = {id:id(211),name:'lythaus-web',domains:[]};
  const {report} = await collect({
    [projects]:[project],
    [projects + '/lythaus-web/domains']:[{domain_id:id(212),name:hosts[0]},{domain:hosts[1]}],
  });
  assert.deepEqual(report.incomplete,[]);
  assert.ok(report.claims.slice(0,2).every(claim => claim.pages[0].id === project.id));
});
