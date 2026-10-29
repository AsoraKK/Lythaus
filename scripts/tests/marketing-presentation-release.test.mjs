import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { classifyPresentationChanges, parseRawChanges, verifyPresentationScope } from '../ci/marketing-presentation-scope.mjs';
import { artifactDigest, assertCandidateBound, assertCleanBuildInputs, assertSnapshotUnchanged, canonicalMarketingProject,
  readPublicSurfaces, rollbackMarketing } from '../ci/marketing-presentation-deployment.mjs';
import { verifyMarketingReleaseEvidence } from '../ci/marketing-presentation-evidence.mjs';

const base = '2961ad91f9ad62ff3276f87195b0a7a821b559e1';
const candidate = 'bbff8874a46b98fe1fa6e328b3399777c20b87f5';
const raw = () => execFileSync('git', ['diff', '--no-ext-diff', '--no-renames', '--no-abbrev', '--raw', '-z', base, candidate, '--']);
const blob = (side, name) => execFileSync('git', ['show', `${side === 'base' ? base : candidate}:${name}`]);
const account = 'e5b7ae46e04698f507b7e4b3d4ef1af0', projectId = 'd91f8bb3-fd6b-4a9b-b308-f400fdd9e460';
const beforeId = '11111111-1111-4111-8111-111111111111', newId = '22222222-2222-4222-8222-222222222222';
const project = (commitSha, deploymentId) => ({ success: true, result: { id: projectId, name: 'lythaus-marketing', production_branch: 'main',
  canonical_deployment: { id: deploymentId, project_id: projectId, project_name: 'lythaus-marketing', environment: 'production',
    url: `https://${deploymentId.slice(0, 8)}.lythaus-marketing.pages.dev`, latest_stage: { status: 'success' },
    deployment_trigger: { metadata: { branch: 'main', commit_dirty: false, commit_hash: commitSha } } } } });
const before = canonicalMarketingProject(project(base, beforeId)), next = canonicalMarketingProject(project(candidate, newId));

test('actual deployed-to-main comparison admits only the reviewed presentation bytes', () => {
  const result = verifyPresentationScope(base, candidate);
  assert.equal(result.status, 'PRESENTATION_ONLY'); assert.equal(result.recovery, 'NOT_APPLICABLE');
  assert.equal(result.changes.length, 11); assert.ok(result.changes.includes('apps/marketing-site/src/pages/index.astro'));
});

for (const name of ['package-lock.json', 'apps/marketing-site/package.json', 'tools/marketing/astro-cache-policy/index.cjs',
  'packages/contracts/src/password-policy.ts', 'apps/marketing-site/src/scripts/auth-request.ts',
  'apps/marketing-site/public/_headers', 'apps/marketing-site/public/_redirects',
  'apps/marketing-site/functions/api.js', 'apps/marketing-site/public/_worker.js', 'unclassified/input.txt']) {
  test(`unreviewed dependency, auth, header, redirect or function blocks: ${name}`, () => {
    const changes = parseRawChanges(raw()); changes.push({ name, status: 'M', oldMode: '100644', newMode: '100644' });
    assert.throws(() => classifyPresentationChanges(changes, blob), /marketing_scope_unapproved/);
  });
}

test('a form or script change hidden inside an otherwise allowed source file blocks', () => {
  const changes = parseRawChanges(raw());
  assert.throws(() => classifyPresentationChanges(changes, (side, name) => name.endsWith('/index.astro') && side === 'candidate'
    ? Buffer.from('changed form behavior') : blob(side, name)), /marketing_presentation_bytes_changed/);
});

test('a CI change beyond the reviewed additional test blocks', () => {
  const changes = parseRawChanges(raw());
  changes.push({ name: '.github/workflows/ci.yml', status: 'M', oldMode: '100644', newMode: '100644' });
  assert.throws(() => classifyPresentationChanges(changes, (side, name) => name === '.github/workflows/ci.yml'
    ? Buffer.from(side === 'base' ? 'original security checks' : 'security checks removed') : blob(side, name)), /marketing_ci_change_unapproved/);
});

test('incomplete, renamed, duplicate, nonregular and nonancestor scope fails closed', () => {
  const changes = parseRawChanges(raw());
  assert.throws(() => classifyPresentationChanges(changes.slice(1), blob), /marketing_reviewed_presentation_incomplete/);
  assert.throws(() => classifyPresentationChanges([...changes, changes[0]], blob), /marketing_diff_duplicate/);
  assert.throws(() => parseRawChanges(Buffer.from(':100644 100644 ' + 'a'.repeat(40) + ' ' + 'b'.repeat(40) + ' R\0a\0b\0')), /marketing_diff_incomplete/);
  assert.throws(() => classifyPresentationChanges(changes.map((x, i) => i ? x : { ...x, newMode: '120000' }), blob), /marketing_scope_unapproved/);
  assert.throws(() => verifyPresentationScope(candidate, base), /marketing_deployed_commit_not_ancestor/);
});

test('only the exact production project and clean successful canonical deployment qualify', () => {
  for (const mutate of [x => { x.result.id = 'other'; }, x => { x.result.canonical_deployment.environment = 'preview'; },
    x => { x.result.canonical_deployment.latest_stage.status = 'active'; }, x => { x.result.canonical_deployment.deployment_trigger.metadata.commit_dirty = true; },
    x => { x.result.canonical_deployment.deployment_trigger.metadata.branch = 'other'; }, x => { x.result.canonical_deployment.url = 'https://evil.example'; }]) {
    const payload = structuredClone(project(base, beforeId)); mutate(payload);
    assert.throws(() => canonicalMarketingProject(payload), /marketing_canonical_deployment_unverified/);
  }
  assert.throws(() => assertSnapshotUnchanged(before, next), /marketing_deployment_changed_since_scope/);
  assert.throws(() => assertCandidateBound(before, null, next, candidate), /marketing_candidate_not_current/);
});

test('artifact digest binds names and bytes and refuses symlinks', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'marketing-artifact-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'index.html'), 'first'); const a = artifactDigest(root);
  fs.writeFileSync(path.join(root, 'index.html'), 'second'); assert.notEqual(artifactDigest(root).sha256, a.sha256);
  fs.symlinkSync('index.html', path.join(root, 'link')); assert.throws(() => artifactDigest(root), /marketing_artifact_symlink_refused/);
});

test('build inputs must match the checked-out commit, including ignored untracked sources', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'marketing-checkout-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { stdio: 'ignore' });
  git('init'); fs.mkdirSync(path.join(root, 'apps/marketing-site/src'), { recursive: true });
  fs.writeFileSync(path.join(root, '.gitignore'), '*.local\n');
  const file = path.join(root, 'apps/marketing-site/src/index.js'); fs.writeFileSync(file, 'original');
  git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture');
  assert.doesNotThrow(() => assertCleanBuildInputs(root));
  fs.writeFileSync(file, 'changed'); assert.throws(() => assertCleanBuildInputs(root), /marketing_tracked_build_input_modified/);
  fs.writeFileSync(file, 'original'); fs.writeFileSync(path.join(root, 'apps/marketing-site/.env.local'), 'untracked');
  assert.throws(() => assertCleanBuildInputs(root), /marketing_untracked_build_input_refused/);
});

function mockFetch(sequence, posts) {
  return async (url, options = {}) => {
    if (options.method === 'POST') { posts.push(url); const item = sequence.shift(); if (item instanceof Error) throw item; return item; }
    const item = sequence.shift(); if (item instanceof Error) throw item; return item;
  };
}
const json = value => Response.json(value);
test('rollback mutates only the bound marketing target once, then verifies provider readback', async () => {
  const posts = [], sequence = [json(project(candidate, newId)), json({ success: true }), json(project(candidate, newId)), json(project(base, beforeId))];
  const result = await rollbackMarketing({ before, candidate: next, releaseSha: candidate, token: 'synthetic', account,
    fetchImpl: mockFetch(sequence, posts), sleep: async () => {} });
  assert.equal(result.status, 'ROLLED_BACK_PROVIDER_READBACK'); assert.equal(posts.length, 1);
  assert.match(posts[0], new RegExp(`/pages/projects/lythaus-marketing/deployments/${beforeId}/rollback$`));
});

test('rollback rejects a different deployment with the baseline SHA or URL', async () => {
  const otherId = '33333333-3333-4333-8333-333333333333';
  for (const changed of [project(base, otherId), (() => {
    const sameId = project(base, beforeId);
    sameId.result.canonical_deployment.url = 'https://different.lythaus-marketing.pages.dev';
    return sameId;
  })()]) {
    const posts = [], sequence = [json(project(candidate, newId)), json({ success: true }), json(changed)];
    await assert.rejects(() => rollbackMarketing({ before, candidate: next, releaseSha: candidate, token: 'synthetic', account,
      fetchImpl: mockFetch(sequence, posts), sleep: async () => {} }), /marketing_deployment_changed_since_scope/);
    assert.equal(posts.length, 1);
  }
});

test('unchanged, replaced or uncertain deployment never causes a blind rollback', async () => {
  let posts = [];
  const untouched = await rollbackMarketing({ before, candidate: next, releaseSha: candidate, token: 'synthetic', account,
    fetchImpl: mockFetch([json(project(base, beforeId))], posts) });
  assert.equal(untouched.status, 'BASELINE_UNCHANGED'); assert.equal(posts.length, 0);
  posts = [];
  await assert.rejects(() => rollbackMarketing({ before, candidate: null, releaseSha: candidate, token: 'synthetic', account,
    fetchImpl: () => { throw new Error('provider must not be contacted'); } }), /marketing_candidate_unbound_no_rollback/);
  assert.equal(posts.length, 0);
  posts = [];
  await assert.rejects(() => rollbackMarketing({ before, candidate: next, releaseSha: candidate, token: 'synthetic', account,
    fetchImpl: mockFetch([json(project(candidate, newId)), new Error('unknown POST outcome')], posts) }), /unknown POST outcome/);
  assert.equal(posts.length, 1);
});

test('public surface evidence requires both canonical hosts, headers and waitlist form', async () => {
  const headers = { 'content-security-policy': "default-src 'self'", 'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY', 'referrer-policy': 'strict-origin-when-cross-origin', 'strict-transport-security': 'max-age=300' };
  const response = url => ({ status: 200, url, headers: new Headers(headers), arrayBuffer: async () => Buffer.from('<form data-waitlist>') });
  assert.equal((await readPublicSurfaces(async url => response(url))).length, 2);
  await assert.rejects(() => readPublicSurfaces(async url => ({ ...response(url), headers: new Headers() })), /marketing_public_headers_invalid/);
});

test('exact-SHA CI and security checks are required without retrying a denied read', async () => {
  const repo = new URL('https://github.com/AsoraKK/Lythaus/').pathname.replace(/^\/|\/$/g, '');
  const env = { RELEASE_SHA: candidate, GITHUB_REPOSITORY: repo, GH_TOKEN: 'synthetic', CI_RUN_ID: '1',
    CODEQL_RUN_ID: '2', DEPENDENCY_REVIEW_RUN_ID: '3', SECRET_SCAN_RUN_ID: '4', HISTORICAL_RECONCILIATION_RUN_ID: '5' };
  const names = ['CI', 'CodeQL', 'Dependency review', 'Native secret scan', 'Historical branch reconciliation'];
  let calls = 0;
  const fetchImpl = async url => { const id = Number(url.split('/').at(-1)); calls++;
    return json({ id, name: names[id - 1], head_sha: candidate, conclusion: 'success', status: 'completed', repository: { id: 1010752912 } }); };
  assert.equal((await verifyMarketingReleaseEvidence({ env, fetchImpl })).length, 5); assert.equal(calls, 5);
  calls = 0;
  await assert.rejects(() => verifyMarketingReleaseEvidence({ env, fetchImpl: async () => { calls++; return new Response('', { status: 401 }); } }),
    /marketing_release_evidence_http_401/);
  assert.equal(calls, 1);
  await assert.rejects(() => verifyMarketingReleaseEvidence({ env, fetchImpl: async () => json({ id: 1, name: 'CI',
    head_sha: base, conclusion: 'success', status: 'completed', repository: { id: 1010752912 } }) }), /exact release SHA/);
  await assert.rejects(() => verifyMarketingReleaseEvidence({ env: { ...env, GITHUB_REPOSITORY: 'other/Lythaus' },
    fetchImpl: () => { throw new Error('unexpected request'); } }), /marketing_release_evidence_context_invalid/);
});

test('separate workflow preserves full-stack recovery and has no skip input', () => {
  const standalone = fs.readFileSync('.github/workflows/deploy-marketing-presentation.yml', 'utf8');
  const original = fs.readFileSync('.github/workflows/deploy-marketing.yml', 'utf8');
  assert.match(standalone, /environment: production/); assert.match(standalone, /marketing-presentation-evidence/);
  assert.match(standalone, /marketing-presentation-deployment\.mjs scope/); assert.match(standalone, /databaseRecovery:\"NOT_APPLICABLE\"/);
  assert.doesNotMatch(standalone, /workflow_call:|skip_recovery|OWNER_TESTING_RECOVERY_EXCEPTION|PLANETSCALE_API_TOKEN/);
  assert.match(original, /Require fresh recovery before production Pages activation/);
  assert.match(original, /verify-production-recovery-readiness\.mjs/);
});
