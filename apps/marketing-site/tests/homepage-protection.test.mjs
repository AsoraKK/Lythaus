import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

export const baselineSha = '8e3b3ebad2f846e61db2bfe819376723da7e9863';
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
  const entries = git('ls-tree', '-r', baselineSha, '--', ...protectedPaths).split('\n').filter(Boolean);
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

test('secondary presentation does not add a homepage interceptor', () => {
  for (const filename of ['src/middleware.ts', 'src/middleware.js', 'src/pages/index.html', 'src/pages/index.ts', '.env', '.env.local', '.env.production', '.env.production.local']) {
    const relative = `apps/marketing-site/${filename}`;
    assert.equal(existsSync(path.join(root, relative)), false, `Unreviewed homepage interceptor or environment override: ${relative}`);
  }
});
