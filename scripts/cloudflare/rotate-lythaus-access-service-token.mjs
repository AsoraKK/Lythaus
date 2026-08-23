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
    throw new Error(`Cloudflare ${options.method ?? 'GET'} ${path} returned non-JSON HTTP ${response.status}`);
  }
  if (!response.ok || payload.success === false) {
    const details = (payload.errors ?? []).map((error) => `${error.code ?? 'unknown'}:${error.message ?? 'error'}`).join('; ');
    throw new Error(`Cloudflare ${options.method ?? 'GET'} ${path} failed HTTP ${response.status}${details ? ` (${safeError(details)})` : ''}`);
  }
  return payload.result;
}

async function listServiceTokens() {
  const result = await cloudflare('/access/service_tokens?page=1&per_page=100');
  return Array.isArray(result) ? result : [];
}

async function listPolicies(appId) {
  const result = await cloudflare(`/access/apps/${appId}/policies?page=1&per_page=100`);
  return Array.isArray(result) ? result : [];
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
  const result = spawnSync('gh', ['secret', 'set', name, '--repo', repository, '--body-file', '-'], {
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
    }),
  });
}

async function deletePolicy(appId, policyId) {
  await cloudflare(`/access/apps/${appId}/policies/${policyId}`, { method: 'DELETE' });
}

async function deleteServiceToken(tokenId) {
  await cloudflare(`/access/service_tokens/${tokenId}`, { method: 'DELETE' });
}

async function inspect() {
  const tokens = await listServiceTokens();
  const current = tokens.find((token) => token.client_id === currentClientId);
  const [uiPolicies, apiPolicies] = await Promise.all([listPolicies(adminUiAppId), listPolicies(adminApiAppId)]);
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
  const rotated = await rotateServiceToken(previous.id);
  if (!rotated?.id || !rotated.client_id || !rotated.client_secret) throw new Error('Cloudflare rotated a service token without complete credential metadata');

  const addedPolicies = [];
  let secretsUpdated = [];
  try {
    const uiPolicies = await listPolicies(adminUiAppId);
    if (!uiPolicies.some((policy) => serviceTokenPolicy(policy, previous.id))) {
      const uiPolicy = await createPolicy(adminUiAppId, previous.id);
      addedPolicies.push([adminUiAppId, uiPolicy.id]);
    }

    const probe = await probeAdmin(rotated.client_id, rotated.client_secret);
    requireValidAdminProbe(probe, 'New Access service token');

    setGitHubSecret('CF_ACCESS_CLIENT_ID', rotated.client_id);
    secretsUpdated.push('CF_ACCESS_CLIENT_ID');
    setGitHubSecret('CF_ACCESS_CLIENT_SECRET', rotated.client_secret);
    secretsUpdated.push('CF_ACCESS_CLIENT_SECRET');

    const legacyTokens = tokens.filter((token) => token.id !== previous.id && /asora/i.test(token.name ?? ''));
    const legacyPolicies = [];
    for (const legacyToken of legacyTokens) {
      for (const appId of [adminUiAppId, adminApiAppId]) {
        const policies = await listPolicies(appId);
        for (const policy of policies.filter((candidate) => serviceTokenPolicy(candidate, legacyToken.id))) {
          await deletePolicy(appId, policy.id);
          legacyPolicies.push({ appId, policyId: policy.id, tokenId: legacyToken.id });
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
      rotatedExistingServiceToken: true,
      legacyServiceTokensRevoked: legacyTokens.map((token) => ({ id: token.id, name: token.name, revoked: true })),
      legacyPoliciesRemoved: legacyPolicies,
      previousCredentialMatched: true,
      githubSecretsUpdated: secretsUpdated,
      credentialRotationCompleted: true,
      adminProbe: probe,
    };
    writeEvidence(evidence);
    console.log(JSON.stringify({ status: evidence.status, credentialRotationCompleted: true, rotatedExistingServiceToken: true, legacyServiceTokensRevoked: legacyTokens.length, newPolicyCount: addedPolicies.length }));
  } catch (error) {
    for (const name of secretsUpdated) {
      try { setGitHubSecret(name, name === 'CF_ACCESS_CLIENT_ID' ? currentClientId : currentClientSecret); } catch { /* best effort restore */ }
    }
    for (const [appId, policyId] of addedPolicies.reverse()) {
      try { await deletePolicy(appId, policyId); } catch { /* best effort rollback */ }
    }
    throw error;
  }
}

if (rotate) await rotateCredentials();
else await inspect();
