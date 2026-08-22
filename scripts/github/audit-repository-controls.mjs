import fs from 'node:fs';
import path from 'node:path';

const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
const repository = process.env.GITHUB_REPOSITORY || '';
const apiBase = process.env.GITHUB_API_URL || 'https://api.github.com';
const outputPath = process.env.GITHUB_CONTROLS_AUDIT_OUTPUT || '.artifacts/repository-controls/github.json';

if (!token) throw new Error('GH_TOKEN or GITHUB_TOKEN is required');
if (!/^[^/]+\/[^/]+$/.test(repository)) throw new Error('GITHUB_REPOSITORY must be owner/name');

const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
};

async function request(endpoint) {
  try {
    const response = await fetch(`${apiBase}${endpoint}`, { headers });
    let payload = {};
    try { payload = await response.json(); } catch { /* keep an empty sanitized response */ }
    return {
      status: response.status,
      ok: response.ok,
      result: payload,
      error: response.ok ? null : String(payload?.message ?? `HTTP ${response.status}`).slice(0, 240),
    };
  } catch (error) {
    return { status: null, ok: false, result: {}, error: String(error?.message ?? error).slice(0, 240) };
  }
}

async function list(endpoint) {
  const items = [];
  let page = 1;
  while (true) {
    const response = await request(`${endpoint}${endpoint.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    if (!response.ok) return { ...response, items };
    const pageItems = Array.isArray(response.result) ? response.result : Array.isArray(response.result?.secrets)
      ? response.result.secrets : Array.isArray(response.result?.variables) ? response.result.variables
        : Array.isArray(response.result?.environments) ? response.result.environments
          : Array.isArray(response.result?.installations) ? response.result.installations : [];
    items.push(...pageItems);
    if (pageItems.length < 100) return { ...response, items };
    page += 1;
  }
}

function endpointSummary(response) {
  return { status: response.status, ok: response.ok, error: response.error };
}

const secretResponse = await list(`/repos/${repository}/actions/secrets`);
const variableResponse = await list(`/repos/${repository}/actions/variables`);
const environmentResponse = await list(`/repos/${repository}/environments`);
const deployKeyResponse = await list(`/repos/${repository}/keys`);
const hookResponse = await list(`/repos/${repository}/hooks`);
const installationResponse = await list(`/repos/${repository}/installations`);
const actionsPermissionResponse = await request(`/repos/${repository}/actions/permissions`);

const environments = await Promise.all(environmentResponse.items.map(async (environment) => {
  const name = environment.name;
  if (typeof name !== 'string' || name.length === 0) return { name: null, controls: null };
  const [secrets, variables] = await Promise.all([
    list(`/repos/${repository}/environments/${encodeURIComponent(name)}/secrets`),
    list(`/repos/${repository}/environments/${encodeURIComponent(name)}/variables`),
  ]);
  return {
    name,
    protection: {
      waitTimer: environment.wait_timer ?? null,
      reviewersRequired: environment.protection_rules?.length ?? 0,
      preventSelfReview: environment.prevent_self_review ?? null,
    },
    controls: {
      secrets: secrets.items.map(({ name: itemName }) => itemName).filter(Boolean).sort(),
      variables: variables.items.map(({ name: itemName, value }) => ({ name: itemName, valuePresent: value !== undefined })).filter(({ name }) => name).sort((a, b) => a.name.localeCompare(b.name)),
      endpointState: { secrets: endpointSummary(secrets), variables: endpointSummary(variables) },
    },
  };
}));
const environmentControlsAvailable = environments.every(({ controls }) => controls?.endpointState?.secrets?.ok && controls?.endpointState?.variables?.ok);

const report = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  repository,
  mutationPerformed: false,
  status: [secretResponse, variableResponse, environmentResponse, deployKeyResponse, hookResponse, installationResponse, actionsPermissionResponse].every(({ ok }) => ok) && environmentControlsAvailable ? 'VERIFIED' : 'PARTIAL/UNKNOWN',
  endpointState: {
    repositorySecrets: endpointSummary(secretResponse),
    repositoryVariables: endpointSummary(variableResponse),
    environments: endpointSummary(environmentResponse),
    deployKeys: endpointSummary(deployKeyResponse),
    hooks: endpointSummary(hookResponse),
    installations: endpointSummary(installationResponse),
    actionsPermissions: endpointSummary(actionsPermissionResponse),
  },
  controls: {
    repositorySecrets: secretResponse.items.map(({ name }) => name).filter(Boolean).sort(),
    repositoryVariables: variableResponse.items.map(({ name, value }) => ({ name, valuePresent: value !== undefined })).filter(({ name }) => name).sort((a, b) => a.name.localeCompare(b.name)),
    environments,
    deployKeys: deployKeyResponse.items.map(({ id, key, title, read_only: readOnly, created_at: createdAt }) => ({ id, keyType: typeof key === 'string' ? key.split(' ')[0] : null, title, readOnly: readOnly ?? null, createdAt: createdAt ?? null })),
    hooks: hookResponse.items.map(({ id, name, active, events, type, updated_at: updatedAt }) => ({ id, name, active: active ?? null, events: Array.isArray(events) ? events : [], type: type ?? null, updatedAt: updatedAt ?? null })),
    installations: installationResponse.items.map(({ id, app_id: appId, app_slug: appSlug, target_type: targetType, permissions }) => ({ id, appId, appSlug, targetType, permissionKeys: permissions ? Object.keys(permissions).sort() : [] })),
    actionsPermissions: actionsPermissionResponse.ok ? {
      enabled: actionsPermissionResponse.result.enabled ?? null,
      allowedActions: actionsPermissionResponse.result.allowed_actions ?? null,
      shaPinned: actionsPermissionResponse.result.sha_pinning_required ?? null,
    } : null,
  },
  humanReviewRequired: [
    'Classify retained secret and variable names; values are intentionally never exported.',
    'Remove obsolete controls only after dependency and rollback review.',
    'Rotate retained credentials after the approved production cutover.',
  ],
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`Wrote sanitized GitHub controls inventory to ${outputPath}; status=${report.status}.`);
