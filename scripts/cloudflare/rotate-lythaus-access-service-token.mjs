import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
const cloudflareToken = process.env.CLOUDFLARE_API_TOKEN ?? '';
const currentClientId = process.env.CF_ACCESS_CLIENT_ID ?? '';
const currentClientSecret = process.env.CF_ACCESS_CLIENT_SECRET ?? '';
const repository = process.env.GITHUB_REPOSITORY ?? '';
const githubToken = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? '';
const outputPath = process.env.ACCESS_ROTATION_EVIDENCE_PATH ?? '.artifacts/cloudflare/access-rotation.json';
const rotate = process.env.ROTATE_LYTHAUS_ACCESS_TOKEN === 'true';
const adminUiAppId = process.env.LYTHAUS_ADMIN_UI_ACCESS_APP_ID ?? '2d440b64-6cde-48d7-b3cb-132129ee036f';
const adminApiAppId = process.env.LYTHAUS_ADMIN_API_ACCESS_APP_ID ?? 'fa6906cc-3daf-4beb-82b5-143e708eca0d';
const legacyPreviewAppId = process.env.LYTHAUS_LEGACY_PREVIEW_ACCESS_APP_ID ?? '6152f491-9f60-4c0b-8c0c-a3ddacdf9270';

const apiBase = `https://api.cloudflare.com/client/v4/accounts/${accountId}`;

function requireEnv(name, value) {
  if (!value) throw new Error(`${name} is required`);
}

requireEnv('CLOUDFLARE_ACCOUNT_ID', accountId);
requireEnv('CLOUDFLARE_API_TOKEN', cloudflareToken);
requireEnv('CF_ACCESS_CLIENT_ID', currentClientId);
requireEnv('CF_ACCESS_CLIENT_SECRET', currentClientSecret);

function safeError(value) {
  return String(value ?? '')
    .replaceAll(currentClientId, '[redacted-client-id]')
    .replaceAll(currentClientSecret, '[redacted-client-secret]')
    .replaceAll(cloudflareToken, '[redacted-cloudflare-token]')
    .replaceAll(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]')
    .slice(0, 500);
}

async function cloudflare(path, options = {}) {
  const method = options.method ?? 'GET';
  const retryReads = method === 'GET';
  const maxAttempts = retryReads ? 5 : 1;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${cloudflareToken}`,
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      },
    });
    const text = await response.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      if (retryReads && (response.status === 429 || response.status >= 500) && attempt + 1 < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (2 ** attempt)));
        continue;
      }
      throw new Error(`Cloudflare ${method} ${path} returned non-JSON HTTP ${response.status}`);
    }
    if (!response.ok || payload.success === false) {
      const details = (payload.errors ?? []).map((error) => `${error.code ?? 'unknown'}:${error.message ?? 'error'}`).join('; ');
      if (retryReads && (response.status === 429 || response.status >= 500) && attempt + 1 < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (2 ** attempt)));
        continue;
      }
      throw new Error(`Cloudflare ${method} ${path} failed HTTP ${response.status}${details ? ` (${safeError(details)})` : ''}`);
    }
    return payload.result;
  }
  throw new Error(`Cloudflare ${method} ${path} exhausted read retries`);
}

async function listServiceTokens() {
  const result = await cloudflare('/access/service_tokens?page=1&per_page=100');
  return Array.isArray(result) ? result : [];
}

async function listPolicies(appId) {
  try {
    const result = await cloudflare(`/access/apps/${appId}/policies?page=1&per_page=100`);
    return Array.isArray(result) ? result : [];
  } catch (error) {
    if (appId === legacyPreviewAppId && /failed HTTP 404 \(11021:access\.api\.error\.unknown_application/.test(error.message ?? '')) {
      return [];
    }
    throw error;
  }
}

async function listAccessGroups() {
  const result = await cloudflare('/access/groups?page=1&per_page=100');
  return Array.isArray(result) ? result : [];
}

async function listAccountPolicies() {
  const result = await cloudflare('/access/policies?page=1&per_page=100');
  return Array.isArray(result) ? result : [];
}

async function listAccessApplications() {
  const result = await cloudflare('/access/apps?page=1&per_page=100');
  return Array.isArray(result) ? result : [];
}

async function getAccessApplication(appId) {
  return cloudflare(`/access/apps/${appId}`);
}

function findClientIdReferences(value, clientId, path = 'root') {
  if (Array.isArray(value)) return value.flatMap((item, index) => findClientIdReferences(item, clientId, `${path}[${index}]`));
  if (!value || typeof value !== 'object') return [];
  const references = [];
  for (const [key, child] of Object.entries(value)) {
    if (key === 'client_id' && child === clientId) references.push(`${path}.${key}`);
    else if (key !== 'client_secret') references.push(...findClientIdReferences(child, clientId, `${path}.${key}`));
  }
  return references;
}

function isNiteOwlApplication(app) {
  return /nite[-_ ]?owl/i.test(`${app.name ?? ''} ${app.domain ?? ''}`);
}

function isLegacyLythausApplication(app) {
  return app.id === legacyPreviewAppId || /asora|legacy|preview/i.test(`${app.name ?? ''} ${app.domain ?? ''}`);
}

function accessApplicationEvidence(app, legacyClientIds) {
  const references = legacyClientIds.flatMap((clientId) => findClientIdReferences(app.scim_config, clientId, 'scim_config'));
  return {
    id: app.id,
    name: app.name,
    domain: app.domain,
    type: app.type,
    niteOwl: isNiteOwlApplication(app),
    scimConfigured: Boolean(app.scim_config),
    scimEnabled: app.scim_config?.enabled ?? null,
    legacyServiceTokenReferencePaths: references,
  };
}

function serviceTokenPolicy(policy, tokenId) {
  return (policy.include ?? []).some((rule) => (
    rule.service_token?.token_id === tokenId || rule.service_token?.id === tokenId
  ));
}

function isAccessLoginPage(body) {
  return /cloudflareaccess\.com\/cdn-cgi\/access\/(?:login|verify-code)|AuthFormLogin/i.test(body);
}

async function probeAdmin(clientId, clientSecret) {
  const response = await fetch('https://admin.lythaus.co/', {
    redirect: 'manual',
    headers: {
      'CF-Access-Client-Id': clientId,
      'CF-Access-Client-Secret': clientSecret,
    },
  });
  const body = (await response.text()).slice(0, 2_000_000);
  return {
    status: response.status,
    contentType: response.headers.get('content-type') ?? '',
    bodyLength: body.length,
    bodySha256: createHash('sha256').update(body).digest('hex'),
    accessLoginDetected: isAccessLoginPage(body),
    lythausControlPanelDetected: /<title[^>]*>Lythaus Control Panel<\/title>/i.test(body),
    securityHeaders: {
      contentSecurityPolicy: Boolean(response.headers.get('content-security-policy')),
      xContentTypeOptions: response.headers.get('x-content-type-options')?.toLowerCase() === 'nosniff',
    },
  };
}

function requireValidAdminProbe(probe, label) {
  if (probe.status !== 200 || probe.accessLoginDetected || !probe.lythausControlPanelDetected) {
    throw new Error(`${label} did not reach the Lythaus control panel (HTTP ${probe.status}; accessLogin=${probe.accessLoginDetected}; panel=${probe.lythausControlPanelDetected})`);
  }
  if (!probe.securityHeaders.contentSecurityPolicy || !probe.securityHeaders.xContentTypeOptions) {
    throw new Error(`${label} control panel response is missing required security headers`);
  }
}

function writeEvidence(value) {
  mkdirSync(outputPath.split(/[\\/]/).slice(0, -1).join('/') || '.', { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function setGitHubSecret(name, value) {
  requireEnv('GITHUB_REPOSITORY', repository);
  requireEnv('GH_TOKEN', githubToken);
  const result = spawnSync('gh', ['secret', 'set', name, '--repo', repository], {
    env: { ...process.env, GH_TOKEN: githubToken },
    input: value,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`GitHub secret update for ${name} failed: ${safeError(result.stderr || result.stdout)}`);
  }
}

async function rotateServiceToken(tokenId) {
  return cloudflare(`/access/service_tokens/${tokenId}/rotate`, {
    method: 'POST',
    body: JSON.stringify({
      previous_client_secret_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    }),
  });
}

async function createPolicy(appId, tokenId) {
  return cloudflare(`/access/apps/${appId}/policies`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Lythaus control-panel CI service token',
      decision: 'non_identity',
      include: [{ service_token: { token_id: tokenId } }],
      precedence: 0,
    }),
  });
}

function policyPayloadForServiceToken(policy, tokenId, name = policy.name) {
  const payload = {
    name,
    decision: policy.decision,
    include: [{ service_token: { token_id: tokenId } }],
  };
  if (Number.isInteger(policy.precedence)) payload.precedence = policy.precedence;
  if (Array.isArray(policy.exclude)) payload.exclude = policy.exclude;
  if (Array.isArray(policy.require)) payload.require = policy.require;
  return payload;
}

async function updatePolicy(appId, policy, tokenId, name) {
  return cloudflare(`/access/apps/${appId}/policies/${policy.id}`, {
    method: 'PUT',
    body: JSON.stringify(policyPayloadForServiceToken(policy, tokenId, name)),
  });
}

function groupPayloadWithoutServiceToken(group, tokenId) {
  const payload = { name: group.name };
  for (const key of ['include', 'exclude', 'require']) {
    if (Array.isArray(group[key])) {
      payload[key] = group[key].filter((rule) => !serviceTokenPolicy({ include: [rule] }, tokenId));
    }
  }
  return payload;
}

async function updateGroupWithoutServiceToken(group, tokenId) {
  return cloudflare(`/access/groups/${group.id}`, {
    method: 'PUT',
    body: JSON.stringify(groupPayloadWithoutServiceToken(group, tokenId)),
  });
}

async function updateApplicationScimConfig(app, scimConfig) {
  return cloudflare(`/access/apps/${app.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: app.name,
      domain: app.domain,
      type: app.type,
      scim_config: scimConfig,
    }),
  });
}

async function deletePolicy(appId, policyId) {
  await cloudflare(`/access/apps/${appId}/policies/${policyId}`, { method: 'DELETE' });
}

async function deleteAccountPolicy(policyId) {
  await cloudflare(`/access/policies/${policyId}`, { method: 'DELETE' });
}

async function deleteServiceToken(tokenId) {
  await cloudflare(`/access/service_tokens/${tokenId}`, { method: 'DELETE' });
}

async function inspect() {
  const tokens = await listServiceTokens();
  const current = tokens.find((token) => token.client_id === currentClientId);
  const [uiPolicies, apiPolicies, accountPolicies] = await Promise.all([
    listPolicies(adminUiAppId),
    listPolicies(adminApiAppId),
    listAccountPolicies(),
  ]);
  const probe = await probeAdmin(currentClientId, currentClientSecret);
  const evidence = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    mode: 'inspect',
    status: 'observed',
    currentCredentialMatchesCloudflareServiceToken: Boolean(current),
    currentServiceToken: current ? { id: current.id, name: current.name, enabled: current.enabled, duration: current.duration } : null,
    serviceTokenCount: tokens.length,
    adminUiPolicyCount: uiPolicies.length,
    adminApiPolicyCount: apiPolicies.length,
    accountPolicyCount: accountPolicies.length,
    adminUiServiceTokenPolicyNames: uiPolicies.filter((policy) => policy.decision === 'non_identity').map((policy) => policy.name),
    adminApiServiceTokenPolicyNames: apiPolicies.filter((policy) => policy.decision === 'non_identity').map((policy) => policy.name),
    currentCredentialAdminProbe: probe,
  };
  writeEvidence(evidence);
  console.log(JSON.stringify({ status: evidence.status, currentCredentialMatchesCloudflareServiceToken: evidence.currentCredentialMatchesCloudflareServiceToken, currentCredentialAdminStatus: probe.status, accessLoginDetected: probe.accessLoginDetected, lythausControlPanelDetected: probe.lythausControlPanelDetected }));
}

async function rotateCredentials() {
  requireEnv('GITHUB_REPOSITORY', repository);
  requireEnv('GH_TOKEN', githubToken);
  const tokens = await listServiceTokens();
  const previous = tokens.find((token) => token.client_id === currentClientId);
  if (!previous?.id) throw new Error('The configured Lythaus Access credential does not match an enumerated service token');

  const addedPolicies = [];
  const updatedPolicies = [];
  const updatedGroups = [];
  const updatedScimApps = [];
  let secretsUpdated = [];
  let rotated = null;
  let lastProbe = null;
  let credentialCommitted = false;
  let accessApplicationInventory = [];
  try {
    rotated = await rotateServiceToken(previous.id);
    if (!rotated?.id || !rotated.client_id || !rotated.client_secret) throw new Error('Cloudflare rotated a service token without complete credential metadata');

    const uiPolicies = await listPolicies(adminUiAppId);
    if (!uiPolicies.some((policy) => serviceTokenPolicy(policy, rotated.id))) {
      const legacyUiPolicy = uiPolicies.find((policy) => (
        policy.decision === 'non_identity' && /asora/i.test(policy.name ?? '') && policy.id
      ));
      if (legacyUiPolicy) {
        await updatePolicy(
          adminUiAppId,
          legacyUiPolicy,
          rotated.id,
          'Lythaus control-panel CI service token',
        );
        updatedPolicies.push({ appId: adminUiAppId, policy: legacyUiPolicy });
      } else {
        const uiPolicy = await createPolicy(adminUiAppId, rotated.id);
        addedPolicies.push([adminUiAppId, uiPolicy.id]);
      }
    }

    lastProbe = await probeAdminWithRetry(rotated.client_id, rotated.client_secret, 'New Access service token');

    setGitHubSecret('CF_ACCESS_CLIENT_ID', rotated.client_id);
    secretsUpdated.push('CF_ACCESS_CLIENT_ID');
    setGitHubSecret('CF_ACCESS_CLIENT_SECRET', rotated.client_secret);
    secretsUpdated.push('CF_ACCESS_CLIENT_SECRET');
    credentialCommitted = true;

    const legacyTokens = tokens.filter((token) => token.id !== previous.id && /asora/i.test(token.name ?? ''));
    const legacyPolicies = [];
    const legacyScimApps = [];
    const accessApplications = await listAccessApplications();
    const accountPolicies = await listAccountPolicies();
    const legacyClientIds = legacyTokens.map((token) => token.client_id);
    for (const listedApp of accessApplications) {
      if (!listedApp?.id || isNiteOwlApplication(listedApp)) continue;
      const app = await getAccessApplication(listedApp.id);
      const appEvidence = accessApplicationEvidence(app, legacyClientIds);
      accessApplicationInventory.push(appEvidence);
      if (appEvidence.legacyServiceTokenReferencePaths.length > 0 && !isLegacyLythausApplication(app)) {
        throw new Error(`Legacy Access service token is still referenced by an unclassified Access application ${app.name ?? app.id}`);
      }
    }
    const legacyPreviewListedApp = accessApplications.find((app) => app?.id === legacyPreviewAppId);
    if (legacyPreviewListedApp) {
      const legacyPreviewApp = await getAccessApplication(legacyPreviewAppId);
      const references = legacyTokens.flatMap((token) => findClientIdReferences(legacyPreviewApp.scim_config, token.client_id, 'scim_config'));
      await updateApplicationScimConfig(legacyPreviewApp, null);
      updatedScimApps.push({ app: legacyPreviewApp, tokenId: null });
      legacyScimApps.push({ appId: legacyPreviewApp.id, name: legacyPreviewApp.name, references, clearedExplicitly: true });
    }
    for (const legacyToken of legacyTokens) {
      for (const policy of accountPolicies.filter((candidate) => serviceTokenPolicy(candidate, legacyToken.id))) {
        if (/nite[-_ ]?owl/i.test(policy.name ?? '')) continue;
        if (!isLegacyLythausApplication({ name: policy.name, domain: policy.domain })) {
          throw new Error(`Legacy Access service token is still referenced by an unclassified account policy ${policy.name ?? policy.id}`);
        }
        await deleteAccountPolicy(policy.id);
        legacyPolicies.push({ appId: 'account', policyId: policy.id, tokenId: legacyToken.id });
      }
      for (const appId of [adminUiAppId, adminApiAppId, legacyPreviewAppId]) {
        const policies = await listPolicies(appId);
        for (const policy of policies.filter((candidate) => serviceTokenPolicy(candidate, legacyToken.id))) {
          await deletePolicy(appId, policy.id);
          legacyPolicies.push({ appId, policyId: policy.id, tokenId: legacyToken.id });
        }
      }
      const groups = await listAccessGroups();
      for (const group of groups) {
        if (/nite[-_ ]?owl/i.test(group.name ?? '')) continue;
        const referencesToken = ['include', 'exclude', 'require'].some((key) => (
          Array.isArray(group[key]) && group[key].some((rule) => serviceTokenPolicy({ include: [rule] }, legacyToken.id))
        ));
        if (referencesToken) {
          await updateGroupWithoutServiceToken(group, legacyToken.id);
          updatedGroups.push({ group, tokenId: legacyToken.id });
        }
      }
    }
    for (const legacyToken of legacyTokens) await deleteServiceToken(legacyToken.id);

    const evidence = {
      schemaVersion: 1,
      capturedAt: new Date().toISOString(),
      mode: 'rotate',
      status: 'verified',
      newServiceToken: { id: rotated.id, name: previous.name, duration: rotated.duration, enabled: rotated.enabled },
      newPolicies: addedPolicies.map(([appId, policyId]) => ({ appId, policyId })),
      updatedPolicies: updatedPolicies.map(({ appId, policy }) => ({ appId, policyId: policy.id, replacedLegacyName: policy.name })),
      rotatedExistingServiceToken: true,
      legacyServiceTokensRevoked: legacyTokens.map((token) => ({ id: token.id, name: token.name, revoked: true })),
      legacyPoliciesRemoved: legacyPolicies,
      legacyGroupsUpdated: updatedGroups.map(({ group, tokenId }) => ({ groupId: group.id, name: group.name, tokenId })),
      legacyScimAppsCleared: legacyScimApps,
      accessApplicationInventory,
      previousCredentialMatched: true,
      githubSecretsUpdated: secretsUpdated,
      credentialRotationCompleted: true,
      adminProbe: lastProbe,
    };
    writeEvidence(evidence);
    console.log(JSON.stringify({ status: evidence.status, credentialRotationCompleted: true, rotatedExistingServiceToken: true, legacyServiceTokensRevoked: legacyTokens.length, newPolicyCount: addedPolicies.length }));
  } catch (error) {
    if (!credentialCommitted) {
      for (const name of secretsUpdated) {
        try { setGitHubSecret(name, name === 'CF_ACCESS_CLIENT_ID' ? currentClientId : currentClientSecret); } catch { /* best effort restore */ }
      }
      for (const [appId, policyId] of addedPolicies.reverse()) {
        try { await deletePolicy(appId, policyId); } catch { /* best effort rollback */ }
      }
      for (const { appId, policy } of updatedPolicies.reverse()) {
        const legacyTokenId = (policy.include ?? []).find((rule) => rule.service_token?.token_id || rule.service_token?.id)?.service_token?.token_id
          ?? (policy.include ?? []).find((rule) => rule.service_token?.id)?.service_token?.id;
        try { if (legacyTokenId) await updatePolicy(appId, policy, legacyTokenId, policy.name); } catch { /* best effort rollback */ }
      }
      for (const { group } of updatedGroups.reverse()) {
        try {
          await cloudflare(`/access/groups/${group.id}`, {
            method: 'PUT',
            body: JSON.stringify({
              name: group.name,
              include: group.include,
              exclude: group.exclude,
              require: group.require,
            }),
          });
        } catch { /* best effort rollback */ }
      }
      for (const { app } of updatedScimApps.reverse()) {
        try { await updateApplicationScimConfig(app, app.scim_config); } catch { /* best effort rollback */ }
      }
    }
    writeEvidence({
      schemaVersion: 1,
      capturedAt: new Date().toISOString(),
      mode: 'rotate',
      status: 'failed',
      error: safeError(error?.message ?? error),
      rotatedServiceToken: rotated ? { id: rotated.id, duration: rotated.duration, enabled: rotated.enabled } : null,
      newPolicies: addedPolicies.map(([appId, policyId]) => ({ appId, policyId })),
      updatedPolicies: updatedPolicies.map(({ appId, policy }) => ({ appId, policyId: policy.id, replacedLegacyName: policy.name })),
      updatedGroups: updatedGroups.map(({ group, tokenId }) => ({ groupId: group.id, name: group.name, tokenId })),
      updatedScimApps: updatedScimApps.map(({ app, tokenId }) => ({ appId: app.id, name: app.name, tokenId })),
      accessApplicationInventory,
      lastProbe,
      githubSecretsUpdated: secretsUpdated,
      credentialRotationCommitted: credentialCommitted,
      rollbackAttempted: !credentialCommitted,
    });
    throw error;
  }
}

async function probeAdminWithRetry(clientId, clientSecret, label) {
  let lastProbe = null;
  let lastError = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      lastProbe = await probeAdmin(clientId, clientSecret);
      requireValidAdminProbe(lastProbe, label);
      return lastProbe;
    } catch (error) {
      lastError = error;
      if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 1000 * (2 ** attempt)));
    }
  }
  throw lastError ?? new Error(`${label} probe failed without a response`);
}

if (rotate) await rotateCredentials();
else await inspect();
