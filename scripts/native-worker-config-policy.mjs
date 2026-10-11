export function nativeWorkerSelectionFailures(environment, args = []) {
  const failures = [];
  if (environment.CLOUDFLARE_ENV) failures.push('CLOUDFLARE_ENV must be unset or empty; native releases use the top-level configuration');
  if (args.some((arg) => arg !== '--require-provisioned')) failures.push('named environment or other configuration overrides are not supported by native validation');
  return failures;
}

export function nativeWorkerEnvironmentFailures(config) {
  if (!config.env || typeof config.env !== 'object' || Array.isArray(config.env)
    || Object.keys(config.env).length !== 0) {
    return ['hosted environments are forbidden; retain an explicit empty env object to reject named environment selection'];
  }
  return [];
}

export function nativeWorkerDeploymentFailures(config, relative) {
  const failures = nativeWorkerEnvironmentFailures(config);
  for (const key of ['workers_dev', 'preview_urls', 'keep_vars']) {
    if (config[key] !== false) failures.push(`${key} must remain false`);
  }
  const requiredVars = {
    ENVIRONMENT: 'production',
    EXPECTED_DATABASE_TARGET: 'main',
    HYPERDRIVE_QUERY_CACHE_MODE: 'disabled',
    EXPECTED_DATABASE_ROLE_CLASS: 'login_non_superuser',
    EXPECTED_DATABASE_SCHEMA_VERSION: '0020_auth_recovery_delivery.sql',
    EXPECTED_DATABASE_BUDGET_LEDGER_APPLIED: 'true',
  };
  if (relative.includes('public-api')) {
    requiredVars.TURNSTILE_REQUIRED = 'true';
    requiredVars.PASSWORD_HASH_ALLOW_SCRYPT_FALLBACK = 'false';
  }
  if (relative.includes('public-api') || relative.includes('jobs')) {
    requiredVars.EMAIL_PROVIDER_MODE = 'cloudflare';
  }
  for (const [key, value] of Object.entries(requiredVars)) {
    if (config.vars?.[key] !== value) failures.push(`${key} must remain ${value}`);
  }
  return failures;
}
