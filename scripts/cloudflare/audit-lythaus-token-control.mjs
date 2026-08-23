import fs from 'node:fs';
import path from 'node:path';

const token = process.env.CLOUDFLARE_API_TOKEN ?? '';
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
const outputPath = process.env.CLOUDFLARE_TOKEN_CONTROL_OUTPUT ?? '.artifacts/provider-inventory/cloudflare-token-control.json';

if (!token) throw new Error('CLOUDFLARE_API_TOKEN is required');
if (!/^[a-f0-9]{32}$/.test(accountId)) throw new Error('CLOUDFLARE_ACCOUNT_ID must be a 32-character account ID');

const base = 'https://api.cloudflare.com/client/v4';
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };

function safeError(payload, status) {
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];
  const first = errors[0] ?? {};
  return {
    status,
    code: first.code ?? null,
    message: String(first.message ?? payload?.message ?? '').slice(0, 240),
  };
}

function safeResult(payload) {
  const result = payload?.result;
  if (Array.isArray(result)) return { kind: 'array', count: result.length };
  if (!result || typeof result !== 'object') return { kind: typeof result };
  return {
    kind: 'object',
    keys: Object.keys(result).filter((key) => !/token|secret|value|credential/i.test(key)).sort(),
  };
}

async function request(label, endpoint) {
  const url = `${base}${endpoint}`;
  let response;
  let payload = {};
  try {
    response = await fetch(url, { headers });
    try { payload = await response.json(); } catch { payload = {}; }
  } catch (error) {
    return { label, endpoint, ok: false, error: { status: null, code: 'NETWORK_ERROR', message: String(error?.message ?? error).slice(0, 240) } };
  }
  if (!response.ok || payload.success === false) return { label, endpoint, ok: false, error: safeError(payload, response.status) };
  return { label, endpoint, ok: true, result: safeResult(payload) };
}

const checks = await Promise.all([
  request('user-token-verify', '/user/tokens/verify'),
  request('account-token-verify', `/accounts/${accountId}/tokens/verify`),
  request('account-token-list', `/accounts/${accountId}/tokens`),
  request('account-token-write-permission', `/accounts/${accountId}/tokens/permission_groups?name=${encodeURIComponent('Account API Tokens Write')}`),
  request('account-token-read-permission', `/accounts/${accountId}/tokens/permission_groups?name=${encodeURIComponent('Account API Tokens Read')}`),
]);

const byLabel = Object.fromEntries(checks.map((check) => [check.label, check]));
const accountManagement = [byLabel['account-token-verify'], byLabel['account-token-list'], byLabel['account-token-write-permission']];
const report = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  reviewedSha: process.env.GITHUB_SHA ?? null,
  accountId,
  scope: 'Lythaus Cloudflare account and lythaus.co zone only; no Nite Owl resource enumeration or mutation',
  mutationPerformed: false,
  checks,
  capabilities: {
    currentTokenVerification: checks.some((check) => check.ok),
    accountTokenManagementRead: accountManagement.slice(0, 2).every((check) => check.ok),
    accountTokenWritePermissionEndpointReadable: byLabel['account-token-write-permission'].ok,
    accountTokenWritePermissionGranted: byLabel['account-token-write-permission'].ok && (byLabel['account-token-write-permission'].result?.count ?? 0) > 0,
    githubSecretWriteAttempted: false,
  },
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`Wrote sanitized Cloudflare token-control evidence to ${outputPath}.`);
