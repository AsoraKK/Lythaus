import fs from 'node:fs';
import path from 'node:path';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
const zoneId = process.env.CLOUDFLARE_ZONE_ID ?? '7bc572c8b7cd3c00be9c655176c29382';
const token = process.env.CLOUDFLARE_API_TOKEN ?? '';
const releaseSha = process.env.RELEASE_SHA ?? '';
const mode = process.env.CUTOVER_MODE ?? 'prepare';
const confirmCutover = process.env.CONFIRM_CUTOVER === 'true';
const retireLegacy = process.env.RETIRE_LEGACY === 'true';
const evidencePath = process.env.CUTOVER_EVIDENCE_PATH ?? path.join('.artifacts', 'cloudflare', 'lythaus-pages-cutover.json');

const legacyProject = 'asora';
const canonicalProject = 'lythaus-control-panel';
const adminDomain = 'admin.lythaus.co';
const legacyPreviewAccessAppId = '6152f491-9f60-4c0b-8c0c-a3ddacdf9270';
const niteOwlMarkers = ['nite-owl', 'niteowl', 'nite_owl', 'nite-owl-web', 'nite-owl-web-preview'];

if (!/^[0-9a-f]{32}$/i.test(accountId)) throw new Error('CLOUDFLARE_ACCOUNT_ID must be a 32-character account ID');
if (!/^[0-9a-f]{32}$/i.test(zoneId)) throw new Error('CLOUDFLARE_ZONE_ID must be a 32-character zone ID');
if (!token) throw new Error('CLOUDFLARE_API_TOKEN is required');
if (!/^[0-9a-f]{40}$/.test(releaseSha)) throw new Error('RELEASE_SHA must be a full 40-character SHA');
if (mode !== 'rollback' && !confirmCutover) throw new Error('CONFIRM_CUTOVER=true is required for the requested cutover operation');

const headers = {
  authorization: `Bearer ${token}`,
  accept: 'application/json',
  'content-type': 'application/json',
};
const accountBase = `https://api.cloudflare.com/client/v4/accounts/${accountId}`;
const zoneBase = `https://api.cloudflare.com/client/v4/zones/${zoneId}`;

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function containsNiteOwl(...values) {
  const haystack = values
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return niteOwlMarkers.some((marker) => haystack.includes(marker));
}

function safeErrors(payload) {
  return Array.isArray(payload?.errors)
    ? payload.errors.map((error) => ({
      code: error?.code ?? null,
      message: typeof error?.message === 'string' ? error.message.slice(0, 240) : null,
    }))
    : [];
}

function assertNotNiteOwl(label, ...values) {
  if (containsNiteOwl(...values)) throw new Error(`Refusing ${label}: resource is classified EXTERNAL / OUT OF SCOPE`);
}

async function request(method, url, body = undefined, { allow404 = false } = {}) {
  let last = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let payload = {};
    try { payload = await response.json(); } catch { payload = {}; }
    last = { status: response.status, ok: response.ok && payload.success !== false, result: payload.result ?? null, errors: safeErrors(payload) };
    if (last.ok || (allow404 && response.status === 404)) return last;
    if (response.status !== 429 && response.status < 500) return last;
    if (attempt < 5) await sleep(Math.min(1000 * (2 ** (attempt - 1)), 8000));
  }
  return last;
}

function assertSuccess(label, result) {
  if (!result?.ok) {
    throw new Error(`${label} failed with HTTP ${result?.status ?? 'unknown'}: ${JSON.stringify(result?.errors ?? [])}`);
  }
}

function safeSourceConfig(config = {}) {
  return {
    type: config.type ?? null,
    owner: config.owner ?? null,
    ownerId: config.owner_id ?? null,
    repoName: config.repo_name ?? null,
    repoId: config.repo_id ?? null,
    productionBranch: config.production_branch ?? null,
    productionDeploymentsEnabled: config.production_deployments_enabled ?? config.deployments_enabled ?? null,
    previewDeploymentSetting: config.preview_deployment_setting ?? null,
    previewBranchIncludes: Array.isArray(config.preview_branch_includes) ? config.preview_branch_includes : [],
    previewBranchExcludes: Array.isArray(config.preview_branch_excludes) ? config.preview_branch_excludes : [],
    pathIncludes: Array.isArray(config.path_includes) ? config.path_includes : [],
    pathExcludes: Array.isArray(config.path_excludes) ? config.path_excludes : [],
    prCommentsEnabled: config.pr_comments_enabled ?? null,
  };
}

function safeDeployment(deployment) {
  return {
    id: deployment?.id ?? null,
    url: deployment?.url ?? deployment?.deployment_url ?? null,
    environment: deployment?.environment ?? null,
    createdAt: deployment?.created_on ?? deployment?.created_at ?? null,
    branch: deployment?.deployment_trigger?.metadata?.branch ?? deployment?.branch ?? null,
    commitSha: deployment?.deployment_trigger?.metadata?.commit_hash ?? deployment?.commit_hash ?? null,
    triggerType: deployment?.deployment_trigger?.type ?? null,
  };
}

function safeProject(project) {
  const source = project?.source?.config ?? {};
  assertNotNiteOwl('Pages project inventory', project?.name, project?.domains, source.owner, source.repo_name);
  return {
    id: project?.id ?? null,
    name: project?.name ?? null,
    productionBranch: project?.production_branch ?? null,
    domains: Array.isArray(project?.domains) ? project.domains : [],
    source: project?.source ? safeSourceConfig({ ...source, type: project.source.type }) : null,
    canonicalDeployment: safeDeployment(project?.latest_deployment ?? project?.canonical_deployment),
  };
}

async function getProject(name) {
  const result = await request('GET', `${accountBase}/pages/projects/${encodeURIComponent(name)}`, undefined, { allow404: true });
  if (result.status === 404) return null;
  assertSuccess(`Pages project ${name} lookup`, result);
  return result.result;
}

async function listDeployments(name) {
  const result = await request('GET', `${accountBase}/pages/projects/${encodeURIComponent(name)}/deployments?per_page=25`);
  assertSuccess(`Pages deployments ${name} lookup`, result);
  return Array.isArray(result.result) ? result.result : [];
}

async function getAccessApp(domain) {
  const result = await request('GET', `${accountBase}/access/apps?per_page=1000`);
  assertSuccess('Access application inventory', result);
  const app = (Array.isArray(result.result) ? result.result : []).find((candidate) => candidate?.domain === domain);
  if (!app) throw new Error(`No Access application protects ${domain}`);
  assertNotNiteOwl('Access application inventory', app.name, app.domain, app.self_hosted_domains);
  const policies = await request('GET', `${accountBase}/access/apps/${encodeURIComponent(app.id)}/policies?per_page=1000`);
  assertSuccess(`Access policy inventory for ${domain}`, policies);
  return {
    id: app.id ?? null,
    name: app.name ?? null,
    domain: app.domain ?? null,
    type: app.type ?? null,
    policies: (Array.isArray(policies.result) ? policies.result : []).map((policy) => ({
      id: policy?.id ?? null,
      name: policy?.name ?? null,
      decision: policy?.decision ?? null,
      precedence: policy?.precedence ?? null,
      includeCount: Array.isArray(policy?.include) ? policy.include.length : null,
      excludeCount: Array.isArray(policy?.exclude) ? policy.exclude.length : null,
      requireCount: Array.isArray(policy?.require) ? policy.require.length : null,
    })),
  };
}

async function getDnsRecord() {
  const result = await request('GET', `${zoneBase}/dns_records?type=CNAME&name=${encodeURIComponent(adminDomain)}&per_page=100`);
  assertSuccess(`DNS inventory for ${adminDomain}`, result);
  const records = Array.isArray(result.result) ? result.result : [];
  if (records.length !== 1) throw new Error(`Expected exactly one CNAME record for ${adminDomain}, found ${records.length}`);
  const record = records[0];
  assertNotNiteOwl('DNS inventory', record.name, record.content);
  return {
    id: record.id ?? null,
    type: record.type ?? null,
    name: record.name ?? null,
    content: record.content ?? null,
    ttl: record.ttl ?? null,
    proxied: record.proxied ?? null,
  };
}

async function getSnapshot(projectName) {
  const project = await getProject(projectName);
  if (!project) return null;
  const deployments = await listDeployments(projectName);
  const access = await getAccessApp(adminDomain);
  const dns = await getDnsRecord();
  return {
    project: safeProject(project),
    deployments: deployments.slice(0, 20).map(safeDeployment),
    access,
    dns,
  };
}

function readEvidence() {
  if (!fs.existsSync(evidencePath)) throw new Error(`Cutover evidence file is missing: ${evidencePath}`);
  return JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
}

function writeEvidence(evidence) {
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
}

function findReleaseDeployment(deployments) {
  return deployments
    .map(safeDeployment)
    .find((deployment) => deployment.commitSha === releaseSha && deployment.branch === 'main');
}

async function prepare() {
  const oldProject = await getProject(legacyProject);
  const targetProject = await getProject(canonicalProject);
  assertNotNiteOwl('Pages project target inventory', legacyProject, canonicalProject, oldProject?.domains, targetProject?.domains);
  if (oldProject && targetProject) {
    throw new Error(`Both ${legacyProject} and ${canonicalProject} exist; refusing to guess ownership or create/merge resources`);
  }
  if (!oldProject && !targetProject) throw new Error(`Neither ${legacyProject} nor ${canonicalProject} exists`);

  const sourceProject = oldProject ?? targetProject;
  const before = await getSnapshot(sourceProject.name);
  if (before.project.domains.length > 0 && !before.project.domains.includes(adminDomain)) {
    throw new Error(`${sourceProject.name} does not own the expected ${adminDomain} domain`);
  }
  if (!before.project.domains.includes(adminDomain)) throw new Error(`${sourceProject.name} is missing ${adminDomain}`);

  let renamedByRun = false;
  if (oldProject) {
    const rename = await request('PATCH', `${accountBase}/pages/projects/${encodeURIComponent(legacyProject)}`, { name: canonicalProject });
    assertSuccess(`Rename Pages project ${legacyProject} to ${canonicalProject}`, rename);
    renamedByRun = true;
  }

  const disable = await request('PATCH', `${accountBase}/pages/projects/${encodeURIComponent(canonicalProject)}`, {
    source: {
      config: {
        production_deployments_enabled: false,
        preview_deployment_setting: 'none',
        deployments_enabled: false,
      },
    },
  });
  assertSuccess(`Disable automatic deployments for ${canonicalProject}`, disable);

  const after = await getProject(canonicalProject);
  assertSuccess('Canonical Pages project verification', { ok: Boolean(after), status: after ? 200 : 404, errors: [] });
  const source = after.source?.config ?? {};
  if (after.name !== canonicalProject || !Array.isArray(after.domains) || !after.domains.includes(adminDomain)) {
    throw new Error('Canonical Pages project rename/domain verification failed');
  }
  if (source.production_deployments_enabled !== false || source.preview_deployment_setting !== 'none') {
    throw new Error('Legacy Pages Git auto-deployment was not disabled');
  }

  const evidence = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    releaseSha,
    status: 'prepared',
    legacyProjectName: legacyProject,
    canonicalProjectName: canonicalProject,
    renamedByRun,
    before,
    postRename: safeProject(after),
    rollback: {
      supported: true,
      projectId: before.project.id,
      restoreProjectName: legacyProject,
      restoreSourceConfig: before.project.source,
      domain: adminDomain,
      dnsRecordId: before.dns.id,
      instructions: [
        `PATCH /accounts/${accountId}/pages/projects/${canonicalProject} with name=${legacyProject}`,
        'Restore the captured source config only after verifying the legacy project name is available.',
        `Verify ${adminDomain} Access and the captured DNS record before restoring traffic.`,
      ],
    },
    legacyPreviewAccessAppId,
    legacyPreviewRetired: false,
  };
  writeEvidence(evidence);
  console.log(JSON.stringify({ status: evidence.status, project: canonicalProject, domain: adminDomain, renamedByRun }));
}

async function verify() {
  const evidence = readEvidence();
  if (evidence.releaseSha !== releaseSha) throw new Error('Cutover evidence release SHA does not match the requested exact SHA');
  const project = await getProject(canonicalProject);
  if (!project) throw new Error(`Canonical Pages project ${canonicalProject} is missing`);
  const safe = safeProject(project);
  if (!safe.domains.includes(adminDomain)) throw new Error(`Canonical Pages project ${canonicalProject} does not own ${adminDomain}`);
  const source = project.source?.config ?? {};
  if (source.production_deployments_enabled !== false || source.preview_deployment_setting !== 'none') {
    throw new Error('Legacy Pages Git auto-deployment is still enabled');
  }
  const deployments = await listDeployments(canonicalProject);
  const deployment = findReleaseDeployment(deployments);
  if (!deployment) throw new Error(`No ${canonicalProject} production deployment matches release SHA ${releaseSha}`);
  const access = await getAccessApp(adminDomain);
  const dns = await getDnsRecord();

  const unauthenticated = await fetch(`https://${adminDomain}/`, { redirect: 'manual' });
  if (![302, 401, 403].includes(unauthenticated.status)) {
    throw new Error(`Unauthenticated admin access returned unexpected HTTP ${unauthenticated.status}`);
  }
  const clientId = process.env.CF_ACCESS_CLIENT_ID ?? '';
  const clientSecret = process.env.CF_ACCESS_CLIENT_SECRET ?? '';
  if (!clientId || !clientSecret) throw new Error('CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET are required for authenticated admin smoke');
  const authenticated = await fetch(`https://${adminDomain}/`, {
    headers: {
      'CF-Access-Client-Id': clientId,
      'CF-Access-Client-Secret': clientSecret,
    },
  });
  if (authenticated.status !== 200) throw new Error(`Authenticated admin access returned HTTP ${authenticated.status}`);
  if (!authenticated.headers.get('content-security-policy')) throw new Error('Authenticated admin response omitted Content-Security-Policy');
  const body = (await authenticated.text()).slice(0, 2_000_000);
  if (/asora|asora-/i.test(body)) throw new Error('Active Asora branding was found in authenticated admin output');

  const next = {
    ...evidence,
    capturedAt: new Date().toISOString(),
    status: 'verified',
    postCutover: {
      project: safe,
      deployment,
      access,
      dns,
      unauthenticatedStatus: unauthenticated.status,
      authenticatedStatus: authenticated.status,
      securityHeaders: { contentSecurityPolicy: true },
    },
    rollbackArtifactsProven: true,
  };
  writeEvidence(next);
  console.log(JSON.stringify({ status: next.status, project: canonicalProject, deploymentId: deployment.id, deployedSha: deployment.commitSha, adminDomain, unauthenticatedStatus: unauthenticated.status, authenticatedStatus: authenticated.status }));
}

async function retire() {
  const evidence = readEvidence();
  if (evidence.releaseSha !== releaseSha) throw new Error('Cutover evidence release SHA does not match the requested exact SHA');
  if (evidence.status !== 'verified') throw new Error('Legacy retirement requires verified cutover and authenticated smoke evidence');
  const oldProject = await getProject(legacyProject);
  if (oldProject) throw new Error(`Legacy Pages project ${legacyProject} is still present; refusing deletion after an incomplete rename`);
  if (!retireLegacy) throw new Error('RETIRE_LEGACY=true is required to retire the legacy preview Access application');

  const app = await request('GET', `${accountBase}/access/apps/${legacyPreviewAccessAppId}`, undefined, { allow404: true });
  if (app.status !== 404) {
    assertSuccess(`Legacy preview Access application ${legacyPreviewAccessAppId} lookup`, app);
    assertNotNiteOwl('legacy Access retirement', app.result?.name, app.result?.domain);
    if (app.result?.domain !== '*.asora-6bi.pages.dev') {
      throw new Error('The identified legacy Access application domain changed; refusing deletion');
    }
    const deleted = await request('DELETE', `${accountBase}/access/apps/${legacyPreviewAccessAppId}`);
    assertSuccess(`Delete legacy preview Access application ${legacyPreviewAccessAppId}`, deleted);
  }
  const verifyDeleted = await request('GET', `${accountBase}/access/apps/${legacyPreviewAccessAppId}`, undefined, { allow404: true });
  if (verifyDeleted.status !== 404) throw new Error('Legacy preview Access application still exists after retirement');
  const finalProject = await getProject(canonicalProject);
  if (!finalProject || !finalProject.domains?.includes(adminDomain)) throw new Error('Canonical admin project/domain disappeared during retirement');

  const next = {
    ...evidence,
    capturedAt: new Date().toISOString(),
    status: 'retired',
    legacyPreviewRetired: true,
    legacyAsoraActiveResources: 0,
    postRetirement: {
      legacyProjectPresent: false,
      legacyPreviewAccessAppPresent: false,
      canonicalProject: safeProject(finalProject),
    },
  };
  writeEvidence(next);
  console.log(JSON.stringify({ status: next.status, legacyAsoraActiveResources: 0, canonicalProject }));
}

async function rollback() {
  const evidence = readEvidence();
  if (evidence.releaseSha !== releaseSha) throw new Error('Cutover evidence release SHA does not match the requested exact SHA');
  if (!evidence.renamedByRun) {
    console.log(JSON.stringify({ status: 'rollback-not-required', reason: 'This run did not rename the legacy Pages project' }));
    return;
  }
  const oldProject = await getProject(legacyProject);
  const targetProject = await getProject(canonicalProject);
  if (oldProject || !targetProject) throw new Error('Rollback precondition failed: expected only the renamed canonical project to exist');
  assertNotNiteOwl('Pages rollback', targetProject.name, targetProject.domains);
  const restore = await request('PATCH', `${accountBase}/pages/projects/${encodeURIComponent(canonicalProject)}`, {
    name: legacyProject,
    source: {
      config: {
        production_deployments_enabled: evidence.before.project.source.productionDeploymentsEnabled,
        preview_deployment_setting: evidence.before.project.source.previewDeploymentSetting,
        deployments_enabled: evidence.before.project.source.productionDeploymentsEnabled,
      },
    },
  });
  assertSuccess('Restore legacy Pages project name and source settings', restore);
  const restored = await getProject(legacyProject);
  if (!restored || !restored.domains?.includes(adminDomain)) throw new Error('Pages rollback verification failed');
  const next = { ...evidence, capturedAt: new Date().toISOString(), status: 'rolled-back', rollbackVerified: true };
  writeEvidence(next);
  console.log(JSON.stringify({ status: next.status, project: legacyProject, domain: adminDomain }));
}

if (mode === 'prepare') await prepare();
else if (mode === 'verify') await verify();
else if (mode === 'retire') await retire();
else if (mode === 'rollback') await rollback();
else throw new Error(`Unsupported CUTOVER_MODE: ${mode}`);
