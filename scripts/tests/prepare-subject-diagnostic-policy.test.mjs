import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import { buildSubjectDiagnosticPolicy, subjectDiagnosticPolicyModuleSource } from '../ci/prepare-subject-diagnostic-policy.mjs';
import { branchQualifiedDatabaseTarget } from '../ci/planetscale-0021-target-identity.mjs';

const adminApp = {
  id: 'fixture-admin-api', name: 'Lythaus Admin API', domain: 'admin-api.lythaus.co', aud: 'fixture-api',
};
const applications = [
  { id: 'fixture-admin-ui', name: 'Lythaus Admin UI', domain: 'admin.lythaus.co', aud: 'fixture-ui' },
  adminApp,
];
const policyList = [
  { decision: 'allow', include: [{ email: { email: 'operator@example.invalid' } }], exclude: [], require: [] },
  { decision: 'deny', include: [{ everyone: {} }] },
];

function fixture({ audience = 'fixture-api', policies = policyList, mainBranchId = 'branchfixture' } = {}) {
  const requests = [];
  const environment = {
    CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32),
    CLOUDFLARE_API_TOKEN: 'synthetic-cloudflare-token',
    EXPECTED_ADMIN_API_AUDIENCE_SNAPSHOT: 'fixture-api',
    PLANETSCALE_SCHEMA_READ_DATABASE_URL: 'postgresql://pscale_api_verifier.branchfixture:synthetic@us-east.psdb.cloud/postgres?sslmode=verify-full&sslrootcert=system',
    PLANETSCALE_API_TOKEN: 'synthetic-id:synthetic-token',
    PSCALE_ROLE_IDENTIFIERS: JSON.stringify({ lythaus_admin: 'pscale_api_fixture' }),
    PSCALE_BRANCH_NAME: 'main',
    PRODUCT_INTEGRITY_ACCESS_TEAM_DOMAIN: 'fixture.cloudflareaccess.com',
  };
  const fetchImpl = async (url, init) => {
    requests.push({ url: String(url), method: init?.method, headers: init?.headers });
    if (String(url) === 'https://api.planetscale.com/v1/organizations/lythaus/databases/lythaus-core/branches/main') {
      return Response.json({ id: mainBranchId, name: 'main' });
    }
    if (String(url).endsWith('/access/apps?per_page=1000')) {
      return Response.json({ success: true, result: applications.map((app) => app.name === 'Lythaus Admin API' ? { ...app, aud: audience } : app) });
    }
    if (String(url).endsWith('/access/apps/fixture-admin-ui/policies?per_page=100')) {
      return Response.json({ success: true, result: policies });
    }
    if (String(url).endsWith('/access/apps/fixture-admin-api/policies?per_page=100')) {
      return Response.json({ success: true, result: policies });
    }
    throw new Error('unexpected_fixture_request');
  };
  const verifyTargets = async ({ environment: targetEnvironment, readOnlyGetOnly }) => {
    assert.equal(readOnlyGetOnly, true);
    assert.equal(targetEnvironment.HYPERDRIVE_VERIFY_IDS, '6bfbb0eab42642e8ad294dbf59294ed3');
    const metadata = branchQualifiedDatabaseTarget(targetEnvironment.PLANETSCALE_SCHEMA_READ_DATABASE_URL);
    assert.equal(metadata.role, 'pscale_api_verifier');
    return {
      status: 'pass', targetBranch: 'main', originFingerprint: metadata.originFingerprint,
      bindings: [{ worker: 'lythaus-admin-api-development', binding: 'DB_ADMIN_FRESH', roleClass: 'lythaus_admin', hyperdriveId: '6bfbb0eab42642e8ad294dbf59294ed3', originFingerprint: metadata.originFingerprint, roleMatches: true, runtimeRoleMatches: true }],
    };
  };
  return { environment, fetchImpl, verifyTargets, requests };
}

test('policy capture pins the exact API audience and Admin main target without exposing values', async () => {
  const f = fixture();
  const policy = await buildSubjectDiagnosticPolicy({ ...f, nowMs: 1_000_000 });
  assert.equal(policy.origin, 'https://admin-api.lythaus.co');
  assert.equal(policy.accessIssuer, 'https://fixture.cloudflareaccess.com');
  assert.equal(policy.accessAudience, 'fixture-api');
  assert.deepEqual(policy.databaseTarget, {
    branchId: 'branchfixture', databaseName: 'postgres',
    originFingerprint: branchQualifiedDatabaseTarget(f.environment.PLANETSCALE_SCHEMA_READ_DATABASE_URL).originFingerprint,
    roleFingerprint: crypto.createHash('sha256').update('lythaus-admin-diagnostic-role:v1:pscale_api_fixture').digest('hex'),
  });
  assert.equal(policy.expiresAt - policy.notBefore, 3 * 60 * 60);
  assert.ok(f.requests.some((request) => request.url === 'https://api.planetscale.com/v1/organizations/lythaus/databases/lythaus-core/branches/main'));
  assert.ok(f.requests.every((request) => request.method === 'GET'));
  const moduleSource = subjectDiagnosticPolicyModuleSource(policy);
  assert.equal(moduleSource.includes('operator@example.invalid'), false);
  assert.equal(moduleSource.includes('synthetic-cloudflare-token'), false);
  assert.equal(moduleSource.includes('synthetic-id:synthetic-token'), false);
  assert.equal(moduleSource.includes('synthetic@'), false);
});

test('capture fails closed on a changed API audience or weakened Access policy', async () => {
  const wrongAudience = fixture({ audience: 'other-api' });
  await assert.rejects(() => buildSubjectDiagnosticPolicy({ ...wrongAudience, nowMs: 1_000_000 }), /audience_snapshot_mismatch/);

  const weakenedPolicies = fixture({ policies: [{ decision: 'allow', include: [{ everyone: {} }], exclude: [], require: [] }, { decision: 'deny' }] });
  await assert.rejects(() => buildSubjectDiagnosticPolicy({ ...weakenedPolicies, nowMs: 1_000_000 }), /exactly one email/);
});

test('capture fails closed for missing, wrong-branch, wrong-role, or unsupported database targets', async () => {
  for (const patch of [
    { PSCALE_ROLE_IDENTIFIERS: '{}' },
    { PSCALE_BRANCH_NAME: 'development' },
    { PLANETSCALE_SCHEMA_READ_DATABASE_URL: 'postgresql://pscale_api_verifier.otherbranch:synthetic@us-east.psdb.cloud/postgres?sslmode=verify-full&sslrootcert=system' },
    { PLANETSCALE_SCHEMA_READ_DATABASE_URL: 'postgresql://invalid_role.branchfixture:synthetic@us-east.psdb.cloud/postgres?sslmode=verify-full' },
    { PLANETSCALE_SCHEMA_READ_DATABASE_URL: 'postgresql://pscale_api_verifier.branchfixture:synthetic@us-east.psdb.cloud/postgres?sslmode=verify-full&unknown=unsafe' },
    { PLANETSCALE_SCHEMA_READ_DATABASE_URL: 'postgresql://pscale_api_verifier.branchfixture:synthetic@us-east.psdb.cloud/postgres?sslmode=verify-full&sslmode=require' },
  ]) {
    const f = fixture();
    Object.assign(f.environment, patch);
    await assert.rejects(() => buildSubjectDiagnosticPolicy({ ...f, nowMs: 1_000_000 }));
  }
});

test('capture compares the parsed branch and Admin Hyperdrive origin with fresh main evidence', async () => {
  const wrongMainBranch = fixture({ mainBranchId: 'anotherbranch' });
  await assert.rejects(() => buildSubjectDiagnosticPolicy({ ...wrongMainBranch, nowMs: 1_000_000 }), /main_branch_mismatch/);

  const wrongHyperdriveOrigin = fixture();
  const verifyTargets = wrongHyperdriveOrigin.verifyTargets;
  wrongHyperdriveOrigin.verifyTargets = async (options) => {
    const result = await verifyTargets(options);
    return { ...result, originFingerprint: 'c'.repeat(64) };
  };
  await assert.rejects(() => buildSubjectDiagnosticPolicy({ ...wrongHyperdriveOrigin, nowMs: 1_000_000 }), /admin_hyperdrive_unverified/);
});
