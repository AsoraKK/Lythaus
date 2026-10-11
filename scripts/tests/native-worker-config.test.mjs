import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { nativeWorkerDeploymentFailures, nativeWorkerSelectionFailures } from '../native-worker-config-policy.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const require = createRequire(import.meta.url);
const releaseWranglerVersion = '4.123.0';
const releaseParser = process.env.LYTHAUS_TEST_RELEASE_WRANGLER === 'true';
let wranglerModule = 'wrangler';
if (releaseParser) {
  wranglerModule = undefined;
  for (const directory of (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)) {
    try {
      const resolve = createRequire(path.join(path.resolve(directory), 'lythaus-parser-version.cjs'));
      const packagePath = resolve.resolve('wrangler/package.json');
      if (JSON.parse(fs.readFileSync(packagePath, 'utf8')).version === releaseWranglerVersion) {
        wranglerModule = path.dirname(packagePath);
        break;
      }
    } catch {}
  }
  assert.ok(wranglerModule, `Release parser must resolve Wrangler ${releaseWranglerVersion}; no installed-version fallback`);
}
const { unstable_readConfig: readConfig } = require(wranglerModule);
if (releaseParser) {
  assert.equal(require(path.join(wranglerModule, 'package.json')).version, releaseWranglerVersion);
  console.log(`Offline release parser: Wrangler ${releaseWranglerVersion}`);
}
const productionDigests = {
  'public-api': 'b369a50b3fb283f3fc5418945d50f2ff4b4f2dee862734af5de521b8f924cb43',
  'admin-api': '99ea36a9b91fa468e62c937aba1ebc8b5169216d2f4ca4cb6692c153f7b0e395',
  jobs: '15c402fb47575cecf2915f7665175c9d6788965982e5ac7b0c46983fbf3e32e1',
};

if (!releaseParser) {
  test('release-pinned Wrangler 4.123.0 runs the same offline config and selector regressions', { timeout: 60_000 }, () => {
    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const childEnvironment = { ...process.env, LYTHAUS_TEST_RELEASE_WRANGLER: 'true', WRANGLER_SEND_METRICS: 'false' };
    delete childEnvironment.NODE_TEST_CONTEXT;
    const result = spawnSync(npx, ['--yes', `--package=wrangler@${releaseWranglerVersion}`, '--call',
      'node --test scripts/tests/native-worker-config.test.mjs'], {
      cwd: root, encoding: 'utf8', shell: process.platform === 'win32', timeout: 55_000,
      env: childEnvironment,
    });
    const evidenceDirectory = path.join(root, '.artifacts');
    fs.mkdirSync(evidenceDirectory, { recursive: true });
    fs.writeFileSync(path.join(evidenceDirectory, 'native-worker-release-parser.log'),
      `${result.stdout ?? ''}${result.stderr ?? ''}`);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, `${result.stdout ?? ''}${result.stderr ?? ''}`);
    assert.match(result.stdout, /Offline release parser: Wrangler 4\.123\.0/);
    const executed = result.stdout.match(/^(?:# |ℹ )tests (\d+)$/m);
    assert.ok(executed && Number(executed[1]) > 0, 'The pinned child suite must actually execute tests');
    assert.doesNotMatch(result.stderr, /run\(\) is being called recursively/);
  });
}

for (const [worker, digest] of Object.entries(productionDigests)) {
  const relative = `apps/lythaus-${worker}/wrangler.jsonc`;
  const configPath = path.join(root, relative);
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  test(`${worker}: canonical top-level configuration matches reviewed 49cca9ca`, () => {
    const { env, ...production } = config;
    assert.deepEqual(env, {});
    assert.equal(createHash('sha256').update(JSON.stringify(production)).digest('hex'), digest);
    assert.deepEqual(nativeWorkerDeploymentFailures(config, relative), []);
    const normalized = readConfig({ config: configPath, env: '' }, { hideWarnings: true });
    assert.equal(normalized.name, config.name);
    assert.deepEqual(normalized.vars, config.vars);
    for (const key of ['workers_dev', 'preview_urls', 'keep_vars']) assert.equal(normalized[key], false);
    const types = fs.readFileSync(path.join(root, `apps/lythaus-${worker}/src/worker-configuration.d.ts`), 'utf8');
    assert.doesNotMatch(types, /interface DevelopmentEnv|ENVIRONMENT: "development"|EXPECTED_DATABASE_TARGET: "development"/);
    assert.match(types, /ENVIRONMENT: "production"/);
  });

  test(`${worker}: Wrangler rejects named deployment environments before deployment`, () => {
    for (const env of ['development', 'production', 'preview', 'staging', 'local', 'arbitrary-fixture']) {
      assert.throws(() => readConfig({ config: configPath, env }, { hideWarnings: true }), /No environment found in configuration/);
    }
    const previous = process.env.CLOUDFLARE_ENV;
    try {
      process.env.CLOUDFLARE_ENV = 'development';
      assert.throws(() => readConfig({ config: configPath }, { hideWarnings: true }), /No environment found in configuration/);
      assert.equal(readConfig({ config: configPath, env: '' }, { hideWarnings: true }).name, config.name);
    } finally {
      if (previous === undefined) delete process.env.CLOUDFLARE_ENV;
      else process.env.CLOUDFLARE_ENV = previous;
    }
  });

  test(`${worker}: raw inherited-object selector resolves an incomplete suffixed target, not the old development override`, () => {
    const normalized = readConfig({ config: configPath, env: '__proto__' }, { hideWarnings: true });
    assert.equal(normalized.name, `${config.name}-__proto__`);
    assert.deepEqual(normalized.vars, {});
    for (const key of ['hyperdrive', 'r2_buckets', 'kv_namespaces', 'services', 'send_email', 'workflows']) {
      assert.deepEqual(normalized[key], [], key);
    }
    assert.deepEqual(normalized.queues, { producers: [], consumers: [] });
    assert.equal(normalized.ai, undefined);
    assert.equal(normalized.workers_dev, false);
    assert.equal(normalized.preview_urls, false);
    if (worker === 'admin-api') assert.deepEqual(normalized.routes, config.routes);
    if (worker === 'jobs') assert.deepEqual(normalized.triggers, config.triggers);
    assert.ok(nativeWorkerSelectionFailures({ CLOUDFLARE_ENV: '__proto__' }).length > 0);
    assert.ok(nativeWorkerSelectionFailures({}, ['--env=__proto__', '--name', config.name]).length > 0);
  });

  test(`${worker}: validator rejects missing env and any hosted alias, including same-name production resources`, () => {
    for (const env of [undefined, null, [], { development: { ...config, workers_dev: true,
      vars: { ...config.vars, ENVIRONMENT: 'development', EXPECTED_DATABASE_TARGET: 'development',
        TURNSTILE_REQUIRED: 'false', PASSWORD_HASH_ALLOW_SCRYPT_FALLBACK: 'true', EMAIL_PROVIDER_MODE: 'fallback' } } },
    { production: {} }, { local: { name: `lythaus-${worker}-local` } }]) {
      assert.ok(nativeWorkerDeploymentFailures({ ...config, env }, relative).some((failure) => failure.includes('hosted environments')));
    }
  });

  test(`${worker}: validator rejects dangerous top-level auth, preview and database mutations`, () => {
    for (const key of ['workers_dev', 'preview_urls', 'keep_vars']) {
      assert.ok(nativeWorkerDeploymentFailures({ ...config, [key]: true }, relative).some((failure) => failure.startsWith(key)));
    }
    const mutations = { ENVIRONMENT: 'development', EXPECTED_DATABASE_TARGET: 'development',
      EXPECTED_DATABASE_SCHEMA_VERSION: 'unknown', EXPECTED_DATABASE_ROLE_CLASS: 'superuser',
      EXPECTED_DATABASE_BUDGET_LEDGER_APPLIED: 'false', HYPERDRIVE_QUERY_CACHE_MODE: 'enabled' };
    if (worker === 'public-api') Object.assign(mutations, { TURNSTILE_REQUIRED: 'false', PASSWORD_HASH_ALLOW_SCRYPT_FALLBACK: 'true' });
    if (worker !== 'admin-api') mutations.EMAIL_PROVIDER_MODE = 'fallback';
    for (const [key, value] of Object.entries(mutations)) {
      assert.ok(nativeWorkerDeploymentFailures({ ...config, vars: { ...config.vars, [key]: value } }, relative)
        .some((failure) => failure.startsWith(key)), key);
      const missing = structuredClone(config);
      delete missing.vars[key];
      assert.ok(nativeWorkerDeploymentFailures(missing, relative).some((failure) => failure.startsWith(key)), `${key} missing`);
    }
  });
}

test('native source validation rejects hidden selectors and CLI overrides before invoking Wrangler', () => {
  assert.deepEqual(nativeWorkerSelectionFailures({}, []), []);
  assert.deepEqual(nativeWorkerSelectionFailures({ CLOUDFLARE_ENV: '' }, ['--require-provisioned']), []);
  for (const CLOUDFLARE_ENV of ['development', 'production', 'local', '__proto__', 'constructor', 'toString', ' ']) {
    assert.ok(nativeWorkerSelectionFailures({ CLOUDFLARE_ENV }).length > 0);
    const result = spawnSync(process.execPath, ['scripts/validate-native-worker-config.mjs'], {
      cwd: root, encoding: 'utf8', env: { PATH: '', CLOUDFLARE_ENV }, timeout: 5000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /CLOUDFLARE_ENV must be unset or empty/);
    assert.doesNotMatch(result.stderr, /generated Worker types|ENOTCACHED|spawn.*ENOENT/);
  }
  for (const args of [['--env', 'development'], ['--env=__proto__'], ['-e', 'production'], ['--config', 'fixture.json']]) {
    assert.ok(nativeWorkerSelectionFailures({}, args).length > 0);
    const result = spawnSync(process.execPath, ['scripts/validate-native-worker-config.mjs', ...args], {
      cwd: root, encoding: 'utf8', env: { PATH: '' }, timeout: 5000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /configuration overrides are not supported/);
  }
});

test('supported native deployment commands select only the canonical top-level configuration', () => {
  const files = ['native-workers-deploy.yml', 'production-release.yml', 'native-admin-bootstrap-activation.yml', 'deploy-public-waitlist.yml'];
  let checked = 0;
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, '.github/workflows', file), 'utf8');
    assert.doesNotMatch(source, /\bCLOUDFLARE_ENV\s*[:=]/, file);
    const commands = source.replace(/\\\r?\n\s*/g, ' ').split(/\r?\n/)
      .filter((line) => /\bnpx\s+.*wrangler@\S+\s+(?:versions (?:upload|deploy)|triggers deploy|deploy)\b/.test(line));
    assert.ok(commands.length > 0, file);
    for (const command of commands) {
      const selectors = [...command.matchAll(/(?:^|\s)(?:--env|-e)(?:=|\s+)(\S+)/g)];
      for (const [, value] of selectors) assert.ok(value === '""' || value === "''", `${file}: named environment selector`);
      checked++;
    }
  }
  assert.ok(checked >= 20, 'Cover candidate upload, trigger deployment, activation and rollback commands');
});

test('local post fixtures retain loopback database enforcement and outbound denial without Wrangler environments', () => {
  for (const file of ['post-moderation-fixture.mjs', 'post-safety-evidence-fixture.mjs']) {
    const source = fs.readFileSync(path.join(root, 'apps/lythaus-jobs/tests', file), 'utf8');
    assert.match(source, /\['localhost', '127\.0\.0\.1'\]\.includes\(target\.hostname\)/);
    assert.match(source, /target\.pathname\.startsWith\('\/lythaus_auth_test_post_'\)/);
    assert.match(source, /outboundService:.*Local fixture refuses external requests/);
    assert.doesNotMatch(source, /wrangler\.jsonc|--env/);
  }
});
