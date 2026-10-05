import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
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
  assert.deepEqual(after, before, 'Only the native Workerd moderation regression may be registered; unrelated scripts and dependencies stay frozen');
}
const reviewedToolingSecurityPatches = {
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
function assertRootToolingLockOnlyHasSecurityPatches(current = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'))) {
  const original = JSON.parse(git('show', `${upstreamBaselineSha}:package-lock.json`));
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
  ['apps/lythaus-public-api/src/privacy-runtime-policy.ts', '8c674c929d35c748b28579b2fdeed3ff4daac2bc'],
  ['apps/lythaus-public-api/tests/privacy-runtime-policy.test.mjs', '5609e2acf2bcb0fc32a36cee8b0d7f5c102d497e'],
]);
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
function replaceExactText(source, before, after, label) {
  assert.equal(source.split(before).length - 1, 1, `The ${label} baseline must remain exact`);
  return source.replace(before, after);
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
    if (reviewedPrivacyStatusFiles.has(filename)) {
      assert.equal(git('hash-object', `--path=${filename}`, filename), reviewedPrivacyStatusFiles.get(filename),
        'Privacy status may change only to the exact reviewed cooldown policy and tests');
      continue;
    }
    if (authRepairPaths.has(filename)) continue;
    if (approvedHomepageVisualEdits.has(filename)) {
      const original = git('show', `${baselineSha}:${filename}`);
      const expected = approvedHomepageVisualEdits.get(filename)(original);
      const current = readFileSync(path.join(root, filename), 'utf8').replaceAll('\r\n', '\n');
      assert.equal(current, expected, `${filename} may contain only the requested wordmark and beam visual fix`);
      continue;
    }
    if (filename === 'package-lock.json') continue;
    if (filename === 'apps/marketing-site/package-lock.json') continue;
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
  assert.deepEqual(changed, [], 'Homepage dependencies changed from the explicit frozen revision');
  assertRootToolingLockOnlyHasSecurityPatches();
  assertMarketingLockOnlyHasSecurityPatch();
  return entries.length;
}

test('homepage visual assets, build and waitlist dependencies remain frozen', () => {
  assertHomepageFrozen();
});

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

test('reviewed tooling patches keep every other dependency frozen', () => {
  const changed = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  changed.packages['node_modules/ajv'].version = '0.0.0';
  assert.throws(() => assertRootToolingLockOnlyHasSecurityPatches(changed), /Root tooling lock may change only for the reviewed security patches/);
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
  for (const filename of ['apps/marketing-site/src/pages/index.astro', 'apps/marketing-site/src/layouts/BaseLayout.astro']) {
    const original = git('show', `${baselineSha}:${filename}`);
    const current = read(filename);
    assert.equal(scripts(current), scripts(original).replaceAll('Join the private beta', 'Join the waitlist'));
    const frontmatter = source => source.split('---')[1].trim();
    assert.equal(frontmatter(current), frontmatter(original));
    if (filename.endsWith('BaseLayout.astro')) {
      assert.equal(current.match(/<head>[\s\S]*?<\/head>/)[0], original.match(/<head>[\s\S]*?<\/head>/)[0]);
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
    const updated = readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')
      .replaceAll('0020_auth_recovery_delivery', '0017_authenticity_beta')
      .replaceAll('POST_0020', 'POST_0017').replaceAll('post-0020', 'post-0017')
      .replaceAll('migration 0020', 'migration 0017')
      .replace('"main": "src/worker.ts"', '"main": "src/index.ts"')
      .replaceAll('approvedReleaseExpectation', 'approvedPost0017Expectation');
    assert.equal(updated.trim(), git('show', `${upstreamBaselineSha}:${file}`));
  }
  const bindingFile = 'packages/cloudflare-env/src/index.ts';
  assert.equal(readFileSync(path.join(root, bindingFile), 'utf8').replace(/\r\n/g, '\n')
    .replace('  AUTH_EMAIL_ENVELOPE?: ServiceBinding;\n', '').trim(), git('show', `${upstreamBaselineSha}:${bindingFile}`),
  'Only the private Admin auth service binding type may change');
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
    if (file === 'package.json') {
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
      before.dependencies['http-cache-semantics'] = reviewedAstroPolicy;
      before.overrides['http-cache-semantics'] = '$http-cache-semantics';
    }
    if (file === 'package.json') {
      assertOnlyReviewedNativeModerationTestRegistration(before, after);
    } else {
      assert.deepEqual(after, before, 'Only the TypeScript test runtime flag and exact reviewed security changes may change; homepage dependencies remain frozen');
    }
  }
});

test('homepage protection permits only the native moderation Workerd test registration', () => {
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
