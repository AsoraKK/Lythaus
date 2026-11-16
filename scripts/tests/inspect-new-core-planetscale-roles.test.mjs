import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { inspectNewCorePlanetScaleRoles } from '../ci/inspect-new-core-planetscale-roles.mjs';

const sourceSha = 'ba10cfb16941cd163e345af3c00b9bd739884646';
const token = 'synthetic-service-token-id:synthetic-service-token';
const labels = ['lythaus_runtime', 'lythaus_admin', 'lythaus_jobs', 'lythaus_privacy', 'lythaus_migrations', 'lythaus_verifier'];
const privateValues = new Set();

function roleRows({ inherited_roles = [] } = {}) {
  return labels.map((name, index) => {
    const id = `role${index}`;
    const baseUsername = `pscale_api_synthetic${index}`;
    const username = `${baseUsername}.xwkb9quljkzd`;
    privateValues.add(id);
    privateValues.add(baseUsername);
    privateValues.add(username);
    return {
      id,
      name,
      base_username: baseUsername,
      username,
      ready: true,
      deleted_at: null,
      database_name: 'postgres',
      expires_at: null,
      inherited_roles,
      branch: { id: 'xwkb9quljkzd', name: 'main', deleted_at: null },
    };
  });
}

function fetchFixture(rows, {
  branchId = 'xwkb9quljkzd',
  databaseId = '87dbkhprjh30',
  databaseDeletedAt,
  databaseRegion = { provider: 'AWS', display_name: 'AWS eu-central-1', location: 'Frankfurt', slug: 'eu-central' },
  status = 200,
} = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (status !== 200) return new Response(JSON.stringify({ raw: 'provider-secret-body' }), { status });
    if (url.endsWith('/databases/lythaus-new-core')) {
      return Response.json({
        id: databaseId,
        name: 'lythaus-new-core',
        kind: 'postgresql',
        ready: true,
        state: 'ready',
        ...(databaseDeletedAt === undefined ? {} : { deleted_at: databaseDeletedAt }),
        region: databaseRegion,
      });
    }
    if (url.endsWith('/branches/main')) {
      return Response.json({ id: branchId, name: 'main', kind: 'postgresql', deleted_at: null,
        ready: true, state: 'ready', cluster_name: 'PS_5_AWS_ARM', cluster_architecture: 'aarch64',
        cluster_display_name: 'PS-5 AWS Arm', replicas: 0 });
    }
    const urlObject = new URL(url);
    const page = Number(urlObject.searchParams.get('page'));
    return Response.json({
      current_page: page,
      total_count: rows.length,
      data: page === 1 ? rows : [],
      next_page: null,
    });
  };
  return { calls, fetchImpl };
}

test('reads only the pinned new database branch and paginated role inventory', async () => {
  const { calls, fetchImpl } = fetchFixture(roleRows());
  const expectedOriginUsernameSha256 = crypto.createHash('sha256')
    .update('pscale_api_synthetic1.xwkb9quljkzd').digest('hex');
  const result = await inspectNewCorePlanetScaleRoles({ token, sourceSha, expectedOriginUsernameSha256, fetchImpl });
  assert.equal(result.status, 'READ_ONLY_ROLE_INVENTORY_PASS');
  assert.equal(result.branchMatch, true);
  assert.equal(result.databaseId, '87dbkhprjh30');
  assert.equal(result.databaseMatch, true);
  assert.equal(result.databaseFields.deletedAtPresent, false);
  assert.equal(result.databaseFields.deletedAtAllowed, true);
  assert.equal(result.databaseFields.regionProviderMatch, true);
  assert.equal(result.databaseFields.regionSlugMatch, true);
  assert.equal(result.branchFields.clusterNameMatch, true);
  assert.equal(result.branchFields.replicasZero, true);
  assert.equal(result.logicalDatabase, 'postgres');
  assert.equal(result.roleCount, 6);
  assert.equal(result.activeCanonicalRoleCount, 6);
  assert.equal(result.hyperdriveOriginRoleClass, 'lythaus_admin');
  assert.equal(result.hyperdriveOriginRoleMatch, true);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].url, 'https://api.planetscale.com/v1/organizations/lythaus/databases/lythaus-new-core');
  assert.equal(calls[1].url, 'https://api.planetscale.com/v1/organizations/lythaus/databases/lythaus-new-core/branches/main');
  assert.equal(calls[2].url, 'https://api.planetscale.com/v1/organizations/lythaus/databases/lythaus-new-core/branches/main/roles?page=1&per_page=100');
  for (const call of calls) {
    assert.equal(call.init.method, 'GET');
    assert.equal(call.init.redirect, 'error');
    assert.equal(call.init.cache, 'no-store');
    assert.equal(call.init.headers.authorization, token);
  }
  const serialized = JSON.stringify(result);
  for (const value of privateValues) assert.equal(serialized.includes(value), false);
  assert.equal(serialized.includes(token), false);
});

test('reports only approved inherited pg role names and blocks broad role inheritance', async () => {
  const { fetchImpl } = fetchFixture(roleRows({ inherited_roles: ['pg_read_all_data', 'private_custom_role'] }));
  const result = await inspectNewCorePlanetScaleRoles({ token, sourceSha, fetchImpl });
  assert.equal(result.status, 'READ_ONLY_ROLE_INVENTORY_BLOCKED');
  assert.equal(result.inheritedRoleCount, 12);
  assert.deepEqual(result.inheritedPgRoleNames, ['pg_read_all_data']);
  assert.equal(result.unlistedInheritedRoleCount, 6);
  assert.equal(JSON.stringify(result).includes('private_custom_role'), false);
});

test('requires exactly one hash match for the Hyperdrive SQL role', async () => {
  const { fetchImpl } = fetchFixture(roleRows());
  const result = await inspectNewCorePlanetScaleRoles({
    token,
    sourceSha,
    expectedOriginUsernameSha256: '0'.repeat(64),
    fetchImpl,
  });
  assert.equal(result.status, 'READ_ONLY_ROLE_INVENTORY_BLOCKED');
  assert.equal(result.hyperdriveOriginRoleMatch, false);
  assert.equal(result.hyperdriveOriginRoleClass, null);
  assert.equal(result.hyperdriveOriginUsernameMatchCount, 0);
});

test('blocks branch mismatch, failed provider reads, and malformed pagination without raw response data', async () => {
  const mismatch = fetchFixture(roleRows(), { branchId: 'oldbranch000' });
  assert.equal((await inspectNewCorePlanetScaleRoles({ token, sourceSha, fetchImpl: mismatch.fetchImpl })).code,
    'new_core_branch_identity_mismatch');
  const wrongDatabase = fetchFixture(roleRows(), { databaseId: 'old-database' });
  const wrongDatabaseResult = await inspectNewCorePlanetScaleRoles({ token, sourceSha, fetchImpl: wrongDatabase.fetchImpl });
  assert.equal(wrongDatabaseResult.code, 'new_core_database_identity_mismatch');
  assert.equal(wrongDatabaseResult.databaseFields.idMatch, false);
  assert.equal(wrongDatabaseResult.databaseFields.nameMatch, true);
  const deletedDatabase = fetchFixture(roleRows(), { databaseDeletedAt: 'private-deletion-marker' });
  const deletedDatabaseResult = await inspectNewCorePlanetScaleRoles({ token, sourceSha, fetchImpl: deletedDatabase.fetchImpl });
  assert.equal(deletedDatabaseResult.code, 'new_core_database_identity_mismatch');
  assert.equal(deletedDatabaseResult.databaseFields.deletedAtPresent, true);
  assert.equal(deletedDatabaseResult.databaseFields.deletedAtNull, false);
  assert.equal(deletedDatabaseResult.databaseFields.deletedAtAllowed, false);
  assert.equal(JSON.stringify(deletedDatabaseResult).includes('private-deletion-marker'), false);
  const wrongRegion = fetchFixture(roleRows(), { databaseRegion: {
    provider: 'AWS', display_name: 'AWS eu-central-1', location: 'Frankfurt', slug: 'us-west',
  } });
  const wrongRegionResult = await inspectNewCorePlanetScaleRoles({ token, sourceSha, fetchImpl: wrongRegion.fetchImpl });
  assert.equal(wrongRegionResult.databaseFields.regionProviderMatch, true);
  assert.equal(wrongRegionResult.databaseFields.regionSlugMatch, false);
  assert.equal(JSON.stringify(wrongRegionResult).includes('us-west'), false);
  const unauthorized = fetchFixture([], { status: 403 });
  const denied = await inspectNewCorePlanetScaleRoles({ token, sourceSha, fetchImpl: unauthorized.fetchImpl });
  assert.equal(denied.httpStatus, 403);
  assert.equal(JSON.stringify(denied).includes('provider-secret-body'), false);
  const malformed = await inspectNewCorePlanetScaleRoles({
    token,
    sourceSha,
    fetchImpl: async (url) => url.endsWith('/databases/lythaus-new-core')
      ? Response.json({ id: '87dbkhprjh30', name: 'lythaus-new-core', deleted_at: null,
        kind: 'postgresql', ready: true, state: 'ready',
        region: { provider: 'AWS', display_name: 'AWS eu-central-1', location: 'Frankfurt', slug: 'eu-central' } })
      : url.endsWith('/branches/main')
        ? Response.json({ id: 'xwkb9quljkzd', name: 'main', kind: 'postgresql', deleted_at: null,
          ready: true, state: 'ready', cluster_name: 'PS_5_AWS_ARM', cluster_architecture: 'aarch64',
          cluster_display_name: 'PS-5 AWS Arm', replicas: 0 })
        : Response.json({ total_count: 1, data: [], next_page: null }),
  });
  assert.equal(malformed.code, 'role_pagination_invalid');
});

test('does not make provider requests when the service-token pair or source SHA is invalid', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error('must not run'); };
  assert.equal((await inspectNewCorePlanetScaleRoles({ token: 'invalid-format', sourceSha, fetchImpl })).code,
    'planetscale_service_token_pair_unavailable');
  assert.equal((await inspectNewCorePlanetScaleRoles({ token, sourceSha: 'untrusted', fetchImpl })).code,
    'source_sha_unavailable');
  assert.equal(calls, 0);
});
