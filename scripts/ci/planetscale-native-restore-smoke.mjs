import { createRequire, builtinModules } from 'node:module';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { RESTORE, requireThat } from './planetscale-native-restore-contract.mjs';
import { branchQualifiedDatabaseTarget } from './planetscale-0021-target-identity.mjs';

const require = createRequire(new URL('../../node_modules/wrangler/package.json', import.meta.url));
const root = fileURLToPath(new URL('../../', import.meta.url));
export async function buildRestoreSmoke() {
  const { build } = require('esbuild');
  const scripts = {};
  for (const [name, entry] of Object.entries({ public: 'apps/lythaus-public-api/src/worker.ts',
    admin: 'apps/lythaus-admin-api/src/index.ts', jobs: 'apps/lythaus-jobs/src/index.ts' })) {
    const bundle = await build({ absWorkingDir: root, entryPoints: [entry], bundle: true, write: false,
      format: 'esm', platform: 'node', target: 'es2022', conditions: ['workerd'], logLevel: 'silent',
      banner: { js: "import {createRequire} from 'node:module'; const require=createRequire('/bundle/worker.mjs');" },
      external: ['cloudflare:*', 'pg-native', ...builtinModules, ...builtinModules.map(name => `node:${name}`)] });
    scripts[name] = bundle.outputFiles[0].text;
  }
  return scripts;
}

export async function runRestoreSmoke(connections, branchId, baseline, scripts, runtimeFactory) {
  const { Miniflare, convertV4MiniflareOptions, Log, LogLevel } = require('miniflare');
  const names = ['runtime', 'admin', 'jobs', 'privacy'];
  for (const name of names) {
    const target = branchQualifiedDatabaseTarget(connections[name]);
    requireThat(branchId !== RESTORE.sourceId && target.branchId === branchId && target.role === RESTORE[name], 'smoke_target_mismatch');
  }
  const token = randomBytes(32).toString('hex');
  const version = '01900000-0000-7000-8000-000000000001';
  const common = { ENVIRONMENT: 'local', EXPECTED_HOSTNAMES: 'restore.lythaus.test', DATABASE_READINESS_TOKEN: token,
    EXPECTED_DATABASE_TARGET: RESTORE.target, EXPECTED_DATABASE_SCHEMA_FINGERPRINT: baseline.schemaFingerprint,
    EXPECTED_DATABASE_RELATION_COUNT: String(baseline.relationCount), EXPECTED_DATABASE_SCHEMA_VERSION: baseline.schemaVersion,
    EXPECTED_DATABASE_ROLE_CLASS: 'login_non_superuser', AUTHENTICATED_ACCEPTANCE_PROVEN: 'false',
    PII_ENCRYPTION_KEY_V1: randomBytes(32).toString('base64'), PII_HMAC_KEY_V1: randomBytes(32).toString('base64'),
    AUTH_PASSWORD_PEPPER_V1: randomBytes(32).toString('base64'), TRANSACTIONAL_EMAIL_ENCRYPTION_KEY_V1: randomBytes(32).toString('base64'),
    WORKER_VERSION: { id: version, tag: 'isolated-native-restore-check' } };
  const workers = [
    { name: 'public', modules: true, script: scripts.public, bindings: common,
      hyperdrives: { DB_APP_FRESH: connections.runtime } },
    { name: 'admin', modules: true, script: scripts.admin, bindings: common,
      hyperdrives: { DB_ADMIN_FRESH: connections.admin, DB_PRIVACY_FRESH: connections.privacy },
      serviceBindings: { AUTH_EMAIL_ENVELOPE: { name: 'public', entrypoint: 'AuthEmailEnvelope' } } },
    { name: 'jobs', modules: true, script: scripts.jobs, bindings: common,
      hyperdrives: { DB_JOBS_FRESH: connections.jobs, DB_PRIVACY_FRESH: connections.privacy } },
  ];
  let outbound = 0;
  const options = { log: new Log(LogLevel.NONE),
    workers: workers.map(worker => ({ ...worker, compatibilityDate: '2026-08-01', compatibilityFlags: ['nodejs_compat'],
      outboundService: () => { outbound++; return new Response(null, { status: 403 }); } })) };
  const mf = runtimeFactory ? runtimeFactory(options) : new Miniflare(convertV4MiniflareOptions(options));
  try {
    for (const name of ['public', 'admin', 'jobs']) {
      const worker = await mf.getWorker(name);
      const response = await worker.fetch('https://restore.lythaus.test/internal/readiness/database-identity', {
        signal: AbortSignal.timeout(30000),
        headers: { authorization: `Bearer ${token}`, 'Cloudflare-Workers-Version-Overrides': `lythaus-public-api-development="${version}"` } });
      requireThat(response.status === 200, 'isolated_application_readiness_failed');
      const body = await response.json();
      const databases = name === 'public' ? [body] : Object.values(body.databases ?? {});
      requireThat(databases.length === (name === 'public' ? 1 : 2) && body.readiness === 'pass'
        && databases.every(row => row.readiness === 'pass' && row.readyForAuthentication === false
          && row.schemaFingerprint === baseline.schemaFingerprint && row.schemaVersion === baseline.schemaVersion
          && row.databaseEnvironment === RESTORE.target && row.relationCount === baseline.relationCount)
        && (name !== 'admin' || body.emailBinding?.bindingVerified === true), `isolated_application_${name}_contract_failed`);
    }
    requireThat(outbound === 0, 'unexpected_application_external_http_attempt');
    return { services: 3, databaseBindings: 5, distinctRoles: 4, readOnlyDatabaseIdentity: true,
      externalHttpRequests: 0, readyForProductionAuthentication: false };
  } finally { await mf.dispose(); }
}
