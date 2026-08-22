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

function safeText(value, max = 240) {
  return String(value ?? '').replace(/[^\x20-\x7e]/g, ' ').slice(0, max);
}

function safeIdentifier(value, max = 160) {
  const text = safeText(value, max);
  return /^[A-Za-z0-9._:/@+-]+$/.test(text) ? text : null;
}

function safeBoolean(value) {
  return typeof value === 'boolean' ? value : null;
}

function safeInteger(value) {
  return Number.isSafeInteger(value) ? value : null;
}

function safeDate(value) {
  const text = safeText(value, 40);
  return /^\d{4}-\d{2}-\d{2}T[^\s]{1,30}$/.test(text) ? text : null;
}

function safeArray(value, normalizer) {
  return Array.isArray(value) ? value.map(normalizer).filter((item) => item !== null) : [];
}

function extractItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.secrets)) return payload.secrets;
  if (Array.isArray(payload?.variables)) return payload.variables;
  if (Array.isArray(payload?.environments)) return payload.environments;
  if (Array.isArray(payload?.installations)) return payload.installations;
  return [];
}

async function request(endpoint) {
  try {
    const response = await fetch(`${apiBase}${endpoint}`, { headers });
    let payload = {};
    try { payload = await response.json(); } catch { payload = {}; }
    return {
      status: safeInteger(response.status),
      ok: response.ok,
      items: extractItems(payload),
      data: payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {},
      error: response.ok ? null : safeText(payload?.message ?? `HTTP ${response.status}`),
    };
  } catch (error) {
    return { status: null, ok: false, items: [], data: {}, error: safeText(error?.message ?? error) };
  }
}

async function list(endpoint) {
  const items = [];
  let page = 1;
  let response = null;
  while (true) {
    response = await request(`${endpoint}${endpoint.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    if (!response.ok) return { ...response, items };
    items.push(...response.items);
    if (response.items.length < 100) return { ...response, items };
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

const environments = [];
for (const environment of environmentResponse.items) {
  const name = safeIdentifier(environment?.name);
  if (!name) {
    environments.push({ name: null, controls: null });
    continue;
  }
  const secrets = await list(`/repos/${repository}/environments/${encodeURIComponent(name)}/secrets`);
  const variables = await list(`/repos/${repository}/environments/${encodeURIComponent(name)}/variables`);
  environments.push({
    name,
    protection: {
      waitTimer: safeInteger(environment.wait_timer),
      reviewersRequired: Array.isArray(environment.protection_rules) ? environment.protection_rules.length : 0,
      preventSelfReview: safeBoolean(environment.prevent_self_review),
    },
    controls: {
      secrets: safeArray(secrets.items, (item) => safeIdentifier(item?.name)).sort(),
      variables: safeArray(variables.items, (item) => {
        const itemName = safeIdentifier(item?.name);
        return itemName ? { name: itemName, valuePresent: item?.value !== undefined } : null;
      }).sort((a, b) => a.name.localeCompare(b.name)),
      endpointState: { secrets: endpointSummary(secrets), variables: endpointSummary(variables) },
    },
  });
}
const environmentControlsAvailable = environments.every(({ controls }) => controls?.endpointState?.secrets?.ok && controls?.endpointState?.variables?.ok);

const report = {
  schemaVersion: 2,
  capturedAt: new Date().toISOString(),
  repository: safeIdentifier(repository),
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
    repositorySecrets: safeArray(secretResponse.items, (item) => safeIdentifier(item?.name)).sort(),
    repositoryVariables: safeArray(variableResponse.items, (item) => {
      const name = safeIdentifier(item?.name);
      return name ? { name, valuePresent: item?.value !== undefined } : null;
    }).sort((a, b) => a.name.localeCompare(b.name)),
    environments,
    deployKeys: safeArray(deployKeyResponse.items, (item) => ({
      id: safeInteger(item?.id),
      keyType: typeof item?.key === 'string' ? safeIdentifier(item.key.split(' ')[0]) : null,
      title: safeIdentifier(item?.title),
      readOnly: safeBoolean(item?.read_only),
      createdAt: safeDate(item?.created_at),
    })),
    hooks: safeArray(hookResponse.items, (item) => ({
      id: safeInteger(item?.id),
      name: safeIdentifier(item?.name),
      active: safeBoolean(item?.active),
      events: safeArray(item?.events, (event) => safeIdentifier(event)),
      type: safeIdentifier(item?.type),
      updatedAt: safeDate(item?.updated_at),
    })),
    installations: safeArray(installationResponse.items, (item) => ({
      id: safeInteger(item?.id),
      appId: safeInteger(item?.app_id),
      appSlug: safeIdentifier(item?.app_slug),
      targetType: safeIdentifier(item?.target_type),
      permissionKeys: safeArray(item?.permissions ? Object.keys(item.permissions) : [], (key) => safeIdentifier(key)).sort(),
    })),
    actionsPermissions: actionsPermissionResponse.ok ? {
      enabled: safeBoolean(actionsPermissionResponse.data.enabled),
      allowedActions: safeIdentifier(actionsPermissionResponse.data.allowed_actions),
      shaPinned: safeBoolean(actionsPermissionResponse.data.sha_pinning_required),
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
console.log(`Wrote normalized GitHub controls inventory to ${outputPath}; status=${report.status}.`);
