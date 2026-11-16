import crypto from 'node:crypto';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const ACCOUNT_ID = 'e5b7ae46e04698f507b7e4b3d4ef1af0';
const HYPERDRIVE_ID = '7e39fc4a286147988ed12df7a6322616';
const DATABASE_ID = '87dbkhprjh30';
const BRANCH_ID = 'xwkb9quljkzd';
const LOGICAL_DATABASE = 'postgres';
const API_BASE = 'https://api.cloudflare.com/client/v4';
const MAX_RESPONSE_BYTES = 64 * 1024;
const TLS_MODES = new Set(['verify-full', 'verify-ca', 'require', 'prefer', 'disable']);
const PLANETSCALE_HOST_PATTERN = /^(?:[a-z0-9-]+\.)+psdb\.cloud$/;
const PLANETSCALE_USERNAME_PATTERN = /^pscale_api_[a-z0-9]{1,64}\.([a-z0-9]{12})$/;
const RECOGNIZED_SCHEMES = new Set(['postgres', 'postgresql', 'mysql', 'mariadb', 'sqlite']);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function safeValueType(object, key) {
  if (!object || typeof object !== 'object' || !Object.hasOwn(object, key)) return 'missing';
  const value = object[key];
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function safeRecognizedString(value, allowed) {
  if (typeof value !== 'string') return value === undefined ? 'missing' : 'nonstring';
  const normalized = value.trim().toLowerCase();
  return allowed.has(normalized) ? normalized : 'other';
}

function blocked(sourceSha, code, httpStatus = null) {
  return {
    status: 'READ_ONLY_PREFLIGHT_BLOCKED',
    sourceSha,
    httpStatus,
    code,
  };
}

async function boundedJson(response) {
  const announcedBytes = Number(response.headers.get('content-length'));
  if (Number.isFinite(announcedBytes) && announcedBytes > MAX_RESPONSE_BYTES) return null;
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks = [];
  let byteCount = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteCount += value.byteLength;
      if (byteCount > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks, byteCount).toString('utf8'));
  } catch {
    return null;
  }
}

function getOriginUsername(origin) {
  const names = [origin?.username, origin?.user].filter((value) => typeof value === 'string' && value.length > 0);
  if (names.length === 0 || names.some((value) => value !== names[0])) return null;
  return PLANETSCALE_USERNAME_PATTERN.test(names[0]) ? names[0] : null;
}

export async function inspectNewCoreHyperdrive({
  token = process.env.CLOUDFLARE_API_TOKEN,
  sourceSha = process.env.GITHUB_SHA,
  fetchImpl = fetch,
} = {}) {
  const validSourceSha = typeof sourceSha === 'string' && /^[a-f0-9]{40}$/.test(sourceSha) ? sourceSha : null;
  if (!validSourceSha) return blocked(null, 'source_sha_unavailable');
  if (typeof token !== 'string' || token.length === 0 || token.length > 4096 || /[\s\x00-\x1f\x7f]/.test(token)) {
    return blocked(validSourceSha, 'cloudflare_token_unavailable');
  }

  const url = `${API_BASE}/accounts/${ACCOUNT_ID}/hyperdrive/configs/${HYPERDRIVE_ID}`;
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
      },
    });
  } catch {
    return blocked(validSourceSha, 'cloudflare_get_failed');
  }

  if (response.status !== 200 || response.redirected === true || (response.url && response.url !== url)) {
    await response.body?.cancel().catch(() => undefined);
    return blocked(validSourceSha, response.status === 200 ? 'cloudflare_response_target_mismatch' : 'cloudflare_http_status_not_ok', response.status);
  }
  const payload = await boundedJson(response);
  if (!payload || payload.success !== true || !payload.result || typeof payload.result !== 'object') {
    return blocked(validSourceSha, 'cloudflare_response_invalid', response.status);
  }

  const config = payload.result;
  const origin = config.origin;
  const originObjectPresent = !!origin && typeof origin === 'object' && !Array.isArray(origin);
  const mtls = config.mtls;
  const mtlsObjectPresent = !!mtls && typeof mtls === 'object' && !Array.isArray(mtls);
  const caching = config.caching;
  const cachingObjectPresent = !!caching && typeof caching === 'object' && !Array.isArray(caching);
  const originUserKey = Object.hasOwn(origin ?? {}, 'user') ? 'user' : 'username';
  const host = typeof origin?.host === 'string' ? origin.host.trim().toLowerCase() : '';
  const port = Number(origin?.port);
  const rawDatabase = typeof origin?.database === 'string' ? origin.database.trim() : '';
  const databaseMatches = rawDatabase === LOGICAL_DATABASE;
  const username = getOriginUsername(origin);
  const rawScheme = typeof origin?.scheme === 'string' ? origin.scheme.trim().toLowerCase() : '';
  const schemeValid = rawScheme === 'postgres';
  const scheme = schemeValid ? 'postgres' : null;
  const rawTlsMode = typeof config.mtls?.sslmode === 'string' ? config.mtls.sslmode.trim().toLowerCase() : '';
  const tlsMode = TLS_MODES.has(rawTlsMode) ? rawTlsMode : 'unknown';
  const cacheDisabled = typeof config.caching?.disabled === 'boolean' ? config.caching.disabled : null;
  const caPresent = typeof config.mtls?.ca_certificate_id === 'string' && config.mtls.ca_certificate_id.length > 0;
  const hostValid = PLANETSCALE_HOST_PATTERN.test(host);
  const portValid = Number.isInteger(port) && port === 5432;
  const branchMatch = username?.match(PLANETSCALE_USERNAME_PATTERN) ?? null;
  const parsedBranchId = branchMatch?.[1]?.toLowerCase() ?? null;
  const expectedBranchMatch = parsedBranchId === BRANCH_ID;
  const usernameSha256 = username ? sha256(username) : null;
  const hostSha256 = hostValid ? sha256(host) : null;
  const hyperdriveMatches = config.id === HYPERDRIVE_ID;
  const originFingerprint = hostValid && portValid && databaseMatches && schemeValid
    ? sha256(JSON.stringify({ scheme: 'postgres', host, port: 5432, database: 'postgres' }))
    : null;
  const tlsVerified = tlsMode === 'verify-full' && caPresent;
  const status = hyperdriveMatches && expectedBranchMatch && databaseMatches && cacheDisabled === true
    && tlsVerified && originFingerprint && hostValid && portValid && schemeValid
    ? 'READ_ONLY_PREFLIGHT_PASS'
    : 'READ_ONLY_PREFLIGHT_BLOCKED';

  return {
    status,
    sourceSha: validSourceSha,
    httpStatus: response.status,
    accountId: ACCOUNT_ID,
    hyperdriveId: HYPERDRIVE_ID,
    databaseId: DATABASE_ID,
    expectedBranchId: BRANCH_ID,
    parsedBranchId,
    branchMatch: expectedBranchMatch,
    logicalDatabase: databaseMatches ? LOGICAL_DATABASE : null,
    logicalDatabaseMatch: databaseMatches,
    hyperdriveIdMatch: hyperdriveMatches,
    originObjectPresent,
    originSchemePresent: !!originObjectPresent && Object.hasOwn(origin, 'scheme'),
    originSchemeType: safeValueType(origin, 'scheme'),
    originSchemeClass: safeRecognizedString(origin?.scheme, RECOGNIZED_SCHEMES),
    schemeValid,
    originHostPresent: !!originObjectPresent && Object.hasOwn(origin, 'host'),
    originHostType: safeValueType(origin, 'host'),
    hostValid,
    originPortPresent: !!originObjectPresent && Object.hasOwn(origin, 'port'),
    originPortType: safeValueType(origin, 'port'),
    portValid,
    originDatabasePresent: !!originObjectPresent && Object.hasOwn(origin, 'database'),
    originDatabaseType: safeValueType(origin, 'database'),
    originUserPresent: !!originObjectPresent && (Object.hasOwn(origin, 'user') || Object.hasOwn(origin, 'username')),
    originUserType: safeValueType(origin, originUserKey),
    originUserGeneratedRolePatternMatch: username !== null,
    originHostSha256: hostSha256,
    originUsernameSha256: usernameSha256,
    normalizedOriginFingerprint: originFingerprint,
    cachingObjectPresent,
    cachingObjectType: safeValueType(config, 'caching'),
    cachingDisabledFieldPresent: !!cachingObjectPresent && Object.hasOwn(caching, 'disabled'),
    cachingDisabledFieldType: safeValueType(caching, 'disabled'),
    cacheDisabled,
    mtlsObjectPresent,
    mtlsObjectType: safeValueType(config, 'mtls'),
    mtlsSslmodePresent: !!mtlsObjectPresent && Object.hasOwn(mtls, 'sslmode'),
    mtlsSslmodeType: safeValueType(mtls, 'sslmode'),
    tlsMode,
    caCertificateIdPresent: !!mtlsObjectPresent && Object.hasOwn(mtls, 'ca_certificate_id'),
    caCertificateIdType: safeValueType(mtls, 'ca_certificate_id'),
    caPresent,
    tlsVerified,
    roleClass: 'unknown_pending_provider_role_inventory',
  };
}

async function main() {
  const result = await inspectNewCoreHyperdrive();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (process.env.GITHUB_OUTPUT && /^[a-f0-9]{64}$/.test(result.originUsernameSha256 ?? '')) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `origin_username_sha256=${result.originUsernameSha256}\n`);
  }
  if (result.status !== 'READ_ONLY_PREFLIGHT_PASS') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    process.stdout.write(`${JSON.stringify(blocked(
      /^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA ?? '') ? process.env.GITHUB_SHA : null,
      'inspector_failed',
    ))}\n`);
    process.exitCode = 1;
  });
}
