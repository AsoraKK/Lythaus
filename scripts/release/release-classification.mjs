export const RELEASE_CLASSES = Object.freeze({
  STANDARD: 'STANDARD_RELEASE',
  AUTH_CRITICAL: 'AUTH_CRITICAL_RELEASE',
});

export const RELEASE_COMPONENTS = Object.freeze([
  'public',
  'admin',
  'jobs',
  'coordinator',
  'marketing',
  'flutter-web',
  'control-panel',
]);

const allRuntimeComponents = ['public', 'admin', 'jobs', 'coordinator'];
const allDeployableComponents = [...RELEASE_COMPONENTS];

const normalizePath = (value) => String(value ?? '')
  .replaceAll('\\', '/')
  .replace(/^\.\//, '')
  .replace(/^\/+/, '');

const pathMatches = (path, patterns) => patterns.some((pattern) => pattern.test(path));

const componentRules = [
  { component: 'public', patterns: [/^apps\/lythaus-public-api\//] },
  { component: 'admin', patterns: [/^apps\/lythaus-admin-api\//] },
  { component: 'jobs', patterns: [/^apps\/lythaus-jobs\//] },
  { component: 'coordinator', patterns: [/^apps\/lythaus-auth-acceptance-coordinator\//] },
  { component: 'marketing', patterns: [/^apps\/marketing-site\//, /^scripts\/cloudflare\/validate-marketing-output\.mjs$/] },
  { component: 'control-panel', patterns: [/^apps\/control-panel\//] },
  { component: 'flutter-web', patterns: [/^lib\//, /^web\//, /^assets\//, /^pubspec(?:\.lock|\.yaml)$/] },
  { component: 'public', patterns: [/^packages\/(?:db|security)\//, /^packages\/contracts\//] },
  { component: 'admin', patterns: [/^packages\/(?:db|security)\//, /^packages\/contracts\//] },
  { component: 'jobs', patterns: [/^packages\/(?:db|security)\//, /^packages\/contracts\//] },
  { component: 'coordinator', patterns: [/^packages\/(?:db|security)\//, /^packages\/contracts\//] },
  { component: 'public', patterns: [/^infrastructure\/cloudflare\/native-hyperdrive-production\.json$/] },
  { component: 'admin', patterns: [/^infrastructure\/cloudflare\/native-hyperdrive-production\.json$/] },
  { component: 'jobs', patterns: [/^infrastructure\/cloudflare\/native-hyperdrive-production\.json$/] },
  { component: 'coordinator', patterns: [/^infrastructure\/cloudflare\/native-hyperdrive-production\.json$/] },
  { component: 'public', patterns: [/^api\/openapi\//] },
  { component: 'admin', patterns: [/^api\/openapi\//] },
  { component: 'flutter-web', patterns: [/^api\/openapi\//] },
  { component: 'control-panel', patterns: [/^api\/openapi\//] },
  { component: 'public', patterns: [/^package(?:\.json|-lock\.json)$/] },
  { component: 'admin', patterns: [/^package(?:\.json|-lock\.json)$/] },
  { component: 'jobs', patterns: [/^package(?:\.json|-lock\.json)$/] },
  { component: 'coordinator', patterns: [/^package(?:\.json|-lock\.json)$/] },
  { component: 'marketing', patterns: [/^package(?:\.json|-lock\.json)$/] },
  { component: 'flutter-web', patterns: [/^package(?:\.json|-lock\.json)$/] },
  { component: 'control-panel', patterns: [/^package(?:\.json|-lock\.json)$/] },
];

const authCriticalRules = [
  { id: 'public-auth-runtime', patterns: [/^apps\/lythaus-public-api\/src\/index\.ts$/, /^apps\/lythaus-public-api\/src\/.*(?:auth|signup|login|logout|refresh|session|verification|resend|password|reset|turnstile|cookie|crypto|email|waitlist).*\.(?:ts|tsx|js|mjs)$/i] },
  { id: 'admin-auth-runtime', patterns: [/^apps\/lythaus-admin-api\/src\/index\.ts$/, /^apps\/lythaus-admin-api\/src\/.*(?:auth|keeper|acceptance|email|session|crypto|turnstile|waitlist).*\.(?:ts|tsx|js|mjs)$/i] },
  { id: 'admin-security-runtime', patterns: [/^apps\/lythaus-admin-api\/src\/(?:admin-access-runtime-policy|admin-cors-policy|admin-runtime-policy|request-body-policy|runtime-policy)\.(?:ts|tsx|js|mjs)$/i] },
  { id: 'jobs-auth-email-runtime', patterns: [/^apps\/lythaus-jobs\/src\/index\.ts$/, /^apps\/lythaus-jobs\/src\/.*(?:transactional-email|email|verification|password|reset|session|crypto).*\.(?:ts|tsx|js|mjs)$/i] },
  { id: 'jobs-runtime-security', patterns: [/^apps\/lythaus-jobs\/src\/runtime-policy\.(?:ts|tsx|js|mjs)$/i] },
  { id: 'acceptance-coordinator', patterns: [/^apps\/lythaus-auth-acceptance-coordinator\//] },
  { id: 'control-panel-auth-certification', patterns: [/^apps\/control-panel\/.*(?:auth|acceptance|keeper|turnstile|email).*\.(?:jsx|tsx|js|ts)$/i] },
  { id: 'control-panel-access-boundary', patterns: [/^apps\/control-panel\/src\/(?:api\/adminApi|components\/AdminAccessGate)\.(?:jsx|tsx|js|ts)$/i] },
  { id: 'marketing-auth-flow', patterns: [
    /^apps\/marketing-site\/src\/pages\/(?:signup|check-email|verify-email|resend-verification|reset-password)(?:\/|\.|$)/i,
    /^apps\/marketing-site\/.*(?:auth|signup|login|verification|resend|password|reset|turnstile|email|waitlist).*/i,
    /^apps\/marketing-site\/tests\/.*(?:auth|email|verification|reset).*\./i,
  ] },
  { id: 'flutter-auth-flow', patterns: [/^lib\/(?:features\/auth|core\/auth|services\/auth|generated\/api_client\/.*auth)/i, /^lib\/.*(?:auth|login|signup|verification|reset|session|turnstile|security|cookie|crypto|password|email).*\.(?:dart|ts|tsx|js|mjs)$/i, /^(?:web|test|integration_test)\/.*(?:auth|login|signup|verification|reset|session|turnstile)/i] },
  { id: 'auth-contract', patterns: [/^api\/openapi\//, /^packages\/contracts\//, /^packages\/db\//] },
  { id: 'security-runtime', patterns: [/^packages\/security\//, /^patches\//, /^(?:package|package-lock)\.json$/] },
  { id: 'auth-worker-configuration', patterns: [/^apps\/(?:lythaus-public-api|lythaus-admin-api|lythaus-jobs|lythaus-auth-acceptance-coordinator)\/.*(?:wrangler\.jsonc|worker-configuration\.d\.ts|package(?:\.json|-lock\.json))$/] },
  { id: 'auth-database-migration', patterns: [/^database\/planetscale\/migrations\/(?!0009_cost_budget_enforcement\.sql$|0012_product_integrity_v2\.sql$|0013_marketing_waitlist\.sql$).+\.sql$/i, /^database\/.*(?:auth|identity|session|challenge|outbox|email|credential|password|verification).*\.(?:sql|json)$/i] },
  { id: 'auth-provider-configuration', patterns: [/^infrastructure\/cloudflare\/native-hyperdrive-production\.json$/, /^scripts\/cloudflare\/(?:waitlist-turnstile|audit-lythaus-token-control|rotate-lythaus-access-service-token)\.(?:mjs|js)$/i, /^scripts\/ci\/(?:.*(?:auth|acceptance|email|worker|migration|release|secret|route|hyperdrive|schema|production|turnstile).*)\.(?:mjs|js)$/i] },
  { id: 'release-certification-machinery', patterns: [/^\.github\/workflows\/(?:ci|production-release|native-workers-deploy|native-adr003-acceptance|production-auth-incident-audit|cloudflare-lythaus-email-sending)\.yml$/i, /^scripts\/release\//, /^scripts\/ci\/.*(?:auth|acceptance|email|worker|migration|release|secret|route|hyperdrive|schema|production|turnstile|rollback|failure-domain).*\.(?:mjs|js)$/i, /^scripts\/tests\/.*(?:release|acceptance|auth|worker-version|rollback|email).*\.(?:mjs|js)$/i, /^docs\/(?:architecture\/adr-004-release-certification-separation|security\/production-release-governance|runbooks\/(?:release-manifest|adr-003-authenticated-acceptance|production-auth-release-simplified))\.md$/i] },
  { id: 'auth-critical-documentation', patterns: [/^docs\/security\/.*\.md$/i, /^docs\/(?:architecture|runbooks|evidence)\/.*(?:auth|turnstile|verification|resend|reset|session|password|credential|email|security|release|acceptance|production).*\.md$/i, /^docs\/SECURITY_.*\.md$/i] },
  { id: 'auth-sensitive-test', patterns: [/^(?:apps|packages|scripts|test|integration_test)\/.*(?:auth|acceptance|verification|resend|password-reset|session|turnstile|transactional-email).*\.(?:ts|tsx|js|mjs|dart)$/i] },
];

const standardPathRules = [
  /^docs\//i,
  /^analytics\//i,
  /^load\//i,
  /^packages\/authenticity\//i,
  /^apps\/lythaus-authenticity-container-proof\//i,
  /^apps\/(?:marketing-site|control-panel)\//i,
  /^apps\/lythaus-public-api\/src\/(?:content-runtime-policy|feed-runtime-policy|notification-policy|product-policy|feed)\.(?:ts|tsx|js|mjs)$/i,
  /^apps\/lythaus-jobs\/src\/(?:feed-indexer|activity-indexer|analytics-indexer)\.(?:ts|tsx|js|mjs)$/i,
  /^lib\//i,
  /^web\//i,
  /^assets\//i,
  /^(?:test|integration_test)\//i,
  /^functions\//i,
  /^scripts\/cloudflare\/(?:execute-lythaus-pages-cutover|execute-lythaus-web-source-hygiene|validate-marketing-output|verify-pages-deployment)\.mjs$/i,
  /^\.github\/workflows\/(?:deploy-marketing|deploy-alpha-web|deploy-control-panel|flutter-ci|mobile-release-build|mvp-preview-validate)\.yml$/i,
  /^\.github\/(?:dependabot|CODEOWNERS)/i,
  /^(?:README|CONTRIBUTING|LICENSE)(?:\..*)?$/i,
  /^\.(?:gitattributes|gitignore|yamllint|spectral\.yaml)$/i,
];

const safeDatabaseFiles = new Set([
  'database/planetscale/migrations/0009_cost_budget_enforcement.sql',
  'database/planetscale/migrations/0012_product_integrity_v2.sql',
  'database/planetscale/migrations/0013_marketing_waitlist.sql',
]);

const explicitStandardRules = [
  { id: 'explicit-non-auth-feed-scope', patterns: [
    /^packages\/db\/src\/(?:feed|reputation|activity|budget)\.(?:ts|tsx|js|mjs)$/i,
    /^packages\/db\/tests\/(?:feed|reputation|activity|budget)[^/]*\.(?:ts|tsx|js|mjs)$/i,
    /^packages\/contracts\/src\/(?:appeal-policy|activity-policy|content-policy|reputation-policy|tier-policy|keyset-cursor)\.(?:ts|tsx|js|mjs)$/i,
    /^packages\/contracts\/tests\/(?:product-policy|critical-domain-policy|critical-content-policy)\.(?:ts|tsx|js|mjs)$/i,
  ] },
  { id: 'explicit-admin-analytics-scope', patterns: [
    /^apps\/lythaus-admin-api\/src\/routes\/(?:analytics|catalog)\.(?:ts|tsx|js|mjs)$/i,
  ] },
];

function ruleMatches(path, rule) {
  return pathMatches(path, rule.patterns);
}

export function componentsForPath(value) {
  const path = normalizePath(value);
  const components = new Set(componentRules.filter((rule) => ruleMatches(path, rule)).map((rule) => rule.component));
  if (path.startsWith('database/planetscale/migrations/')) return components;
  if (path.startsWith('packages/authenticity/') || path.startsWith('apps/lythaus-authenticity-container-proof/')) return components;
  return components;
}

export function authCriticalMatches(value) {
  const path = normalizePath(value);
  return authCriticalRules.filter((rule) => ruleMatches(path, rule)).map((rule) => rule.id);
}

export function classifyRelease({ changedFiles = [], forceAuthCritical = false, baseSha = null } = {}) {
  if (!Array.isArray(changedFiles)) throw new TypeError('changedFiles must be an array');
  const paths = [...new Set(changedFiles.map(normalizePath).filter(Boolean))].sort();
  const changedComponents = new Set();
  const criticalReasons = [];
  const standardReasons = [];

  if (baseSha === null || baseSha === undefined || baseSha === '') {
    criticalReasons.push({ rule: 'missing-release-baseline', detail: 'No previous production SHA was supplied; release scope is ambiguous.' });
    for (const component of allDeployableComponents) changedComponents.add(component);
  }

  for (const path of paths) {
    for (const component of componentsForPath(path)) changedComponents.add(component);
    const standardOverride = explicitStandardRules.find((rule) => ruleMatches(path, rule));
    if (standardOverride) {
      standardReasons.push({ path, rule: standardOverride.id });
      continue;
    }
    const matches = authCriticalMatches(path);
    if (matches.length > 0) {
      for (const rule of matches) criticalReasons.push({ path, rule });
      if (path.startsWith('database/planetscale/migrations/')) {
        for (const component of allRuntimeComponents) changedComponents.add(component);
      }
      continue;
    }
    if (safeDatabaseFiles.has(path)) {
      standardReasons.push({ path, rule: 'explicit-standard-database-scope' });
      continue;
    }
    if (path.startsWith('database/planetscale/migrations/')) {
      criticalReasons.push({ path, rule: 'unclassified-database-migration' });
      for (const component of allRuntimeComponents) changedComponents.add(component);
      continue;
    }
    if (standardPathRules.some((pattern) => pattern.test(path))) {
      standardReasons.push({ path, rule: 'explicit-standard-component-scope' });
    } else {
      criticalReasons.push({ path, rule: 'ambiguous-path' });
      for (const component of allDeployableComponents) changedComponents.add(component);
    }
  }

  const forceValue = typeof forceAuthCritical === 'string'
    ? forceAuthCritical.trim().toLowerCase()
    : forceAuthCritical;
  const explicitForce = forceValue === true || forceValue === 'true';
  const explicitNoForce = forceValue === false || forceValue === 'false' || forceValue === undefined || forceValue === null || forceValue === '';
  const force = explicitForce || !explicitNoForce;
  if (force) criticalReasons.push({
    rule: explicitForce ? 'force-auth-critical' : 'ambiguous-force-auth-critical',
    detail: explicitForce
      ? 'FORCE_AUTH_CRITICAL=true can only upgrade a release.'
      : 'FORCE_AUTH_CRITICAL contained an unexpected value; release classification fails closed as auth-critical.',
  });
  if (paths.length === 0 && criticalReasons.length === 0) standardReasons.push({ rule: 'no-changed-files' });

  const releaseClass = criticalReasons.length > 0 ? RELEASE_CLASSES.AUTH_CRITICAL : RELEASE_CLASSES.STANDARD;
  return Object.freeze({
    releaseClass,
    forceAuthCritical: force,
    changedFiles: Object.freeze(paths),
    changedComponents: Object.freeze([...changedComponents].filter((component) => allDeployableComponents.includes(component)).sort()),
    reusedComponents: Object.freeze(allDeployableComponents.filter((component) => !changedComponents.has(component)).sort()),
    criticalReasons: Object.freeze(criticalReasons),
    standardReasons: Object.freeze(standardReasons),
    rulesVersion: 'release-classification-v1',
  });
}

export function assertNoManualDowngrade({ computedClass, requestedClass } = {}) {
  if (requestedClass !== undefined && requestedClass !== null && requestedClass !== computedClass) {
    throw new Error('manual release-class downgrade is not supported');
  }
  return computedClass;
}

export const RELEASE_CLASSIFICATION_RULES = Object.freeze({
  authCriticalRules,
  explicitStandardRules,
  standardPathRules,
  safeDatabaseFiles,
  allRuntimeComponents,
});
