import fs from 'node:fs';
import path from 'node:path';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
const zoneId = process.env.CLOUDFLARE_ZONE_ID ?? '7bc572c8b7cd3c00be9c655176c29382';
const token = process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_AUDIT_API_TOKEN || '';
const outputPath = process.env.CLOUDFLARE_AUDIT_OUTPUT ?? '.artifacts/provider-inventory/cloudflare.json';
const workersBuildsRequired = process.env.CLOUDFLARE_WORKERS_BUILDS_REQUIRED === 'true';

if (!/^[0-9a-f]{32}$/i.test(accountId)) throw new Error('CLOUDFLARE_ACCOUNT_ID is required');
if (!/^[0-9a-f]{32}$/i.test(zoneId)) throw new Error('CLOUDFLARE_ZONE_ID is required');
if (!token) throw new Error('Cloudflare audit token is required');

const headers = { Authorization: `Bearer ${token}`, 'content-type': 'application/json' };
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const NITE_OWL_MARKERS = ['nite-owl', 'niteowl', 'nite_owl', 'nite-owl-web', 'nite-owl-web-preview'];
const LEGACY_BRAND = 'asora';
const LYTHAUS_REPOSITORY = { owner: 'AsoraKK', name: 'Lythaus' };
const LYTHAUS_WORKER_NAMES = new Set([
  'lythaus-public-api-development',
  'lythaus-admin-api-development',
  'lythaus-jobs-development',
]);

function normalise(value) {
  return String(value ?? '').trim().toLowerCase();
}

function containsNiteOwl(...values) {
  const haystack = values.filter(Boolean).map(normalise).join(' ');
  return NITE_OWL_MARKERS.some((marker) => haystack.includes(marker));
}

function containsLythausDomain(...values) {
  return values
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .filter(Boolean)
    .some((value) => /(^|\.)lythaus\.co(?::\d+)?(\/|$)/i.test(String(value)));
}

function isLythausRepository(owner, repoName) {
  return normalise(owner) === normalise(LYTHAUS_REPOSITORY.owner)
    && normalise(repoName) === normalise(LYTHAUS_REPOSITORY.name);
}

function classifyResource({ name, domain, domains, pattern, script, repoOwner, repoName, type }) {
  if (containsNiteOwl(name, domain, domains, pattern, script, repoOwner, repoName)) {
    return 'EXTERNAL / OUT OF SCOPE';
  }

  const lythausEvidence = normalise(name).startsWith('lythaus-')
    || LYTHAUS_WORKER_NAMES.has(normalise(name))
    || containsLythausDomain(domain, domains, pattern)
    || isLythausRepository(repoOwner, repoName)
    || normalise(name).includes('lythaus');
  const legacyEvidence = normalise(name).includes(LEGACY_BRAND)
    || normalise(domain).includes(LEGACY_BRAND)
    || normalise(pattern).includes(LEGACY_BRAND);

  if (legacyEvidence && lythausEvidence) return 'LEGACY ASORA FOR LYTHAUS';
  if (lythausEvidence || type === 'dns') return 'CANONICAL LYTHAUS';
  return 'EXTERNAL / OUT OF SCOPE';
}

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

function endpointState(response, { classification = 'REQUIRED' } = {}) {
  return {
    status: response.status,
    ok: response.ok,
    classification,
    errors: response.errors,
  };
}

function safeBinding(binding) {
  return {
    name: binding?.name ?? null,
    type: binding?.type ?? null,
    valuePresent: ['plain_text', 'secret_text'].includes(binding?.type) && Boolean(binding?.text || binding?.secret_text),
  };
}

function safeDeployment(deployment) {
  const versions = Array.isArray(deployment?.versions) ? deployment.versions : [];
  return {
    id: deployment?.id ?? null,
    createdOn: deployment?.created_on ?? null,
    strategy: deployment?.strategy ?? null,
    versions: versions.map((version) => ({
      versionId: version?.version_id ?? version?.id ?? null,
      percentage: version?.percentage ?? null,
    })),
  };
}

function safeBuild(build) {
  return {
    id: build?.build_uuid ?? build?.id ?? null,
    status: build?.status ?? null,
    createdAt: build?.created_at ?? null,
    branch: build?.branch ?? build?.build_trigger_metadata?.branch ?? null,
    commitHash: build?.commit_hash ?? build?.build_trigger_metadata?.commit_hash ?? null,
    triggerUuid: build?.trigger?.trigger_uuid ?? null,
  };
}

function safePageDeployment(deployment) {
  return {
    id: deployment?.id ?? null,
    url: deployment?.url ?? deployment?.deployment_url ?? null,
    environment: deployment?.environment ?? null,
    createdAt: deployment?.created_on ?? deployment?.created_at ?? null,
    triggerType: deployment?.deployment_trigger?.type ?? null,
    commitHash: deployment?.deployment_trigger?.metadata?.commit_hash ?? null,
    branch: deployment?.deployment_trigger?.metadata?.branch ?? null,
  };
}

const accountBase = `https://api.cloudflare.com/client/v4/accounts/${accountId}`;
const zoneBase = `https://api.cloudflare.com/client/v4/zones/${zoneId}`;

const endpoints = {
  pages: `${accountBase}/pages/projects`,
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

const rawPages = arrayResult(responses.pages);
const rawWorkers = arrayResult(responses.workers);
const rawAccess = arrayResult(responses.access);

const pages = rawPages.map((project) => {
  const source = project.source?.config ?? {};
  const name = project.name ?? null;
  const classification = classifyResource({
    name,
    domains: project.domains,
    repoOwner: source.owner,
    repoName: source.repo_name,
    type: 'pages',
  });
  return {
    name,
    classification,
    productionBranch: project.production_branch ?? null,
    sourceIntegration: project.source ? {
      type: project.source.type ?? null,
      owner: source.owner ?? null,
      repoName: source.repo_name ?? null,
      repoId: source.repo_id ?? null,
      productionDeploymentsEnabled: source.production_deployments_enabled ?? null,
      previewDeploymentSetting: source.preview_deployment_setting ?? null,
    } : null,
    domains: Array.isArray(project.domains) ? project.domains : [],
    latestDeployment: project.latest_deployment ? safePageDeployment(project.latest_deployment) : null,
  };
});

const workers = rawWorkers.map((worker) => {
  const name = worker.id ?? worker.name ?? null;
  return {
    name,
    tag: worker.tag ?? worker.external_script_id ?? null,
    classification: classifyResource({ name, type: 'worker' }),
    modifiedOn: worker.modified_on ?? null,
  };
});

const hyperdrives = arrayResult(responses.hyperdrives).map((item) => ({
  id: item.id ?? null,
  name: item.name ?? null,
  classification: classifyResource({ name: item.name, type: 'hyperdrive' }),
  cachingDisabled: item.caching?.disabled ?? null,
}));
const r2 = arrayResult(responses.r2).map((bucket) => ({
  name: bucket.name ?? null,
  classification: classifyResource({ name: bucket.name, type: 'r2' }),
  creationDate: bucket.creation_date ?? null,
}));
const queues = arrayResult(responses.queues).map((queue) => {
  const name = queue.queue_name ?? queue.name ?? null;
  return { id: queue.queue_id ?? queue.id ?? null, name, classification: classifyResource({ name, type: 'queue' }) };
});
const workflows = arrayResult(responses.workflows).map((workflow) => {
  const name = workflow.name ?? null;
  return { id: workflow.id ?? null, name, classification: classifyResource({ name, type: 'workflow' }) };
});
const kv = arrayResult(responses.kv).map((namespace) => {
  const name = namespace.title ?? null;
  return { id: namespace.id ?? null, title: name, classification: classifyResource({ name, type: 'kv' }) };
});
const turnstile = arrayResult(responses.turnstile).map((widget) => {
  const name = widget.name ?? null;
  return {
    sitekey: widget.sitekey ?? null,
    name,
    classification: classifyResource({ name, domains: widget.domains, type: 'turnstile' }),
    domains: Array.isArray(widget.domains) ? widget.domains : [],
    mode: widget.mode ?? null,
  };
});
const dns = arrayResult(responses.dns).map((record) => ({
  id: record.id ?? null,
  type: record.type ?? null,
  name: record.name ?? null,
  classification: classifyResource({ name: record.name, type: 'dns' }),
  proxied: record.proxied ?? null,
}));
const routes = arrayResult(responses.routes).map((route) => ({
  id: route.id ?? null,
  pattern: route.pattern ?? null,
  script: route.script ?? null,
  classification: classifyResource({ pattern: route.pattern, script: route.script, type: 'route' }),
}));

const pageDetails = {};
const pageDetailStates = {};
for (const page of pages.filter(({ classification }) => classification !== 'EXTERNAL / OUT OF SCOPE')) {
  const projectId = encodeURIComponent(page.name);
  const detail = await request(`${accountBase}/pages/projects/${projectId}`);
  const domains = await request(`${accountBase}/pages/projects/${projectId}/domains`);
  const deployments = await request(`${accountBase}/pages/projects/${projectId}/deployments?per_page=20`);
  pageDetailStates[page.name] = {
    detail: endpointState(detail),
    domains: endpointState(domains),
    deployments: endpointState(deployments),
  };
  pageDetails[page.name] = {
    detail: detail.ok ? {
      name: detail.result?.name ?? page.name,
      productionBranch: detail.result?.production_branch ?? page.productionBranch,
      sourceIntegration: detail.result?.source?.config ? {
        owner: detail.result.source.config.owner ?? null,
        repoName: detail.result.source.config.repo_name ?? null,
        productionDeploymentsEnabled: detail.result.source.config.production_deployments_enabled ?? null,
        previewDeploymentSetting: detail.result.source.config.preview_deployment_setting ?? null,
      } : page.sourceIntegration,
    } : null,
    customDomains: domains.ok && Array.isArray(domains.result)
      ? domains.result.map((domain) => ({ name: domain.name ?? domain.domain ?? null, status: domain.status ?? null }))
      : [],
    recentDeployments: deployments.ok && Array.isArray(deployments.result)
      ? deployments.result.slice(0, 20).map(safePageDeployment)
      : [],
  };
  await sleep(300);
}

const access = [];
const accessPolicyStates = {};
for (const app of rawAccess) {
  const name = app.name ?? null;
  const domain = app.domain ?? null;
  const classification = classifyResource({ name, domain, type: 'access' });
  const entry = {
    id: app.id ?? app.uid ?? null,
    name,
    type: app.type ?? null,
    domain,
    aud: app.aud ?? null,
    classification,
    policies: [],
  };
  if (classification !== 'EXTERNAL / OUT OF SCOPE' && entry.id) {
    const policies = await request(`${accountBase}/access/apps/${encodeURIComponent(entry.id)}/policies`);
    accessPolicyStates[entry.id] = endpointState(policies);
    if (policies.ok && Array.isArray(policies.result)) {
      entry.policies = policies.result.map((policy) => ({
        id: policy.id ?? policy.uid ?? null,
        name: policy.name ?? null,
        decision: policy.decision ?? null,
        precedence: policy.precedence ?? null,
        includeCount: Array.isArray(policy.include) ? policy.include.length : null,
        excludeCount: Array.isArray(policy.exclude) ? policy.exclude.length : null,
        requireCount: Array.isArray(policy.require) ? policy.require.length : null,
      }));
    }
    await sleep(300);
  }
  access.push(entry);
}

const lythausWorkers = workers.filter(({ classification }) => classification !== 'EXTERNAL / OUT OF SCOPE');
const workerSettings = {};
const workerDeployments = {};
const workerBuilds = {};
const workerBuildStates = {};
for (const worker of lythausWorkers) {
  const encodedName = encodeURIComponent(worker.name);
  const settings = await request(`${accountBase}/workers/scripts/${encodedName}/settings`);
  const deployments = await request(`${accountBase}/workers/scripts/${encodedName}/deployments`);
  workerSettings[worker.name] = {
    state: endpointState(settings),
    bindings: settings.ok && Array.isArray(settings.result?.bindings) ? settings.result.bindings.map(safeBinding) : [],
    compatibilityDate: settings.ok ? settings.result?.compatibility_date ?? null : null,
  };
  workerDeployments[worker.name] = {
    state: endpointState(deployments),
    deployments: deployments.ok
      ? (Array.isArray(deployments.result) ? deployments.result : deployments.result?.deployments ?? []).map(safeDeployment)
      : [],
  };

  if (worker.tag) {
    const triggers = await request(`${accountBase}/builds/workers/${encodeURIComponent(worker.tag)}/triggers`);
    const builds = await request(`${accountBase}/builds/workers/${encodeURIComponent(worker.tag)}/builds?per_page=20`);
    const endpointUnsupported = [400, 404, 405].includes(triggers.status) && [400, 404, 405].includes(builds.status);
    const userScopedBuildsTokenUnavailable = [401, 403].includes(triggers.status)
      && [401, 403].includes(builds.status)
      && [...(triggers.errors ?? []), ...(builds.errors ?? [])].some(({ code }) => String(code) === '10000');
    const buildsNotApplicable = !workersBuildsRequired && (endpointUnsupported || userScopedBuildsTokenUnavailable);
    const buildsClassification = buildsNotApplicable
      ? 'NON_APPLICABLE_CANONICAL_CI_DEPLOYMENT'
      : 'REQUIRED';
    workerBuildStates[worker.name] = {
      tag: worker.tag,
      triggers: endpointState(triggers, { classification: buildsClassification }),
      builds: endpointState(builds, { classification: buildsClassification }),
    };
    workerBuilds[worker.name] = {
      tag: worker.tag,
      triggers: arrayResult(triggers).map((trigger) => ({
        id: trigger.trigger_uuid ?? trigger.id ?? null,
        name: trigger.trigger_name ?? trigger.name ?? null,
        branchIncludes: trigger.branch_includes ?? [],
        branchExcludes: trigger.branch_excludes ?? [],
      })),
      builds: arrayResult(builds).slice(0, 20).map(safeBuild),
    };
    await sleep(300);
  } else {
    workerBuildStates[worker.name] = {
      tag: null,
      triggers: { status: null, ok: true, classification: 'NOT_CONFIGURED', errors: [] },
      builds: { status: null, ok: true, classification: 'NOT_CONFIGURED', errors: [] },
    };
    workerBuilds[worker.name] = { tag: null, triggers: [], builds: [] };
  }
}

const adminWorkerName = 'lythaus-admin-api-development';
const adminSettings = workerSettings[adminWorkerName] ?? {
  state: { status: null, ok: false, classification: 'REQUIRED', errors: [{ code: 'NOT_IN_WORKER_LIST', message: 'Admin Worker was not present in the Lythaus Worker inventory' }] },
  bindings: [],
  compatibilityDate: null,
};
const adminSettingsAccess = adminSettings.bindings.filter(({ name }) => [
  'ACCESS_TEAM_DOMAIN',
  'ACCESS_AUDIENCE',
  'ACCESS_AUDIENCES',
  'ACCESS_JWKS_URL',
].includes(name));

const integrations = pages
  .filter(({ sourceIntegration }) => sourceIntegration !== null)
  .map(({ name, sourceIntegration, classification }) => ({ project: name, classification, ...sourceIntegration }));

const legacyNamedResources = [];
for (const [type, entries] of Object.entries({ pages, workers, hyperdrives, r2, queues, workflows, kv, access, turnstile, dns, routes })) {
  for (const entry of entries) {
    if (entry.classification === 'LEGACY ASORA FOR LYTHAUS') {
      legacyNamedResources.push({ type, name: entry.name ?? entry.title ?? entry.domain ?? entry.pattern ?? null, classification: entry.classification });
    }
  }
}

const ignoredExternalResources = [];
for (const [type, entries] of Object.entries({ pages, workers, hyperdrives, r2, queues, workflows, kv, access, turnstile, dns, routes })) {
  for (const entry of entries) {
    if (entry.classification === 'EXTERNAL / OUT OF SCOPE' && containsNiteOwl(entry.name, entry.title, entry.domain, entry.pattern, entry.script, entry.domains)) {
      ignoredExternalResources.push({ type, name: entry.name ?? entry.title ?? entry.domain ?? entry.pattern ?? null, classification: entry.classification });
    }
  }
}

const endpointStates = Object.fromEntries(Object.entries(responses).map(([name, response]) => [name, endpointState(response)]));
const requiredLythausFailures = [
  ...Object.entries(endpointStates).filter(([, state]) => !state.ok).map(([name]) => name),
  ...Object.entries(pageDetailStates).flatMap(([name, states]) => Object.entries(states).filter(([, state]) => !state.ok).map(([part]) => `pages:${name}:${part}`)),
  ...Object.entries(accessPolicyStates).filter(([, state]) => !state.ok).map(([id]) => `accessPolicies:${id}`),
  ...Object.entries(workerSettings).filter(([, state]) => !state.state.ok).map(([name]) => `workerSettings:${name}`),
  ...Object.entries(workerDeployments).filter(([, state]) => !state.state.ok).map(([name]) => `workerDeployments:${name}`),
  ...Object.entries(workerBuildStates).flatMap(([name, state]) => [
    ...(state.triggers.classification === 'REQUIRED' && !state.triggers.ok ? [`workerBuildTriggers:${name}`] : []),
    ...(state.builds.classification === 'REQUIRED' && !state.builds.ok ? [`workerBuilds:${name}`] : []),
  ]),
];

const deployHookInventory = {
  status: 'NOT_ENUMERABLE_READ_ONLY',
  classification: 'NON_BLOCKING_PROVIDER_LIMITATION',
  endpoint: 'workers/builds/deploy_hooks/<id>',
  reason: 'Cloudflare documents deploy-hook invocation but does not expose a read-only account listing endpoint; Workers Builds triggers and build history are inventoried instead.',
  secretValuesRecorded: false,
};

const resourceCollections = { pages, workers, hyperdrives, r2, queues, workflows, kv, access, turnstile, dns, routes, integrations, deployHooks: Object.fromEntries(lythausWorkers.map(({ name }) => [name, []])) };
const report = {
  schemaVersion: 3,
  capturedAt: new Date().toISOString(),
  accountId,
  zoneId,
  controlPlanes: {
    cloudflareRestApi: 'AVAILABLE',
    cloudflareMcp: 'NOT_USED_IN_WORKFLOW',
    workersBuildsApi: workersBuildsRequired
      ? 'REQUIRED_AND_PERMISSION_CHECKED'
      : 'NON_APPLICABLE_CANONICAL_CI_DEPLOYMENT',
  },
  classificationPolicy: {
    canonical: 'CANONICAL LYTHAUS',
    legacy: 'LEGACY ASORA FOR LYTHAUS',
    external: 'EXTERNAL / OUT OF SCOPE',
    unknown: 'UNKNOWN',
    niteOwlHandling: 'Ignored after account-level enumeration; no per-resource detail or mutation is performed.',
  },
  complete: requiredLythausFailures.length === 0 && adminSettings.state.ok,
  requiredLythausFailures,
  failedEndpoints: requiredLythausFailures,
  endpointState: endpointStates,
  adminWorkerSettings: { state: adminSettings.state, access: adminSettingsAccess },
  pages: { detailState: pageDetailStates, details: pageDetails },
  workerDetails: { settings: workerSettings, deployments: workerDeployments, builds: workerBuilds, buildState: workerBuildStates },
  accessPolicies: accessPolicyStates,
  deployHookInventory,
  resources: resourceCollections,
  resourceClassifications: resourceCollections,
  ignoredExternalResources,
  legacyNamedResources,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`Wrote sanitized Cloudflare inventory to ${outputPath}; complete=${report.complete}; required failures=${requiredLythausFailures.length}; legacy Lythaus resources=${legacyNamedResources.length}; ignored Nite Owl resources=${ignoredExternalResources.length}.`);
