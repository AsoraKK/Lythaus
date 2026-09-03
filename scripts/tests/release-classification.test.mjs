import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertNoManualDowngrade,
  classifyRelease,
  componentsForPath,
  RELEASE_CLASSES,
} from '../release/release-classification.mjs';

const baseSha = '1'.repeat(40);

test('unrelated marketing, UI, docs, feed, admin, and analytics changes are standard', () => {
  const result = classifyRelease({
    baseSha,
    changedFiles: [
      'apps/marketing-site/src/pages/pricing.astro',
      'apps/control-panel/src/feed.ts',
      'apps/lythaus-admin-api/src/routes/analytics.ts',
      'docs/architecture/runtime.md',
    ],
  });
  assert.equal(result.releaseClass, RELEASE_CLASSES.STANDARD);
  assert.deepEqual(result.changedComponents, ['admin', 'control-panel', 'marketing']);
  assert.ok(result.reusedComponents.includes('public'));
  for (const changedFile of [
    '.github/workflows/deploy-marketing.yml',
    '.github/workflows/deploy-alpha-web.yml',
    '.github/workflows/deploy-control-panel.yml',
    'scripts/cloudflare/validate-marketing-output.mjs',
    'scripts/cloudflare/verify-pages-deployment.mjs',
  ]) {
    assert.equal(classifyRelease({ baseSha, changedFiles: [changedFile] }).releaseClass, RELEASE_CLASSES.STANDARD, changedFile);
  }
});

test('Windows separators are normalized before classification', () => {
  const result = classifyRelease({
    baseSha,
    changedFiles: ['apps\\marketing-site\\src\\pages\\pricing.astro'],
  });
  assert.equal(result.releaseClass, RELEASE_CLASSES.STANDARD);
  assert.deepEqual(result.changedComponents, ['marketing']);
});

test('public-only, jobs-only, admin-only, and coordinator-only scopes stay component-specific', () => {
  assert.deepEqual(classifyRelease({ baseSha, changedFiles: ['apps/lythaus-public-api/src/feed.ts'] }).changedComponents, ['public']);
  assert.deepEqual(classifyRelease({ baseSha, changedFiles: ['apps/lythaus-jobs/src/feed-indexer.ts'] }).changedComponents, ['jobs']);
  assert.deepEqual(classifyRelease({ baseSha, changedFiles: ['apps/lythaus-admin-api/src/routes/catalog.ts'] }).changedComponents, ['admin']);
  const coordinator = classifyRelease({ baseSha, changedFiles: ['apps/lythaus-auth-acceptance-coordinator/src/index.ts'] });
  assert.deepEqual(coordinator.changedComponents, ['coordinator']);
  assert.equal(coordinator.releaseClass, RELEASE_CLASSES.AUTH_CRITICAL);
});

test('unknown runtime Worker paths are ambiguous and fail closed', () => {
  for (const changedFile of [
    'apps/lythaus-public-api/src/new-runtime-file.ts',
    'apps/lythaus-admin-api/src/new-runtime-file.ts',
    'apps/lythaus-jobs/src/new-runtime-file.ts',
  ]) {
    const result = classifyRelease({ baseSha, changedFiles: [changedFile] });
    assert.equal(result.releaseClass, RELEASE_CLASSES.AUTH_CRITICAL, changedFile);
    assert.ok(result.criticalReasons.some(({ rule }) => rule === 'ambiguous-path'), changedFile);
  }
});

test('auth flows, shared contracts, and security dependencies are auth-critical', () => {
  for (const changedFile of [
    'apps/lythaus-public-api/src/auth/signup.ts',
    'apps/lythaus-public-api/src/routes/login.ts',
    'apps/lythaus-public-api/src/routes/logout.ts',
    'apps/lythaus-public-api/src/routes/refresh.ts',
    'apps/lythaus-jobs/src/transactional-email.ts',
    'api/openapi/openapi.yaml',
    'packages/contracts/src/product.ts',
    'packages/security/src/password.ts',
    'database/planetscale/migrations/0017_auth_session.sql',
  ]) {
    const result = classifyRelease({ baseSha, changedFiles: [changedFile] });
    assert.equal(result.releaseClass, RELEASE_CLASSES.AUTH_CRITICAL, changedFile);
    assert.ok(result.criticalReasons.length > 0, changedFile);
  }
});

test('explicit non-auth shared feed scopes remain standard while auth paths stay critical', () => {
  assert.equal(
    classifyRelease({ baseSha, changedFiles: ['packages/db/src/feed.ts'] }).releaseClass,
    RELEASE_CLASSES.STANDARD,
  );
  assert.equal(
    classifyRelease({ baseSha, changedFiles: ['packages/contracts/src/content-policy.ts'] }).releaseClass,
    RELEASE_CLASSES.STANDARD,
  );
  assert.equal(
    classifyRelease({ baseSha, changedFiles: ['packages/db/src/identity.ts'] }).releaseClass,
    RELEASE_CLASSES.AUTH_CRITICAL,
  );
  assert.equal(
    classifyRelease({ baseSha, changedFiles: ['packages/contracts/src/product.ts'] }).releaseClass,
    RELEASE_CLASSES.AUTH_CRITICAL,
  );
  assert.equal(
    classifyRelease({ baseSha, changedFiles: ['apps/marketing-site/src/components/LoginForm.astro'] }).releaseClass,
    RELEASE_CLASSES.AUTH_CRITICAL,
  );
});

test('authentication documentation, acceptance UI, and Flutter security code are critical', () => {
  for (const changedFile of [
    'docs/architecture/password-hashing-adr.md',
    'docs/security/DEVICE_INTEGRITY_ENFORCEMENT.md',
    'apps/control-panel/src/pages/ProductionAuthAcceptance.jsx',
    'lib/core/security/device_security_service.dart',
    'lib/generated/api_client/lib/src/model/auth_user_info200_response.dart',
  ]) {
    assert.equal(classifyRelease({ baseSha, changedFiles: [changedFile] }).releaseClass, RELEASE_CLASSES.AUTH_CRITICAL, changedFile);
  }
  assert.equal(classifyRelease({ baseSha, changedFiles: ['docs/product/quiet-trust-feed/microcopy.md'] }).releaseClass, RELEASE_CLASSES.STANDARD);
});

test('abuse-sensitive waitlist and release controls are critical', () => {
  for (const changedFile of [
    'apps/lythaus-public-api/src/waitlist-handler.ts',
    'apps/lythaus-public-api/src/waitlist-runtime-policy.ts',
    'apps/lythaus-admin-api/src/waitlist-runtime-policy.ts',
    'scripts/ci/rollback-pages-deployment.mjs',
    'scripts/ci/write-failure-domain-evidence.mjs',
    '.github/workflows/native-workers-deploy.yml',
  ]) {
    assert.equal(classifyRelease({ baseSha, changedFiles: [changedFile] }).releaseClass, RELEASE_CLASSES.AUTH_CRITICAL, changedFile);
  }
});

test('explicit safe product migrations remain standard while unknown migrations are critical', () => {
  for (const changedFile of [
    'database/planetscale/migrations/0009_cost_budget_enforcement.sql',
    'database/planetscale/migrations/0012_product_integrity_v2.sql',
    'database/planetscale/migrations/0013_marketing_waitlist.sql',
  ]) {
    assert.equal(classifyRelease({ baseSha, changedFiles: [changedFile] }).releaseClass, RELEASE_CLASSES.STANDARD, changedFile);
  }
  assert.equal(
    classifyRelease({ baseSha, changedFiles: ['database/planetscale/migrations/0017_new_product.sql'] }).releaseClass,
    RELEASE_CLASSES.AUTH_CRITICAL,
  );
  assert.deepEqual(
    classifyRelease({ baseSha, changedFiles: ['database/planetscale/migrations/0017_new_product.sql'] }).changedComponents,
    ['admin', 'coordinator', 'jobs', 'public'],
  );
});

test('ambiguous paths fail closed as auth-critical', () => {
  const result = classifyRelease({ baseSha, changedFiles: ['mystery/release-input.txt'] });
  assert.equal(result.releaseClass, RELEASE_CLASSES.AUTH_CRITICAL);
  assert.equal(result.changedComponents.length, 7);
  assert.ok(result.criticalReasons.some(({ rule }) => rule === 'ambiguous-path'));
});

test('FORCE_AUTH_CRITICAL upgrades standard scope and cannot downgrade critical scope', () => {
  const standard = classifyRelease({ baseSha, changedFiles: ['docs/README.md'], forceAuthCritical: true });
  assert.equal(standard.releaseClass, RELEASE_CLASSES.AUTH_CRITICAL);
  assert.equal(standard.forceAuthCritical, true);
  const critical = classifyRelease({ baseSha, changedFiles: ['apps/lythaus-public-api/src/auth/login.ts'], forceAuthCritical: false });
  assert.equal(critical.releaseClass, RELEASE_CLASSES.AUTH_CRITICAL);
  assert.throws(
    () => assertNoManualDowngrade({ computedClass: critical.releaseClass, requestedClass: RELEASE_CLASSES.STANDARD }),
    /manual release-class downgrade/,
  );
  assert.equal(assertNoManualDowngrade({ computedClass: standard.releaseClass }), standard.releaseClass);
});

test('ambiguous FORCE_AUTH_CRITICAL configuration fails closed as critical', () => {
  const result = classifyRelease({ baseSha, changedFiles: ['docs/README.md'], forceAuthCritical: 'unexpected' });
  assert.equal(result.releaseClass, RELEASE_CLASSES.AUTH_CRITICAL);
  assert.equal(result.forceAuthCritical, true);
  assert.ok(result.criticalReasons.some(({ rule }) => rule === 'ambiguous-force-auth-critical'));
});

test('a missing production baseline is conservatively critical and covers every deployable component', () => {
  const result = classifyRelease({ changedFiles: ['docs/README.md'] });
  assert.equal(result.releaseClass, RELEASE_CLASSES.AUTH_CRITICAL);
  assert.deepEqual(result.changedComponents, ['admin', 'control-panel', 'coordinator', 'flutter-web', 'jobs', 'marketing', 'public']);
});

test('component ownership maps shared runtime dependencies to every affected worker', () => {
  assert.deepEqual([...componentsForPath('packages/security/src/password.ts')].sort(), ['admin', 'coordinator', 'jobs', 'public']);
  assert.deepEqual([...componentsForPath('api/openapi/openapi.yaml')].sort(), ['admin', 'control-panel', 'flutter-web', 'public']);
  assert.deepEqual([...componentsForPath('infrastructure/cloudflare/native-hyperdrive-production.json')].sort(), ['admin', 'coordinator', 'jobs', 'public']);
});
