import fs from 'node:fs';
import path from 'node:path';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
const zoneId = process.env.CLOUDFLARE_ZONE_ID ?? '7bc572c8b7cd3c00be9c655176c29382';
const token = process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_AUDIT_API_TOKEN || '';
const outputPath = process.env.CLOUDFLARE_AUDIT_OUTPUT ?? '.artifacts/provider-inventory/cloudflare.json';

if (!/^[0-9a-f]{32}$/i.test(accountId)) throw new Error('CLOUDFLARE_ACCOUNT_ID is required');
if (!/^[0-9a-f]{32}$/i.test(zoneId)) throw new Error('CLOUDFLARE_ZONE_ID is required');
if (!token) throw new Error('Cloudflare audit token is required');

const headers = { Authorization: `Bearer ${token}`, 'content-type': 'application/json' };
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function request(url, { attempts = 5 } = {}) {
  let last = { status: null, ok: false, result: null, errors: [{ code: 'REQUEST_FAILED', message: 'No response received' }] };
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers });
      let payload;
      try { payload = await response.json(); } catch { payload = {}; }
      last = {
        status: response.status,
        ok: response.ok && payload?.success !== false,
        result: payload?.result,
        errors: Array.isArray(payload?.errors)
          ? payload.errors.map(({ code, message }) => ({ code, message: String(message ?? '').slice(0, 240) }))
          : [],
      };
      if (last.ok) return last;
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === attempts) return last;
      const retryAfter = Number.parseInt(response.headers.get('retry-after') ?? '', 10);
      const retryAfterMs = Number.isFinite(retryAfter) ? Math.min(Math.max(retryAfter, 1), 15) * 1000 : 0;
      const exponentialMs = Math.min(1000 * (2 ** (attempt - 1)), 8000);
      await sleep(Math.max(retryAfterMs, exponentialMs));
    } catch (error) {
      last = { status: null, ok: false, result: null, errors: [{ code: 'REQUEST_FAILED', message: String(error?.message ?? error).slice(0, 240) }] };
      if (attempt === attempts) return last;
      await sleep(Math.min(1000 * (2 ** (attempt - 1)), 8000));
    }
  }
  return last;
}

function arrayResult(response) {
  return response.ok && Array.isArray(response.result) ? response.result : [];
}

function endpointState(response) {
  return { status: response.status, ok: response.ok, errors: response.errors };
}

const accountBase = `https://api.cloudflare.com/client/v4/accounts/${accountId}`;
const zoneBase = `https://api.cloudflare.com/client/v4/zones/${zoneId}`;

const endpoints = {
  pages: `${accountBase}/pages/projects?per_page=100`,
  workers: `${accountBase}/workers/scripts`,
  hyperdrives: `${accountBase}/hyperdrive/configs`,
  r2: `${accountBase}/r2/buckets`,
  queues: `${accountBase}/queues?per_page=100`,
  workflows: `${accountBase}/workflows?per_page=100`,
  kv: `${accountBase}/storage/kv/namespaces?per_page=100`,
  access: `${accountBase}/access/apps?per_page=1000`,
  turnstile: `${accountBase}/challenges/widgets?per_page=100`,
  dns: `${zoneBase}/dns_records?per_page=500`,
  routes: `${zoneBase}/workers/routes?per_page=100`,
};

const responses = {};
for (const [name, url] of Object.entries(endpoints)) {
  responses[name] = await request(url);
  await sleep(300);
}

const adminSettings = await request(`${accountBase}/workers/scripts/lythaus-admin-api-development/settings`);
const adminBindings = adminSettings.ok && Array.isArray(adminSettings.result?.bindings) ? adminSettings.result.bindings : [];
const publicAccessValues = Object.fromEntries(
  adminBindings
    .filter((binding) => binding?.type === 'plain_text' && ['ACCESS_TEAM_DOMAIN', 'ACCESS_AUDIENCE', 'ACCESS_AUDIENCES', 'ACCESS_JWKS_URL'].includes(binding?.name))
    .map((binding) => [binding.name, String(binding.text ?? '')]),
);

const pages = arrayResult(responses.pages).map((project) => ({
  name: project.name,
  productionBranch: project.production_branch ?? null,
  sourceIntegration: project.source ? {
    type: project.source.type ?? null,
    owner: project.source.config?.owner ?? null,
    repoName: project.source.config?.repo_name ?? null,
    repoId: project.source.config?.repo_id ?? null,
    productionDeploymentsEnabled: project.source.config?.production_deployments_enabled ?? null,
    previewDeploymentSetting: project.source.config?.preview_deployment_setting ?? null,
  } : null,
  domains: Array.isArray(project.domains) ? project.domains : [],
  latestDeployment: project.latest_deployment ? {
    id: project.latest_deployment.id ?? null,
    environment: project.latest_deployment.environment ?? null,
    triggerType: project.latest_deployment.deployment_trigger?.type ?? null,
    commitHash: project.latest_deployment.deployment_trigger?.metadata?.commit_hash ?? null,
  } : null,
}));

const workers = arrayResult(responses.workers).map((worker) => ({
  name: worker.id ?? worker.name ?? null,
  modifiedOn: worker.modified_on ?? null,
}));

const hyperdrives = arrayResult(responses.hyperdrives).map((item) => ({
  id: item.id ?? null,
  name: item.name ?? null,
  cachingDisabled: item.caching?.disabled ?? null,
}));

const r2 = arrayResult(responses.r2).map((bucket) => ({ name: bucket.name ?? null, creationDate: bucket.creation_date ?? null }));
const queues = arrayResult(responses.queues).map((queue) => ({ id: queue.queue_id ?? queue.id ?? null, name: queue.queue_name ?? queue.name ?? null }));
const workflows = arrayResult(responses.workflows).map((workflow) => ({ id: workflow.id ?? null, name: workflow.name ?? null }));
const kv = arrayResult(responses.kv).map((namespace) => ({ id: namespace.id ?? null, title: namespace.title ?? null }));
const access = arrayResult(responses.access).map((app) => ({ id: app.id ?? null, name: app.name ?? null, type: app.type ?? null, domain: app.domain ?? null, aud: app.aud ?? null }));
const turnstile = arrayResult(responses.turnstile).map((widget) => ({ sitekey: widget.sitekey ?? null, name: widget.name ?? null, domains: widget.domains ?? [], mode: widget.mode ?? null }));
const dns = arrayResult(responses.dns).map((record) => ({ id: record.id ?? null, type: record.type ?? null, name: record.name ?? null, proxied: record.proxied ?? null }));
const routes = arrayResult(responses.routes).map((route) => ({ id: route.id ?? null, pattern: route.pattern ?? null, script: route.script ?? null }));

const deployHookEntries = [];
for (const name of workers.map(({ name }) => name).filter((value) => typeof value === 'string' && value.length > 0)) {
  deployHookEntries.push([name, await request(`${accountBase}/builds/workers/${encodeURIComponent(name)}/deploy_hooks`)]);
  await sleep(300);
}
const deployHooks = Object.fromEntries(deployHookEntries.map(([name, response]) => [
  name,
  arrayResult(response).map((hook) => ({
    id: hook.deploy_hook_uuid ?? hook.id ?? null,
    name: hook.deploy_hook_name ?? hook.name ?? null,
    branch: hook.branch ?? null,
    createdOn: hook.created_on ?? null,
  })),
]));
const integrations = pages
  .filter(({ sourceIntegration }) => sourceIntegration !== null)
  .map(({ name, sourceIntegration }) => ({ project: name, ...sourceIntegration }));

const retiredBrand = ['as', 'ora'].join('');
const legacyPattern = new RegExp(retiredBrand, 'i');
const legacyNamedResources = [
  ...pages.filter(({ name }) => legacyPattern.test(name ?? '')).map(({ name }) => ({ type: 'pages', name })),
  ...workers.filter(({ name }) => legacyPattern.test(name ?? '')).map(({ name }) => ({ type: 'worker', name })),
  ...access.filter(({ name, domain }) => legacyPattern.test(name ?? '') || legacyPattern.test(domain ?? '')).map(({ name }) => ({ type: 'access', name })),
  ...kv.filter(({ title }) => legacyPattern.test(title ?? '')).map(({ title }) => ({ type: 'kv', name: title })),
  ...queues.filter(({ name }) => legacyPattern.test(name ?? '')).map(({ name }) => ({ type: 'queue', name })),
  ...workflows.filter(({ name }) => legacyPattern.test(name ?? '')).map(({ name }) => ({ type: 'workflow', name })),
];

const endpointStates = Object.fromEntries(Object.entries(responses).map(([name, response]) => [name, endpointState(response)]));
const deployHookState = Object.fromEntries(deployHookEntries.map(([name, response]) => [name, endpointState(response)]));
const failedEndpoints = [
  ...Object.entries(endpointStates).filter(([, state]) => !state.ok).map(([name]) => name),
  ...Object.entries(deployHookState).filter(([, state]) => !state.ok).map(([name]) => `deployHooks:${name}`),
];

const report = {
  schemaVersion: 2,
  capturedAt: new Date().toISOString(),
  accountId,
  zoneId,
  complete: failedEndpoints.length === 0 && adminSettings.ok,
  failedEndpoints: adminSettings.ok ? failedEndpoints : [...failedEndpoints, 'adminWorkerSettings'],
  endpointState: {
    ...endpointStates,
    deployHooks: deployHookState,
  },
  adminWorkerSettings: { state: endpointState(adminSettings), access: publicAccessValues },
  resources: { pages, workers, hyperdrives, r2, queues, workflows, kv, access, turnstile, dns, routes, integrations, deployHooks },
  legacyNamedResources,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`Wrote sanitized Cloudflare inventory to ${outputPath}; complete=${report.complete}; failed=${report.failedEndpoints.length}; legacy-named resources=${legacyNamedResources.length}.`);
