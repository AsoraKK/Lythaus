import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

export const baselineSha = '8e3b3ebad2f846e61db2bfe819376723da7e9863';
const upstreamBaselineSha = '8c5ad6f311c6b14819edae5995eedce33c7465b6';
const upstreamProtectedPaths = [
  '.gitattributes',
  'package.json',
  'apps/lythaus-public-api/src/authenticity-alpha.ts',
  'apps/lythaus-public-api/src/authenticity-beta.ts',
  'apps/lythaus-public-api/src/index.ts',
  'apps/lythaus-public-api/src/worker-configuration.d.ts',
  'apps/lythaus-public-api/tests/authenticity-alpha-hardening.test.mjs',
  'apps/lythaus-public-api/wrangler.jsonc',
  'packages/cloudflare-env/src/index.ts',
  'packages/db/src/authenticity-alpha.ts',
  'packages/db/src/authenticity-beta.ts',
  'packages/db/src/budget.ts',
  'packages/db/src/index.ts',
  'packages/db/tests/authenticity-alpha-lifecycle.test.mjs',
  'scripts/ci/materialize-public-waitlist-deploy.mjs',
];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const nativeModerationWorkerdTest = 'packages/authenticity/tests/openai-moderation.workerd.mjs';
const publicationPg17Script = 'node scripts/ci/run-publication-pg17.mjs';
const reputationPg17Script = 'node scripts/ci/run-reputation-managed-lock-cluster.mjs --synthetic-managed-cluster --execute-local-sql';
const allocatedJobsDiagnosticTests = 'apps/lythaus-jobs/tests/reputation-session-diagnostic.test.mjs apps/lythaus-jobs/tests/reputation-session-diagnostic.workerd.mjs';
const allocatedJobsDiagnosticFiles = new Map([
  // PR #1044 head 75d22de8640ba0d1d687a873746820ee7c39ec10 passed 57/57 media CI checks and received independent review.
  // This exact Jobs blob supersedes the prior allocation.
  ['apps/lythaus-jobs/src/index.ts', 'da112b2d2c869251ed48941d31d4ac854bb93fa1'],
  // Scoped to privacy-request active-status revalidation under the existing account lock.
  ['apps/lythaus-public-api/src/index.ts', '1a231c953f23159e922346760510c8eaee96873a'],
  ['apps/lythaus-jobs/src/reputation-session-diagnostic.ts', '058811914e95c404369a31d696c834b4d43d77f8'],
  ['apps/lythaus-public-api/src/jobs-reputation-session-bridge.ts', 'be480beb3c083c9ce4c7edc9310781c42987db31'],
  ['packages/contracts/src/jobs-reputation-session.ts', 'eb501f6cfa74188b6b3a280507b2f17575893e27'],
  ['packages/db/src/autocommit.ts', 'b0027a8d204b3fe12f4896fc4175ccc82986828c'],
  ['apps/lythaus-jobs/tests/reputation-session-diagnostic.test.mjs', '96232e28172a6da48e6d0d011d9eb22767dbe54e'],
  ['apps/lythaus-jobs/tests/reputation-session-diagnostic.workerd.mjs', '3760dc0b580ced8d3691dbc14d431545c92e58d3'],
  ['apps/lythaus-jobs/tests/reputation-session-fixture.mjs', '1b871695c5e9b9af9e1b55f8dc915f1e39556b4d'],
  ['apps/lythaus-jobs/tests/reputation-session-driver-fixture.mjs', 'da16d235ee43c6b9401418def8124fcf864a95b1'],
]);
function assertAllocatedJobsDiagnosticFile(filename, blob) {
  assert.ok(allocatedJobsDiagnosticFiles.has(filename), 'The Jobs exception covers only the allocated diagnostic source and tests');
  assert.equal(blob, allocatedJobsDiagnosticFiles.get(filename), 'Jobs diagnostic bytes must match the exact allocated review revision');
}
function assertOnlyAllocatedJobsDiagnosticRegistration(before, after) {
  const script = 'test:native-architecture';
  const expected = `${before.scripts[script]} ${nativeModerationWorkerdTest} ${allocatedJobsDiagnosticTests}`;
  assert.equal(after.scripts[script], expected, 'Only the exact two allocated Jobs diagnostic tests may follow native moderation');
  for (const filename of allocatedJobsDiagnosticFiles.keys()) {
    assertAllocatedJobsDiagnosticFile(filename, git('hash-object', `--path=${filename}`, filename));
  }
  const normalized = structuredClone(after);
  normalized.scripts[script] = expected.slice(0, -(` ${allocatedJobsDiagnosticTests}`).length);
  assertOnlyReviewedNativeModerationTestRegistration(before, normalized);
}
function assertOnlyReviewedWaitlistWorkerLock(source, frozen) {
  const before = 'concurrency:\n  group: lythaus-public-waitlist-production\n  cancel-in-progress: false\n';
  const after = before.replace('lythaus-public-waitlist-production', 'lythaus-production-workers');
  assert.equal(frozen.split(before).length, 2, 'Frozen waitlist workflow must contain exactly one original concurrency block');
  assert.equal(source, frozen.replace(before, after), 'Only the exact approved shared Worker concurrency group may change');
}
const protectedPaths = [
  'apps/marketing-site/src/components/OpeningWordmark.astro',
  'apps/marketing-site/src/scripts/home-opening.js',
  'apps/marketing-site/src/styles/global.css',
  'apps/marketing-site/src/styles/home-opening.css',
  'apps/marketing-site/src/styles/home-pitch.css',
  'apps/marketing-site/src/styles/home-pitch-compact.css',
  'apps/marketing-site/src/styles/home-polish.css',
  'apps/marketing-site/src/env.d.ts',
  'apps/marketing-site/public',
  'apps/marketing-site/astro.config.mjs',
  'apps/marketing-site/package.json',
  'apps/marketing-site/package-lock.json',
  'package.json',
  'package-lock.json',
  '.npmrc',
  '.node-version',
  '.nvmrc',
  '.gitattributes',
  '.github/workflows/deploy-marketing.yml',
  '.github/workflows/deploy-public-waitlist.yml',
  'scripts/cloudflare/validate-marketing-output.mjs',
  'scripts/cloudflare/waitlist-turnstile.mjs',
  'scripts/ci/materialize-public-waitlist-deploy.mjs',
  'scripts/ci/probe-live-public-waitlist.mjs',
  'scripts/ci/probe-public-waitlist-candidate.mjs',
  'apps/lythaus-public-api',
  'packages/contracts',
  'packages/cloudflare-env',
  'packages/media',
  'packages/db',
  'packages/security',
  'packages/observability',
  'database/planetscale/migrations/0013_marketing_waitlist.sql',
];
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim();
function assertOnlyReviewedNativeModerationTestRegistration(before, after) {
  const script = 'test:native-architecture';
  const expected = `${before.scripts[script]} ${nativeModerationWorkerdTest}`;
  assert.equal(after.scripts[script], expected, 'Only the native Workerd moderation regression may be appended');
  before.scripts[script] = expected;
  if (Object.hasOwn(after.scripts, 'test:publication:pg17')) {
    assert.equal(after.scripts['test:publication:pg17'], publicationPg17Script, 'Publication tests must retain the exact isolated PG17 runner');
    before.scripts['test:publication:pg17'] = publicationPg17Script;
  }
  if (Object.hasOwn(after.scripts, 'test:reputation:pg17')) {
    assert.equal(after.scripts['test:reputation:pg17'], reputationPg17Script, 'Reputation tests must retain the exact synthetic PG17 runner');
    before.scripts['test:reputation:pg17'] = reputationPg17Script;
  }
  assert.deepEqual(after, before, 'Only the exact native moderation, publication, and reputation commands may be registered; unrelated scripts and dependencies stay frozen');
}
const reviewedToolingSecurityPatches = {
  handlebars: {
    version: '4.7.10',
    resolved: 'https://registry.npmjs.org/handlebars/-/handlebars-4.7.10.tgz',
    integrity: 'sha512-P5VJMVM7qgBn6vjXMw8WG9uVI+ncf2pi72j4de4yz5ZULLj2RGqLYaKOYGsgyrViQ0tePOVlN1tDCCXXtFqXKg==',
    dev: true,
    license: 'MIT',
    dependencies: {
      minimist: '^1.2.8',
      'neo-async': '^2.6.2',
      'source-map': '^0.6.1',
      wordwrap: '^1.0.0',
    },
    bin: { handlebars: 'bin/handlebars' },
    engines: { node: '>=0.4.7' },
    optionalDependencies: { 'uglify-js': '^3.1.4' },
  },
  'fast-uri': {
    version: '3.1.8',
    resolved: 'https://registry.npmjs.org/fast-uri/-/fast-uri-3.1.8.tgz',
    integrity: 'sha512-GZMtZUTNRpOVIECoXwLNZS5xUGE+mVNbTB8h/7Rwh2TFWcBQiPzTgyZi05BF9UMZKkLJv8XBRJTlU7zg8+ZfMg==',
    dev: true,
    funding: [
      { type: 'github', url: 'https://github.com/sponsors/fastify' },
      { type: 'opencollective', url: 'https://opencollective.com/fastify' },
    ],
    license: 'BSD-3-Clause',
  },
  'ip-address': {
    version: '10.7.1',
    resolved: 'https://registry.npmjs.org/ip-address/-/ip-address-10.7.1.tgz',
    integrity: 'sha512-4OUAqU9Z1i3vCnS05hzGiFnEMDpQ+62pAD/MVQOp83fYyNC8GleCqaS0QikQBmcWCrKFiUs/B8ztRRiYOAXuCA==',
    dev: true,
    license: 'MIT',
    engines: { node: '>= 12' },
  },
};
const reviewedSourceMapPatch = {
  version: '1.2.2',
  resolved: 'https://registry.npmjs.org/source-map-js/-/source-map-js-1.2.2.tgz',
  integrity: 'sha512-KGj/8Y43x35aZVDtt+J4mK1hoLGHULMYfSkODJNQjNDC3oW1PqPoxMwo0pLUsWM/UEGzON/NxeHywEfNXNP3Vw==',
  license: 'BSD-3-Clause',
  engines: { node: '>=0.10.0' },
};
const reviewedSpectralRemovedPackages = [
  '@nodelib/fs.scandir', '@nodelib/fs.stat', '@nodelib/fs.walk', 'braces', 'fastq',
  'fill-range', 'glob-parent', 'is-extglob', 'is-glob', 'is-number', 'merge2',
  'micromatch', 'queue-microtask', 'reusify', 'run-parallel', 'to-regex-range',
];
const reviewedSpectralAdapter = 'file:tools/openapi/spectral-glob';
const reviewedOpenApiDartScripts = {
  'openapi:gen:dart': {
    baseline: [
      'node scripts/clean-openapi-dart-generated.mjs',
      'openapi-generator-cli generate -g dart-dio -i api/openapi/dist/openapi.json -o lib/generated/api_client --additional-properties=pubName=lythaus_api_client,nullableFields=true,hideGenerationTimestamp=true',
      'node scripts/remove-openapi-oauth-support.mjs lib/generated/api_client',
      'node scripts/trim-trailing-whitespace.js lib/generated/api_client',
    ].join(' && '),
    reviewed: [
      'node scripts/clean-openapi-dart-generated.mjs',
      'openapi-generator-cli generate -g dart-dio -i api/openapi/dist/openapi.json -o lib/generated/api_client --additional-properties=pubName=lythaus_api_client,nullableFields=true,hideGenerationTimestamp=true',
      'node scripts/fix-openapi-dart-nested-builder-assignment.mjs lib/generated/api_client',
      'node scripts/remove-openapi-oauth-support.mjs lib/generated/api_client',
      'node scripts/trim-trailing-whitespace.js lib/generated/api_client',
    ].join(' && '),
  },
  'openapi:test:dart': {
    baseline: 'node scripts/validate-openapi-dart-client.mjs',
    reviewed: 'node --test scripts/tests/openapi-dart-nested-builder-assignment.test.mjs && node scripts/validate-openapi-dart-client.mjs',
  },
};
function assertSpectralAdapterReference(dependencies) {
  assert.equal(dependencies['fast-glob'], reviewedSpectralAdapter, 'Spectral must use the exact reviewed local adapter');
}
const reviewedImageAndQuotingPatchHashes = {
  'package-lock.json': 'ea852c24e87d78b7ac561de93135b0cbd0efbe99ae7f480ac5f8fe283267bd33',
  'apps/marketing-site/package-lock.json': '868d4b02354c9f1e7a0815ff5d946d7c43460eb56fa3a63d042a32ba09b071b3',
};
const sharpLinuxPlatforms = [
  ['linux-arm', 'arm', 'glibc'],
  ['linux-arm64', 'arm64', 'glibc'],
  ['linux-ppc64', 'ppc64', 'glibc'],
  ['linux-riscv64', 'riscv64', 'glibc'],
  ['linux-s390x', 's390x', 'glibc'],
  ['linux-x64', 'x64', 'glibc'],
  ['linuxmusl-arm64', 'arm64', 'musl'],
  ['linuxmusl-x64', 'x64', 'musl'],
];
function assertSharpLinuxPlatformMetadata(lock) {
  const expectedPaths = [];
  for (const [family, version] of [['sharp', '0.35.5'], ['sharp-libvips', '1.3.4']]) {
    for (const [platform, cpu, libc] of sharpLinuxPlatforms) {
      const packagePath = `node_modules/@img/${family}-${platform}`;
      expectedPaths.push(packagePath);
      const metadata = lock.packages[packagePath];
      assert.deepEqual(metadata && { version: metadata.version, os: metadata.os, cpu: metadata.cpu, libc: metadata.libc },
        { version, os: ['linux'], cpu: [cpu], libc: [libc] },
        `${packagePath} must retain the reviewed registry Linux platform selectors`);
    }
  }
  const actualPaths = Object.keys(lock.packages).filter(packagePath => packagePath.startsWith('node_modules/@img/sharp-') && packagePath.includes('-linux'));
  assert.deepEqual(actualPaths.sort(), expectedPaths.sort(), 'Sharp Linux platform packages must remain the exact reviewed registry set');
}
function canonicalMetadata(value) {
  if (Array.isArray(value)) return value.map(canonicalMetadata);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalMetadata(value[key])]));
  }
  return value;
}
function assertExactImageAndQuotingPatches(current, original, filename) {
  assertSharpLinuxPlatformMetadata(current);
  const paths = Object.keys(original.packages).filter(packagePath => ['node_modules/sharp', 'node_modules/shell-quote'].includes(packagePath)
    || packagePath.startsWith('node_modules/@img/sharp-')).sort();
  const metadata = Object.fromEntries(paths.map(packagePath => [packagePath, current.packages[packagePath]]));
  const digest = createHash('sha256').update(JSON.stringify(canonicalMetadata(metadata))).digest('hex');
  assert.equal(digest, reviewedImageAndQuotingPatchHashes[filename], 'Image and quoting packages must use exact reviewed security patch metadata');
  for (const packagePath of paths) current.packages[packagePath] = original.packages[packagePath];
}
function assertRootToolingLockOnlyHasSecurityPatches(current = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'))) {
  const original = JSON.parse(git('show', `${upstreamBaselineSha}:package-lock.json`));
  assertExactImageAndQuotingPatches(current, original, 'package-lock.json');
  for (const [name, version] of [['brace-expansion', '5.0.12'], ['undici', '7.29.1'], ['basic-ftp', '6.2.1']]) {
    const packagePath = `node_modules/${name}`;
    const patched = current.packages[packagePath];
    assert.equal(patched?.version, version, `${name} must use the reviewed patched version`);
    assert.ok(patched.resolved.endsWith(`${name}-${version}.tgz`), `${name} lock URL must match the patched version`);
    assert.match(patched.integrity, /^sha512-[A-Za-z0-9+/]+={0,2}$/, `${name} must retain registry integrity metadata`);
    current.packages[packagePath] = original.packages[packagePath];
  }
  for (const [name, patch] of Object.entries(reviewedToolingSecurityPatches)) {
    const packagePath = `node_modules/${name}`;
    assert.deepEqual(current.packages[packagePath], patch, `${name} must use the exact reviewed security patch`);
    current.packages[packagePath] = original.packages[packagePath];
  }
  assertSpectralAdapterReference(current.packages[''].devDependencies);
  delete current.packages[''].devDependencies['fast-glob'];
  assert.deepEqual(current.packages['node_modules/fast-glob'], { resolved: 'tools/openapi/spectral-glob', link: true },
    'Spectral must link only the exact reviewed local adapter');
  current.packages['node_modules/fast-glob'] = original.packages['node_modules/fast-glob'];
  assert.deepEqual(current.packages['tools/openapi/spectral-glob'], { name: 'fast-glob', version: '1.0.0', dev: true },
    'Spectral adapter lock metadata must remain exact and dependency-free');
  delete current.packages['tools/openapi/spectral-glob'];
  for (const name of reviewedSpectralRemovedPackages) {
    const packagePath = `node_modules/${name}`;
    assert.equal(current.packages[packagePath], undefined, `${name} must remain removed with the vulnerable Spectral chain`);
    current.packages[packagePath] = original.packages[packagePath];
  }
  assert.deepEqual(current, original, 'Root tooling lock may change only for the reviewed security patches');
}
const reviewedAstroPolicy = 'file:../../tools/marketing/astro-cache-policy';
function assertMarketingLockOnlyHasSecurityPatch(current = JSON.parse(readFileSync(path.join(root, 'apps/marketing-site/package-lock.json'), 'utf8'))) {
  const filename = 'apps/marketing-site/package-lock.json';
  const original = JSON.parse(git('show', `${baselineSha}:${filename}`));
  assertExactImageAndQuotingPatches(current, original, filename);
  assert.deepEqual(current.packages['node_modules/source-map-js'], reviewedSourceMapPatch,
    'source-map-js must use the exact reviewed security patch');
  current.packages['node_modules/source-map-js'] = original.packages['node_modules/source-map-js'];
  assert.deepEqual(current.packages['node_modules/devalue'], {
    version: '5.9.3',
    resolved: 'https://registry.npmjs.org/devalue/-/devalue-5.9.3.tgz',
    integrity: 'sha512-xRumYOCUZN/EesqHEU3WOXanOZNvfZFZ/o1AHVFDX1yI0UAkZkOgDXt341CzKoBVIkgQba55/+DjGBKrIoKcHw==',
    license: 'MIT',
  }, 'devalue must use the exact reviewed security patch');
  current.packages['node_modules/devalue'] = original.packages['node_modules/devalue'];
  assert.equal(current.packages[''].dependencies['http-cache-semantics'], reviewedAstroPolicy, 'Astro must use the exact reviewed local policy');
  delete current.packages[''].dependencies['http-cache-semantics'];
  assert.deepEqual(current.packages['node_modules/http-cache-semantics'], { resolved: '../../tools/marketing/astro-cache-policy', link: true },
    'Astro must link only the exact reviewed local policy');
  current.packages['node_modules/http-cache-semantics'] = original.packages['node_modules/http-cache-semantics'];
  assert.deepEqual(current.packages['../../tools/marketing/astro-cache-policy'], { name: '@lythaus/astro-cache-policy', version: '1.0.0', license: 'MIT' },
    'Astro policy lock metadata must remain exact and dependency-free');
  delete current.packages['../../tools/marketing/astro-cache-policy'];
  assert.deepEqual(current, original, 'Marketing lock may change only for the exact reviewed security repairs');
}
const authRepairPaths = new Set([
  'package.json',
  'apps/marketing-site/package.json',
  'apps/lythaus-public-api/wrangler.jsonc',
  'apps/lythaus-public-api/src/worker-configuration.d.ts',
  'scripts/ci/materialize-public-waitlist-deploy.mjs',
  'apps/lythaus-public-api/src/auth-runtime-policy.ts',
  'apps/lythaus-public-api/src/index.ts',
  'apps/lythaus-public-api/tests/auth-runtime-policy.test.mjs',
  'apps/lythaus-public-api/src/request-body-runtime.ts',
  'apps/lythaus-public-api/tests/request-body-runtime.test.mjs',
  'packages/contracts/src/index.ts',
  'packages/cloudflare-env/src/index.ts',
  'packages/contracts/src/transactional-email.ts',
  'packages/contracts/tests/auth-state-and-email-policy.test.mjs',
  'packages/db/src/index.ts',
  'packages/db/src/transactional-email.ts',
  'packages/security/src/index.ts',
  'packages/security/src/jwt.ts',
  'packages/security/tests/critical-security-policy.test.mjs',
]);
const reviewedPrivacyStatusFiles = new Map([
  ['apps/lythaus-public-api/src/privacy-runtime-policy.ts', '1fdc39ff1492963d54a70b09b9ee52b7f81f53aa'],
  ['apps/lythaus-public-api/tests/privacy-runtime-policy.test.mjs', 'd6aee9457b2449c21231d45462a7a677b1de852c'],
]);
const reviewedFeedReadFiles = new Map([
  ['apps/lythaus-public-api/src/feed-runtime-policy.ts', 'c868e3a32ee289263765309f71b37dbf22253d7f'],
  ['apps/lythaus-public-api/tests/feed-runtime-policy.test.mjs', '627a791e1b3f8a07d2cfb3843abfe88059fc9245'],
]);
function assertReviewedFeedReadFile(filename, blob) {
  assert.ok(reviewedFeedReadFiles.has(filename), 'The feed read exception covers only the two reviewed policy and test files');
  assert.equal(blob, reviewedFeedReadFiles.get(filename), 'Feed reads must match the exact independently reviewed source and test bytes');
}
const allocatedDeclarationRepairFiles = new Map([
  ['packages/contracts/src/content-policy.ts', '644bebca65503fa96bed03d9ba490b467c8defdd'],
  ['packages/contracts/tests/critical-content-policy.test.mjs', 'a63ccaa4e21b8f16f61a2cde419f0221501ce7fe'],
]);
function assertAllocatedDeclarationRepair(filename, blob) {
  assert.ok(allocatedDeclarationRepairFiles.has(filename), 'The publication exception covers only the two allocated declaration files');
  assert.equal(blob, allocatedDeclarationRepairFiles.get(filename), 'Declaration portability must match the exact allocated source/test bytes');
}
const reviewedReputationRepairFiles = new Map([
  ['packages/db/src/reputation.ts', '1e58faf3a4d8859de4d659615984025d3d24d2bd'],
  ['packages/db/tests/reputation-persistence.test.mjs', '09168383904d4a62319aae6345b820ed29946f13'],
]);
function assertReviewedReputationRepair(filename, blob) {
  assert.ok(reviewedReputationRepairFiles.has(filename), 'The reputation exception covers only the independently reviewed implementation and regression test');
  assert.equal(blob, reviewedReputationRepairFiles.get(filename), 'Reputation changes must match the exact reviewed source and test bytes');
}
const approvedHomepageVisualEdits = new Map([
  ['apps/marketing-site/src/components/OpeningWordmark.astro', (source) => `${replaceExactText(
    source,
    '<rect x="-110" y="-140" width="1220" height="450" />',
    '<rect x="-600" y="-500" width="2300" height="1150" />',
    'wordmark beam clip',
  )}\n`],
  ['apps/marketing-site/src/styles/home-opening.css', (source) => `${replaceExactText(
    source,
    'width: min(100%, 980px);',
    'width: min(50%, 490px);',
    'hero wordmark width',
  )}\n`],
]);
const approvedMarketingBrandAssets = new Map([
  ['apps/marketing-site/public/brand/lythaus-v1/lythaus-wordmark-black.e450176663e0.svg', 'e450176663e057e99bf66b822425eb0e1cf1ef90928f4b10b123e521bab63750'],
  ['apps/marketing-site/public/brand/lythaus-v1/lythaus-wordmark-white.5ba0451347e2.svg', '5ba0451347e24615f10bfc362b84285767f51eea3621cc702f64e93ff0047ff7'],
  ['apps/marketing-site/public/brand/lythaus-v1/lythaus-social-card-1200x630.78f698ef4283.png', '78f698ef4283dcc19de07672fe95bbfd6655da04bc45f93fdc7ceff181402eab'],
  ['apps/marketing-site/public/icons/lythaus-v1/favicon.e3dfdd675a74.ico', 'e3dfdd675a7450c028317d74caeedaf03f613b73a34f50a3950ba4972bbdb67c'],
  ['apps/marketing-site/public/icons/lythaus-v1/favicon.116ff3e020c6.svg', '116ff3e020c6b7f8539644880c8bc810d1a6278709b5f273c2a8d354d5f33cb7'],
  ['apps/marketing-site/public/icons/lythaus-v1/favicon-96x96.572a7b9a0d35.png', '572a7b9a0d35f57d71c9f5a7d5f6d5b11a58b67a8bfd55d36416d447476c85ef'],
  ['apps/marketing-site/public/icons/lythaus-v1/apple-touch-icon.19122fd8c91b.png', '19122fd8c91b3ce51b5a6a00d5840b3fa0f8a02416c0b997c283f9aba42a83bd'],
  ['apps/marketing-site/public/icons/lythaus-v1/pwa-icon-192x192.5c5c7622a5f7.png', '5c5c7622a5f762e0f0251fc7e806cd51a9f9b95c779f5fda9cc38cb6c658d7b8'],
  ['apps/marketing-site/public/icons/lythaus-v1/pwa-icon-512x512.27a8dadec032.png', '27a8dadec032e03ffca0953feaac6e800d7b737da5e5e3ec15b822841d2fe04d'],
  ['apps/marketing-site/public/icons/lythaus-v1/pwa-maskable-192x192.36698aff23fb.png', '36698aff23fb111d8e81ac90c4f6fe1ed34c22aece93ed0833573b81caa6879f'],
  ['apps/marketing-site/public/icons/lythaus-v1/pwa-maskable-512x512.10ec5b6e6764.png', '10ec5b6e6764cc1935d8909f6f54fe107efb370edf056d33c94718536aaee54d'],
  ['apps/marketing-site/public/favicon.ico', 'e3dfdd675a7450c028317d74caeedaf03f613b73a34f50a3950ba4972bbdb67c'],
  ['apps/marketing-site/public/favicon.png', '572a7b9a0d35f57d71c9f5a7d5f6d5b11a58b67a8bfd55d36416d447476c85ef'],
  ['apps/marketing-site/public/apple-touch-icon.png', '19122fd8c91b3ce51b5a6a00d5840b3fa0f8a02416c0b997c283f9aba42a83bd'],
  ['apps/marketing-site/public/icons/lythaus-192.png', '5c5c7622a5f762e0f0251fc7e806cd51a9f9b95c779f5fda9cc38cb6c658d7b8'],
  ['apps/marketing-site/public/icons/lythaus-512.png', '27a8dadec032e03ffca0953feaac6e800d7b737da5e5e3ec15b822841d2fe04d'],
  ['apps/marketing-site/public/icons/lythaus-512-maskable.png', '10ec5b6e6764cc1935d8909f6f54fe107efb370edf056d33c94718536aaee54d'],
  ['apps/marketing-site/public/site.webmanifest', '7ce2960d28a1d17f25b84ab42e09d105efe627568b4adfb524d47b1cf8d5ab2a'],
]);
const approvedMarketingBrandRemovals = new Set([
  'apps/marketing-site/public/brand/lythaus-mark.svg',
  'apps/marketing-site/public/brand/lythaus-v1/lythaus-lockup-black.9518c6eeb03b.svg',
  'apps/marketing-site/public/brand/lythaus-v1/lythaus-lockup-white.57df30b168bc.svg',
  'apps/marketing-site/public/brand/lythaus-v1/lythaus-social-card-1200x630.c20d3b1b40a8.png',
]);
function replaceExactText(source, before, after, label) {
  assert.equal(source.split(before).length - 1, 1, `The ${label} baseline must remain exact`);
  return source.replace(before, after);
}

export function assertOnlyHostedDevelopmentRemoval(source, frozen) {
  assert.deepEqual(JSON.parse(source).env, {}, 'Only the explicit empty hosted environment guard is permitted');
  const marker = frozen.indexOf('  "env": {');
  assert.ok(marker > 0, 'Historical hosted development block must be present');
  assert.equal(source.trim(), `${frozen.slice(0, marker)}  "env": {}\n}`,
    'Only hosted development removal is permitted; all production configuration remains exact');
}

export function assertHomepageFrozen() {
  assert.equal(git('rev-parse', `${baselineSha}^{commit}`), baselineSha, 'Frozen baseline must be available; do not substitute HEAD');
  assert.equal(git('rev-parse', `${upstreamBaselineSha}^{commit}`), upstreamBaselineSha, 'Reviewed upstream revision must be available');
  assert.equal(git('merge-base', baselineSha, upstreamBaselineSha), baselineSha);
  const originals = git('ls-tree', '-r', baselineSha, '--', ...protectedPaths).split('\n').filter(Boolean);
  const upstream = git('ls-tree', '-r', upstreamBaselineSha, '--', ...upstreamProtectedPaths).split('\n').filter(Boolean);
  const entries = [...new Map([...originals, ...upstream].map(entry => [entry.split('\t')[1], entry])).values()];
  assert.ok(entries.length >= 30, 'Protected dependency inventory unexpectedly empty');
  const changed = [];
  for (const entry of entries) {
    const [metadata, filename] = entry.split('\t');
    if (allocatedDeclarationRepairFiles.has(filename)) {
      assertAllocatedDeclarationRepair(filename, git('hash-object', `--path=${filename}`, filename));
      continue;
    }
    if (reviewedReputationRepairFiles.has(filename)) {
      assertReviewedReputationRepair(filename, git('hash-object', `--path=${filename}`, filename));
      continue;
    }
    if (reviewedPrivacyStatusFiles.has(filename)) {
      assert.equal(git('hash-object', `--path=${filename}`, filename), reviewedPrivacyStatusFiles.get(filename),
        'Privacy status may change only to the exact reviewed cooldown policy and tests');
      continue;
    }
    if (reviewedFeedReadFiles.has(filename)) {
      assertReviewedFeedReadFile(filename, git('hash-object', `--path=${filename}`, filename));
      continue;
    }
    if (authRepairPaths.has(filename)) continue;
    if (approvedMarketingBrandRemovals.has(filename)) {
      assert.equal(existsSync(path.join(root, filename)), false, `${filename} must not retain the retired mark`);
      continue;
    }
    if (approvedMarketingBrandAssets.has(filename)) {
      const current = createHash('sha256').update(readFileSync(path.join(root, filename))).digest('hex');
      assert.equal(current, approvedMarketingBrandAssets.get(filename), `${filename} must match the approved brand asset bytes`);
      continue;
    }
    if (approvedHomepageVisualEdits.has(filename)) {
      const original = git('show', `${baselineSha}:${filename}`);
      const expected = approvedHomepageVisualEdits.get(filename)(original);
      const current = readFileSync(path.join(root, filename), 'utf8').replaceAll('\r\n', '\n');
      assert.equal(current, expected, `${filename} may contain only the requested wordmark and beam visual fix`);
      continue;
    }
    if (filename === 'package-lock.json') continue;
    if (filename === 'apps/marketing-site/package-lock.json') continue;
    if (filename === '.github/workflows/deploy-public-waitlist.yml') {
      const frozen = execFileSync('git', ['show', `${baselineSha}:${filename}`], { cwd: root, encoding: 'utf8' });
      assertOnlyReviewedWaitlistWorkerLock(readFileSync(path.join(root, filename), 'utf8'), frozen);
      continue;
    }
    const expected = metadata.split(' ')[2];
    if (filename === 'apps/marketing-site/public/sitemap.xml') {
      const original = git('show', `${baselineSha}:${filename}`);
      const addition = '  <url><loc>https://lythaus.co/help</loc><priority>0.6</priority></url>\n';
      const current = readFileSync(path.join(root, filename), 'utf8').replaceAll('\r\n', '\n').trim();
      assert.equal(current, original.replace('</urlset>', `${addition}</urlset>`), 'Sitemap may only append the new Help route; all original URLs and metadata are frozen');
      continue;
    }
    if (!existsSync(path.join(root, filename)) || git('hash-object', `--path=${filename}`, filename) !== expected) changed.push(filename);
  }
  for (const [filename, expected] of approvedMarketingBrandAssets) {
    assert.ok(existsSync(path.join(root, filename)), `${filename} must be present for the approved brand integration`);
    const current = createHash('sha256').update(readFileSync(path.join(root, filename))).digest('hex');
    assert.equal(current, expected, `${filename} must match the approved brand asset bytes`);
  }
  assert.deepEqual(changed, [], 'Homepage dependencies changed from the explicit frozen revision');
  assertRootToolingLockOnlyHasSecurityPatches();
  assertMarketingLockOnlyHasSecurityPatch();
  return entries.length;
}

test('homepage visual assets, build and waitlist dependencies remain frozen', () => {
  assertHomepageFrozen();
});
test('waitlist freeze permits only the approved shared Worker lock group', () => {
  const filename = '.github/workflows/deploy-public-waitlist.yml';
  const frozen = execFileSync('git', ['show', `${baselineSha}:${filename}`], { cwd: root, encoding: 'utf8' });
  const source = readFileSync(path.join(root, filename), 'utf8');
  assertOnlyReviewedWaitlistWorkerLock(source, frozen);
  assert.throws(() => assertOnlyReviewedWaitlistWorkerLock(frozen, frozen));
});
for (const [label, mutate] of [
  ['different group', source => source.replace('lythaus-production-workers', 'unreviewed-group')],
  ['cancellation', source => source.replace('cancel-in-progress: false', 'cancel-in-progress: true')],
  ['deployment steps', source => source.replace('timeout-minutes: 30', 'timeout-minutes: 31')],
  ['extra bytes', source => source + '\n'],
  ['duplicate lock', source => source + '\nconcurrency:\n  group: lythaus-production-workers\n'],
]) {
  test(`waitlist lock exception rejects ${label}`, () => {
    const filename = '.github/workflows/deploy-public-waitlist.yml';
    const frozen = execFileSync('git', ['show', `${baselineSha}:${filename}`], { cwd: root, encoding: 'utf8' });
    const source = readFileSync(path.join(root, filename), 'utf8');
    const changed = mutate(source);
    assert.notEqual(changed, source);
    assert.throws(() => assertOnlyReviewedWaitlistWorkerLock(changed, frozen));
  });
}

test('Astro security replacement rejects changed target, identity, license and unrelated dependencies', () => {
  const readLock = () => JSON.parse(readFileSync(path.join(root, 'apps/marketing-site/package-lock.json'), 'utf8'));
  for (const [packagePath, field, value] of [
    ['node_modules/http-cache-semantics', 'resolved', '../../tools/unreviewed'],
    ['node_modules/http-cache-semantics', 'link', false],
    ['node_modules/http-cache-semantics', 'version', '4.2.0'],
    ['../../tools/marketing/astro-cache-policy', 'name', 'http-cache-semantics'],
    ['../../tools/marketing/astro-cache-policy', 'version', '0.0.0'],
    ['../../tools/marketing/astro-cache-policy', 'license', 'AGPL-3.0'],
    ['../../tools/marketing/astro-cache-policy', 'dependencies', { 'http-cache-semantics': '4.2.0' }],
  ]) {
    const changed = readLock();
    changed.packages[packagePath][field] = value;
    assert.throws(() => assertMarketingLockOnlyHasSecurityPatch(changed), /exact reviewed local policy|metadata must remain exact/);
  }
  const changed = readLock();
  changed.packages[''].dependencies['http-cache-semantics'] = 'file:../../tools/unreviewed';
  assert.throws(() => assertMarketingLockOnlyHasSecurityPatch(changed), /exact reviewed local policy/);
  const unrelated = readLock();
  unrelated.packages['node_modules/astro'].version = '7.3.5';
  assert.throws(() => assertMarketingLockOnlyHasSecurityPatch(unrelated), /exact reviewed security repairs/);
});

test('reviewed tooling patches reject a different version, registry URL or integrity', () => {
  for (const name of Object.keys(reviewedToolingSecurityPatches)) {
    for (const [field, value] of [['version', '0.0.0'], ['resolved', 'https://example.invalid/package.tgz'], ['integrity', 'sha512-invalid']]) {
      const changed = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
      changed.packages[`node_modules/${name}`][field] = value;
      assert.throws(() => assertRootToolingLockOnlyHasSecurityPatches(changed), /must use the exact reviewed security patch/);
    }
  }
});

test('source-map security patch rejects changed metadata and unrelated dependencies', () => {
  const readLock = () => JSON.parse(readFileSync(path.join(root, 'apps/marketing-site/package-lock.json'), 'utf8'));
  for (const [field, value] of [
    ['version', '1.2.1'],
    ['resolved', 'https://example.invalid/package.tgz'],
    ['integrity', 'sha512-invalid'],
    ['license', 'AGPL-3.0'],
    ['engines', { node: '>=22' }],
  ]) {
    const changed = readLock();
    changed.packages['node_modules/source-map-js'][field] = value;
    assert.throws(() => assertMarketingLockOnlyHasSecurityPatch(changed), /source-map-js must use the exact reviewed security patch/);
  }
  const changed = readLock();
  changed.packages['node_modules/astro'].version = '7.3.5';
  assert.throws(() => assertMarketingLockOnlyHasSecurityPatch(changed), /Marketing lock may change only for the exact reviewed security repairs/);
});

test('reviewed tooling patches keep every other dependency frozen', () => {
  const changed = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  changed.packages['node_modules/ajv'].version = '0.0.0';
  assert.throws(() => assertRootToolingLockOnlyHasSecurityPatches(changed), /Root tooling lock may change only for the reviewed security patches/);
});

test('Sharp Linux platform metadata matches the reviewed registry in all affected locks', () => {
  for (const filename of ['package-lock.json', 'apps/marketing-site/package-lock.json', 'ml/datasets/tools/materialise/package-lock.json']) {
    assertSharpLinuxPlatformMetadata(JSON.parse(readFileSync(path.join(root, filename), 'utf8')));
  }
});

test('Sharp Linux platform metadata rejects omitted, swapped or altered registry selectors', () => {
  for (const filename of ['package-lock.json', 'apps/marketing-site/package-lock.json', 'ml/datasets/tools/materialise/package-lock.json']) {
    const lock = JSON.parse(readFileSync(path.join(root, filename), 'utf8'));
    const missingAll = structuredClone(lock);
    for (const [packagePath, metadata] of Object.entries(lock.packages)) {
      if (!packagePath.startsWith('node_modules/@img/sharp-') || !packagePath.includes('-linux')) continue;
      delete missingAll.packages[packagePath].libc;
      const missing = structuredClone(lock);
      delete missing.packages[packagePath].libc;
      assert.throws(() => assertSharpLinuxPlatformMetadata(missing), /reviewed registry Linux platform selectors/);
      const swapped = structuredClone(lock);
      swapped.packages[packagePath].libc = [metadata.libc[0] === 'glibc' ? 'musl' : 'glibc'];
      assert.throws(() => assertSharpLinuxPlatformMetadata(swapped), /reviewed registry Linux platform selectors/);
    }
    assert.throws(() => assertSharpLinuxPlatformMetadata(missingAll), /reviewed registry Linux platform selectors/);
    for (const [field, value] of [['version', '0.35.4'], ['os', ['darwin']], ['cpu', ['arm64']], ['libc', 'glibc']]) {
      const changed = structuredClone(lock);
      changed.packages['node_modules/@img/sharp-linux-x64'][field] = value;
      assert.throws(() => assertSharpLinuxPlatformMetadata(changed), /reviewed registry Linux platform selectors/);
    }
  }
});

test('image and quoting security exceptions reject vulnerable versions, altered registry metadata and native dependencies', () => {
  for (const [filename, verify] of [['package-lock.json', assertRootToolingLockOnlyHasSecurityPatches],
    ['apps/marketing-site/package-lock.json', assertMarketingLockOnlyHasSecurityPatch]]) {
    const readLock = () => JSON.parse(readFileSync(path.join(root, filename), 'utf8'));
    for (const [packagePath, field, value] of [
      ['node_modules/sharp', 'version', '0.35.4'],
      ['node_modules/sharp', 'resolved', 'https://example.invalid/sharp.tgz'],
      ['node_modules/sharp', 'integrity', 'sha512-invalid'],
      ['node_modules/sharp', 'license', 'AGPL-3.0'],
      ['node_modules/@img/sharp-linux-x64', 'optionalDependencies', { '@img/sharp-libvips-linux-x64': '1.3.3' }],
    ]) {
      const changed = readLock(); changed.packages[packagePath][field] = value;
      assert.throws(() => verify(changed), /exact reviewed security patch metadata/);
    }
    const unreviewed = readLock(); unreviewed.packages['node_modules/@img/sharp-unreviewed'] = { version: '0.35.5' };
    assert.throws(() => verify(unreviewed), /lock may change only for/);
  }
  const changed = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  changed.packages['node_modules/shell-quote'].version = '1.9.0';
  assert.throws(() => assertRootToolingLockOnlyHasSecurityPatches(changed), /exact reviewed security patch metadata/);
});

test('Spectral security replacement rejects changed targets, metadata or resurrected vulnerable dependencies', () => {
  const readLock = () => JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  for (const [packagePath, field, value] of [
    ['node_modules/fast-glob', 'resolved', 'tools/unreviewed'],
    ['node_modules/fast-glob', 'link', false],
    ['tools/openapi/spectral-glob', 'version', '0.0.0'],
    ['tools/openapi/spectral-glob', 'dependencies', { braces: '3.0.3' }],
  ]) {
    const changed = readLock(); changed.packages[packagePath][field] = value;
    assert.throws(() => assertRootToolingLockOnlyHasSecurityPatches(changed), /Spectral/);
  }
  const changed = readLock(); changed.packages[''].devDependencies['fast-glob'] = 'file:tools/unreviewed';
  assert.throws(() => assertRootToolingLockOnlyHasSecurityPatches(changed), /exact reviewed local adapter/);
  const original = JSON.parse(git('show', `${upstreamBaselineSha}:package-lock.json`));
  for (const name of reviewedSpectralRemovedPackages) {
    const resurrected = readLock(); resurrected.packages[`node_modules/${name}`] = original.packages[`node_modules/${name}`];
    assert.throws(() => assertRootToolingLockOnlyHasSecurityPatches(resurrected), /must remain removed/);
  }
});

test('approved copy refresh preserves homepage scripts, waitlist controls and metadata wiring', () => {
  const read = filename => readFileSync(path.join(root, filename), 'utf8').replaceAll('\r\n', '\n');
  const scripts = source => [...source.replace(/<script\b[^>]*\/>/g, '').matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/g)].map(match => match[0]).join('\n');
  const frontmatter = source => source.split('---')[1].trim();
  const normalizeBrandFrontmatter = source => frontmatter(source)
    .replace("const socialImageUrl = `${siteUrl}/brand/lythaus-v1/lythaus-social-card-1200x630.78f698ef4283.png`;\n", '')
    .replace("import '../styles/brand.css';", '')
    .trim();
  const normalizeBrandHead = source => source
    .replace(/^[ \t]*<link rel="icon"[^>]*\/>[ \t]*\n/gmu, '')
    .replace(/^[ \t]*<link rel="apple-touch-icon"[^>]*\/>[ \t]*\n/gmu, '')
    .replace(/^[ \t]*<meta property="og:image(?::[^"]+)?"[^>]*\/>[ \t]*\n/gmu, '')
    .replace(/^[ \t]*<meta name="twitter:image(?::alt)?"[^>]*\/>[ \t]*\n/gmu, '')
    .replace('content="summary_large_image"', 'content="summary"')
    .replace(/\n{2,}/gu, '\n')
    .trim();
  for (const filename of ['apps/marketing-site/src/pages/index.astro', 'apps/marketing-site/src/layouts/BaseLayout.astro']) {
    const original = git('show', `${baselineSha}:${filename}`);
    const current = read(filename);
    assert.equal(scripts(current), scripts(original).replaceAll('Join the private beta', 'Join the waitlist'));
    if (filename.endsWith('BaseLayout.astro')) {
      assert.equal(normalizeBrandFrontmatter(current), frontmatter(original), 'Only the approved wordmark stylesheet and social image URL may be added to layout frontmatter');
    } else {
      assert.equal(frontmatter(current), frontmatter(original));
    }
    if (filename.endsWith('BaseLayout.astro')) {
      assert.equal(normalizeBrandHead(current.match(/<head>[\s\S]*?<\/head>/)[0]), normalizeBrandHead(original.match(/<head>[\s\S]*?<\/head>/)[0]),
        'Only the approved favicon and social image tags may change in the shared head');
    }
  }
  const filename = 'apps/marketing-site/src/pages/index.astro';
  const form = source => source.match(/<form\b[\s\S]*?<\/form>/)[0];
  assert.equal(form(read(filename)), form(git('show', `${baselineSha}:${filename}`)).replaceAll('Join the private beta', 'Join the waitlist'));
});

test('auth repair exceptions cannot alter homepage assets or waitlist routing', () => {
  assert.deepEqual([...authRepairPaths].filter(filename => filename.startsWith('apps/marketing-site/')), ['apps/marketing-site/package.json']);
  const before = git('show', `${upstreamBaselineSha}:apps/lythaus-public-api/src/index.ts`);
  const after = readFileSync(path.join(root, 'apps/lythaus-public-api/src/index.ts'), 'utf8');
  const waitlistLines = source => source.split(/\r?\n/).filter(line => /waitlist/i.test(line));
  assert.deepEqual(waitlistLines(after), waitlistLines(before));
  for (const file of ['apps/lythaus-public-api/src/waitlist-runtime-policy.ts', 'apps/lythaus-public-api/tests/waitlist-handler-invariants.test.mjs']) {
    assert.equal(readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n').trim(), git('show', `${baselineSha}:${file}`));
  }
  for (const file of ['apps/lythaus-public-api/wrangler.jsonc', 'scripts/ci/materialize-public-waitlist-deploy.mjs']) {
    let source = readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
    if (file === 'apps/lythaus-public-api/wrangler.jsonc') {
      for (const approved of [
        '    "TRANSACTIONAL_EMAIL_DISPATCH_ENABLED": "true",\n',
        '      { "binding": "TRANSACTIONAL_EMAIL_DISPATCH_QUEUE", "queue": "lythaus-email-lifecycle-dev" },\n',
      ]) {
        assert.equal(source.split(approved).length, 2, 'Only the exact approved production dispatch flag and existing Queue binding may change');
        source = source.replace(approved, '');
      }
    }
    let updated = source
      .replaceAll('0021_media_quarantine_cleanup', '0017_authenticity_beta')
      .replaceAll('POST_0021', 'POST_0017').replaceAll('post-0021', 'post-0017')
      .replaceAll('migration 0021', 'migration 0017')
      .replace('"main": "src/worker.ts"', '"main": "src/index.ts"')
      .replaceAll('approvedReleaseExpectation', 'approvedPost0017Expectation');
    if (file === 'scripts/ci/materialize-public-waitlist-deploy.mjs') {
      updated = updated
        .replace("import { approvedPost0017Expectation, REQUIRED_RELEASE_SCHEMA_VERSION } from './product-integrity-schema-contract.mjs';",
          "import { approvedPost0017Expectation } from './product-integrity-schema-contract.mjs';")
        .replace('const releaseVersionNumber = REQUIRED_RELEASE_SCHEMA_VERSION.slice(0, 4);\n', '')
        .replace("const fingerprintPlaceholder = `REPLACE_WITH_POST_${releaseVersionNumber}_SCHEMA_FINGERPRINT`;",
          "const fingerprintPlaceholder = 'REPLACE_WITH_POST_0017_SCHEMA_FINGERPRINT';")
        .replace("const relationCountPlaceholder = `REPLACE_WITH_POST_${releaseVersionNumber}_RELATION_COUNT`;",
          "const relationCountPlaceholder = 'REPLACE_WITH_POST_0017_RELATION_COUNT';")
        .replace("!== REQUIRED_RELEASE_SCHEMA_VERSION)", "!== '0017_authenticity_beta.sql')")
        .replace('throw new Error(`public waitlist deployment requires ${REQUIRED_RELEASE_SCHEMA_VERSION}`);',
          "throw new Error('public waitlist deployment requires migration 0017');")
        .replace('new RegExp(`REPLACE_WITH_POST_${releaseVersionNumber}_`)', '/REPLACE_WITH_POST_0017_/')
        .replace('schemaVersion: REQUIRED_RELEASE_SCHEMA_VERSION,', "schemaVersion: '0017_authenticity_beta.sql',");
    }
    const frozen = git('show', `${upstreamBaselineSha}:${file}`);
    if (file === 'apps/lythaus-public-api/wrangler.jsonc') assertOnlyHostedDevelopmentRemoval(updated, frozen);
    else assert.equal(updated.trim(), frozen);
  }
  const bindingFile = 'packages/cloudflare-env/src/index.ts';
  const bindings = readFileSync(path.join(root, bindingFile), 'utf8').replace(/\r\n/g, '\n');
  const dispatchBindings = '  TRANSACTIONAL_EMAIL_DISPATCH_QUEUE?: Queue;\n  TRANSACTIONAL_EMAIL_DISPATCH_ENABLED?: string;\n';
  assert.equal(bindings.split(dispatchBindings).length, 2, 'Dispatch may add only the exact optional Queue and opt-in declarations');
  assert.equal(bindings.replace(dispatchBindings, '')
    .replace('  AUTH_EMAIL_ENVELOPE?: ServiceBinding;\n', '').trim(), git('show', `${upstreamBaselineSha}:${bindingFile}`),
  'Only the private Admin auth binding and exact optional dispatch declarations may change');
  assert.equal(readFileSync(path.join(root, 'apps/lythaus-public-api/src/worker.ts'), 'utf8').replace(/\r\n/g, '\n').trim(), `import { WorkerEntrypoint } from 'cloudflare:workers';
import type { EnvBindings } from '@lythaus/cloudflare-env';
import { handleEmailEnvelope } from './email-envelope-entrypoint.ts';
export { default } from './index.ts';

export class AuthEmailEnvelope extends WorkerEntrypoint<EnvBindings> {
  fetch(request: Request): Promise<Response> {
    return handleEmailEnvelope(request, this.env);
  }
}`, 'The wrapper must preserve the unchanged public/waitlist default export');
  for (const [file, script] of [['package.json', 'marketing:test'], ['apps/marketing-site/package.json', 'test']]) {
    const revision = file === 'package.json' ? upstreamBaselineSha : baselineSha;
    const before = JSON.parse(git('show', `${revision}:${file}`));
    const after = JSON.parse(readFileSync(path.join(root, file), 'utf8'));
    after.scripts[script] = after.scripts[script].replace(' --experimental-strip-types', '');
    assert.equal(after.overrides.sharp, '0.35.5', 'Image decoding must retain the exact patched sharp override');
    before.overrides.sharp = '0.35.5';
    if (file === 'package.json') {
      assert.deepEqual(after.overrides['concurrently@10.0.5'], { 'shell-quote': '1.11.0' }, 'Quoting must use the patched version at the actual parent');
      assert.equal(Object.hasOwn(after.overrides, 'concurrently@10.0.3'), false, 'The stale parent selector must remain removed');
      delete before.overrides['concurrently@10.0.3'];
      before.overrides['concurrently@10.0.5'] = { 'shell-quote': '1.11.0' };
      for (const [name, scripts] of Object.entries(reviewedOpenApiDartScripts)) {
        assert.equal(before.scripts[name], scripts.baseline, `${name} baseline must stay pinned`);
        assert.equal(after.scripts[name], scripts.reviewed, `${name} must match the exact PR896 normalization script`);
        before.scripts[name] = scripts.reviewed;
      }
      assert.equal(after.overrides['brace-expansion'], '5.0.12');
      assert.equal(after.overrides.undici, '7.29.1');
      assert.equal(after.overrides.miniflare.undici, '7.29.1');
      assert.deepEqual(after.overrides['get-uri@8.0.1'], { 'basic-ftp': '6.2.1' });
      assert.equal(after.overrides['fast-uri'], '3.1.8');
      assert.equal(after.overrides['ip-address'], '10.7.1');
      before.overrides['brace-expansion'] = '5.0.12';
      before.overrides.undici = '7.29.1';
      before.overrides.miniflare.undici = '7.29.1';
      before.overrides['get-uri@8.0.1'] = { 'basic-ftp': '6.2.1' };
      before.overrides['fast-uri'] = '3.1.8';
      before.overrides['ip-address'] = '10.7.1';
      assertSpectralAdapterReference(after.devDependencies);
      assert.equal(after.overrides['fast-glob'], '$fast-glob', 'Spectral must retain the exact reviewed override');
      before.devDependencies['fast-glob'] = reviewedSpectralAdapter;
      before.overrides['fast-glob'] = '$fast-glob';
    } else {
      assert.equal(after.dependencies['http-cache-semantics'], reviewedAstroPolicy);
      assert.equal(after.overrides['http-cache-semantics'], '$http-cache-semantics');
      assert.equal(after.overrides['source-map-js'], '1.2.2');
      before.dependencies['http-cache-semantics'] = reviewedAstroPolicy;
      before.overrides['http-cache-semantics'] = '$http-cache-semantics';
      before.overrides['source-map-js'] = '1.2.2';
    }
    if (file === 'package.json') {
      assertOnlyAllocatedJobsDiagnosticRegistration(before, after);
    } else {
      assert.deepEqual(after, before, 'Only the TypeScript test runtime flag and exact reviewed security changes may change; homepage dependencies remain frozen');
    }
  }
});

for (const [label, mutate] of [
  ['disabled Turnstile', source => source.replace('"TURNSTILE_REQUIRED": "true"', '"TURNSTILE_REQUIRED": "false"')],
  ['changed production bucket', source => source.replaceAll('lythaus-media-approved-dev', 'lythaus-fixture-unapproved')],
  ['restored hosted alias', source => source.replace('"env": {}', '"env": {"development": {"name": "lythaus-public-api-development"}}')],
  ['removed env guard', source => source.replace(',\n  "env": {}', '')],
]) {
  test(`deployment isolation freeze rejects ${label}`, () => {
    const file = 'apps/lythaus-public-api/wrangler.jsonc';
    const source = readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
    const frozen = git('show', `49cca9caa34b34c7ded7f4842792f698be9bd41f:${file}`)
      .replaceAll('POST_0020', 'POST_0021')
      .replace('0020_auth_recovery_delivery.sql', '0021_media_quarantine_cleanup.sql');
    assertOnlyHostedDevelopmentRemoval(source, frozen);
    const changed = mutate(source);
    assert.notEqual(changed, source, 'Mutation must alter the actual configuration');
    assert.throws(() => assertOnlyHostedDevelopmentRemoval(changed, frozen));
  });
}

test('homepage protection permits only exact native moderation, publication, and reputation registrations', () => {
  const before = {
    scripts: {
      'test:native-architecture': 'node --test scripts/tests/native-architecture.test.mjs',
      'marketing:test': 'node --test apps/marketing-site/tests/*.test.mjs',
    },
    dependencies: { astro: '5.0.0' },
    devDependencies: { miniflare: '4.0.0' },
  };
  const reviewed = structuredClone(before);
  reviewed.scripts['test:native-architecture'] += ` ${nativeModerationWorkerdTest}`;
  assert.doesNotThrow(() => assertOnlyReviewedNativeModerationTestRegistration(structuredClone(before), reviewed));
  reviewed.scripts['test:publication:pg17'] = publicationPg17Script;
  assert.doesNotThrow(() => assertOnlyReviewedNativeModerationTestRegistration(structuredClone(before), reviewed));
  reviewed.scripts['test:reputation:pg17'] = reputationPg17Script;
  assert.doesNotThrow(() => assertOnlyReviewedNativeModerationTestRegistration(structuredClone(before), reviewed));

  for (const [name, command] of [
    ['publication', publicationPg17Script + ' --skip-admission'],
    ['reputation', reputationPg17Script + ' --execute-production-sql'],
    ['unreviewed', 'node scripts/unreviewed.mjs'],
  ]) {
    const changedRunner = structuredClone(reviewed);
    const script = name === 'reputation' ? 'test:reputation:pg17' : 'test:publication:pg17';
    changedRunner.scripts[script] = command;
    assert.throws(() => assertOnlyReviewedNativeModerationTestRegistration(structuredClone(before), changedRunner), assert.AssertionError);
  }

  const unrelatedScript = structuredClone(reviewed);
  unrelatedScript.scripts['marketing:test'] += ' --update-snapshots';
  assert.throws(() => assertOnlyReviewedNativeModerationTestRegistration(structuredClone(before), unrelatedScript), assert.AssertionError);

  const unrelatedDependency = structuredClone(reviewed);
  unrelatedDependency.dependencies.astro = '6.0.0';
  assert.throws(() => assertOnlyReviewedNativeModerationTestRegistration(structuredClone(before), unrelatedDependency), assert.AssertionError);

  const extraTestPath = structuredClone(reviewed);
  extraTestPath.scripts['test:native-architecture'] += ' scripts/tests/unreviewed.test.mjs';
  assert.throws(() => assertOnlyReviewedNativeModerationTestRegistration(structuredClone(before), extraTestPath), assert.AssertionError);
});

test('declaration repair exceptions reject changed bytes and every other homepage dependency path', () => {
  for (const filename of allocatedDeclarationRepairFiles.keys()) {
    assert.doesNotThrow(() => assertAllocatedDeclarationRepair(filename, git('hash-object', `--path=${filename}`, filename)));
    const source = readFileSync(path.join(root, filename), 'utf8') + '\n// synthetic unrelated mutation\n';
    const altered = execFileSync('git', ['hash-object', '--stdin'], { cwd: root, encoding: 'utf8', input: source }).trim();
    assert.throws(() => assertAllocatedDeclarationRepair(filename, altered), assert.AssertionError);
  }
  assert.throws(() => assertAllocatedDeclarationRepair('apps/marketing-site/src/pages/index.astro', allocatedDeclarationRepairFiles.values().next().value), assert.AssertionError);
});

test('allocated Jobs registration rejects missing reordered duplicate extra commands and dependency changes', () => {
  const before = { scripts: { 'test:native-architecture': 'node --test scripts/tests/native-architecture.test.mjs',
    'marketing:test': 'node --test apps/marketing-site/tests/*.test.mjs' }, dependencies: { astro: '5.0.0' } };
  const after = structuredClone(before);
  after.scripts['test:native-architecture'] += ` ${nativeModerationWorkerdTest} ${allocatedJobsDiagnosticTests}`;
  assert.doesNotThrow(() => assertOnlyAllocatedJobsDiagnosticRegistration(structuredClone(before), after));
  const paths = allocatedJobsDiagnosticTests.split(' ');
  for (const suffix of ['', paths[0], paths.toReversed().join(' '),
    allocatedJobsDiagnosticTests + ' ' + paths[0], allocatedJobsDiagnosticTests + ' --skip-cleanup',
    allocatedJobsDiagnosticTests + ' scripts/tests/unreviewed.test.mjs']) {
    const changed = structuredClone(after);
    changed.scripts['test:native-architecture'] = `${before.scripts['test:native-architecture']} ${nativeModerationWorkerdTest}${suffix ? ' ' + suffix : ''}`;
    assert.throws(() => assertOnlyAllocatedJobsDiagnosticRegistration(structuredClone(before), changed), assert.AssertionError);
  }
  for (const change of [value => { value.scripts['marketing:test'] += ' --update-snapshots'; },
    value => { value.dependencies.astro = '6.0.0'; }]) {
    const changed = structuredClone(after); change(changed);
    assert.throws(() => assertOnlyAllocatedJobsDiagnosticRegistration(structuredClone(before), changed), assert.AssertionError);
  }
});

test('allocated Jobs pins reject altered historical and unrelated source paths', () => {
  for (const [filename, expected] of allocatedJobsDiagnosticFiles) {
    assert.doesNotThrow(() => assertAllocatedJobsDiagnosticFile(filename, git('hash-object', `--path=${filename}`, filename)));
    const source = readFileSync(path.join(root, filename), 'utf8') + '\n// synthetic unrelated mutation\n';
    const changed = execFileSync('git', ['hash-object', '--stdin'], { cwd: root, encoding: 'utf8', input: source }).trim();
    assert.notEqual(changed, expected);
    assert.throws(() => assertAllocatedJobsDiagnosticFile(filename, changed), assert.AssertionError);
    if (filename === 'apps/lythaus-public-api/src/index.ts') {
      const previousPublicApiBlob = '5ca637b72d241d89df5178bec6f0f730aafe41cd';
      assert.notEqual(previousPublicApiBlob, expected, 'The integrated membership-only source bytes replace the previous exact allocation');
      assert.throws(() => assertAllocatedJobsDiagnosticFile(filename, previousPublicApiBlob), assert.AssertionError);
    }
    if (filename.endsWith('/index.ts')) {
      assert.throws(() => assertAllocatedJobsDiagnosticFile(filename, git('rev-parse', `4b32a00cde7a940ec7fcc4134368bda80d78f699:${filename}`)), assert.AssertionError);
    }
  }
  assert.throws(() => assertAllocatedJobsDiagnosticFile('apps/marketing-site/src/pages/index.astro',
    allocatedJobsDiagnosticFiles.values().next().value), assert.AssertionError);
  assert.throws(() => assertAllocatedJobsDiagnosticFile('apps/lythaus-public-api/src/auth-runtime-policy.ts',
    allocatedJobsDiagnosticFiles.values().next().value), assert.AssertionError);
});

test('image-integrity allocation rejects superseded Worker bytes without broadening the diagnostic scope', () => {
  // Exact blob IDs from 489aef297ff0b1a40744504594122c9ebc43930d (both Workers)
  // and fecdd6f6b19ad5ea9dd17afa70e420e6deb147b8 (Jobs); the guard compares IDs,
  // so these superseded PR commits need not survive squash.
  const supersededWorkerBlobs = new Map([
    ['apps/lythaus-jobs/src/index.ts', ['8a6487ab099287f151fc8594b3b9ff846a9226b7', 'a842e8c3654a26adcaae7c8e72efae3d20102cbb', '7b25af78fc1e227b85d1758b0cb31fd0aec09d24']],
    ['apps/lythaus-public-api/src/index.ts', ['7a941be1765e82b5cbf00294b114952ab6ea27a1']],
  ]);
  for (const [filename, superseded] of supersededWorkerBlobs) {
    const current = git('hash-object', `--path=${filename}`, filename);
    assert.doesNotThrow(() => assertAllocatedJobsDiagnosticFile(filename, current));
    for (const blob of superseded) {
      assert.notEqual(blob, current, 'The superseded Worker bytes must differ from the exact allocated review revision');
      assert.throws(() => assertAllocatedJobsDiagnosticFile(filename, blob), assert.AssertionError);
    }
  }
  for (const filename of ['packages/media/src/standard-upload.ts', 'apps/marketing-site/src/pages/index.astro']) {
    assert.throws(() => assertAllocatedJobsDiagnosticFile(filename,
      allocatedJobsDiagnosticFiles.get('apps/lythaus-jobs/src/index.ts')), assert.AssertionError);
  }
});

test('image-integrity rejection survives a fresh squashed checkout', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'lythaus-image-integrity-squash-'));
  const environment = { ...process.env };
  for (const name of ['NODE_TEST_CONTEXT', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE',
    'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) delete environment[name];
  const fixtureGit = (...args) => execFileSync('git', args, { cwd: directory, env: environment, encoding: 'utf8' }).trim();
  try {
    fixtureGit('init', '--quiet');
    const testPath = 'apps/marketing-site/tests/homepage-protection.test.mjs';
    for (const filename of ['.gitattributes', testPath, 'apps/lythaus-jobs/src/index.ts', 'apps/lythaus-public-api/src/index.ts']) {
      mkdirSync(path.dirname(path.join(directory, filename)), { recursive: true });
      copyFileSync(path.join(root, filename), path.join(directory, filename));
    }
    fixtureGit('add', '.');
    fixtureGit('-c', 'user.name=Lythaus synthetic fixture', '-c', 'user.email=fixture@example.invalid',
      '-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '--no-gpg-sign', '-m', 'Synthetic squash');
    assert.equal(fixtureGit('rev-list', '--all', '--count'), '1');
    for (const revision of ['489aef297ff0b1a40744504594122c9ebc43930d', 'fecdd6f6b19ad5ea9dd17afa70e420e6deb147b8']) {
      const historical = spawnSync('git', ['cat-file', '-e', `${revision}^{commit}`], { cwd: directory, env: environment });
      assert.equal(historical.error, undefined);
      assert.notEqual(historical.status, 0, 'The squash fixture must contain no superseded PR commits');
    }
    const name = 'image-integrity allocation rejects superseded Worker bytes without broadening the diagnostic scope';
    const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', `--test-name-pattern=^${name}$`, testPath],
      { cwd: directory, env: environment, encoding: 'utf8', timeout: 10_000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, `${result.stdout ?? ''}${result.stderr ?? ''}`);
    assert.match(result.stdout, new RegExp(`ok \\d+ - ${name}\\r?\\n`));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('reviewed reputation exception rejects changed bytes, historical bytes and every other dependency path', () => {
  for (const filename of reviewedReputationRepairFiles.keys()) {
    assert.doesNotThrow(() => assertReviewedReputationRepair(filename, git('hash-object', `--path=${filename}`, filename)));
    const source = readFileSync(path.join(root, filename), 'utf8') + '\n// synthetic unrelated mutation\n';
    const altered = execFileSync('git', ['hash-object', '--stdin'], { cwd: root, encoding: 'utf8', input: source }).trim();
    assert.throws(() => assertReviewedReputationRepair(filename, altered), assert.AssertionError);
    assert.throws(() => assertReviewedReputationRepair(filename, git('rev-parse', `${baselineSha}:${filename}`)), assert.AssertionError);
  }
  assert.throws(() => assertReviewedReputationRepair('apps/marketing-site/src/pages/index.astro', reviewedReputationRepairFiles.values().next().value), assert.AssertionError);
});

test('feed read exceptions reject changed bytes, old blobs, and every other homepage dependency path', () => {
  for (const filename of reviewedFeedReadFiles.keys()) {
    assert.doesNotThrow(() => assertReviewedFeedReadFile(filename, git('hash-object', `--path=${filename}`, filename)));
    const source = readFileSync(path.join(root, filename), 'utf8') + '\n// synthetic unrelated mutation\n';
    const altered = execFileSync('git', ['hash-object', '--stdin'], { cwd: root, encoding: 'utf8', input: source }).trim();
    assert.throws(() => assertReviewedFeedReadFile(filename, altered), assert.AssertionError);
    assert.throws(() => assertReviewedFeedReadFile(filename, git('rev-parse', `${baselineSha}:${filename}`)), assert.AssertionError);
  }
  for (const filename of ['apps/marketing-site/src/pages/index.astro', 'apps/lythaus-public-api/src/index.ts']) {
    assert.throws(() => assertReviewedFeedReadFile(filename, reviewedFeedReadFiles.values().next().value), assert.AssertionError);
  }
});

test('upstream integration preserves homepage rendering inputs and waitlist route dispatch', () => {
  assert.deepEqual(
    git('diff', '--name-only', baselineSha, upstreamBaselineSha, '--', 'apps/marketing-site', 'package-lock.json').split('\n').filter(Boolean),
    [],
  );
  const before = JSON.parse(git('show', `${baselineSha}:package.json`));
  const after = JSON.parse(git('show', `${upstreamBaselineSha}:package.json`));
  const changedScripts = Object.keys({ ...before.scripts, ...after.scripts }).filter(key => before.scripts[key] !== after.scripts[key]);
  assert.deepEqual(changedScripts.sort(), ['openapi:bundle', 'test:authenticity-cpu-orchestration', 'test:authenticity-private-alpha'].sort());
  delete before.scripts;
  delete after.scripts;
  assert.deepEqual(after, before, 'Upstream must not change homepage dependencies');
  const waitlistLines = revision => git('show', `${revision}:apps/lythaus-public-api/src/index.ts`).split('\n').filter(line => /waitlist/i.test(line));
  assert.deepEqual(waitlistLines(upstreamBaselineSha), waitlistLines(baselineSha));
  assert.deepEqual(upstreamProtectedPaths.filter(filename => filename.startsWith('apps/marketing-site/')), []);
});

test('secondary presentation does not add a homepage interceptor', () => {
  for (const filename of ['src/middleware.ts', 'src/middleware.js', 'src/pages/index.html', 'src/pages/index.ts', '.env', '.env.local', '.env.production', '.env.production.local']) {
    const relative = `apps/marketing-site/${filename}`;
    assert.equal(existsSync(path.join(root, relative)), false, `Unreviewed homepage interceptor or environment override: ${relative}`);
  }
});
