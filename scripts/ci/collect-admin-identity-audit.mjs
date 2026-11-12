import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { verifyCloudflareAdminAccess } from './verify-cloudflare-admin-access.mjs';

const ACCOUNT = 'e5b7ae46e04698f507b7e4b3d4ef1af0';
const BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}`;
const WORKER = 'lythaus-admin-api-development';
const BOOTSTRAP = Date.parse('2026-09-05T19:23:23.548Z');
const HISTORY_START = '2026-07-27T00:00:00.000Z';
const LIMIT = 250;
const MAX_PAGES = 20;
const MAX_BYTES = 2 * 1024 * 1024;
const uuid = value => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const time = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) ? Date.parse(value) : NaN;
const normalizedEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';

class MetadataFailure extends Error {
  constructor(code, httpStatus = null) { super(code); this.httpStatus = httpStatus; }
}
function requireThat(value, code) { if (!value) throw new MetadataFailure(code); }

function humanEmail(policy) {
  if (!object(policy) || (policy.decision ?? policy.action) !== 'allow'
    || !Array.isArray(policy.include) || policy.include.length !== 1
    || (policy.exclude?.length ?? 0) !== 0 || (policy.require?.length ?? 0) !== 0) return null;
  const selector = policy.include[0];
  if (!object(selector) || Object.keys(selector).join(',') !== 'email') return null;
  const email = normalizedEmail(selector.email?.email ?? selector.email);
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
}

function requestObject(value) {
  if (object(value)) return value;
  if (typeof value === 'string' && value.length <= 65536) {
    try { const parsed = JSON.parse(value); return object(parsed) ? parsed : null; } catch { /* unavailable metadata */ }
  }
  return null;
}

export async function collectAdminIdentityAudit({ environment = process.env, fetchImpl = fetch,
  now = Date.now(), checkpoint = () => {} } = {}) {
  const validNow = Number.isFinite(now) && Math.abs(now) <= 8.64e15;
  const report = {
    schemaVersion: 'lythaus-admin-identity-audit-v1',
    sourceSha: /^[a-f0-9]{40}$/.test(environment.GITHUB_SHA ?? '') ? environment.GITHUB_SHA : null,
    capturedAt: validNow ? new Date(now).toISOString() : null,
    status: 'BLOCKED', providerMutations: false, databaseWrites: false,
    rawIdentitiesEmitted: false, rootCauseCertified: false, blockers: [], lastReadKind: null,
    currentIdentity: { exists: null, createdAfterBootstrap: null },
    previousIdentity: { historicalSoleAllowlistObserved: false, exists: null, createdBeforeBootstrap: null },
    identityIdentifiersDiffer: null,
    auditHistory: { since: HISTORY_START, before: null, pages: 0, records: 0, paginationExhausted: false,
      terminalCursorForm: null, responseShape: null,
      providerRetentionCoversWindow: 'NOT_ESTABLISHED', workerUploadEventsObserved: 0,
      secretWriteEvents: [], policyWriteEventsObserved: 0 },
    keyValueContinuity: 'NOT_ESTABLISHED_FROM_METADATA',
    limitations: [
      'Identity metadata cannot prove that a stored membership matches either identity under the serving Worker key.',
      'A secret endpoint write does not identify the key unless its name is in URI/resource metadata; request bodies are not examined for secrets.',
      'A named secret write does not prove its value changed; no secret value is extracted or compared.',
      'Missing audit events, exhausted pagination and a requested date range do not prove provider retention covers that range.',
      'This read-only report grants no membership, credential, restore, deployment or recovery-certification authority.',
    ],
  };
  try {
    requireThat(environment.CLOUDFLARE_ACCOUNT_ID === ACCOUNT
      && environment.GITHUB_REPOSITORY_ID === '1010752912' && environment.GITHUB_REF === 'refs/heads/main'
      && environment.REF_PROTECTED === 'true' && /^[a-f0-9]{40}$/.test(environment.GITHUB_SHA ?? '')
      && validNow && now > BOOTSTRAP, 'protected_lythaus_audit_context_required');
    const token = environment.CLOUDFLARE_API_TOKEN;
    requireThat(typeof token === 'string' && token.length > 0 && !/[\r\n]/.test(token), 'existing_audit_credential_required');
    report.auditHistory.before = new Date(now).toISOString();

    async function read(input, options = {}) {
      const url = new URL(input);
      requireThat(url.origin === 'https://api.cloudflare.com' && url.href.startsWith(`${BASE}/`)
        && !url.username && !url.password && !url.hash && (options.method ?? 'GET') === 'GET', 'audit_request_scope_invalid');
      report.lastReadKind = url.pathname.endsWith('/logs/audit') ? 'ACCOUNT_AUDIT_HISTORY'
        : url.pathname.endsWith('/access/users') ? (report.previousIdentity.historicalSoleAllowlistObserved ? 'PREVIOUS_IDENTITY_METADATA' : 'CURRENT_IDENTITY_METADATA')
          : url.pathname.endsWith('/policies') ? 'ACCESS_POLICIES' : 'ACCESS_APPLICATIONS';
      let response;
      try {
        response = await fetchImpl(url.href, { method: 'GET', redirect: 'error', cache: 'no-store',
          signal: AbortSignal.timeout(15000), headers: { authorization: `Bearer ${token}`, accept: 'application/json' } });
      } catch { throw new MetadataFailure('audit_transport_failed'); }
      requireThat(response.redirected !== true && (!response.url || response.url === url.href), 'audit_redirect_rejected');
      if (response.status !== 200) throw new MetadataFailure('audit_provider_read_failed', response.status);
      const chunks = []; let size = 0;
      try {
        for await (const chunk of response.body) {
          size += chunk.byteLength; requireThat(size <= MAX_BYTES, 'audit_response_too_large'); chunks.push(chunk);
        }
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        requireThat(object(body) && body.success === true, 'audit_provider_response_invalid');
        return body;
      } catch (error) {
        if (error instanceof MetadataFailure) throw error;
        throw new MetadataFailure('audit_provider_response_invalid');
      }
    }

    const apps = new Map(); const currentEmails = new Map();
    await verifyCloudflareAdminAccess({ environment, fetchImpl: async (input, options) => {
      const body = await read(input, options);
      requireThat(Array.isArray(body.result) && object(body.result_info)
        && Number.isSafeInteger(body.result_info.total_count) && body.result_info.total_count === body.result.length,
      'access_policy_pagination_unverified');
      const url = new URL(input);
      if (url.pathname.endsWith('/access/apps')) {
        for (const [name, destination] of [['Lythaus Admin UI', 'admin.lythaus.co'], ['Lythaus Admin API', 'admin-api.lythaus.co']]) {
          const matches = body.result.filter(app => app.name === name
            && [app.domain, app.destination, ...(app.domains ?? []), ...(app.self_hosted_domains ?? [])].includes(destination));
          requireThat(matches.length === 1 && /^[a-f0-9-]{32,36}$/.test(matches[0].id ?? ''), 'admin_access_application_ambiguous');
          apps.set(matches[0].id, name);
        }
      } else {
        const match = url.pathname.match(/\/access\/apps\/([a-f0-9-]{32,36})\/policies$/);
        requireThat(match && apps.has(match[1]), 'admin_access_policy_scope_invalid');
        const emails = body.result.map(humanEmail).filter(Boolean);
        requireThat(emails.length === 1, 'admin_access_identity_ambiguous'); currentEmails.set(match[1], emails[0]);
      }
      return new Response(JSON.stringify(body), { status: 200 });
    } });
    requireThat(apps.size === 2 && currentEmails.size === 2 && new Set(currentEmails.values()).size === 1,
      'admin_access_identity_ambiguous');
    const currentEmail = [...currentEmails.values()][0];

    async function identity(email) {
      const query = new URLSearchParams({ email, page: '1', per_page: '100' });
      const body = await read(`${BASE}/access/users?${query}`);
      requireThat(Array.isArray(body.result) && body.result.length <= 1
        && body.result_info?.total_count === body.result.length
        && body.result.every(row => normalizedEmail(row.email) === email), 'access_identity_inventory_unverified');
      if (body.result.length === 0) return null;
      const row = body.result[0]; const id = row.uid ?? row.id;
      requireThat(uuid(id) && (!row.uid || !row.id || row.uid === row.id)
        && Number.isFinite(time(row.created_at)) && time(row.created_at) <= now, 'access_identity_metadata_invalid');
      return { id, createdAt: time(row.created_at) };
    }
    const current = await identity(currentEmail);
    report.currentIdentity.exists = current !== null;
    report.currentIdentity.createdAfterBootstrap = current ? current.createdAt > BOOTSTRAP : null;
    checkpoint(report);

    const former = new Map([...apps.keys()].map(id => [id, new Set()]));
    const seen = new Set(); const cursors = new Set(); let cursor = null; let lastTime = Infinity;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const query = new URLSearchParams({ since: HISTORY_START, before: report.auditHistory.before,
        direction: 'desc', limit: String(LIMIT) });
      if (cursor) query.set('cursor', cursor);
      const body = await read(`${BASE}/logs/audit?${query}`);
      const info = body.result_info;
      const hasAfter = object(info) && Object.hasOwn(info, 'cursors');
      const hasFlat = object(info) && Object.hasOwn(info, 'cursor');
      report.auditHistory.responseShape = { resultIsArray: Array.isArray(body.result),
        resultInfoIsObject: object(info), cursorContainerPresent: hasAfter, flatCursorPresent: hasFlat,
        afterFieldPresent: object(info?.cursors) && Object.hasOwn(info.cursors, 'after') };
      requireThat(Array.isArray(body.result) && body.result.length <= LIMIT
        && object(info) && !(hasAfter && hasFlat) && (!hasAfter || object(info.cursors)), 'audit_pagination_unverified');
      const next = hasFlat ? info.cursor : info.cursors?.after;
      requireThat(next === undefined || next === null || typeof next === 'string', 'audit_cursor_invalid');
      for (const event of body.result) {
        const at = time(event?.action?.time);
        requireThat(object(event) && typeof event.id === 'string' && event.id.length > 0 && !seen.has(event.id)
          && event.account?.id === ACCOUNT && Number.isFinite(at) && at >= Date.parse(HISTORY_START)
          && at <= now && at <= lastTime, 'audit_event_provenance_invalid');
        seen.add(event.id); lastTime = at;
        if (event.action.result !== 'success' || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(event.raw?.method)) continue;
        let uri;
        try { uri = new URL(event.raw?.uri, 'https://api.cloudflare.com'); } catch { continue; }
        if (uri.origin !== 'https://api.cloudflare.com') continue;
        const pathname = uri.pathname.replace(/^\/client\/v4(?=\/)/, '');
        const workerPath = `/accounts/${ACCOUNT}/workers/scripts/${WORKER}`;
        if (pathname === `${workerPath}/secrets` || pathname.startsWith(`${workerPath}/secrets/`)) {
          report.auditHistory.secretWriteEvents.push({ at: new Date(at).toISOString(), afterBootstrap: at > BOOTSTRAP,
            subjectKeyNamedInMetadata: pathname === `${workerPath}/secrets/ACCESS_SUBJECT_HMAC_KEY`
              || event.resource?.id === 'ACCESS_SUBJECT_HMAC_KEY',
            action: ['create', 'update', 'delete'].includes(event.action.type) ? event.action.type : 'write' });
        }
        if ([workerPath, `${workerPath}/versions`].includes(pathname)) report.auditHistory.workerUploadEventsObserved++;
        const policy = pathname.match(new RegExp(`^/accounts/${ACCOUNT}/access/apps/([a-f0-9-]{32,36})/policies(?:/[a-f0-9-]{32,36})?$`));
        if (policy && apps.has(policy[1])) {
          report.auditHistory.policyWriteEventsObserved++;
          const request = requestObject(event.resource?.request);
          const email = humanEmail(requestObject(request?.body) ?? request);
          if (email && email !== currentEmail) former.get(policy[1]).add(email);
        }
      }
      report.auditHistory.pages = page; report.auditHistory.records = seen.size;
      if (next === undefined || next === null || next === '') {
        if (Object.hasOwn(info, 'total_count')) requireThat(Number.isSafeInteger(info.total_count)
          && info.total_count === seen.size, 'audit_terminal_count_mismatch');
        report.auditHistory.paginationExhausted = true;
        report.auditHistory.terminalCursorForm = next === undefined ? 'DOCUMENTED_CURSOR_OMISSION' : hasFlat ? 'FLAT_CURSOR_END' : 'AFTER_CURSOR_END';
        checkpoint(report); break;
      }
      requireThat(typeof next === 'string' && next.length <= 4096 && !cursors.has(next)
        && body.result.length > 0, 'audit_cursor_invalid');
      cursors.add(next); cursor = next; checkpoint(report);
      requireThat(page < MAX_PAGES, 'audit_page_limit_reached');
    }

    const previousSets = [...former.values()];
    if (previousSets.every(set => set.size === 1) && [...previousSets[0]][0] === [...previousSets[1]][0]) {
      report.previousIdentity.historicalSoleAllowlistObserved = true;
      const previous = await identity([...previousSets[0]][0]);
      report.previousIdentity.exists = previous !== null;
      report.previousIdentity.createdBeforeBootstrap = previous ? previous.createdAt <= BOOTSTRAP : null;
      report.identityIdentifiersDiffer = current && previous ? current.id !== previous.id : null;
    }
    report.status = 'READ_ONLY_METADATA_COLLECTED_NOT_ROOT_CAUSE_CERTIFICATION';
  } catch (error) {
    report.blockers.push(error instanceof MetadataFailure ? error.message : 'admin_identity_audit_failed');
    if (error instanceof MetadataFailure && error.httpStatus !== null) report.providerHttpStatus = error.httpStatus;
  }
  checkpoint(report);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const checkpoint = report => {
    if (process.env.ADMIN_IDENTITY_AUDIT_REPORT) fs.writeFileSync(process.env.ADMIN_IDENTITY_AUDIT_REPORT,
      `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  };
  const report = await collectAdminIdentityAudit({ checkpoint });
  console.log(JSON.stringify(report, null, 2));
  if (report.status === 'BLOCKED') process.exitCode = 1;
}
