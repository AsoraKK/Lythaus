import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = name => readFileSync(`.github/workflows/${name}.yml`, 'utf8');

test('app-only release inherits the existing canonical lock', () => {
  const canonical = workflow('production-release');
  assert.match(canonical, /concurrency:\s*\n\s*group: lythaus-canonical-production-release\s*\n\s*cancel-in-progress: false/);
  const appOnly = canonical.slice(canonical.indexOf('\n  app_only:'), canonical.indexOf('\n  production_smoke:'));
  assert.match(appOnly, /inputs\.release_mode == 'app_only'/);
  assert.match(appOnly, /canonical-app-only-release\.yml/);
  assert.doesNotMatch(appOnly, /concurrency:/);
});

test('direct production lythaus-web deploys serialize with canonical release; delegated and preview runs do not self-block', () => {
  const web = workflow('deploy-alpha-web');
  assert.match(web, /^concurrency:\s*\n\s*group:\s*>-/m);
  assert.match(web, /github\.workflow_ref == format\('\{0\}\/\.github\/workflows\/production-release\.yml@refs\/heads\/main', github\.repository\)/);
  assert.match(web, /format\('lythaus-alpha-web-delegated-\{0\}', github\.run_id\)/);
  assert.match(web, /inputs\.target_environment == 'production' && inputs\.pages_project == 'lythaus-web'/);
  assert.match(web, /'lythaus-canonical-production-release'/);
  assert.match(web, /format\('lythaus-alpha-web-\{0\}', github\.run_id\)/);
  assert.match(web, /cancel-in-progress: false/);
});

test('the canonical app-only artifact path cannot fall back to unverified download', () => {
  const web = workflow('deploy-alpha-web');
  assert.match(web, /APP_ONLY_REQUESTED=.*GITHUB_EVENT_PATH.*event\.inputs\?\.release_mode === "app_only"/);
  assert.match(web, /APP_ONLY_CANONICAL:.*github\.workflow_ref.*production-release\.yml@refs\/heads\/main.*inputs\.target_environment == 'production'/);
  assert.match(web, /if \[\[ "\$APP_ONLY_REQUESTED" == 'true' \]\]; then[\s\S]*?test "\$APP_ONLY_CANONICAL" = 'true'[\s\S]*?verify-extract-app-artifact\.mjs[\s\S]*?else[\s\S]*?gh run download/);
  assert.match(web, /verify-pages-deployment\.mjs[\s\S]*?\.environment == "production"[\s\S]*?\.deploymentId \| test\([\s\S]*?\.deploymentUrl \| test\([\s\S]*?deployment_id=/);
});
