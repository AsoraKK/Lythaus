import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
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
  'apps/marketing-site/src/pages/index.astro',
  'apps/marketing-site/src/layouts/BaseLayout.astro',
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
  'apps/marketing-site/tests/home-opening.browser.mjs',
  'apps/marketing-site/tests/homepage-waitlist.test.mjs',
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
    const expected = metadata.split(' ')[2];
    if (!existsSync(path.join(root, filename)) || git('hash-object', `--path=${filename}`, filename) !== expected) changed.push(filename);
  }
  assert.deepEqual(changed, [], 'Homepage dependencies changed from the explicit frozen revision');
  return entries.length;
}

test('homepage and its source, asset, build and waitlist dependencies remain frozen', () => {
  assertHomepageFrozen();
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
