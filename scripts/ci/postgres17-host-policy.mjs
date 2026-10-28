const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function isAllowedLocalPostgres17Host(hostname, environment = process.env) {
  if (LOOPBACK_HOSTS.has(hostname)) return true;
  return hostname === 'postgres'
    && environment.GITHUB_ACTIONS === 'true'
    && environment.GITHUB_JOB === 'activity_pilot';
}
