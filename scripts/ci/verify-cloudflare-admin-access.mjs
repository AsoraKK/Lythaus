import { pathToFileURL } from 'node:url';
import { requireAdminApiAudienceSnapshot } from './cloudflare-admin-api-audience.mjs';

const expectedApplications = [
  { name: 'Lythaus Admin UI', destination: 'admin.lythaus.co' },
  { name: 'Lythaus Admin API', destination: 'admin-api.lythaus.co' },
];

function destinations(application) {
  return [
    application?.domain,
    application?.destination,
    ...(Array.isArray(application?.domains) ? application.domains : []),
    ...(Array.isArray(application?.self_hosted_domains) ? application.self_hosted_domains : []),
  ].filter((value) => typeof value === 'string').map((value) => value.toLowerCase());
}

function policyDecision(policy) {
  return String(policy?.decision ?? policy?.action ?? '').toLowerCase();
}

function emailSelector(selector) {
  const value = selector?.email?.email ?? selector?.email;
  return typeof value === 'string' && value.includes('@') ? value.toLowerCase() : null;
}

export async function verifyCloudflareAdminAccess({ environment = process.env, fetchImpl = fetch } = {}) {
  const accountId = environment.CLOUDFLARE_ACCOUNT_ID ?? '';
  const token = environment.CLOUDFLARE_API_TOKEN ?? '';
  const expectedAdminApiAudience = environment.EXPECTED_ADMIN_API_AUDIENCE_SNAPSHOT;
  if (!/^[0-9a-f]{32}$/i.test(accountId)) throw new Error('CLOUDFLARE_ACCOUNT_ID is required');
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN is required');

  const accountBase = `https://api.cloudflare.com/client/v4/accounts/${accountId}`;
  async function request(path) {
    const response = await fetchImpl(`${accountBase}${path}`, {
      method: 'GET',
      redirect: 'error',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
      },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.success !== true) {
      throw new Error(`Cloudflare Access request failed with HTTP ${response.status}`);
    }
    return payload.result;
  }

  const applications = await request('/access/apps?per_page=1000');
  if (!Array.isArray(applications)) throw new Error('Cloudflare Access application inventory is not an array');

  const verified = [];
  for (const expected of expectedApplications) {
    const matches = applications.filter((application) => (
      application?.name === expected.name && destinations(application).includes(expected.destination)
    ));
    if (matches.length !== 1) throw new Error(`expected exactly one ${expected.name} for ${expected.destination}`);
    const application = matches[0];
    if (expected.name === 'Lythaus Admin API' && expectedAdminApiAudience !== undefined) {
      requireAdminApiAudienceSnapshot(application, expectedAdminApiAudience);
    }
    const policies = await request(`/access/apps/${application.id}/policies?per_page=100`);
    if (!Array.isArray(policies)) throw new Error(`${expected.name} Access policies are not an array`);

    const allows = policies.filter((policy) => policyDecision(policy) === 'allow');
    if (allows.length !== 1) throw new Error(`${expected.name} must have exactly one human allow policy`);
    const allow = allows[0];
    const include = Array.isArray(allow.include) ? allow.include : [];
    const emails = include.map(emailSelector).filter(Boolean);
    if (include.length !== 1 || emails.length !== 1 || (allow.exclude?.length ?? 0) !== 0 || (allow.require?.length ?? 0) !== 0) {
      throw new Error(`${expected.name} human allow policy must include exactly one email and no other selectors`);
    }
    const blocks = policies.filter((policy) => ['deny', 'block'].includes(policyDecision(policy)));
    if (blocks.length < 1) throw new Error(`${expected.name} must retain a deny-all Access policy`);
    if (policies.some((policy) => policyDecision(policy) === 'bypass')) {
      throw new Error(`${expected.name} must not have a human bypass policy`);
    }
    verified.push({
      name: expected.name,
      destination: expected.destination,
      humanAllowPolicyCount: allows.length,
      blockingPolicyCount: blocks.length,
      serviceAuthPolicyCount: policies.filter((policy) => policyDecision(policy) === 'service_auth').length,
      humanAllowEmail: emails[0],
      audience: application.aud ?? null,
    });
  }

  if (verified[0].humanAllowEmail !== verified[1].humanAllowEmail) {
    throw new Error('Admin UI and Admin API do not share the same sole human Access identity');
  }
  const apiAudience = verified.find((application) => application.name === 'Lythaus Admin API')?.audience;
  if (typeof apiAudience !== 'string' || apiAudience.length === 0) {
    throw new Error('Admin API audience is missing');
  }
  return {
    status: 'verified',
    applications: verified.map(({ humanAllowEmail: _humanAllowEmail, ...application }) => application),
    soleHumanIdentityShared: true,
    adminApiAudience: apiAudience,
    adminApiAudienceMatchesSnapshot: expectedAdminApiAudience === undefined ? null : true,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { adminApiAudience: _adminApiAudience, ...report } = await verifyCloudflareAdminAccess();
  console.log(JSON.stringify({
    ...report,
    applications: report.applications.map(({ audience: _audience, ...application }) => application),
  }));
}
