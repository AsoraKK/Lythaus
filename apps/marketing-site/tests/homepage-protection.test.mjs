import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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
const passkeyLibraryLocks = {
  'node_modules/@hexagon/base64': '98abf477bbf2077e54ece608a25f18b3093d8a160517efd7adea69f387b7b41b',
  'node_modules/@levischuck/tiny-cbor': '794d566a1e0b4c589d4c770335d1b667b89c226716eb1049793f883ba228439e',
  'node_modules/@peculiar/asn1-android': 'd45a08d053c7717a7871c3986e3d99e03d77c7970f017d67511f4fbb811c73a2',
  'node_modules/@peculiar/asn1-asym-key': '759cdce5b79fa23f2a75e16d3b93bce32f0b1f7e7eaae5e630d17e4cda91426a',
  'node_modules/@peculiar/asn1-cms': '72a6926f562fb72ad47cc50f183766c9250879429936c60dacc814d7e199955b',
  'node_modules/@peculiar/asn1-csr': '39a72005e0ad847b998eece74bf786f9d545a699c2eec13c3d292b0e56535a7f',
  'node_modules/@peculiar/asn1-ecc': '1f0f43d42ab7c8d150eeae2f50166bda61048912bfae008d732332b864ea1ae6',
  'node_modules/@peculiar/asn1-pfx': '0223602da39fbc7bc4f47ffaaf686b2164fb95ad5205508d73053042bcf4d91f',
  'node_modules/@peculiar/asn1-pkcs8': 'a4b32cba7be3f91f8f78d6b05c054701e51043003a298743da9d4e2e107276b7',
  'node_modules/@peculiar/asn1-pkcs9': 'c50fd65fc41ac54dbb88f608c538f36b65015d1865d9834d7321d5c977d644c0',
  'node_modules/@peculiar/asn1-rsa': 'af5b4b57938409539c3432c1da7f2a6cedfeea0b5f6d387d2bfd8f736c6a3d34',
  'node_modules/@peculiar/asn1-schema': '23f784f95315a901c24f33c7f78a5cd1d65e114efff4cc020cf2f7fa1120a72d',
  'node_modules/@peculiar/asn1-x509': '26195ebbc1d7ead10d45bebbb80d275bf5eed9a99c92f378a4c46bd1c263f561',
  'node_modules/@peculiar/asn1-x509-attr': '976f798a931c48da4763895f5277387da4ed0faac8d9e7c2c5c545a73f34e041',
  'node_modules/@peculiar/asn1-x509-post-quantum': '132fe5baa5c576b771725df9f79043140f7563eff11d6ed34fe99ff984c88463',
  'node_modules/@peculiar/utils': '5a388236915d3ebeff24455db8fcb41a0a5ec67166f67e69c3b94698e3ada05c',
  'node_modules/@peculiar/x509': '786757108892d967199f54d6b711ac2aba5cce8424ebba61e3892d35963b293e',
  'node_modules/@simplewebauthn/browser': '5b070cc890ecf767d47d6c22f4a8c2bced07ad5348ba388855d7e8d7ca9ac2dd',
  'node_modules/@simplewebauthn/server': 'b9a3a9c976c4d513988a79660002f6f20d38d9106852c76e7d9e250948a2d33d',
  'node_modules/asn1js': '9a5ffab99c92fdc6add0bef305f150237c2d120868f1b7bdf250121e472b441b',
  'node_modules/pvtsutils': '17a81711e36da556283c71ebf70bbf33979e2427eb92c79364a5ef84e9fa0772',
  'node_modules/pvutils': '425f266dd9983367585dc969c42b9667c8addeb525b28f0d93986de05dd5faf7',
  'node_modules/tsyringe': '9e5a0e642aec520d92dbdc421e95810c013fd1930c75bcdaeb506c6f3830b671',
  'node_modules/tsyringe/node_modules/tslib': '64d2393b7285671a90bf8c1d730e1777bbe15be0e3a19e1e32a9733d68e38c27',
};
function assertRootToolingLockOnlyHasSecurityPatches(current = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'))) {
  const original = JSON.parse(git('show', `${upstreamBaselineSha}:package-lock.json`));
  for (const [packagePath, expectedHash] of Object.entries(passkeyLibraryLocks)) {
    assert.equal(original.packages[packagePath], undefined);
    assert.equal(createHash('sha256').update(JSON.stringify(current.packages[packagePath])).digest('hex'), expectedHash,
      `${packagePath} must retain the exact reviewed passkey dependency lock`);
    delete current.packages[packagePath];
  }
  for (const packagePath of ['node_modules/reflect-metadata', 'node_modules/tslib']) {
    const runtimeDependency = { ...original.packages[packagePath] };
    delete runtimeDependency.dev;
    assert.deepEqual(current.packages[packagePath], runtimeDependency);
    current.packages[packagePath] = original.packages[packagePath];
  }
  const securityPackage = structuredClone(original.packages['packages/security']);
  securityPackage.dependencies['@simplewebauthn/browser'] = '14.0.0';
  securityPackage.dependencies['@simplewebauthn/server'] = '14.0.3';
  assert.deepEqual(current.packages['packages/security'], securityPackage);
  current.packages['packages/security'] = original.packages['packages/security'];
  const securityManifest = JSON.parse(git('show', `${upstreamBaselineSha}:packages/security/package.json`));
  securityManifest.dependencies['@simplewebauthn/browser'] = '14.0.0';
  securityManifest.dependencies['@simplewebauthn/server'] = '14.0.3';
  assert.deepEqual(JSON.parse(readFileSync(path.join(root, 'packages/security/package.json'), 'utf8')), securityManifest);
  for (const [name, version] of [['brace-expansion', '5.0.12'], ['undici', '7.29.1'], ['basic-ftp', '6.2.1']]) {
    const packagePath = `node_modules/${name}`;
    const patched = current.packages[packagePath];
    assert.equal(patched?.version, version, `${name} must use the reviewed patched version`);
    assert.ok(patched.resolved.endsWith(`${name}-${version}.tgz`), `${name} lock URL must match the patched version`);
    assert.match(patched.integrity, /^sha512-[A-Za-z0-9+/]+={0,2}$/, `${name} must retain registry integrity metadata`);
    current.packages[packagePath] = original.packages[packagePath];
  }
  assert.deepEqual(current, original, 'Root tooling lock may change only for the exact passkey library additions and reviewed security patches');
}
function assertMarketingLockOnlyHasSecurityPatch() {
  const filename = 'apps/marketing-site/package-lock.json';
  const original = JSON.parse(git('show', `${baselineSha}:${filename}`));
  const current = JSON.parse(readFileSync(path.join(root, filename), 'utf8'));
  assert.deepEqual(current.packages['node_modules/devalue'], {
    version: '5.9.3',
    resolved: 'https://registry.npmjs.org/devalue/-/devalue-5.9.3.tgz',
    integrity: 'sha512-xRumYOCUZN/EesqHEU3WOXanOZNvfZFZ/o1AHVFDX1yI0UAkZkOgDXt341CzKoBVIkgQba55/+DjGBKrIoKcHw==',
    license: 'MIT',
  }, 'devalue must use the exact reviewed security patch');
  current.packages['node_modules/devalue'] = original.packages['node_modules/devalue'];
  assert.deepEqual(current, original, 'Marketing lock may change only for the reviewed devalue security patch');
}
const authRepairPaths = new Set([
  'packages/security/package.json',
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
    if (authRepairPaths.has(filename)) continue;
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

test('passkey lock exceptions reject library, integrity, extra dependency and existing dependency mutations', () => {
  const current = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  for (const mutate of [
    value => { value.packages['node_modules/@simplewebauthn/server'].version = '14.0.4'; },
    value => { value.packages['node_modules/@simplewebauthn/browser'].integrity = 'sha512-invalid'; },
    value => { value.packages['node_modules/arbitrary-fixture'] = { version: '1.0.0' }; },
    value => { value.packages['node_modules/jose'].version = '0.0.0'; },
    value => { value.packages['packages/security'].dependencies['@simplewebauthn/server'] = '^14.0.3'; },
  ]) {
    const candidate = structuredClone(current);
    mutate(candidate);
    assert.throws(() => assertRootToolingLockOnlyHasSecurityPatches(candidate));
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
      assert.equal(after.overrides['brace-expansion'], '5.0.12');
      assert.equal(after.overrides.undici, '7.29.1');
      assert.equal(after.overrides.miniflare.undici, '7.29.1');
      assert.deepEqual(after.overrides['get-uri@8.0.1'], { 'basic-ftp': '6.2.1' });
      before.overrides['brace-expansion'] = '5.0.12';
      before.overrides.undici = '7.29.1';
      before.overrides.miniflare.undici = '7.29.1';
      before.overrides['get-uri@8.0.1'] = { 'basic-ftp': '6.2.1' };
    }
    assert.deepEqual(after, before, 'Only the TypeScript test runtime flag and reviewed security overrides may change; homepage dependencies remain frozen');
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
