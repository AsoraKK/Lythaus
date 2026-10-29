import assert from 'node:assert/strict';
import test from 'node:test';
import { reducePagesAliasEvidence } from '../cloudflare/reduce-pages-alias-evidence.mjs';

const accountId = 'e5b7ae46e04698f507b7e4b3d4ef1af0';
const projectId = 'd00dfa8e-e4e1-47e0-8387-e3bc24de3493';
const deploymentId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const sha = 'a'.repeat(40);
const page = (records, number = 1, totalPages = 1, totalCount = records.length, perPage = 100) =>
  ({ page: number, perPage, totalPages, totalCount, records });
const deployment = (overrides = {}) => ({ id: deploymentId, projectId, projectName: 'lythaus-web',
  environment: 'production', isSkipped: false, stageName: 'deploy', stageStatus: 'success', branch: 'main',
  commitSha: sha, commitDirty: false, url: 'https://11111111.lythaus-web.pages.dev',
  aliases: ['https://app.lythaus.co'], ...overrides });
const snapshot = (at = '2026-10-29T19:00:00.000Z') => ({ at,
  project: { accountId, id: projectId, name: 'lythaus-web', productionBranch: 'main', subdomain: 'lythaus-web.pages.dev' },
  domain: { name: 'app.lythaus.co', status: 'active' },
  deploymentPages: [page([deployment()])] });
const pair = () => ({ first: snapshot(), second: snapshot('2026-10-29T19:00:02.000Z') });

test('a stable, unique successful production alias is only an observation', () => {
  const result = reducePagesAliasEvidence(pair());
  assert.deepEqual(result, { schemaVersion: 'lythaus-pages-alias-observation-v1',
    status: 'OBSERVED_UNIQUE_ALIAS', authorization: 'NONE', project: 'lythaus-web', hostname: 'app.lythaus.co',
    firstObservedAt: '2026-10-29T19:00:00.000Z', secondObservedAt: '2026-10-29T19:00:02.000Z', deploymentCount: 1,
    match: { deploymentId, commitSha: sha, branch: 'main' } });
});

test('absence is inconclusive and a lookalike hostname is not a match', () => {
  for (const alias of ['https://app.lythaus.co.evil.test']) {
    const input = pair();
    for (const part of [input.first, input.second]) part.deploymentPages[0].records[0].aliases = [alias];
    const result = reducePagesAliasEvidence(input);
    assert.equal(result.status, 'INCONCLUSIVE');
    assert.equal(result.match, null);
    assert.equal(result.authorization, 'NONE');
    assert.doesNotMatch(JSON.stringify(result), /evil/);
  }
});

test('target-host paths or trailing dots fail even beside an exact alias', () => {
  for (const alias of ['https://app.lythaus.co/article', 'https://app.lythaus.co./',
    'https://app.lythaus.co?', 'https://app.lythaus.co#']) {
    const input = pair();
    for (const part of [input.first, input.second]) {
      part.deploymentPages = [page([deployment(), deployment({ id: otherId,
        url: 'https://22222222.lythaus-web.pages.dev', aliases: [alias] })])];
    }
    assert.throws(() => reducePagesAliasEvidence(input), /target_alias_ambiguous/);
  }
});

test('pagination must be complete, consistent and contain unique deployments', () => {
  const input = pair();
  for (const part of [input.first, input.second]) {
    part.deploymentPages = [page([deployment()], 1, 2, 2, 1),
      page([deployment({ id: otherId, url: 'https://22222222.lythaus-web.pages.dev',
        environment: 'preview', aliases: ['https://preview.lythaus-web.pages.dev'] })], 2, 2, 2, 1)];
  }
  assert.equal(reducePagesAliasEvidence(input).deploymentCount, 2);
  const missing = structuredClone(input); missing.second.deploymentPages.pop();
  assert.throws(() => reducePagesAliasEvidence(missing), /pagination_incomplete/);
  const changed = structuredClone(input); changed.second.deploymentPages[1].totalCount = 3;
  assert.throws(() => reducePagesAliasEvidence(changed), /pagination_incomplete/);
  const duplicate = structuredClone(input); duplicate.second.deploymentPages[1].records[0].id = deploymentId;
  assert.throws(() => reducePagesAliasEvidence(duplicate), /deployment_invalid/);
  const duplicateUrl = structuredClone(input); duplicateUrl.second.deploymentPages[1].records[0].url = 'https://11111111.lythaus-web.pages.dev';
  assert.throws(() => reducePagesAliasEvidence(duplicateUrl), /deployment_invalid/);
  for (const change of [{ environment: 'bad' }, { isSkipped: 'false' }, { stageName: 'bad' }, { stageStatus: 'bad' },
    { branch: '!' }, { commitSha: 'bad' }, { commitSha: [sha] }, { id: [otherId] },
    { commitDirty: 'false' }, { url: 'https://example.test' },
    { url: 'https://22222222.lythaus-web.pages.dev/?' }, { url: 'https://22222222.lythaus-web.pages.dev/#' }]) {
    const malformed = structuredClone(input); Object.assign(malformed.first.deploymentPages[1].records[0], change);
    assert.throws(() => reducePagesAliasEvidence(malformed), /deployment_invalid/);
  }
});

test('multiple, preview, failed, skipped or dirty hostname matches cannot be accepted', () => {
  const values = [{ environment: 'preview' }, { isSkipped: true }, { isSkipped: null }, { stageStatus: 'failure' },
    { stageName: 'build' }, { commitDirty: true }, { commitDirty: null }, { commitSha: null }, { commitSha: '' }, { branch: 'preview' }];
  for (const change of values) {
    const input = pair(); Object.assign(input.first.deploymentPages[0].records[0], change);
    assert.throws(() => reducePagesAliasEvidence(input), /alias_match_invalid/);
  }
  const repeated = pair(); repeated.first.deploymentPages[0].records[0].aliases = ['https://app.lythaus.co', 'https://APP.lythaus.co/'];
  assert.throws(() => reducePagesAliasEvidence(repeated), /aliases_invalid/);
  const multiple = pair();
  for (const part of [multiple.first, multiple.second]) {
    part.deploymentPages = [page([deployment(), deployment({ id: otherId, url: 'https://22222222.lythaus-web.pages.dev' })])];
  }
  assert.throws(() => reducePagesAliasEvidence(multiple), /alias_match_ambiguous/);
});

test('missing optional metadata on an unrelated deployment does not hide the target match', () => {
  const input = pair();
  for (const part of [input.first, input.second]) {
    part.deploymentPages = [page([deployment(), deployment({ id: otherId, environment: 'preview',
      url: 'https://22222222.lythaus-web.pages.dev', aliases: ['https://other.lythaus-web.pages.dev'],
      isSkipped: null, stageName: null, stageStatus: null, branch: null, commitSha: null, commitDirty: null })])];
  }
  assert.equal(reducePagesAliasEvidence(input).status, 'OBSERVED_UNIQUE_ALIAS');
});

test('project, domain, timestamp and alias drift fail closed', () => {
  const wrongProject = pair(); wrongProject.first.project.id = otherId;
  assert.throws(() => reducePagesAliasEvidence(wrongProject), /project_binding_invalid/);
  const wrongAccount = pair(); wrongAccount.first.project.accountId = '0'.repeat(32);
  assert.throws(() => reducePagesAliasEvidence(wrongAccount), /project_binding_invalid/);
  const domain = pair(); domain.first.domain.status = 'pending';
  assert.throws(() => reducePagesAliasEvidence(domain), /domain_inactive/);
  const dotted = pair(); dotted.first.domain.name = 'app.lythaus.co.';
  assert.throws(() => reducePagesAliasEvidence(dotted), /domain_binding_invalid/);
  const backwards = pair(); backwards.second.at = '2026-10-29T18:59:59.000Z';
  assert.throws(() => reducePagesAliasEvidence(backwards), /timestamp_invalid/);
  const impossible = pair(); impossible.first.at = '2026-02-30T19:00:00.000Z';
  assert.throws(() => reducePagesAliasEvidence(impossible), /timestamp_invalid/);
  const drift = pair(); drift.second.deploymentPages[0].records[0].aliases = ['https://other.lythaus-web.pages.dev'];
  assert.throws(() => reducePagesAliasEvidence(drift), /observation_changed/);
  const domainDrift = pair(); domainDrift.second.domain.name = 'other.lythaus.co';
  assert.throws(() => reducePagesAliasEvidence(domainDrift), /domain_binding_invalid/);
  const aliasDrift = pair(); aliasDrift.second.deploymentPages[0].records[0].aliases.push('https://other.lythaus-web.pages.dev');
  assert.throws(() => reducePagesAliasEvidence(aliasDrift), /observation_changed/);
});

test('deployment URLs bind to the provider-supplied project subdomain', () => {
  const input = pair();
  for (const part of [input.first, input.second]) {
    part.project.subdomain = 'previous-project.pages.dev';
    part.deploymentPages[0].records[0].url = 'https://11111111.previous-project.pages.dev';
  }
  assert.equal(reducePagesAliasEvidence(input).status, 'OBSERVED_UNIQUE_ALIAS');
  input.second.deploymentPages[0].records[0].url = 'https://11111111.lythaus-web.pages.dev';
  assert.throws(() => reducePagesAliasEvidence(input), /deployment_invalid/);
});

test('raw provider fields and credential-shaped extras are rejected without reflection', () => {
  const input = pair();
  input.first.deploymentPages[0].records[0].env_vars = { SECRET: 'synthetic-do-not-output' };
  assert.throws(() => reducePagesAliasEvidence(input), error =>
    /unexpected_or_sensitive_input_field/.test(error.message) && !error.message.includes('synthetic-do-not-output'));
  const missing = pair(); delete missing.first.deploymentPages[0].records[0].aliases;
  assert.throws(() => reducePagesAliasEvidence(missing), /unexpected_or_sensitive_input_field/);
  const arraySha = pair(); arraySha.first.deploymentPages[0].records[0].commitSha = [sha];
  assert.throws(() => reducePagesAliasEvidence(arraySha), /deployment_invalid/);
});
