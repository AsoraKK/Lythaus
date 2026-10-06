import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { captureIncidentDatabaseEvidence } from './auth-incident-database-contract.mjs';
import { captureAuthEmailQueueEvidence } from './auth-email-queue-evidence.mjs';

const { Client } = pg;

const outputPath = process.env.AUTH_INCIDENT_AUDIT_OUTPUT
  ?? '.artifacts/auth-incident/production-auth-incident.json';
const databaseUrl = process.env.PLANETSCALE_SCHEMA_READ_DATABASE_URL ?? '';
const cloudflareToken = process.env.CLOUDFLARE_API_TOKEN ?? '';
const cloudflareAccountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
const cloudflareZoneId = process.env.CLOUDFLARE_ZONE_ID ?? '';
const sendingDomain = process.env.AUTH_EMAIL_SENDING_DOMAIN ?? 'mail.lythaus.co';
const sendingFrom = process.env.AUTH_EMAIL_FROM ?? `no-reply@${sendingDomain}`;
const acceptanceEmail = process.env.CODEX_TEST_EMAIL ?? '';
const sendProbe = process.env.AUTH_INCIDENT_SEND_PROBE === 'true';

function sanitizeProviderMessage(value) {
  return String(value ?? '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\s+/g, ' ')
    .slice(0, 240);
}

function buildArbitraryRecipientProbe(email) {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf('@');
  if (at <= 0) throw new Error('CODEX_TEST_EMAIL is not a valid email address');
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  if (domain !== 'gmail.com' && domain !== 'googlemail.com') {
    throw new Error('CODEX_TEST_EMAIL must be a Gmail address for the non-PII plus-alias entitlement probe');
  }
  const baseLocal = local.split('+')[0];
  const probeTag = `lythaus-cf-probe-${Date.now().toString(36)}`;
  return `${baseLocal}+${probeTag}@${domain}`;
}

async function cloudflareJson(url, init = {}, { retryTransient = true } = {}) {
  let response;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${cloudflareToken}`,
        Accept: 'application/json',
        ...(init.headers ?? {}),
      },
    });
    if (!retryTransient || ![429, 500, 502, 503, 504].includes(response.status) || attempt === 2) break;
    await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)));
  }
  const body = await response.json().catch(() => ({}));
  return { httpStatus: response.status, body };
}

async function capturePlanetScale(report) {
  if (!databaseUrl) throw new Error('PLANETSCALE_SCHEMA_READ_DATABASE_URL is required');
  const connection = new URL(databaseUrl);
  if (connection.searchParams.get('sslmode') !== 'verify-full') {
    throw new Error('production auth incident audit requires PlanetScale sslmode=verify-full');
  }
  if (connection.searchParams.get('sslrootcert') === 'system') connection.searchParams.delete('sslrootcert');

  const client = new Client({ connectionString: connection.toString(), ssl: { rejectUnauthorized: true } });
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const evidence = await captureIncidentDatabaseEvidence(client);
    await client.query('ROLLBACK');
    report.planetscale = evidence;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function captureCloudflare(report) {
  if (!cloudflareToken || !cloudflareAccountId || !cloudflareZoneId) {
    throw new Error('Cloudflare account, zone, and token are required');
  }
  const subdomainsUrl = `https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/email/sending/subdomains`;
  const subdomains = await cloudflareJson(subdomainsUrl);
  const rows = Array.isArray(subdomains.body?.result) ? subdomains.body.result : [];
  const sender = rows.find((row) => row?.name === sendingDomain);

  report.cloudflare = {
    sendingDomain,
    subdomainApi: {
      httpStatus: subdomains.httpStatus,
      success: subdomains.body?.success === true,
      enabled: sender?.enabled === true,
      hasTag: typeof sender?.tag === 'string' && sender.tag.length > 0,
      hasDkimSelector: typeof sender?.dkim_selector === 'string' && sender.dkim_selector.length > 0,
      hasReturnPathDomain: typeof sender?.return_path_domain === 'string' && sender.return_path_domain.length > 0,
    },
    analytics: { available: false },
    arbitraryRecipientProbe: { attempted: false },
    piiIncluded: false,
  };
  report.cloudflare.dispatchQueue = await captureAuthEmailQueueEvidence({
    accountId: cloudflareAccountId, requestJson: cloudflareJson,
  });
  report.cloudflare.remainingSendingQuota = {
    status: 'UNVERIFIED', reason: 'account_quota_not_exposed_by_observed_endpoints',
  };

  const end = new Date();
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  const graphqlQuery = `query EmailSendingIncident($zoneTag: string!, $start: Time!, $end: Time!) {
    viewer {
      zones(filter: { zoneTag: $zoneTag }) {
        emailSendingAdaptiveGroups(
          filter: { datetime_geq: $start, datetime_leq: $end }
          limit: 1000
        ) {
          count
          dimensions { status errorCause sendingDomain }
        }
      }
    }
  }`;
  const analyticsResponse = await cloudflareJson('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: graphqlQuery,
      variables: { zoneTag: cloudflareZoneId, start: start.toISOString(), end: end.toISOString() },
    }),
  });
  const analyticsRows = analyticsResponse.body?.data?.viewer?.zones?.[0]?.emailSendingAdaptiveGroups;
  if (Array.isArray(analyticsRows)) {
    report.cloudflare.analytics = {
      available: true,
      windowHours: 24,
      groups: analyticsRows.map((row) => ({
        count: Number(row?.count ?? 0),
        status: row?.dimensions?.status ?? null,
        errorCause: row?.dimensions?.errorCause ?? null,
        sendingDomain: row?.dimensions?.sendingDomain ?? null,
      })),
    };
  } else {
    report.cloudflare.analytics = {
      available: false,
      httpStatus: analyticsResponse.httpStatus,
      errors: Array.isArray(analyticsResponse.body?.errors)
        ? analyticsResponse.body.errors.slice(0, 5).map((error) => ({
          message: sanitizeProviderMessage(error?.message),
        }))
        : [],
      note: 'Analytics Read permission may be missing from the production Cloudflare token.',
    };
  }

  if (!sendProbe) {
    report.cloudflare.arbitraryRecipientProbe = {attempted:false,reason:'explicit_send_approval_required'};
    return;
  }
  if (!acceptanceEmail) throw new Error('CODEX_TEST_EMAIL is required for the arbitrary-recipient probe');
  const probeRecipient = buildArbitraryRecipientProbe(acceptanceEmail);
  report.cloudflare.arbitraryRecipientProbe.attempted = true;
  const sendResponse = await cloudflareJson(`https://api.cloudflare.com/client/v4/accounts/${cloudflareAccountId}/email/sending/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: { address: sendingFrom, name: 'Lythaus' },
      to: probeRecipient,
      subject: 'Lythaus production email entitlement probe',
      html: '<p>This is an automated Lythaus production email entitlement probe. No action is required.</p>',
      text: 'This is an automated Lythaus production email entitlement probe. No action is required.',
    }),
  }, { retryTransient: false });
  const sendResult = sendResponse.body?.result ?? {};
  report.cloudflare.arbitraryRecipientProbe = {
    attempted: true,
    httpStatus: sendResponse.httpStatus,
    success: sendResponse.body?.success === true,
    messageIdPresent: typeof sendResult?.message_id === 'string' && sendResult.message_id.length > 0,
    deliveredCount: Array.isArray(sendResult?.delivered) ? sendResult.delivered.length : 0,
    queuedCount: Array.isArray(sendResult?.queued) ? sendResult.queued.length : 0,
    permanentBounceCount: Array.isArray(sendResult?.permanent_bounces) ? sendResult.permanent_bounces.length : 0,
    errors: Array.isArray(sendResponse.body?.errors)
      ? sendResponse.body.errors.slice(0, 5).map((error) => ({
        code: error?.code ?? null,
        message: sanitizeProviderMessage(error?.message),
      }))
      : [],
    recipientRecorded: false,
  };
}

const report = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  purpose: 'P0 production signup and verification-email incident',
  productionAuthStatus: 'NO_GO_UNTIL_FRESH_SIGNUP_VERIFICATION_PASSES',
  reviewedSha: process.env.GITHUB_SHA ?? null,
};

const failures = [];
try {
  await capturePlanetScale(report);
} catch (error) {
  report.planetscale = { status: 'FAILED', error: sanitizeProviderMessage(error instanceof Error ? error.message : error) };
  failures.push('planetscale_read_only_audit_failed');
}

try {
  await captureCloudflare(report);
} catch (error) {
  report.cloudflare ??= {};
  report.cloudflare.status = 'FAILED';
  report.cloudflare.error = sanitizeProviderMessage(error instanceof Error ? error.message : error);
  failures.push('cloudflare_email_audit_failed');
}

if (report.cloudflare?.subdomainApi?.success !== true || report.cloudflare?.subdomainApi?.enabled !== true) {
  failures.push('cloudflare_sending_domain_not_enabled');
}
if (report.cloudflare?.dispatchQueue?.status !== 'VERIFIED') {
  failures.push('cloudflare_dispatch_queue_not_ready');
}
if (sendProbe && report.cloudflare?.arbitraryRecipientProbe?.success !== true) {
  failures.push('cloudflare_arbitrary_recipient_probe_failed');
}

report.failures = [...new Set(failures)];
report.mode = sendProbe ? 'approved_provider_send_probe' : 'read_only';
report.status = report.failures.length === 0 ? 'DIAGNOSTIC_PASS' : 'DIAGNOSTIC_FAIL';

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`Wrote sanitized production auth incident audit to ${outputPath}.`);
console.log(`Incident audit status: ${report.status}`);
if (report.failures.length > 0) {
  console.error(`Incident audit failures: ${report.failures.join(', ')}`);
  process.exitCode = 1;
}
