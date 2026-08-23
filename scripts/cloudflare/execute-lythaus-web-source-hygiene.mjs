import fs from 'node:fs';
import path from 'node:path';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
const token = process.env.CLOUDFLARE_API_TOKEN ?? '';
const releaseSha = process.env.RELEASE_SHA ?? '';
const confirmCleanup = process.env.CONFIRM_CLEANUP === 'true';
const projectName = process.env.LYTHAUS_WEB_PAGES_PROJECT ?? 'lythaus-web';
const canonicalDomain = process.env.LYTHAUS_WEB_CANONICAL_DOMAIN ?? 'app.lythaus.co';
const legacyDomain = process.env.LYTHAUS_WEB_LEGACY_DOMAIN ?? 'app.lythaus.asora.co.za';
const evidencePath = process.env.WEB_SOURCE_HYGIENE_EVIDENCE_PATH
  ?? path.join('.artifacts', 'cloudflare', 'lythaus-web-source-hygiene.json');

const niteOwlMarkers = ['nite-owl', 'niteowl', 'nite_owl', 'nite-owl-web', 'nite-owl-web-preview'];

if (!/^[0-9a-f]{32}$/i.test(accountId)) throw new Error('CLOUDFLARE_ACCOUNT_ID must be a 32-character account ID');
if (!token) throw new Error('CLOUDFLARE_API_TOKEN is required');
if (!/^[0-9a-f]{40}$/.test(releaseSha)) throw new Error('RELEASE_SHA must be a full 40-character SHA');
if (!confirmCleanup) throw new Error('CONFIRM_CLEANUP=true is required for the approved web source hygiene operation');
if (projectName !== 'lythaus-web') throw new Error('Only the canonical lythaus-web Pages project is allowlisted');
if (canonicalDomain !== 'app.lythaus.co') throw new Error('Only app.lythaus.co is allowlisted as the canonical web domain');
if (legacyDomain !== 'app.lythaus.asora.co.za') throw new Error('Only the known retired Lythaus Asora-era domain is allowlisted for removal');

const headers = {
  authorization: `Bearer ${token}`,
  accept: 'application/json',
  'content-type': 'application/json',
};
const accountBase = `https://api.cloudflare.com/client/v4/accounts/${accountId}`;
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function containsNiteOwl(...values) {
  const haystack = values
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return niteOwlMarkers.some((marker) => haystack.includes(marker));
}

function assertNotNiteOwl(label, ...values) {
  if (containsNiteOwl(...values)) throw new Error(`Refusing ${label}: resource is EXTERNAL / OUT OF SCOPE`);
}

function safeErrors(payload) {
  return Array.isArray(payload?.errors)
    ? payload.errors.map((error) => ({
      code: error?.code ?? null,
      message: typeof error?.message === 'string' ? error.message.slice(0, 240) : null,
    }))
    : [];
}

async function request(method, url, body = undefined, { allow404 = false } = {}) {
  const readOnly = method === 'GET';
  let last = null;
  for (let attempt = 1; attempt <= (readOnly ? 5 : 1); attempt += 1) {
    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let payload = {};
    try { payload = await response.json(); } catch { payload = {}; }
    last = {
      status: response.status,
      ok: response.ok && payload.success !== false,
      result: payload.result ?? null,
      errors: safeErrors(payload),
    };
    if (last.ok || (allow404 && response.status === 404)) return last;
    if (!readOnly || (response.status !== 429 && response.status < 500) || attempt === 5) return last;
    await sleep(Math.min(1000 * (2 ** (attempt - 1)), 8000));
  }
  return last;
}

function assertSuccess(label, result) {
  if (!result?.ok) {
    throw new Error(`${label} failed with HTTP ${result?.status ?? 'unknown'}: ${JSON.stringify(result?.errors ?? [])}`);
  }
}

function safeSource(source) {
  const config = source?.config ?? {};
  return source ? {
    type: source.type ?? null,
    owner: config.owner ?? null,
    ownerId: config.owner_id ?? null,
    repoName: config.repo_name ?? null,
    repoId: config.repo_id ?? null,
    productionDeploymentsEnabled: config.production_deployments_enabled ?? config.deployments_enabled ?? null,
    previewDeploymentSetting: config.preview_deployment_setting ?? null,
  } : null;
}

function safeDomain(domain) {
  return {
    name: domain?.name ?? domain?.domain ?? null,
    status: domain?.status ?? null,
    domainId: domain?.id ?? domain?.domain_id ?? null,
  };
}

function safeProject(project) {
  assertNotNiteOwl('Pages project inventory', project?.name, project?.domains, project?.source?.config?.owner, project?.source?.config?.repo_name);
  return {
    id: project?.id ?? null,
    name: project?.name ?? null,
    productionBranch: project?.production_branch ?? null,
    domains: Array.isArray(project?.domains) ? project.domains : [],
    source: safeSource(project?.source),
  };
}

async function getProject() {
  const result = await request('GET', `${accountBase}/pages/projects/${encodeURIComponent(projectName)}`);
  assertSuccess(`Pages project ${projectName} lookup`, result);
  return result.result;
}

async function listDomains() {
  const result = await request('GET', `${accountBase}/pages/projects/${encodeURIComponent(projectName)}/domains`);
  assertSuccess(`Pages domains ${projectName} lookup`, result);
  return Array.isArray(result.result) ? result.result : [];
}

function automaticDeploymentsEnabled(source) {
  const config = source?.config ?? {};
  return config.production_deployments_enabled !== false
    || (config.preview_deployment_setting ?? 'all') !== 'none';
}

async function main() {
  const beforeProject = await getProject();
  const beforeDomains = await listDomains();
  const beforeSafeProject = safeProject(beforeProject);
  const beforeSafeDomains = beforeDomains.map(safeDomain);
  const canonical = beforeDomains.find((domain) => (domain?.name ?? domain?.domain) === canonicalDomain);
  const legacy = beforeDomains.find((domain) => (domain?.name ?? domain?.domain) === legacyDomain);

  if (!canonical || canonical.status !== 'active') {
    throw new Error(`Canonical Pages domain ${canonicalDomain} is not active; refusing source cleanup`);
  }

  let automaticDeploymentsDisabled = !automaticDeploymentsEnabled(beforeProject.source);
  if (!automaticDeploymentsDisabled) {
    const disabled = await request('PATCH', `${accountBase}/pages/projects/${encodeURIComponent(projectName)}`, {
      source: {
        config: {
          production_deployments_enabled: false,
          preview_deployment_setting: 'none',
          deployments_enabled: false,
        },
      },
    });
    assertSuccess(`Disable automatic deployments for ${projectName}`, disabled);
    automaticDeploymentsDisabled = true;
  }

  let legacyDomainDetached = !legacy;
  if (legacy) {
    const detached = await request(
      'DELETE',
      `${accountBase}/pages/projects/${encodeURIComponent(projectName)}/domains/${encodeURIComponent(legacyDomain)}`,
    );
    if (!detached.ok && detached.status !== 404) {
      throw new Error(`Detach legacy Pages domain ${legacyDomain} failed with HTTP ${detached.status ?? 'unknown'}: ${JSON.stringify(detached.errors)}`);
    }
    legacyDomainDetached = true;
  }

  const afterProject = await getProject();
  const afterDomains = await listDomains();
  const afterSafeProject = safeProject(afterProject);
  const afterSafeDomains = afterDomains.map(safeDomain);
  const afterCanonical = afterDomains.find((domain) => (domain?.name ?? domain?.domain) === canonicalDomain);
  const afterLegacy = afterDomains.find((domain) => (domain?.name ?? domain?.domain) === legacyDomain);
  if (!afterCanonical || afterCanonical.status !== 'active') throw new Error(`Canonical Pages domain ${canonicalDomain} is not active after cleanup`);
  if (automaticDeploymentsEnabled(afterProject.source)) throw new Error('Automatic Pages deployments remain enabled after cleanup');
  if (afterLegacy) throw new Error(`Legacy Pages domain ${legacyDomain} remains attached after cleanup`);

  const evidence = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    releaseSha,
    status: 'verified',
    project: afterSafeProject,
    canonicalDomain: safeDomain(afterCanonical),
    legacyDomain: {
      name: legacyDomain,
      detached: legacyDomainDetached,
      prior: legacy ? safeDomain(legacy) : null,
      presentAfter: Boolean(afterLegacy),
    },
    automaticDeployments: {
      disabled: automaticDeploymentsDisabled,
      priorEnabled: automaticDeploymentsEnabled(beforeProject.source),
    },
    rollback: {
      artifactsProven: true,
      priorProject: beforeSafeProject,
      priorDomains: beforeSafeDomains,
      instructions: [
        `PATCH /accounts/${accountId}/pages/projects/${projectName} with the captured source configuration, after verifying the canonical project still owns ${canonicalDomain}.`,
        `POST /accounts/${accountId}/pages/projects/${projectName}/domains with {"name":"${legacyDomain}"} only if the retired domain is explicitly approved for rollback and its DNS ownership is verified.`,
        `Re-run the read-only Cloudflare inventory and verify ${canonicalDomain} before restoring any automatic deployment setting.`,
      ],
    },
    niteOwl: 'EXTERNAL / OUT OF SCOPE; no Nite Owl resource was inspected or mutated.',
  };

  fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: evidence.status,
    project: projectName,
    releaseSha,
    canonicalDomain,
    legacyDomainDetached,
    automaticDeploymentsDisabled,
  }));
}

await main();
